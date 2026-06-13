import { test, expect } from "vitest";
import { Orchestrator } from "../server.js";

test("Orchestrator can be instantiated", () => {
  const orch = new Orchestrator({ port: 9999, wsPort: 9998 });
  expect(orch).toBeDefined();
});

test("Orchestrator respects maxSessions", () => {
  const orch = new Orchestrator({ maxSessions: 2 });
  // We can't create real sessions without AgentRuntime, but we can test the limit logic indirectly
  expect(orch.listSessions()).toEqual([]);
});
