import { test, expect } from "vitest";
import { SandboxRunner, isDomainAllowed, logBlockedEgress } from "../runner.js";

test("SandboxRunner can be instantiated", () => {
  const runner = new SandboxRunner();
  expect(runner).toBeDefined();
});

test("isDomainAllowed allows github.com", () => {
  expect(isDomainAllowed("https://github.com/foo", ["github.com"])).toBe(true);
  expect(isDomainAllowed("https://evil.com/foo", ["github.com"])).toBe(false);
});

test("logBlockedEgress records entry", () => {
  const log: Array<{ domain: string; reason: string; timestamp: number }> = [];
  logBlockedEgress("https://evil.com", "not in allowlist", log);
  expect(log.length).toBe(1);
  expect(log[0].domain).toBe("evil.com");
});
