import { test, expect } from "vitest";
import { McpClientManager, mcpToolToLookaiTool } from "../client.js";

test("McpClientManager can be instantiated", () => {
  const manager = new McpClientManager();
  expect(manager).toBeDefined();
});

test("mcpToolToLookaiTool creates valid tool name", () => {
  const manager = new McpClientManager();
  const tool = mcpToolToLookaiTool("fs", { name: "read_file", description: "Read a file", inputSchema: { type: "object", properties: {} } }, manager);
  expect(tool.name).toBe("fs_read_file");
  expect(tool.description).toContain("MCP:fs");
});
