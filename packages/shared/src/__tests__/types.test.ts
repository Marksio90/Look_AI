import { describe, it, expect } from "vitest";
import { MessageSchema, ToolCallSchema, StopReasonSchema } from "../types.js";

describe("types", () => {
  it("validates a message", () => {
    const m = MessageSchema.parse({ role: "user", content: "hello" });
    expect(m.role).toBe("user");
  });
  it("validates a tool call", () => {
    const tc = ToolCallSchema.parse({ id: "1", name: "read", arguments: { path: "/tmp" } });
    expect(tc.name).toBe("read");
  });
  it("validates stop reason", () => {
    expect(StopReasonSchema.parse("end_turn")).toBe("end_turn");
  });
});
