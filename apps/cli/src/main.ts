import { createInterface } from "node:readline";
import { stdin, stdout } from "node:process";
import { OllamaClient } from "@lookai/llm";
import { ToolRegistry, ReadTool, WriteTool, EditTool, BashToolFactory, BashSession } from "@lookai/tools";
import { AgentRuntime } from "@lookai/core";

const SYSTEM_PROMPT = `You are LookAI, a local coding assistant. You have access to tools:
- read(path, offset?) — read a file with line numbers. For large files use offset.
- write(path, content) — create or overwrite a file.
- edit(path, old_str, new_str) — replace old_str with new_str. You MUST read the file first.
- bash(command) — run a bash command in a persistent session.

Rules:
1. One tool per turn.
2. Always read a file before editing it.
3. Prefer small, precise edits.
4. After editing, run tests or typecheck if needed.
5. When done, respond with end_turn (no more tools).`;

async function main() {
  const baseUrl = process.env.LOOKAI_OLLAMA_URL ?? "http://localhost:11434/v1";
  const model = process.env.LOOKAI_MODEL ?? "qwen2.5-coder:7b";
  const llm = new OllamaClient({ baseUrl, defaultModel: model, defaultTemperature: 0.1 });

  const registry = new ToolRegistry();
  registry.register(ReadTool);
  registry.register(WriteTool);
  registry.register(EditTool);

  const bashSession = new BashSession(process.cwd());
  registry.register(BashToolFactory(bashSession));

  const runtime = new AgentRuntime(llm, registry, { maxTurns: 25, systemPrompt: SYSTEM_PROMPT });

  const rl = createInterface({ input: stdin, output: stdout, prompt: "LookAI> " });

  console.log("LookAI CLI — Phase 0 (REPL)");
  console.log(`Model: ${model} @ ${baseUrl}`);
  console.log("Type your prompt. Empty line to quit.\n");

  let buffer = "";
  let active = false;

  rl.on("line", async (line) => {
    if (active) return;
    if (line.trim() === "" && buffer === "") {
      rl.close();
      return;
    }
    if (line.trim() === "" && buffer !== "") {
      active = true;
      const prompt = buffer.trim();
      buffer = "";
      console.log("\n[Agent running...]\n");
      const result = await runtime.run(prompt, (event) => {
        if (event.type === "text") {
          process.stdout.write(event.text ?? "");
        } else if (event.type === "tool_call") {
          console.log(`\n[Tool call: ${event.toolCall?.name}] ${JSON.stringify(event.toolCall?.arguments)}`);
        } else if (event.type === "tool_result") {
          const ok = event.toolResult?.ok ? "OK" : "ERR";
          console.log(`\n[Tool result: ${ok}] ${event.toolResult?.content ?? event.toolResult?.error ?? ""}`);
        } else if (event.type === "error") {
          console.log(`\n[Error] ${event.error}`);
        } else if (event.type === "done") {
          console.log("\n[Done]");
        }
      });
      const usage = runtime.getUsage();
      console.log(`\n[Result: ${result.reason}] Turns: ${usage.turns}, Tokens: ${usage.totalTokens}`);
      active = false;
      rl.prompt();
      return;
    }
    buffer += (buffer ? "\n" : "") + line;
  });

  rl.prompt();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
