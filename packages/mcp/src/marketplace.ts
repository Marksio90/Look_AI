import { z } from 'zod';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const MARKETPLACE_DIR = join(homedir(), '.lookai', 'marketplace');
const INSTALLED_FILE = join(MARKETPLACE_DIR, 'installed.json');
const REGISTRY_URL = 'https://raw.githubusercontent.com/modelcontextprotocol/servers/main/README.md'; // Fallback placeholder

export interface McpServerEntry {
  name: string;
  description: string;
  version: string;
  publisher: string;
  transport: 'stdio' | 'http';
  command?: string;
  args?: string[];
  url?: string;
  tags: string[];
  installed: boolean;
}

export class McpMarketplace {
  private servers: McpServerEntry[] = [];

  register(entry: McpServerEntry): void {
    this.servers.push(entry);
  }

  list(): McpServerEntry[] {
    return [...this.servers];
  }

  search(query: string): McpServerEntry[] {
    const q = query.toLowerCase();
    return this.servers.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        s.tags.some((t) => t.toLowerCase().includes(q))
    );
  }

  findByName(name: string): McpServerEntry | undefined {
    return this.servers.find((s) => s.name === name);
  }

  install(name: string): boolean {
    const entry = this.findByName(name);
    if (!entry || entry.installed) return false;
    entry.installed = true;
    return true;
  }

  uninstall(name: string): boolean {
    const entry = this.findByName(name);
    if (!entry || !entry.installed) return false;
    entry.installed = false;
    return true;
  }

  getInstalled(): McpServerEntry[] {
    return this.servers.filter((s) => s.installed);
  }

  private ensureDir(): void {
    if (!existsSync(MARKETPLACE_DIR)) {
      mkdirSync(MARKETPLACE_DIR, { recursive: true });
    }
  }

  saveInstalled(): void {
    this.ensureDir();
    const installed = this.getInstalled().map((s) => s.name);
    writeFileSync(INSTALLED_FILE, JSON.stringify(installed, null, 2));
  }

  loadInstalled(): void {
    this.ensureDir();
    if (!existsSync(INSTALLED_FILE)) return;
    const names = JSON.parse(readFileSync(INSTALLED_FILE, 'utf-8')) as string[];
    for (const name of names) {
      const entry = this.findByName(name);
      if (entry) entry.installed = true;
    }
  }

  async fetchFromRegistry(url?: string): Promise<number> {
    const registryUrl = url ?? REGISTRY_URL;
    try {
      const res = await fetch(registryUrl);
      if (!res.ok) return 0;
      const text = await res.text();
      // Parse markdown table of MCP servers (best-effort)
      const lines = text.split('\n');
      let added = 0;
      for (const line of lines) {
        const match = line.match(/\|\s*([^|]+)\s*\|\s*([^|]+)\s*\|\s*([^|]+)\s*\|/);
        if (match && !line.includes('---')) {
          const name = match[1].trim();
          const desc = match[2].trim();
          const url = match[3].trim();
          if (name && desc && url && !this.findByName(name)) {
            this.register({
              name,
              description: desc,
              version: '1.0.0',
              publisher: 'community',
              transport: url.startsWith('http') ? 'http' : 'stdio',
              url: url.startsWith('http') ? url : undefined,
              command: url.startsWith('http') ? undefined : 'npx',
              args: url.startsWith('http') ? undefined : ['-y', url],
              tags: [],
              installed: false,
            });
            added++;
          }
        }
      }
      return added;
    } catch {
      return 0;
    }
  }
}

export const McpServerEntrySchema = z.object({
  name: z.string(),
  description: z.string(),
  version: z.string(),
  publisher: z.string(),
  transport: z.enum(['stdio', 'http']),
  command: z.string().optional(),
  args: z.array(z.string()).optional(),
  url: z.string().optional(),
  tags: z.array(z.string()),
  installed: z.boolean(),
});
