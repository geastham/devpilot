import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createServer, type Server } from 'http';
import { mkdtempSync, writeFileSync, chmodSync, mkdirSync, readFileSync, existsSync, readdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { execFileSync } from 'child_process';
import { SessionRunner } from '../../src/commands/session-runner';
import {
  refSafe,
  runBranchName,
  taskBranchName,
} from '../../src/commands/session-runner/isolation';
import type { RunnerConfig } from '../../src/commands/session-runner';

/**
 * A worktree and a branch per task, and a merge per wave — through the real
 * runner, against real git repositories.
 *
 * `claude` is a stub that does what its prompt says: each `WRITE <path>
 * <content>` line becomes a file. That is enough to stage every situation that
 * matters — two tasks on different files, two on the same file, a task that
 * fails halfway, a second attempt — while everything from the HTTP surface to
 * the commit and the merge is the production path.
 *
 * Every test gets its own repository, because the thing under test is what
 * happens to one.
 */

const PORT = 39161;
const CALLBACK_PORT = 39162;
const CALLBACK_URL = `http://127.0.0.1:${CALLBACK_PORT}/api/orchestrator`;
const base = `http://127.0.0.1:${PORT}`;

let runner: SessionRunner;
let callbackServer: Server;
let received: { path: string; body: any }[] = [];
let scratch: string;
let worktreeRoot: string;
let stub: string;
let repoDir: string;
let repoCount = 0;

/**
 * A stub `claude`. Reads directives out of the prompt:
 *
 *   WRITE <path> <content>   create or overwrite a file
 *   DELETE <path>            remove one
 *   COMMIT                   commit for itself, as some agents will
 *   SWITCH <branch>          move off the branch it was given
 *   FAIL                     report an in-band error after doing the above
 */
function writeStub(dir: string): string {
  const path = join(dir, 'claude-stub');
  writeFileSync(
    path,
    `#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
let input = '';
process.stdin.on('data', (c) => (input += c));
process.stdin.on('end', () => {
  let fail = false;
  for (const line of input.split('\\n')) {
    const write = line.match(/^WRITE (\\S+) (.*)$/);
    if (write) {
      fs.mkdirSync(path.dirname(write[1]), { recursive: true });
      fs.writeFileSync(write[1], write[2] + '\\n');
    }
    const del = line.match(/^DELETE (\\S+)$/);
    if (del) fs.rmSync(del[1]);
    if (line === 'COMMIT') {
      execFileSync('git', ['add', '-A']);
      execFileSync('git', ['commit', '-qm', 'the agent committed this itself']);
    }
    const sw = line.match(/^SWITCH (\\S+)$/);
    if (sw) execFileSync('git', ['checkout', '-qb', sw[1]]);
    if (line === 'FAIL') fail = true;
  }
  fs.writeFileSync(path.join(${JSON.stringify(dir)}, 'last-cwd.txt'), process.cwd());
  fs.writeFileSync(path.join(${JSON.stringify(dir)}, 'last-prompt.txt'), input);
  process.stdout.write(JSON.stringify({
    type: 'result',
    is_error: fail,
    subtype: fail ? 'error_during_execution' : 'success',
    result: fail ? 'the stub failed on purpose' : 'done',
    total_cost_usd: 0.01, duration_ms: 20,
    usage: { input_tokens: 1, output_tokens: 1 },
  }) + '\\n');
  process.exit(0);
});
`,
    'utf8'
  );
  chmodSync(path, 0o755);
  return path;
}

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

/** A new repository with one commit on `main`, mapped to a repo name of its own. */
function newRepo(files: Record<string, string> = { 'seed.txt': 'seed\n' }): string {
  const dir = join(scratch, `repo-${++repoCount}`);
  mkdirSync(dir, { recursive: true });
  git(dir, 'init', '-q', '-b', 'main');
  git(dir, 'config', 'user.email', 't@t.t');
  git(dir, 'config', 'user.name', 't');
  for (const [name, content] of Object.entries(files)) {
    mkdirSync(join(dir, name, '..'), { recursive: true });
    writeFileSync(join(dir, name), content);
  }
  git(dir, 'add', '-A');
  git(dir, 'commit', '-qm', 'init');
  return dir;
}

function config(overrides: Partial<RunnerConfig> = {}): RunnerConfig {
  return {
    port: PORT,
    host: '127.0.0.1',
    apiKey: 'test-token',
    workspace: scratch,
    repoMap: new Map(),
    claudePath: stub,
    permissionMode: 'acceptEdits',
    maxConcurrent: 8,
    timeoutMs: 30_000,
    isolation: { worktreeRoot },
    log: () => undefined,
    ...overrides,
  };
}

const headers = { Authorization: 'Bearer test-token', 'Content-Type': 'application/json' };
let sessionCount = 0;

/** Dispatch one task and wait for its completion report. */
async function runTask(
  runId: string,
  taskCode: string,
  prompt: string,
  extra: Record<string, unknown> = {},
  at: string = base
): Promise<any> {
  const sessionId = `sess-${++sessionCount}`;
  const res = await fetch(`${at}/v1/sessions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      sessionId,
      repo: repoDir,
      prompt,
      callbackUrl: CALLBACK_URL,
      isolation: { runId, taskCode },
      ...extra,
    }),
  });
  if (res.status !== 201) return { status: res.status, body: await res.json() };

  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const hit = received.find((r) => r.path.endsWith('/complete') && r.body?.sessionId === sessionId);
    if (hit) return { status: 201, report: hit.body };
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(`no completion for ${sessionId}`);
}

async function integrate(runId: string, taskCodes: string[], at: string = base) {
  const res = await fetch(`${at}/v1/integrate`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ repo: repoDir, runId, taskCodes }),
  });
  return { status: res.status, body: await res.json() };
}

/** Everything under the worktree root that is still a directory with files in it. */
function leftoverWorktrees(): string[] {
  const found: string[] = [];
  const walk = (dir: string) => {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const full = join(dir, entry.name);
      if (existsSync(join(full, '.git'))) found.push(full);
      else walk(full);
    }
  };
  walk(worktreeRoot);
  return found;
}

beforeAll(async () => {
  scratch = mkdtempSync(join(tmpdir(), 'dp-isolation-'));
  worktreeRoot = join(scratch, 'worktrees');
  stub = writeStub(scratch);

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

  runner = new SessionRunner(config());
  await runner.start();
});

afterAll(async () => {
  await runner.stop();
  await new Promise<void>((r) => callbackServer.close(() => r()));
});

beforeEach(() => {
  received = [];
  repoDir = newRepo();
});

describe('a task runs in its own tree, on its own branch', () => {
  it('leaves the operator’s checkout exactly as it was', async () => {
    // Uncommitted work of the operator's own, which a run must not disturb.
    writeFileSync(join(repoDir, 'mine.txt'), 'not committed\n');
    const headBefore = git(repoDir, 'rev-parse', 'HEAD');
    const statusBefore = git(repoDir, 'status', '--porcelain');

    const { report } = await runTask('run-a', '1.1', 'WRITE src/a.ts export const a = 1;');

    expect(report.success).toBe(true);
    expect(git(repoDir, 'rev-parse', 'HEAD')).toBe(headBefore);
    expect(git(repoDir, 'rev-parse', '--abbrev-ref', 'HEAD')).toBe('main');
    expect(git(repoDir, 'status', '--porcelain')).toBe(statusBefore);
    expect(existsSync(join(repoDir, 'src/a.ts'))).toBe(false);
    expect(readFileSync(join(repoDir, 'mine.txt'), 'utf8')).toBe('not committed\n');
  });

  it('commits the task to its branch and reports exactly what it changed', async () => {
    repoDir = newRepo({ 'seed.txt': 'seed\n', 'old.txt': 'old\n' });
    const base = git(repoDir, 'rev-parse', 'HEAD');

    const { report } = await runTask(
      'run-b',
      '2.1',
      ['WRITE src/new.ts created', 'WRITE seed.txt changed', 'DELETE old.txt'].join('\n'),
      { isolation: { runId: 'run-b', taskCode: '2.1', title: 'Add  the new\nmodule' } }
    );

    const branch = taskBranchName('run-b', '2.1');
    expect(report.branch).toBe(branch);
    expect(report.baseSha).toBe(base);
    expect(report.commitSha).toBe(git(repoDir, 'rev-parse', branch));
    expect(report.commitSha).not.toBe(base);
    expect(report.filesCreated).toEqual(['src/new.ts']);
    expect(report.filesModified).toEqual(['seed.txt']);
    expect(report.filesDeleted).toEqual(['old.txt']);

    // One line, whitespace collapsed, with where it came from underneath.
    const message = git(repoDir, 'log', '-1', '--format=%B', branch);
    expect(message.split('\n')[0]).toBe('devpilot(2.1): Add the new module');
    expect(message).toContain('Run: run-b');

    // The agent ran in the worktree, was told so, and the worktree is gone.
    const cwd = readFileSync(join(scratch, 'last-cwd.txt'), 'utf8');
    expect(cwd).toContain('worktrees');
    expect(cwd).not.toBe(repoDir);
    expect(readFileSync(join(scratch, 'last-prompt.txt'), 'utf8')).toContain(`on the branch \`${branch}\``);
    expect(existsSync(cwd)).toBe(false);
    expect(leftoverWorktrees()).toEqual([]);
  });

  it('reports a task that changed nothing as having changed nothing', async () => {
    const { report } = await runTask('run-c', '1.1', 'nothing to do');
    expect(report.success).toBe(true);
    expect(report.commitSha).toBe(report.baseSha);
    expect([...report.filesCreated, ...report.filesModified, ...report.filesDeleted]).toEqual([]);
  });

  it('keeps a failed task’s partial work on its branch', async () => {
    const { report } = await runTask('run-d', '1.1', 'WRITE half.ts half done\nFAIL');

    expect(report.success).toBe(false);
    expect(report.error).toContain('on purpose');
    expect(report.filesCreated).toEqual(['half.ts']);
    const branch = taskBranchName('run-d', '1.1');
    expect(git(repoDir, 'show', `${branch}:half.ts`)).toBe('half done');
    expect(git(repoDir, 'log', '-1', '--format=%B', branch)).toContain('did not finish');
    expect(leftoverWorktrees()).toEqual([]);
  });

  it('finds the work when the agent committed for itself', async () => {
    const { report } = await runTask('run-e', '1.1', 'WRITE a.ts one\nCOMMIT\nWRITE b.ts two');
    expect(report.filesCreated.sort()).toEqual(['a.ts', 'b.ts']);
    expect(git(repoDir, 'rev-parse', taskBranchName('run-e', '1.1'))).toBe(report.commitSha);
  });

  it('finds the work when the agent moved off the branch it was given', async () => {
    const { report } = await runTask('run-f', '1.1', 'SWITCH elsewhere\nWRITE a.ts one');
    expect(report.success).toBe(true);
    expect(report.filesCreated).toEqual(['a.ts']);
    expect(git(repoDir, 'show', `${taskBranchName('run-f', '1.1')}:a.ts`)).toBe('one');
  });

  it('commits when the repository has no identity configured', async () => {
    git(repoDir, 'config', '--unset', 'user.email');
    git(repoDir, 'config', '--unset', 'user.name');
    // Hide any global identity from the runner's git, as on a fresh machine.
    const previous = { home: process.env.HOME, cfg: process.env.GIT_CONFIG_GLOBAL };
    process.env.GIT_CONFIG_GLOBAL = '/dev/null';
    try {
      const { report } = await runTask('run-g', '1.1', 'WRITE a.ts one');
      expect(report.success).toBe(true);
      expect(report.filesCreated).toEqual(['a.ts']);
    } finally {
      if (previous.cfg === undefined) delete process.env.GIT_CONFIG_GLOBAL;
      else process.env.GIT_CONFIG_GLOBAL = previous.cfg;
    }
  });

  it('runs a wave’s tasks at the same time without them seeing each other', async () => {
    const reports = await Promise.all(
      ['1.1', '1.2', '1.3', '1.4'].map((code) =>
        runTask('run-h', code, `WRITE src/${code}.ts task ${code}`)
      )
    );
    for (const [i, { report }] of reports.entries()) {
      const code = ['1.1', '1.2', '1.3', '1.4'][i];
      expect(report.success).toBe(true);
      // Its own file and nobody else's.
      expect(report.filesCreated).toEqual([`src/${code}.ts`]);
    }
    expect(leftoverWorktrees()).toEqual([]);
  });
});

