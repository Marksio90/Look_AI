import { test, expect } from "vitest";
import { SimpleRag } from "../simple.js";

test("SimpleRag can be instantiated", () => {
  const rag = new SimpleRag();
  expect(rag).toBeDefined();
});

test("SimpleRag indexes and queries text", async () => {
  const rag = new SimpleRag();
  // Manually add a document
  const embedding = await rag["embeddingFn"]("hello world test");
  rag["documents"].push({
    id: "test-1",
    content: "This is a test document about hello world",
    source: "test.txt",
    embedding,
  });

  const results = await rag.query("hello world", 3);
  expect(results.length).toBeGreaterThan(0);
  expect(results[0].score).toBeGreaterThan(0);
});

test("SimpleRag chunks text correctly", () => {
  const rag = new SimpleRag();
  const chunks = rag["chunkText"]("line1\nline2\nline3", 10);
  expect(chunks.length).toBeGreaterThan(0);
});
