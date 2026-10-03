import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { hostname } from 'node:os';
import type { BridgeClient, MachineCommand } from '@devpilot.sh/bridge-client';
import { adoption } from '@devpilot.sh/core';
import { buildIndex, excludeIndexFromGit, findIndexer, hasIndex, syncIndex, type Indexer } from '../../utils/codegraph';
import { pushGraph, type PushOutcome } from '../../utils/graph-push';
import { defaultBranch, identify, keyFor, loadShares, saveShares, shareStorePath, type CheckoutIdentity } from '../graph';

/**
 * Carries out what a member asked this machine to do from somewhere else.
 *
 * A member's assistant, connected to DevPilot, can ask for a repository's code
 * graph to be shared. The hosted plane cannot do that — it has no code — so it
 * leaves a request, and this is what picks it up. Today there are two kinds:
 * share a repository's graph, and stop.
 *
 * ## The rules
 *
 * OFF UNLESS SAID. Sharing a graph sends the names in a repository off the
 * machine, and until now only a person at this machine's keyboard could decide
 * that (`devpilot graph share --yes`). Letting it be decided from elsewhere is
 * its own consent: the bridge must have been started with
 * `--allow-remote-config`. Without it, a request for a repository this machine
 * has is answered `declined`, with how to turn it on, and nothing is indexed
 * or sent.
 *
 * A NAME, NOT A PLACE. A request says `owner/name`. Which directory that is,
 * if any, is decided here, from checkouts this machine already knows: ones it
 * has shared before, and ones an agent session has run in. Nothing in a
 * request can point this at a path.
 *
 * NOT MINE, NOT ANSWERED. A machine without the repository says nothing, so
 * the request stays open for one that has it.
 *
 * THE SAME WORK AS THE COMMAND. Sharing here is `graph enable` then
 * `graph share --yes`: same indexer, same default-branch rule, same record in
 * the share file, so `devpilot graph status` and `unshare` see it as theirs.
 */

type Client = Pick<BridgeClient, 'machineCommands' | 'answerMachineCommand' | 'graphManifest' | 'graphSync' | 'graphDelete'>;

export interface RemoteConfigOptions {
  client: Client;
  /** `--allow-remote-config`. */
  allow: boolean;
  intervalMs?: number;
  storePath?: string;
  /** Checkouts of a repository on this machine. Injected in tests. */
  findCheckouts?: (repo: string) => Promise<string[]>;
  findIndexer?: () => Promise<Indexer | null>;
  push?: typeof pushGraph;
  onLog?: (line: string) => void;
}

export class RemoteConfig {
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(private readonly opts: RemoteConfigOptions) {}

  start(): void {
    if (this.timer) return;
    void this.sweep();
    this.timer = setInterval(() => void this.sweep(), this.opts.intervalMs ?? 30_000);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async sweep(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      for (const command of await this.opts.client.machineCommands()) {
        try {
          await this.handle(command);
        } catch (error) {
          await this.answer(command, 'failed', error instanceof Error ? error.message : String(error));
        }
      }
    } finally {
      this.running = false;
    }
  }

  private async answer(command: MachineCommand, status: 'applied' | 'failed' | 'declined', result: string): Promise<void> {
    this.opts.onLog?.(`remote request ${command.kind} ${command.repo}: ${status} — ${result}`);
    await this.opts.client.answerMachineCommand(command.id, status, result);
  }

