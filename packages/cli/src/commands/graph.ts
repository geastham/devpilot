import { Command } from 'commander';
import chalk from 'chalk';
import { execFileSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { dirname, join, resolve } from 'path';
import { BridgeClient, DEFAULT_BRIDGE_URL, resolveBridgeCredentials } from '@devpilot.sh/bridge-client';
import { adoption, codeGraph } from '@devpilot.sh/core';
import {
  GRAPH_DIR,
  buildIndex,
  excludeIndexFromGit,
  findIndexer,
  hasIndex,
  installHint,
  syncIndex,
} from '../utils/codegraph';
import { pushGraph, type GraphIdentity, type PushOutcome } from '../utils/graph-push';

/**
 * `devpilot graph` — the code graph for a repository.
 *
 * Two separate decisions live here, and they are kept separate on purpose.
 *
 * **Having an index** (`enable`) is local. It builds a SQLite file in the
 * repository's own directory, read by the planner to predict which tasks will
 * collide, and — if the harness says so — queried by agents. Nothing leaves
 * the machine.
 *
 * **Sharing it** (`share`) sends the graph's STRUCTURE to the hosted plane:
 * file paths, the names of functions and classes, and which refers to which.
 * No signature, no comment, no file contents. It is still more than the
 * hosted plane otherwise receives, so it is opt-in per repository, says
 * exactly what crosses before it does anything, and can be undone.
 */

// ============================================================================
// Which repositories are shared
// ============================================================================

interface ShareStore {
  version: 1;
  repos: Record<string, { repo: string; sharedAt: string }>;
}

export function shareStorePath(home: string = homedir()): string {
  return join(home, '.devpilot', 'graph-share.json');
}

export function loadShares(path: string = shareStorePath()): ShareStore {
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as ShareStore;
    if (parsed && parsed.version === 1 && parsed.repos && typeof parsed.repos === 'object') return parsed;
  } catch {
    // No file yet, or not one of ours.
  }
  return { version: 1, repos: {} };
}

export function saveShares(store: ShareStore, path: string = shareStorePath()): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(store, null, 2) + '\n', { mode: 0o600 });
}

/** Keyed by the real path, so two ways of naming one checkout are one entry. */
export function keyFor(dir: string): string {
  try {
    return realpathSync(dir);
  } catch {
    return resolve(dir);
  }
}

// ============================================================================
// Git facts about a checkout
// ============================================================================

function git(dir: string, args: string[]): string | null {
  try {
    return execFileSync('git', args, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 5_000 }).trim() || null;
  } catch {
    return null;
  }
}

