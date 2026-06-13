import { test, expect, describe } from "vitest";
import { Orchestrator } from "@lookai/orchestrator";
import { EvalHarness, createDefaultEvalSuite } from "@lookai/eval-harness";
import { SimpleRag } from "@lookai/memory";
import { Tracer, MetricsCollector } from "@lookai/shared";
import { LongRunningTask } from "@lookai/core";

describe("Phase 3 Integration Smoke Test", () => {
  test("(a) Orchestrator manages sessions", () => {
    const orch = new Orchestrator({ port: 9999, wsPort: 9998, maxSessions: 5 });
    expect(orch).toBeDefined();
    expect(orch.listSessions()).toEqual([]);
  });

  test("(b) EvalHarness registers and lists suites", () => {
    const harness = new EvalHarness();
    harness.registerSuite(createDefaultEvalSuite());
    const suites = harness.listSuites();
    expect(suites.length).toBe(1);
    expect(suites[0].name).toBe("basic-coding");
    expect(suites[0].taskCount).toBe(3);
  });

  test("(c) SimpleRag indexes and queries", async () => {
    const rag = new SimpleRag();
    // Manually add document with embedding
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

  test("(d) Tracer records spans and traces", () => {
    const tracer = new Tracer();
    const traceId = tracer.startTrace("test-request", { user: "test" });
    const spanId = tracer.startSpan(traceId, "tool-call", undefined, { tool: "read" });
    expect(spanId).toBeDefined();
    if (spanId) {
      tracer.addEvent(spanId, "executed", { path: "/tmp" });
      tracer.endSpan(spanId, "ok");
    }
    tracer.endSpan(traceId, "ok");

    const traces = tracer.listTraces();
    expect(traces.length).toBe(1);
    expect(traces[0].spanCount).toBe(2);

    const exported = tracer.exportTrace(traceId);
    expect(exported).toBeDefined();
    expect(exported?.spans).toHaveLength(2);
  });

  test("(e) MetricsCollector exports Prometheus format", () => {
    const metrics = new MetricsCollector();
    metrics.inc("requests_total", 1, { method: "GET" });
    metrics.set("context_tokens", 1024, { session: "abc" });
    metrics.observe("latency_ms", 150, { model: "worker" });

    const prom = metrics.exportPrometheus();
    expect(prom).toContain("requests_total");
    expect(prom).toContain("context_tokens");
    expect(prom).toContain("latency_ms_count");
    expect(prom).toContain('method="GET"');
  });

  test("(f) LongRunningTask persists state to disk", () => {
    const tmpDir = `/tmp/lookai-test-${Date.now()}`;
    const task = new LongRunningTask(tmpDir);

    const state = {
      taskId: "test-1",
      phase: "plan" as const,
      attempts: 0,
      maxAttempts: 3,
      plan: "Step 1: read file",
    };

    task.saveState(state);
    const loaded = task.loadState("test-1");
    expect(loaded).toEqual(state);

    const resumed = task.resume("test-1");
    expect(resumed?.nextAction).toBe("generate");

    task.deleteState("test-1");
    expect(task.loadState("test-1")).toBeNull();
  });

  test("(g) LongRunningTask respects maxAttempts", () => {
    const tmpDir = `/tmp/lookai-test-${Date.now()}`;
    const task = new LongRunningTask(tmpDir);

    const state = {
      taskId: "test-2",
      phase: "generate" as const,
      attempts: 3,
      maxAttempts: 3,
    };

    task.saveState(state);
    const resumed = task.resume("test-2");
    expect(resumed?.state.phase).toBe("error");
  });
});
