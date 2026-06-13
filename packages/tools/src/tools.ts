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
    this.env = env;
  }

  run(command: string): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    return new Promise((resolve) => {
      this.child = spawn(command, { shell: true, cwd: this.cwd, env: { ...process.env, ...this.env } });
      let stdout = "";
      let stderr = "";
      this.child.stdout.on("data", (data) => { stdout += String(data); });
      this.child.stderr.on("data", (data) => { stderr += String(data); });
      this.child.on("close", (code) => {
        resolve({ stdout: stdout.slice(0, 5000), stderr: stderr.slice(0, 2000), exitCode: code ?? 0 });
      });
    });
  }

  kill(): void {
    this.child?.kill();
  }
}

export const BashToolFactory = (session: BashSession): Tool => ({
  name: "bash",
  description: "Run a bash command in a persistent session. Output is truncated to 5000 chars.",
  parameters: z.object({
    command: z.string().describe("Shell command to run"),
  }),
  async execute(args): Promise<ToolResult> {
    const command = String(args.command ?? "");
    try {
      const result = await session.run(command);
      const lines = [
        `Exit code: ${result.exitCode}`,
        result.stdout ? `stdout:\n${result.stdout}` : "",
        result.stderr ? `stderr:\n${result.stderr}` : "",
      ].filter(Boolean).join("\n");
      return { ok: result.exitCode === 0, content: lines };
    } catch (e) {
      return { ok: false, error: `Bash error: ${e instanceof Error ? e.message : String(e)}` };
    }
  },
});

export const GlobTool: Tool = {
  name: "glob",
  description: "Find files matching a pattern. Supports * and **. Returns up to 100 results sorted by recency.",
  parameters: z.object({
    pattern: z.string().describe("Glob pattern, e.g. 'src/**/*.ts'"),
    cwd: z.string().optional().describe("Working directory (default: current)"),
  }),
  execute(args): ToolResult {
    const pattern = String(args.pattern ?? "");
    const cwd = String(args.cwd ?? process.cwd());
    try {
      const results = globSync(pattern, cwd, GLOB_LIMIT);
      return { ok: true, content: results.join("\n") || "No matches." };
    } catch (e) {
      return { ok: false, error: `Glob error: ${e instanceof Error ? e.message : String(e)}` };
    }
  },
};

export const GrepTool: Tool = {
  name: "grep",
  description: "Search file contents for a regex pattern. Returns matching lines with file paths and line numbers.",
  parameters: z.object({
    pattern: z.string().describe("Regex pattern to search for"),
    path: z.string().optional().describe("File or directory to search in (default: current directory)"),
    include: z.string().optional().describe("File extension filter, e.g. '*.ts'"),
  }),
  execute(args): ToolResult {
    const pattern = String(args.pattern ?? "");
    const target = String(args.path ?? process.cwd());
    const include = args.include ? String(args.include) : null;
    try {
      const regex = new RegExp(pattern, "g");
      const results: string[] = [];
      if (existsSync(target) && statSync(target).isFile()) {
        grepFile(target, regex, results);
      } else if (existsSync(target) && statSync(target).isDirectory()) {
        grepDir(target, regex, include, results);
      } else {
        return { ok: false, error: `Path not found: ${target}` };
      }
      return { ok: true, content: results.slice(0, 200).join("\n") || "No matches." };
    } catch (e) {
      return { ok: false, error: `Grep error: ${e instanceof Error ? e.message : String(e)}` };
    }
  },
};

export const IngestTool: Tool = {
  name: "ingest",
  description: "Ingest a file into context. Supports .txt, .md, .json, .csv, .tsv. Converts CSV to markdown table. For large files, returns first 200 lines with size info.",
  parameters: z.object({
    path: z.string().describe("Path to file to ingest"),
  }),
  execute(args): ToolResult {
    const path = String(args.path ?? "");
    try {
      if (!existsSync(path)) {
        return { ok: false, error: `File not found: ${path}` };
      }
      const s = statSync(path);
      if (!s.isFile()) {
        return { ok: false, error: `Not a file: ${path}` };
      }

      const ext = path.split(".").pop()?.toLowerCase() ?? "";
      const raw = readFileSync(path, "utf-8");
      const lines = raw.split("\n");
      const sizeKb = Math.round(s.size / 1024);

      // CSV/TSV → markdown table
      if (ext === "csv" || ext === "tsv") {
        const delimiter = ext === "csv" ? "," : "\t";
        const rows = lines.map((l) => l.split(delimiter).map((c) => c.trim()));
        if (rows.length === 0) {
          return { ok: true, content: "Empty file." };
        }
        const headers = rows[0];
        const body = rows.slice(1, 201); // max 200 data rows
        const md = [
          "| " + headers.join(" | ") + " |",
          "| " + headers.map(() => "---").join(" | ") + " |",
          ...body.map((r) => "| " + r.join(" | ") + " |"),
        ].join("\n");
        const truncated = rows.length > 201;
        return {
          ok: true,
          content: `Ingested ${path} (${sizeKb} KB, ${rows.length} rows)\n\n${md}${truncated ? "\n\n... (truncated to 200 rows)" : ""}`,
        };
      }

      // Text files: txt, md, json, and unknown
      const supported = ["txt", "md", "json", "js", "ts", "tsx", "jsx", "py", "rs", "go", "java", "c", "cpp", "h", "yaml", "yml", "toml", "xml", "html", "css", "scss", "sql", "sh", "bash", "ps1", "log"];
      if (!supported.includes(ext)) {
        return {
          ok: false,
          error: `Unsupported file type: .${ext}. Supported: ${supported.join(", ")}. For PDF/DOCX, convert to text first.`,
        };
      }

      const head = lines.slice(0, MAX_READ_LINES).join("\n");
      const truncated = lines.length > MAX_READ_LINES;
      return {
        ok: true,
        content: `Ingested ${path} (${sizeKb} KB, ${lines.length} lines)\n\n${head}${truncated ? `\n\n... (${lines.length - MAX_READ_LINES} more lines)` : ""}`,
      };
    } catch (e) {
      return { ok: false, error: `Ingest error: ${e instanceof Error ? e.message : String(e)}` };
    }
  },
};

function globSync(pattern: string, cwd: string, limit: number): string[] {
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
    walk(base, parts, idx + 1, current, results, limit);
    if (existsSync(current) && statSync(current).isDirectory()) {
      for (const entry of readdirSync(current)) {
        walk(base, parts, idx, join(current, entry), results, limit);
      }
    }
  } else if (part === "*") {
    if (existsSync(current) && statSync(current).isDirectory()) {
      for (const entry of readdirSync(current)) {
        walk(base, parts, idx + 1, join(current, entry), results, limit);
      }
    }
  } else {
    walk(base, parts, idx + 1, join(current, part), results, limit);
  }
}

function grepFile(path: string, regex: RegExp, results: string[]): void {
  const raw = readFileSync(path, "utf-8");
  const lines = raw.split("\n");
  for (let i = 0; i < lines.length; i++) {
    regex.lastIndex = 0;
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
