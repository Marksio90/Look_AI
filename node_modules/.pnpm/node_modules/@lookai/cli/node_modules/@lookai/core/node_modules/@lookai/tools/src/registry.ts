import { z } from "zod";
import type { Tool, ToolResult } from "@lookai/shared";

export class ToolRegistry {
  private tools = new Map<string, Tool>();

  register(tool: Tool): void {
    this.tools.set(tool.name, tool);
  }

  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  list(): Tool[] {
    return Array.from(this.tools.values());
  }

  toolDefs(): { name: string; description: string; parameters: z.ZodTypeAny }[] {
    return this.list().map((t) => ({ name: t.name, description: t.description, parameters: t.parameters }));
  }

  async dispatch(name: string, args: Record<string, unknown>): Promise<ToolResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      return { ok: false, error: `Unknown tool: ${name}` };
    }
    const parsed = tool.parameters.safeParse(args);
    if (!parsed.success) {
      return { ok: false, error: `Validation error: ${parsed.error.message}` };
    }
    try {
      const result = await tool.execute(parsed.data);
      return result;
    } catch (e) {
      return { ok: false, error: `Execution error: ${e instanceof Error ? e.message : String(e)}` };
    }
  }
}
