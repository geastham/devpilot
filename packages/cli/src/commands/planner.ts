import { Command } from 'commander';
import chalk from 'chalk';
import { writeFileSync } from 'fs';
import { resolve } from 'path';

/**
 * `devpilot planner` — what the planner has done on this machine, and how its
 * plans turned out.
 *
 * The cockpit records every call it makes to the planning model — what it
 * asked, what came back, what was made of it — and every review decision, and
 * joins them to how each plan then ran. `stats` reads that back as a few
 * figures; `export` writes it to a file.
 *
 * Both read the LOCAL cockpit and nothing else. An export with text in it
 * holds specifications, the repository's file tree and plans: it is written
 * to the path asked for, readable only by its owner, and what happens to it
 * after that is up to the person who ran the command. `--no-text` writes the
 * same episodes with every prompt, plan, description, error and path removed.
 */

/** The cockpit's answer. Declared here: the CLI does not depend on core's types for a JSON shape. */
export interface PlannerEpisodesResponse {
  since: string;
  text: 'full' | 'none';
  truncated: boolean;
  note?: string;
  summary: {
    episodes: number;
    withPlan: number;
    ended: number;
    calls: number;
    callOutcomes: Record<string, number>;
    refinements: number;
    refinementsImproved: number;
    truncated: number;
    reviews: Record<string, number>;
    tokensInput: number;
    tokensOutput: number;
    firstAttemptPassRate: number | null;
    filePrecision: number | null;
    fileRecall: number | null;
    sameWaveCollisions: number;
  };
  episodes: unknown[];
}

const percent = (value: number | null) => (value === null ? 'not measured yet' : `${Math.round(value * 100)}%`);
const count = (n: number) => n.toLocaleString('en-US');

/** The summary as lines of text. Pure, so the wording can be tested. */
export function formatPlannerStats(body: Pick<PlannerEpisodesResponse, 'since' | 'summary' | 'truncated' | 'note'>): string[] {
  const s = body.summary;
  const lines: string[] = [];
  const since = body.since.slice(0, 10);

  if (s.episodes === 0) {
    return [
      `No plans since ${since}.`,
      'A plan is recorded when the cockpit makes one — from a ticket through the bridge, or from the horizon.',
    ];
  }

  lines.push(`Plans since ${since}: ${count(s.withPlan)} persisted; ${count(s.ended)} finished running.`);
  if (s.episodes > s.withPlan) {
    lines.push(`  Planning runs that never produced a plan (abandoned at review, or every call failed): ${count(s.episodes - s.withPlan)}`);
  }

  lines.push('');
  lines.push('Planner calls');
  if (s.calls === 0) {
    lines.push('  None recorded. Calls are recorded from this version on; earlier plans have outcomes and no calls.');
  } else {
    const o = s.callOutcomes;
    lines.push(
      `  Calls: ${count(s.calls)} — valid plan ${count(o.valid ?? 0)}, rejected ${count(o.invalid ?? 0)}, failed ${count(o.error ?? 0)}`
    );
    if (s.truncated > 0) {
      lines.push(`  Cut off at the token ceiling: ${count(s.truncated)}. Raise WAVE_PLANNER_MAX_TOKENS.`);
    }
    if (s.refinements > 0) {
      lines.push(
        `  Refinements: ${count(s.refinements)}, of which ${count(s.refinementsImproved)} scored above the plan they were given`
      );
    }
    lines.push(`  Tokens: ${count(s.tokensInput)} in, ${count(s.tokensOutput)} out (output includes the model's thinking)`);
  }

  const reviews = Object.entries(s.reviews);
  if (reviews.length > 0) {
    lines.push('');
    lines.push('Reviews');
    lines.push(
      `  Approved ${count(s.reviews.approve ?? 0)}, sent back with changes ${count(s.reviews.refine ?? 0)}, abandoned ${count(s.reviews.abort ?? 0)}`
    );
  }

  lines.push('');
  lines.push('How the plans ran');
  if (s.ended === 0) {
    lines.push('  No plan has finished running yet.');
  } else {
    lines.push(`  Tasks that finished on their first attempt: ${percent(s.firstAttemptPassRate)}`);
    lines.push(`  Of the files a plan named, the share its tasks changed: ${percent(s.filePrecision)}`);
    lines.push(`  Of the files tasks changed, the share the plan had named: ${percent(s.fileRecall)}`);
    lines.push(`  Pairs of tasks in the same wave that changed the same file: ${count(s.sameWaveCollisions)}`);
    lines.push('');
    lines.push('  These say how the plans RAN. None of them says whether the code was right.');
  }

  if (body.truncated && body.note) {
    lines.push('');
    lines.push(body.note);
  }
  return lines;
}

