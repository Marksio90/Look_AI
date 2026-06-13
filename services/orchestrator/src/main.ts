import { Orchestrator } from "./server.js";

const port = Number(process.env.LOOKAI_ORCH_PORT ?? 3000);
const wsPort = Number(process.env.LOOKAI_ORCH_WS_PORT ?? 3001);

async function main(): Promise<void> {
  const orchestrator = new Orchestrator({ port, wsPort });
  await orchestrator.start();
  console.log(`[orchestrator] HTTP API  → http://localhost:${port}`);
  console.log(`[orchestrator] WebSocket → ws://localhost:${wsPort}`);
  console.log("[orchestrator] Ctrl+C aby zatrzymać");
}

main().catch((err) => {
  console.error("[orchestrator] start failed:", err);
  process.exit(1);
});
