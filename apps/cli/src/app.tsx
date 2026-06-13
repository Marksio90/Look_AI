import React, { useState, useEffect, useCallback } from "react";
import { Box, Text, useInput, useApp } from "ink";
import { AgentRuntime } from "@lookai/core";
import { OllamaClient, DualModelRouter } from "@lookai/llm";
import { ToolRegistry, ReadTool, WriteTool, EditTool, BashToolFactory, BashSession, GlobTool, GrepTool } from "@lookai/tools";
import { PermissionEngine, PermissionMode } from "@lookai/security";
import { PromptAssembler } from "@lookai/context";
import { MemoryStore } from "@lookai/memory";
import type { TurnEvent } from "@lookai/core";

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
5. When done, respond with end_turn (no more tools).`;

interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "tool" | "system";
  text: string;
  model?: string;
  toolCall?: { name: string; args: string };
  toolResult?: { ok: boolean; text: string };
  permissionRequest?: unknown;
}

export default function App() {
  const { exit } = useApp();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState("Worker ready | Context: 0% | Turns: 0 | $0.00");
  const [showRail, setShowRail] = useState(false);
  const [running, setRunning] = useState(false);

  const baseUrl = process.env.LOOKAI_OLLAMA_URL ?? "http://localhost:11434/v1";
  const workerModel = process.env.LOOKAI_WORKER_MODEL ?? "qwen2.5-coder:7b";
  const brainModel = process.env.LOOKAI_BRAIN_MODEL ?? "qwen3.6-35b-a3b";

  const worker = new OllamaClient({ baseUrl, defaultModel: workerModel, defaultTemperature: 0.1 });
  const brain = new OllamaClient({ baseUrl, defaultModel: brainModel, defaultTemperature: 0.2 });
  const router = new DualModelRouter(worker, brain, { workerModel, brainModel });

  const registry = new ToolRegistry();
  registry.register(ReadTool);
  registry.register(WriteTool);
  registry.register(EditTool);
  registry.register(GlobTool);
  registry.register(GrepTool);
  const bashSession = new BashSession(process.cwd());
  registry.register(BashToolFactory(bashSession));

  const permissionEngine = new PermissionEngine(PermissionMode.Default, process.cwd());
  const promptAssembler = new PromptAssembler({ systemPrompt: SYSTEM_PROMPT, maxContextTokens: 8192, preserveLastNTurns: 4 });
  const memoryStore = new MemoryStore();

  const runtime = new AgentRuntime(router, registry, { maxTurns: 25, systemPrompt: SYSTEM_PROMPT }, {
    permissionEngine,
    promptAssembler,
    memoryStore,
  });

  const addMessage = useCallback((msg: ChatMessage) => {
    setMessages((prev) => [...prev, msg]);
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!input.trim() || running) return;
    const userText = input.trim();
    setInput("");
    setRunning(true);
    addMessage({ id: `u-${Date.now()}`, role: "user", text: userText });

    await runtime.run(userText, async (event: TurnEvent) => {
      const id = `a-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
      if (event.type === "text") {
        addMessage({ id, role: "assistant", text: event.text ?? "", model: event.model });
      } else if (event.type === "tool_call") {
        addMessage({ id, role: "tool", text: ``, toolCall: { name: event.toolCall?.name ?? "", args: JSON.stringify(event.toolCall?.arguments ?? {}) }, model: event.model });
      } else if (event.type === "tool_result") {
        const ok = event.toolResult?.ok ?? false;
        addMessage({ id, role: "tool", text: ok ? (event.toolResult?.content ?? "") : `Error: ${event.toolResult?.error ?? ""}`, toolResult: { ok, text: ok ? (event.toolResult?.content ?? "") : `Error: ${event.toolResult?.error ?? ""}` }, model: event.model });
      } else if (event.type === "error") {
        addMessage({ id, role: "system", text: `Error: ${event.error}` });
      } else if (event.type === "done") {
        addMessage({ id, role: "system", text: "[Done]" });
      }

      const usage = runtime.getUsage();
      const modelLabel = event.model ?? "worker";
      setStatus(`${modelLabel === brainModel ? "Brain" : "Worker"} | Context: ${usage.totalTokens} tokens | Turns: ${usage.turns} | $0.00`);
    });

    setRunning(false);
  }, [input, running, addMessage, runtime, brainModel]);

  useInput((input, key) => {
    if (key.return) {
      handleSubmit();
    } else if (key.escape) {
      setShowRail((s) => !s);
    } else if (key.ctrl) {
      exit();
    } else if (input) {
      setInput((prev) => prev + input);
    } else if (key.backspace || key.delete) {
      setInput((prev) => prev.slice(0, -1));
    }
  });

  return (
    <Box flexDirection="column" height="100%">
      <Box flexDirection="row" flexGrow={1}>
        {showRail && (
          <Box width={20} borderStyle="single" padding={1} flexDirection="column">
            <Text bold color="terrakota">LookAI</Text>
            <Text dimColor>Sessions</Text>
            <Text dimColor>Files</Text>
            <Text dimColor>Settings</Text>
          </Box>
        )}
        <Box flexDirection="column" flexGrow={1} padding={1}>
          {messages.map((m) => (
            <Box key={m.id} marginBottom={1} flexDirection="column">
              {m.role === "user" && <Text color="blue">{'>'} {m.text}</Text>}
              {m.role === "assistant" && (
                <Text color={m.model?.includes("brain") ? "red" : "green"}>
                  {m.model?.includes("brain") ? "🧠" : "⚙️"} {m.text}
                </Text>
              )}
              {m.role === "tool" && m.toolCall && (
                <Text dimColor>🔧 {m.toolCall.name} {m.toolCall.args}</Text>
              )}
              {m.role === "tool" && m.toolResult && (
                <Text dimColor>{m.toolResult.ok ? "✓" : "✗"} {m.toolResult.text.slice(0, 200)}</Text>
              )}
              {m.role === "system" && <Text dimColor>{m.text}</Text>}
            </Box>
          ))}
        </Box>
      </Box>
      <Box borderStyle="single" padding={1}>
        <Text>{'>'} {input}</Text>
      </Box>
      <Box paddingX={1}>
        <Text dimColor>{status}</Text>
      </Box>
    </Box>
  );
}
