import { randomUUID } from 'node:crypto';
import https from 'node:https';
import fs from 'node:fs';
import express, { Response } from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { mcpAuthRouter } from '@modelcontextprotocol/sdk/server/auth/router.js';
import { requireBearerAuth } from '@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js';
import { createRedmineServer } from '../server.js';
import { sessionStore, SessionCredentials } from '../context.js';
import { RedmineOAuthProvider, loadStore } from '../auth/index.js';
import { config } from '../config.js';

function log(level: 'INFO' | 'WARN' | 'ERROR', message: string, error?: unknown): void {
  const line = `[${new Date().toISOString()}] [${level}] ${message}`;
  if (error !== undefined) {
    console.error(line, error);
  } else {
    console.error(line);
  }
}

/**
 * Minimal transport surface the session registry depends on.
 * `StreamableHTTPServerTransport` satisfies it; tests can supply a fake.
 */
export interface ClosableTransport {
  close(): Promise<void>;
}

/** Per-session bookkeeping used for idle detection. */
interface SessionEntry<T extends ClosableTransport> {
  transport: T;
  credentials: SessionCredentials;
  /** Epoch ms when the session was initialized. */
  createdAt: number;
  /** Epoch ms of the last request activity observed for this session. */
  lastActivity: number;
  /** Number of HTTP requests (including open SSE streams) currently in flight. */
  openRequests: number;
}

/** Snapshot of registry state, surfaced by the health endpoint. */
export interface SessionRegistryStats {
  sessions: number;
  /** Sessions with at least one in-flight request / open SSE stream. */
  activeRequests: number;
  /** Age of the longest-lived session, in ms (0 when there are no sessions). */
  oldestSessionAgeMs: number;
  /** Idle time of the least recently used session, in ms (0 when there are no sessions). */
  longestIdleMs: number;
}

/**
 * Tracks live MCP sessions and the last time each one was used.
 *
 * The Streamable HTTP transport only removes a session when the client sends an
 * explicit `DELETE /mcp`. Clients that crash, lose the network, or simply exit
 * never send it, so entries (and the `Server` instance bound to each transport)
 * would otherwise be retained forever. The registry adds an idle TTL so those
 * sessions are closed and released.
 */
export class SessionRegistry<T extends ClosableTransport = StreamableHTTPServerTransport> {
  private readonly sessions = new Map<string, SessionEntry<T>>();

  /**
   * @param ttlMs Idle time after which a session is reaped. 0 disables reaping.
   */
  constructor(private readonly ttlMs: number) {}

  get idleTtlMs(): number {
    return this.ttlMs;
  }

  get size(): number {
    return this.sessions.size;
  }

  has(sessionId: string): boolean {
    return this.sessions.has(sessionId);
  }

  getTransport(sessionId: string): T | undefined {
    return this.sessions.get(sessionId)?.transport;
  }

  getCredentials(sessionId: string): SessionCredentials | undefined {
    return this.sessions.get(sessionId)?.credentials;
  }

  add(sessionId: string, transport: T, credentials: SessionCredentials): void {
    const now = Date.now();
    this.sessions.set(sessionId, {
      transport,
      credentials,
      createdAt: now,
      lastActivity: now,
      openRequests: 0,
    });
  }

  delete(sessionId: string): boolean {
    return this.sessions.delete(sessionId);
  }

  /** Marks the session as used right now. */
  touch(sessionId: string): void {
    const entry = this.sessions.get(sessionId);
    if (entry) {
      entry.lastActivity = Date.now();
    }
  }

  /** Registers an in-flight request. Sessions with in-flight requests are never reaped. */
  requestStarted(sessionId: string): void {
    const entry = this.sessions.get(sessionId);
    if (entry) {
      entry.openRequests += 1;
      entry.lastActivity = Date.now();
    }
  }

