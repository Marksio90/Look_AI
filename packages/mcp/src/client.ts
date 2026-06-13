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

  // Handle $ref (simplified — resolve local refs only)
  if (s.$ref && typeof s.$ref === "string") {
    return z.any(); // Ref resolution requires full schema context
  }

  // Handle anyOf / oneOf
  if (s.anyOf && Array.isArray(s.anyOf)) {
    const variants = s.anyOf.map((v) => jsonSchemaToZod(v));
    if (variants.length === 0) return z.any();
    return variants.reduce((acc, v) => acc.or(v)) as z.ZodTypeAny;
  }
  if (s.oneOf && Array.isArray(s.oneOf)) {
    const variants = s.oneOf.map((v) => jsonSchemaToZod(v));
    if (variants.length === 0) return z.any();
    return variants.reduce((acc, v) => acc.or(v)) as z.ZodTypeAny;
  }
  if (s.allOf && Array.isArray(s.allOf)) {
    // allOf = intersection; simplified to object merge
    const objects = s.allOf.filter((a) => {
      const ao = a as Record<string, unknown>;
      return ao.type === "object";
    });
    if (objects.length === 0) return z.any();
    const mergedShape: Record<string, z.ZodTypeAny> = {};
    for (const obj of objects) {
      const o = obj as Record<string, unknown>;
      const props = (o.properties ?? {}) as Record<string, unknown>;
      const req = (o.required ?? []) as string[];
      for (const [key, prop] of Object.entries(props)) {
        mergedShape[key] = req.includes(key) ? jsonSchemaToZod(prop) : jsonSchemaToZod(prop).optional();
      }
    }
    return z.object(mergedShape);
  }

  // Handle enum
  if (s.enum && Array.isArray(s.enum) && s.enum.length > 0) {
    const values = s.enum;
    if (values.every((v) => typeof v === "string")) {
      return z.enum(values as [string, ...string[]]);
    }
    return z.union(values.map((v) => z.literal(v as string | number | boolean)) as unknown as [z.ZodTypeAny, z.ZodTypeAny, ...z.ZodTypeAny[]]);
  }

  // Handle const
  if (s.const !== undefined) {
    return z.literal(s.const as string | number | boolean);
  }

  // Handle types array
  if (Array.isArray(s.type)) {
    const types = s.type as string[];
    if (types.includes("null")) {
      const nonNull = types.find((t) => t !== "null");
      if (nonNull) {
        return jsonSchemaToZod({ ...s, type: nonNull }).nullable();
      }
      return z.null();
    }
    return z.any();
  }

  if (s.type === "object") {
    const properties = (s.properties ?? {}) as Record<string, unknown>;
    const required = (s.required ?? []) as string[];
    const shape: Record<string, z.ZodTypeAny> = {};
    for (const [key, prop] of Object.entries(properties)) {
      const isRequired = required.includes(key);
      shape[key] = isRequired ? jsonSchemaToZod(prop) : jsonSchemaToZod(prop).optional();
    }
    let obj: z.ZodTypeAny = z.object(shape);
    if (s.additionalProperties === true) {
      obj = z.object(shape).passthrough();
    } else if (s.additionalProperties === false) {
      obj = z.object(shape).strict();
    }
    return obj;
  }

  if (s.type === "string") {
    let str = z.string();
    if (s.minLength && typeof s.minLength === "number") str = str.min(s.minLength);
    if (s.maxLength && typeof s.maxLength === "number") str = str.max(s.maxLength);
    if (s.pattern && typeof s.pattern === "string") {
      try { str = str.regex(new RegExp(s.pattern)); } catch { /* ignore invalid regex */ }
    }
    if (s.format === "email") str = str.email();
    if (s.format === "url" || s.format === "uri") str = str.url();
    return str;
  }

  if (s.type === "number") {
    let num = z.number();
    if (s.minimum !== undefined && typeof s.minimum === "number") num = num.min(s.minimum);
    if (s.maximum !== undefined && typeof s.maximum === "number") num = num.max(s.maximum);
    return num;
  }

  if (s.type === "integer") {
    let num = z.number().int();
    if (s.minimum !== undefined && typeof s.minimum === "number") num = num.min(s.minimum);
    if (s.maximum !== undefined && typeof s.maximum === "number") num = num.max(s.maximum);
    return num;
  }

  if (s.type === "boolean") return z.boolean();

  if (s.type === "null") return z.null();

  if (s.type === "array") {
    return z.array(jsonSchemaToZod(s.items));
  }

  // Default: any
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
