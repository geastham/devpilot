import { Command } from 'commander';
import chalk from 'chalk';
import { loadBridgeCredentials } from '@devpilot.sh/bridge-client';

/**
 * `devpilot status` — what is true right now, or nothing.
 *
 * This command printed a fleet of 3 active sessions at 75% utilization, 4.2
 * hours of runway, a Conductor Score of 742 and a rank of #23 — to everyone,
 * always, because every figure was a string literal under a `TODO: read from
 * actual database`. A status command that reports an invented fleet is worse
 * than not having one: the numbers look measured, and the one person certain
 * to believe them is someone deciding whether the product works.
 *
 * It now asks the local cockpit, which is the only thing that knows. If no
 * cockpit is running it says so and says how to start one. Nothing is filled
 * in to make the output look fuller.
 *
 * THE CONDUCTOR SCORE was left out of this command while the cockpit's number
 * was a counter nudged on each completion. The cockpit now computes the six
 * dimensions from recorded events and says which it could not measure, so the
 * score is back — printed the way the cockpit reports it: out of the points
 * that were measurable, with every unmeasured dimension named. A cockpit from
 * before that change returns a different shape, which is recognised and not
 * printed.
 */

interface FleetState {
  sessions?: { status?: string }[];
  runway?: { hours?: number; status?: string };
  runwayHours?: number;
  runwayStatus?: string;
  fleet?: { activeSessions?: number; maxSessions?: number | null };
  conductorScore?: unknown;
}

interface ScoreDimension {
  label: string;
  max: number;
  value: number | null;
  unmeasured: string | null;
}

interface ComputedScore {
  total: number;
  measuredMax: number;
  max: number;
  complete: boolean;
  windowHours: number;
  dimensions: ScoreDimension[];
}

/**
 * Is this the computed score, or the old row of counters?
 *
 * A cockpit from before the change sends `{ total, storedTotal, breakdown }`
 * with no `measuredMax`. That total is not this quantity, and printing it under
 * the same heading would pass a counter off as a measurement.
 */
function asComputedScore(value: unknown): ComputedScore | null {
  if (!value || typeof value !== 'object') return null;
  const s = value as Partial<ComputedScore>;
  if (
    typeof s.total !== 'number' ||
    typeof s.measuredMax !== 'number' ||
    typeof s.complete !== 'boolean' ||
    !Array.isArray(s.dimensions)
  ) {
    return null;
  }
  return s as ComputedScore;
}

/**
 * The score as lines of text. Pure, so the rules it holds can be tested:
 *
 * - the total is "of N measured" unless every dimension was measured, and is
 *   never written against 1000 otherwise;
 * - an unmeasured dimension is named, with its reason, and given no number;
 * - nothing measured prints no total at all.
 */
export function formatScore(value: unknown): string[] {
  const score = asComputedScore(value);
  if (!score) return [];

  const lines: string[] = [];
  const measured = score.dimensions.filter((d) => d.value !== null);
  const days = score.windowHours / 24;
  const period =
    score.windowHours <= 0
      ? ''
      : Number.isInteger(days)
        ? ` (last ${days === 1 ? '24 hours' : `${days} days`})`
        : ` (last ${score.windowHours} hours)`;

  if (measured.length === 0) {
    lines.push(`Conductor Score: nothing measured yet${period}`);
  } else if (score.complete) {
    lines.push(`Conductor Score: ${score.total} of ${score.max}${period}`);
  } else {
    lines.push(
      `Conductor Score: ${score.total} of ${score.measuredMax} measured${period} — ` +
        `${measured.length} of ${score.dimensions.length} dimensions`,
    );
  }

  const width = Math.max(0, ...score.dimensions.map((d) => d.label.length));
  for (const d of score.dimensions) {
    const label = d.label.padEnd(width);
    lines.push(
      d.value === null
        ? `  ${label}  not measured — ${d.unmeasured ?? 'no data'}`
        : `  ${label}  ${String(d.value).padStart(3)} / ${d.max}`,
    );
  }

  if (measured.length > 0 && !score.complete) {
    lines.push('  A partial score is a personal reading; it is not comparable with another.');
  }
  return lines;
}

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(2500) });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export const statusCommand = new Command('status')
  .description('Show what the local cockpit and the bridge connection report')
  .option(
    '--cockpit-url <url>',
    'Local cockpit base URL',
    process.env.DEVPILOT_COCKPIT_URL || 'http://127.0.0.1:3847',
  )
  .action(async (options: { cockpitUrl: string }) => {
    console.log(chalk.cyan('DevPilot status'));
    console.log('');

    // ── Bridge ──────────────────────────────────────────────────────────────
    const saved = loadBridgeCredentials();
    console.log(chalk.white('Bridge'));
    if (saved) {
      console.log(chalk.gray('  Connected to: ') + saved.url);
      console.log(chalk.gray('  Run `devpilot bridge connect` to report this machine\'s sessions.'));
    } else {
      console.log(chalk.gray('  No bridge saved on this machine.'));
      console.log(chalk.gray('  `devpilot bridge connect --token <token>` connects it; mint a token in'));
      console.log(chalk.gray('  the dashboard under Settings → Tokens.'));
    }
    console.log('');

    // ── Local cockpit ───────────────────────────────────────────────────────
    const base = options.cockpitUrl.replace(/\/+$/, '');
    const fleet = await getJson<FleetState>(`${base}/api/fleet/state`);

    console.log(chalk.white('Local cockpit'));
    if (!fleet) {
      console.log(chalk.gray(`  Not reachable at ${base}.`));
      console.log(chalk.gray('  Start it with `devpilot serve`. Fleet, runway and score are read from'));
      console.log(chalk.gray('  it — this command does not report them from anywhere else.'));
      console.log('');
      return;
    }

    const sessions = fleet.sessions ?? [];
    const active = sessions.filter((s) => (s.status ?? '').toUpperCase() === 'ACTIVE').length;
    const capacity = fleet.fleet?.maxSessions;
    console.log(
      chalk.gray('  Sessions: ') +
        `${sessions.length}` +
        chalk.gray(
          `  (${active} active` + (typeof capacity === 'number' ? ` of ${capacity} the fleet can run` : '') + ')',
        ),
    );

    const runwayHours = fleet.runway?.hours ?? fleet.runwayHours;
    if (typeof runwayHours === 'number') {
      const state = fleet.runway?.status ?? fleet.runwayStatus;
      console.log(
        chalk.gray('  Runway: ') + `${runwayHours.toFixed(1)}h` + (state ? chalk.gray(`  (${state})`) : ''),
      );
      // The estimate assumes a fixed duration per queued item. Said here so
      // the figure is not read as a measurement of this fleet's pace.
      console.log(chalk.gray('          an estimate from queue length, not a measured rate'));
    }

    const scoreLines = formatScore(fleet.conductorScore);
    if (scoreLines.length > 0) {
      console.log('');
      console.log(chalk.gray('  ') + scoreLines[0]);
      for (const line of scoreLines.slice(1)) console.log(chalk.gray(`  ${line}`));
    }
    console.log('');
  });
