/**
 * The Conductor Score, computed from what this cockpit recorded.
 *
 * The score used to be a row of counters: +15 for a completion, −5 for a
 * failure, +10 for dispatching anything at all. None of the six dimensions was
 * computed by its method, and a fresh install started on 500 points it had
 * done nothing to earn. The methods now exist (`@devpilot.sh/core/score`); this
 * is where they meet the database.
 *
 * Nothing is stored and incremented any more. A score is computed on request
 * from the rows that are its evidence — sessions, wave tasks, runway readings —
 * so it can always be derived again, and a dimension with no evidence is
 * reported as unmeasured rather than given a default.
 *
 * Server only: this imports the database.
 */

import {
  db,
  rufloSessions,
  waveTasks,
  runwaySamples,
  scoreReadings,
  gte,
  lt,
  desc,
} from '@/lib/db';
import * as scoreModel from '@devpilot.sh/core/score';

const HOUR_MS = 3_600_000;

/**
 * How far back a score looks, unless asked otherwise.
 *
 * A week, to match the efficiency readings and because the dimensions that
 * need history (plan accuracy, velocity) rarely have enough of it in a day.
 * The two that a long window used to distort no longer are: utilization leaves
 * out stretches when nothing was running, and runway health leaves out time
 * nobody was sampling.
 */
export const DEFAULT_SCORE_WINDOW_HOURS = (() => {
  const configured = Number(process.env.DEVPILOT_SCORE_WINDOW_HOURS);
  return Number.isFinite(configured) && configured > 0 ? configured : 24 * 7;
})();

/** Runway is sampled no more often than this, however often it is computed. */
const SAMPLE_INTERVAL_MS = 55_000;
/** Samples older than this are no use to any window and are deleted. */
const SAMPLE_RETENTION_MS = 45 * 24 * HOUR_MS;
/** A score reading is kept for history no more often than this. */
const READING_INTERVAL_MS = 15 * 60_000;

/** Module state that must survive Next's dev-mode module reloads. */
const state = globalThis as unknown as {
  __devpilotScore?: {
    lastSampleAt: number;
    lastReadingAt: number;
    capacity: { value: number | null; source: string | null; at: number } | null;
    sampler?: ReturnType<typeof setInterval>;
  };
};
state.__devpilotScore ??= { lastSampleAt: 0, lastReadingAt: 0, capacity: null };
const memo = state.__devpilotScore;

/**
 * How many agents the fleet can run at once — as a fact, where one exists.
 *
 * In order:
 *
 * 1. `DEVPILOT_FLEET_CAPACITY`, if the operator has said.
 * 2. The session runner's own `maxConcurrent`, from its health endpoint. That
 *    is the number of agents it will actually run before answering 429, so it
 *    is the real capacity of a local fleet.
 * 3. Unknown. Returned as null — NOT as the 8 this code used to assume. A ratio
 *    against a capacity nobody declared is not a measurement, and the score's
 *    utilization dimension says "unmeasured" rather than divide by a guess.
 *
 * The runner is asked at most once a minute.
 */
export async function fleetCapacity(): Promise<{ value: number | null; source: string | null }> {
  const configured = Number(process.env.DEVPILOT_FLEET_CAPACITY);
  if (Number.isInteger(configured) && configured >= 1) {
    return { value: configured, source: 'DEVPILOT_FLEET_CAPACITY' };
  }

  const now = Date.now();
  if (memo.capacity && now - memo.capacity.at < 60_000) {
    return { value: memo.capacity.value, source: memo.capacity.source };
  }

  let value: number | null = null;
  let source: string | null = null;
  const runnerUrl = process.env.DEVPILOT_SESSION_API_URL;
  if (runnerUrl) {
    try {
      const res = await fetch(`${runnerUrl.replace(/\/$/, '')}/v1/health`, {
        signal: AbortSignal.timeout(1_500),
      });
      const body = (await res.json()) as { maxConcurrent?: unknown };
      if (Number.isInteger(body.maxConcurrent) && (body.maxConcurrent as number) >= 1) {
        value = body.maxConcurrent as number;
        source = 'session runner';
      }
    } catch {
      // Runner down, or one that predates the field. Capacity stays unknown.
    }
  }

  memo.capacity = { value, source, at: now };
  return { value, source };
}

