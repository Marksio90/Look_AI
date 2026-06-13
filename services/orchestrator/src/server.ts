import { createServer } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import type { AgentRuntime } from "@lookai/core";
import type { TurnEvent } from "@lookai/core";

export interface Session {
  id: string;
  runtime: AgentRuntime;
  messages: Array<{ role: string; text: string; model?: string; timestamp: number }>;
  status: "idle" | "running" | "error";
  createdAt: number;
  updatedAt: number;
}

export interface OrchestratorConfig {
  port?: number;
  wsPort?: number;
  maxSessions?: number;
}

export class Orchestrator {
  private sessions = new Map<string, Session>();
  private config: Required<Pick<OrchestratorConfig, "port" | "wsPort" | "maxSessions">>;
  private httpServer?: ReturnType<typeof createServer>;
  private wsServer?: WebSocketServer;
  private wsClients = new Map<string, Set<WebSocket>>();

  constructor(config: OrchestratorConfig = {}) {
    this.config = {
      port: config.port ?? 3000,
      wsPort: config.wsPort ?? 3001,
      maxSessions: config.maxSessions ?? 10,
    };
  }

  async start(): Promise<void> {
    // HTTP API
    this.httpServer = createServer((req, res) => {
      this.handleHttp(req, res);
    });
    this.httpServer.listen(this.config.port);

    // WebSocket
    this.wsServer = new WebSocketServer({ port: this.config.wsPort });
    this.wsServer.on("connection", (ws, req) => {
      const sessionId = this.extractSessionId(req.url ?? "");
      if (!sessionId) {
        ws.close(1008, "Missing session ID");
        return;
      }
      this.addWsClient(sessionId, ws);
      ws.on("close", () => this.removeWsClient(sessionId, ws));
    });
  }

  async stop(): Promise<void> {
    this.wsServer?.close();
    this.httpServer?.close();
    for (const [, clients] of this.wsClients) {
      for (const ws of clients) {
        ws.close();
      }
    }
  }

  createSession(id: string, runtime: AgentRuntime): Session | null {
    if (this.sessions.size >= this.config.maxSessions) {
      return null;
    }
    const session: Session = {
      id,
      runtime,
      messages: [],
      status: "idle",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    this.sessions.set(id, session);
    return session;
  }

  getSession(id: string): Session | undefined {
    return this.sessions.get(id);
  }

  listSessions(): Array<{ id: string; status: string; messageCount: number; createdAt: number }> {
    return Array.from(this.sessions.values()).map((s) => ({
      id: s.id,
      status: s.status,
      messageCount: s.messages.length,
      createdAt: s.createdAt,
    }));
  }

  async runSession(sessionId: string, userPrompt: string): Promise<{ done: boolean; reason: string } | null> {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    session.status = "running";
    session.messages.push({ role: "user", text: userPrompt, timestamp: Date.now() });
    this.broadcast(sessionId, { type: "user", text: userPrompt });

    const result = await session.runtime.run(userPrompt, {
      onTurn: async (event: TurnEvent) => {
        const msg = this.eventToMessage(event);
        if (msg) {
          session.messages.push(msg);
          this.broadcast(sessionId, { type: event.type, ...msg });
        }
      },
    });

    session.status = result.done ? "idle" : "error";
    session.updatedAt = Date.now();
    return result;
  }

  deleteSession(id: string): boolean {
    return this.sessions.delete(id);
  }

  private handleHttp(req: import("http").IncomingMessage, res: import("http").ServerResponse): void {
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Access-Control-Allow-Origin", "*");

    const url = new URL(req.url ?? "/", `http://localhost:${this.config.port}`);

    if (url.pathname === "/sessions" && req.method === "GET") {
      res.writeHead(200);
      res.end(JSON.stringify({ sessions: this.listSessions() }));
      return;
    }

    if (url.pathname === "/sessions" && req.method === "POST") {
      res.writeHead(501);
      res.end(JSON.stringify({ error: "Create session via WebSocket or direct API" }));
      return;
    }

    if (url.pathname.startsWith("/sessions/") && req.method === "GET") {
      const id = url.pathname.split("/")[2];
      const session = this.getSession(id);
      if (!session) {
        res.writeHead(404);
        res.end(JSON.stringify({ error: "Session not found" }));
        return;
      }
      res.writeHead(200);
      res.end(JSON.stringify({
        id: session.id,
        status: session.status,
        messages: session.messages,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
      }));
      return;
    }

    res.writeHead(404);
    res.end(JSON.stringify({ error: "Not found" }));
  }

  private extractSessionId(url: string): string | null {
    const match = url.match(/\/sessions\/([^/]+)/);
    return match?.[1] ?? null;
  }

  private addWsClient(sessionId: string, ws: WebSocket): void {
    if (!this.wsClients.has(sessionId)) {
      this.wsClients.set(sessionId, new Set());
    }
    this.wsClients.get(sessionId)!.add(ws);
  }

  private removeWsClient(sessionId: string, ws: WebSocket): void {
    this.wsClients.get(sessionId)?.delete(ws);
  }

  private broadcast(sessionId: string, data: unknown): void {
    const clients = this.wsClients.get(sessionId);
    if (!clients) return;
    const json = JSON.stringify(data);
    for (const ws of clients) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(json);
      }
    }
  }

  private eventToMessage(event: TurnEvent): { role: string; text: string; model?: string; timestamp: number } | null {
    const ts = Date.now();
    if (event.type === "text") {
      return { role: "assistant", text: event.text ?? "", model: event.model, timestamp: ts };
    }
    if (event.type === "tool_call") {
      return { role: "tool", text: `🔧 ${event.toolCall?.name ?? ""}`, timestamp: ts };
    }
    if (event.type === "tool_result") {
      const ok = event.toolResult?.ok ?? false;
      return { role: "tool", text: ok ? (event.toolResult?.content ?? "") : `Error: ${event.toolResult?.error ?? ""}`, timestamp: ts };
    }
    if (event.type === "error") {
      return { role: "system", text: `Error: ${event.error ?? ""}`, timestamp: ts };
    }
    if (event.type === "done") {
      return { role: "system", text: "[Done]", timestamp: ts };
    }
    return null;
  }
}
