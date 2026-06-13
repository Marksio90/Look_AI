export enum PermissionMode {
  // eslint-disable-next-line no-unused-vars
  Default = "default",       // Ask for changes
  // eslint-disable-next-line no-unused-vars
  AutoEdit = "auto_edit",    // Auto-accept edits
  // eslint-disable-next-line no-unused-vars
  Plan = "plan",             // Read-only, no execution
  // eslint-disable-next-line no-unused-vars
  Auto = "auto",             // Full autonomy
}

export enum PermissionLevel {
  // eslint-disable-next-line no-unused-vars
  ReadOnly = 0,
  // eslint-disable-next-line no-unused-vars
  WorkspaceWrite = 1,
  // eslint-disable-next-line no-unused-vars
  DangerFull = 2,
}

export interface PermissionRule {
  tool: string;
  level: PermissionLevel;
}

export interface PermissionRequest {
  id: string;
  tool: string;
  args: Record<string, unknown>;
  level: PermissionLevel;
  timestamp: number;
}

export interface PermissionDecision {
  allowed: boolean;
  mode: PermissionMode;
  request?: PermissionRequest;
  reason?: string;
}
