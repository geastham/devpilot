import { execFileSync } from 'node:child_process';
import type { BridgeClient } from '@devpilot.sh/bridge-client';
import { adoption, codeGraph } from '@devpilot.sh/core';
import { buildIndex, excludeIndexFromGit, findIndexer, hasIndex, installHint, syncIndex, type Indexer } from '../../utils/codegraph';
import { pushGraph, type PushOutcome } from '../../utils/graph-push';
import { WHAT_CROSSES, clientFor, identify, keyFor, loadShares, saveShares, shareStorePath } from '../graph';

/**
 * What an agent working in a repository can ask DevPilot to do about THAT
 * repository: set it up, keep its code graph current, and ask the graph what a
 * change would reach.
 *
 * These run on this machine, in the session's own directory — which is why
 * they are here and not on the hosted MCP server, which has no code and does
 * not know where a session is. Everything here is what a `devpilot graph …`
 * command already does; a tool is the same work, asked for in a sentence.
 *
 * ONE THING AN AGENT MAY NOT DECIDE. Sharing a graph sends the names in a
 * repository off the machine. `share: true` does that, and the description
 * tells the model to pass it only when the person asked. Without it, the tool
 * says exactly what would cross and sends nothing.
 *
 * Nothing here writes to stdout: this process speaks MCP on it.
 */

export interface RepoToolDeps {
  /** The session's directory. Defaults to where the server was started. */
  cwd: string;
  storePath: string;
  findIndexer: () => Promise<Indexer | null>;
  client: () => Pick<BridgeClient, 'graphManifest' | 'graphSync'> | null;
  push: typeof pushGraph;
}

export function defaultRepoDeps(env: NodeJS.ProcessEnv = process.env): RepoToolDeps {
  return {
    cwd: env.DEVPILOT_REPO_DIR?.trim() || process.cwd(),
    storePath: shareStorePath(),
    findIndexer: () => findIndexer(env),
    client: () => clientFor({}),
    push: pushGraph,
  };
}

/** The checkout the session is in, or why there is none. */
function checkout(deps: RepoToolDeps): { dir: string; repo: string | null; branch: string | null } | { error: string } {
  // This process outlives a `git checkout`: what branch the session is on is
  // read now, not remembered from the first call.
  adoption.clearRepoCache();
  let dir: string;
  try {
    dir = execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: deps.cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 5_000 }).trim();
  } catch {
    return { error: `${deps.cwd} is not inside a git repository, so there is nothing here for DevPilot to set up.` };
  }
  return { dir, repo: adoption.resolveRepo(dir)?.repo ?? null, branch: adoption.resolveBranch(dir) ?? null };
}

const counts = (dir: string) => {
  const s = codeGraph.readGraphStatus(dir);
  return s.initialized
    ? `${s.files} files, ${s.nodes} symbols, ${s.edges} references${s.indexedAt ? `, as of ${new Date(s.indexedAt).toISOString()}` : ''}`
    : null;
};

function pushLine(outcome: PushOutcome, label: string): string {
  if (outcome.status === 'pushed') {
    return outcome.changed + outcome.removed === 0
      ? `The hosted copy of ${label} was already current.`
      : `Sent to the hosted plane as ${label}: ${outcome.changed} file(s) changed, ${outcome.removed} removed.`;
  }
  if (outcome.status === 'disabled') return 'Not sent: the workspace has the hosted code graph turned off (Settings → Code graph).';
  if (outcome.status === 'no-index') return `Not sent: ${outcome.reason}.`;
  return `Not sent: ${outcome.message}`.slice(0, 400);
}

