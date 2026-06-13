import type { AgentRuntime } from "@lookai/core";

export interface EvalTask {
  id: string;
  name: string;
  prompt: string;
  expectedTools?: string[]; // tools that should be called
  expectedFiles?: string[]; // files that should be created/modified
  timeoutMs?: number;
  maxTurns?: number;
}

export interface EvalResult {
  taskId: string;
  passed: boolean;
  score: number; // 0-1
  toolsUsed: string[];
  filesChanged: string[];
  errors: string[];
  tokenUsage: number;
  durationMs: number;
  trajectory: Array<{ turn: number; type: string; summary: string }>;
}

export interface EvalSuite {
  name: string;
  tasks: EvalTask[];
}

export class EvalHarness {
  private suites: EvalSuite[] = [];

  registerSuite(suite: EvalSuite): void {
    this.suites.push(suite);
  }

  listSuites(): Array<{ name: string; taskCount: number }> {
    return this.suites.map((s) => ({ name: s.name, taskCount: s.tasks.length }));
  }

  async runTask(runtimeFactory: () => AgentRuntime, task: EvalTask): Promise<EvalResult> {
    const start = Date.now();
    const runtime = runtimeFactory();
    const toolsUsed: string[] = [];
    const errors: string[] = [];
    const trajectory: Array<{ turn: number; type: string; summary: string }> = [];
    let tokenUsage = 0;
    let turnCount = 0;

    try {
      await runtime.run(task.prompt, {
        onTurn: async (event) => {
          turnCount++;
          if (event.type === "tool_call" && event.toolCall) {
            toolsUsed.push(event.toolCall.name);
          }
          if (event.type === "error" && event.error) {
            errors.push(event.error);
          }
          if (event.usage) {
            tokenUsage += event.usage.totalTokens;
          }
          trajectory.push({
            turn: turnCount,
            type: event.type,
            summary: event.text?.slice(0, 100) ?? event.toolCall?.name ?? "",
          });
        },
      });
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e));
    }

    const duration = Date.now() - start;

    // Score: did it use expected tools? (simple heuristic)
    let score = 0;
    if (task.expectedTools && task.expectedTools.length > 0) {
      const matched = task.expectedTools.filter((t) => toolsUsed.includes(t)).length;
      score = matched / task.expectedTools.length;
    } else {
      score = errors.length === 0 ? 1 : 0.5;
    }

    return {
      taskId: task.id,
      passed: score >= 0.7 && errors.length === 0,
      score,
      toolsUsed: [...new Set(toolsUsed)],
      filesChanged: [], // TODO: track file changes via hooks
      errors,
      tokenUsage,
      durationMs: duration,
      trajectory,
    };
  }

  async runSuite(runtimeFactory: () => AgentRuntime, suiteName: string): Promise<EvalResult[]> {
    const suite = this.suites.find((s) => s.name === suiteName);
    if (!suite) {
      throw new Error(`Suite not found: ${suiteName}`);
    }
    const results: EvalResult[] = [];
    for (const task of suite.tasks) {
      results.push(await this.runTask(runtimeFactory, task));
    }
    return results;
  }
}

/**
 * Built-in eval suite: basic coding tasks.
 */
export function createDefaultEvalSuite(): EvalSuite {
  return {
    name: "basic-coding",
    tasks: [
      {
        id: "read-file",
        name: "Read a file",
        prompt: "Read the file README.md and tell me what this project is about.",
        expectedTools: ["read"],
        maxTurns: 5,
      },
      {
        id: "glob-search",
        name: "Find TypeScript files",
        prompt: "Find all TypeScript files in the src directory.",
        expectedTools: ["glob"],
        maxTurns: 5,
      },
      {
        id: "edit-file",
        name: "Edit a file",
        prompt: "Add a comment '// TODO: refactor' at the top of package.json.",
        expectedTools: ["read", "edit"],
        maxTurns: 10,
      },
    ],
  };
}
