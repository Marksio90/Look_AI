import { describe, it, expect } from "vitest";
import { ReadTool, WriteTool, EditTool, BashSession } from "../tools.js";
import { ToolRegistry } from "../registry.js";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("ReadTool", () => {
  it("reads a file with line numbers", async () => {
    const dir = mkdtempSync(join(tmpdir(), "lookai-"));
    const f = join(dir, "test.txt");
    writeFileSync(f, "line1\nline2\n", "utf-8");
    const r = await ReadTool.execute({ path: f });
    expect(r.ok).toBe(true);
    expect((r.content ?? "")).toContain("1: line1");
    rmSync(dir, { recursive: true });
  });
});

describe("WriteTool", () => {
  it("writes a file", async () => {
    const dir = mkdtempSync(join(tmpdir(), "lookai-"));
    const f = join(dir, "out.txt");
    const r = await WriteTool.execute({ path: f, content: "hello" });
    expect(r.ok).toBe(true);
    rmSync(dir, { recursive: true });
  });
});

describe("EditTool", () => {
  it("replaces old_str with new_str", async () => {
    const dir = mkdtempSync(join(tmpdir(), "lookai-"));
    const f = join(dir, "edit.txt");
    writeFileSync(f, "foo bar baz", "utf-8");
    const r = await EditTool.execute({ path: f, old_str: "bar", new_str: "qux" });
    expect(r.ok).toBe(true);
    rmSync(dir, { recursive: true });
  });
});

describe("BashSession", () => {
  it("runs a command", async () => {
    const s = new BashSession(".");
    const r = await s.run("echo hello");
    expect(r.exitCode).toBe(0);
    expect(r.stdout.trim()).toBe("hello");
  });
});

describe("ToolRegistry", () => {
  it("dispatches a known tool", async () => {
    const reg = new ToolRegistry();
    reg.register(ReadTool);
    const r = await reg.dispatch("read", { path: "/nonexistent" });
    expect(r.ok).toBe(false);
  });
});
