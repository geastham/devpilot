import os from 'os';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { BridgeClient } from '@devpilot.sh/bridge-client';
import type { AdoptionOutcome } from '@devpilot.sh/bridge-protocol';
import {
  parseDuration,
  renderPreview,
  runScanPipeline,
  type PipelineResult,
  type PreviewRow,
} from './scan-pipeline';

/**
 * `devpilot sessions scan` / `devpilot sessions adopt` — TRD 21 §6.5.
 *
 * The user-facing half of adoption. `scan` is read-only; `adopt` writes, after
 * showing the same table and asking.
 *
 * ## Why `scan` still reaches the network
 *
 * It calls the adoption route with `dryRun: true` rather than guessing locally
 * what would happen. Duplicate detection, routing, and issue matching are all
 * server-side facts; a local approximation of them would eventually disagree
 * with the real thing, and a preview that disagrees with what follows it is
 * worse than no preview.
 *
 * With no credentials, `scan` degrades to a purely local listing and says so.
 */

interface CommonOptions {
  url?: string;
  token?: string;
  name?: string;
  repos?: string;
  allRepos?: boolean;
  repo?: string;
  since: string;
  paths: boolean;
  maxSummaries: string;
  json?: boolean;
}

interface AdoptOptions extends CommonOptions {
  yes?: boolean;
}

/** Mirrors `bridge connect`'s stable name so both agree on the adoption key. */
function stableMachineName(): string {
  const path = join(homedir(), '.devpilot', 'machine.json');
  try {
    if (existsSync(path)) {
      const saved = JSON.parse(readFileSync(path, 'utf8')) as { name?: string };
      if (saved.name) return saved.name;
    }
  } catch {
    // A corrupt file must not stop a scan; fall through and rewrite it.
  }
  const name = os.hostname();
  try {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify({ name }, null, 2), 'utf8');
  } catch {
    // Unwritable home: correct for this run, just not remembered.
  }
  return name;
}

function withCommonOptions(command: Command): Command {
  return command
    .option('-u, --url <url>', 'Bridge URL', process.env.DEVPILOT_BRIDGE_URL)
    .option('-t, --token <token>', 'Orchestrator token (dp_orch_…)', process.env.DEVPILOT_BRIDGE_TOKEN)
    .option('-n, --name <name>', 'Machine name (defaults to this machine’s stable name)')
    .option('-r, --repos <repos>', 'Comma-separated repos this machine handles')
    .option(
      '--all-repos',
      'Include every repo found on this machine, not only the ones it routes',
      false,
    )
    .option('--repo <owner/name>', 'Restrict to a single repo')
    .option('--since <duration>', 'How far back to look (e.g. 24h, 3d)', '24h')
    .option('--no-paths', 'Do not send the paths of changed files')
    .option('--max-summaries <n>', 'Cap on model-written titles', '25')
    .option('--json', 'Machine-readable output');
}

async function pipeline(options: CommonOptions): Promise<{
  machineName: string;
  result: PipelineResult;
}> {
  const machineName = options.name ?? stableMachineName();
  const result = await runScanPipeline({
    machineName,
    repos: options.repos?.split(',').map((r) => r.trim()).filter(Boolean) ?? [],
    allRepos: Boolean(options.allRepos),
    onlyRepo: options.repo,
    sinceMs: parseDuration(options.since, 24 * 60 * 60 * 1000),
    includePaths: options.paths !== false,
    maxSummaries: Math.max(0, parseInt(options.maxSummaries, 10) || 25),
    summarize: true,
    onWarn: (message) => {
      if (!options.json) console.log(chalk.gray(`   ${message}`));
    },
  });
  return { machineName, result };
}

/** The `→ BOARD` column, from the server's own answer. */
function destinationFor(outcome: AdoptionOutcome | undefined): string {
  if (!outcome) return chalk.gray('—');
  switch (outcome.status) {
    case 'duplicate':
      return chalk.gray(`${outcome.linearIdentifier ?? 'already adopted'} (tracked)`);
    case 'attached':
      return chalk.green(`${outcome.linearIdentifier} (${outcome.matchedBy})`);
    case 'adopted':
      return outcome.linearIdentifier
        ? chalk.green(outcome.linearIdentifier)
        : chalk.yellow('create');
    case 'skipped':
      return chalk.yellow(outcome.reason ? `skip — ${outcome.reason.slice(0, 60)}` : 'skip');
  }
}

function rowsFrom(result: PipelineResult, outcomes: AdoptionOutcome[]): PreviewRow[] {
  const byKey = new Map(outcomes.map((o) => [o.adoptionKey, o]));
  return result.candidates.map((candidate) => ({
    repo: candidate.repo,
    title: candidate.title,
    lastActivityAt: candidate.lastActivityAt,
    live: candidate.live,
    destination: destinationFor(byKey.get(candidate.adoptionKey)),
  }));
}

function client(options: CommonOptions): BridgeClient | null {
  if (!options.url || !options.token) return null;
  return new BridgeClient({ bridgeUrl: options.url, token: options.token });
}

// ---------------------------------------------------------------------------