/**
 * Write down a runway reading, at most once a minute.
 *
 * Called wherever runway is computed, so the history exists as a by-product of
 * the cockpit doing its job rather than needing a job of its own. Never
 * throws: a reading that fails to save must not fail the request that took it.
 */
export async function recordRunwaySample(runwayHours: number, now: Date = new Date()): Promise<void> {
  if (!Number.isFinite(runwayHours)) return;
  if (now.getTime() - memo.lastSampleAt < SAMPLE_INTERVAL_MS) return;

  // Claimed before the await, so two requests arriving together write one row.
  const previous = memo.lastSampleAt;
  memo.lastSampleAt = now.getTime();

  try {
    const { value: capacity } = await fleetCapacity();
    await db.insert(runwaySamples).values({ at: now, runwayHours: Math.max(0, runwayHours), capacity });

    // Roughly once a day's worth of samples, clear what no window can reach.
    if (Math.random() < 1 / 1_440) {
      await db
        .delete(runwaySamples)
        .where(lt(runwaySamples.at, new Date(now.getTime() - SAMPLE_RETENTION_MS)));
    }
  } catch (error) {
    memo.lastSampleAt = previous;
    console.error('Failed to record runway sample:', error);
  }
}

/**
 * Keep taking readings while the cockpit process is up.
 *
 * Sampling only when somebody asks for the fleet panel would tie the score to
 * whether a browser tab happened to be open: a run left going with the tab
 * closed would have no runway history at all. Once anything has asked for
 * fleet state, a timer takes a reading every minute for as long as the process
 * lives. It is `unref`'d, so it never keeps the process alive by itself, and a
 * reading that fails is logged and the next one is tried.
 *
 * When the cockpit is not running, nothing is sampled — and the score leaves
 * that time out rather than guessing at it (`RUNWAY_SAMPLE_MAX_HOLD_MINUTES`).
 */
export function ensureRunwaySampler(): void {
  if (memo.sampler) return;
  memo.sampler = setInterval(() => {
    void (async () => {
      try {
        // Imported here, not at the top: runway.ts imports the same db module,
        // and the sampler is the only thing in this file that needs it.
        const { readRunway } = await import('@/lib/runway');
        await recordRunwaySample((await readRunway()).hours);
      } catch (error) {
        console.error('Runway sampler failed:', error);
      }
    })();
  }, 60_000);
  memo.sampler.unref?.();
}

type SessionRow = typeof rufloSessions.$inferSelect;

function toMs(value: Date | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const ms = value instanceof Date ? value.getTime() : Number(value);
  return Number.isFinite(ms) ? ms : null;
}

