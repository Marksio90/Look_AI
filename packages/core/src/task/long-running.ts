import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

export interface LongRunningState {
  taskId: string;
  phase: "plan" | "generate" | "evaluate" | "done" | "error";
  plan?: string;
  generated?: string;
  evaluation?: { passed: boolean; feedback: string };
  attempts: number;
  maxAttempts: number;
  contextSnapshot?: string; // compacted context to resume from
}

export class LongRunningTask {
  private stateDir: string;

  constructor(stateDir: string = join(process.cwd(), ".lookai", "state")) {
    this.stateDir = stateDir;
    if (!existsSync(this.stateDir)) {
      mkdirSync(this.stateDir, { recursive: true });
    }
  }

  loadState(taskId: string): LongRunningState | null {
    const path = join(this.stateDir, `${taskId}.json`);
    if (!existsSync(path)) return null;
    try {
      return JSON.parse(readFileSync(path, "utf-8")) as LongRunningState;
    } catch {
      return null;
    }
  }

  saveState(state: LongRunningState): void {
    const path = join(this.stateDir, `${state.taskId}.json`);
    writeFileSync(path, JSON.stringify(state, null, 2), "utf-8");
  }

  deleteState(taskId: string): void {
    const path = join(this.stateDir, `${taskId}.json`);
    if (existsSync(path)) {
      const { unlinkSync } = await import("node:fs");
      unlinkSync(path);
    }
  }

  /**
   * Resume a long-running task from disk state.
   * Returns the current phase and whether more work is needed.
   */
  resume(taskId: string): { state: LongRunningState; nextAction: string } | null {
    const state = this.loadState(taskId);
    if (!state) return null;

    if (state.phase === "done" || state.phase === "error") {
      return { state, nextAction: "none" };
    }

    if (state.attempts >= state.maxAttempts) {
      state.phase = "error";
      this.saveState(state);
      return { state, nextAction: "none" };
    }

    const nextActions: Record<string, string> = {
      plan: "generate",
      generate: "evaluate",
      evaluate: state.evaluation?.passed ? "done" : "generate",
    };

    return { state, nextAction: nextActions[state.phase] ?? "none" };
  }

  /**
   * Transition to next phase.
   */
  transition(state: LongRunningState, nextPhase: LongRunningState["phase"], data?: Partial<LongRunningState>): LongRunningState {
    const updated = { ...state, ...data, phase: nextPhase };
    if (nextPhase === "generate" || nextPhase === "evaluate") {
      updated.attempts = (updated.attempts ?? 0) + 1;
    }
    this.saveState(updated);
    return updated;
  }
}