/** `main`, from `origin/HEAD`. Null when the remote has not said. */
export function defaultBranch(dir: string): string | null {
  const ref = git(dir, ['symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD']);
  return ref ? ref.replace(/^origin\//, '') : null;
}

export interface CheckoutIdentity extends GraphIdentity {
  /** Set when this checkout should not be pushed, with the reason. */
  skip?: string;
}

/**
 * Who this checkout is, for the hosted graph.
 *
 * The hosted graph follows the repository's DEFAULT branch. A checkout that is
 * on a feature branch is describing work in progress, and pushing it would
 * make the shared graph flip between whatever each machine happened to have
 * open. So a checkout on another branch is skipped, and says so.
 */
export function identify(dir: string, indexerVersion: string, opts: { anyBranch?: boolean } = {}): CheckoutIdentity | { error: string } {
  const repo = adoption.resolveRepo(dir)?.repo;
  if (!repo) return { error: 'This directory has no `origin` remote, so there is no repository name to file the graph under.' };
  const branch = adoption.resolveBranch(dir);
  const commitSha = git(dir, ['rev-parse', 'HEAD']);
  if (!branch || !commitSha) return { error: 'Could not read the current branch and commit.' };

  const identity: CheckoutIdentity = { repo, branch, commitSha, indexerVersion };
  const main = defaultBranch(dir);
  if (!opts.anyBranch && main && branch !== main) {
    identity.skip = `the hosted graph follows ${main}, and this checkout is on ${branch}`;
  }
  return identity;
}

// ============================================================================
// What crosses, said once
// ============================================================================

export const WHAT_CROSSES = [
  'What the hosted plane receives for this repository:',
  '  · file paths, languages, and a hash of each file (to tell what changed)',
  '  · the NAMES of functions, classes, methods and other symbols, with their',
  '    kind and line range',
  '  · which symbol calls, imports or refers to which',
  '',
  'What it never receives:',
  '  · signatures, parameter lists or return types',
  '  · comments and docstrings',
  '  · the contents of any file',
  '',
  'The hosted code graph is a premium feature, free during early access. Your',
  'workspace must have it turned on (Manage → Code graph).',
];

function describePush(outcome: PushOutcome, identity: GraphIdentity): string[] {
  switch (outcome.status) {
    case 'pushed': {
      const lines = [
        chalk.green(`Graph for ${identity.repo}@${identity.branch} is up to date on the hosted plane.`),
        chalk.gray(
          `  ${outcome.changed} file${outcome.changed === 1 ? '' : 's'} sent, ${outcome.removed} removed` +
            (outcome.counts ? ` · now ${outcome.counts.files} files, ${outcome.counts.nodes} symbols, ${outcome.counts.edges} references` : '')
        ),
      ];
      for (const s of outcome.skipped) {
        lines.push(chalk.yellow(`  left out: ${s.path} (${s.nodes} symbols — too large to send as one file)`));
      }
      return lines;
    }
    case 'no-index':
      return [chalk.red(`No index to send: ${outcome.reason}`), chalk.gray('  Run `devpilot graph enable` first.')];
    case 'disabled':
      return [
        chalk.yellow('The hosted code graph is not turned on for this workspace.'),
        chalk.gray('  It is a premium feature, free during early access: turn it on under'),
        chalk.gray('  Manage → Code graph in the dashboard (an owner or admin), then run this again.'),
      ];
    case 'failed':
      return [chalk.red(`Could not send the graph: ${outcome.message}`), chalk.gray(`  ${outcome.sent} batch(es) landed before it stopped. Running this again picks up from what is there.`)];
  }
}

export function clientFor(options: { url?: string; token?: string }): BridgeClient | null {
  const credentials = resolveBridgeCredentials({ url: options.url, token: options.token });
  if (!credentials.token) return null;
  return new BridgeClient({ bridgeUrl: credentials.url ?? DEFAULT_BRIDGE_URL, token: credentials.token });
}

// ============================================================================
// Commands
// ============================================================================

export const graphCommand = new Command('graph').description(
  'The code graph for a repository: an index the planner and agents can ask what depends on what'
);

graphCommand
  .command('enable [path]')
  .description('Build the code graph index for a repository (local; nothing leaves the machine)')
  .action(async (path?: string) => {
    const dir = resolve(path ?? process.cwd());
    const indexer = await findIndexer();
    if (!indexer) {
      console.log(chalk.yellow('The code graph indexer is not installed.'));
      console.log('');
      console.log('  DevPilot uses `codegraph` (MIT, github.com/colbymchenry/codegraph) to build the');
      console.log('  index. It is not bundled — it is about 295 MB — and DevPilot does not install');
      console.log('  it for you. To install the version this was verified against:');
      console.log('');
      console.log(`    ${installHint()}`);
      console.log('');
      console.log(chalk.gray('  Its own installer asks about anonymous usage statistics; that answer is'));
      console.log(chalk.gray('  yours. Every run DevPilot makes of it sets DO_NOT_TRACK=1.'));
      process.exitCode = 1;
      return;
    }

    console.log(chalk.gray(`Indexing ${dir} with codegraph ${indexer.version ?? ''}…`));
    try {
      if (hasIndex(dir)) await syncIndex(indexer, dir);
      else await buildIndex(indexer, dir);
    } catch (error) {
      console.error(chalk.red(`Indexing failed: ${error instanceof Error ? error.message.slice(0, 600) : error}`));
      process.exitCode = 1;
      return;
    }
    const excluded = await excludeIndexFromGit(dir);

    const status = codeGraph.readGraphStatus(dir);
    console.log(chalk.green('Code graph ready.'));
    console.log(chalk.gray(`  ${status.files} files · ${status.nodes} symbols · ${status.edges} references`));
    console.log(chalk.gray(`  ${join(dir, GRAPH_DIR)}`) + (excluded ? chalk.gray('  (kept out of git via .git/info/exclude)') : ''));
    console.log('');
    console.log('  With this in place:');
    console.log('  · the planner separates tasks whose files depend on each other, not only');
    console.log('    tasks that name the same file;');
    console.log('  · each task\'s worktree gets a copy of the index, kept current as it edits;');
    console.log('  · agents are given the graph only if the runner is started with');
    console.log('    `--harness <profile>+code-graph`. Whether that saves tokens has not been');
    console.log('    measured; run with and without it and compare the two rows on Efficiency.');
    console.log('');
    console.log(chalk.gray('  Nothing has left this machine. `devpilot graph share` is the separate step that'));
    console.log(chalk.gray('  sends the graph\'s structure to the hosted plane.'));
  });

graphCommand
  .command('status [path]')
  .description('Show the index for a repository and whether it is shared')
  .action(async (path?: string) => {
    const dir = resolve(path ?? process.cwd());
    const indexer = await findIndexer();
    const status = codeGraph.readGraphStatus(dir);
    const shared = loadShares().repos[keyFor(dir)];

    console.log(chalk.white('Code graph'));
    console.log(chalk.gray('  Indexer: ') + (indexer ? `codegraph ${indexer.version ?? ''}`.trim() : `not installed (${installHint()})`));
    if (!status.initialized) {
      console.log(chalk.gray('  Index:   ') + 'none for this directory. `devpilot graph enable` builds one.');
    } else {
      console.log(chalk.gray('  Index:   ') + `${status.files} files · ${status.nodes} symbols · ${status.edges} references`);
      if (status.indexedAt) {
        console.log(chalk.gray('  As of:   ') + new Date(status.indexedAt).toISOString());
      }
    }
    console.log(
      chalk.gray('  Shared:  ') +
        (shared ? `yes, as ${shared.repo} (since ${shared.sharedAt.slice(0, 10)})` : 'no — structure stays on this machine')
    );
  });

graphCommand
  .command('sync [path]')
  .description('Bring the index up to date with the files on disk')
  .action(async (path?: string) => {
    const dir = resolve(path ?? process.cwd());
    const indexer = await findIndexer();
    if (!indexer || !hasIndex(dir)) {
      console.log(chalk.yellow('Nothing to sync: run `devpilot graph enable` first.'));
      process.exitCode = 1;
      return;
    }
    await syncIndex(indexer, dir);
    const status = codeGraph.readGraphStatus(dir);
    console.log(chalk.green(`Synced: ${status.files} files · ${status.nodes} symbols · ${status.edges} references`));
  });

graphCommand
  .command('disable [path]')
  .description('Delete the local index for a repository')
  .action((path?: string) => {
    const dir = resolve(path ?? process.cwd());
    const target = join(dir, GRAPH_DIR);
    if (!existsSync(join(target, 'codegraph.db'))) {
      console.log(chalk.gray('There is no index here.'));
      return;
    }
    rmSync(target, { recursive: true, force: true });
    console.log(chalk.green('Local index deleted.'));
    if (loadShares().repos[keyFor(dir)]) {
      console.log(chalk.gray('  This repository is still marked as shared; the hosted copy is unchanged.'));
      console.log(chalk.gray('  `devpilot graph unshare` removes it.'));
    }
  });

graphCommand
  .command('share [path]')
  .description('Send this repository\'s graph structure to the hosted plane, and keep it current')
  .option('--yes', 'Skip the confirmation (the list of what crosses is still printed)')
  .option('--url <url>', 'Hosted plane URL')
  .option('--token <token>', 'Bridge token')
  .option('--any-branch', 'Send the graph even when this checkout is not on the default branch')
  .action(async (path: string | undefined, options: { yes?: boolean; url?: string; token?: string; anyBranch?: boolean }) => {
    const dir = resolve(path ?? process.cwd());
    const status = codeGraph.readGraphStatus(dir);
    if (!status.initialized) {
      console.log(chalk.yellow('There is no index here yet. Run `devpilot graph enable` first.'));
      process.exitCode = 1;
      return;
    }
    const indexer = await findIndexer();
    const identity = identify(dir, indexer?.version ?? 'unknown', { anyBranch: options.anyBranch });
    if ('error' in identity) {
      console.error(chalk.red(identity.error));
      process.exitCode = 1;
      return;
    }

    console.log(chalk.white(`Share the code graph for ${identity.repo}`));
    console.log('');
    for (const line of WHAT_CROSSES) console.log(`  ${line}`);
    console.log('');

    if (!options.yes) {
      console.log('  Nothing has been sent. To go ahead:');
      console.log(chalk.cyan(`    devpilot graph share ${path ?? ''} --yes`.replace(/\s+--yes/, ' --yes')));
      return;
    }

    const client = clientFor(options);
    if (!client) {
      console.error(chalk.red('No bridge credentials on this machine. Run `devpilot bridge connect --token <token>` once first.'));
      process.exitCode = 1;
      return;
    }

    if (identity.skip) {
      console.log(chalk.yellow(`Not sent: ${identity.skip}.`));
      console.log(chalk.gray('  Run this from a checkout of the default branch, or pass --any-branch.'));
      process.exitCode = 1;
      return;
    }

    const outcome = await pushGraph(client, dir, identity);
    for (const line of describePush(outcome, identity)) console.log(line);
    if (outcome.status !== 'pushed') {
      process.exitCode = 1;
      return;
    }

    const store = loadShares();
    store.repos[keyFor(dir)] = { repo: identity.repo, sharedAt: new Date().toISOString() };
    saveShares(store);
    console.log('');
    console.log(chalk.gray('  A connected bridge keeps it current from here. `devpilot graph unshare` stops'));
    console.log(chalk.gray('  that and deletes the hosted copy.'));
  });

graphCommand
  .command('push [path]')
  .description('Send the latest structure now, for a repository that is already shared')
  .option('--url <url>', 'Hosted plane URL')
  .option('--token <token>', 'Bridge token')
  .option('--any-branch', 'Send even when this checkout is not on the default branch')
  .action(async (path: string | undefined, options: { url?: string; token?: string; anyBranch?: boolean }) => {
    const dir = resolve(path ?? process.cwd());
    if (!loadShares().repos[keyFor(dir)]) {
      console.log(chalk.yellow('This repository is not shared. `devpilot graph share` explains what that sends and turns it on.'));
      process.exitCode = 1;
      return;
    }
    const client = clientFor(options);
    const indexer = await findIndexer();
    const identity = identify(dir, indexer?.version ?? 'unknown', { anyBranch: options.anyBranch });
    if (!client || 'error' in identity) {
      console.error(chalk.red(!client ? 'No bridge credentials on this machine.' : (identity as { error: string }).error));
      process.exitCode = 1;
      return;
    }
    if (identity.skip) {
      console.log(chalk.yellow(`Not sent: ${identity.skip}.`));
      return;
    }
    if (indexer) await syncIndex(indexer, dir).catch(() => undefined);
    const outcome = await pushGraph(client, dir, identity);
    for (const line of describePush(outcome, identity)) console.log(line);
    if (outcome.status !== 'pushed') process.exitCode = 1;
  });

graphCommand
  .command('unshare [path]')
  .description('Stop sharing this repository\'s graph and delete the hosted copy')
  .option('--url <url>', 'Hosted plane URL')
  .option('--token <token>', 'Bridge token')
  .action(async (path: string | undefined, options: { url?: string; token?: string }) => {
    const dir = resolve(path ?? process.cwd());
    const store = loadShares();
    const entry = store.repos[keyFor(dir)];
    if (!entry) {
      console.log(chalk.gray('This repository is not shared.'));
      return;
    }

    // Stop first, whatever happens to the delete: a failed request must not
    // leave the bridge still sending.
    delete store.repos[keyFor(dir)];
    saveShares(store);

    const client = clientFor(options);
    const branch = defaultBranch(dir) ?? adoption.resolveBranch(dir);
    const deleted = client && branch ? await client.graphDelete(entry.repo, branch) : false;
    console.log(chalk.green('No longer shared from this machine.'));
    console.log(
      deleted
        ? chalk.gray(`  The hosted copy of ${entry.repo}@${branch} was deleted.`)
        : chalk.yellow('  The hosted copy could not be deleted from here. Remove it under Graph in the dashboard.')
    );
  });
