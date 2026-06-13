import { describe, it, expect } from "vitest";
import { OllamaClient } from "../ollama.js";

describe("OllamaClient", () => {
  it("can be instantiated", () => {
    const c = new OllamaClient();
    expect(c).toBeDefined();
  });
});