async function fetchEpisodes(base: string, days: number, text: 'full' | 'none'): Promise<PlannerEpisodesResponse> {
  const url = `${base.replace(/\/+$/, '')}/api/planner/episodes?days=${days}&text=${text}`;
  let res: Response;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  } catch {
    throw new Error(
      `The local cockpit is not reachable at ${base}. Start it with \`devpilot serve\` — the planner's record is in its database.`
    );
  }
  if (res.status === 404) {
    throw new Error(`The cockpit at ${base} is an older version with no planner record. Update it and restart \`devpilot serve\`.`);
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`The cockpit answered ${res.status}${detail ? `: ${detail.slice(0, 200)}` : ''}`);
  }
  return (await res.json()) as PlannerEpisodesResponse;
}

function daysOption(value: string): number {
  const days = Number(value);
  if (!Number.isFinite(days) || days <= 0) throw new Error('--days must be a positive number');
  return days;
}

const cockpitOption: [string, string, string] = [
  '--cockpit-url <url>',
  'Local cockpit base URL',
  process.env.DEVPILOT_COCKPIT_URL || 'http://127.0.0.1:3847',
];

export const plannerCommand = new Command('planner').description(
  "What the planner has done on this machine, and how its plans turned out"
);

plannerCommand
  .command('stats')
  .description('Planner calls, reviews, and how the plans ran')
  .option(...cockpitOption)
  .option('--days <n>', 'How far back to look', '90')
  .option('--json', 'Print the summary as JSON')
  .action(async (options: { cockpitUrl: string; days: string; json?: boolean }) => {
    try {
      const body = await fetchEpisodes(options.cockpitUrl, daysOption(options.days), 'none');
      if (options.json) {
        console.log(JSON.stringify({ since: body.since, truncated: body.truncated, summary: body.summary }, null, 2));
        return;
      }
      console.log(chalk.cyan('DevPilot planner'));
      console.log('');
      for (const line of formatPlannerStats(body)) console.log(line);
    } catch (error) {
      console.error(chalk.red(error instanceof Error ? error.message : String(error)));
      process.exitCode = 1;
    }
  });

plannerCommand
  .command('export')
  .description('Write planning episodes to a file, one JSON object per line')
  .requiredOption('--out <file>', 'Where to write')
  .option(...cockpitOption)
  .option('--days <n>', 'How far back to look', '90')
  .option('--no-text', 'Remove every prompt, plan, description, error and path; keep shape and figures')
  .action(async (options: { out: string; cockpitUrl: string; days: string; text: boolean }) => {
    try {
      const body = await fetchEpisodes(options.cockpitUrl, daysOption(options.days), options.text ? 'full' : 'none');
      const path = resolve(options.out);
      // Readable by its owner only: with text, this file holds specifications
      // and plans about the user's code.
      writeFileSync(path, body.episodes.map((episode) => JSON.stringify(episode)).join('\n') + (body.episodes.length ? '\n' : ''), {
        mode: 0o600,
      });

      console.log(`Wrote ${count(body.episodes.length)} episode(s) to ${path}`);
      console.log(
        options.text
          ? chalk.yellow(
              'It holds what the planner was asked and answered: specifications, the file tree, plans, review notes and agent summaries.'
            )
          : 'Text and paths were removed: it holds shape and figures only.'
      );
      if (body.truncated && body.note) console.log(body.note);
    } catch (error) {
      console.error(chalk.red(error instanceof Error ? error.message : String(error)));
      process.exitCode = 1;
    }
  });
