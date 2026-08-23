import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest';
import os from 'os';
import path from 'path';
import fs from 'fs';

// Mock axios before importing modules that use it
vi.mock('axios', () => ({
  default: {
    create: vi.fn(() => ({
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
      interceptors: {
        request: { use: vi.fn() },
        response: { use: vi.fn() }
      }
    })),
    get: vi.fn(),
  }
}));

/** Stand-in for StreamableHTTPServerTransport: the registry only needs close(). */
class FakeTransport {
  close = vi.fn(async () => {});
}

describe('HTTP Transport', () => {
  let startHttpTransport: typeof import('../../../src/transport/http.js').startHttpTransport;
  let SessionRegistry: typeof import('../../../src/transport/http.js').SessionRegistry;
  let startSessionReaper: typeof import('../../../src/transport/http.js').startSessionReaper;

  let tmpDir: string;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-test-'));
    process.env.MCP_DATA_DIR = tmpDir;
    process.env.REDMINE_URL = 'https://test.redmine.com';
    process.env.REDMINE_API_KEY = 'test-api-key';

    const mod = await import('../../../src/transport/http.js');
    startHttpTransport = mod.startHttpTransport;
    SessionRegistry = mod.SessionRegistry;
    startSessionReaper = mod.startSessionReaper;
  });

  afterAll(() => {
    delete process.env.REDMINE_URL;
    delete process.env.REDMINE_API_KEY;
    delete process.env.MCP_DATA_DIR;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should export startHttpTransport function', () => {
    expect(startHttpTransport).toBeDefined();
    expect(typeof startHttpTransport).toBe('function');
  });

  it('should start HTTP server and respond to health check', async () => {
    const port = 19876;
    const host = '127.0.0.1';

    const serverPromise = startHttpTransport(port, host);

    // Give the server a moment to start
    await new Promise(resolve => setTimeout(resolve, 500));

    // Test health endpoint (no auth required)
    const response = await fetch(`http://${host}:${port}/health`);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.status).toBe('ok');
    expect(body.sessions).toBe(0);
    expect(body.activeRequests).toBe(0);
    expect(body.oldestSessionAgeMs).toBe(0);
    expect(body.longestIdleMs).toBe(0);
  });

  it('should return 401 for POST /mcp without Bearer token', async () => {
    const port = 19877;
    const host = '127.0.0.1';

    await startHttpTransport(port, host);
    await new Promise(resolve => setTimeout(resolve, 300));

    const response = await fetch(`http://${host}:${port}/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'tools/list', id: 1 }),
    });

    expect(response.status).toBe(401);
  });

  it('should serve OAuth authorization server metadata', async () => {
    const port = 19878;
    const host = '127.0.0.1';

    await startHttpTransport(port, host);
    await new Promise(resolve => setTimeout(resolve, 300));

    const response = await fetch(`http://${host}:${port}/.well-known/oauth-authorization-server`);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body).toHaveProperty('issuer');
    expect(body).toHaveProperty('authorization_endpoint');
    expect(body).toHaveProperty('token_endpoint');
    expect(body).toHaveProperty('registration_endpoint');
  });

  it('should return 400 for GET /mcp without session ID', async () => {
    const port = 19879;
    const host = '127.0.0.1';

    await startHttpTransport(port, host);
    await new Promise(resolve => setTimeout(resolve, 300));

    // GET /mcp requires Bearer auth too
    const response = await fetch(`http://${host}:${port}/mcp`);
    expect(response.status).toBe(401);
  });

  it('should return 401 for DELETE /mcp without auth', async () => {
    const port = 19880;
    const host = '127.0.0.1';

    await startHttpTransport(port, host);
    await new Promise(resolve => setTimeout(resolve, 300));

    const response = await fetch(`http://${host}:${port}/mcp`, { method: 'DELETE' });
    expect(response.status).toBe(401);
  });

  describe('SessionRegistry', () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it('tracks transports and credentials by session ID', () => {
      const registry = new SessionRegistry<FakeTransport>(1000);
      const transport = new FakeTransport();

      registry.add('s1', transport, { redmineApiKey: 'key-1' });

      expect(registry.size).toBe(1);
      expect(registry.has('s1')).toBe(true);
      expect(registry.getTransport('s1')).toBe(transport);
      expect(registry.getCredentials('s1')).toEqual({ redmineApiKey: 'key-1' });
      expect(registry.getTransport('missing')).toBeUndefined();
      expect(registry.getCredentials('missing')).toBeUndefined();
      expect(registry.delete('s1')).toBe(true);
      expect(registry.size).toBe(0);
    });

    it('reaps sessions idle beyond the TTL and closes their transports', async () => {
      vi.useFakeTimers();
      const registry = new SessionRegistry<FakeTransport>(1000);
      const transport = new FakeTransport();
      registry.add('s1', transport, {});

      vi.advanceTimersByTime(999);
      expect(await registry.reapExpired()).toEqual([]);
      expect(registry.size).toBe(1);

      vi.advanceTimersByTime(1);
      expect(await registry.reapExpired()).toEqual(['s1']);
      expect(transport.close).toHaveBeenCalledTimes(1);
      expect(registry.size).toBe(0);
      expect(registry.has('s1')).toBe(false);
    });

    it('keeps sessions that were touched within the TTL', async () => {
      vi.useFakeTimers();
      const registry = new SessionRegistry<FakeTransport>(1000);
      registry.add('s1', new FakeTransport(), {});

      vi.advanceTimersByTime(900);
      registry.touch('s1');
      vi.advanceTimersByTime(900);

      expect(await registry.reapExpired()).toEqual([]);
      expect(registry.size).toBe(1);

      // Touching an unknown session is a no-op
      expect(() => registry.touch('missing')).not.toThrow();
    });

    it('never reaps a session with an in-flight request, and restarts the idle clock on disconnect', async () => {
      vi.useFakeTimers();
      const registry = new SessionRegistry<FakeTransport>(1000);
      registry.add('s1', new FakeTransport(), {});

      // Open SSE stream: session stays alive no matter how long it is idle
      registry.requestStarted('s1');
      vi.advanceTimersByTime(10000);
      expect(registry.expiredSessionIds()).toEqual([]);
      expect(registry.stats().activeRequests).toBe(1);

      // Client disconnects: idle countdown starts from the disconnect, not the connect
      registry.requestEnded('s1');
      expect(registry.stats().activeRequests).toBe(0);
      vi.advanceTimersByTime(999);
      expect(registry.expiredSessionIds()).toEqual([]);

      vi.advanceTimersByTime(1);
      expect(registry.expiredSessionIds()).toEqual(['s1']);

      // Unknown sessions and unbalanced counters are tolerated
      registry.requestStarted('missing');
      registry.requestEnded('s1');
      registry.requestEnded('s1');
      expect(registry.stats().activeRequests).toBe(0);
    });

    it('disables expiry when the TTL is 0', async () => {
      vi.useFakeTimers();
      const registry = new SessionRegistry<FakeTransport>(0);
      const transport = new FakeTransport();
      registry.add('s1', transport, {});

      vi.advanceTimersByTime(24 * 60 * 60 * 1000);

      expect(registry.expiredSessionIds()).toEqual([]);
      expect(await registry.reapExpired()).toEqual([]);
      expect(transport.close).not.toHaveBeenCalled();
      expect(registry.size).toBe(1);
    });

    it('drops the entry even when closing the transport throws', async () => {
      vi.useFakeTimers();
      const registry = new SessionRegistry<FakeTransport>(1000);
      const transport = new FakeTransport();
      transport.close.mockRejectedValueOnce(new Error('boom'));
      registry.add('s1', transport, {});

      vi.advanceTimersByTime(1000);
      expect(await registry.reapExpired()).toEqual(['s1']);
      expect(registry.size).toBe(0);
    });

    it('closes every session on closeAll', async () => {
      const registry = new SessionRegistry<FakeTransport>(1000);
      const a = new FakeTransport();
      const b = new FakeTransport();
      registry.add('a', a, {});
      registry.add('b', b, {});

      await registry.closeAll();

      expect(a.close).toHaveBeenCalledTimes(1);
      expect(b.close).toHaveBeenCalledTimes(1);
      expect(registry.size).toBe(0);
    });

    it('reports session age and idle time in stats', () => {
      vi.useFakeTimers();
      const registry = new SessionRegistry<FakeTransport>(60000);
      expect(registry.stats()).toEqual({
        sessions: 0,
        activeRequests: 0,
        oldestSessionAgeMs: 0,
        longestIdleMs: 0,
      });

      registry.add('old', new FakeTransport(), {});
      vi.advanceTimersByTime(5000);
      registry.add('new', new FakeTransport(), {});
      vi.advanceTimersByTime(1000);
      registry.touch('new');
      vi.advanceTimersByTime(2000);

      expect(registry.stats()).toEqual({
        sessions: 2,
        activeRequests: 0,
        oldestSessionAgeMs: 8000,
        longestIdleMs: 8000,
      });
    });
  });

  describe('startSessionReaper', () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it('is disabled when the sweep interval or the TTL is 0', () => {
      expect(startSessionReaper(new SessionRegistry<FakeTransport>(1000), 0)).toBeUndefined();
      expect(startSessionReaper(new SessionRegistry<FakeTransport>(0), 1000)).toBeUndefined();
    });

    it('unrefs the sweep timer so it cannot keep the process alive', () => {
      const unref = vi.fn();
      const spy = vi
        .spyOn(globalThis, 'setInterval')
        .mockReturnValue({ unref } as unknown as NodeJS.Timeout);

      try {
        const timer = startSessionReaper(new SessionRegistry<FakeTransport>(1000), 500);
        expect(timer).toBeDefined();
        expect(spy).toHaveBeenCalledWith(expect.any(Function), 500);
        expect(unref).toHaveBeenCalledTimes(1);
      } finally {
        spy.mockRestore();
      }
    });

    it('reaps idle sessions on every sweep', async () => {
      vi.useFakeTimers();
      const registry = new SessionRegistry<FakeTransport>(1000);
      const transport = new FakeTransport();
      registry.add('s1', transport, {});

      const timer = startSessionReaper(registry, 500);

      // First sweep: still within the TTL
      await vi.advanceTimersByTimeAsync(500);
      expect(registry.size).toBe(1);

      // Later sweep: idle past the TTL, so the session is closed and evicted
      await vi.advanceTimersByTimeAsync(1000);
      expect(transport.close).toHaveBeenCalledTimes(1);
      expect(registry.size).toBe(0);

      clearInterval(timer);
    });

    it('does not start a sweep while the previous one is still running', async () => {
      vi.useFakeTimers();
      const registry = new SessionRegistry<FakeTransport>(1000);
      const transport = new FakeTransport();
      let release: () => void = () => {};
      transport.close.mockImplementation(
        () => new Promise<void>((resolve) => { release = resolve; })
      );
      registry.add('s1', transport, {});

      const timer = startSessionReaper(registry, 500);

      // Session is idle: the first sweep starts and blocks on close()
      await vi.advanceTimersByTimeAsync(1500);
      expect(transport.close).toHaveBeenCalledTimes(1);

      // Second tick fires while the first sweep is still in flight: skipped
      await vi.advanceTimersByTimeAsync(500);
      expect(transport.close).toHaveBeenCalledTimes(1);

      release();
      await vi.advanceTimersByTimeAsync(500);
      expect(registry.size).toBe(0);

      clearInterval(timer);
    });
  });

  // Sessions now expire, so an unknown session ID is the normal end-of-life path.
  // Bearer auth is stubbed out here so the session checks are actually reached.
  describe('unknown session IDs (auth stubbed)', () => {
    const port = 19881;
    const host = '127.0.0.1';
    const url = `http://${host}:${port}/mcp`;
    const bearerAuthModule = '@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js';

    beforeAll(async () => {
      vi.resetModules();
      vi.doMock(bearerAuthModule, () => ({
        requireBearerAuth: () =>
          (req: { auth?: unknown }, _res: unknown, next: () => void) => {
            req.auth = { extra: {} };
            next();
          },
      }));

      const mod = await import('../../../src/transport/http.js');
      await mod.startHttpTransport(port, host);
    });

    afterAll(() => {
      vi.doUnmock(bearerAuthModule);
      vi.resetModules();
    });

    it('returns 404 Session not found for POST with an unknown session ID', async () => {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'mcp-session-id': 'reaped-session' },
        body: JSON.stringify({ jsonrpc: '2.0', method: 'tools/list', id: 1 }),
      });

      expect(response.status).toBe(404);
      expect(response.headers.get('content-type')).toContain('application/json');
      expect(await response.json()).toEqual({
        jsonrpc: '2.0',
        error: { code: -32001, message: 'Session not found' },
        id: null,
      });
    });

    it('returns 404 for POST with an unknown session ID even for an initialize request', async () => {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'mcp-session-id': 'reaped-session' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'initialize',
          params: {
            protocolVersion: '2025-06-18',
            capabilities: {},
            clientInfo: { name: 'test', version: '1.0.0' },
          },
          id: 1,
        }),
      });

      expect(response.status).toBe(404);
      expect((await response.json()).error.code).toBe(-32001);
    });

    it('still returns 400 for POST without a session ID that is not an initialize request', async () => {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', method: 'tools/list', id: 1 }),
      });

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({
        jsonrpc: '2.0',
        error: { code: -32000, message: 'Bad Request: No valid session ID provided' },
        id: null,
      });
    });

    it('returns 404 for GET /mcp with an unknown session ID', async () => {
      const response = await fetch(url, { headers: { 'mcp-session-id': 'reaped-session' } });

      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({
        jsonrpc: '2.0',
        error: { code: -32001, message: 'Session not found' },
        id: null,
      });
    });

    it('returns 400 for GET /mcp without a session ID', async () => {
      const response = await fetch(url);

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({
        jsonrpc: '2.0',
        error: { code: -32000, message: 'Bad Request: Mcp-Session-Id header is required' },
        id: null,
      });
    });

    it('returns 404 for DELETE /mcp with an unknown session ID', async () => {
      const response = await fetch(url, {
        method: 'DELETE',
        headers: { 'mcp-session-id': 'reaped-session' },
      });

      expect(response.status).toBe(404);
      expect((await response.json()).error).toEqual({
        code: -32001,
        message: 'Session not found',
      });
    });

    it('returns 400 for DELETE /mcp without a session ID', async () => {
      const response = await fetch(url, { method: 'DELETE' });

      expect(response.status).toBe(400);
      expect((await response.json()).error.code).toBe(-32000);
    });
  });

  describe('session TTL configuration', () => {
    it('defaults to a 30 minute TTL swept every 60 seconds', async () => {
      const { config } = await import('../../../src/config.js');
      expect(config.transport.sessionTtl).toBe(1800000);
      expect(config.transport.sessionSweepInterval).toBe(60000);
    });

    it('reads MCP_SESSION_TTL and MCP_SESSION_SWEEP_INTERVAL from the environment', async () => {
      vi.resetModules();
      process.env.MCP_SESSION_TTL = '5000';
      process.env.MCP_SESSION_SWEEP_INTERVAL = '1000';

      try {
        const { config } = await import('../../../src/config.js');
        expect(config.transport.sessionTtl).toBe(5000);
        expect(config.transport.sessionSweepInterval).toBe(1000);
      } finally {
        delete process.env.MCP_SESSION_TTL;
        delete process.env.MCP_SESSION_SWEEP_INTERVAL;
        vi.resetModules();
      }
    });
  });
});
