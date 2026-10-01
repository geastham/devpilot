import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createServer, type Server } from 'http';
import { mkdtempSync, writeFileSync, chmodSync, mkdirSync, readFileSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { execFileSync } from 'child_process';
import { SessionRunner } from '../../src/commands/session-runner';
import { resolveHarness } from '../../src/commands/session-runner/harness';
import { excludeIndexFromGit, seedIndex, stopIndexDaemon } from '../../src/utils/codegraph';
import type { RunnerConfig } from '../../src/commands/session-runner';
import { writeGraphFixture } from './helpers/graph-fixture';

/**
 * The code graph, through the real runner.
 *
 * `codegraph` is a stub that records how it was called, and `claude` is a stub
 * that records what it was given — so everything between the HTTP surface and
 * the commit is the production path, and neither the 295 MB indexer nor a
 * model is needed to run it.
 *
 * What this pins is mostly about what must NOT happen: the index's own ignore
 * file must not be committed into a task branch, a run with no index must not
 * be stamped as if it had one, and a pid that is not the indexer's must not be
 * signalled.
 */

/** Each runner gets its own port: fetch keeps connections alive, and a pooled one to a stopped runner is reset when its port is reused. */
let nextPort = 39181;
let PORT = nextPort;
const CALLBACK_PORT = 39179;
const CALLBACK_URL = `http://127.0.0.1:${CALLBACK_PORT}/api/orchestrator`;
const headers = { Authorization: 'Bearer test-token', 'Content-Type': 'application/json' };

let scratch: string;
let callbackServer: Server;
let received: { path: string; body: any }[] = [];
let indexerStub: string;
let claudeStub: string;
let repoCount = 0;
let sessionCount = 0;

const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

/** A repository with one commit; optionally with a code graph index. */
function newRepo(withIndex: boolean): string {
  const dir = join(scratch, `repo-${++repoCount}`);
  mkdirSync(join(dir, 'src'), { recursive: true });
  git(dir, 'init', '-q', '-b', 'main');
  git(dir, 'config', 'user.email', 't@t.t');
  git(dir, 'config', 'user.name', 't');
  writeFileSync(join(dir, 'src', 'policy.ts'), 'export const nextDelay = () => 1;\n');
  writeFileSync(join(dir, 'src', 'fetch.ts'), 'import { nextDelay } from "./policy";\n');
  writeFileSync(join(dir, 'src', 'fetch.test.ts'), 'import "./fetch";\n');
  git(dir, 'add', '-A');
  git(dir, 'commit', '-qm', 'init');
  if (withIndex) {
    writeGraphFixture(dir, {
      files: { 'src/policy.ts': 'h1', 'src/fetch.ts': 'h2', 'src/fetch.test.ts': 'h3' },
      nodes: [
        { id: 'policy', name: 'nextDelay', file: 'src/policy.ts' },
        { id: 'fetch', name: 'fetchWithRetry', file: 'src/fetch.ts' },
        { id: 'test', name: 'retries', file: 'src/fetch.test.ts' },
      ],
      edges: [
        { from: 'fetch', to: 'policy', kind: 'imports' },
        { from: 'test', to: 'fetch', kind: 'calls' },
      ],
    });
    // The real tool writes this beside its database: ignore everything, except itself.
    writeFileSync(join(dir, '.codegraph', '.gitignore'), '*\n!.gitignore\n');
  }
  return dir;
}

function config(overrides: Partial<RunnerConfig> = {}): RunnerConfig {
  return {
    port: PORT,
    host: '127.0.0.1',
    apiKey: 'test-token',
    workspace: scratch,
    repoMap: new Map(),
    claudePath: claudeStub,
    permissionMode: 'acceptEdits',
    maxConcurrent: 4,
    timeoutMs: 30_000,
    isolation: { worktreeRoot: join(scratch, 'worktrees') },
    codeGraph: { bin: indexerStub, version: '1.6.1' },
    harness: resolveHarness('lean+code-graph'),
    log: () => undefined,
    ...overrides,
  };
}

async function runTask(runner: { port: number }, repoDir: string, isolated = true) {
  const sessionId = `sess-cg-${++sessionCount}`;
  const res = await fetch(`http://127.0.0.1:${runner.port}/v1/sessions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      sessionId,
      repo: repoDir,
      prompt: 'do the task',
      callbackUrl: CALLBACK_URL,
      ...(isolated ? { isolation: { runId: `run-${sessionCount}`, taskCode: '1.1' } } : {}),
    }),
  });
  expect(res.status).toBe(201);
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const done = received.find((r) => r.path.endsWith('/complete') && r.body?.sessionId === sessionId);
    if (done) return { report: done.body, reports: received.filter((r) => r.body?.sessionId === sessionId) };
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(`no completion for ${sessionId}`);
}

const agentLog = () => JSON.parse(readFileSync(join(scratch, 'claude-last.json'), 'utf8'));
const indexerCalls = () =>
  existsSync(join(scratch, 'indexer-calls.log'))
    ? readFileSync(join(scratch, 'indexer-calls.log'), 'utf8').trim().split('\n').filter(Boolean)
    : [];

beforeAll(async () => {
  scratch = mkdtempSync(join(tmpdir(), 'dp-code-graph-'));

  indexerStub = join(scratch, 'codegraph-stub');
  writeFileSync(
    indexerStub,
    `#!/usr/bin/env node
const fs = require('fs');
const args = process.argv.slice(2);
if (args[0] === '--version') { console.log('1.6.1'); process.exit(0); }
fs.appendFileSync(${JSON.stringify(join(scratch, 'indexer-calls.log'))},
  JSON.stringify({ args, doNotTrack: process.env.DO_NOT_TRACK, telemetry: process.env.CODEGRAPH_TELEMETRY }) + '\\n');
process.exit(0);
`
  );
  chmodSync(indexerStub, 0o755);

  claudeStub = join(scratch, 'claude-stub');
  writeFileSync(
    claudeStub,
    `#!/usr/bin/env node
const fs = require('fs');
const argv = process.argv.slice(2);
const configs = [];
argv.forEach((a, i) => { if (a === '--mcp-config') configs.push(JSON.parse(fs.readFileSync(argv[i + 1], 'utf8'))); });
let input = '';
process.stdin.on('data', (c) => (input += c));
process.stdin.on('end', () => {
  fs.writeFileSync('changed.txt', 'the task wrote this\\n');
  fs.writeFileSync(${JSON.stringify(join(scratch, 'claude-last.json'))}, JSON.stringify({
    cwd: process.cwd(), argv, configs,
    hadIndex: fs.existsSync('.codegraph/codegraph.db'),
    indexDirEntries: fs.existsSync('.codegraph') ? fs.readdirSync('.codegraph').sort() : [],
  }));
  const out = (o) => process.stdout.write(JSON.stringify(o) + '\\n');
  out({ type: 'assistant', message: { id: 'm1', model: 'claude-haiku-4-5', usage: { input_tokens: 1, output_tokens: 1 }, content: [{ type: 'text', text: 'ok' }] } });
  out({ type: 'result', is_error: false, subtype: 'success', result: 'done', total_cost_usd: 0.01, duration_ms: 5, usage: { input_tokens: 1, output_tokens: 1 } });
  process.exit(0);
});
`
  );
  chmodSync(claudeStub, 0o755);

  callbackServer = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      received.push({ path: req.url ?? '', body: body ? JSON.parse(body) : {} });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('{"ok":true}');
    });
  });
  await new Promise<void>((r) => callbackServer.listen(CALLBACK_PORT, '127.0.0.1', r));
});

afterAll(async () => {
  await new Promise<void>((r) => callbackServer.close(() => r()));
});

beforeEach(() => {
  received = [];
  try {
    writeFileSync(join(scratch, 'indexer-calls.log'), '');
  } catch {
    // first test
  }
});

async function withRunner<T>(overrides: Partial<RunnerConfig>, _port: number, fn: () => Promise<T>): Promise<T> {
  PORT = nextPort++;
  const runner = new SessionRunner(config({ port: PORT, ...overrides }));
  await runner.start();
  try {
    return await fn();
  } finally {
    await runner.stop();
  }
}

describe('a task in a repository that has an index', () => {
  it('gets a copy of the index, brought up to date, and the one MCP server', async () => {
    const repoDir = newRepo(true);
    const { reports } = await withRunner({}, PORT, () => runTask({ get port() { return PORT; } }, repoDir));
    const agent = agentLog();

    // The agent ran in its worktree, and the index was there for it.
    expect(agent.cwd).not.toBe(repoDir);
    expect(agent.hadIndex).toBe(true);
    // Only the database and the ignore file are copied: a daemon's pid file or
    // socket would belong to the process serving the main checkout.
    expect(agent.indexDirEntries).toEqual(['.gitignore', 'codegraph.db']);

    // It was synced in the worktree, with telemetry off.
    const calls = indexerCalls().map((l) => JSON.parse(l));
    expect(calls).toHaveLength(1);
    expect(calls[0].args[0]).toBe('sync');
    expect(calls[0].args[1]).toContain('worktrees');
    expect(calls[0]).toMatchObject({ doNotTrack: '1', telemetry: '0' });

    // One server, pointed at the worktree, telemetry off.
    const server = agent.configs.map((c: any) => c.mcpServers?.codegraph).find(Boolean);
    expect(server.command).toBe(indexerStub);
    expect(server.args.slice(0, 3)).toEqual(['serve', '--mcp', '--path']);
    expect(server.args[3]).toContain('worktrees');
    expect(server.env.DO_NOT_TRACK).toBe('1');
    // `lean` keeps every other server out, and the graph's is added to it.
    expect(agent.argv).toContain('--strict-mcp-config');
    // And the agent is allowed to call it. A headless agent cannot be asked
    // for permission: in the first live run of this technique the tool was
    // configured, refused three times, and the agent used grep — while every
    // test that only looked at the config passed.
    expect(agent.argv.slice(-2)).toEqual(['--allowedTools', 'mcp__codegraph__codegraph_explore']);

    // And its readings say so.
    const stamps = reports.map((r) => r.body?.telemetry?.harness).filter(Boolean);
    expect(new Set(stamps)).toEqual(new Set(['lean+code-graph@1']));
  });

  /**
   * The tool's own `.gitignore` says `*` then `!.gitignore` — it un-ignores
   * itself. Without the exclude, the runner's `git add -A` commits
   * `.codegraph/.gitignore` into every task branch.
   */
  it('does not commit the index’s own ignore file into the task', async () => {
    const repoDir = newRepo(true);
    const { report } = await withRunner({}, PORT, () => runTask({ get port() { return PORT; } }, repoDir));

    expect(report.success).toBe(true);
    expect(report.filesCreated).toEqual(['changed.txt']);
    expect(git(repoDir, 'ls-tree', '-r', '--name-only', report.commitSha)).not.toContain('.codegraph');
    expect(readFileSync(join(repoDir, '.git', 'info', 'exclude'), 'utf8')).toContain('.codegraph/');
    // The operator's checkout still has its index and is still clean.
    expect(existsSync(join(repoDir, '.codegraph', 'codegraph.db'))).toBe(true);
    expect(git(repoDir, 'status', '--porcelain')).toBe('');
  });

  it('uses the checkout’s own index for a task that is not isolated', async () => {
    const repoDir = newRepo(true);
    await withRunner({}, PORT, () => runTask({ get port() { return PORT; } }, repoDir, false));
    const agent = agentLog();
    expect(agent.cwd.endsWith(repoDir.split('/').pop()!)).toBe(true);
    expect(agent.configs.some((c: any) => c.mcpServers?.codegraph?.args?.[3] === repoDir)).toBe(true);
    // Nothing to seed and nothing to sync: the index is already where the agent is.
    expect(indexerCalls()).toEqual([]);
  });
});

describe('a task with no graph to give it', () => {
  it('runs exactly as before, and is not stamped as if it had one', async () => {
    const repoDir = newRepo(false);
    const { report, reports } = await withRunner({}, PORT, () => runTask({ get port() { return PORT; } }, repoDir));
    const agent = agentLog();

    expect(report.success).toBe(true);
    expect(agent.hadIndex).toBe(false);
    expect(agent.configs.some((c: any) => c.mcpServers?.codegraph)).toBe(false);
    expect(agent.argv).not.toContain('--allowedTools');
    expect(indexerCalls()).toEqual([]);
    // The harness asked for code-graph; this run could not have it. Its
    // readings must not sit in the same row as runs that did.
    const stamps = reports.map((r) => r.body?.telemetry?.harness).filter(Boolean);
    expect(new Set(stamps)).toEqual(new Set(['lean@1']));
  });

  it('is the same when the indexer is not installed at all', async () => {
    const repoDir = newRepo(true);
    const { reports } = await withRunner({ codeGraph: null }, PORT, () => runTask({ get port() { return PORT; } }, repoDir));
    expect(agentLog().configs.some((c: any) => c.mcpServers?.codegraph)).toBe(false);
    expect(new Set(reports.map((r) => r.body?.telemetry?.harness).filter(Boolean))).toEqual(new Set(['lean@1']));
  });

  it('does not hand the graph to an agent whose harness did not ask for it', async () => {
    const repoDir = newRepo(true);
    const { reports } = await withRunner({ harness: resolveHarness('lean') }, PORT, () => runTask({ get port() { return PORT; } }, repoDir));
    const agent = agentLog();
    // The index is still seeded — the planner and the next task may read it —
    // but the agent is given no tool for it.
    expect(agent.hadIndex).toBe(true);
    expect(agent.configs.some((c: any) => c.mcpServers?.codegraph)).toBe(false);
    expect(new Set(reports.map((r) => r.body?.telemetry?.harness).filter(Boolean))).toEqual(new Set(['lean@1']));
  });
});

describe('what the planner asks the runner', () => {
  const ask = async (path: string, body: unknown) => {
    const res = await fetch(`http://127.0.0.1:${PORT}${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
    return { status: res.status, body: await res.json() };
  };

  it('says it can', async () => {
    await withRunner({}, PORT, async () => {
      const health = await (await fetch(`http://127.0.0.1:${PORT}/v1/health`)).json();
      expect(health.capabilities).toContain('code-graph');
    });
  });

  it('answers which files depend on the ones a task will change', async () => {
    const repoDir = newRepo(true);
    await withRunner({}, PORT, async () => {
      const { status, body } = await ask('/v1/graph/dependents', { repo: repoDir, files: ['src/policy.ts'], depth: 2 });
      expect(status).toBe(200);
      expect(body.available).toBe(true);
      expect(body.byFile['src/policy.ts']).toEqual(['src/fetch.test.ts', 'src/fetch.ts']);
      expect(typeof body.indexedAt).toBe('string');
    });
  });

  it('answers which tests are reached from them', async () => {
    const repoDir = newRepo(true);
    await withRunner({}, PORT, async () => {
      const { body } = await ask('/v1/graph/affected-tests', { repo: repoDir, files: ['src/policy.ts'] });
      expect(body).toMatchObject({ available: true, tests: ['src/fetch.test.ts'] });
    });
  });

  it('says there is no index, with what to do, rather than failing', async () => {
    const repoDir = newRepo(false);
    await withRunner({}, PORT, async () => {
      const { status, body } = await ask('/v1/graph/dependents', { repo: repoDir, files: ['src/policy.ts'] });
      expect(status).toBe(200);
      expect(body.available).toBe(false);
      expect(body.reason).toContain('devpilot graph enable');
    });
  });

  it('rejects a malformed request and an unauthenticated one', async () => {
    await withRunner({}, PORT, async () => {
      expect((await ask('/v1/graph/dependents', { repo: 'x' })).status).toBe(400);
      const res = await fetch(`http://127.0.0.1:${PORT}/v1/graph/dependents`, { method: 'POST', body: '{}' });
      expect(res.status).toBe(401);
    });
  });
});

