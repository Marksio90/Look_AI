import { z } from "zod";
import type { Tool, ToolResult } from "@lookai/shared";
import type { MemoryStore } from "@lookai/memory";

export const MemoryToolFactory = (store: MemoryStore | null): Tool => ({
  name: "memory",
  description: "Save, load, or search conversation memory. Use this to persist facts, preferences, or context across sessions. Separate from LOOKAI.md.",
  parameters: z.object({
    action: z.enum(["save", "load", "search", "list", "delete"]).describe("Action to perform"),
    key: z.string().optional().describe("Key for save/load/delete (required for those actions)"),
    content: z.string().optional().describe("Content to save (required for save)"),
    query: z.string().optional().describe("Search query (required for search)"),
  }),
  execute(args): ToolResult {
    if (!store) {
      return { ok: false, error: "Memory store not available. Enable with --memory flag." };
    }
    const action = String(args.action ?? "");
    const key = args.key ? String(args.key) : "";
    try {
      if (action === "save") {
        if (!key || !args.content) {
          return { ok: false, error: "save requires key and content" };
        }
        store.saveMemory(key, String(args.content));
        return { ok: true, content: `Saved memory: ${key}` };
      }
      if (action === "load") {
        if (!key) return { ok: false, error: "load requires key" };
        const content = store.loadMemory(key);
        if (content === null) return { ok: false, error: `Memory not found: ${key}` };
        return { ok: true, content };
      }
      if (action === "search") {
        if (!args.query) return { ok: false, error: "search requires query" };
        const results = store.searchMemory(String(args.query));
        if (results.length === 0) return { ok: true, content: "No matching memories." };
        return { ok: true, content: results.map((r: { key: string; snippet: string }) => `## ${r.key}\n${r.snippet}`).join("\n\n") };
      }
      if (action === "list") {
        const entries = store.listMemory();
        if (entries.length === 0) return { ok: true, content: "No memories stored." };
        return { ok: true, content: entries.map((e: { key: string; size: number; updatedAt: number }) => `- ${e.key} (${Math.round(e.size / 1024)} KB, ${new Date(e.updatedAt).toISOString()})`).join("\n") };
      }
      if (action === "delete") {
        if (!key) return { ok: false, error: "delete requires key" };
        const deleted = store.deleteMemory(key);
        return { ok: deleted, content: deleted ? `Deleted: ${key}` : `Not found: ${key}` };
      }
      return { ok: false, error: `Unknown action: ${action}` };
    } catch (e) {
      return { ok: false, error: `Memory error: ${e instanceof Error ? e.message : String(e)}` };
    }
  },
});
