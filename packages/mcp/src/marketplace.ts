import { z } from 'zod';

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
