/**
 * From recorded events to the six dimensions' inputs.
 *
 * `compute.ts` is the arithmetic and knows nothing about where its numbers
 * come from. This is the other half: given what a cockpit actually recorded —
 * its sessions, its wave tasks, its runway readings — decide which of those
 * rows are evidence for which dimension, and for what window.
 *
 * It is separate from the database on purpose. Every decision about what
 * counts is made here, on plain rows, where it can be tested without one; the
 * loader that fills these rows is a set of column mappings and nothing else.
 *
 * Pure: no db, no clock, no I/O. `now` is an argument, so a score can be taken
 * again later over the same rows and come out the same.
 */

import type {
  EstimatedTask,
  ExecutedPlan,
  ExecutedTask,
  RunwaySample,
  ScoreInput,
  SessionInterval,
  UsageEntry,
} from './compute';

/** One agent session DevPilot dispatched. */
export interface ScoreSessionRow {
  id: string;
  /** When it was dispatched, epoch ms. */
  startedAt: number;
  /** When it reached a terminal state, epoch ms. Null while it is still running. */
  endedAt: number | null;
  /** `failed` covers everything terminal that is not a completion. */
  outcome: 'running' | 'complete' | 'failed';
  /**
   * The session's tokens at their own models' list prices, and the same tokens
   * at the reference model's, both from the runner's final reading. Null when
   * the runner that ran it did not report them.
   */
  listCostUsd: number | null;
  referenceCostUsd: number | null;
  referenceModel: string | null;
  /** The model that did most of the work. Provenance only. */
  model: string | null;
}

/** One task of a wave plan, as it was executed. */
export interface ScoreTaskRow {
  planId: string;
  taskCode: string;
  /** The plan's sizing of the task: S, M, L or XL. Null when the plan gave none. */
  complexity: string | null;
  /** Task codes, in the same plan, this one waited for. */
  dependencies: string[];
  /** When its first attempt started, epoch ms. Null if it never ran. */
  startedAt: number | null;
  /** When it ended, epoch ms. Null if it has not. */
  completedAt: number | null;
  /** True only for a task that finished its work. */
  completed: boolean;
  /**
   * The files the task actually changed, from git or the runner's reading.
   * Null means nobody recorded them — which is not the same as none.
   */
  filesChanged: string[] | null;
}

/** One reading of runway, with the fleet's capacity at the time if it was known. */
export interface ScoreRunwayRow {
  at: number;
  runwayHours: number;
  capacity: number | null;
}

export interface ScoreEvidence {
  sessions: readonly ScoreSessionRow[];
  tasks: readonly ScoreTaskRow[];
  runway: readonly ScoreRunwayRow[];
}

export interface ScoreWindowOptions {
  /** Start of the window, epoch ms. */
  from: number;
  /** The instant the score is taken as of, epoch ms. */
  now: number;
  /**
   * Concurrent agent slots. When absent, the most recent capacity recorded
   * with a runway reading inside the window is used; when there is none of
   * those either, capacity is unknown and the dimensions that need it say so.
   */
  capacity?: number | null;
}

/**
 * How many earlier tasks of the same size it takes before their durations
 * count as an estimate for the next one.
 *
 * Matches `MIN_TASKS_FOR_ACCURACY` in spirit: fewer than three and the
 * "estimate" is one or two tasks that happened to run first.
 */
export const MIN_HISTORY_FOR_ESTIMATE = 3;

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function isFiniteNumber(x: unknown): x is number {
  return typeof x === 'number' && Number.isFinite(x);
}

/** A task that ran to an end, with the times to prove it. */
function durationMinutes(task: ScoreTaskRow): number | null {
  if (!task.completed) return null;
  if (!isFiniteNumber(task.startedAt) || !isFiniteNumber(task.completedAt)) return null;
  const ms = task.completedAt - task.startedAt;
  return ms > 0 ? ms / 60_000 : null;
}

/**
 * What the plan estimated each task would take, and what it took.
 *
 * WHERE THE ESTIMATE COMES FROM. A plan does not write down minutes. It sizes
 * each task — S, M, L, XL — and that sizing is its estimate: a claim that this
 * task is about as much work as the others of its size. To compare a size with
 * a duration it has to become minutes, and the conversion is not a table of
 * constants somebody chose. It is this machine's own record: a task's
 * estimate is the MEDIAN of what tasks of the same size took, counting only
 * those that had finished before this one started.
 *
 * Three things follow, and they are the point:
 *
 * - No number here was invented. An S is "about what S tasks have taken".
 * - It cannot be adjusted after the fact. The estimate for a task is fixed by
 *   what had already finished when it began.
 * - It measures the plan's consistency. Sizing a two-minute task and a
 *   forty-minute task both as M is what costs points, in whichever order they
 *   ran.
 *
 * A task with no size, or with fewer than `MIN_HISTORY_FOR_ESTIMATE` earlier
 * tasks of its size, has no estimate and is left out of the dimension — the
 * same way a task that never ran is. So plan accuracy stays unmeasured on a new
 * install until the fleet has some history, and that is correct: there is
 * nothing yet to have been accurate about.
 *
 * The history is everything recorded, not just the window: what tasks of a
 * size take is known from before the window began. Only tasks that COMPLETED
 * inside the window are scored.
 */
