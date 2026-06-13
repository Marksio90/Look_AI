import { test, expect } from "vitest";
import { runSubagent } from "../subagent.js";

// Mock router — we can't test real LLM calls in unit tests
test("subagent types are exported", () => {
  expect(typeof runSubagent).toBe("function");
});
