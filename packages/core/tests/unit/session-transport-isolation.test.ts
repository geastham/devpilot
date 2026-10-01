import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  ClaudeSessionAdapter,
  HttpSessionTransport,
  type CreateSessionParams,
  type SessionTransport,
} from '../../src/orchestrator/claude-session-adapter';
import { OrchestratorService } from '../../src/orchestrator/service';

/**
 * The transport's half of "a branch per task": what it asks the runner, what it
 * refuses to send, and how it reads the answers — over real HTTP, against a
 * small server that answers as a session runner does.
 *
 * The one thing this exists to pin: `isolation` is never sent to a runner that
 * has not said it understands it. A runner from before the capability ignores
 * a field it does not know, so the task would run in the shared checkout while
 * the plan row said it was isolated, and nothing would say otherwise until the
 * wave's merge found no branch.
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
/** What the fake runner answers, per `METHOD path`. */
let answers: Record<string, () => { status: number; body: unknown }>;

const HEALTH_WITH_ISOLATION = () => ({
  status: 200,
  body: { status: 'healthy', version: '1.1.0', capabilities: ['isolation'] },
});
const CREATED = () => ({ status: 201, body: { externalSessionId: 'run_1', status: 'queued' } });

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (chunk) => (raw += chunk));
    req.on('end', () => resolve(raw));
  });
}

