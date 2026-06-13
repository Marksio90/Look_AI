import { describe, it, expect } from 'vitest';
import { TrajectoryStore } from '../trajectory.js';

describe('TrajectoryStore', () => {
  it('starts and tracks a trajectory', () => {
    const store = new TrajectoryStore();
    const traj = store.start('session-1', { task: 'fix-bug' });
    expect(traj.outcome).toBe('in_progress');
    expect(traj.sessionId).toBe('session-1');
    expect(traj.metadata.task).toBe('fix-bug');
  });

  it('adds steps and finishes', () => {
    const store = new TrajectoryStore();
    const traj = store.start('s1');
    store.addStep(traj.id, {
      turn: 1,
      timestamp: Date.now(),
      role: 'user',
      content: 'Fix the bug',
    });
    store.addStep(traj.id, {
      turn: 2,
      timestamp: Date.now(),
      role: 'assistant',
      model: 'worker',
      content: 'Done',
      toolCalls: [{ name: 'edit', args: { path: 'x.ts' }, result: 'ok', ok: true }],
    });
    store.finish(traj.id, 'success', 0.95);
    const finished = store.get(traj.id)!;
    expect(finished.outcome).toBe('success');
    expect(finished.score).toBe(0.95);
    expect(finished.steps).toHaveLength(2);
    expect(finished.endTime).toBeDefined();
  });

  it('filters by outcome', () => {
    const store = new TrajectoryStore();
    const t1 = store.start('s1');
    store.finish(t1.id, 'success');
    const t2 = store.start('s2');
    store.finish(t2.id, 'failure');
    expect(store.filterByOutcome('success')).toHaveLength(1);
    expect(store.filterByOutcome('failure')).toHaveLength(1);
  });

  it('exports JSON', () => {
    const store = new TrajectoryStore();
    store.start('s1');
    const json = store.exportJson();
    expect(JSON.parse(json)).toHaveLength(1);
  });
});
