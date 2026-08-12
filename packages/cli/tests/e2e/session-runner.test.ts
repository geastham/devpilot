import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createServer, type Server } from 'http';
import { mkdtempSync, writeFileSync, chmodSync, mkdirSync, readFileSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { execFileSync } from 'child_process';
import { SessionRunner } from '../../src/commands/session-runner';
import type { RunnerConfig } from '../../src/commands/session-runner';

/**
 * Contract tests for the local session runner (TRD-01 §7.1/§7.2).
 *
 * `claude` is replaced by a stub script that prints the same
 * `--output-format json` envelope the real CLI does, so the runner's whole path
 * is exercised — spawn, git attribution, callback delivery — without spending
 * tokens or depending on a logged-in Claude account in CI.
 *
 * The stub is what makes this a real test rather than a mock: everything
 * between the HTTP surface and the completion callback is the production code
 * path. Only the agent itself is swapped.
 */

const PORT = 39117;
const CALLBACK_PORT = 39118;
/** Second runner instance for the failure case — must miss CALLBACK_PORT. */
const FAIL_PORT = 39130;

let runner: SessionRunner;
let callbackServer: Server;
let received: { path: string; body: any; token?: string }[] = [];
let workspace: string;
let repoDir: string;
let stubClaude: string;

/** A stub `claude` that edits a file and prints a success envelope. */
function writeStubClaude(dir: string, opts: { fail?: boolean } = {}): string {
  const path = join(dir, opts.fail ? 'claude-fail' : 'claude-ok');
  writeFileSync(
    path,
    `#!/usr/bin/env node
// Consume the prompt on stdin exactly as the real CLI does.
let input = '';
process.stdin.on('data', (c) => (input += c));
process.stdin.on('end', () => {
  const fs = require('fs');
  fs.writeFileSync('touched.txt', 'edited by stub\\n');
  process.stdout.write(JSON.stringify({
    is_error: ${opts.fail ? 'true' : 'false'},
    subtype: ${opts.fail ? "'error_during_execution'" : "'success'"},
    result: ${opts.fail ? "'the stub failed on purpose'" : "'Stub session done. Prompt bytes: ' + input.length"},
    total_cost_usd: 0.0125,
    duration_ms: 4200,
    usage: { input_tokens: 100, output_tokens: 50, cache_read_input_tokens: 10, cache_creation_input_tokens: 5 },
  }));
  process.exit(0);
});
`,
    'utf8'
  );
  chmodSync(path, 0o755);
  return path;
}

function config(overrides: Partial<RunnerConfig> = {}): RunnerConfig {
  return {
    port: PORT,
    host: '127.0.0.1',
    apiKey: 'test-token',
    workspace,
    repoMap: new Map([['acme/widget', repoDir]]),
    claudePath: stubClaude,
    permissionMode: 'acceptEdits',
    maxConcurrent: 3,
    timeoutMs: 30_000,
    log: () => undefined,
    ...overrides,
  };
}

const base = `http://127.0.0.1:${PORT}`;
const CALLBACK_URL = `http://127.0.0.1:${CALLBACK_PORT}/api/orchestrator`;

function auth(extra: Record<string, string> = {}) {
  return { Authorization: 'Bearer test-token', 'Content-Type': 'application/json', ...extra };
}

/**
 * Poll until THIS session's completion callback lands.
 *
 * Filtering by sessionId is load-bearing: sessions from earlier tests are still
 * running, and matching on `/complete` alone picks up whichever finishes first —
 * which made the failure case pass against a previous test's success report.
 */
async function waitForComplete(sessionId: string, timeoutMs = 15_000): Promise<any> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const hit = received.find(
      (r) => r.path.endsWith('/complete') && r.body?.sessionId === sessionId
    );
    if (hit) return hit;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`no completion callback for ${sessionId} within ${timeoutMs}ms`);
}

beforeAll(async () => {
  workspace = mkdtempSync(join(tmpdir(), 'dp-runner-'));
  repoDir = join(workspace, 'widget');
  mkdirSync(repoDir, { recursive: true });
  execFileSync('git', ['init', '-q'], { cwd: repoDir });
  execFileSync('git', ['config', 'user.email', 't@t.t'], { cwd: repoDir });
  execFileSync('git', ['config', 'user.name', 't'], { cwd: repoDir });
  writeFileSync(join(repoDir, 'seed.txt'), 'seed\n');
  execFileSync('git', ['add', '-A'], { cwd: repoDir });
  execFileSync('git', ['commit', '-qm', 'init'], { cwd: repoDir });

  stubClaude = writeStubClaude(workspace);

  callbackServer = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      received.push({
        path: req.url ?? '',
        body: body ? JSON.parse(body) : {},
        token: req.headers['x-devpilot-callback-token'] as string | undefined,
      });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('{"ok":true}');
    });
  });
  await new Promise<void>((r) => callbackServer.listen(CALLBACK_PORT, '127.0.0.1', r));

  runner = new SessionRunner(config());
  await runner.start();
});

