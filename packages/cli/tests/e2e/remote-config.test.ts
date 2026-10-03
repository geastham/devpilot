import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RemoteConfig, findCheckouts } from '../../src/commands/bridge/remote-config';
import { loadShares } from '../../src/commands/graph';

/**
 * A request from elsewhere can make this machine send the names in a
 * repository. These are the conditions under which it does, and — more to the
 * point — the ones under which it does not.
 */

const root = mkdtempSync(join(tmpdir(), 'devpilot-remote-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));

function git(dir: string, ...args: string[]) {
  execFileSync('git', args, { cwd: dir, stdio: 'ignore' });
}

/** A real checkout of `repo`, on `branch`, whose remote says the default is main. */
function checkout(name: string, repo: string, branch = 'main'): string {
  const dir = join(root, name);
  mkdirSync(dir, { recursive: true });
  git(dir, 'init', '-q', '-b', 'main');
  git(dir, 'remote', 'add', 'origin', `git@github.com:${repo}.git`);
  writeFileSync(join(dir, 'a.ts'), 'export const a = 1;\n');
  git(dir, 'add', '.');
  git(dir, '-c', 'user.email=t@example.test', '-c', 'user.name=t', 'commit', '-q', '-m', 'one');
  git(dir, 'update-ref', 'refs/remotes/origin/main', 'HEAD');
  git(dir, 'symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/main');
  if (branch !== 'main') git(dir, 'checkout', '-q', '-b', branch);
  return dir;
}

let answers: { id: string; status: string; result?: string }[] = [];
let storePath: string;
let seq = 0;

function harness(over: {
  commands: { kind: string; repo: string }[];
  allow?: boolean;
  checkouts?: string[];
  indexer?: boolean;
  push?: ReturnType<typeof vi.fn>;
  graphDelete?: ReturnType<typeof vi.fn>;
}) {
  const push =
    over.push ?? vi.fn(async () => ({ status: 'pushed', changed: 1, removed: 0, batches: 1, skipped: [], counts: { files: 1, nodes: 1, edges: 0 } }));
  const graphDelete = over.graphDelete ?? vi.fn(async () => true);
  const client = {
    machineCommands: vi.fn(async () => over.commands.map((c, i) => ({ id: `mc_${i}`, createdAt: '', ...c }))),
    answerMachineCommand: vi.fn(async (id: string, status: string, result?: string) => {
      answers.push({ id, status, result });
      return true;
    }),
    graphManifest: vi.fn(),
    graphSync: vi.fn(),
    graphDelete,
  };
  // An index already on disk, so the handler syncs rather than builds; the
  // indexer binary is `true`, which succeeds and touches nothing.
  for (const dir of over.checkouts ?? []) {
    mkdirSync(join(dir, '.codegraph'), { recursive: true });
    writeFileSync(join(dir, '.codegraph', 'codegraph.db'), '');
  }
  const remote = new RemoteConfig({
    client: client as never,
    allow: over.allow ?? false,
    storePath,
    findCheckouts: async () => over.checkouts ?? [],
    findIndexer: async () => (over.indexer === false ? null : { bin: 'true', version: '1.6.1' }),
    push: push as never,
  });
  return { remote, push, client, graphDelete };
}

beforeEach(() => {
  answers = [];
  storePath = join(root, `share-${seq++}.json`);
});

describe('a request to share a repository', () => {
  it('is declined, and nothing is sent, when the bridge was not started allowing it', async () => {
    const dir = checkout('declined', 'acme/storefront');
    const { remote, push } = harness({ commands: [{ kind: 'graph.share', repo: 'acme/storefront' }], checkouts: [dir] });
    await remote.sweep();
    expect(push).not.toHaveBeenCalled();
    expect(answers).toEqual([expect.objectContaining({ status: 'declined' })]);
    expect(answers[0].result).toContain('--allow-remote-config');
    expect(loadShares(storePath).repos).toEqual({});
  });

  it('is not answered by a machine that does not have the repository', async () => {
    const { remote, push } = harness({ commands: [{ kind: 'graph.share', repo: 'acme/elsewhere' }], allow: true, checkouts: [] });
    await remote.sweep();
    expect(push).not.toHaveBeenCalled();
    expect(answers).toEqual([]);
  });

  it('shares the checkout, records it as shared, and says what was sent', async () => {
    const dir = checkout('applied', 'acme/storefront');
    const { remote, push } = harness({ commands: [{ kind: 'graph.share', repo: 'acme/storefront' }], allow: true, checkouts: [dir] });
    await remote.sweep();
    expect(push).toHaveBeenCalledTimes(1);
    expect(push.mock.calls[0][2]).toMatchObject({ repo: 'acme/storefront', branch: 'main' });
    expect(answers[0]).toMatchObject({ status: 'applied' });
    expect(answers[0].result).toMatch(/acme\/storefront@main at [0-9a-f]{7}: 1 files, 1 symbols/);
    // Its answer names the repository and counts, never where it lives.
    expect(answers[0].result).not.toContain(root);
    expect(Object.values(loadShares(storePath).repos)).toEqual([expect.objectContaining({ repo: 'acme/storefront' })]);
  });

  it('takes the checkout on the default branch over one that is not', async () => {
    const feature = checkout('pick-feature', 'acme/picky', 'feat/x');
    const main = checkout('pick-main', 'acme/picky');
    const { remote, push } = harness({ commands: [{ kind: 'graph.share', repo: 'acme/picky' }], allow: true, checkouts: [feature, main] });
    await remote.sweep();
    expect(push.mock.calls[0][1]).toBe(main);
  });

  it('fails, with the way out, when every checkout is on another branch', async () => {
    const dir = checkout('offbranch', 'acme/branchy', 'feat/x');
    const { remote, push } = harness({ commands: [{ kind: 'graph.share', repo: 'acme/branchy' }], allow: true, checkouts: [dir] });
    await remote.sweep();
    expect(push).not.toHaveBeenCalled();
    expect(answers[0]).toMatchObject({ status: 'failed' });
    expect(answers[0].result).toContain('--any-branch');
  });

  it('fails plainly without the indexer, and when the workspace has the feature off', async () => {
    const dir = checkout('noindexer', 'acme/bare');
    await harness({ commands: [{ kind: 'graph.share', repo: 'acme/bare' }], allow: true, checkouts: [dir], indexer: false }).remote.sweep();
    expect(answers[0]).toMatchObject({ status: 'failed' });
    expect(answers[0].result).toContain('not installed');

    answers = [];
    const off = harness({
      commands: [{ kind: 'graph.share', repo: 'acme/bare' }],
      allow: true,
      checkouts: [dir],
      push: vi.fn(async () => ({ status: 'disabled', message: 'off' })),
    });
    await off.remote.sweep();
    expect(answers[0]).toMatchObject({ status: 'failed' });
    expect(loadShares(storePath).repos).toEqual({});
  });

  it('ignores a request whose repository is shaped like anything but owner/name', async () => {
    const dir = checkout('shape', 'acme/shape');
    for (const repo of ['/Users/me/code', '../../etc', 'acme/shape; rm -rf /', 'acme']) {
      const { remote, push } = harness({ commands: [{ kind: 'graph.share', repo }], allow: true, checkouts: [dir] });
      await remote.sweep();
      expect(push, repo).not.toHaveBeenCalled();
    }
    expect(answers).toEqual([]);
  });

  it('ignores a kind it does not know', async () => {
    const dir = checkout('kind', 'acme/kind');
    const { remote, push } = harness({ commands: [{ kind: 'shell.run', repo: 'acme/kind' }], allow: true, checkouts: [dir] });
    await remote.sweep();
    expect(push).not.toHaveBeenCalled();
    expect(answers).toEqual([]);
  });
});

describe('a request to stop sharing', () => {
  it('stops and deletes the hosted copy, flag or no flag', async () => {
    const dir = checkout('unshare', 'acme/storefront');
    const shared = harness({ commands: [{ kind: 'graph.share', repo: 'acme/storefront' }], allow: true, checkouts: [dir] });
    await shared.remote.sweep();
    const path = storePath;
    answers = [];

    const { remote, graphDelete } = harness({ commands: [{ kind: 'graph.unshare', repo: 'acme/storefront' }], allow: false });
    storePath = path;
    await new RemoteConfig({ ...(remote as unknown as { opts: object }).opts, storePath: path } as never).sweep();
    expect(graphDelete).toHaveBeenCalledWith('acme/storefront', 'main');
    expect(answers[0]).toMatchObject({ status: 'applied' });
    expect(JSON.parse(readFileSync(path, 'utf8')).repos).toEqual({});
  });

  it('is not answered by a machine that never shared it', async () => {
    const { remote, graphDelete } = harness({ commands: [{ kind: 'graph.unshare', repo: 'acme/storefront' }], allow: true });
    await remote.sweep();
    expect(graphDelete).not.toHaveBeenCalled();
    expect(answers).toEqual([]);
  });
});

describe('finding a checkout', () => {
  it('finds one shared from here, by repository name, and not another repository', async () => {
    const dir = checkout('found', 'acme/found');
    const store = join(root, 'found-share.json');
    writeFileSync(store, JSON.stringify({ version: 1, repos: { [dir]: { repo: 'acme/found', sharedAt: '2026-10-01T00:00:00Z' } } }));
    const found = await findCheckouts('acme/found', store);
    expect(found.some((d) => d.endsWith('/found'))).toBe(true);
    expect((await findCheckouts('acme/other', store)).some((d) => d.endsWith('/found'))).toBe(false);
  });
});
