import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  ClaudeSessionAdapter,
  GRAPH_TIMEOUT_MS,
  HttpSessionTransport,
  type SessionTransport,
} from '../../src/orchestrator/claude-session-adapter';
import { OrchestratorService } from '../../src/orchestrator/service';

/**
 * The transport's half of the code graph: what it asks a session runner, and
 * how it reads the answer — over real HTTP, against a small server that
 * answers as the runner is specified to (the routes themselves live in the
 * CLI and are not exercised here).
 *
 * The property under test is the same in every case: there is always an
 * answer, it never throws, and when there is no graph to read the answer says
 * why in words. A plan is produced either way, so "unavailable" must never be
 * able to look like a failure — or like silence.
 */

interface Seen {
  method: string;
  path: string;
  body: any;
  authorization?: string;
}

let server: Server;
let baseUrl: string;
let seen: Seen[];
/** What the fake runner answers, per `METHOD path`. `null` means: never answer. */
let answers: Record<string, (() => { status: number; body: unknown; raw?: string }) | null>;
/** Responses left open by a `null` answer, so the server can be closed. */
let hanging: ServerResponse[];

const HEALTH = (capabilities: string[] | undefined) => () => ({
  status: 200,
  body: { status: 'healthy', version: '1.2.0', ...(capabilities ? { capabilities } : {}) },
});

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (chunk) => (raw += chunk));
    req.on('end', () => resolve(raw));
  });
}

