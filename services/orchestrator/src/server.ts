import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import type { AgentRuntime, TurnEvent } from "@lookai/core";

export interface OrchestratorConfig {
  port?: number;
  wsPort?: number;
  maxSessions?: number;
  brainModel?: string;
  runtimeFactory?: () => AgentRuntime;
}

type Role = "user" | "assistant" | "system" | "tool";

interface ClientToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
  result?: string;
}

/** Message shape consumed by apps/web (see apps/web/src/types). */
interface ClientMessage {
  id: string;
  role: Role;
  content: string;
  model?: "brain" | "worker";
  timestamp: number;
  toolCalls?: ClientToolCall[];
  status?: "pending" | "done" | "error";
}

interface ClientSession {
  id: string;
  title: string;
  messages: ClientMessage[];
  createdAt: number;
  updatedAt: number;
}

export interface Session {
  id: string;
  title: string;
  runtime?: AgentRuntime;
  messages: ClientMessage[];
  status: "idle" | "running" | "error";
  createdAt: number;
  updatedAt: number;
}

let idCounter = 0;
function uid(prefix: string): string {
  idCounter += 1;
  return `${prefix}_${Date.now()}_${idCounter}`;
}

export class Orchestrator {
  private sessions = new Map<string, Session>();
  private clients = new Set<WebSocket>();
  private currentSessionId: string | null = null;
  private config: Required<Pick<OrchestratorConfig, "port" | "wsPort" | "maxSessions">> & {
    brainModel?: string;
    runtimeFactory?: () => AgentRuntime;
  };
  private httpServer?: ReturnType<typeof createServer>;
  private wsServer?: WebSocketServer;

  constructor(config: OrchestratorConfig = {}) {
    this.config = {
      port: config.port ?? 3000,
      wsPort: config.wsPort ?? 3001,
      maxSessions: config.maxSessions ?? 10,
      brainModel: config.brainModel,
      runtimeFactory: config.runtimeFactory,
    };
  }

  async start(): Promise<void> {
    this.httpServer = createServer((req, res) => this.handleHttp(req, res));
    this.httpServer.listen(this.config.port);

    this.wsServer = new WebSocketServer({ port: this.config.wsPort });
    this.wsServer.on("connection", (ws: WebSocket) => {
      this.clients.add(ws);
      const session = this.ensureSession();
      this.sendTo(ws, { type: "session_list", payload: this.listSessions() });
      this.sendTo(ws, { type: "status", payload: this.statusPayload(session) });
      for (const m of session.messages) {
        this.sendTo(ws, { type: "message", payload: m });
      }

      ws.on("message", (raw) => {
        void this.onClientMessage(raw.toString());
      });
      ws.on("close", () => this.clients.delete(ws));
      ws.on("error", () => this.clients.delete(ws));
    });
  }

  async stop(): Promise<void> {
    this.wsServer?.close();
    this.httpServer?.close();
    for (const ws of this.clients) ws.close();
    this.clients.clear();
  }

  /** Public: list sessions in the client-facing shape. */
  listSessions(): ClientSession[] {
    return Array.from(this.sessions.values()).map((s) => this.toClientSession(s));
  }

  private ensureSession(): Session {
    if (this.currentSessionId) {
      const existing = this.sessions.get(this.currentSessionId);
      if (existing) return existing;
    }
    return this.createSession();
  }

  private createSession(): Session {
    // Drop the oldest session if we hit the cap.
    if (this.sessions.size >= this.config.maxSessions) {
      const oldest = this.sessions.keys().next().value;
      if (oldest) this.sessions.delete(oldest);
    }
    const now = Date.now();
    const session: Session = {
      id: uid("session"),
      title: "New session",
      runtime: this.config.runtimeFactory?.(),
      messages: [],
      status: "idle",
      createdAt: now,
      updatedAt: now,
    };
    this.sessions.set(session.id, session);
    this.currentSessionId = session.id;
    return session;
  }

  private async onClientMessage(raw: string): Promise<void> {
    let data: { type?: string; content?: unknown };
    try {
      data = JSON.parse(raw);
    } catch {
      return;
    }
    if (data.type === "message" && typeof data.content === "string") {
      await this.runPrompt(data.content);
    }
  }

