import { homedir } from 'node:os';
import { join } from 'node:path';
import chalk from 'chalk';
import { adoption } from '@devpilot.sh/core';
import type { AdoptionCandidate, DiscoveredRepo } from '@devpilot.sh/bridge-protocol';

/**
 * The shared scan → summarize step behind `sessions scan`, `sessions adopt`
 * and `bridge connect --adopt` — TRD 21 §6.5.
 *
 * One implementation because the three surfaces must agree exactly: a preview
 * that scanned differently from the adopt that follows it would show a user one
 * list and act on another.
 */

export interface PipelineOptions {
  machineName: string;
  /** Repos this machine routes. Empty plus `allRepos: false` adopts nothing. */
  repos: string[];
  allRepos: boolean;
  onlyRepo?: string;
  sinceMs: number;
  includePaths: boolean;
  maxSummaries: number;
  /** Skip the model entirely. Discovery-only paths do not need titles. */
  summarize: boolean;
  /**
   * Adoption keys that already have a summary somewhere else, so paying for
   * one again is waste. The observer passes everything it has reported before.
   */
  skipSummaryFor?: Set<string>;
  onWarn?: (message: string) => void;
}

export interface PipelineResult {
  candidates: AdoptionCandidate[];
  discovered: DiscoveredRepo[];
  unmappedProjectCount: number;
  skipped: adoption.SkippedSession[];
  projectDirCount: number;
  withheldOwners: string[];
  /** How many titles came from a model rather than the heuristic. */
  modelTitles: number;
  /**
   * `adoptionKey → where that session lives on disk`. LOCAL ONLY — this is what
   * lets the watcher stat the right file after adoption, and it must never be
   * serialized into a request.
   */
  transcriptPaths: Map<string, { transcriptPath: string; sessionUuid: string }>;
}

/** `24h`, `90m`, `7d`, or a bare number of hours. */
export function parseDuration(input: string, fallbackMs: number): number {
  const match = /^(\d+)\s*([smhdw])?$/i.exec(input.trim());
  if (!match) return fallbackMs;
  const value = Number(match[1]);
  const unit = (match[2] ?? 'h').toLowerCase();
  const scale: Record<string, number> = {
    s: 1000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
    w: 604_800_000,
  };
  return value * (scale[unit] ?? scale.h);
}

export async function runScanPipeline(options: PipelineOptions): Promise<PipelineResult> {
  const repos = options.onlyRepo ? [options.onlyRepo] : options.repos;

  const scan = adoption.scanSessions({
    machineName: options.machineName,
    repos,
    // `--repo x` is an explicit narrowing, so it must not be widened by
    // `--all-repos` arriving from a config file or an alias.
    allRepos: options.onlyRepo ? false : options.allRepos,
    sinceMs: options.sinceMs,
    includePaths: options.includePaths,
    excludeSessionUuids: adoption.loadOwnedSessionIds(
      join(homedir(), '.devpilot', 'owned-sessions.json'),
    ),
  });

  let modelTitles = 0;

  /**
   * Titles come from the scan already (the client's own session title, or the
   * first prompt). The model call only improves them, so everything below is
   * optional and any failure leaves the heuristic in place.
   */
  if (options.summarize && scan.candidates.length > 0 && process.env.ANTHROPIC_API_KEY) {
    const jobs = scan.candidates
      .filter((c) => !options.skipSummaryFor?.has(c.adoptionKey))
      .map((candidate) => {
        // Re-probe rather than threading observations through the scan's return
        // type: the scanner's contract is wire values, and widening it to carry
        // transcript samples would put them one careless `JSON.stringify` from
        // the network.
        const observation = observationFor(candidate, scan);
        return observation ? { candidate, observation } : null;
      })
      .filter((j): j is NonNullable<typeof j> => j !== null);

    const summaries = await adoption.summarizeSessions(
      jobs.map((j) => ({
        observation: j.observation,
        touchedPaths: j.candidate.touchedPaths ?? [],
      })),
      { maxSummaries: options.maxSummaries, onWarn: options.onWarn },
    );

    summaries.forEach((summary, i) => {
      const candidate = jobs[i].candidate;
      candidate.title = summary.title;
      if (summary.summary) candidate.summary = summary.summary;
      if (summary.source === 'model') modelTitles++;
    });
  }

  return {
    candidates: scan.candidates,
    discovered: scan.discovered,
    unmappedProjectCount: scan.unmappedProjectCount,
    skipped: scan.skipped,
    projectDirCount: scan.projectDirCount,
    withheldOwners: adoption.withheldOwners(scan.skipped),
    modelTitles,
    transcriptPaths: scan.transcriptPaths,
  };
}

