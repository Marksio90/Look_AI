import { describe, it, expect } from 'vitest';
import { McpMarketplace } from '../marketplace.js';

describe('McpMarketplace', () => {
  it('registers and lists servers', () => {
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
    expect(mp.list()[0].name).toBe('filesystem');
  });

  it('searches by tag', () => {
    const mp = new McpMarketplace();
    mp.register({
      name: 'github',
      description: 'GitHub integration',
      version: '1.0.0',
      publisher: 'lookai',
      transport: 'http',
      url: 'https://github.com/mcp',
      tags: ['git', 'remote'],
      installed: false,
    });
    expect(mp.search('git')).toHaveLength(1);
    expect(mp.search('fs')).toHaveLength(0);
  });

  it('persists installed state', () => {
    const mp = new McpMarketplace();
    mp.register({
      name: 'persist-test',
      description: 'Test',
      version: '1.0.0',
      publisher: 'lookai',
      transport: 'stdio',
      tags: ['test'],
      installed: false,
    });
    expect(mp.install('persist-test')).toBe(true);
    mp.saveInstalled();

    const mp2 = new McpMarketplace();
    mp2.register({
      name: 'persist-test',
      description: 'Test',
      version: '1.0.0',
      publisher: 'lookai',
      transport: 'stdio',
      tags: ['test'],
      installed: false,
    });
    mp2.loadInstalled();
    expect(mp2.getInstalled()).toHaveLength(1);
  });
});
