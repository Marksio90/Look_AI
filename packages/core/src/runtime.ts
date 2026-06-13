import type { ToolRegistry } from "@lookai/tools";
import type { Message, ToolCall, LLMResponse, ToolResult } from "@lookai/shared";
import type { DualModelRouter } from "@lookai/llm";
import type { PermissionEngine } from "@lookai/security";
import type { PromptAssembler } from "@lookai/context";
import type { MemoryStore } from "@lookai/memory";
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
  private mode: SessionMode;
  private router: DualModelRouter;
  private registry: ToolRegistry;
  private config: RuntimeConfig;
  private messages: Message[] = [];
  private tracker: UsageTracker = { totalTokens: 0, totalPromptTokens: 0, totalCompletionTokens: 0, turns: 0 };
  private readFiles = new Set<string>();
  private permissionEngine?: PermissionEngine;
  private promptAssembler?: PromptAssembler;
  private memoryStore?: MemoryStore;

  constructor(
    router: DualModelRouter,
    registry: ToolRegistry,
    config: RuntimeConfig,
    deps?: { permissionEngine?: PermissionEngine; promptAssembler?: PromptAssembler; memoryStore?: MemoryStore; mode?: SessionMode }
  ) {
    this.router = router;
    this.registry = registry;
    this.config = { ...config, maxTurns: config.maxTurns ?? 25 };
    this.permissionEngine = deps?.permissionEngine;
    this.promptAssembler = deps?.promptAssembler;
    this.memoryStore = deps?.memoryStore;
    this.mode = deps?.mode ?? "coding" as SessionMode;
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

    // Load previous session if --resume
    if (this.memoryStore) {
      const latest = this.memoryStore.getLatestSessionId();
      if (latest && this.memoryStore.loadSession(latest)) {
        const prev = this.memoryStore.loadSession(latest)!;
        this.messages = [...prev, ...this.messages];
      }
    }

    for (let turn = 0; turn < this.config.maxTurns; turn++) {
      this.tracker.turns = turn + 1;

      // Auto-compaction
      if (this.promptAssembler) {
        const budget = this.promptAssembler.estimateBudget(this.messages);
        if (this.promptAssembler.shouldCompact(budget)) {
          this.messages = this.promptAssembler.compact(this.messages);
          await onTurn?.({ type: "text", text: "[Context compacted]", usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 } });
        }
      }

      // Determine model: planning turns (first and every 5th) -> Brain; else Worker
      const isPlanningTurn = turn === 0 || turn % 5 === 0;
      const mode = isPlanningTurn ? "brain" : "worker";

      const response = await this.router.create(this.messages, this.registry.toolDefs(), { mode });
      this.tracker.totalPromptTokens += response.usage.promptTokens;
      this.tracker.totalCompletionTokens += response.usage.completionTokens;
      this.tracker.totalTokens += response.usage.totalTokens;

      this.messages.push(makeAssistantMessage(response));

      if (response.text) {
        await onTurn?.({ type: "text", text: response.text, usage: response.usage, model: response.model });
      }

      // Fallback: parse JSON tool call from text for local models
      if (response.text && (response.stopReason === "end_turn" || response.stopReason === "tool_use")) {
        const parsed = this.tryParseToolCall(response.text);
        if (parsed) {
          await onTurn?.({ type: "tool_call", toolCall: parsed, usage: response.usage, model: response.model });
          const result = await this.executeTool(parsed, onTurn);
          await onTurn?.({ type: "tool_result", toolResult: { ...result, toolCallId: parsed.id, toolName: parsed.name }, usage: response.usage, model: response.model });
          this.messages.push(makeToolResultMessage(parsed, result));
          continue;
        }
      }

      if (response.stopReason === "end_turn") {
        await onTurn?.({ type: "done", usage: response.usage, model: response.model });
        this.saveSession();
        return { done: true, reason: "end_turn" };
      }

      if (response.stopReason === "max_tokens") {
        await onTurn?.({ type: "error", error: "max_tokens reached", usage: response.usage, model: response.model });
        return { done: false, reason: "max_tokens" };
      }

      if (response.stopReason === "error") {
        await onTurn?.({ type: "error", error: "LLM error", usage: response.usage, model: response.model });
        return { done: false, reason: "llm_error" };
      }

      if (response.stopReason === "tool_use") {
        if (response.toolCalls.length === 0) {
          await onTurn?.({ type: "error", error: "stopReason=tool_use but no tool calls", usage: response.usage, model: response.model });
          this.router.recordToolUseBad();
          return { done: false, reason: "empty_tool_calls" };
        }
        // Only one tool per turn
        const tc = response.toolCalls[0];
        await onTurn?.({ type: "tool_call", toolCall: tc, usage: response.usage, model: response.model });

        const result = await this.executeTool(tc, onTurn);
        await onTurn?.({ type: "tool_result", toolResult: { ...result, toolCallId: tc.id, toolName: tc.name }, usage: response.usage, model: response.model });
        this.messages.push(makeToolResultMessage(tc, result));

        if (result.ok) {
          this.router.recordToolUseOk();
        } else {
          this.router.recordToolUseBad();
        }

        // Escalation: 2 bad tool uses -> switch to Brain for next turn
        if (this.router.shouldEscalate()) {
          await onTurn?.({ type: "text", text: "[Escalating to Brain model due to repeated tool errors]", usage: response.usage, model: response.model });
          this.router.resetEscalation();
        }

        continue;
      }
    }

    await onTurn?.({ type: "error", error: `maxTurns (${this.config.maxTurns}) reached` });
    return { done: false, reason: "max_turns" };
  }

  private async executeTool(tc: ToolCall, onTurn?: TurnHandler): Promise<ToolResult> {
    // Permission check
    if (this.permissionEngine) {
      const decision = this.permissionEngine.check(tc.name, tc.arguments);
      if (!decision.allowed) {
        if (decision.request && onTurn) {
          await onTurn({ type: "permission_request", request: decision.request });
        }
        return { ok: false, error: decision.reason ?? `Permission denied for ${tc.name}` };
      }
    }

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

  private saveSession(): void {
    if (this.memoryStore) {
      this.memoryStore.saveSession(this.messages);
    }
  }

  private tryParseToolCall(text: string): ToolCall | null {
    let trimmed = text.trim();
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
