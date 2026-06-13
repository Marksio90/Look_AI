import type { LLMClient } from "@lookai/shared";
import type { ToolRegistry } from "@lookai/tools";
import type { Message, ToolCall, LLMResponse, ToolResult } from "@lookai/shared";
import type { RuntimeConfig, TurnHandler, UsageTracker } from "./types.js";

function makeSystemMessage(prompt: string): Message {
  return { role: "system", content: prompt };
}

function makeUserMessage(content: string): Message {
  return { role: "user", content };
}

function makeAssistantMessage(response: LLMResponse): Message {
  return { role: "assistant", content: response.text, toolCalls: response.toolCalls };
}

function makeToolResultMessage(toolCall: ToolCall, result: ToolResult): Message {
  return {
    role: "tool",
    content: result.ok ? (result.content ?? "") : `Error: ${result.error ?? "unknown"}`,
    toolCallId: toolCall.id,
    toolName: toolCall.name,
  };
}

export class AgentRuntime {
  private llm: LLMClient;
  private registry: ToolRegistry;
  private config: RuntimeConfig;
  private messages: Message[] = [];
  private tracker: UsageTracker = { totalTokens: 0, totalPromptTokens: 0, totalCompletionTokens: 0, turns: 0 };
  private readFiles = new Set<string>();

  constructor(llm: LLMClient, registry: ToolRegistry, config: RuntimeConfig) {
    this.llm = llm;
    this.registry = registry;
    this.config = { ...config, maxTurns: config.maxTurns ?? 25 };
  }

  getMessages(): readonly Message[] {
    return this.messages;
  }

  getUsage(): UsageTracker {
    return { ...this.tracker };
  }

  async run(userPrompt: string, onTurn?: TurnHandler): Promise<{ done: boolean; reason: string }> {
    this.messages = [];
    this.tracker = { totalTokens: 0, totalPromptTokens: 0, totalCompletionTokens: 0, turns: 0 };
    this.readFiles.clear();

    if (this.config.systemPrompt) {
      this.messages.push(makeSystemMessage(this.config.systemPrompt));
    }
    this.messages.push(makeUserMessage(userPrompt));

    for (let turn = 0; turn < this.config.maxTurns; turn++) {
      this.tracker.turns = turn + 1;
      const response = await this.llm.create(this.messages, this.registry.toolDefs());
      this.tracker.totalPromptTokens += response.usage.promptTokens;
      this.tracker.totalCompletionTokens += response.usage.completionTokens;
      this.tracker.totalTokens += response.usage.totalTokens;

      this.messages.push(makeAssistantMessage(response));

      if (response.text) {
        await onTurn?.({ type: "text", text: response.text, usage: response.usage });
      }

      // Fallback: parse JSON tool call from text for local models that don't emit native tool_calls
      if (response.text && (response.stopReason === "end_turn" || response.stopReason === "tool_use")) {
        const parsed = this.tryParseToolCall(response.text);
        if (parsed) {
          await onTurn?.({ type: "tool_call", toolCall: parsed, usage: response.usage });
          const result = await this.executeTool(parsed);
          await onTurn?.({ type: "tool_result", toolResult: { ...result, toolCallId: parsed.id, toolName: parsed.name }, usage: response.usage });
          this.messages.push(makeToolResultMessage(parsed, result));
          continue;
        }
      }

      if (response.stopReason === "end_turn") {
        await onTurn?.({ type: "done", usage: response.usage });
        return { done: true, reason: "end_turn" };
      }

      if (response.stopReason === "max_tokens") {
        await onTurn?.({ type: "error", error: "max_tokens reached", usage: response.usage });
        return { done: false, reason: "max_tokens" };
      }

      if (response.stopReason === "error") {
        await onTurn?.({ type: "error", error: "LLM error", usage: response.usage });
        return { done: false, reason: "llm_error" };
      }

      if (response.stopReason === "tool_use") {
        if (response.toolCalls.length === 0) {
          await onTurn?.({ type: "error", error: "stopReason=tool_use but no tool calls", usage: response.usage });
          return { done: false, reason: "empty_tool_calls" };
        }
        // Only one tool per turn
        const tc = response.toolCalls[0];
        await onTurn?.({ type: "tool_call", toolCall: tc, usage: response.usage });

        const result = await this.executeTool(tc);
        await onTurn?.({ type: "tool_result", toolResult: { ...result, toolCallId: tc.id, toolName: tc.name }, usage: response.usage });
        this.messages.push(makeToolResultMessage(tc, result));
        continue;
      }

      // Fallback: parse JSON tool call from text for local models that don't emit native tool_calls
      if (response.text) {
        const parsed = this.tryParseToolCall(response.text);
        if (parsed) {
          await onTurn?.({ type: "tool_call", toolCall: parsed, usage: response.usage });
          const result = await this.executeTool(parsed);
          await onTurn?.({ type: "tool_result", toolResult: { ...result, toolCallId: parsed.id, toolName: parsed.name }, usage: response.usage });
          this.messages.push(makeToolResultMessage(parsed, result));
          continue;
        }
      }
    }

    await onTurn?.({ type: "error", error: `maxTurns (${this.config.maxTurns}) reached` });
    return { done: false, reason: "max_turns" };
  }

  private async executeTool(tc: ToolCall): Promise<ToolResult> {
    // Read-before-Edit enforcement
    if (tc.name === "edit") {
      const path = String(tc.arguments?.path ?? "");
      if (!this.readFiles.has(path)) {
        return { ok: false, error: `Edit rejected: file "${path}" was not read first.` };
      }
    }
    if (tc.name === "read") {
      const path = String(tc.arguments?.path ?? "");
      this.readFiles.add(path);
    }
    return this.registry.dispatch(tc.name, tc.arguments);
  }

  private tryParseToolCall(text: string): ToolCall | null {
    let trimmed = text.trim();
    // Strip markdown code fences if present
    if (trimmed.startsWith("```")) {
      trimmed = trimmed.replace(/^```[a-z]*\n?/, "").replace(/\n?```$/, "").trim();
    }
    if (!trimmed.startsWith("{")) return null;
    try {
      const obj = JSON.parse(trimmed) as Record<string, unknown>;
      if (typeof obj.name !== "string" || typeof obj.arguments !== "object" || obj.arguments === null) return null;
      return { id: `parsed-${Date.now()}`, name: obj.name, arguments: obj.arguments as Record<string, unknown> };
    } catch {
      return null;
    }
  }
}
