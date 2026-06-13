import { describe, it, expect } from 'vitest';
import { HookEngine } from '../hooks/engine.js';

describe('HookEngine loadFromDir', () => {
  it('loads from non-existent dir without error', async () => {
    const engine = new HookEngine();
    await engine.loadFromDir('/nonexistent/path');
    expect(typeof engine.runPreHooks).toBe('function');
  });

  it('has correct interface', () => {
    const engine = new HookEngine();
    expect(typeof engine.loadFromDir).toBe('function');
    expect(typeof engine.register).toBe('function');
    expect(typeof engine.runPreHooks).toBe('function');
    expect(typeof engine.runPostHooks).toBe('function');
  });
});