import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

export interface RagDocument {
  id: string;
  content: string;
  source: string; // file path or URL
  embedding?: number[];
  metadata?: Record<string, unknown>;
}

export interface RagQueryResult {
  document: RagDocument;
  score: number;
}

/**
 * Simple RAG with in-memory embeddings and cosine similarity.
 * No external vector DB — designed for small projects (fits in RAM).
 * For larger projects, swap to pgvector/Qdrant.
 */
export class SimpleRag {
  private documents: RagDocument[] = [];
  // eslint-disable-next-line no-unused-vars
  private embeddingFn: (text: string) => Promise<number[]>;

  // eslint-disable-next-line no-unused-vars
  constructor(embeddingFn?: (text: string) => Promise<number[]>) {
    this.embeddingFn = embeddingFn ?? this.defaultEmbedding;
  }

  async indexFile(path: string): Promise<void> {
    if (!existsSync(path)) return;
    const stat = statSync(path);
    if (stat.isDirectory()) {
      for (const entry of readdirSync(path)) {
        await this.indexFile(join(path, entry));
      }
      return;
    }
    // Only text files
    const textExts = [".ts", ".js", ".tsx", ".jsx", ".md", ".txt", ".json", ".yaml", ".yml", ".css", ".html"];
    const ext = path.split(".").pop()?.toLowerCase() ?? "";
    if (!textExts.includes(`.${ext}`)) return;

    const content = readFileSync(path, "utf-8");
    // Chunk by paragraphs / functions (simple)
    const chunks = this.chunkText(content, 1000);
    for (let i = 0; i < chunks.length; i++) {
      const embedding = await this.embeddingFn(chunks[i]);
      this.documents.push({
        id: `${path}#chunk-${i}`,
        content: chunks[i],
        source: path,
        embedding,
      });
    }
  }

  async query(text: string, topK = 5): Promise<RagQueryResult[]> {
    const queryEmbedding = await this.embeddingFn(text);
    const scored = this.documents.map((doc) => ({
      document: doc,
      score: doc.embedding ? this.cosineSimilarity(queryEmbedding, doc.embedding) : 0,
    }));
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topK);
  }

  getDocumentCount(): number {
    return this.documents.length;
  }

  clear(): void {
    this.documents = [];
  }

  private chunkText(text: string, maxChars: number): string[] {
    const chunks: string[] = [];
    const lines = text.split("\n");
    let current = "";
    for (const line of lines) {
      if (current.length + line.length > maxChars && current.length > 0) {
        chunks.push(current.trim());
        current = line;
      } else {
        current += "\n" + line;
      }
    }
    if (current.trim()) {
      chunks.push(current.trim());
    }
    return chunks;
  }

  private async defaultEmbedding(text: string): Promise<number[]> {
    // Simple bag-of-words embedding (deterministic, no model needed)
    // For production, replace with Ollama embeddings API (nomic-embed-text, bge, etc.)
    const vocab = new Map<string, number>();
    const words = text.toLowerCase().split(/\W+/).filter((w) => w.length > 2);
    for (const word of words) {
      vocab.set(word, (vocab.get(word) ?? 0) + 1);
    }
    // Hash to fixed-size vector (384 dims)
    const dim = 384;
    const vec = new Array(dim).fill(0);
    for (const [word, count] of vocab) {
      let hash = 0;
      for (let i = 0; i < word.length; i++) {
        hash = ((hash << 5) - hash + word.charCodeAt(i)) | 0;
      }
      const idx = Math.abs(hash) % dim;
      vec[idx] += count;
    }
    // Normalize
    const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
    return norm > 0 ? vec.map((v) => v / norm) : vec;
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    let dot = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
    }
    return dot; // already normalized
  }
}
