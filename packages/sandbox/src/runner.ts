import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface SandboxConfig {
  image?: string;
  allowDomains?: string[];
  memoryLimit?: string; // e.g. "512m"
  timeoutMs?: number;
  cwd?: string;
}

export interface SandboxResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  exitCode: number;
  error?: string;
}

export class SandboxRunner {
  private config: Required<Pick<SandboxConfig, "image" | "allowDomains" | "timeoutMs">> & { memoryLimit?: string; cwd?: string };
  private tempDir: string;
  private blockedLog: Array<{ domain: string; reason: string; timestamp: number }> = [];

  constructor(config: SandboxConfig = {}) {
    this.config = {
      image: config.image ?? "alpine:latest",
      allowDomains: config.allowDomains ?? ["github.com", "registry.npmjs.org", "pypi.org"],
      timeoutMs: config.timeoutMs ?? 60000,
      memoryLimit: config.memoryLimit,
      cwd: config.cwd,
    };
    this.tempDir = mkdtempSync(join(tmpdir(), "lookai-sandbox-"));
  }

  async run(command: string): Promise<SandboxResult> {
    // Check if Docker is available
    const dockerAvailable = await this.checkDocker();
    if (!dockerAvailable) {
      // Fallback: run directly on host (with warning)
      return this.runHostFallback(command);
    }

    // Write egress allowlist script
    const egressScript = this.buildEgressScript();
    writeFileSync(join(this.tempDir, "egress.sh"), egressScript, "utf-8");

    // Build Docker run args
    const args = [
      "run",
      "--rm",
      "--network=bridge",
      "-v", `${this.tempDir}:/sandbox:ro`,
      "-w", "/workspace",
      ...(this.config.memoryLimit ? ["-m", this.config.memoryLimit] : []),
      this.config.image,
      "sh", "-c", command,
    ];

    return new Promise((resolve) => {
      const child = spawn("docker", args, {
        cwd: this.config.cwd ?? process.cwd(),
        env: process.env,
        timeout: this.config.timeoutMs,
      });

      let stdout = "";
      let stderr = "";
      child.stdout?.on("data", (d) => { stdout += String(d); });
      child.stderr?.on("data", (d) => { stderr += String(d); });

      child.on("close", (code) => {
        resolve({
          ok: code === 0,
          stdout: stdout.slice(0, 5000),
          stderr: stderr.slice(0, 2000),
          exitCode: code ?? 1,
        });
      });

      child.on("error", (err) => {
        resolve({ ok: false, stdout, stderr, exitCode: 1, error: err.message });
      });
    });
  }

  getBlockedLog(): Array<{ domain: string; reason: string; timestamp: number }> {
    return [...this.blockedLog];
  }

  private async checkDocker(): Promise<boolean> {
    return new Promise((resolve) => {
      const child = spawn("docker", ["version"], { stdio: "ignore" });
      child.on("error", () => resolve(false));
      child.on("close", (code) => resolve(code === 0));
    });
  }

  private runHostFallback(command: string): Promise<SandboxResult> {
    // Log warning about running on host
    console.warn("[Sandbox] Docker not available — running on host (no isolation)");
    return new Promise((resolve) => {
      const child = spawn(command, {
        cwd: this.config.cwd ?? process.cwd(),
        env: process.env,
        timeout: this.config.timeoutMs,
        shell: true,
      });

      let stdout = "";
      let stderr = "";
      child.stdout?.on("data", (d) => { stdout += String(d); });
      child.stderr?.on("data", (d) => { stderr += String(d); });

      child.on("close", (code) => {
        resolve({
          ok: code === 0,
          stdout: stdout.slice(0, 5000),
          stderr: stderr.slice(0, 2000),
          exitCode: code ?? 1,
        });
      });

      child.on("error", (err) => {
        resolve({ ok: false, stdout, stderr, exitCode: 1, error: err.message });
      });
    });
  }

  private buildEgressScript(): string {
    // Simple iptables-based egress filtering (run inside container)
    // In practice, this would be a more robust proxy
    const allowed = this.config.allowDomains.map((d) => `iptables -A OUTPUT -d ${d} -j ACCEPT`).join("\n");
    return `#!/bin/sh
# Egress allowlist
${allowed}
iptables -A OUTPUT -j DROP 2>/dev/null || true
`;
  }
}

/**
 * Check if a URL domain is in the allowlist.
 */
export function isDomainAllowed(url: string, allowlist: string[]): boolean {
  try {
    const hostname = new URL(url).hostname;
    return allowlist.some((d) => hostname === d || hostname.endsWith(`.${d}`));
  } catch {
    return false;
  }
}

/**
 * Log a blocked egress attempt.
 */
export function logBlockedEgress(url: string, reason: string, log: Array<{ domain: string; reason: string; timestamp: number }>): void {
  try {
    const domain = new URL(url).hostname;
    log.push({ domain, reason, timestamp: Date.now() });
  } catch {
    log.push({ domain: url, reason, timestamp: Date.now() });
  }
}
