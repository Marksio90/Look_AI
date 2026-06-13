import { z } from "zod";
import type { Tool, ToolResult } from "@lookai/shared";
import type { MemoryStore } from "@lookai/memory";

export const ArtifactToolFactory = (store: MemoryStore | null): Tool => ({
  name: "artifact",
  description: "Create, read, or list non-code artifacts (documents, notes, reports). Stored as markdown files in .lookai/artifacts/.",
  parameters: z.object({
    action: z.enum(["create", "read", "list", "delete"]).describe("Action to perform"),
    name: z.string().optional().describe("Artifact name (for create/read/delete)"),
    content: z.string().optional().describe("Markdown content (for create)"),
  }),
  execute(args): ToolResult {
    if (!store) {
      return { ok: false, error: "Artifact store not available." };
    }
    const action = String(args.action ?? "");
    const name = args.name ? String(args.name) : "";
    try {
      if (action === "create") {
        if (!name || !args.content) {
          return { ok: false, error: "create requires name and content" };
        }
        store.saveArtifact(name, String(args.content));
        return { ok: true, content: `Created artifact: ${name}` };
      }
      if (action === "read") {
        if (!name) return { ok: false, error: "read requires name" };
        const content = store.loadArtifact(name);
        if (content === null) return { ok: false, error: `Artifact not found: ${name}` };
        return { ok: true, content };
      }
      if (action === "list") {
        const entries = store.listArtifacts();
        if (entries.length === 0) return { ok: true, content: "No artifacts." };
        return { ok: true, content: entries.map((e: { name: string; size: number; updatedAt: number }) => `- ${e.name} (${Math.round(e.size / 1024)} KB, ${new Date(e.updatedAt).toISOString()})`).join("\n") };
      }
      if (action === "delete") {
        if (!name) return { ok: false, error: "delete requires name" };
        const deleted = store.deleteArtifact(name);
        return { ok: deleted, content: deleted ? `Deleted: ${name}` : `Not found: ${name}` };
      }
      return { ok: false, error: `Unknown action: ${action}` };
    } catch (e) {
      return { ok: false, error: `Artifact error: ${e instanceof Error ? e.message : String(e)}` };
    }
  },
});