/**
 * Recover the observation behind a candidate.
 *
 * The scan discards observations deliberately — they hold `headSample`, which
 * is transcript text — so the summarizer re-reads the one file it needs. That
 * is one bounded probe per candidate, not per session, and it keeps the type
 * that crosses the network free of anything that could leak.
 */
function observationFor(
  candidate: AdoptionCandidate,
  scan: adoption.ScanResult,
): adoption.SessionObservation | null {
  const path = scan.transcriptPaths?.get(candidate.adoptionKey);
  if (!path) return null;
  return adoption.probeTranscript(path.transcriptPath, path.sessionUuid);
}

/** The `● 2m` recency column. */
export function relativeAge(iso: string, now = Date.now()): string {
  const ms = now - Date.parse(iso);
  if (!Number.isFinite(ms) || ms < 0) return '—';
  const minutes = Math.round(ms / 60_000);
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

function pad(value: string, width: number): string {
  return value.length > width ? `${value.slice(0, width - 1)}…` : value.padEnd(width);
}

export interface PreviewRow {
  repo: string;
  title: string;
  lastActivityAt: string;
  live: boolean;
  /** What the server said this would do. */
  destination: string;
}

/**
 * The table both `scan` and `adopt` print.
 *
 * The skip line names the owners it is withholding — TRD 21 §3.5. That is the
 * consent moment made concrete: a user who sees `arthaus` and `neurograph`
 * named can decide whether they belong on this board, and a user who sees only
 * "3 skipped" cannot.
 */
export function renderPreview(rows: PreviewRow[], result: PipelineResult): string {
  const lines: string[] = [];

  lines.push(
    chalk.gray(
      `  Scanned ${result.projectDirCount} project director${
        result.projectDirCount === 1 ? 'y' : 'ies'
      } · ${result.candidates.length} session${result.candidates.length === 1 ? '' : 's'} in scope`,
    ),
  );
  lines.push('');

  if (rows.length > 0) {
    lines.push(
      chalk.gray(`  ${pad('REPO', 30)} ${pad('SESSION', 44)} ${pad('LAST', 6)} → BOARD`),
    );
    for (const row of rows) {
      lines.push(
        `  ${chalk.cyan(pad(row.repo, 30))} ${pad(row.title, 44)} ${
          row.live ? chalk.green(pad(relativeAge(row.lastActivityAt), 5)) + '●'
                   : chalk.gray(pad(relativeAge(row.lastActivityAt), 6))
        } → ${row.destination}`,
      );
    }
    lines.push('');
  }

  const reasons = new Map<string, number>();
  for (const skip of result.skipped) {
    reasons.set(skip.reason, (reasons.get(skip.reason) ?? 0) + 1);
  }

  const parts: string[] = [];
  const label: Record<string, string> = {
    'not-routed': 'not routed',
    'devpilot-owned': 'DevPilot-owned',
    'too-old': 'outside the window',
    'no-repo': 'no git remote',
    sidechain: 'subagent transcripts',
    empty: 'empty',
    unreadable: 'unreadable',
  };
  for (const [reason, count] of reasons) {
    if (reason === 'not-routed' && result.withheldOwners.length > 0) {
      parts.push(`${count} not routed (${result.withheldOwners.join(', ')})`);
    } else {
      parts.push(`${count} ${label[reason] ?? reason}`);
    }
  }

  if (parts.length > 0) {
    lines.push(chalk.gray(`  Skipped: ${parts.join(', ')}`));
    if (reasons.has('not-routed')) {
      lines.push(chalk.gray('           Run with --all-repos to include the others.'));
    }
  }

  return lines.join('\n');
}
