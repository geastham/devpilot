/**
 * Work history: what DevPilot's own runs did to a file.
 *
 * A code graph says what a file IS — its symbols, what calls what — and every
 * code graph says that; it is derivable from the repository. What no indexer
 * has is what HAPPENED to the file: which ticket led to which task changing
 * it, whether that task had to be retried, what it collided with, what its
 * agent said it did, and what it cost. DevPilot already records all of that,
 * one row per task. This joins it on file path (TRD 27 §4, the L2 layer).
 *
 * It is the kind of memory worth giving an agent because the agent cannot
 * work it out from the checkout: "the last task that touched this file
 * conflicted with the run branch and was redone" is not in any source file.
 *
 * Like `score/evidence.ts`, this is the half that decides what counts, on
 * plain rows, with no database and no clock — so each decision can be tested
 * without either. The loader that fills the rows is column mappings.
 *
 * LOCAL DATA. Completion summaries and error text are written by agents and
 * runners about the user's code. Nothing here sends them anywhere, and a
 * caller that puts them in a prompt must treat them as untrusted text.
 */

/** One wave task, with what is needed of its plan, its item and its session. */
export interface WorkHistoryRow {
  taskCode: string;
  label: string;
  status: string;
  /** The files the plan assigned the task. */
  filePaths: string[];
  /**
   * The files the task's latest attempt changed, from its completion report.
   * Null is "not recorded", which is not `[]` — a task that changed nothing.
   */
  filesChanged: string[] | null;
  /** Epoch ms; null when it has not happened. */
  startedAt: number | null;
  lastAttemptAt: number | null;
  completedAt: number | null;
  retryCount: number;
  errorMessage: string | null;
  completionSummary: string | null;
  wavePlanId: string;
  /** The horizon item the plan belongs to. */
  itemTitle: string;
  ticketId: string | null;
  /** The session of the task's latest attempt, or null when it has none. */
  session: {
    /** True once the session reached COMPLETE or ERROR. */
    terminal: boolean;
    /** `ruflo_sessions.cost_usd`: whole cents, written only when a completion report is applied. */
    reportedCostCents: number | null;
    /** `telemetry.costUsd`: the runner's reading — final if it sent one at the end, else its last while running. */
    telemetryCostUsd: number | null;
  } | null;
}

export interface WorkHistoryEntry {
  taskCode: string;
  /** The task's label. */
  task: string;
  /** The item the task belonged to, and its ticket. */
  item: string;
  ticketId: string | null;
  wavePlanId: string;
  status: string;
  /** When it ended, or — for one that has not — when its latest attempt started. ISO-8601. */
  at: string;
  /**
   * How the task is known to concern the path. `'changed'`: the path is in the
   * files its attempt changed. `'planned'`: nothing recorded what it changed,
   * and the path is among the files the plan gave it — which is not the same
   * as having touched it.
   */
  matchedOn: 'changed' | 'planned';
  /** True when the task needed more than one attempt. */
  retried: boolean;
  attempts: number;
  /**
   * The most recent failure recorded for the task, if any — also present on a
   * task that then succeeded on its retry, where it is why the first attempt
   * did not. Capped in length.
   */
  error: string | null;
  /** True when that failure was its branch not merging into the run branch. */
  conflicted: boolean;
  /** The agent's final message, cut to `SUMMARY_MAX_CHARS`. */
  summary: string | null;
  summaryTruncated: boolean;
  /**
   * What the latest attempt's session cost, in USD — only when that session
   * ended and reported. Null for a session still running (its reading is an
   * estimate that omits most of its output), and for a task with no session.
   * Earlier attempts of a retried task are not included.
   */
  costUsd: number | null;
}

export interface WorkHistoryResult {
  /** Under each path as it was asked about, most recent first. */
  byPath: Record<string, WorkHistoryEntry[]>;
  /** For each path, how many matching tasks there were in all. */
  totals: Record<string, number>;
}

export const DEFAULT_HISTORY_LIMIT = 5;
export const MAX_HISTORY_LIMIT = 20;
export const SUMMARY_MAX_CHARS = 400;
const ERROR_MAX_CHARS = 300;

/**
 * For each path, the most recent tasks that changed it.
 *
 * WHICH TASKS. One whose recorded changes include the path; or, when nothing
 * recorded what it changed, one the plan assigned the path to. Recorded
 * changes win when they exist: a task that was given `a.ts` and is known to
 * have changed only `b.ts` is not history for `a.ts`.
 *
 * A task that was never dispatched is left out whatever its files — it is a
 * plan, not history. That covers `pending` tasks and the `skipped` tasks of a
 * run that ended early.
 *
 * ORDER. By when the task ended; for one still running, by when its latest
 * attempt started. Newest first, at most `limit` per path.
 */
