import { z } from "zod";
import type { Tool, ToolResult } from "@lookai/shared";

export interface SearchAdapter {
  search(query: string, limit?: number): Promise<Array<{ title: string; url: string; snippet: string }>>;
}

export class SearxngAdapter implements SearchAdapter {
  private baseUrl: string;

  constructor(baseUrl: string = "http://localhost:8888") {
    this.baseUrl = baseUrl;
  }

  async search(query: string, limit = 5): Promise<Array<{ title: string; url: string; snippet: string }>> {
    const url = `${this.baseUrl}/search?q=${encodeURIComponent(query)}&format=json`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`SearXNG HTTP ${res.status}`);
    const json = await res.json() as { results?: Array<{ title?: string; url?: string; content?: string }> };
    return (json.results ?? []).slice(0, limit).map((r) => ({
      title: r.title ?? "",
      url: r.url ?? "",
      snippet: r.content ?? "",
    }));
  }
}

export class BraveAdapter implements SearchAdapter {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async search(query: string, limit = 5): Promise<Array<{ title: string; url: string; snippet: string }>> {
    const res = await fetch(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${limit}`, {
      headers: { "X-Subscription-Token": this.apiKey, "Accept": "application/json" },
    });
    if (!res.ok) throw new Error(`Brave HTTP ${res.status}`);
    const json = await res.json() as { web?: { results?: Array<{ title?: string; url?: string; description?: string }> } };
    return (json.web?.results ?? []).slice(0, limit).map((r) => ({
      title: r.title ?? "",
      url: r.url ?? "",
      snippet: r.description ?? "",
    }));
  }
}

export const WebSearchTool = (adapter: SearchAdapter): Tool => ({
  name: "web_search",
  description: "Search the web for information. Returns top results with titles, URLs, and snippets.",
  parameters: z.object({
    query: z.string().describe("Search query"),
    limit: z.number().int().min(1).max(10).optional().describe("Max results (default 5)"),
  }),
  async execute(args): Promise<ToolResult> {
    try {
      const results = await adapter.search(String(args.query ?? ""), Number(args.limit ?? 5));
      const lines = results.map((r, i) => `${i + 1}. [${r.title}](${r.url})\n   ${r.snippet}`).join("\n\n");
      return { ok: true, content: lines || "No results found." };
    } catch (e) {
      return { ok: false, error: `Search error: ${e instanceof Error ? e.message : String(e)}` };
    }
  },
});

export const WebFetchTool: Tool = {
  name: "web_fetch",
  description: "Fetch a web page and extract its main content as markdown.",
  parameters: z.object({
    url: z.string().describe("URL to fetch"),
    maxLength: z.number().int().optional().describe("Max characters to return (default 4000)"),
  }),
  async execute(args): Promise<ToolResult> {
    try {
      const url = String(args.url ?? "");
      const maxLen = Number(args.maxLength ?? 4000);
      const res = await fetch(url, { headers: { "User-Agent": "LookAI/1.0" } });
      if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
      const html = await res.text();
      const md = htmlToMarkdown(html).slice(0, maxLen);
      return { ok: true, content: md };
    } catch (e) {
      return { ok: false, error: `Fetch error: ${e instanceof Error ? e.message : String(e)}` };
    }
  },
};

function htmlToMarkdown(html: string): string {
  // Very basic HTML-to-markdown conversion
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<h1[^>]*>(.*?)<\/h1>/gi, "# $1\n")
    .replace(/<h2[^>]*>(.*?)<\/h2>/gi, "## $1\n")
    .replace(/<h3[^>]*>(.*?)<\/h3>/gi, "### $1\n")
    .replace(/<p[^>]*>(.*?)<\/p>/gi, "$1\n\n")
    .replace(/<li[^>]*>(.*?)<\/li>/gi, "- $1\n")
    .replace(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, "[$2]($1)")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