afterAll(async () => {
  await runner.stop();
  await new Promise<void>((r) => callbackServer.close(() => r()));
});

beforeEach(() => {
  received = [];
});

describe('session runner — dispatcher API (§7.1)', () => {
  it('serves health without authentication', async () => {
    const res = await fetch(`${base}/v1/health`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('healthy');
  });

  it('rejects an unauthenticated create', async () => {
    const res = await fetch(`${base}/v1/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(401);
  });

  it('rejects a payload missing required fields', async () => {
    const res = await fetch(`${base}/v1/sessions`, {
      method: 'POST',
      headers: auth(),
      body: JSON.stringify({ sessionId: 'x' }),
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('INVALID_PAYLOAD');
  });

  it('refuses a repo it has no checkout for, naming the path it tried', async () => {
    const res = await fetch(`${base}/v1/sessions`, {
      method: 'POST',
      headers: auth(),
      body: JSON.stringify({
        sessionId: 'sess-unmapped',
        repo: 'acme/nowhere',
        prompt: 'p',
        callbackUrl: CALLBACK_URL,
      }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('REPO_NOT_FOUND');
    // The operator needs the path to fix the mapping; a bare "not found" costs
    // a debugging session.
    expect(body.message).toContain('nowhere');
  });

  it('runs a session and reports real numbers from the agent envelope', async () => {
    const res = await fetch(`${base}/v1/sessions`, {
      method: 'POST',
      headers: auth(),
      body: JSON.stringify({
        sessionId: 'sess-happy',
        repo: 'acme/widget',
        prompt: 'do the thing',
        model: 'sonnet',
        callbackUrl: CALLBACK_URL,
        callbackToken: 'cb-secret',
        metadata: { taskCode: '1.1' },
      }),
    });
    expect(res.status).toBe(201);
    const created = await res.json();
    expect(created.externalSessionId).toMatch(/^run_/);

    const completion = await waitForComplete('sess-happy');

    // §7.2: the callback carries the DEVPILOT session id, not the runner's.
    expect(completion.body.sessionId).toBe('sess-happy');
    expect(completion.token).toBe('cb-secret');
    expect(completion.body.success).toBe(true);
    // Cost and tokens come from the envelope, not from the model's own claim.
    expect(completion.body.costUsd).toBe(0.0125);
    expect(completion.body.tokensUsed).toBe(165);
    // The stub creates touched.txt; git attribution must notice.
    expect(completion.body.filesCreated).toContain('touched.txt');
    expect(completion.body.metadata).toEqual({ taskCode: '1.1' });

    // A status callback precedes the completion.
    expect(
      received.some((r) => r.path.endsWith('/status') && r.body?.sessionId === 'sess-happy')
    ).toBe(true);
  });

  it('is idempotent on sessionId — a re-POST does not start a second agent', async () => {
    const body = JSON.stringify({
      sessionId: 'sess-idem',
      repo: 'acme/widget',
      prompt: 'once only',
      callbackUrl: CALLBACK_URL,
    });

    const first = await fetch(`${base}/v1/sessions`, { method: 'POST', headers: auth(), body });
    expect(first.status).toBe(201);
    const firstId = (await first.json()).externalSessionId;

    const second = await fetch(`${base}/v1/sessions`, { method: 'POST', headers: auth(), body });
    expect(second.status).toBe(200);
    const secondBody = await second.json();
    expect(secondBody.externalSessionId).toBe(firstId);
    expect(secondBody.idempotent).toBe(true);
  });

  it('reports failure when the agent errors in-band despite exiting zero', async () => {
    // `claude` exits 0 on an in-band error, so exit code alone would call this a
    // success and mark the wave task done.
    const failRunner = new SessionRunner(
      config({ port: FAIL_PORT, claudePath: writeStubClaude(workspace, { fail: true }) })
    );
    await failRunner.start();
    try {
      const res = await fetch(`http://127.0.0.1:${FAIL_PORT}/v1/sessions`, {
        method: 'POST',
        headers: auth(),
        body: JSON.stringify({
          sessionId: 'sess-fail',
          repo: 'acme/widget',
          prompt: 'will fail',
          callbackUrl: CALLBACK_URL,
        }),
      });
      expect(res.status).toBe(201);

      const completion = await waitForComplete('sess-fail');
      expect(completion.body.success).toBe(false);
      expect(completion.body.error).toContain('on purpose');
    } finally {
      await failRunner.stop();
    }
  });

  it('404s an unknown session and 404s an unknown route', async () => {
    const unknown = await fetch(`${base}/v1/sessions/run_nope`, { headers: auth() });
    expect(unknown.status).toBe(404);

    const bogus = await fetch(`${base}/v1/nothing`, { headers: auth() });
    expect(bogus.status).toBe(404);
  });
});

