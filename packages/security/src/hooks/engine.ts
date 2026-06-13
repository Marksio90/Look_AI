import type { ToolCall, ToolResult } from "@lookai/shared";
import { readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export type HookPhase = "pre" | "post";

export interface HookContext {
  toolCall: ToolCall;
  result?: ToolResult;
  projectRoot: string;
}

export interface ToolHook {
  name: string;
  phase: HookPhase;
  toolPattern: RegExp; // regex to match tool names
  // eslint-disable-next-line no-unused-vars
  handler(ctx: HookContext): Promise<ToolResult | void> | ToolResult | void;
}

export class HookEngine {
  private hooks: ToolHook[] = [];

  register(hook: ToolHook): void {
    this.hooks.push(hook);
  }

  async runPreHooks(toolCall: ToolCall, projectRoot: string): Promise<ToolResult | undefined> {
    for (const hook of this.hooks) {
      if (hook.phase !== "pre") continue;
      if (!hook.toolPattern.test(toolCall.name)) continue;
      const result = await hook.handler({ toolCall, projectRoot });
      if (result && !result.ok) {
        return result; // Deny
      }
    }
    return undefined;
  }

  async runPostHooks(toolCall: ToolCall, result: ToolResult, projectRoot: string): Promise<ToolResult> {
    let current = result;
    for (const hook of this.hooks) {
      if (hook.phase !== "post") continue;
      if (!hook.toolPattern.test(toolCall.name)) continue;
      const hookResult = await hook.handler({ toolCall, result: current, projectRoot });
      if (hookResult) {
        current = hookResult;
      }
    }
    return current;
  }

  async loadFromDir(dir: string): Promise<void> {
    if (!existsSync(dir)) return;
    const files = readdirSync(dir).filter((f) => f.endsWith('.js') || f.endsWith('.ts'));
    for (const file of files) {
      const path = join(dir, file);
      try {
        const mod = await import(pathToFileURL(path).href);
        if (mod.default && typeof mod.default === 'object' && 'phase' in mod.default && 'toolPattern' in mod.default) {
          this.register(mod.default as ToolHook);
        } else if (mod.hook && typeof mod.hook === 'object') {
          this.register(mod.hook as ToolHook);
        }
      } catch {
        // Skip files that fail to load
      }
    }
  }
}

/**
 * Built-in PostToolUse hook: run tests after edit.
 */
export function createTestAfterEditHook(testCommand = "pnpm run test"): ToolHook {
  return {
    name: "test-after-edit",
    phase: "post",
    toolPattern: /^edit$/,
    async handler(ctx): Promise<ToolResult | void> {
      const { spawn } = await import("node:child_process");
      return new Promise((resolve) => {
        const child = spawn("bash", ["-c", testCommand], {
          cwd: ctx.projectRoot,
          stdio: "pipe",
        });
        let stdout = "";
        let stderr = "";
        child.stdout?.on("data", (d) => { stdout += String(d); });
        child.stderr?.on("data", (d) => { stderr += String(d); });
        child.on("close", (code) => {
          if (code !== 0) {
            resolve({
              ok: false,
              error: `Tests failed after edit. stdout: ${stdout.slice(0, 500)}\nstderr: ${stderr.slice(0, 500)}`,
            });
          } else {
            resolve({ ok: true, content: "Tests passed after edit." });
          }
        });
        child.on("error", (err) => {
          resolve({ ok: false, error: `Test hook error: ${err.message}` });
        });
      });
    },
  };
}
