import { describe, it, expect } from "vitest";
import { AgentRuntime } from "../runtime.js";
import { ToolRegistry, ReadTool } from "@lookai/tools";
import type { LLMClient, LLMResponse, Message, ToolDef, LLMOptions } from "@lookai/shared";

function makeMockLLM(responses: LLMResponse[]): LLMClient {
  let i = 0;
  return {
    async create(// eslint-disable-next-line no-unused-vars
_messages: Message[], // eslint-disable-next-line no-unused-vars
_tools: ToolDef[], // eslint-disable-next-line no-unused-vars
_opts?: LLMOptions): Promise<LLMResponse> {
      const r = responses[i++];
      if (!r) throw new Error("No more mock responses");
      return r;
    },
  };
}

describe("AgentRuntime", () => {
  it("runs end-to-end with end_turn", async () => {
    const llm = makeMockLLM([
      { stopReason: "end_turn", text: "Done", toolCalls: [], usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 } },
    ]);
    const reg = new ToolRegistry();
    reg.register(ReadTool);
    const runtime = new AgentRuntime(llm, reg, { maxTurns: 5 });
    const result = await runtime.run("hello");
    expect(result.done).toBe(true);
    expect(result.reason).toBe("end_turn");
  });

  it("executes a tool and loops", async () => {
    const llm = makeMockLLM([
      { stopReason: "tool_use", text: "", toolCalls: [{ id: "t1", name: "read", arguments: { path: "/tmp/fake" } }], usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 } },
      { stopReason: "end_turn", text: "OK", toolCalls: [], usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 } },
    ]);
    const reg = new ToolRegistry();
    reg.register(ReadTool);
    const runtime = new AgentRuntime(llm, reg, { maxTurns: 5 });
    const result = await runtime.run("read file");
    expect(result.done).toBe(true);
    expect(runtime.getUsage().turns).toBe(2);
  });

  it("respects maxTurns", async () => {
    const llm = makeMockLLM([
      { stopReason: "tool_use", text: "", toolCalls: [{ id: "t1", name: "read", arguments: { path: "/tmp/fake" } }], usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 } },
    ]);
    const reg = new ToolRegistry();
    reg.register(ReadTool);
    const runtime = new AgentRuntime(llm, reg, { maxTurns: 1 });
    const result = await runtime.run("loop");
    expect(result.done).toBe(false);
    expect(result.reason).toBe("max_turns");
  });

  it("parses JSON tool call from text fallback", async () => {
    const llm = makeMockLLM([
      { stopReason: "end_turn", text: '```json\n{"name":"read","arguments":{"path":"/tmp/fake"}}\n```', toolCalls: [], usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 } },
      { stopReason: "end_turn", text: "OK", toolCalls: [], usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 } },
    ]);
    const reg = new ToolRegistry();
    reg.register(ReadTool);
    const runtime = new AgentRuntime(llm, reg, { maxTurns: 5 });
    const result = await runtime.run("read file");
    expect(result.done).toBe(true);
    expect(runtime.getUsage().turns).toBe(2);
  });
});
