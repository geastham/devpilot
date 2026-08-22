import chalk from 'chalk';
import type { BridgeClient } from '@devpilot.sh/bridge-client';
import { adoption } from '@devpilot.sh/core';
import { runScanPipeline } from '../sessions/scan-pipeline';
import type { AdoptionWatcher } from './adoption-watcher';

/**
 * What `devpilot bridge connect` does the moment it registers — TRD 21 §8.1.
 *
 * ## The product argument, in one function
 *
 * A first connect used to print `repos: (none)`, warn that nothing could route
 * to this machine, and start listening at an empty board. Everything the user
 * had already been doing with agents was on the other side of a wall.
 *
 * This walks the machine and says what it found, grouped by owner. The
 * warning about having no repos is immediately followed by the answer to it.
 *
 * ## Discovery always; adoption only when asked
 *
 * Discovery is an inventory: no model call, no Linear call, no board write, and
 * every row is inert until a member accepts it. Adoption creates issues on a
 * board a whole team reads, so it needs `--adopt`, and even then it prints what
 * it did.
 *
 * Nothing here may prevent a connect. A machine that cannot introspect is still
 * a machine that can run dispatched work, and trading that for an inventory
 * would be an absurd bargain — so every failure below is a printed line.
 */

export interface IntrospectionOptions {
  client: BridgeClient;
  machineName: string;
  repos: string[];
  adopt: boolean;
  allRepos: boolean;
  watcher: AdoptionWatcher;
}

export async function runIntrospection(options: IntrospectionOptions): Promise<void> {
  let result;
  try {
    result = await runScanPipeline({
      machineName: options.machineName,
      repos: options.repos,
      allRepos: options.allRepos,
      sinceMs: 24 * 60 * 60 * 1000,
      includePaths: true,
      maxSummaries: 25,
      // Only pay for titles when they are about to be written somewhere.
      summarize: options.adopt,
      onWarn: (line) => console.log(chalk.gray(`   ${line}`)),
    });
  } catch (err) {
    console.log(chalk.gray(`   Could not look around this machine: ${describe(err)}`));
    return;
  }

  if (result.projectDirCount === 0) {
    // No transcript store at all: a machine that has never run an agent. Not a
    // problem, and not worth a line about it.
    return;
  }

  const live = result.discovered.reduce((n, r) => n + r.liveSessionCount, 0);
  const owners = adoption.groupByOwner(result.discovered);

  console.log(
    chalk.cyan(
      `   Looked around this machine: ${result.projectDirCount} projects, ` +
        `${owners.size} owner${owners.size === 1 ? '' : 's'}, ` +
        `${result.discovered.reduce((n, r) => n + r.sessionCount, 0)} sessions`,
    ),
  );
  console.log('');

  const sorted = [...owners.entries()].sort(
    (a, b) =>
      b[1].reduce((n, r) => n + r.sessionCount, 0) - a[1].reduce((n, r) => n + r.sessionCount, 0),
  );

  for (const [owner, repos] of sorted.slice(0, 8)) {
    const sessions = repos.reduce((n, r) => n + r.sessionCount, 0);
    const liveHere = repos.reduce((n, r) => n + r.liveSessionCount, 0);
    console.log(
      `     ${chalk.bold(owner.padEnd(18))} ${String(repos.length).padStart(2)} repo${
        repos.length === 1 ? ' ' : 's'
      }   ${String(sessions).padStart(4)} session${sessions === 1 ? ' ' : 's'}` +
        (liveHere > 0 ? chalk.green(`   ● ${liveHere} live`) : ''),
    );
  }
  if (sorted.length > 8) {
    console.log(chalk.gray(`     … and ${sorted.length - 8} more`));
  }
  console.log('');

  const discovery = await options.client.reportDiscovery({
    machineName: options.machineName,
    repos: result.discovered,
    unmappedProjectCount: result.unmappedProjectCount,
  });

  if (discovery && discovery.proposed > 0) {
    console.log(
      chalk.gray(
        `     ${discovery.proposed} repo${discovery.proposed === 1 ? '' : 's'} not yet routed — review at ` +
          `${options.client.hostedUrl()}/fleet/discovered`,
      ),
    );
    console.log('');
  } else if (!discovery) {
    console.log(chalk.gray('     (could not report the inventory — the bridge is still fine)'));
    console.log('');
  }

  if (live > 0 && !options.adopt) {
    console.log(
      chalk.gray(
        `     ${live} of these are running right now. \`devpilot sessions scan\` shows what ` +
          'putting them on the board would do.',
      ),
    );
    console.log('');
  }

  if (!options.adopt || result.candidates.length === 0) return;

  try {
    const response = await options.client.adoptSessions({
      machineName: options.machineName,
      candidates: result.candidates,
      dryRun: false,
    });

    console.log(
      chalk.green(
        `   ✓ Adopted ${response.adopted}, attached ${response.attached}, ` +
          `${response.duplicates} already tracked, ${response.skipped} skipped`,
      ),
    );

    /**
     * Watch what was adopted, so a session going quiet reaches the ticket.
     *
     * Only live sessions are tracked: one already recorded as complete has
     * nothing left to observe, and polling its mtime forever would be work in
     * service of an event that cannot happen.
     */
    const byKey = new Map(result.candidates.map((c) => [c.adoptionKey, c]));
    for (const outcome of response.outcomes) {
      if (outcome.status !== 'adopted' && outcome.status !== 'attached') continue;
      if (!outcome.sessionId || !outcome.linearIdentifier) continue;

      const candidate = byKey.get(outcome.adoptionKey);
      const location = result.transcriptPaths?.get(outcome.adoptionKey);
      if (!candidate?.live || !location) continue;

      options.watcher.track({
        adoptionKey: outcome.adoptionKey,
        sessionId: outcome.sessionId,
        identifier: outcome.linearIdentifier,
        transcriptPath: location.transcriptPath,
        repo: candidate.repo,
        startedAt: candidate.startedAt,
        lastMtimeMs: Date.parse(candidate.lastActivityAt),
        lastReportedAt: new Date().toISOString(),
        settled: false,
        // Repo-relative paths in the stream need the absolute prefix to strip.
        cwd: location.cwd,
      });
    }

    if (options.watcher.size() > 0) {
      console.log(
        chalk.gray(
          `     Watching ${options.watcher.size()} of them. They are observed, not dispatched — ` +
            'no ticket will be moved.',
        ),
      );
    }
    console.log('');
  } catch (err) {
    console.log(chalk.yellow(`   Could not adopt: ${describe(err)}`));
    console.log('');
  }
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
