import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport, type StdioServerParameters } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport, type StreamableHTTPClientTransportOptions } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { Tool, ToolResult } from "@lookai/shared";
import { z } from "zod";

export type McpTransportConfig =
  | { type: "stdio"; params: StdioServerParameters }
  | { type: "http"; url: string; options?: StreamableHTTPClientTransportOptions };

export interface McpServerConfig {
  name: string;
  transport: McpTransportConfig;
}

export class McpClientManager {
  private clients = new Map<string, { client: Client; transport: Transport; tools: McpToolInfo[] }>();

  async connect(config: McpServerConfig): Promise<string> {
    const transport = this.createTransport(config.transport);
    const client = new Client({ name: "lookai-mcp", version: "0.0.1" }, { capabilities: {} });

    await client.connect(transport);

    // Initialize → discover tools
    const toolsResult = await client.listTools();
    const tools = toolsResult.tools.map((t) => ({
      name: t.name,
      description: t.description ?? "",
      inputSchema: t.inputSchema,
    }));

    this.clients.set(config.name, { client, transport, tools });
    return config.name;
  }

  async disconnect(serverName: string): Promise<void> {
    const entry = this.clients.get(serverName);
    if (!entry) return;
    await entry.client.close();
    this.clients.delete(serverName);
  }

  async disconnectAll(): Promise<void> {
    for (const [name] of this.clients) {
      await this.disconnect(name);
    }
  }

  listTools(serverName?: string): Array<{ server: string; name: string; description: string; inputSchema: unknown }> {
    const results: Array<{ server: string; name: string; description: string; inputSchema: unknown }> = [];
    for (const [server, entry] of this.clients) {
      if (serverName && server !== serverName) continue;
      for (const t of entry.tools) {
        results.push({ server, name: t.name, description: t.description, inputSchema: t.inputSchema });
      }
    }
    return results;
  }

  async callTool(serverName: string, toolName: string, args: Record<string, unknown>): Promise<ToolResult> {
    const entry = this.clients.get(serverName);
    if (!entry) {
      return { ok: false, error: `MCP server not connected: ${serverName}` };
    }
    try {
      const result = await entry.client.callTool({ name: toolName, arguments: args });
      // MCP result has content array
      const content = (result.content as Array<{ type: string; text?: string }> | undefined)
        ?.map((c) => (c.type === "text" ? c.text : JSON.stringify(c)))
        .filter(Boolean)
        .join("\n") ?? "";
      return { ok: true, content };
    } catch (e) {
      return { ok: false, error: `MCP tool error: ${e instanceof Error ? e.message : String(e)}` };
    }
  }

  async readResource(serverName: string, uri: string): Promise<{ ok: boolean; content?: string; path?: string; error?: string }> {
    const entry = this.clients.get(serverName);
    if (!entry) {
      return { ok: false, error: `MCP server not connected: ${serverName}` };
    }
    try {
      const result = await entry.client.readResource({ uri });
      const contents = result.contents ?? [];
      if (contents.length === 0) {
        return { ok: false, error: "Empty resource" };
      }
      const first = contents[0];
      // If binary, save to temp file and return path
      if ("blob" in first && first.blob) {
        const { writeFileSync, mkdtempSync } = await import("node:fs");
        const { tmpdir } = await import("node:os");
        const { join } = await import("node:path");
        const tmpDir = mkdtempSync(join(tmpdir(), "lookai-mcp-"));
        const fileName = uri.split("/").pop() ?? "resource.bin";
        const path = join(tmpDir, fileName);
        writeFileSync(path, Buffer.from(first.blob as string, "base64"));
        return { ok: true, path };
      }
      // Text resource
      if ("text" in first && typeof first.text === "string") {
        return { ok: true, content: first.text };
      }
      return { ok: false, error: "Unsupported resource format" };
    } catch (e) {
      return { ok: false, error: `MCP resource error: ${e instanceof Error ? e.message : String(e)}` };
    }
  }

  private createTransport(config: McpTransportConfig): Transport {
    switch (config.type) {
      case "stdio":
        return new StdioClientTransport(config.params);
      case "http":
        return new StreamableHTTPClientTransport(new URL(config.url), config.options);
      default:
        throw new Error(`Unknown MCP transport type: ${(config as { type: string }).type}`);
    }
  }
}

interface McpToolInfo {
  name: string;
  description: string;
  inputSchema: unknown;
}

/**
 * Convert an MCP tool schema to a Zod schema (best-effort).
 * This is a simplified converter — for production, use a full JSON Schema → Zod converter.
 */
function jsonSchemaToZod(schema: unknown): z.ZodTypeAny {
  if (!schema || typeof schema !== "object" || schema === null) {
    return z.record(z.any());
  }
  const s = schema as Record<string, unknown>;
  if (s.type === "object") {
    const properties = (s.properties ?? {}) as Record<string, unknown>;
    const required = (s.required ?? []) as string[];
    const shape: Record<string, z.ZodTypeAny> = {};
    for (const [key, prop] of Object.entries(properties)) {
      const isRequired = required.includes(key);
      shape[key] = isRequired ? jsonSchemaToZod(prop) : jsonSchemaToZod(prop).optional();
    }
    return z.object(shape);
  }
  if (s.type === "string") return z.string();
  if (s.type === "number") return z.number();
  if (s.type === "integer") return z.number().int();
  if (s.type === "boolean") return z.boolean();
  if (s.type === "array") {
    return z.array(jsonSchemaToZod(s.items));
  }
  return z.any();
}

/**
 * Create a LookAI Tool from an MCP tool description.
 */
export function mcpToolToLookaiTool(
  serverName: string,
  toolInfo: { name: string; description: string; inputSchema: unknown },
  manager: McpClientManager
): Tool {
  return {
    name: `${serverName}_${toolInfo.name}`,
    description: `[MCP:${serverName}] ${toolInfo.description}`,
    parameters: jsonSchemaToZod(toolInfo.inputSchema),
    execute(args): Promise<ToolResult> {
      return manager.callTool(serverName, toolInfo.name, args);
    },
  };
}
