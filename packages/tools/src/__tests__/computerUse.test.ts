import { describe, it, expect } from 'vitest';
import { ComputerUse, ComputerActionSchema } from '../computerUse.js';

describe('ComputerUse', () => {
  it('has correct schema', () => {
    const action = { action: 'navigate' as const, url: 'https://example.com' };
    const parsed = ComputerActionSchema.parse(action);
    expect(parsed.action).toBe('navigate');
  });

  it('has correct interface', () => {
    const cu = new ComputerUse();
    expect(typeof cu.start).toBe('function');
    expect(typeof cu.execute).toBe('function');
    expect(typeof cu.stop).toBe('function');
  });
});