describe('session runner — shared sessions (TRD-15)', () => {
  it('never puts the join link in argv, and cleans up the MCP config', async () => {
    const argvProbe = join(workspace, 'claude-argv');
    const argvLog = join(workspace, 'argv.log');
    const cfgLog = join(workspace, 'cfg.log');

    // A stub that records its own argv and the MCP config path it was handed,
    // so the test can assert on what the real CLI would have been able to see.
    writeFileSync(
      argvProbe,
      `#!/usr/bin/env node
const fs = require('fs');
let input = '';
process.stdin.on('data', (c) => (input += c));
process.stdin.on('end', () => {
  fs.writeFileSync(${JSON.stringify(argvLog)}, JSON.stringify(process.argv.slice(2)));
  const i = process.argv.indexOf('--mcp-config');
  if (i !== -1) {
    const p = process.argv[i + 1];
    const st = fs.statSync(p);
    fs.writeFileSync(${JSON.stringify(cfgLog)}, JSON.stringify({
      path: p,
      mode: (st.mode & 0o777).toString(8),
      body: fs.readFileSync(p, 'utf8'),
      promptHasLink: input.includes('SECRETKEY'),
    }));
  }
  process.stdout.write(JSON.stringify({ is_error: false, subtype: 'success', result: 'ok', total_cost_usd: 0, duration_ms: 1, usage: {} }));
  process.exit(0);
});
`,
      'utf8'
    );
    chmodSync(argvProbe, 0o755);

    const LINK = 'https://devpilot.sh/s/sess_abc#k=SECRETKEY';
    const port = FAIL_PORT + 5;
    const logs: string[] = [];
    const runner = new SessionRunner(
      config({ port, claudePath: argvProbe, log: (l) => logs.push(l) })
    );
    await runner.start();

    try {
      const res = await fetch(`http://127.0.0.1:${port}/v1/sessions`, {
        method: 'POST',
        headers: auth(),
        body: JSON.stringify({
          sessionId: 'sess-linked',
          repo: 'acme/widget',
          prompt: 'do the thing',
          callbackUrl: CALLBACK_URL,
          sessionLink: LINK,
        }),
      });
      expect(res.status).toBe(201);
      await waitForComplete('sess-linked');

      const argv: string[] = JSON.parse(readFileSync(argvLog, 'utf8'));
      const cfg = JSON.parse(readFileSync(cfgLog, 'utf8'));

      // The key must not be visible to `ps`.
      expect(argv.join(' ')).not.toContain('SECRETKEY');
      expect(argv).toContain('--strict-mcp-config');

      // It reaches the agent only through a 0600 file.
      expect(cfg.mode).toBe('600');
      expect(cfg.body).toContain(LINK);

      // ...and not through the prompt, which becomes transcript.
      expect(cfg.promptHasLink).toBe(false);

      // Nor through the runner's own logs.
      expect(logs.join('\n')).not.toContain('SECRETKEY');
      expect(logs.join('\n')).toContain('shared-session');

      // The config is removed once the process exits.
      expect(existsSync(cfg.path)).toBe(false);
    } finally {
      await runner.stop();
    }
  });

  it('does not add MCP flags when no session link is supplied', async () => {
    const argvLog2 = join(workspace, 'argv2.log');
    const probe = join(workspace, 'claude-argv2');
    writeFileSync(
      probe,
      `#!/usr/bin/env node
const fs = require('fs');
process.stdin.on('data', () => {});
process.stdin.on('end', () => {
  fs.writeFileSync(${JSON.stringify(argvLog2)}, JSON.stringify(process.argv.slice(2)));
  process.stdout.write(JSON.stringify({ is_error: false, subtype: 'success', result: 'ok', total_cost_usd: 0, duration_ms: 1, usage: {} }));
  process.exit(0);
});
`,
      'utf8'
    );
    chmodSync(probe, 0o755);

    const port = FAIL_PORT + 6;
    const runner = new SessionRunner(config({ port, claudePath: probe }));
    await runner.start();
    try {
      await fetch(`http://127.0.0.1:${port}/v1/sessions`, {
        method: 'POST',
        headers: auth(),
        body: JSON.stringify({
          sessionId: 'sess-unlinked',
          repo: 'acme/widget',
          prompt: 'p',
          callbackUrl: CALLBACK_URL,
        }),
      });
      await waitForComplete('sess-unlinked');
      const argv: string[] = JSON.parse(readFileSync(argvLog2, 'utf8'));
      expect(argv).not.toContain('--mcp-config');
    } finally {
      await runner.stop();
    }
  });
});
