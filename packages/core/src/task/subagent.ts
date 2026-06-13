import { AgentRuntime } from "../runtime.js";
import type { DualModelRouter } from "@lookai/llm";
import { ToolRegistry, ReadTool, GlobTool, GrepTool, BashToolFactory, BashSession } from "@lookai/tools";
import { PermissionEngine, PermissionMode } from "@lookai/security";
import { PromptAssembler } from "@lookai/context";
import type { Message } from "@lookai/shared";

export type SubagentType = "explore" | "plan" | "general";

export interface SubagentConfig {
  type: SubagentType;
  userPrompt: string;
  maxTurns?: number;
  systemPrompt?: string;
}

export interface SubagentResult {
  ok: boolean;
  summary: string;
  tokenUsage: number;
  error?: string;
}

/**
 * Run an isolated subagent with its own message history.
 * No nesting: subagent cannot spawn another subagent.
 * Returns only a summary to the parent thread.
 */
export async function runSubagent(
  router: DualModelRouter,
  config: SubagentConfig
): Promise<SubagentResult> {
  // Build minimal registry (no write/edit — read-only exploration)
  const registry = new ToolRegistry();
  registry.register(ReadTool);
  registry.register(GlobTool);
  registry.register(GrepTool);
  const bashSession = new BashSession(process.cwd());
  registry.register(BashToolFactory(bashSession));

  const permissionEngine = new PermissionEngine(PermissionMode.Default, process.cwd());

  // Auto-compaction at 95% for subagents (tighter than main 70%)
  const promptAssembler = new PromptAssembler({
    systemPrompt: config.systemPrompt ?? subagentSystemPrompt(config.type),
    maxContextTokens: 4096, // smaller context for subagent
    preserveLastNTurns: 2,
  });

  const runtime = new AgentRuntime(router, registry, {
    maxTurns: config.maxTurns ?? 10,
    systemPrompt: config.systemPrompt ?? subagentSystemPrompt(config.type),
  }, {
    permissionEngine,
    promptAssembler,
  });

  const messages: Message[] = [];
  let tokenUsage = 0;

  try {
    await runtime.run(config.userPrompt, { onTurn: async (event: { type: string; text?: string; usage?: { totalTokens: number } }) => {
      if (event.type === "text" && event.text) {
        messages.push({ role: "assistant", content: event.text });
      }
      if (event.usage) {
        tokenUsage += event.usage.totalTokens;
      }
    }});

    // Summarize: concatenate assistant messages
    const summary = messages
      .filter((m) => m.role === "assistant")
      .map((m) => m.content)
      .filter(Boolean)
      .join("\n\n")
      .slice(0, 4000);

    return { ok: true, summary: summary || "(no output)", tokenUsage };
  } catch (e) {
    return {
      ok: false,
      summary: "",
      tokenUsage,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

function subagentSystemPrompt(type: SubagentType): string {
  switch (type) {
    case "explore":
      return `You are an exploration subagent. Your job is to map the codebase.
Use read, glob, and grep to understand the structure.
Return a concise summary of: key files, architecture, and any issues found.
Do NOT write or edit files. One tool per turn.`;
    case "plan":
      return `You are a planning subagent. Analyze the task and produce a step-by-step plan.
Use read and grep to understand relevant code.
Return a concise plan with estimated steps and risks.
Do NOT write or edit files. One tool per turn.`;
    case "general":
      return `You are a research subagent. Investigate the user's question.
Use read, glob, grep, and bash (harmless only) to gather information.
Return a concise summary with findings.
Do NOT write or edit files. One tool per turn.`;
  }
}