  /**
   * Registers the end of an in-flight request. The idle clock restarts here, so a
   * client that drops its SSE stream starts expiring from the moment it disconnected.
   */
  requestEnded(sessionId: string): void {
    const entry = this.sessions.get(sessionId);
    if (entry) {
      entry.openRequests = Math.max(0, entry.openRequests - 1);
      entry.lastActivity = Date.now();
    }
  }

  /** Session IDs idle for longer than the TTL with no request in flight. */
  expiredSessionIds(): string[] {
    if (this.ttlMs <= 0) {
      return [];
    }
    const now = Date.now();
    const expired: string[] = [];
    for (const [sessionId, entry] of this.sessions) {
      if (entry.openRequests > 0) {
        continue;
      }
      if (now - entry.lastActivity >= this.ttlMs) {
        expired.push(sessionId);
      }
    }
    return expired;
  }

  /** Closes every session idle beyond the TTL. Returns the IDs that were reaped. */
  async reapExpired(): Promise<string[]> {
    const expired = this.expiredSessionIds();
    for (const sessionId of expired) {
      await this.closeSession(sessionId);
    }
    return expired;
  }

  /** Closes every session (used on shutdown). */
  async closeAll(): Promise<void> {
    for (const sessionId of [...this.sessions.keys()]) {
      await this.closeSession(sessionId);
    }
  }

  /**
   * Closes the transport so its `onclose` handler runs — that releases the bound
   * `Server` instance — and drops the entry even if closing failed.
   */
  private async closeSession(sessionId: string): Promise<void> {
    const entry = this.sessions.get(sessionId);
    if (!entry) {
      return;
    }
    try {
      await entry.transport.close();
    } catch (error) {
      log('ERROR', `Error closing session ${sessionId}:`, error);
    } finally {
      this.sessions.delete(sessionId);
    }
  }

  stats(): SessionRegistryStats {
    const now = Date.now();
    let activeRequests = 0;
    let oldestSessionAgeMs = 0;
    let longestIdleMs = 0;
    for (const entry of this.sessions.values()) {
      if (entry.openRequests > 0) {
        activeRequests += 1;
      }
      oldestSessionAgeMs = Math.max(oldestSessionAgeMs, now - entry.createdAt);
      longestIdleMs = Math.max(longestIdleMs, now - entry.lastActivity);
    }
    return { sessions: this.sessions.size, activeRequests, oldestSessionAgeMs, longestIdleMs };
  }
}

/**
 * Starts the periodic idle-session sweep.
 *
 * Returns `undefined` when reaping is disabled (TTL or interval set to 0). The
 * timer is `unref()`ed so it never keeps the Node process alive on its own.
 */
export function startSessionReaper<T extends ClosableTransport>(
  registry: SessionRegistry<T>,
  intervalMs: number
): NodeJS.Timeout | undefined {
  if (intervalMs <= 0 || registry.idleTtlMs <= 0) {
    log('INFO', 'Idle session reaping is disabled');
    return undefined;
  }

  let sweeping = false;
  const timer = setInterval(() => {
    if (sweeping) {
      return;
    }
    sweeping = true;
    void registry
      .reapExpired()
      .then((reaped) => {
        if (reaped.length > 0) {
          log('INFO', `Reaped ${reaped.length} idle session(s): ${reaped.join(', ')}`);
        }
      })
      .catch((error) => {
        log('ERROR', 'Idle session sweep failed:', error);
      })
      .finally(() => {
        sweeping = false;
      });
  }, intervalMs);

  timer.unref();
  log(
    'INFO',
    `Idle session reaping enabled (ttl=${registry.idleTtlMs}ms, interval=${intervalMs}ms)`
  );
  return timer;
}

/**
 * Keeps a session alive for as long as its HTTP request/SSE stream is open, and
 * restarts its idle clock when the client disconnects.
 */
function trackRequest(
  registry: SessionRegistry<StreamableHTTPServerTransport>,
  sessionId: string,
  res: Response
): void {
  registry.requestStarted(sessionId);
  res.once('close', () => {
    registry.requestEnded(sessionId);
  });
}

