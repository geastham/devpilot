import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRepoTools, type RepoToolDeps } from '../../src/commands/mcp/repo-tools';
import { loadShares } from '../../src/commands/graph';
import { buildServer } from '../../src/commands/mcp';

/**
 * The repository tools an agent is given. The one that matters most is the one
 * that can send something off the machine, and when it must not.
 */

const root = mkdtempSync(join(tmpdir(), 'devpilot-mcp-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));

function git(dir: string, ...args: string[]) {
  execFileSync('git', args, { cwd: dir, stdio: 'ignore' });
}

function repo(name: string, branch = 'main'): string {
  const dir = join(root, name);
  mkdirSync(join(dir, 'src'), { recursive: true });
  git(dir, 'init', '-q', '-b', 'main');
  git(dir, 'remote', 'add', 'origin', 'git@github.com:acme/storefront.git');
  writeFileSync(join(dir, 'src', 'a.ts'), 'export const a = 1;\n');
  git(dir, 'add', '.');
  git(dir, '-c', 'user.email=t@example.test', '-c', 'user.name=t', 'commit', '-q', '-m', 'one');
  git(dir, 'update-ref', 'refs/remotes/origin/main', 'HEAD');
  git(dir, 'symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/main');
  if (branch !== 'main') git(dir, 'checkout', '-q', '-b', branch);
  // An index on disk, so the tools sync rather than build; the indexer is `true`.
  mkdirSync(join(dir, '.codegraph'), { recursive: true });
  writeFileSync(join(dir, '.codegraph', 'codegraph.db'), '');
  return dir;
}

let seq = 0;
let storePath: string;
const pushed = { status: 'pushed', changed: 2, removed: 0, batches: 1, skipped: [], counts: { files: 2, nodes: 5, edges: 6 } };

function tools(cwd: string, over: Partial<RepoToolDeps> = {}) {
  const push = vi.fn(async () => pushed);
  const deps: RepoToolDeps = {
    cwd,
    storePath,
    findIndexer: async () => ({ bin: 'true', version: '1.6.1' }),
    client: () => ({}) as never,
    push: push as never,
    ...over,
  };
  return { t: createRepoTools(deps), push: (over.push as typeof push | undefined) ?? push };
}

beforeEach(() => {
  storePath = join(root, `share-${seq++}.json`);
});

describe('setting a repository up', () => {
  it('builds the index and sends nothing unless asked to share', async () => {
    const dir = repo('init-local');
    const { t, push } = tools(dir);
    const said = await t.init({});
    expect(push).not.toHaveBeenCalled();
    expect(said).toContain('has not left this machine');
    // And it says what sharing would send, so the person can decide.
    expect(said).toContain('share: true');
    expect(loadShares(storePath).repos).toEqual({});
  });

  it('shares when asked, from whatever branch the session is on, and records it', async () => {
    const dir = repo('init-share', 'feat/x');
    const { t, push } = tools(dir);
    const said = await t.init({ share: true });
    expect(push).toHaveBeenCalledTimes(1);
    expect(push.mock.calls[0][2]).toMatchObject({ repo: 'acme/storefront', branch: 'feat/x' });
    expect(said).toContain('acme/storefront@feat/x');
    expect(Object.values(loadShares(storePath).repos)).toEqual([expect.objectContaining({ repo: 'acme/storefront' })]);
  });

  it('does not record a share that did not land', async () => {
    const dir = repo('init-off');
    const { t } = tools(dir, { push: vi.fn(async () => ({ status: 'disabled', message: 'off' })) as never });
    expect(await t.init({ share: true })).toContain('turned off');
    expect(loadShares(storePath).repos).toEqual({});
  });

  it('says so plainly without credentials, without the indexer, and outside a repository', async () => {
    const dir = repo('init-bare');
    expect(await tools(dir, { client: () => null }).t.init({ share: true })).toContain('no DevPilot credentials');
    expect(await tools(dir, { findIndexer: async () => null }).t.init({})).toContain('not installed');
    expect(await tools(root).t.init({})).toContain('not inside a git repository');
  });
});

describe('syncing the graph', () => {
  it('syncs locally and sends nothing for a repository that is not shared', async () => {
    const dir = repo('sync-local');
    const { t, push } = tools(dir);
    expect(await t.sync()).toContain('not shared');
    expect(push).not.toHaveBeenCalled();
  });

  it('sends the difference for a shared repository on its default branch', async () => {
    const dir = repo('sync-shared');
    const { t, push } = tools(dir);
    await t.init({ share: true });
    push.mockClear();
    expect(await t.sync()).toContain('acme/storefront@main');
    expect(push).toHaveBeenCalledTimes(1);
  });

  it('leaves the hosted copy alone when the checkout has moved off the default branch', async () => {
    const dir = repo('sync-branch');
    const { t, push } = tools(dir);
    await t.init({ share: true });
    git(dir, 'checkout', '-q', '-b', 'feat/y');
    push.mockClear();
    expect(await t.sync()).toContain('left as it is');
    expect(push).not.toHaveBeenCalled();
  });
});

describe('asking what a change would reach', () => {
  it('says there is no readable index rather than "nothing depends on it"', async () => {
    const dir = repo('impact-empty');
    const said = await tools(dir).t.impact({ paths: ['src/a.ts'] });
    expect(said).toContain('no readable index');
  });
});

describe('the server an agent is given', () => {
  const names = (env: NodeJS.ProcessEnv) =>
    Object.keys((buildServer(env) as unknown as { _registeredTools: Record<string, unknown> })._registeredTools);

  it('offers session, history and repository tools by default', () => {
    const all = names({});
    for (const tool of ['devpilot_session_share', 'devpilot_history', 'devpilot_repo_init', 'devpilot_graph_sync', 'devpilot_code_impact', 'devpilot_repo_status']) {
      expect(all).toContain(tool);
    }
  });

  it('gives a runner that names its groups only those', () => {
    const only = names({ DEVPILOT_MCP_TOOLS: 'history' });
    expect(only).toEqual(['devpilot_history']);
  });
});