  private async runPrompt(content: string): Promise<void> {
    const session = this.ensureSession();

    if (session.status === "running") {
      this.broadcast({ type: "message", payload: this.sysMessage("Agent zajęty — poczekaj na zakończenie tury.", "error") });
      return;
    }
    if (!session.runtime) {
      this.broadcast({ type: "message", payload: this.sysMessage("Brak skonfigurowanego runtime LLM.", "error") });
      return;
    }

    const userMsg: ClientMessage = { id: uid("u"), role: "user", content, timestamp: Date.now() };
    session.messages.push(userMsg);
    if (session.title === "New session") {
      session.title = content.slice(0, 40) + (content.length > 40 ? "…" : "");
    }
    session.status = "running";
    session.updatedAt = Date.now();
    this.broadcast({ type: "message", payload: userMsg });
    this.broadcast({ type: "session_list", payload: this.listSessions() });

    try {
      await session.runtime.run(content, {
        onTurn: async (event: TurnEvent) => {
          const msg = this.eventToClientMessage(event);
          if (msg) {
            session.messages.push(msg);
            this.broadcast({ type: "message", payload: msg });
          }
          this.broadcast({ type: "status", payload: this.statusPayload(session, event) });
        },
      });
      session.status = "idle";
    } catch (err) {
      session.status = "error";
      const message = err instanceof Error ? err.message : String(err);
      const errMsg = this.sysMessage(`Błąd: ${message}`, "error");
      session.messages.push(errMsg);
      this.broadcast({ type: "message", payload: errMsg });
    }

    session.updatedAt = Date.now();
    this.broadcast({ type: "status", payload: this.statusPayload(session) });
    this.broadcast({ type: "session_list", payload: this.listSessions() });
  }

  private eventToClientMessage(event: TurnEvent): ClientMessage | null {
    const id = uid("a");
    const ts = Date.now();
    const model = this.classifyModel(event.model);

    switch (event.type) {
      case "text": {
        const text = event.text ?? "";
        if (!text.trim()) return null;
        return { id, role: "assistant", content: text, model, timestamp: ts };
      }
      case "tool_call":
        return {
          id,
          role: "tool",
          content: `🔧 ${event.toolCall?.name ?? ""}`,
          model,
          timestamp: ts,
          toolCalls: [
            {
              id: event.toolCall?.id ?? id,
              name: event.toolCall?.name ?? "tool",
              args: (event.toolCall?.arguments ?? {}) as Record<string, unknown>,
            },
          ],
        };
      case "tool_result": {
        const ok = event.toolResult?.ok ?? false;
        const text = ok ? (event.toolResult?.content ?? "") : `Error: ${event.toolResult?.error ?? ""}`;
        return { id, role: "tool", content: text, model, timestamp: ts, status: ok ? "done" : "error" };
      }
      case "error":
        return { id, role: "system", content: `Error: ${event.error ?? ""}`, timestamp: ts, status: "error" };
      case "done":
      case "permission_request":
      default:
        return null;
    }
  }

  private classifyModel(model?: string): "brain" | "worker" {
    if (this.config.brainModel && model === this.config.brainModel) return "brain";
    return "worker";
  }

  private statusPayload(session: Session, event?: TurnEvent) {
    const usage = session.runtime?.getUsage();
    return {
      model: this.classifyModel(event?.model),
      contextTokens: usage?.totalTokens ?? 0,
      contextLimit: 4096,
      turnCount: usage?.turns ?? 0,
      mode: "agent" as const,
    };
  }

  private sysMessage(content: string, status?: "done" | "error"): ClientMessage {
    return { id: uid("sys"), role: "system", content, timestamp: Date.now(), status };
  }

  private toClientSession(s: Session): ClientSession {
    return { id: s.id, title: s.title, messages: s.messages, createdAt: s.createdAt, updatedAt: s.updatedAt };
  }

  private broadcast(data: unknown): void {
    const json = JSON.stringify(data);
    for (const ws of this.clients) {
      if (ws.readyState === WebSocket.OPEN) ws.send(json);
    }
  }

  private sendTo(ws: WebSocket, data: unknown): void {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data));
  }

  private handleHttp(req: IncomingMessage, res: ServerResponse): void {
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Access-Control-Allow-Origin", "*");

    const url = new URL(req.url ?? "/", `http://localhost:${this.config.port}`);

    if (url.pathname === "/health" && req.method === "GET") {
      res.writeHead(200);
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    if (url.pathname === "/sessions" && req.method === "GET") {
      res.writeHead(200);
      res.end(JSON.stringify({ sessions: this.listSessions() }));
      return;
    }

    if (url.pathname === "/sessions" && req.method === "POST") {
      const session = this.createSession();
      this.broadcast({ type: "session_list", payload: this.listSessions() });
      res.writeHead(200);
      res.end(JSON.stringify(this.toClientSession(session)));
      return;
    }

    res.writeHead(404);
    res.end(JSON.stringify({ error: "Not found" }));
  }
}