describe('a wave is merged into the run branch', () => {
  it('merges tasks that touched different files', async () => {
    await Promise.all([
      runTask('run-i', '1.1', 'WRITE a.ts from 1.1'),
      runTask('run-i', '1.2', 'WRITE b.ts from 1.2'),
    ]);

    const { status, body } = await integrate('run-i', ['1.1', '1.2']);

    expect(status).toBe(200);
    expect(body.runBranch).toBe(runBranchName('run-i'));
    expect(body.merged.map((m: any) => m.taskCode)).toEqual(['1.1', '1.2']);
    expect(body.conflicts).toEqual([]);
    expect(body.headSha).toBe(git(repoDir, 'rev-parse', runBranchName('run-i')));
    expect(git(repoDir, 'show', `${body.runBranch}:a.ts`)).toBe('from 1.1');
    expect(git(repoDir, 'show', `${body.runBranch}:b.ts`)).toBe('from 1.2');
    // Still nothing in the operator's checkout, and nothing left lying around.
    expect(git(repoDir, 'rev-parse', '--abbrev-ref', 'HEAD')).toBe('main');
    expect(git(repoDir, 'status', '--porcelain')).toBe('');
    expect(leftoverWorktrees()).toEqual([]);
  });

  it('reports a conflict with its files, and merges the rest', async () => {
    await Promise.all([
      runTask('run-j', '1.1', 'WRITE seed.txt the first version'),
      runTask('run-j', '1.2', 'WRITE seed.txt the second version'),
      runTask('run-j', '1.3', 'WRITE c.ts from 1.3'),
    ]);

    const { status, body } = await integrate('run-j', ['1.1', '1.2', '1.3']);

    expect(status).toBe(200);
    expect(body.merged.map((m: any) => m.taskCode)).toEqual(['1.1', '1.3']);
    expect(body.conflicts).toEqual([
      { taskCode: '1.2', branch: taskBranchName('run-j', '1.2'), files: ['seed.txt'] },
    ]);
    // The run branch has the first version and 1.3, and no trace of the loser.
    expect(git(repoDir, 'show', `${body.runBranch}:seed.txt`)).toBe('the first version');
    expect(git(repoDir, 'show', `${body.runBranch}:c.ts`)).toBe('from 1.3');
    // Nothing is half-merged anywhere.
    expect(git(repoDir, 'status', '--porcelain')).toBe('');
    expect(leftoverWorktrees()).toEqual([]);
  });

  /**
   * The point of reporting a conflict rather than failing the run: a second
   * attempt at the task starts from a run branch that already contains the
   * work it collided with, so the agent can see it and build on it.
   */
  it('gives a second attempt the work the first one collided with', async () => {
    await Promise.all([
      runTask('run-k', '1.1', 'WRITE seed.txt the first version'),
      runTask('run-k', '1.2', 'WRITE seed.txt the second version'),
    ]);
    const first = await integrate('run-k', ['1.1', '1.2']);
    expect(first.body.conflicts.map((c: any) => c.taskCode)).toEqual(['1.2']);
    const loser = git(repoDir, 'rev-parse', taskBranchName('run-k', '1.2'));

    const retry = await runTask('run-k', '1.2', 'WRITE added.ts built on the first version');

    // Cut from the merged run branch, not from where the run began.
    expect(retry.report.baseSha).toBe(first.body.headSha);
    expect(retry.report.filesCreated).toEqual(['added.ts']);
    // The first attempt was kept, under another name.
    expect(git(repoDir, 'rev-parse', `${taskBranchName('run-k', '1.2')}-attempt-${loser.slice(0, 8)}`)).toBe(loser);

    const second = await integrate('run-k', ['1.1', '1.2']);
    expect(second.body.conflicts).toEqual([]);
    expect(second.body.merged).toMatchObject([
      { taskCode: '1.1', alreadyMerged: true },
      { taskCode: '1.2', alreadyMerged: false },
    ]);
    expect(git(repoDir, 'show', `${second.body.runBranch}:seed.txt`)).toBe('the first version');
    expect(git(repoDir, 'show', `${second.body.runBranch}:added.ts`)).toBe('built on the first version');
  });

  it('starts the next wave from the merged work of the one before', async () => {
    await runTask('run-l', '1.1', 'WRITE lib.ts the library');
    const merged = await integrate('run-l', ['1.1']);

    const { report } = await runTask('run-l', '2.1', 'WRITE uses.ts uses the library');

    expect(report.baseSha).toBe(merged.body.headSha);
    // The predecessor's file is in the tree the second task was given.
    expect(git(repoDir, 'ls-tree', '-r', '--name-only', report.commitSha).split('\n').sort()).toEqual([
      'lib.ts',
      'seed.txt',
      'uses.ts',
    ]);
    // And only its own change is attributed to it.
    expect(report.filesCreated).toEqual(['uses.ts']);
  });

  it('can be asked twice without merging twice', async () => {
    await runTask('run-m', '1.1', 'WRITE a.ts one');
    const first = await integrate('run-m', ['1.1']);
    const second = await integrate('run-m', ['1.1']);

    expect(second.body.headSha).toBe(first.body.headSha);
    expect(second.body.merged).toMatchObject([{ taskCode: '1.1', alreadyMerged: true }]);
  });

  it('names a task that has no branch rather than skipping it silently', async () => {
    await runTask('run-n', '1.1', 'WRITE a.ts one');
    const { body } = await integrate('run-n', ['1.1', '1.9']);
    expect(body.merged.map((m: any) => m.taskCode)).toEqual(['1.1']);
    expect(body.missing).toEqual(['1.9']);
  });

  it('refuses to move the run branch underneath a checkout that has it open', async () => {
    await runTask('run-o', '1.1', 'WRITE a.ts one');
    git(repoDir, 'checkout', '-q', runBranchName('run-o'));

    const { status, body } = await integrate('run-o', ['1.1']);

    expect(status).toBe(409);
    expect(body.error).toBe('RUN_BRANCH_CHECKED_OUT');
    expect(body.message).toContain(runBranchName('run-o'));
    // And did not move it.
    expect(git(repoDir, 'status', '--porcelain')).toBe('');
    expect(existsSync(join(repoDir, 'a.ts'))).toBe(false);
  });

  it('says so when the run has no branch here', async () => {
    const { status, body } = await integrate('never-ran', ['1.1']);
    expect(status).toBe(404);
    expect(body.error).toBe('RUN_BRANCH_MISSING');
  });

  it('rejects a malformed request', async () => {
    const res = await fetch(`${base}/v1/integrate`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ repo: repoDir, runId: 'x' }),
    });
    expect(res.status).toBe(400);
  });
});

