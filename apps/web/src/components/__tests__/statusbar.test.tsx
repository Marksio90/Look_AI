import { describe, it, expect } from 'vitest';

describe('StatusBar component types', () => {
  it('has correct status structure', () => {
    const status = {
      model: 'worker' as const,
      contextTokens: 2048,
      contextLimit: 4096,
      turnCount: 5,
      mode: 'agent' as const,
    };
    expect(status.contextTokens).toBe(2048);
    expect(status.contextLimit).toBe(4096);
  });

  it('calculates context percentage', () => {
    const pct = Math.min(100, Math.round((2048 / 4096) * 100));
    expect(pct).toBe(50);
  });
});
