import { test, expect, describe } from "vitest";
import { McpClientManager, mcpToolToLookaiTool } from "@lookai/mcp";
import { SandboxRunner, isDomainAllowed, logBlockedEgress } from "@lookai/sandbox";
import { HookEngine } from "@lookai/security";
import { runSubagent } from "@lookai/core";
import { ToolRegistry } from "@lookai/tools";

describe("Phase 2 Integration Smoke Test", () => {
  test("(a) MCP tool discovery and conversion", () => {
    const manager = new McpClientManager();
    const tool = mcpToolToLookaiTool("fs", {
      name: "read_file",
      description: "Read a file",
      inputSchema: { type: "object", properties: { path: { type: "string" } }, required: ["path"] },
    }, manager);

    expect(tool.name).toBe("fs_read_file");
    expect(tool.description).toContain("MCP:fs");
    expect(tool.parameters).toBeDefined();
  });

  test("(b) SandboxRunner can be instantiated and runs commands", async () => {
    const runner = new SandboxRunner({ image: "alpine:latest" });
    // Docker may not be available in test env — fallback to host
    const result = await runner.run("echo hello");
    expect(result.stdout.trim()).toBe("hello");
    expect(result.ok).toBe(true);
  });

  test("(c) Egress allowlist blocks unauthorized domains", () => {
    expect(isDomainAllowed("https://github.com/foo", ["github.com"])).toBe(true);
    expect(isDomainAllowed("https://evil.com/foo", ["github.com"])).toBe(false);
  });

  test("(d) HookEngine registers and runs hooks", async () => {
    const engine = new HookEngine();
    let preHookCalled = false;
    let postHookCalled = false;

    engine.register({
      name: "test-pre",
      phase: "pre",
      toolPattern: /^read$/,
      async handler() {
        preHookCalled = true;
      },
    });

    engine.register({
      name: "test-post",
      phase: "post",
      toolPattern: /^read$/,
      async handler() {
        postHookCalled = true;
      },
    });

    await engine.runPreHooks({ id: "1", name: "read", arguments: { path: "/tmp" } }, "/tmp");
    expect(preHookCalled).toBe(true);

    await engine.runPostHooks({ id: "1", name: "read", arguments: { path: "/tmp" } }, { ok: true }, "/tmp");
    expect(postHookCalled).toBe(true);
  });

  test("(e) Subagent function is exported and typed", () => {
    expect(typeof runSubagent).toBe("function");
  });

  test("(f) MCP tool can be registered in ToolRegistry", () => {
    const manager = new McpClientManager();
    const registry = new ToolRegistry();
    const tool = mcpToolToLookaiTool("github", {
      name: "search_issues",
      description: "Search GitHub issues",
      inputSchema: { type: "object", properties: { query: { type: "string" } } },
    }, manager);

    registry.register(tool);
    const defs = registry.toolDefs();
    expect(defs.some((d) => d.name === "github_search_issues")).toBe(true);
  });

  test("(g) Blocked egress log records entries", () => {
    const log: Array<{ domain: string; reason: string; timestamp: number }> = [];
    logBlockedEgress("https://blocked.example.com/data", "not in allowlist", log);
    expect(log.length).toBe(1);
    expect(log[0].domain).toBe("blocked.example.com");
    expect(log[0].reason).toBe("not in allowlist");
  });
});
