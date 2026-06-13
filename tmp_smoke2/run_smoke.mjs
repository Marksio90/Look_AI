import { OllamaClient, DualModelRouter } from "../packages/llm/dist/index.js";
import { ToolRegistry, ReadTool, WriteTool, EditTool, BashToolFactory, BashSession, GlobTool, GrepTool } from "../packages/tools/dist/index.js";
import { AgentRuntime } from "../packages/core/dist/index.js";
import { PermissionEngine, PermissionMode } from "../packages/security/dist/index.js";
import { PromptAssembler } from "../packages/context/dist/index.js";
import { MemoryStore } from "../packages/memory/dist/index.js";

const SYSTEM_PROMPT = `You are LookAI, a local coding assistant. You have access to tools:
- read(path, offset?) — read a file with line numbers.
- write(path, content) — create or overwrite a file.
- edit(path, old_str, new_str, replace_all?) — replace old_str with new_str. You MUST read the file first.
- bash(command) — run a bash command in a persistent session.
- glob(pattern, cwd?) — find files matching a pattern.
- grep(pattern, path?, include?) — search file contents for a regex pattern.

Rules:
1. One tool per turn.
2. Always read a file before editing it.
3. Prefer small, precise edits.
4. After editing, run tests or typecheck if needed.
5. When done, respond with end_turn (no more tools).

IMPORTANT: When you want to call a tool, output ONLY a JSON object like:
{"name":"read","arguments":{"path":"tmp_smoke2/fetch.ts"}}
Do not add markdown or explanation. Only the JSON.`;

async function main() {
  const baseUrl = process.env.LOOKAI_OLLAMA_URL ?? "http://localhost:11434/v1";
  const model = process.env.LOOKAI_MODEL ?? "qwen2.5-coder:3b";
  const worker = new OllamaClient({ baseUrl, defaultModel: model, defaultTemperature: 0.1 });
  const router = new DualModelRouter(worker, worker, { workerModel: model, brainModel: model });

  const registry = new ToolRegistry();
  registry.register(ReadTool);
  registry.register(WriteTool);
  registry.register(EditTool);
  registry.register(GlobTool);
  registry.register(GrepTool);
  const bashSession = new BashSession(process.cwd() + "/tmp_smoke2");
  registry.register(BashToolFactory(bashSession));

  const permissionEngine = new PermissionEngine(PermissionMode.Auto, process.cwd());
  const promptAssembler = new PromptAssembler({ systemPrompt: SYSTEM_PROMPT, maxContextTokens: 8192, preserveLastNTurns: 4 });
  const memoryStore = new MemoryStore(join(process.cwd(), ".lookai"));

  const runtime = new AgentRuntime(router, registry, { maxTurns: 15, systemPrompt: SYSTEM_PROMPT }, {
    permissionEngine,
    promptAssembler,
    memoryStore,
  });

  const prompt = `In tmp_smoke2/fetch.ts there is a function fetchData. Wrap the fetch call in a retry loop with exponential backoff (max 3 retries, delay 100ms * 2^attempt). Do NOT change the public API (function signature must stay the same). Add a test in fetch.test.ts that mocks a failing fetch then success. Run tests with npx vitest run fetch.test.ts. Report turns and tokens.`;

  console.log("=== LookAI Phase 1 Smoke Test ===");
  console.log("Model:", model, "@", baseUrl);
  console.log("");

  const result = await runtime.run(prompt, (event) => {
    if (event.type === "text") {
      console.log(`[${event.model ?? "?"}]`, event.text);
    } else if (event.type === "tool_call") {
      console.log(`[Tool call] ${event.toolCall.name} ${JSON.stringify(event.toolCall.arguments)}`);
    } else if (event.type === "tool_result") {
      const ok = event.toolResult?.ok ? "OK" : "ERR";
      console.log(`[Tool result] ${ok} ${event.toolResult?.content ?? event.toolResult?.error ?? ""}`);
    } else if (event.type === "error") {
      console.log(`[Error] ${event.error}`);
    } else if (event.type === "done") {
      console.log("[Done]");
    }
  });

  const usage = runtime.getUsage();
  console.log("\n=== Result ===");
  console.log("Done:", result.done, "Reason:", result.reason);
  console.log("Turns:", usage.turns);
  console.log("Tokens:", usage.totalTokens, "(prompt:", usage.totalPromptTokens, "completion:", usage.totalCompletionTokens, ")");

  // Check session saved
  const sessions = memoryStore.listSessions();
  console.log("Sessions saved:", sessions.length);
  if (sessions.length > 0) {
    const loaded = memoryStore.loadSession(sessions[0].id);
    console.log("Loaded session messages:", loaded?.length ?? 0);
  }
}

import { join } from "node:path";
main().catch((e) => { console.error(e); process.exit(1); });