beforeEach(async () => {
  seen = [];
  answers = { 'GET /v1/health': HEALTH_WITH_ISOLATION, 'POST /v1/sessions': CREATED };

  server = createServer(async (req, res) => {
    const raw = await readBody(req);
    const key = `${req.method} ${req.url}`;
    seen.push({
      method: req.method ?? '',
      path: req.url ?? '',
      body: raw ? JSON.parse(raw) : undefined,
      authorization: req.headers.authorization,
    });
    const answer = answers[key]?.() ?? { status: 404, body: { error: 'NOT_FOUND' } };
    res.writeHead(answer.status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(answer.body));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterEach(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

const count = (method: string, path: string) =>
  seen.filter((s) => s.method === method && s.path === path).length;

function params(overrides: Partial<CreateSessionParams> = {}): CreateSessionParams {
  return {
    sessionId: 'sess_1',
    repo: 'acme/storefront',
    prompt: 'do the task',
    callbackUrl: 'http://localhost:3000/api/orchestrator',
    ...overrides,
  };
}

const ISOLATION = { runId: 'AVA-12-k3x9qd', taskCode: '1.1', title: 'Add the retry' };

describe('HttpSessionTransport — sending a task as one of a run', () => {
  it('sends isolation to a runner that says it can, and asks only once', async () => {
    const transport = new HttpSessionTransport(baseUrl, 'secret');

    const first = await transport.createSession(params({ isolation: ISOLATION }));
    const second = await transport.createSession(
      params({ sessionId: 'sess_2', isolation: { ...ISOLATION, taskCode: '1.2' } })
    );

    expect(first).toEqual({ accepted: true, externalSessionId: 'run_1' });
    expect(second.accepted).toBe(true);

    const creates = seen.filter((s) => s.path === '/v1/sessions');
    expect(creates.map((c) => c.body.isolation)).toEqual([
      ISOLATION,
      { ...ISOLATION, taskCode: '1.2' },
    ]);
    // A wave is many creates; the capability is read once and remembered.
    expect(count('GET', '/v1/health')).toBe(1);
  });

  it('does not put the field in the body at all for a plain dispatch', async () => {
    const adapter = new ClaudeSessionAdapter({ mode: 'claude-session' }, new HttpSessionTransport(baseUrl));

    await adapter.dispatch({
      sessionId: 'sess_1',
      repo: 'acme/storefront',
      callbackUrl: 'http://localhost:3000/api/orchestrator',
      taskSpec: { prompt: 'do the task', filePaths: [], model: 'sonnet' },
    });

    const [create] = seen.filter((s) => s.path === '/v1/sessions');
    expect('isolation' in create.body).toBe(false);
    // And nobody asked the runner what it can do: nothing depended on it.
    expect(count('GET', '/v1/health')).toBe(0);
  });

  it('refuses to send isolation to a runner that predates it — and sends nothing', async () => {
    // An older runner: it answers /v1/health and lists no capabilities.
    answers['GET /v1/health'] = () => ({ status: 200, body: { status: 'healthy', version: '1.0.0' } });
    const transport = new HttpSessionTransport(baseUrl);

    const result = await transport.createSession(params({ isolation: ISOLATION }));

    expect(result.accepted).toBe(false);
    expect(result.error).toMatch(/^ISOLATION_UNAVAILABLE: .*does not report that it can/);
    // The agent was not started in the shared checkout instead.
    expect(count('POST', '/v1/sessions')).toBe(0);

    // A dispatch that does not ask for a branch is unaffected.
    expect((await transport.createSession(params())).accepted).toBe(true);
    expect(count('POST', '/v1/sessions')).toBe(1);
  });

  it('refuses when the runner cannot be asked', async () => {
    answers['GET /v1/health'] = () => ({ status: 503, body: {} });
    const transport = new HttpSessionTransport(baseUrl);

    const result = await transport.createSession(params({ isolation: ISOLATION }));

    expect(result.accepted).toBe(false);
    expect(result.error).toMatch(/^ISOLATION_UNAVAILABLE: .*did not answer/);
    expect(count('POST', '/v1/sessions')).toBe(0);
  });

  it('asks the runner again after it fails to do something', async () => {
    const transport = new HttpSessionTransport(baseUrl);

    await transport.createSession(params({ isolation: ISOLATION }));
    expect(count('GET', '/v1/health')).toBe(1);

    // The runner fails a create. It may not be the same runner any more.
    answers['POST /v1/sessions'] = () => ({ status: 500, body: { error: 'INTERNAL' } });
    expect((await transport.createSession(params({ isolation: ISOLATION }))).accepted).toBe(false);

    // …and it is not: it has been put back to a version that cannot isolate.
    answers['GET /v1/health'] = () => ({ status: 200, body: { status: 'healthy', version: '1.0.0' } });
    answers['POST /v1/sessions'] = CREATED;
    const after = await transport.createSession(params({ isolation: ISOLATION }));

    expect(count('GET', '/v1/health')).toBe(2);
    expect(after.accepted).toBe(false);
    expect(after.error).toMatch(/^ISOLATION_UNAVAILABLE/);
  });

  it('does not treat a full runner as a failed one', async () => {
    const transport = new HttpSessionTransport(baseUrl);
    answers['POST /v1/sessions'] = () => ({ status: 429, body: { error: 'CAPACITY' } });

    expect(await transport.createSession(params({ isolation: ISOLATION }))).toEqual({
      accepted: false,
      error: 'CAPACITY',
    });
    await transport.createSession(params({ isolation: ISOLATION }));

    expect(count('GET', '/v1/health')).toBe(1);
  });

  it('passes on the runner’s reason when it can isolate in general and not here', async () => {
    answers['POST /v1/sessions'] = () => ({
      status: 400,
      body: {
        error: 'ISOLATION_UNAVAILABLE',
        message: '/work/notes is not a git repository, so a task cannot be given its own branch there.',
      },
    });
    const transport = new HttpSessionTransport(baseUrl);

    expect(await transport.createSession(params({ isolation: ISOLATION }))).toEqual({
      accepted: false,
      error:
        'ISOLATION_UNAVAILABLE: /work/notes is not a git repository, so a task cannot be given ' +
        'its own branch there.',
    });
  });
});

describe('HttpSessionTransport — merging a wave', () => {
  const request = { repo: 'acme/storefront', runId: 'AVA-12-k3x9qd', taskCodes: ['1.1', '1.2'] };

  it('posts the wave to /v1/integrate, authenticated, and returns what was merged', async () => {
    const result = {
      runBranch: 'devpilot/AVA-12-k3x9qd/run',
      headSha: 'abc123',
      merged: [
        { taskCode: '1.1', branch: 'devpilot/AVA-12-k3x9qd/task-1.1', commitSha: 'c1', alreadyMerged: false },
      ],
      conflicts: [{ taskCode: '1.2', branch: 'devpilot/AVA-12-k3x9qd/task-1.2', files: ['src/a.ts'] }],
      missing: [],
    };
    answers['POST /v1/integrate'] = () => ({ status: 200, body: result });
    const transport = new HttpSessionTransport(baseUrl, 'secret');

    expect(await transport.integrate(request)).toEqual({ ok: true, result });

    const [call] = seen.filter((s) => s.path === '/v1/integrate');
    expect(call.body).toEqual(request);
    expect(call.authorization).toBe('Bearer secret');
  });

  it('returns the runner’s own sentence when the merge is refused', async () => {
    const message =
      'devpilot/AVA-12-k3x9qd/run is checked out in /Users/op/dev/storefront. Switch that ' +
      "checkout to another branch so the wave's work can be merged into it.";
    answers['POST /v1/integrate'] = () => ({
      status: 409,
      body: { error: 'RUN_BRANCH_CHECKED_OUT', message },
    });

    expect(await new HttpSessionTransport(baseUrl).integrate(request)).toEqual({
      ok: false,
      code: 'RUN_BRANCH_CHECKED_OUT',
      message,
    });
  });

  it('puts into words the bare 404 of a runner that has no such route', async () => {
    // No answer registered for /v1/integrate: the fake answers as an older
    // runner does for a path it does not know.
    const outcome = await new HttpSessionTransport(baseUrl).integrate(request);

    expect(outcome).toMatchObject({ ok: false, code: 'NOT_FOUND' });
    expect(outcome.ok === false && outcome.message).toMatch(
      /answered 404 \(NOT_FOUND\) when asked to merge the wave/
    );
  });

  it('answers, rather than throwing, when the runner is not there', async () => {
    const gone = new HttpSessionTransport('http://127.0.0.1:1');

    const outcome = await gone.integrate(request);

    expect(outcome).toMatchObject({ ok: false, code: 'UNREACHABLE' });
    expect(outcome.ok === false && outcome.message).toMatch(
      /^the session runner could not be reached to merge the wave \(/
    );
  });

  it('does not take a 200 with something else in it for a merge', async () => {
    answers['POST /v1/integrate'] = () => ({ status: 200, body: { ok: true } });

    expect(await new HttpSessionTransport(baseUrl).integrate(request)).toMatchObject({
      ok: false,
      code: 'BAD_RESPONSE',
    });
  });
});

describe('whether tasks can be isolated', () => {
  const bare: SessionTransport = {
    createSession: async () => ({ accepted: true, externalSessionId: 'x' }),
    sendMessage: async () => ({ success: true }),
    stopSession: async () => ({ success: true, message: 'stopped' }),
  };

  it('is yes for a runner that lists the capability', async () => {
    const adapter = new ClaudeSessionAdapter({ mode: 'claude-session' }, new HttpSessionTransport(baseUrl));
    expect(await adapter.isolationSupport()).toEqual({ supported: true });
  });

  it('is no, and says the runner predates it, when the capability is not listed', async () => {
    answers['GET /v1/health'] = () => ({ status: 200, body: { status: 'healthy', version: '1.0.0' } });
    const adapter = new ClaudeSessionAdapter({ mode: 'claude-session' }, new HttpSessionTransport(baseUrl));

    const support = await adapter.isolationSupport();
    expect(support.supported).toBe(false);
    expect(support.reason).toMatch(/does not report the 'isolation' capability/);
  });

  it('is no, and says the runner did not answer, when it did not', async () => {
    const adapter = new ClaudeSessionAdapter(
      { mode: 'claude-session' },
      new HttpSessionTransport('http://127.0.0.1:1')
    );

    const support = await adapter.isolationSupport();
    expect(support.supported).toBe(false);
    expect(support.reason).toMatch(/did not answer \/v1\/health/);
  });

  it('is no for a transport that has no way to ask or to merge', async () => {
    const adapter = new ClaudeSessionAdapter({ mode: 'claude-session' }, bare);

    expect((await adapter.isolationSupport()).supported).toBe(false);
    expect(await adapter.integrate({ repo: 'r', runId: 'x', taskCodes: ['1.1'] })).toMatchObject({
      ok: false,
      code: 'UNSUPPORTED',
    });
  });

  it('is no for the modes that are not claude-session, naming the mode', async () => {
    const http = new OrchestratorService({ mode: 'http', url: baseUrl });
    expect(await http.isolationSupport()).toEqual({
      supported: false,
      reason: "the orchestrator is in 'http' mode, which does not give tasks their own branch",
    });
    expect(await http.integrate({ repo: 'r', runId: 'x', taskCodes: ['1.1'] })).toMatchObject({
      ok: false,
      code: 'UNSUPPORTED',
    });

    const disabled = new OrchestratorService({ mode: 'disabled' });
    expect((await disabled.isolationSupport()).supported).toBe(false);
  });
});
