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
  private memoryDir: string;
  private currentSessionId: string;

  constructor(baseDir: string = join(process.cwd(), ".lookai")) {
    this.sessionDir = join(baseDir, "sessions");
    this.lookaiMdPath = join(baseDir, "LOOKAI.md");
    this.memoryDir = join(baseDir, "memory");
    this.currentSessionId = this.generateId();
    if (!existsSync(this.sessionDir)) {
      mkdirSync(this.sessionDir, { recursive: true });
    }
    if (!existsSync(this.memoryDir)) {
      mkdirSync(this.memoryDir, { recursive: true });
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

  // Conversation memory (opt-in, separate from LOOKAI.md)
  saveMemory(key: string, content: string): void {
    const path = join(this.memoryDir, `${safeKey(key)}.md`);
    writeFileSync(path, content, "utf-8");
  }

  loadMemory(key: string): string | null {
    const path = join(this.memoryDir, `${safeKey(key)}.md`);
    if (!existsSync(path)) return null;
    return readFileSync(path, "utf-8");
  }

  deleteMemory(key: string): boolean {
    const path = join(this.memoryDir, `${safeKey(key)}.md`);
    if (!existsSync(path)) return false;
    // eslint-disable-next-line no-restricted-syntax
    const { unlinkSync } = require("node:fs");
    unlinkSync(path);
    return true;
  }

  listMemory(): Array<{ key: string; updatedAt: number; size: number }> {
    if (!existsSync(this.memoryDir)) return [];
    const entries = readdirSync(this.memoryDir)
      .filter((f) => f.endsWith(".md"))
      .map((f) => {
        const key = f.replace(".md", "");
        const path = join(this.memoryDir, f);
        const stat = statSync(path);
        return { key, updatedAt: stat.mtimeMs, size: stat.size };
      });
    entries.sort((a, b) => b.updatedAt - a.updatedAt);
    return entries;
  }

  searchMemory(query: string): Array<{ key: string; snippet: string }> {
    const results: Array<{ key: string; snippet: string }> = [];
    const regex = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    for (const entry of this.listMemory()) {
      const content = this.loadMemory(entry.key) ?? "";
      const match = regex.exec(content);
      if (match) {
        const start = Math.max(0, match.index - 40);
        const end = Math.min(content.length, match.index + 200);
        results.push({ key: entry.key, snippet: content.slice(start, end) });
      }
    }
    return results;
  }
}

function safeKey(key: string): string {
  return key.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 100);
}
