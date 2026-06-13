import { z } from "zod";
import { readFileSync, writeFileSync, existsSync, statSync, readdirSync } from "node:fs";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { join } from "node:path";
import type { Tool, ToolResult } from "@lookai/shared";

const MAX_READ_LINES = 200;
const GLOB_LIMIT = 100;

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
  description: "Replace old_str with new_str in a file. The file MUST have been read first. Set replace_all=true for bulk changes.",
  parameters: z.object({
    path: z.string(),
    old_str: z.string(),
    new_str: z.string(),
    replace_all: z.boolean().optional().describe("Replace all occurrences"),
  }),
  execute(args): ToolResult {
    const path = String(args.path ?? "");
    const oldStr = String(args.old_str ?? "");
    const newStr = String(args.new_str ?? "");
    const replaceAll = Boolean(args.replace_all ?? false);
    try {
      if (!existsSync(path)) {
        return { ok: false, error: `File not found: ${path}` };
      }
      const raw = readFileSync(path, "utf-8");
      if (!raw.includes(oldStr)) {
        return { ok: false, error: `old_str not found in ${path}` };
      }
      const updated = replaceAll ? raw.replaceAll(oldStr, newStr) : raw.replace(oldStr, newStr);
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

export const GlobTool: Tool = {
  name: "glob",
  description: "Find files matching a pattern. Returns up to 100 files sorted by modification time (newest first).",
  parameters: z.object({
    pattern: z.string().describe("Glob pattern, e.g. '*.ts' or 'src/**/*.js'"),
    cwd: z.string().optional().describe("Working directory for the search"),
  }),
  execute(args): ToolResult {
    const pattern = String(args.pattern ?? "");
    const cwd = String(args.cwd ?? ".");
    try {
      const results = globSync(pattern, cwd, GLOB_LIMIT);
      if (results.length === 0) {
        return { ok: true, content: "No files found." };
      }
      return { ok: true, content: results.join("\n") };
    } catch (e) {
      return { ok: false, error: `Glob error: ${e instanceof Error ? e.message : String(e)}` };
    }
  },
};

function globSync(pattern: string, cwd: string, limit: number): string[] {
  // Simple glob: supports * and **
  const parts = pattern.split("/");
  const results: Array<{ path: string; mtime: number }> = [];
  walk(cwd, parts, 0, cwd, results, limit);
  results.sort((a, b) => b.mtime - a.mtime);
  return results.slice(0, limit).map((r) => r.path);
}

function walk(base: string, parts: string[], idx: number, current: string, results: Array<{ path: string; mtime: number }>, limit: number): void {
  if (results.length >= limit) return;
  if (idx >= parts.length) {
    if (existsSync(current) && statSync(current).isFile()) {
      results.push({ path: current, mtime: statSync(current).mtimeMs });
    }
    return;
  }
  const part = parts[idx];
  if (part === "**") {
    // Match any depth
    walk(base, parts, idx + 1, current, results, limit);
    if (existsSync(current) && statSync(current).isDirectory()) {
      for (const child of readdirSync(current)) {
        walk(base, parts, idx, join(current, child), results, limit);
      }
    }
  } else if (part.includes("*")) {
    const regex = new RegExp("^" + part.replace(/\./g, "\\.").replace(/\*/g, ".*") + "$");
    if (existsSync(current) && statSync(current).isDirectory()) {
      for (const child of readdirSync(current)) {
        if (regex.test(child)) {
          walk(base, parts, idx + 1, join(current, child), results, limit);
        }
      }
    }
  } else {
    const next = join(current, part);
    walk(base, parts, idx + 1, next, results, limit);
  }
}

export const GrepTool: Tool = {
  name: "grep",
  description: "Search file contents for a pattern (regex). Returns matching lines with file paths and line numbers.",
  parameters: z.object({
    pattern: z.string().describe("Regex pattern to search for"),
    path: z.string().optional().describe("File or directory to search; defaults to current directory"),
    include: z.string().optional().describe("Glob pattern for files to include, e.g. '*.ts'"),
  }),
  execute(args): ToolResult {
    const pattern = String(args.pattern ?? "");
    const target = String(args.path ?? ".");
    const include = args.include ? String(args.include) : null;
    try {
      const regex = new RegExp(pattern);
      const results: string[] = [];
      if (existsSync(target) && statSync(target).isFile()) {
        grepFile(target, regex, results);
      } else if (existsSync(target) && statSync(target).isDirectory()) {
        grepDir(target, regex, include, results);
      } else {
        return { ok: false, error: `Path not found: ${target}` };
      }
      if (results.length === 0) {
        return { ok: true, content: "No matches found." };
      }
      return { ok: true, content: results.join("\n") };
    } catch (e) {
      return { ok: false, error: `Grep error: ${e instanceof Error ? e.message : String(e)}` };
    }
  },
};

function grepFile(path: string, regex: RegExp, results: string[]): void {
  const raw = readFileSync(path, "utf-8");
  const lines = raw.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (regex.test(lines[i])) {
      results.push(`${path}:${i + 1}: ${lines[i].trim()}`);
    }
  }
}

function grepDir(dir: string, regex: RegExp, include: string | null, results: string[]): void {
  if (!existsSync(dir) || !statSync(dir).isDirectory()) return;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const s = statSync(full);
    if (s.isDirectory()) {
      grepDir(full, regex, include, results);
    } else if (s.isFile()) {
      if (include && !entry.match(include.replace(/\./g, "\\.").replace(/\*/g, ".*"))) continue;
      grepFile(full, regex, results);
    }
  }
}
