import { test, expect } from "vitest";
import { EvalHarness, createDefaultEvalSuite } from "../harness.js";

test("EvalHarness can be instantiated", () => {
  const harness = new EvalHarness();
  expect(harness).toBeDefined();
});

test("createDefaultEvalSuite returns tasks", () => {
  const suite = createDefaultEvalSuite();
  expect(suite.name).toBe("basic-coding");
  expect(suite.tasks.length).toBeGreaterThan(0);
});

test("EvalHarness registers and lists suites", () => {
  const harness = new EvalHarness();
  harness.registerSuite(createDefaultEvalSuite());
  const suites = harness.listSuites();
  expect(suites.length).toBe(1);
  expect(suites[0].name).toBe("basic-coding");
});
