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

  it('saves and loads from disk', () => {
    const store = new TrajectoryStore();
    const traj = store.start('s1');
    store.addStep(traj.id, { turn: 1, timestamp: Date.now(), role: 'user', content: 'Hello' });
    store.finish(traj.id, 'success', 0.9);
    store.saveToDisk(traj.id);

    const store2 = new TrajectoryStore();
    store2.loadFromDisk();
    const loaded = store2.get(traj.id);
    expect(loaded).toBeDefined();
    expect(loaded!.outcome).toBe('success');
    expect(loaded!.score).toBe(0.9);
    expect(loaded!.steps).toHaveLength(1);
  });

  it('lists from disk index', () => {
    const store = new TrajectoryStore();
    const traj = store.start('s2');
    store.finish(traj.id, 'failure');
    store.saveToDisk(traj.id);

    const list = store.listFromDisk();
    expect(list.length).toBeGreaterThan(0);
    expect(list.some((l) => l.id === traj.id && l.outcome === 'failure')).toBe(true);
  });
});
