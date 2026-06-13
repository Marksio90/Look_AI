import { z } from "zod";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import type { Tool, ToolResult } from "@lookai/shared";

const MAX_READ_LINES = 200;

export const ReadTool: Tool = {
  name: "read",
  description: "Read a file with line numbers. Use offset for large files. Marks file as read.",
  parameters: z.object({
    path: z.string().describe("Absolute or relative file path"),
    offset: z.number().int().min(1).optional().describe("Start line (1-indexed)"),
  }),
  execute(args): ToolResult {
    const path = String(args.path ?? "");
    const offset = Math.max(1, Number(args.offset ?? 1));
    try {
      if (!existsSync(path)) {
        return { ok: false, error: `File not found: ${path}` };
      }
      const raw = readFileSync(path, "utf-8");
      const lines = raw.split("\n");
      const slice = lines.slice(offset - 1, offset - 1 + MAX_READ_LINES);
      const numbered = slice.map((l, i) => `${offset + i}: ${l}`).join("\n");
      const truncated = lines.length > offset - 1 + MAX_READ_LINES;
      return {
        ok: true,
        content: numbered + (truncated ? `\n... (${lines.length - (offset - 1 + MAX_READ_LINES)} more lines)` : ""),
      };
    } catch (e) {
      return { ok: false, error: `Read error: ${e instanceof Error ? e.message : String(e)}` };
    }
  },
};

export const WriteTool: Tool = {
  name: "write",
  description: "Create or overwrite a file with the given content.",
  parameters: z.object({
    path: z.string(),
    content: z.string(),
  }),
  execute(args): ToolResult {
    const path = String(args.path ?? "");
    const content = String(args.content ?? "");
    try {
      writeFileSync(path, content, "utf-8");
      return { ok: true, content: `Wrote ${path}` };
    } catch (e) {
      return { ok: false, error: `Write error: ${e instanceof Error ? e.message : String(e)}` };
    }
  },
};

export const EditTool: Tool = {
  name: "edit",
  description: "Replace old_str with new_str in a file. The file MUST have been read first.",
  parameters: z.object({
    path: z.string(),
    old_str: z.string(),
    new_str: z.string(),
  }),
  execute(args): ToolResult {
    const path = String(args.path ?? "");
    const oldStr = String(args.old_str ?? "");
    const newStr = String(args.new_str ?? "");
    try {
      if (!existsSync(path)) {
        return { ok: false, error: `File not found: ${path}` };
      }
      const raw = readFileSync(path, "utf-8");
      if (!raw.includes(oldStr)) {
        return { ok: false, error: `old_str not found in ${path}` };
      }
      const updated = raw.replace(oldStr, newStr);
      writeFileSync(path, updated, "utf-8");
      return { ok: true, content: `Edited ${path}` };
    } catch (e) {
      return { ok: false, error: `Edit error: ${e instanceof Error ? e.message : String(e)}` };
    }
  },
};

export class BashSession {
  private cwd: string;
  private env: Record<string, string>;
  private child: ChildProcessWithoutNullStreams | null = null;

  constructor(cwd: string, env: Record<string, string> = {}) {
    this.cwd = cwd;
    this.env = { ...process.env, ...env } as Record<string, string>;
  }

  async run(command: string): Promise<ToolResult> {
    return new Promise((resolve) => {
      const child = spawn("bash", ["-c", command], {
        cwd: this.cwd,
        env: this.env,
        stdio: ["pipe", "pipe", "pipe"],
      });
      this.child = child;
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (d) => { stdout += d; });
      child.stderr.on("data", (d) => { stderr += d; });
      child.on("close", (code) => {
        this.child = null;
        const out = stdout.trim();
        const err = stderr.trim();
        if (code === 0) {
          resolve({ ok: true, content: out || "(no output)" });
        } else {
          resolve({ ok: false, error: `Exit ${code}: ${err || out || "(no output)"}` });
        }
      });
      child.on("error", (e) => {
        this.child = null;
        resolve({ ok: false, error: `Spawn error: ${e.message}` });
      });
    });
  }

  kill(): void {
    if (this.child && !this.child.killed) {
      this.child.kill("SIGTERM");
    }
  }
}

export const BashToolFactory = (session: BashSession): Tool => ({
  name: "bash",
  description: "Run a bash command in a persistent session (cwd and env persist).",
  parameters: z.object({
    command: z.string().describe("Command to run"),
  }),
  execute(args): Promise<ToolResult> | ToolResult {
    return session.run(String(args.command ?? ""));
  },
});
