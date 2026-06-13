import { PermissionMode, PermissionLevel, type PermissionRule, type PermissionRequest, type PermissionDecision } from "./types.js";

const DEFAULT_RULES: PermissionRule[] = [
  { tool: "read", level: PermissionLevel.ReadOnly },
  { tool: "glob", level: PermissionLevel.ReadOnly },
  { tool: "grep", level: PermissionLevel.ReadOnly },
  { tool: "write", level: PermissionLevel.WorkspaceWrite },
  { tool: "edit", level: PermissionLevel.WorkspaceWrite },
  { tool: "bash", level: PermissionLevel.DangerFull },
];

const DANGEROUS_PATTERNS = [
  /rm\s+-rf/i,
  />\s*\/dev\/null/i,
  /curl\s+.*\|\s*sh/i,
  /wget\s+.*\|\s*sh/i,
  /powershell\s+-enc/i,
  /format\s+/i,
  /mkfs\./i,
  /dd\s+if=/i,
];

export class PermissionEngine {
  private mode: PermissionMode;
  private rules: Map<string, PermissionLevel>;
  private workspaceRoot: string;

  constructor(mode: PermissionMode = PermissionMode.Default, workspaceRoot: string = process.cwd()) {
    this.mode = mode;
    this.rules = new Map();
    for (const r of DEFAULT_RULES) {
      this.rules.set(r.tool, r.level);
    }
    this.workspaceRoot = workspaceRoot;
  }

  setMode(mode: PermissionMode): void {
    this.mode = mode;
  }

  getMode(): PermissionMode {
    return this.mode;
  }

  check(tool: string, args: Record<string, unknown>): PermissionDecision {
    const level = this.rules.get(tool) ?? PermissionLevel.DangerFull;

    // Plan mode: read-only tools only
    if (this.mode === PermissionMode.Plan) {
      if (level > PermissionLevel.ReadOnly) {
        return { allowed: false, mode: this.mode, reason: `Plan mode: ${tool} is not allowed` };
      }
      return { allowed: true, mode: this.mode };
    }

    // Auto mode: everything allowed
    if (this.mode === PermissionMode.Auto) {
      return { allowed: true, mode: this.mode };
    }

    // Auto-edit mode: workspace write allowed, dangerous still asks
    if (this.mode === PermissionMode.AutoEdit) {
      if (level <= PermissionLevel.WorkspaceWrite) {
        return { allowed: true, mode: this.mode };
      }
    }

    // Path guard for write/edit
    if (tool === "write" || tool === "edit") {
      const path = String(args.path ?? "");
      if (!this.isPathAllowed(path)) {
        return { allowed: false, mode: this.mode, reason: `Path guard: ${path} is outside workspace` };
      }
    }

    // Command security for bash
    if (tool === "bash") {
      const command = String(args.command ?? "");
      if (this.isDangerousCommand(command)) {
        return {
          allowed: false,
          mode: this.mode,
          reason: `Dangerous command detected: ${command}`,
          request: this.makeRequest(tool, args, level),
        };
      }
    }

    // Default mode: level difference determines behavior
    const currentLevel = this.mode === PermissionMode.AutoEdit ? PermissionLevel.WorkspaceWrite : PermissionLevel.ReadOnly;
    const diff = level - currentLevel;

    if (diff <= 0) {
      return { allowed: true, mode: this.mode };
    } else if (diff === 1) {
      return {
        allowed: false,
        mode: this.mode,
        reason: `Permission required for ${tool}`,
        request: this.makeRequest(tool, args, level),
      };
    } else {
      return {
        allowed: false,
        mode: this.mode,
        reason: `Operation ${tool} requires elevated permissions`,
        request: this.makeRequest(tool, args, level),
      };
    }
  }

  private isPathAllowed(path: string): boolean {
    const resolved = new URL(path, `file://${this.workspaceRoot}/`).pathname;
    const root = new URL(`file://${this.workspaceRoot}/`).pathname;
    return resolved.startsWith(root);
  }

  private isDangerousCommand(command: string): boolean {
    return DANGEROUS_PATTERNS.some((p) => p.test(command));
  }

  private makeRequest(tool: string, args: Record<string, unknown>, level: PermissionLevel): PermissionRequest {
    return {
      id: `${tool}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      tool,
      args,
      level,
      timestamp: Date.now(),
    };
  }
}
