import { test, expect } from "vitest";
import { LongRunningTask } from "../long-running.js";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("LongRunningTask saves and loads state", () => {
  const tmpDir = mkdtempSync(join(tmpdir(), "lookai-test-"));
  const task = new LongRunningTask(tmpDir);

  const state = {
    taskId: "test-1",
    phase: "plan" as const,
    attempts: 0,
    maxAttempts: 3,
    plan: "Step 1: read file",
  };

  task.saveState(state);
  const loaded = task.loadState("test-1");
  expect(loaded).toEqual(state);

  rmSync(tmpDir, { recursive: true });
});

test("LongRunningTask transitions phases", () => {
  const tmpDir = mkdtempSync(join(tmpdir(), "lookai-test-"));
  const task = new LongRunningTask(tmpDir);

  const state = {
    taskId: "test-2",
    phase: "plan" as const,
    attempts: 0,
    maxAttempts: 3,
  };

  task.saveState(state);
  const resumed = task.resume("test-2");
  expect(resumed?.nextAction).toBe("generate");

  const next = task.transition(resumed!.state, "generate", { generated: "code" });
  expect(next.phase).toBe("generate");
  expect(next.attempts).toBe(1);

  rmSync(tmpDir, { recursive: true });
});

test("LongRunningTask respects maxAttempts", () => {
  const tmpDir = mkdtempSync(join(tmpdir(), "lookai-test-"));
  const task = new LongRunningTask(tmpDir);

  const state = {
    taskId: "test-3",
    phase: "generate" as const,
    attempts: 3,
    maxAttempts: 3,
  };

  task.saveState(state);
  const resumed = task.resume("test-3");
  expect(resumed?.state.phase).toBe("error");

  rmSync(tmpDir, { recursive: true });
});
