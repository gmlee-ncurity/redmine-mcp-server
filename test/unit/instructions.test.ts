import { describe, it, expect } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { buildInstructions, redmineWebBase } from '../../src/instructions.js';
import { createRedmineServer } from '../../src/server.js';

describe('redmineWebBase', () => {
  it('drops the trailing slash', () => {
    expect(redmineWebBase('https://redmine.example.com/')).toBe('https://redmine.example.com');
  });

  it('keeps a sub-path deployment', () => {
    expect(redmineWebBase('https://example.com/redmine/')).toBe('https://example.com/redmine');
  });

  it('removes credentials, query and fragment', () => {
    expect(redmineWebBase('https://user:secret@redmine.example.com/?key=abc#top')).toBe(
      'https://redmine.example.com'
    );
  });
});

describe('buildInstructions', () => {
  it('builds issue links from the configured address only', () => {
    const text = buildInstructions('https://redmine.example.com/');
    expect(text).toContain('https://redmine.example.com/issues/<id>');
    expect(text).not.toContain('https://redmine.example.com//');
  });

  it('never exposes credentials embedded in REDMINE_URL', () => {
    const text = buildInstructions('https://user:secret@redmine.example.com');
    expect(text).not.toContain('secret');
    expect(text).not.toContain('user@');
  });
});

describe('server instructions', () => {
  it('reach the client at initialization, built from REDMINE_URL', async () => {
    const server = await createRedmineServer();
    const client = new Client({ name: 'test-client', version: '0.0.0' });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    try {
      // vitest.config.ts sets REDMINE_URL=https://test.redmine.com
      expect(client.getInstructions()).toContain('https://test.redmine.com/issues/<id>');
    } finally {
      await client.close();
    }
  });
});