  private async handle(command: MachineCommand): Promise<void> {
    // The hosted table holds the same shape; this is the machine not taking its word for it.
    if (!/^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/.test(command.repo)) return;

    if (command.kind === 'graph.unshare') return this.unshare(command);
    if (command.kind !== 'graph.share') return;

    const checkouts = await (this.opts.findCheckouts ?? findCheckouts)(command.repo);
    if (checkouts.length === 0) return;

    if (!this.opts.allow) {
      return this.answer(
        command,
        'declined',
        `${hostname()} has ${command.repo} but does not take configuration from elsewhere. Restart its bridge with ` +
          '--allow-remote-config, or run `devpilot graph share --yes` in the checkout.'
      );
    }

    const indexer = await (this.opts.findIndexer ?? findIndexer)();
    if (!indexer) {
      return this.answer(command, 'failed', `The code graph indexer (codegraph) is not installed on ${hostname()}.`);
    }

    // The hosted graph follows the default branch; take a checkout that is on it.
    let chosen: { dir: string; identity: CheckoutIdentity } | null = null;
    let offBranch: string | null = null;
    for (const dir of checkouts) {
      const identity = identify(dir, indexer.version ?? 'unknown');
      if ('error' in identity) continue;
      if (identity.skip) {
        offBranch = identity.skip;
        continue;
      }
      chosen = { dir, identity };
      break;
    }
    if (!chosen) {
      return this.answer(
        command,
        'failed',
        offBranch
          ? `No checkout of ${command.repo} on ${hostname()} is on the default branch (${offBranch}). ` +
              'Run `devpilot graph share --any-branch --yes` there to share it as it is.'
          : `Could not read the branch and commit of ${command.repo} on ${hostname()}.`
      );
    }

    if (hasIndex(chosen.dir)) await syncIndex(indexer, chosen.dir);
    else await buildIndex(indexer, chosen.dir);
    await excludeIndexFromGit(chosen.dir);

    const outcome = await (this.opts.push ?? pushGraph)(this.opts.client, chosen.dir, chosen.identity);
    if (outcome.status !== 'pushed') return this.answer(command, 'failed', whyNot(outcome));

    const path = this.opts.storePath ?? shareStorePath();
    const store = loadShares(path);
    store.repos[keyFor(chosen.dir)] = { repo: chosen.identity.repo, sharedAt: new Date().toISOString() };
    saveShares(store, path);

    const counts = outcome.counts;
    await this.answer(
      command,
      'applied',
      `Shared ${chosen.identity.repo}@${chosen.identity.branch} at ${chosen.identity.commitSha.slice(0, 7)}` +
        (counts ? `: ${counts.files} files, ${counts.nodes} symbols, ${counts.edges} references.` : '.') +
        ' Kept current while this bridge runs.'
    );
  }

  /**
   * Stopping is not gated on the flag: it sends nothing, and a machine that
   * was asked to stop sending should stop.
   */
  private async unshare(command: MachineCommand): Promise<void> {
    const path = this.opts.storePath ?? shareStorePath();
    const store = loadShares(path);
    const mine = Object.entries(store.repos).filter(([, entry]) => entry.repo.toLowerCase() === command.repo.toLowerCase());
    if (mine.length === 0) return;

    // Stop first, whatever happens to the delete.
    for (const [dir] of mine) delete store.repos[dir];
    saveShares(store, path);

    let deleted = false;
    for (const [dir, entry] of mine) {
      const branch = defaultBranch(dir) ?? adoption.resolveBranch(dir);
      if (branch && (await this.opts.client.graphDelete(entry.repo, branch))) deleted = true;
    }
    await this.answer(
      command,
      'applied',
      deleted
        ? `${hostname()} no longer shares ${command.repo}, and the hosted copy was deleted.`
        : `${hostname()} no longer shares ${command.repo}. The hosted copy could not be deleted from there; remove it under Graph.`
    );
  }
}

function whyNot(outcome: PushOutcome): string {
  if (outcome.status === 'disabled') return 'The workspace has the hosted code graph turned off.';
  if (outcome.status === 'no-index') return `The index could not be read: ${outcome.reason}`;
  if (outcome.status === 'failed') return `The graph did not land: ${outcome.message}`.slice(0, 400);
  return 'The graph was not sent.';
}

/**
 * Checkouts of a repository this machine already knows about: ones shared from
 * here, and directories an agent session ran in over the last 30 days. The
 * session scan is read for its directories only; nothing from it is sent.
 */
export async function findCheckouts(repo: string, storePath: string = shareStorePath()): Promise<string[]> {
  const wanted = repo.toLowerCase();
  const roots = new Set<string>();
  const consider = (dir: string | null | undefined) => {
    if (!dir || !existsSync(dir)) return;
    if (adoption.resolveRepo(dir)?.repo.toLowerCase() !== wanted) return;
    const top = toplevel(dir);
    if (top) roots.add(top);
  };

  for (const [dir, entry] of Object.entries(loadShares(storePath).repos)) {
    if (entry.repo.toLowerCase() === wanted) consider(dir);
  }
  try {
    const scan = await adoption.scanSessions({
      machineName: hostname(),
      allRepos: true,
      sinceMs: 30 * 24 * 60 * 60 * 1000,
      includePaths: false,
    });
    for (const { cwd } of scan.transcriptPaths.values()) consider(cwd);
  } catch {
    // No transcript store, or one that cannot be read: the share file is what there is.
  }
  return [...roots];
}

function toplevel(dir: string): string | null {
  try {
    return (
      execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 5_000 }).trim() || null
    );
  } catch {
    return null;
  }
}
