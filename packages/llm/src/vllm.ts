import { OllamaClient } from "./ollama.js";

/**
 * vLLM adapter via OpenAI-compatible API.
 * vLLM serves an OpenAI-compatible endpoint, typically at /v1/chat/completions.
 * This adapter assumes vLLM is running in WSL2 or locally.
 */
export class VllmClient extends OllamaClient {
  constructor(opts?: { baseUrl?: string; defaultModel?: string; defaultTemperature?: number }) {
    super({
      baseUrl: opts?.baseUrl ?? "http://localhost:8000/v1",
      defaultModel: opts?.defaultModel ?? "Qwen2.5-Coder-7B-Instruct",
      defaultTemperature: opts?.defaultTemperature ?? 0.1,
    });
  }
}
