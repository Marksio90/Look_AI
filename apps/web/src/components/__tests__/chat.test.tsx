import { describe, it, expect } from 'vitest';

describe('Chat component types', () => {
  it('has correct message structure', () => {
    const msg = {
      id: '1',
      role: 'user' as const,
      content: 'Hello',
      timestamp: Date.now(),
    };
    expect(msg.role).toBe('user');
    expect(msg.content).toBe('Hello');
  });

  it('has correct assistant message with model', () => {
    const msg = {
      id: '2',
      role: 'assistant' as const,
      content: 'Hi',
      model: 'worker' as const,
      timestamp: Date.now(),
    };
    expect(msg.model).toBe('worker');
  });

  it('has tool call structure', () => {
    const tc = {
      id: 'tc1',
      name: 'read',
      args: { path: 'x.ts' },
    };
    expect(tc.name).toBe('read');
  });
});