/** JSON-RPC error code the SDK uses for a malformed request (missing session ID). */
const JSONRPC_BAD_REQUEST = -32000;
/** JSON-RPC error code the SDK uses for an unknown/terminated session. */
const JSONRPC_SESSION_NOT_FOUND = -32001;

/** Mirrors the SDK's `createJsonErrorResponse` body so clients see a consistent shape. */
function sendJsonRpcError(res: Response, status: number, code: number, message: string): void {
  res.status(status).json({ jsonrpc: '2.0', error: { code, message }, id: null });
}

/**
 * Reply to a request carrying a session ID the server no longer knows.
 *
 * Sessions now expire on idle, so this is the normal end-of-life path rather than
 * a client bug. The MCP spec (and the SDK's own `validateSession`) requires 404 +
 * -32001 here: it is the only signal that tells a client to re-initialize instead
 * of treating the request as malformed.
 */
function sendSessionNotFound(res: Response): void {
  sendJsonRpcError(res, 404, JSONRPC_SESSION_NOT_FOUND, 'Session not found');
}

export async function startHttpTransport(port: number, host: string): Promise<void> {
  // Load persisted OAuth data on startup
  loadStore();

  const provider = new RedmineOAuthProvider(config.redmine.url);

  // Determine issuerUrl
  const tlsConfig =
    config.transport.tlsCert && config.transport.tlsKey
      ? { certPath: config.transport.tlsCert, keyPath: config.transport.tlsKey }
      : undefined;
  let issuerUrl: URL;

  if (config.transport.issuerUrl) {
    issuerUrl = new URL(config.transport.issuerUrl);
  } else if (tlsConfig) {
    issuerUrl = new URL(`https://${host === '0.0.0.0' ? 'localhost' : host}:${port}`);
  } else {
    issuerUrl = new URL(`http://localhost:${port}`);
  }

  const app = express();

  // Trust proxy for correct protocol detection behind reverse proxies
  app.set('trust proxy', 1);

  // Parse URL-encoded form data (for auth callback)
  app.use(express.urlencoded({ extended: false }));

  // Parse JSON bodies
  app.use(express.json());

  // Mount OAuth endpoints (/.well-known/*, /authorize, /token, /register, /revoke)
  app.use(
    mcpAuthRouter({
      provider,
      issuerUrl,
      serviceDocumentationUrl: new URL(config.redmine.url),
    })
  );

  // Auth callback: form POST from the auth page
  app.post('/authorize/callback', async (req, res) => {
    try {
      await provider.handleAuthCallback(req, res);
    } catch (error) {
      log('ERROR', 'Auth callback error:', error);
      if (!res.headersSent) {
        res.status(500).send('Internal server error');
      }
    }
  });

  // Bearer auth middleware for MCP endpoints
  const bearerAuth = requireBearerAuth({ verifier: provider });

  const sessions = new SessionRegistry<StreamableHTTPServerTransport>(config.transport.sessionTtl);
  const reaper = startSessionReaper(sessions, config.transport.sessionSweepInterval);

  // POST /mcp — JSON-RPC message handling
  app.post('/mcp', bearerAuth, async (req, res) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;

    // Extract Redmine API key from verified auth info
    const credentials: SessionCredentials = {
      redmineApiKey: (req.auth?.extra as Record<string, unknown> | undefined)?.redmineApiKey as string | undefined,
    };

    try {
      let transport: StreamableHTTPServerTransport;

      if (sessionId) {
        if (!sessions.has(sessionId)) {
          // Expired (reaped) or bogus session: tell the client to re-initialize.
          sendSessionNotFound(res);
          return;
        }
        transport = sessions.getTransport(sessionId) as StreamableHTTPServerTransport;
        trackRequest(sessions, sessionId, res);

        await sessionStore.run(credentials, async () => {
          await transport.handleRequest(req, res, req.body);
        });
        return;
      } else if (isInitializeRequest(req.body)) {
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (sid) => {
            log('INFO', `Session initialized: ${sid}`);
            sessions.add(sid, transport, credentials);
            trackRequest(sessions, sid, res);
          },
        });

        // Note: Protocol.connect() chains onto this handler rather than replacing it.
        transport.onclose = () => {
          const sid = transport.sessionId;
          if (sid && sessions.delete(sid)) {
            log('INFO', `Session closed: ${sid}`);
          }
        };

        const server = await createRedmineServer();
        await server.connect(transport);

        await sessionStore.run(credentials, async () => {
          await transport.handleRequest(req, res, req.body);
        });
        return;
      } else {
        // No session ID at all and not an initialize request: genuinely malformed.
        sendJsonRpcError(res, 400, JSONRPC_BAD_REQUEST, 'Bad Request: No valid session ID provided');
        return;
      }
    } catch (error) {
      log('ERROR', 'MCP request error:', error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: { code: -32603, message: 'Internal server error' },
          id: null,
        });
      }
    }
  });

  // GET /mcp — SSE stream
  app.get('/mcp', bearerAuth, async (req, res) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    if (!sessionId) {
      sendJsonRpcError(res, 400, JSONRPC_BAD_REQUEST, 'Bad Request: Mcp-Session-Id header is required');
      return;
    }
    if (!sessions.has(sessionId)) {
      sendSessionNotFound(res);
      return;
    }
    const transport = sessions.getTransport(sessionId) as StreamableHTTPServerTransport;
    const credentials = sessions.getCredentials(sessionId) ?? {};
    // The stream keeps the session alive while it is open; when the client goes
    // away the 'close' event restarts the idle clock so the TTL can expire it.
    trackRequest(sessions, sessionId, res);
    await sessionStore.run(credentials, async () => {
      await transport.handleRequest(req, res);
    });
  });

  // DELETE /mcp — session termination
  app.delete('/mcp', bearerAuth, async (req, res) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    if (!sessionId) {
      sendJsonRpcError(res, 400, JSONRPC_BAD_REQUEST, 'Bad Request: Mcp-Session-Id header is required');
      return;
    }
    if (!sessions.has(sessionId)) {
      // Deleting an already-reaped session is not an error the client can fix by
      // retrying, but 404 is what the spec and the SDK return.
      sendSessionNotFound(res);
      return;
    }
    const transport = sessions.getTransport(sessionId) as StreamableHTTPServerTransport;
    sessions.touch(sessionId);
    await transport.handleRequest(req, res);
  });

  // GET /health — health check (no auth required)
  app.get('/health', (_req, res) => {
    const stats = sessions.stats();
    res.json({ status: 'ok', ...stats });
  });

  // Start server (HTTPS if TLS configured, HTTP otherwise)
  return new Promise((resolve) => {
    let server: ReturnType<typeof https.createServer> | ReturnType<typeof app.listen>;

    if (tlsConfig) {
      const cert = fs.readFileSync(tlsConfig.certPath);
      const key = fs.readFileSync(tlsConfig.keyPath);
      server = https.createServer({ cert, key }, app);
      server.listen(port, host, () => {
        log('INFO', `Streamable HTTP server listening on https://${host}:${port}`);
        resolve();
      });
    } else {
      server = app.listen(port, host, () => {
        log('INFO', `Streamable HTTP server listening on http://${host}:${port}`);
        resolve();
      });
    }

    // Graceful shutdown
    const shutdown = async (signal: string) => {
      log('INFO', `Received ${signal}, shutting down...`);
      if (reaper) {
        clearInterval(reaper);
      }
      await sessions.closeAll();
      (server as ReturnType<typeof app.listen>).close(() => {
        log('INFO', 'Server shutdown complete');
        process.exit(0);
      });
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
  });
}