export const scanCommand = withCommonOptions(
  new Command('scan').description(
    'List agent sessions on this machine and what adopting them would do. Writes nothing.',
  ),
).action(async (options: CommonOptions) => {
  const { machineName, result } = await pipeline(options);

  let outcomes: AdoptionOutcome[] = [];
  const bridge = client(options);

  if (bridge && result.candidates.length > 0) {
    try {
      const response = await bridge.adoptSessions({
        machineName,
        candidates: result.candidates,
        dryRun: true,
      });
      outcomes = response.outcomes;
    } catch (err) {
      if (!options.json) {
        console.log(chalk.yellow(`   Could not preview against the bridge: ${describe(err)}`));
        console.log(chalk.gray('   Showing the local scan only.'));
      }
    }
  }

  if (options.json) {
    console.log(
      JSON.stringify(
        {
          machineName,
          candidates: result.candidates,
          discovered: result.discovered,
          outcomes,
          skipped: result.skipped,
          unmappedProjectCount: result.unmappedProjectCount,
        },
        null,
        2,
      ),
    );
    return;
  }

  console.log('');
  console.log(renderPreview(rowsFrom(result, outcomes), result));
  console.log('');

  if (!bridge) {
    console.log(
      chalk.gray(
        '  No bridge credentials, so this is a local listing only. Pass --url and --token',
      ),
    );
    console.log(chalk.gray('  to see which Linear issues these would attach to.'));
  } else if (result.candidates.length > 0) {
    console.log(chalk.gray('  Nothing was written. Run `devpilot sessions adopt` to act on this.'));
  }
  console.log('');
});

export const adoptCommand = withCommonOptions(
  new Command('adopt').description('Put agent sessions running on this machine onto the board'),
)
  .option('-y, --yes', 'Skip the confirmation')
  .action(async (options: AdoptOptions) => {
    const bridge = client(options);
    if (!bridge) {
      console.error(chalk.red('✗ Bridge URL and token required (--url / --token)'));
      console.error(chalk.gray('  Mint a token in the dashboard under Settings → Tokens.'));
      process.exit(1);
    }

    const { machineName, result } = await pipeline(options);

    if (result.candidates.length === 0) {
      console.log('');
      console.log(renderPreview([], result));
      console.log('');
      console.log(chalk.gray('  No sessions to adopt.'));
      console.log('');
      return;
    }

    /**
     * Preview first, always — TRD 21 §6.5.
     *
     * This is a real request, not a local guess, so the identifiers printed
     * below are the ones adoption will use. `--yes` skips the QUESTION; it does
     * not skip the preview, because a log of what happened is worth as much
     * afterwards as the confirmation was beforehand.
     */
    let preview;
    try {
      preview = await bridge.adoptSessions({
        machineName,
        candidates: result.candidates,
        dryRun: true,
      });
    } catch (err) {
      console.error(chalk.red(`✗ ${describe(err)}`));
      process.exit(1);
    }

    console.log('');
    console.log(renderPreview(rowsFrom(result, preview.outcomes), result));
    console.log('');

    const willCreate = preview.outcomes.filter((o) => o.status === 'adopted').length;
    const willAttach = preview.outcomes.filter((o) => o.status === 'attached').length;

    if (willCreate === 0 && willAttach === 0) {
      console.log(chalk.gray('  Nothing new to adopt — everything here is already tracked.'));
      console.log('');
      return;
    }

    console.log(
      `  This creates ${chalk.bold(String(willCreate))} Linear issue${
        willCreate === 1 ? '' : 's'
      } and attaches ${chalk.bold(String(willAttach))} existing.`,
    );
    console.log('');

    if (!options.yes) {
      const { proceed } = await inquirer.prompt<{ proceed: boolean }>([
        { type: 'confirm', name: 'proceed', message: 'Continue?', default: false },
      ]);
      if (!proceed) {
        console.log(chalk.gray('  Nothing was written.'));
        return;
      }
    }

    let response;
    try {
      response = await bridge.adoptSessions({
        machineName,
        candidates: result.candidates,
        dryRun: false,
      });
    } catch (err) {
      console.error(chalk.red(`✗ ${describe(err)}`));
      process.exit(1);
    }

    console.log('');
    for (const outcome of response.outcomes) {
      if (outcome.status === 'skipped') {
        console.log(chalk.yellow(`   ○ skipped — ${outcome.reason ?? 'no reason given'}`));
      } else if (outcome.status === 'duplicate') {
        console.log(chalk.gray(`   · ${outcome.linearIdentifier ?? '?'} already tracked`));
      } else {
        console.log(
          chalk.green(
            `   ✓ ${outcome.linearIdentifier}${
              outcome.status === 'attached' ? ` (attached, ${outcome.matchedBy})` : ''
            }`,
          ),
        );
      }
    }

    console.log('');
    console.log(
      chalk.green(
        `✓ ${response.adopted} adopted, ${response.attached} attached, ` +
          `${response.duplicates} already tracked, ${response.skipped} skipped`,
      ),
    );
    console.log(
      chalk.gray(
        '  These are observed, not dispatched: DevPilot is watching them and will not move a ticket.',
      ),
    );
    console.log('');
  });

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export const sessionsCommand = new Command('sessions')
  .description('Agent sessions running on this machine')
  .addCommand(scanCommand)
  .addCommand(adoptCommand);