export function estimateTasks(
  tasks: readonly ScoreTaskRow[],
  from: number,
  now: number
): EstimatedTask[] {
  // Finished tasks with a size and a duration, oldest finish first.
  const history = tasks
    .map((task) => ({ task, minutes: durationMinutes(task) }))
    .filter(
      (entry): entry is { task: ScoreTaskRow; minutes: number } =>
        entry.minutes !== null && Boolean(entry.task.complexity)
    )
    .sort((a, b) => a.task.completedAt! - b.task.completedAt!);

  const out: EstimatedTask[] = [];
  for (const task of tasks) {
    const actual = durationMinutes(task);
    if (actual === null) continue;
    if (task.completedAt! < from || task.completedAt! > now) continue;

    let estimate: number | null = null;
    if (task.complexity) {
      const earlier: number[] = [];
      for (const prior of history) {
        // Strictly before this task STARTED: a task still running when this
        // one began could not have informed an estimate for it.
        if (prior.task.completedAt! >= task.startedAt!) break;
        if (prior.task.complexity === task.complexity) earlier.push(prior.minutes);
      }
      if (earlier.length >= MIN_HISTORY_FOR_ESTIMATE) estimate = median(earlier);
    }
    out.push({ estimatedMinutes: estimate, actualMinutes: actual });
  }
  return out;
}

/**
 * The plans that executed in the window, as intervals with their dependencies.
 *
 * A plan is included when any of its tasks ENDED inside the window, and then
 * with all of its timed tasks, including ones that ended before the window
 * began: a plan's concurrency is a property of the whole plan, and scoring the
 * half of it that fell inside an arbitrary window would call a well-run plan
 * serial.
 *
 * A task counts if it has a start and an end, whether or not it succeeded —
 * a task that ran for ten minutes and failed still occupied a slot for ten
 * minutes. One that never started is simply not there.
 */
export function executedPlans(
  tasks: readonly ScoreTaskRow[],
  from: number,
  now: number
): ExecutedPlan[] {
  const byPlan = new Map<string, ScoreTaskRow[]>();
  for (const task of tasks) {
    if (!isFiniteNumber(task.startedAt) || !isFiniteNumber(task.completedAt)) continue;
    if (task.completedAt <= task.startedAt) continue;
    const rows = byPlan.get(task.planId) ?? [];
    rows.push(task);
    byPlan.set(task.planId, rows);
  }

  const plans: ExecutedPlan[] = [];
  for (const rows of byPlan.values()) {
    const inWindow = rows.some((t) => t.completedAt! >= from && t.completedAt! <= now);
    if (!inWindow) continue;
    plans.push({
      tasks: rows.map(
        (t): ExecutedTask => ({
          id: t.taskCode,
          start: t.startedAt!,
          end: t.completedAt!,
          dependsOn: t.dependencies,
          files: t.filesChanged,
        })
      ),
    });
  }
  return plans;
}

/** The most recent capacity recorded with a runway reading in the window. */
function recordedCapacity(runway: readonly ScoreRunwayRow[], from: number, now: number): number | null {
  let latest: ScoreRunwayRow | null = null;
  for (const row of runway) {
    if (!isFiniteNumber(row.at) || row.at < from || row.at > now) continue;
    if (!isFiniteNumber(row.capacity)) continue;
    if (!latest || row.at > latest.at) latest = row;
  }
  return latest?.capacity ?? null;
}

/**
 * Turn what was recorded into the input `computeScore` takes.
 *
 * Which rows count for which dimension:
 *
 * - runway health: every runway reading. (`compute` keeps the ones in the
 *   window.)
 * - fleet utilization: every session, as an interval. A session still running
 *   has no end, and is counted up to `now`.
 * - plan accuracy: tasks that completed in the window — see `estimateTasks`.
 * - cost efficiency: sessions that ENDED in the window and carry both prices.
 *   A session still running is left out: its reading is partial, and half a
 *   session's spend against half a session's baseline is a ratio that will
 *   change by the time it finishes.
 * - velocity trend: the moment each session completed its work, in the window.
 *   Sessions, not wave tasks, so a one-off dispatch counts the same as a task
 *   of a plan — each is one piece of work an agent finished.
 * - parallelization quality: plans with a task that ended in the window — see
 *   `executedPlans`.
 */
export function buildScoreInput(evidence: ScoreEvidence, options: ScoreWindowOptions): ScoreInput {
  const { from, now } = options;

  const runwaySamples: RunwaySample[] = evidence.runway.map((row) => ({
    at: row.at,
    runwayHours: row.runwayHours,
  }));

  const sessions: SessionInterval[] = evidence.sessions.map((s) => ({
    start: s.startedAt,
    end: s.endedAt,
  }));

  const ended = evidence.sessions.filter(
    (s) => isFiniteNumber(s.endedAt) && s.endedAt >= from && s.endedAt <= now
  );

  const usage: UsageEntry[] = [];
  const references = new Set<string>();
  for (const s of ended) {
    if (!isFiniteNumber(s.listCostUsd) || !isFiniteNumber(s.referenceCostUsd)) continue;
    usage.push({ model: s.model, costUsd: s.listCostUsd, baselineCostUsd: s.referenceCostUsd });
    if (s.referenceModel) references.add(s.referenceModel);
  }

  return {
    from,
    capacity: options.capacity ?? recordedCapacity(evidence.runway, from, now),
    runwaySamples,
    sessions,
    tasks: estimateTasks(evidence.tasks, from, now),
    usage,
    // More than one when sessions with different token mixes were dearest on
    // different models. Named, all of them, rather than picking one.
    referenceModel: references.size > 0 ? [...references].sort().join(', ') : null,
    completions: ended.filter((s) => s.outcome === 'complete').map((s) => s.endedAt!),
    plans: executedPlans(evidence.tasks, from, now),
  };
}
