import { describe, it, expect } from 'vitest';
import { GitWorktreeManager } from '../gitWorktree.js';

describe('GitWorktreeManager', () => {
  it('lists worktrees (may be empty)', () => {
    const mgr = new GitWorktreeManager(process.cwd());
    const list = mgr.list();
    expect(Array.isArray(list)).toBe(true);
  });

  it('has correct interface', () => {
    const mgr = new GitWorktreeManager('/tmp');
    expect(typeof mgr.list).toBe('function');
    expect(typeof mgr.create).toBe('function');
    expect(typeof mgr.remove).toBe('function');
  });
});
