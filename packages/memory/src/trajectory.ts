import { z } from 'zod';

export interface TrajectoryStep {
  turn: number;
  timestamp: number;
  role: 'user' | 'assistant' | 'system';
  model?: string;
  content: string;
  toolCalls?: Array<{
    name: string;
    args: Record<string, unknown>;
    result: string;
    ok: boolean;
  }>;
}

export interface Trajectory {
  id: string;
  sessionId: string;
  startTime: number;
  endTime?: number;
  steps: TrajectoryStep[];
  outcome: 'success' | 'failure' | 'abandoned' | 'in_progress';
  score?: number;
  metadata: Record<string, unknown>;
}

export class TrajectoryStore {
  private trajectories: Map<string, Trajectory> = new Map();

  start(sessionId: string, metadata: Record<string, unknown> = {}): Trajectory {
    const id = `traj_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const trajectory: Trajectory = {
      id,
      sessionId,
      startTime: Date.now(),
      steps: [],
      outcome: 'in_progress',
      metadata,
    };
    this.trajectories.set(id, trajectory);
    return trajectory;
  }

  addStep(trajectoryId: string, step: TrajectoryStep): void {
    const traj = this.trajectories.get(trajectoryId);
    if (!traj) throw new Error(`Trajectory ${trajectoryId} not found`);
    traj.steps.push(step);
  }

  finish(trajectoryId: string, outcome: Trajectory['outcome'], score?: number): void {
    const traj = this.trajectories.get(trajectoryId);
    if (!traj) throw new Error(`Trajectory ${trajectoryId} not found`);
    traj.endTime = Date.now();
    traj.outcome = outcome;
    if (score !== undefined) traj.score = score;
  }

  get(id: string): Trajectory | undefined {
    return this.trajectories.get(id);
  }

  list(): Trajectory[] {
    return Array.from(this.trajectories.values());
  }

  filterByOutcome(outcome: Trajectory['outcome']): Trajectory[] {
    return this.list().filter((t) => t.outcome === outcome);
  }

  exportJson(): string {
    return JSON.stringify(this.list(), null, 2);
  }
}

export const TrajectoryStepSchema = z.object({
  turn: z.number(),
  timestamp: z.number(),
  role: z.enum(['user', 'assistant', 'system']),
  model: z.string().optional(),
  content: z.string(),
  toolCalls: z.array(z.object({
    name: z.string(),
    args: z.record(z.unknown()),
    result: z.string(),
    ok: z.boolean(),
  })).optional(),
});

export const TrajectorySchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  startTime: z.number(),
  endTime: z.number().optional(),
  steps: z.array(TrajectoryStepSchema),
  outcome: z.enum(['success', 'failure', 'abandoned', 'in_progress']),
  score: z.number().optional(),
  metadata: z.record(z.unknown()),
});
