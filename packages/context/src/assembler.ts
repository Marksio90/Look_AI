import type { Message, ToolDef } from "@lookai/shared";

export interface PromptAssemblerConfig {
  systemPrompt?: string;
  lookaiMd?: string;
  maxContextTokens: number;
  preserveLastNTurns: number;
}

export interface ContextBudget {
  totalTokens: number;
  maxTokens: number;
  percentage: number;
  messageCount: number;
}

export class PromptAssembler {
  private config: PromptAssemblerConfig;

  constructor(config: PromptAssemblerConfig) {
    this.config = { ...config, preserveLastNTurns: config.preserveLastNTurns ?? 4 };
  }

  assemble(messages: Message[], tools: ToolDef[], userPrompt: string): Message[] {
    const systemParts: string[] = [];
    if (this.config.systemPrompt) {
      systemParts.push(this.config.systemPrompt);
    }
    if (this.config.lookaiMd) {
      systemParts.push(this.config.lookaiMd);
    }

    const systemMessage: Message = systemParts.length > 0
      ? { role: "system", content: systemParts.join("\n\n") }
      : { role: "system", content: "" };

    const userMessage: Message = { role: "user", content: userPrompt };

    return [systemMessage, ...messages, userMessage];
  }

  estimateBudget(messages: Message[]): ContextBudget {
    // Rough estimate: 4 chars ≈ 1 token
    const totalChars = messages.reduce((sum, m) => sum + (m.content ?? "").length, 0);
    const totalTokens = Math.ceil(totalChars / 4);
    return {
      totalTokens,
      maxTokens: this.config.maxContextTokens,
      percentage: Math.min(100, Math.round((totalTokens / this.config.maxContextTokens) * 100)),
      messageCount: messages.length,
    };
  }

  shouldCompact(budget: ContextBudget): boolean {
    return budget.percentage >= 70;
  }

  compact(messages: Message[]): Message[] {
    // Keep system, LOOKAI.md injections, and last N turns verbatim
    // Summarize middle messages
    const preserve = this.config.preserveLastNTurns;
    if (messages.length <= preserve + 1) return messages;

    const systemMessages = messages.filter((m) => m.role === "system");
    const nonSystem = messages.filter((m) => m.role !== "system");

    const head = nonSystem.slice(0, -preserve);
    const tail = nonSystem.slice(-preserve);

    // Summarize head: keep tool calls and their results as compact markers
    const summaryLines: string[] = [];
    for (const m of head) {
      if (m.role === "assistant" && m.toolCalls && m.toolCalls.length > 0) {
        for (const tc of m.toolCalls) {
          summaryLines.push(`[Tool call: ${tc.name}]`);
        }
      } else if (m.role === "tool") {
        summaryLines.push(`[Tool result: ${m.toolName}]`);
      } else if (m.role === "user") {
        summaryLines.push(`[User prompt]`);
      } else if (m.role === "assistant") {
        summaryLines.push(`[Assistant response: ${(m.content ?? "").slice(0, 80)}...]`);
      }
    }

    const summary: Message = {
      role: "system",
      content: `--- Session summary (compacted) ---\n${summaryLines.join("\n")}`,
    };

    return [...systemMessages, summary, ...tail];
  }
}
