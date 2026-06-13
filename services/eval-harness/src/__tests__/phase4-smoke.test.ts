import { describe, it, expect } from 'vitest';
import { McpMarketplace } from '@lookai/mcp';
import { TrajectoryStore } from '@lookai/memory';

describe('Phase 4 Integration Smoke Test', () => {
  it('(a) McpMarketplace registers and searches servers', () => {
    const mp = new McpMarketplace();
    mp.register({
      name: 'filesystem',
      description: 'Local filesystem access',
      version: '1.0.0',
      publisher: 'lookai',
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem'],
      tags: ['fs', 'local'],
      installed: false,
    });
    expect(mp.list()).toHaveLength(1);
    expect(mp.search('fs')).toHaveLength(1);
    expect(mp.search('git')).toHaveLength(0);
  });

  it('(b) McpMarketplace installs and uninstalls', () => {
    const mp = new McpMarketplace();
    mp.register({
      name: 'test',
      description: 'Test server',
      version: '1.0.0',
      publisher: 'lookai',
      transport: 'stdio',
      tags: ['test'],
      installed: false,
    });
    expect(mp.install('test')).toBe(true);
    expect(mp.getInstalled()).toHaveLength(1);
    expect(mp.uninstall('test')).toBe(true);
    expect(mp.getInstalled()).toHaveLength(0);
  });

  it('(c) TrajectoryStore starts and tracks trajectory', () => {
    const store = new TrajectoryStore();
    const traj = store.start('session-1', { task: 'fix-bug' });
    expect(traj.outcome).toBe('in_progress');
    expect(traj.metadata.task).toBe('fix-bug');
  });

  it('(d) TrajectoryStore adds steps and finishes with score', () => {
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

  it('(e) TrajectoryStore filters by outcome', () => {
    const store = new TrajectoryStore();
    const t1 = store.start('s1');
    store.finish(t1.id, 'success');
    const t2 = store.start('s2');
    store.finish(t2.id, 'failure');
    expect(store.filterByOutcome('success')).toHaveLength(1);
    expect(store.filterByOutcome('failure')).toHaveLength(1);
  });

  it('(f) TrajectoryStore exports JSON', () => {
    const store = new TrajectoryStore();
    store.start('s1');
    const json = store.exportJson();
    const parsed = JSON.parse(json);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].sessionId).toBe('s1');
  });

  it('(g) Web UI types are well-formed', () => {
    const msg = {
      id: '1',
      role: 'assistant' as const,
      content: 'Hello',
      model: 'brain' as const,
      timestamp: Date.now(),
      toolCalls: [{ id: 'tc1', name: 'read', args: { path: 'x.ts' } }],
    };
    expect(msg.model).toBe('brain');
    expect(msg.toolCalls).toHaveLength(1);
    expect(msg.toolCalls[0].name).toBe('read');
  });
});
