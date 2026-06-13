import React, { useState, useEffect, useCallback } from "react";
import { Box, Text, useInput, useApp } from "ink";
import { AgentRuntime } from "@lookai/core";
import { OllamaClient, DualModelRouter } from "@lookai/llm";
import { ToolRegistry, ReadTool, WriteTool, EditTool, BashToolFactory, BashSession, GlobTool, GrepTool, IngestTool } from "@lookai/tools";
import { PermissionEngine, PermissionMode } from "@lookai/security";
import { PromptAssembler } from "@lookai/context";
import { MemoryStore } from "@lookai/memory";
import { SearxngAdapter, WebSearchTool, WebFetchTool } from "@lookai/web";
import type { TurnEvent, SessionMode } from "@lookai/core";
import { MemoryToolFactory } from "./memory-tool.js";

const CODING_SYSTEM_PROMPT = `You are LookAI, a local coding assistant. You have access to tools:
- read(path, offset?) — read a file with line numbers.
- write(path, content) — create or overwrite a file.
- edit(path, old_str, new_str, replace_all?) — replace old_str with new_str. You MUST read the file first.
- bash(command) — run a bash command in a persistent session.
- glob(pattern, cwd?) — find files matching a pattern.
- grep(pattern, path?, include?) — search file contents for a regex pattern.
- ingest(path) — ingest a file (.txt, .md, .json, .csv, .tsv) into context. CSV converts to markdown table.
- web_search(query, limit?) — search the web for information.
- web_fetch(url) — fetch a webpage and extract content as markdown.
- memory(action, key?, content?, query?) — save/load/search conversation memory (opt-in).

Rules:
1. One tool per turn.
2. Always read a file before editing it.
3. Prefer small, precise edits.
4. After editing, run tests or typecheck if needed.
5. When done, respond with end_turn (no more tools).`;

const ASSISTANT_SYSTEM_PROMPT = `You are LookAI, a helpful local assistant. You can help with research, answering questions, and general tasks. You have access to tools:
- read(path, offset?) — read a file with line numbers (for local files only).
- web_search(query, limit?) — search the web for information.
- web_fetch(url) — fetch a webpage and extract content as markdown.
- bash(command) — run a bash command (use sparingly, only for harmless queries).
- memory(action, key?, content?, query?) — save/load/search conversation memory (opt-in).

Rules:
1. One tool per turn.
2. Do NOT modify files in the workspace.
3. Use web_search and web_fetch for research and fact-checking.
4. Be concise and helpful.`;

interface AppProps {
  memoryEnabled?: boolean;
  resumeMode?: boolean;
  continueMode?: boolean;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "tool" | "system";
  text: string;
  model?: string;
  toolCall?: { name: string; args: string };
  toolResult?: { ok: boolean; text: string };
  permissionRequest?: unknown;
}