function finite(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * Load the rows a score is computed from.
 *
 * Every session and every wave task, not just those in the window: a task's
 * estimate comes from what tasks of its size took BEFORE it, and a plan that
 * straddles the window's edge is scored whole. Both tables are small — one row
 * per agent run — on a machine that is one person's cockpit.
 */
export async function loadScoreEvidence(from: Date): Promise<scoreModel.ScoreEvidence> {
  const [sessionRows, taskRows, sampleRows] = await Promise.all([
    db.query.rufloSessions.findMany(),
    db.query.waveTasks.findMany(),
    db.query.runwaySamples.findMany({ where: gte(runwaySamples.at, from) }),
  ]);

  const sessionById = new Map<string, SessionRow>(sessionRows.map((s) => [s.id, s]));

  const sessions: scoreModel.ScoreSessionRow[] = sessionRows.map((s) => {
    // A session DevPilot is still waiting on — running, or blocked on a spec —
    // has no end yet. `updatedAt` is when a terminal one reached that state.
    const terminal = s.status === 'COMPLETE' || s.status === 'ERROR';
    return {
      id: s.id,
      startedAt: toMs(s.createdAt) ?? 0,
      endedAt: terminal ? toMs(s.updatedAt) : null,
      outcome: s.status === 'COMPLETE' ? 'complete' : terminal ? 'failed' : 'running',
      listCostUsd: finite(s.telemetry?.listCostUsd),
      referenceCostUsd: finite(s.telemetry?.referenceCostUsd),
      referenceModel: s.telemetry?.referenceModel ?? null,
      model: s.telemetry?.model ?? null,
    };
  });

  const tasks: scoreModel.ScoreTaskRow[] = taskRows.map((t) => {
    // The files a task ACTUALLY changed. A task that ran on its own branch
    // has them from git — base to head, exact — on its own row. Otherwise they
    // are the ones its agent reported writing. A task with neither has no
    // record, which is null, not "none".
    const reading = t.assignedSessionId ? sessionById.get(t.assignedSessionId)?.telemetry : null;
    const touched = t.branch && Array.isArray(t.filesChanged) ? t.filesChanged : reading?.filesTouched;
    return {
      planId: t.wavePlanId,
      taskCode: t.taskCode,
      complexity: t.complexity ?? null,
      dependencies: t.dependencies ?? [],
      startedAt: toMs(t.startedAt),
      completedAt: toMs(t.completedAt),
      completed: t.status === 'completed',
      filesChanged: Array.isArray(touched) ? touched : null,
    };
  });

  const runway: scoreModel.ScoreRunwayRow[] = sampleRows.map((r) => ({
    at: toMs(r.at) ?? 0,
    runwayHours: r.runwayHours,
    capacity: r.capacity ?? null,
  }));

  return { sessions, tasks, runway };
}

export interface CurrentScore extends scoreModel.ScoreResult {
  /** How far back this score looked. */
  windowHours: number;
  /** Where the fleet's capacity came from, or null when it is unknown. */
  capacitySource: string | null;
}

/**
 * The score as of `now`, over the last `windowHours`.
 *
 * Capacity is whatever was recorded with the runway readings in the window —
 * what the fleet's capacity WAS — and only falls back to the current figure
 * when no reading carries one.
 */
export async function currentScore(
  windowHours: number = DEFAULT_SCORE_WINDOW_HOURS,
  now: Date = new Date()
): Promise<CurrentScore> {
  const from = new Date(now.getTime() - windowHours * HOUR_MS);
  const [evidence, live] = await Promise.all([loadScoreEvidence(from), fleetCapacity()]);

  const input = scoreModel.buildScoreInput(evidence, { from: from.getTime(), now: now.getTime() });
  const recorded = input.capacity ?? null;
  if (recorded === null) input.capacity = live.value;

  const result = scoreModel.computeScore(input, now.getTime());
  const score: CurrentScore = {
    ...result,
    windowHours,
    capacitySource: recorded !== null ? 'recorded with runway readings' : live.source,
  };

  if (windowHours === DEFAULT_SCORE_WINDOW_HOURS) void keepReading(score, now);
  return score;
}

/**
 * Keep a reading for the history, at most every fifteen minutes, and only when
 * something was measured — a history of "nothing measured" is not a history.
 */
async function keepReading(score: CurrentScore, now: Date): Promise<void> {
  if (score.measuredMax === 0) return;
  if (now.getTime() - memo.lastReadingAt < READING_INTERVAL_MS) return;
  const previous = memo.lastReadingAt;
  memo.lastReadingAt = now.getTime();
  try {
    await db.insert(scoreReadings).values({
      at: now,
      modelVersion: score.modelVersion,
      windowHours: score.windowHours,
      total: score.total,
      measuredMax: score.measuredMax,
      complete: score.complete,
      result: score,
    });
  } catch (error) {
    memo.lastReadingAt = previous;
    console.error('Failed to keep score reading:', error);
  }
}

/** Kept readings since `since`, oldest first, without their working. */
export async function scoreHistory(since: Date) {
  const rows = await db.query.scoreReadings.findMany({
    where: gte(scoreReadings.at, since),
    orderBy: desc(scoreReadings.at),
    limit: 2_000,
    columns: { at: true, modelVersion: true, total: true, measuredMax: true, complete: true },
  });
  return rows.reverse();
}