beforeEach(async () => {
  seen = [];
  hanging = [];
  answers = { 'GET /v1/health': HEALTH(['isolation', 'code-graph']) };

  server = createServer(async (req, res) => {
    const raw = await readBody(req);
    const key = `${req.method} ${req.url}`;
    seen.push({
      method: req.method ?? '',
      path: req.url ?? '',
      body: raw ? JSON.parse(raw) : undefined,
      authorization: req.headers.authorization,
    });
    const answer = answers[key];
    if (answer === null) {
      hanging.push(res);
      return;
    }
    const { status, body, raw: rawBody } = answer?.() ?? { status: 404, body: { error: 'NOT_FOUND' } };
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(rawBody ?? JSON.stringify(body));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterEach(async () => {
  for (const res of hanging) res.destroy();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

const count = (method: string, path: string) =>
  seen.filter((s) => s.method === method && s.path === path).length;

const DEPENDENTS = { repo: 'acme/storefront', files: ['src/policy.ts', 'src/new.ts'], depth: 1 };
const TESTS = { repo: 'acme/storefront', files: ['src/policy.ts'] };

describe('HttpSessionTransport — what depends on a file', () => {
  it('posts the files to /v1/graph/dependents, authenticated, and returns the lists', async () => {
    answers['POST /v1/graph/dependents'] = () => ({
      status: 200,
      body: {
        available: true,
        byFile: { 'src/policy.ts': ['src/fetch.ts', 'src/fetch.test.ts'], 'src/new.ts': [] },
        truncated: false,
        indexedAt: '2026-10-01T16:08:24.573Z',
      },
    });
    const transport = new HttpSessionTransport(baseUrl, 'secret');

    expect(await transport.graphDependents(DEPENDENTS)).toEqual({
      available: true,
      byFile: { 'src/policy.ts': ['src/fetch.ts', 'src/fetch.test.ts'], 'src/new.ts': [] },
      truncated: false,
      indexedAt: '2026-10-01T16:08:24.573Z',
    });

    const [call] = seen.filter((s) => s.path === '/v1/graph/dependents');
    expect(call.body).toEqual(DEPENDENTS);
    expect(call.authorization).toBe('Bearer secret');
  });

  it('passes on the runner’s own reason when the repository has no index', async () => {
    const reason = 'there is no code graph index at /Users/op/dev/storefront/.codegraph/codegraph.db';
    answers['POST /v1/graph/dependents'] = () => ({ status: 200, body: { available: false, reason } });
    const transport = new HttpSessionTransport(baseUrl);

    expect(await transport.graphDependents(DEPENDENTS)).toEqual({ available: false, reason });

    // It answered, and it is the same runner: nothing to re-ask about.
    await transport.graphDependents(DEPENDENTS);
    expect(count('GET', '/v1/health')).toBe(1);
  });

  it('does not ask a runner that predates the code graph, and says that is why', async () => {
    answers['GET /v1/health'] = HEALTH(['isolation']);
    const transport = new HttpSessionTransport(baseUrl);

    const outcome = await transport.graphDependents(DEPENDENTS);

    expect(outcome).toEqual({
      available: false,
      reason: "the session runner does not report the 'code-graph' capability (it predates the code graph)",
    });
    expect(count('POST', '/v1/graph/dependents')).toBe(0);
  });

  it('notices a runner that has since been upgraded', async () => {
    answers['GET /v1/health'] = HEALTH(undefined); // a runner from before capabilities
    answers['POST /v1/graph/dependents'] = () => ({
      status: 200,
      body: { available: true, byFile: {}, truncated: false, indexedAt: null },
    });
    const transport = new HttpSessionTransport(baseUrl);

    expect((await transport.graphDependents(DEPENDENTS)).available).toBe(false);

    answers['GET /v1/health'] = HEALTH(['isolation', 'code-graph']);
    expect((await transport.graphDependents(DEPENDENTS)).available).toBe(true);
    // Asked again rather than quoting the runner that was there before.
    expect(count('GET', '/v1/health')).toBe(2);
  });

  it('answers, rather than throwing, when the runner is not there', async () => {
    const gone = new HttpSessionTransport('http://127.0.0.1:1');

    const outcome = await gone.graphDependents(DEPENDENTS);

    expect(outcome.available).toBe(false);
    expect(outcome.available === false && outcome.reason).toMatch(/did not answer \/v1\/health/);
  });

  it('puts a refusal into words: the runner’s sentence, or the status when it sent none', async () => {
    answers['POST /v1/graph/dependents'] = () => ({
      status: 400,
      body: { error: 'REPO_NOT_FOUND', message: 'acme/storefront resolves to /work/storefront, which does not exist.' },
    });
    const transport = new HttpSessionTransport(baseUrl);

    expect(await transport.graphDependents(DEPENDENTS)).toEqual({
      available: false,
      reason: 'acme/storefront resolves to /work/storefront, which does not exist.',
    });

    answers['POST /v1/graph/dependents'] = () => ({ status: 500, body: { error: 'INTERNAL' } });
    expect(await transport.graphDependents(DEPENDENTS)).toEqual({
      available: false,
      reason: 'the session runner answered 500 (INTERNAL) when asked for the code graph',
    });
  });

  it('does not act on a 200 that is not a dependents answer', async () => {
    const transport = new HttpSessionTransport(baseUrl);

    for (const body of [
      { ok: true },
      { available: true },
      { available: true, byFile: ['src/a.ts'] },
      { available: true, byFile: { 'src/policy.ts': 'src/fetch.ts' } },
      { available: true, byFile: { 'src/policy.ts': ['src/fetch.ts', 7] } },
    ]) {
      answers['POST /v1/graph/dependents'] = () => ({ status: 200, body });
      const outcome = await transport.graphDependents(DEPENDENTS);
      expect(outcome, JSON.stringify(body)).toEqual({
        available: false,
        reason: 'the session runner answered the code graph request with something that is not a code graph answer',
      });
    }

    answers['POST /v1/graph/dependents'] = () => ({ status: 200, body: null, raw: '<html>proxy error</html>' });
    expect(await transport.graphDependents(DEPENDENTS)).toEqual({
      available: false,
      reason: 'the session runner answered the code graph request with something that is not JSON',
    });
  });

  it('reads the optional fields defensively', async () => {
    answers['POST /v1/graph/dependents'] = () => ({
      status: 200,
      body: { available: true, byFile: { 'src/policy.ts': [] }, truncated: 'yes', indexedAt: 1790873304573 },
    });

    expect(await new HttpSessionTransport(baseUrl).graphDependents(DEPENDENTS)).toEqual({
      available: true,
      byFile: { 'src/policy.ts': [] },
      // Only the literal `true` is a truncation; only a string is a time.
      truncated: false,
      indexedAt: null,
    });
  });

  it('allows a code graph read five seconds', () => {
    expect(GRAPH_TIMEOUT_MS).toBe(5_000);
  });

  it('gives up on a runner that accepts the request and never answers, without waiting the dispatch timeout', async () => {
    answers['POST /v1/graph/dependents'] = null;
    // A dispatch timeout of a minute, and the graph's own limit shortened from
    // its five seconds so this test does not take them.
    const transport = new HttpSessionTransport(baseUrl, undefined, 60_000, 300);

    const started = Date.now();
    const outcome = await transport.graphDependents(DEPENDENTS);
    const elapsed = Date.now() - started;

    expect(outcome).toEqual({
      available: false,
      reason: 'the session runner did not answer the code graph request within 0.3s',
    });
    expect(elapsed).toBeGreaterThanOrEqual(250);
    expect(elapsed).toBeLessThan(3_000);
  });

  it('does not wait the dispatch timeout on a /v1/health that never answers either', async () => {
    answers['GET /v1/health'] = null;
    const transport = new HttpSessionTransport(baseUrl, undefined, 60_000, 300);

    const started = Date.now();
    const outcome = await transport.graphDependents(DEPENDENTS);

    expect(outcome.available).toBe(false);
    expect(outcome.available === false && outcome.reason).toMatch(/did not answer \/v1\/health/);
    expect(Date.now() - started).toBeLessThan(3_000);
    expect(count('POST', '/v1/graph/dependents')).toBe(0);
  });

  it('spends one limit on the whole exchange, not one on each request in it', async () => {
    // /v1/health answers after 200 ms of the 300; the read then has what is left.
    answers['GET /v1/health'] = HEALTH(['code-graph']);
    answers['POST /v1/graph/dependents'] = null;
    const transport = new HttpSessionTransport(baseUrl, undefined, 60_000, 300);

    const original = globalThis.fetch;
    globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      if (String(input).endsWith('/v1/health')) await new Promise<void>((resolve) => setTimeout(resolve, 200));
      return original(input, init);
    }) as typeof fetch;

    try {
      const started = Date.now();
      const outcome = await transport.graphDependents(DEPENDENTS);
      const elapsed = Date.now() - started;

      expect(outcome.available).toBe(false);
      // Two limits back to back would be 500 ms or more.
      expect(elapsed).toBeLessThan(480);
    } finally {
      globalThis.fetch = original;
    }
  });
});

describe('HttpSessionTransport — the tests reached from a file', () => {
  it('posts to /v1/graph/affected-tests and returns the list', async () => {
    answers['POST /v1/graph/affected-tests'] = () => ({
      status: 200,
      body: { available: true, tests: ['src/fetch.test.ts'], truncated: false },
    });
    const transport = new HttpSessionTransport(baseUrl, 'secret');

    expect(await transport.graphAffectedTests(TESTS)).toEqual({
      available: true,
      tests: ['src/fetch.test.ts'],
      truncated: false,
    });

    const [call] = seen.filter((s) => s.path === '/v1/graph/affected-tests');
    expect(call.body).toEqual(TESTS);
    expect(call.authorization).toBe('Bearer secret');
  });

  it('is unavailable, with the reason, in each of the same ways', async () => {
    const transport = new HttpSessionTransport(baseUrl);

    answers['POST /v1/graph/affected-tests'] = () => ({
      status: 200,
      body: { available: false, reason: 'no index' },
    });
    expect(await transport.graphAffectedTests(TESTS)).toEqual({ available: false, reason: 'no index' });

    answers['POST /v1/graph/affected-tests'] = () => ({ status: 200, body: { available: true, tests: 'none' } });
    expect((await transport.graphAffectedTests(TESTS)).available).toBe(false);

    answers['GET /v1/health'] = HEALTH([]);
    const older = new HttpSessionTransport(baseUrl);
    expect(await older.graphAffectedTests(TESTS)).toMatchObject({
      available: false,
      reason: expect.stringMatching(/does not report the 'code-graph' capability/),
    });
  });
});

describe('the code graph through the adapter and the service', () => {
  const bare: SessionTransport = {
    createSession: async () => ({ accepted: true, externalSessionId: 'x' }),
    sendMessage: async () => ({ success: true }),
    stopSession: async () => ({ success: true, message: 'stopped' }),
  };

  it('reaches the runner in claude-session mode', async () => {
    answers['POST /v1/graph/dependents'] = () => ({
      status: 200,
      body: { available: true, byFile: { 'src/policy.ts': ['src/fetch.ts'] }, truncated: false, indexedAt: null },
    });
    const service = new OrchestratorService({ mode: 'claude-session', sessionApiUrl: baseUrl });

    expect(await service.graphDependents(DEPENDENTS)).toMatchObject({
      available: true,
      byFile: { 'src/policy.ts': ['src/fetch.ts'] },
    });
  });

  it('is unavailable for a transport that has no way to ask', async () => {
    const adapter = new ClaudeSessionAdapter({ mode: 'claude-session' }, bare);

    expect(await adapter.graphDependents(DEPENDENTS)).toEqual({
      available: false,
      reason: 'the session transport in use cannot read a code graph',
    });
    expect((await adapter.graphAffectedTests(TESTS)).available).toBe(false);
  });

  it('is unavailable for the modes that are not claude-session, naming the mode', async () => {
    const http = new OrchestratorService({ mode: 'http', url: baseUrl });
    expect(await http.graphDependents(DEPENDENTS)).toEqual({
      available: false,
      reason: "the orchestrator is in 'http' mode, which has no session runner to read a code graph from",
    });
    expect(await http.graphAffectedTests(TESTS)).toEqual({
      available: false,
      reason: "the orchestrator is in 'http' mode, which has no session runner to read a code graph from",
    });

    const disabled = new OrchestratorService({ mode: 'disabled' });
    expect(await disabled.graphDependents(DEPENDENTS)).toMatchObject({
      available: false,
      reason: expect.stringContaining("'disabled' mode"),
    });

    // Nothing was sent anywhere.
    expect(seen).toEqual([]);
  });

  it('turns a transport that throws into an answer', async () => {
    const service = new OrchestratorService(
      { mode: 'claude-session' },
      {
        ...bare,
        graphDependents: async () => {
          throw new Error('socket hang up');
        },
        graphAffectedTests: async () => {
          throw new Error('socket hang up');
        },
      }
    );

    expect(await service.graphDependents(DEPENDENTS)).toEqual({
      available: false,
      reason: 'the code graph could not be read (socket hang up)',
    });
    expect(await service.graphAffectedTests(TESTS)).toEqual({
      available: false,
      reason: 'the code graph could not be read (socket hang up)',
    });
  });
});
