import type { ToolCall, ToolResult, Usage } from "@lookai/shared";

export interface RuntimeConfig {
  maxTurns: number;
  systemPrompt?: string;
  mode?: "assistant" | "coding";
}

export interface UsageTracker {
  totalTokens: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  turns: number;
}

export interface TurnEvent {
  type: "text" | "tool_call" | "tool_result" | "error" | "done" | "permission_request";
  text?: string;
  toolCall?: ToolCall;
  toolResult?: ToolResult & { toolCallId: string; toolName: string };
  request?: unknown;
  error?: string;
  usage?: Usage;
  model?: string;
}

export type TurnHandler = (// eslint-disable-next-line no-unused-vars
event: TurnEvent) => void | Promise<void>;
