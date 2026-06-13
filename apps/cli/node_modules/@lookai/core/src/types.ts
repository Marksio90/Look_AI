import type { ToolCall, Usage, ToolResult } from "@lookai/shared";

export interface RuntimeConfig {
  maxTurns: number;
  systemPrompt?: string;
}

export interface UsageTracker {
  totalTokens: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  turns: number;
}

export interface TurnEvent {
  type: "text" | "tool_call" | "tool_result" | "error" | "done";
  text?: string;
  toolCall?: ToolCall;
  toolResult?: ToolResult & { toolCallId: string; toolName: string };
  error?: string;
  usage?: Usage;
}

export type TurnHandler = (// eslint-disable-next-line no-unused-vars
event: TurnEvent) => void | Promise<void>;
