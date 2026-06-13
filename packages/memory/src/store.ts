import { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import type { Message } from "@lookai/shared";

export interface SessionRecord {
  id: string;
  createdAt: number;
  updatedAt: number;
  messages: Message[];
}

export class MemoryStore {
  private sessionDir: string;
  private lookaiMdPath: string;
  private currentSessionId: string;

  constructor(baseDir: string = join(process.cwd(), ".lookai")) {
    this.sessionDir = join(baseDir, "sessions");
    this.lookaiMdPath = join(baseDir, "LOOKAI.md");
    this.currentSessionId = this.generateId();
    if (!existsSync(this.sessionDir)) {
      mkdirSync(this.sessionDir, { recursive: true });
    }
  }

  private generateId(): string {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  }

  getCurrentSessionId(): string {
    return this.currentSessionId;
  }

  startNewSession(): void {
    this.currentSessionId = this.generateId();
  }

  loadLookaiMd(): string | null {
    if (!existsSync(this.lookaiMdPath)) return null;
    return readFileSync(this.lookaiMdPath, "utf-8");
  }

  saveLookaiMd(content: string): void {
    writeFileSync(this.lookaiMdPath, content, "utf-8");
  }

  appendTranscript(messages: Message[]): void {
    const path = join(this.sessionDir, `${this.currentSessionId}.jsonl`);
    for (const m of messages) {
      appendFileSync(path, JSON.stringify(m) + "\n", "utf-8");
    }
  }

  saveSession(messages: Message[]): void {
    const path = join(this.sessionDir, `${this.currentSessionId}.jsonl`);
    writeFileSync(path, messages.map((m) => JSON.stringify(m)).join("\n") + "\n", "utf-8");
  }

  loadSession(id: string): Message[] | null {
    const path = join(this.sessionDir, `${id}.jsonl`);
    if (!existsSync(path)) return null;
    const raw = readFileSync(path, "utf-8");
    return raw
      .split("\n")
      .filter((l) => l.trim())
      .map((l) => JSON.parse(l) as Message);
  }

  listSessions(): Array<{ id: string; updatedAt: number; messageCount: number }> {
    if (!existsSync(this.sessionDir)) return [];
    const entries = readdirSync(this.sessionDir)
      .filter((f) => f.endsWith(".jsonl"))
      .map((f) => {
        const id = f.replace(".jsonl", "");
        const path = join(this.sessionDir, f);
        const stat = statSync(path);
        const raw = readFileSync(path, "utf-8");
        const count = raw.split("\n").filter((l) => l.trim()).length;
        return { id, updatedAt: stat.mtimeMs, messageCount: count };
      });
    entries.sort((a, b) => b.updatedAt - a.updatedAt);
    return entries;
  }

  getLatestSessionId(): string | null {
    const sessions = this.listSessions();
    return sessions.length > 0 ? sessions[0].id : null;
  }
}