export function createRepoTools(deps: RepoToolDeps) {
  return {
    async status(): Promise<string> {
      const here = checkout(deps);
      if ('error' in here) return here.error;
      const indexer = await deps.findIndexer();
      const index = counts(here.dir);
      const shared = loadShares(deps.storePath).repos[keyFor(here.dir)];
      return [
        `Repository: ${here.repo ?? 'no origin remote'}${here.branch ? ` (on ${here.branch})` : ''}`,
        `Machine connected to DevPilot: ${deps.client() ? 'yes' : 'no — run `devpilot bridge connect --token <token>` once'}`,
        `Code graph indexer: ${indexer ? `codegraph ${indexer.version ?? ''}`.trim() : `not installed (${installHint()})`}`,
        `Local index: ${index ?? 'none — devpilot_repo_init builds one'}`,
        `Shared with the hosted plane: ${shared ? `yes, as ${shared.repo} since ${shared.sharedAt.slice(0, 10)}` : 'no — structure stays on this machine'}`,
      ].join('\n');
    },

    async init(input: { share?: boolean }): Promise<string> {
      const here = checkout(deps);
      if ('error' in here) return here.error;
      const indexer = await deps.findIndexer();
      if (!indexer) {
        return (
          'The code graph indexer is not installed, and DevPilot does not install it for you (it is about 295 MB). ' +
          `Ask the user to run: ${installHint()}`
        );
      }

      const had = hasIndex(here.dir);
      if (had) await syncIndex(indexer, here.dir);
      else await buildIndex(indexer, here.dir);
      await excludeIndexFromGit(here.dir);
      const lines = [`${had ? 'Index brought up to date' : 'Index built'}: ${counts(here.dir) ?? 'unreadable'}. It is kept out of git and has not left this machine.`];

      if (!input.share) {
        const already = loadShares(deps.storePath).repos[keyFor(here.dir)];
        lines.push(
          already
            ? `Already shared as ${already.repo}; devpilot_graph_sync sends what changed.`
            : 'Not shared. Sharing sends the following to the hosted plane, and only if the user asks for it ' +
                `(then call this again with share: true):\n${WHAT_CROSSES.map((l) => `  ${l}`).join('\n')}`,
        );
        return lines.join('\n');
      }

      const client = deps.client();
      if (!client) return [...lines, 'Not shared: this machine has no DevPilot credentials. `devpilot bridge connect --token <token>` first.'].join('\n');
      // Asked for here and now, about this checkout: whatever branch it is on.
      const identity = identify(here.dir, indexer.version ?? 'unknown', { anyBranch: true });
      if ('error' in identity) return [...lines, `Not shared: ${identity.error}`].join('\n');

      const outcome = await deps.push(client, here.dir, identity);
      lines.push(pushLine(outcome, `${identity.repo}@${identity.branch}`));
      if (outcome.status === 'pushed') {
        const store = loadShares(deps.storePath);
        store.repos[keyFor(here.dir)] = { repo: identity.repo, sharedAt: new Date().toISOString() };
        saveShares(store, deps.storePath);
        lines.push('A running bridge keeps it current while this checkout is on the default branch. `devpilot graph unshare` stops it and deletes the hosted copy.');
      }
      return lines.join('\n');
    },

    async sync(): Promise<string> {
      const here = checkout(deps);
      if ('error' in here) return here.error;
      const indexer = await deps.findIndexer();
      if (!indexer || !hasIndex(here.dir)) return 'There is no index here yet. devpilot_repo_init builds one.';

      await syncIndex(indexer, here.dir);
      const lines = [`Index synced with the files on disk: ${counts(here.dir) ?? 'unreadable'}.`];

      if (!loadShares(deps.storePath).repos[keyFor(here.dir)]) {
        lines.push('This repository is not shared, so nothing was sent.');
        return lines.join('\n');
      }
      const client = deps.client();
      const identity = identify(here.dir, indexer.version ?? 'unknown');
      if (!client) lines.push('Not sent: this machine has no DevPilot credentials.');
      else if ('error' in identity) lines.push(`Not sent: ${identity.error}`);
      else if (identity.skip) lines.push(`The hosted copy was left as it is: ${identity.skip}.`);
      else lines.push(pushLine(await deps.push(client, here.dir, identity), `${identity.repo}@${identity.branch}`));
      return lines.join('\n');
    },

    async impact(input: { paths: string[] }): Promise<string> {
      const here = checkout(deps);
      if ('error' in here) return here.error;
      const dependents = codeGraph.dependentsOf(here.dir, input.paths, { depth: 2, limit: 40 });
      if (!dependents.available) return `There is no readable index here (${dependents.reason ?? 'none built'}). devpilot_repo_init builds one.`;
      const tests = codeGraph.affectedTests(here.dir, input.paths, { limit: 30 });

      const sections = input.paths.map((path) => {
        const files = dependents.byFile[path] ?? [];
        return files.length === 0
          ? `## ${path}\nNothing in the index depends on it (or the index does not know this file yet).`
          : `## ${path}\n${files.length} file(s) depend on it, within two steps:\n${files.map((f) => `- ${f}`).join('\n')}`;
      });
      sections.push(
        tests.tests.length === 0
          ? '## Tests\nNo test file is reached from these paths in the index.'
          : `## Tests reached from these paths (nearest first)\n${tests.tests.map((t) => `- ${t}`).join('\n')}`,
      );
      const asOf = codeGraph.readGraphStatus(here.dir).indexedAt;
      return (
        sections.join('\n\n') +
        `\n\nFrom the local index${asOf ? ` as of ${new Date(asOf).toISOString()}` : ''}; edits since are not in it until devpilot_graph_sync. ` +
        'A reference the indexer could not resolve is missing, so an empty list is not a guarantee.' +
        (dependents.truncated || tests.truncated ? ' Lists were cut short.' : '')
      );
    },
  };
}