export default function App({ memoryEnabled = false, resumeMode = false, continueMode = false }: AppProps) {
  const { exit } = useApp();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState("Worker ready | Context: 0% | Turns: 0 | $0.00");
  const [showRail, setShowRail] = useState(false);
  const [running, setRunning] = useState(false);
  const [memoryOn, setMemoryOn] = useState(memoryEnabled);
  const [mode, setMode] = useState<SessionMode>("coding");
  const [resumeOn, setResumeOn] = useState(resumeMode);
  const [showSessionSelect, setShowSessionSelect] = useState(continueMode);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [sessionList, setSessionList] = useState<Array<{ id: string; updatedAt: number; messageCount: number }>>([]);

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
  registry.register(IngestTool);

  // Web tools
  const searchAdapter = new SearxngAdapter(process.env.LOOKAI_SEARXNG_URL ?? "http://localhost:8080");
  registry.register(WebSearchTool(searchAdapter));
  registry.register(WebFetchTool);

  const permissionEngine = new PermissionEngine(PermissionMode.Default, process.cwd());
  const promptAssembler = new PromptAssembler({ systemPrompt: CODING_SYSTEM_PROMPT, maxContextTokens: 8192, preserveLastNTurns: 4 });
  const memoryStore = new MemoryStore();

  // Memory tool (opt-in)
  if (memoryOn) {
    registry.register(MemoryToolFactory(memoryStore));
  }

  useEffect(() => {
    if (continueMode) {
      setSessionList(memoryStore.listSessions());
    }
  }, [continueMode]);

  const systemPrompt = mode === "assistant" ? ASSISTANT_SYSTEM_PROMPT : CODING_SYSTEM_PROMPT;
  const runtime = new AgentRuntime(router, registry, { maxTurns: 25, systemPrompt, mode }, {
    permissionEngine,
    promptAssembler,
    memoryStore,
    mode,
  });

  const addMessage = useCallback((msg: ChatMessage) => {
    setMessages((prev) => [...prev, msg]);
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!input.trim() || running) return;
    const userText = input.trim();
    setInput("");

    // Slash commands
    if (userText === "/context") {
      const budget = runtime.getContextBudget();
      if (budget) {
        addMessage({ id: `sys-${Date.now()}`, role: "system", text: `Context: ${budget.tokens} tokens (${budget.percentage.toFixed(1)}%). ${budget.shouldCompact ? "Compaction recommended." : "Within budget."}` });
      } else {
        addMessage({ id: `sys-${Date.now()}`, role: "system", text: "Context tracking not available." });
      }
      return;
    }
    if (userText === "/compact") {
      const didCompact = runtime.forceCompact();
      addMessage({ id: `sys-${Date.now()}`, role: "system", text: didCompact ? "Context compacted." : "Context within budget, no compaction needed." });
      return;
    }
    if (userText === "/clear") {
      setMessages([]);
      return;
    }

    setRunning(true);
    addMessage({ id: `u-${Date.now()}`, role: "user", text: userText });

    await runtime.run(userText, { resume: resumeOn, sessionId: selectedSessionId ?? undefined, onTurn: async (event: TurnEvent) => {
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
      setStatus(`${mode === "assistant" ? "Assistant" : modelLabel === brainModel ? "Brain" : "Worker"} | Context: ${usage.totalTokens} tokens | Turns: ${usage.turns} | $0.00`);
    }});

    setRunning(false);
  }, [input, running, addMessage, runtime, brainModel, mode]);

  useInput((input, key) => {
    if (showSessionSelect) {
      if (key.escape) {
        setShowSessionSelect(false);
        setSelectedSessionId(null);
      } else if (key.return && selectedSessionId) {
        setShowSessionSelect(false);
        setResumeOn(true);
        // sessionId will be passed via runtime.run on first message
      } else if (input === "j" || input === "J") {
        const idx = sessionList.findIndex((s) => s.id === selectedSessionId);
        const next = sessionList[Math.min(idx + 1, sessionList.length - 1)];
        setSelectedSessionId(next?.id ?? sessionList[0]?.id ?? null);
      } else if (input === "k" || input === "K") {
        const idx = sessionList.findIndex((s) => s.id === selectedSessionId);
        const prev = sessionList[Math.max(idx - 1, 0)];
        setSelectedSessionId(prev?.id ?? sessionList[0]?.id ?? null);
      }
      return;
    }

    if (key.return) {
      handleSubmit();
    } else if (key.escape) {
      setShowRail((s) => !s);
    } else if (key.tab) {
      setMode((m) => (m === "coding" ? "assistant" : "coding"));
    } else if (input === "m" || input === "M") {
      setMemoryOn((m) => !m);
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
      {showSessionSelect ? (
        <Box flexDirection="column" padding={1}>
          <Text bold>Continue previous session:</Text>
          {sessionList.length === 0 && <Text dimColor>No previous sessions found.</Text>}
          {sessionList.map((s) => (
            <Box key={s.id} marginY={1}>
              <Text color={selectedSessionId === s.id ? "green" : "white"}>
                {selectedSessionId === s.id ? "> " : "  "}{s.id} ({s.messageCount} messages, {new Date(s.updatedAt).toLocaleString()})
              </Text>
            </Box>
          ))}
          <Text dimColor>j/k to navigate, Enter to select, Esc for new session</Text>
        </Box>
      ) : (
        <>
          <Box flexDirection="row" paddingX={1}>
            <Text bold color="terrakota">LookAI</Text>
            <Text> </Text>
            <Text color={mode === "assistant" ? "cyan" : "yellow"}>[{mode === "assistant" ? "Assistant" : "Coding"}]</Text>
            <Text> </Text>
            <Text color={memoryOn ? "magenta" : "gray"}>[{memoryOn ? "Mem" : "no-Mem"}]</Text>
            <Text dimColor> Tab=mode M=memory</Text>
          </Box>
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
        </>
      )}
    </Box>
  );
}
