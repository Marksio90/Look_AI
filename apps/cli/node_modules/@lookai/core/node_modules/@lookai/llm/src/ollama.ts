import { z } from "zod";
import type { LLMClient, LLMResponse, Message, ToolDef, LLMOptions, ToolCall, Usage } from "@lookai/shared";

function messagesToOpenAI(messages: Message[]): Array<Record<string, unknown>> {
  return messages.map((m) => {
    if (m.role === "tool") {
      return {
        role: "tool",
        tool_call_id: m.toolCallId,
        name: m.toolName,
        content: m.content ?? "",
      };
    }
    if (m.role === "assistant" && m.toolCalls && m.toolCalls.length > 0) {
      return {
        role: "assistant",
        content: m.content ?? "",
        tool_calls: m.toolCalls.map((tc) => ({
          id: tc.id,
          type: "function",
          function: { name: tc.name, arguments: JSON.stringify(tc.arguments) },
        })),
      };
    }
    return { role: m.role, content: m.content ?? "" };
  });
}

function toolsToOpenAI(tools: ToolDef[]): Array<Record<string, unknown>> {
  return tools.map((t) => ({
    type: "function",
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters instanceof z.ZodType ? zodToJsonSchema(t.parameters) : t.parameters,
    },
  }));
}

function zodToJsonSchema(schema: z.ZodTypeAny): Record<string, unknown> {
  if (schema instanceof z.ZodObject) {
    const shape = schema.shape as Record<string, z.ZodTypeAny>;
    const properties: Record<string, unknown> = {};
    const required: string[] = [];
    for (const [key, value] of Object.entries(shape)) {
      properties[key] = zodToJsonSchema(value);
      if (!(value instanceof z.ZodOptional)) {
        required.push(key);
      }
    }
    return { type: "object", properties, required };
  }
  if (schema instanceof z.ZodString) return { type: "string" };
  if (schema instanceof z.ZodNumber) return { type: "number" };
  if (schema instanceof z.ZodBoolean) return { type: "boolean" };
  if (schema instanceof z.ZodArray) return { type: "array", items: zodToJsonSchema(schema.element) };
  if (schema instanceof z.ZodOptional) return zodToJsonSchema(schema.unwrap());
  if (schema instanceof z.ZodRecord) return { type: "object", additionalProperties: true };
  return { type: "object" };
}

export class OllamaClient implements LLMClient {
  private baseUrl: string;
  private defaultModel: string;
  private defaultTemperature: number;

  constructor(opts?: { baseUrl?: string; defaultModel?: string; defaultTemperature?: number }) {
    this.baseUrl = opts?.baseUrl ?? "http://localhost:11434/v1";
    this.defaultModel = opts?.defaultModel ?? "qwen2.5-coder:7b";
    this.defaultTemperature = opts?.defaultTemperature ?? 0.1;
  }

  async create(messages: Message[], tools: ToolDef[], opts?: LLMOptions): Promise<LLMResponse> {
    const model = opts?.model ?? this.defaultModel;
    const temperature = opts?.temperature ?? this.defaultTemperature;
    const maxTokens = opts?.maxTokens ?? 2048;

    const body: Record<string, unknown> = {
      model,
      messages: messagesToOpenAI(messages),
      temperature,
      max_tokens: maxTokens,
    };

    if (tools.length > 0) {
      body.tools = toolsToOpenAI(tools);
      body.tool_choice = "auto";
    }

    if (opts?.responseFormat?.type === "json_object") {
      body.response_format = { type: "json_object" };
    }

    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "unknown");
      throw new Error(`Ollama HTTP ${res.status}: ${text}`);
    }

    const json: any = await res.json();
    const choice = json.choices?.[0];
    if (!choice) {
      throw new Error("No choices in Ollama response");
    }

    const message = choice.message ?? {};
    const text = message.content ?? "";
    const finishReason = choice.finish_reason ?? "stop";

    let stopReason: LLMResponse["stopReason"] = "end_turn";
    if (finishReason === "tool_calls" || finishReason === "tool_call") {
      stopReason = "tool_use";
    } else if (finishReason === "length") {
      stopReason = "max_tokens";
    } else if (finishReason === "error" || json.error) {
      stopReason = "error";
    }

    const toolCalls: ToolCall[] = [];
    if (message.tool_calls && Array.isArray(message.tool_calls)) {
      for (const tc of message.tool_calls) {
        const fn = (tc as any).function ?? {};
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(fn.arguments ?? "{}");
        } catch {
          args = {};
        }
        toolCalls.push({ id: (tc as any).id ?? `${fn.name ?? "tool"}-${Date.now()}`, name: fn.name ?? "unknown", arguments: args });
      }
    }

    const usage: Usage = {
      promptTokens: json.usage?.prompt_tokens ?? 0,
      completionTokens: json.usage?.completion_tokens ?? 0,
      totalTokens: json.usage?.total_tokens ?? 0,
    };

    return { stopReason, text, toolCalls, usage };
  }
}