export function workHistoryForPaths(
  rows: readonly WorkHistoryRow[],
  paths: readonly string[],
  opts: { limit?: number } = {}
): WorkHistoryResult {
  const limit = clampLimit(opts.limit);

  const started = rows
    .map((row) => ({ row, at: row.completedAt ?? row.lastAttemptAt ?? row.startedAt }))
    .filter((entry): entry is { row: WorkHistoryRow; at: number } => entry.row.startedAt !== null && entry.at !== null)
    // Newest first; the task code breaks a tie so the order does not depend on
    // the order the rows were loaded in.
    .sort((a, b) => b.at - a.at || compare(a.row.taskCode, b.row.taskCode) || compare(a.row.wavePlanId, b.row.wavePlanId));

  const byPath: Record<string, WorkHistoryEntry[]> = {};
  const totals: Record<string, number> = {};

  for (const path of paths) {
    const wanted = normalizePath(path);
    const entries: WorkHistoryEntry[] = [];
    let total = 0;

    for (const { row, at } of started) {
      const matchedOn = matchOf(row, wanted);
      if (!matchedOn) continue;
      total++;
      if (entries.length < limit) entries.push(entryOf(row, at, matchedOn));
    }

    byPath[path] = entries;
    totals[path] = total;
  }

  return { byPath, totals };
}

function matchOf(row: WorkHistoryRow, path: string): 'changed' | 'planned' | null {
  if (row.filesChanged !== null) {
    return row.filesChanged.some((file) => normalizePath(file) === path) ? 'changed' : null;
  }
  return row.filePaths.some((file) => normalizePath(file) === path) ? 'planned' : null;
}

function entryOf(row: WorkHistoryRow, at: number, matchedOn: 'changed' | 'planned'): WorkHistoryEntry {
  const summary = row.completionSummary?.trim() || null;
  const error = row.errorMessage?.trim() || null;

  return {
    taskCode: row.taskCode,
    task: row.label,
    item: row.itemTitle,
    ticketId: row.ticketId,
    wavePlanId: row.wavePlanId,
    status: row.status,
    at: new Date(at).toISOString(),
    matchedOn,
    retried: row.retryCount > 0,
    attempts: row.retryCount + 1,
    error: error ? cut(error, ERROR_MAX_CHARS) : null,
    // The controller's own wording for a branch that did not merge; see
    // `integrateWave` in execution/controller.ts.
    conflicted: error !== null && error.startsWith('merge conflict'),
    summary: summary ? cut(summary, SUMMARY_MAX_CHARS) : null,
    summaryTruncated: summary !== null && summary.length > SUMMARY_MAX_CHARS,
    costUsd: finalCostOf(row.session),
  };
}

/**
 * What a session cost, when it has a final figure.
 *
 * The gate is the cost COLUMN: it is written only when a completion report is
 * applied, so a session without it has not reported an ending and whatever its
 * telemetry says is a running estimate — one that leaves out most of the
 * output tokens, which the stream only reports when a run ends.
 *
 * The column is whole cents, which rounds a three-cent task to "0.03" and a
 * half-cent one to nothing. The runner's final reading carries the unrounded
 * figure, and is used when it agrees with the column to the cent. When it does
 * not agree it is not the final reading — a runner that sent none leaves its
 * last in-flight estimate there — and the column is the figure.
 */
function finalCostOf(session: WorkHistoryRow['session']): number | null {
  if (!session || !session.terminal) return null;
  const cents = session.reportedCostCents;
  if (cents === null || !Number.isFinite(cents)) return null;

  const reading = session.telemetryCostUsd;
  if (reading !== null && Number.isFinite(reading) && Math.round(reading * 100) === cents) {
    return reading;
  }
  return cents / 100;
}

function cut(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

function clampLimit(limit: number | undefined): number {
  if (typeof limit !== 'number' || !Number.isFinite(limit)) return DEFAULT_HISTORY_LIMIT;
  return Math.min(MAX_HISTORY_LIMIT, Math.max(1, Math.floor(limit)));
}

/** Repo-relative, forward slashes, no leading `./` — the form reports and plans mostly, not always, use. */
function normalizePath(path: string): string {
  return path.trim().replace(/\\/g, '/').replace(/^(\.\/)+/, '');
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