describe('the pieces', () => {
  it('adds the exclude once, however many times it is asked', async () => {
    const repoDir = newRepo(false);
    expect(await excludeIndexFromGit(repoDir)).toBe(true);
    expect(await excludeIndexFromGit(repoDir)).toBe(true);
    const lines = readFileSync(join(repoDir, '.git', 'info', 'exclude'), 'utf8').split('\n').filter((l) => l.trim() === '.codegraph/');
    expect(lines).toHaveLength(1);
  });

  it('seeds nothing when the source has no index', () => {
    expect(seedIndex(newRepo(false), mkdtempSync(join(tmpdir(), 'dp-seed-')))).toBe(false);
  });

  /**
   * A pid file can outlive its process, and the number can be reused by
   * something else entirely. Only a process that is in fact the indexer may be
   * signalled.
   */
  it('does not signal a process that is not the indexer', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'dp-daemon-'));
    mkdirSync(join(dir, '.codegraph'));
    // This test process: alive, and certainly not `codegraph`.
    writeFileSync(join(dir, '.codegraph', 'daemon.pid'), JSON.stringify({ pid: process.pid, version: '1.6.1' }));
    expect(await stopIndexDaemon(dir)).toBe(false);

    expect(await stopIndexDaemon(mkdtempSync(join(tmpdir(), 'dp-daemon-none-')))).toBe(false);
    writeFileSync(join(dir, '.codegraph', 'daemon.pid'), '{"pid": 1}');
    expect(await stopIndexDaemon(dir)).toBe(false);
  });
});