describe('what it refuses', () => {
  it('refuses to isolate in a directory that is not a repository', async () => {
    repoDir = join(scratch, 'not-a-repo');
    mkdirSync(repoDir, { recursive: true });

    const result = await runTask('run-p', '1.1', 'WRITE a.ts one');

    expect(result.status).toBe(400);
    expect(result.body.error).toBe('ISOLATION_UNAVAILABLE');
    expect(result.body.message).toContain('not a git repository');
    // And did not run the agent there instead.
    expect(existsSync(join(repoDir, 'a.ts'))).toBe(false);
  });

  it('refuses to isolate a resumed session', async () => {
    const result = await runTask('run-q', '1.1', 'x', { resumeSessionId: 'abc' });
    expect(result.status).toBe(400);
    expect(result.body.message).toContain('resumed');
  });

  it('refuses an isolation request with no task', async () => {
    const result = await runTask('run-r', '1.1', 'x', { isolation: { runId: 'run-r' } });
    expect(result.status).toBe(400);
    expect(result.body.error).toBe('ISOLATION_UNAVAILABLE');
  });

  /** A dispatch must not be able to name a branch outside `devpilot/`. */
  it('cannot be made to write outside its own branches or directory', async () => {
    const { report } = await runTask('../../escape', '../1.1 --upload-pack=x', 'WRITE a.ts one');

    expect(report.success).toBe(true);
    expect(report.branch).toBe('devpilot/escape/task-1.1-upload-pack-x');
    const branches = git(repoDir, 'for-each-ref', '--format=%(refname:short)', 'refs/heads').split('\n');
    expect(branches.every((b) => b === 'main' || b.startsWith('devpilot/escape/'))).toBe(true);
    // Nothing was created beside the worktree root.
    expect(readdirSync(scratch).filter((n) => n === 'escape')).toEqual([]);
  });

  it('still runs a task with no isolation in the checkout itself', async () => {
    const sessionId = `sess-${++sessionCount}`;
    const res = await fetch(`${base}/v1/sessions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ sessionId, repo: repoDir, prompt: 'WRITE direct.ts here', callbackUrl: CALLBACK_URL }),
    });
    expect(res.status).toBe(201);
    const deadline = Date.now() + 15_000;
    let report: any;
    while (Date.now() < deadline && !report) {
      report = received.find((r) => r.path.endsWith('/complete') && r.body?.sessionId === sessionId)?.body;
      await new Promise((r) => setTimeout(r, 50));
    }
    expect(report.success).toBe(true);
    expect(report.branch).toBeUndefined();
    expect(existsSync(join(repoDir, 'direct.ts'))).toBe(true);
    expect(git(repoDir, 'for-each-ref', '--format=%(refname:short)', 'refs/heads')).toBe('main');
  });
});

describe('the operator’s setup step', () => {
  const SETUP_PORT = 39163;

  it('runs in the new worktree before the agent does', async () => {
    const setupRunner = new SessionRunner(
      config({ port: SETUP_PORT, isolation: { worktreeRoot, setupCommand: 'echo ready > .setup-ran' } })
    );
    await setupRunner.start();
    try {
      const { report } = await runTask('run-s', '1.1', 'WRITE a.ts one', {}, `http://127.0.0.1:${SETUP_PORT}`);
      expect(report.success).toBe(true);
      // The setup step's file was there for the agent, so it is in the commit.
      expect(report.filesCreated.sort()).toEqual(['.setup-ran', 'a.ts']);
      expect(readFileSync(join(scratch, 'last-prompt.txt'), 'utf8')).toContain('setup step has prepared');
    } finally {
      await setupRunner.stop();
    }
  });

  it('fails the task, and leaves nothing behind, when setup fails', async () => {
    const setupRunner = new SessionRunner(
      config({ port: SETUP_PORT + 1, isolation: { worktreeRoot, setupCommand: 'echo no such registry >&2; exit 3' } })
    );
    await setupRunner.start();
    try {
      const { report } = await runTask('run-t', '1.1', 'WRITE a.ts one', {}, `http://127.0.0.1:${SETUP_PORT + 1}`);
      expect(report.success).toBe(false);
      expect(report.error).toContain('setup command failed');
      expect(report.error).toContain('no such registry');
      expect(git(repoDir, 'for-each-ref', '--format=%(refname:short)', 'refs/heads/devpilot/run-t/task-1.1')).toBe('');
      expect(leftoverWorktrees()).toEqual([]);
    } finally {
      await setupRunner.stop();
    }
  });
});

describe('names', () => {
  it('keeps the run branch and its task branches from colliding as refs', () => {
    // `devpilot/x` and `devpilot/x/task-1` cannot both exist; these can.
    expect(runBranchName('plan_42')).toBe('devpilot/plan_42/run');
    expect(taskBranchName('plan_42', '2.1')).toBe('devpilot/plan_42/task-2.1');
  });

  it('reduces anything to what a ref and a path both allow', () => {
    expect(refSafe('a b/c:d~e^f')).toBe('a-b-c-d-e-f');
    expect(refSafe('..hidden..')).toBe('hidden');
    expect(refSafe('x..y')).toBe('x.y');
    expect(() => refSafe('///')).toThrow(/cannot be used/);
    expect(() => refSafe('head.lock')).toThrow(/cannot be used/);
  });
});
