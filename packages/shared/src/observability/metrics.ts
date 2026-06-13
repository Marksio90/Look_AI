export interface MetricValue {
  name: string;
  value: number;
  labels: Record<string, string>;
  timestamp: number;
}

export class MetricsCollector {
  private counters = new Map<string, number>();
  private gauges = new Map<string, number>();
  private histograms = new Map<string, number[]>();
  private labels = new Map<string, Record<string, string>>();

  inc(name: string, value = 1, labels?: Record<string, string>): void {
    const key = this.key(name, labels);
    this.counters.set(key, (this.counters.get(key) ?? 0) + value);
    if (labels) this.labels.set(key, labels);
  }

  set(name: string, value: number, labels?: Record<string, string>): void {
    const key = this.key(name, labels);
    this.gauges.set(key, value);
    if (labels) this.labels.set(key, labels);
  }

  observe(name: string, value: number, labels?: Record<string, string>): void {
    const key = this.key(name, labels);
    if (!this.histograms.has(key)) {
      this.histograms.set(key, []);
    }
    this.histograms.get(key)!.push(value);
    if (labels) this.labels.set(key, labels);
  }

  exportPrometheus(): string {
    const lines: string[] = [];

    // Counters
    for (const [key, value] of this.counters) {
      const { name, labels } = this.parseKey(key);
      lines.push(`# TYPE ${name} counter`);
      lines.push(`${name}${this.formatLabels(labels)} ${value} ${Date.now()}`);
    }

    // Gauges
    for (const [key, value] of this.gauges) {
      const { name, labels } = this.parseKey(key);
      lines.push(`# TYPE ${name} gauge`);
      lines.push(`${name}${this.formatLabels(labels)} ${value} ${Date.now()}`);
    }

    // Histograms (simple: count + sum)
    for (const [key, values] of this.histograms) {
      const { name, labels } = this.parseKey(key);
      const sum = values.reduce((a, b) => a + b, 0);
      lines.push(`# TYPE ${name} histogram`);
      lines.push(`${name}_count${this.formatLabels(labels)} ${values.length}`);
      lines.push(`${name}_sum${this.formatLabels(labels)} ${sum}`);
    }

    return lines.join("\n");
  }

  private key(name: string, labels?: Record<string, string>): string {
    if (!labels || Object.keys(labels).length === 0) return name;
    const sorted = Object.entries(labels).sort(([a], [b]) => a.localeCompare(b));
    return `${name}{${sorted.map(([k, v]) => `${k}="${v}"`).join(",")}}`;
  }

  private parseKey(key: string): { name: string; labels: Record<string, string> } {
    const match = key.match(/^(.+)\{(.+)\}$/);
    if (!match) return { name: key, labels: {} };
    const name = match[1];
    const labels: Record<string, string> = {};
    for (const part of match[2].split(",")) {
      const [k, v] = part.split("=");
      labels[k] = v.replace(/"/g, "");
    }
    return { name, labels };
  }

  private formatLabels(labels: Record<string, string>): string {
    const entries = Object.entries(labels);
    if (entries.length === 0) return "";
    return "{" + entries.map(([k, v]) => `${k}="${v}"`).join(",") + "}";
  }
}
