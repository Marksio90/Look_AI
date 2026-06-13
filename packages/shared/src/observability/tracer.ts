import { randomUUID } from "node:crypto";

export interface TraceSpan {
  id: string;
  parentId?: string;
  name: string;
  startTime: number;
  endTime?: number;
  attributes: Record<string, unknown>;
  events: Array<{ name: string; timestamp: number; attributes?: Record<string, unknown> }>;
  status: "ok" | "error";
  errorMessage?: string;
}

export interface Trace {
  traceId: string;
  spans: TraceSpan[];
  rootSpanId: string;
}

export class Tracer {
  private traces = new Map<string, Trace>();
  private activeSpans = new Map<string, TraceSpan>();

  startTrace(name: string, attributes?: Record<string, unknown>): string {
    const traceId = randomUUID();
    const rootSpanId = randomUUID();
    const rootSpan: TraceSpan = {
      id: rootSpanId,
      name,
      startTime: Date.now(),
      attributes: attributes ?? {},
      events: [],
      status: "ok",
    };
    this.traces.set(traceId, { traceId, spans: [rootSpan], rootSpanId });
    this.activeSpans.set(rootSpanId, rootSpan);
    return traceId;
  }

  startSpan(traceId: string, name: string, parentId?: string, attributes?: Record<string, unknown>): string | null {
    const trace = this.traces.get(traceId);
    if (!trace) return null;
    const spanId = randomUUID();
    const span: TraceSpan = {
      id: spanId,
      parentId: parentId ?? trace.rootSpanId,
      name,
      startTime: Date.now(),
      attributes: attributes ?? {},
      events: [],
      status: "ok",
    };
    trace.spans.push(span);
    this.activeSpans.set(spanId, span);
    return spanId;
  }

  endSpan(spanId: string, status: "ok" | "error" = "ok", errorMessage?: string): void {
    const span = this.activeSpans.get(spanId);
    if (!span) return;
    span.endTime = Date.now();
    span.status = status;
    if (errorMessage) span.errorMessage = errorMessage;
    this.activeSpans.delete(spanId);
  }

  addEvent(spanId: string, name: string, attributes?: Record<string, unknown>): void {
    const span = this.activeSpans.get(spanId);
    if (!span) return;
    span.events.push({ name, timestamp: Date.now(), attributes });
  }

  getTrace(traceId: string): Trace | undefined {
    return this.traces.get(traceId);
  }

  listTraces(): Array<{ traceId: string; rootName: string; spanCount: number; durationMs: number }> {
    return Array.from(this.traces.values()).map((t) => {
      const root = t.spans.find((s) => s.id === t.rootSpanId);
      const duration = root?.endTime && root?.startTime ? root.endTime - root.startTime : Date.now() - (root?.startTime ?? 0);
      return { traceId: t.traceId, rootName: root?.name ?? "", spanCount: t.spans.length, durationMs: duration };
    });
  }

  exportTrace(traceId: string): Record<string, unknown> | null {
    const trace = this.traces.get(traceId);
    if (!trace) return null;
    return {
      traceId: trace.traceId,
      spans: trace.spans.map((s) => ({
        id: s.id,
        parentId: s.parentId,
        name: s.name,
        startTime: s.startTime,
        endTime: s.endTime,
        durationMs: s.endTime ? s.endTime - s.startTime : undefined,
        attributes: s.attributes,
        events: s.events,
        status: s.status,
        errorMessage: s.errorMessage,
      })),
    };
  }
}
