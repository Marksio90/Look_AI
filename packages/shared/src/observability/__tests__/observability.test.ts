import { test, expect } from "vitest";
import { Tracer } from "../tracer.js";
import { MetricsCollector } from "../metrics.js";

test("Tracer starts and ends traces", () => {
  const tracer = new Tracer();
  const traceId = tracer.startTrace("test-request", { user: "test" });
  expect(traceId).toBeDefined();

  const spanId = tracer.startSpan(traceId, "tool-call", undefined, { tool: "read" });
  expect(spanId).toBeDefined();

  if (spanId) {
    tracer.addEvent(spanId, "tool_executed", { path: "/tmp" });
    tracer.endSpan(spanId, "ok");
  }

  tracer.endSpan(tracer.listTraces()[0].traceId, "ok");

  const traces = tracer.listTraces();
  expect(traces.length).toBe(1);
  expect(traces[0].spanCount).toBe(2);
});

test("MetricsCollector exports Prometheus format", () => {
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
