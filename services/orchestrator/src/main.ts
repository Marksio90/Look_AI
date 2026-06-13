import { AgentRuntime, CODING_SYSTEM_PROMPT } from "@lookai/core";
import { OllamaClient, DualModelRouter } from "@lookai/llm";
import { ToolRegistry, ReadTool, WriteTool, EditTool, BashToolFactory, BashSession, GlobTool, GrepTool, IngestTool } from "@lookai/tools";
import { PermissionEngine, PermissionMode } from "@lookai/security";
import { PromptAssembler } from "@lookai/context";
import { MemoryStore } from "@lookai/memory";
import { SearxngAdapter, WebSearchTool, WebFetchTool } from "@lookai/web";
import { Orchestrator } from "./server.js";

const port = Number(process.env.LOOKAI_ORCH_PORT ?? 3000);
const wsPort = Number(process.env.LOOKAI_ORCH_WS_PORT ?? 3001);
const baseUrl = process.env.LOOKAI_OLLAMA_URL ?? "http://localhost:11434/v1";
const workerModel = process.env.LOOKAI_WORKER_MODEL ?? "qwen2.5-coder:7b";
const brainModel = process.env.LOOKAI_BRAIN_MODEL ?? "qwen3:30b-a3b";

/**
 * Build a fresh agent runtime per session. Mirrors the CLI wiring (apps/cli),
 * but runs headless with PermissionMode.Auto — there is no UI to approve
 * tool use, so the server must be allowed to act autonomously.
 */
function createRuntime(): AgentRuntime {
  const worker = new OllamaClient({ baseUrl, defaultModel: workerModel, defaultTemperature: 0.1 });
  const brain = new OllamaClient({ baseUrl, defaultModel: brainModel, defaultTemperature: 0.2 });
  const router = new DualModelRouter(worker, brain, { workerModel, brainModel });

  const registry = new ToolRegistry();
  registry.register(ReadTool);
  registry.register(WriteTool);
  registry.register(EditTool);
  registry.register(GlobTool);
  registry.register(GrepTool);
  registry.register(BashToolFactory(new BashSession(process.cwd())));
  registry.register(IngestTool);
  registry.register(WebSearchTool(new SearxngAdapter(process.env.LOOKAI_SEARXNG_URL ?? "http://localhost:8080")));
  registry.register(WebFetchTool);

  const permissionEngine = new PermissionEngine(PermissionMode.Auto, process.cwd());
  const promptAssembler = new PromptAssembler({ systemPrompt: CODING_SYSTEM_PROMPT, maxContextTokens: 8192, preserveLastNTurns: 4 });
  const memoryStore = new MemoryStore();

  return new AgentRuntime(
    router,
    registry,
    { maxTurns: 25, systemPrompt: CODING_SYSTEM_PROMPT, mode: "coding" },
    { permissionEngine, promptAssembler, memoryStore, mode: "coding" },
  );
}

async function main(): Promise<void> {
  const orchestrator = new Orchestrator({ port, wsPort, brainModel, runtimeFactory: createRuntime });
  await orchestrator.start();
  console.log(`[orchestrator] HTTP API  → http://localhost:${port}`);
  console.log(`[orchestrator] WebSocket → ws://localhost:${wsPort}`);
  console.log(`[orchestrator] Worker: ${workerModel} | Brain: ${brainModel} | Ollama: ${baseUrl}`);
  console.log("[orchestrator] Ctrl+C aby zatrzymać");
}

main().catch((err) => {
  console.error("[orchestrator] start failed:", err);
  process.exit(1);
});
