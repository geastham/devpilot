import { describe, it, expect } from 'vitest';
import {
  MIN_HISTORY_FOR_ESTIMATE,
  buildScoreInput,
  computeScore,
  estimateTasks,
  executedPlans,
  type ScoreEvidence,
  type ScoreSessionRow,
  type ScoreTaskRow,
} from '../src/score';

/**
 * Which recorded rows are evidence for which dimension.
 *
 * `score-compute.test.ts` holds the arithmetic to its worked examples. These
 * hold the step before it: that a session still running is not priced, that a
 * task's estimate comes only from what had finished before it began, that a
 * plan is not cut in half by the edge of a window. Each of those is a way a
 * score could be quietly wrong while every formula was right.
 */

const T0 = Date.UTC(2026, 8, 1, 9, 0, 0);
const MIN = 60_000;
const m = (n: number) => T0 + n * MIN;

function session(overrides: Partial<ScoreSessionRow> & { id: string }): ScoreSessionRow {
  return {
    startedAt: m(0),
    endedAt: m(10),
    outcome: 'complete',
    listCostUsd: null,
    referenceCostUsd: null,
    referenceModel: null,
    model: null,
    ...overrides,
  };
}

/** A completed task of `size` that ran from `start` for `minutes`. */
function task(
  taskCode: string,
  size: string | null,
  start: number,
  minutes: number,
  overrides: Partial<ScoreTaskRow> = {}
): ScoreTaskRow {
  return {
    planId: 'plan-1',
    taskCode,
    complexity: size,
    dependencies: [],
    startedAt: m(start),
    completedAt: m(start + minutes),
    completed: true,
    filesChanged: [],
    ...overrides,
  };
}

const window = { from: m(0), now: m(600) };

describe('a task’s estimate is what tasks of its size had already taken', () => {
  it('is the median of earlier tasks of the same size', () => {
    // Three S tasks take 2, 4 and 9 minutes. A fourth S, started after all
    // three finished, is estimated at their median — 4 — and took 6.
    const tasks = [
      task('1', 'S', 0, 2),
      task('2', 'S', 10, 4),
      task('3', 'S', 20, 9),
      task('4', 'S', 40, 6),
    ];
    const estimated = estimateTasks(tasks, window.from, window.now);
    expect(estimated).toEqual([
      { estimatedMinutes: null, actualMinutes: 2 },
      { estimatedMinutes: null, actualMinutes: 4 },
      { estimatedMinutes: null, actualMinutes: 9 },
      { estimatedMinutes: 4, actualMinutes: 6 },
    ]);
  });

  it('has no estimate until there is enough history of that size', () => {
    // Property: fewer than MIN_HISTORY_FOR_ESTIMATE earlier tasks is one or
    // two tasks that happened to run first, not an estimate.
    const tasks = [task('1', 'S', 0, 2), task('2', 'S', 10, 4), task('3', 'S', 20, 6)];
    expect(MIN_HISTORY_FOR_ESTIMATE).toBe(3);
    expect(estimateTasks(tasks, window.from, window.now).every((t) => t.estimatedMinutes === null)).toBe(true);
  });

  it('does not let tasks of another size stand in', () => {
    const tasks = [
      task('1', 'S', 0, 2),
      task('2', 'S', 10, 2),
      task('3', 'S', 20, 2),
      task('4', 'M', 40, 30),
    ];
    expect(estimateTasks(tasks, window.from, window.now).at(-1)).toEqual({
      estimatedMinutes: null,
      actualMinutes: 30,
    });
  });

  it('cannot be informed by a task that had not finished when this one started', () => {
    // Property: the estimate is fixed by what was known at the start. Three S
    // tasks finish by t=30. A fourth, long one runs t=31→t=91. A fifth starts
    // at t=40, while the fourth is still running: its estimate is the median
    // of the first three (2), not of four.
    const tasks = [
      task('1', 'S', 0, 2),
      task('2', 'S', 10, 2),
      task('3', 'S', 20, 2),
      task('4', 'S', 31, 60),
      task('5', 'S', 40, 3),
    ];
    const byActual = new Map(estimateTasks(tasks, window.from, window.now).map((t) => [t.actualMinutes, t]));
    expect(byActual.get(3)!.estimatedMinutes).toBe(2);
    // And a task that starts after the long one finished does see it:
    // median of 2, 2, 2, 3, 60 is 2 — add one and check the list grew.
    const later = estimateTasks([...tasks, task('6', 'S', 100, 5)], window.from, window.now);
    expect(later.at(-1)).toEqual({ estimatedMinutes: 2, actualMinutes: 5 });
  });

  it('uses history from before the window, and scores only tasks inside it', () => {
    // Property: what S tasks take is known from before the window began.
    const tasks = [
      task('1', 'S', -300, 4),
      task('2', 'S', -200, 4),
      task('3', 'S', -100, 4),
      task('4', 'S', 10, 8),
    ];
    expect(estimateTasks(tasks, window.from, window.now)).toEqual([
      { estimatedMinutes: 4, actualMinutes: 8 },
    ]);
  });

  it('leaves out a task that never finished its work', () => {
    const tasks = [
      task('1', 'S', 0, 2, { completed: false }),
      task('2', 'S', 10, 2, { completedAt: null }),
      task('3', 'S', 20, 2, { startedAt: null }),
    ];
    expect(estimateTasks(tasks, window.from, window.now)).toEqual([]);
  });

  it('includes an unsized task, with no estimate, so it is counted as excluded', () => {
    expect(estimateTasks([task('1', null, 0, 5)], window.from, window.now)).toEqual([
      { estimatedMinutes: null, actualMinutes: 5 },
    ]);
  });
});

describe('a plan is taken whole', () => {
  it('includes every timed task of a plan that had a task end in the window', () => {
    // The first task ended before the window; the plan is still one plan.
    const tasks = [task('1', 'S', -20, 10), task('2', 'S', 5, 10, { dependencies: ['1'] })];
    const plans = executedPlans(tasks, window.from, window.now);
    expect(plans).toHaveLength(1);
    expect(plans[0].tasks.map((t) => t.id)).toEqual(['1', '2']);
    expect(plans[0].tasks[1].dependsOn).toEqual(['1']);
  });

  it('leaves out a plan that finished before the window began', () => {
    expect(executedPlans([task('1', 'S', -50, 10), task('2', 'S', -30, 10)], window.from, window.now)).toEqual([]);
  });

  it('keeps plans apart', () => {
    const tasks = [
      task('1', 'S', 0, 10, { planId: 'a' }),
      task('1', 'S', 0, 10, { planId: 'b' }),
      task('2', 'S', 0, 10, { planId: 'b' }),
    ];
    expect(executedPlans(tasks, window.from, window.now).map((p) => p.tasks.length).sort()).toEqual([1, 2]);
  });

  it('counts a task that ran and failed: it occupied a slot', () => {
    const plans = executedPlans([task('1', 'S', 0, 10, { completed: false })], window.from, window.now);
    expect(plans[0].tasks).toHaveLength(1);
  });

  it('passes "files not recorded" through as null, not as none', () => {
    // Property: an empty list would award a clean bill of health nobody checked.
    const plans = executedPlans(
      [task('1', 'S', 0, 10, { filesChanged: null }), task('2', 'S', 0, 10, { filesChanged: ['a.ts'] })],
      window.from,
      window.now
    );
    expect(plans[0].tasks.map((t) => t.files)).toEqual([null, ['a.ts']]);
  });
});

describe('buildScoreInput', () => {
  it('prices only sessions that have ended, and only with both figures', () => {
    const evidence: ScoreEvidence = {
      runway: [],
      tasks: [],
      sessions: [
        session({ id: 'done', listCostUsd: 2, referenceCostUsd: 8, referenceModel: 'claude-fable-5', model: 'claude-opus-5-5' }),
        // Still running: its reading is partial.
        session({ id: 'running', endedAt: null, outcome: 'running', listCostUsd: 1, referenceCostUsd: 4 }),
        // From a runner that did not report a baseline.
        session({ id: 'old-runner', listCostUsd: 3, referenceCostUsd: null }),
        // Ended before the window.
        session({ id: 'earlier', startedAt: m(-60), endedAt: m(-30), listCostUsd: 5, referenceCostUsd: 9 }),
      ],
    };
    const input = buildScoreInput(evidence, window);
    expect(input.usage).toEqual([{ model: 'claude-opus-5-5', costUsd: 2, baselineCostUsd: 8 }]);
    expect(input.referenceModel).toBe('claude-fable-5');
  });

  it('names every reference model when sessions were dearest on different ones', () => {
    const input = buildScoreInput(
      {
        runway: [],
        tasks: [],
        sessions: [
          session({ id: 'a', listCostUsd: 1, referenceCostUsd: 2, referenceModel: 'claude-fable-5-1' }),
          session({ id: 'b', listCostUsd: 1, referenceCostUsd: 2, referenceModel: 'claude-fable-5' }),
        ],
      },
      window
    );
    expect(input.referenceModel).toBe('claude-fable-5, claude-fable-5-1');
  });

  it('counts a completion only for a session that completed, inside the window', () => {
    const input = buildScoreInput(
      {
        runway: [],
        tasks: [],
        sessions: [
          session({ id: 'ok', endedAt: m(20) }),
          session({ id: 'failed', endedAt: m(30), outcome: 'failed' }),
          session({ id: 'running', endedAt: null, outcome: 'running' }),
          session({ id: 'before', startedAt: m(-60), endedAt: m(-1) }),
        ],
      },
      window
    );
    expect(input.completions).toEqual([m(20)]);
    // Utilization still sees all four as intervals; a failed session was a
    // slot in use, and a running one has no end yet.
    expect(input.sessions).toHaveLength(4);
    expect(input.sessions!.find((s) => s.end === null)).toBeDefined();
  });

  it('takes capacity from the latest reading in the window when none is given', () => {
    const runway = [
      { at: m(-10), runwayHours: 5, capacity: 9 },
      { at: m(10), runwayHours: 5, capacity: 3 },
      { at: m(20), runwayHours: 5, capacity: 4 },
      { at: m(30), runwayHours: 5, capacity: null },
    ];
    expect(buildScoreInput({ runway, tasks: [], sessions: [] }, window).capacity).toBe(4);
    // Given explicitly, that wins.
    expect(buildScoreInput({ runway, tasks: [], sessions: [] }, { ...window, capacity: 6 }).capacity).toBe(6);
    // Never recorded: unknown, not a default.
    expect(buildScoreInput({ runway: [], tasks: [], sessions: [] }, window).capacity).toBeNull();
  });

  it('produces a score with nothing measured from nothing recorded', () => {
    // Property: a new install has no score. Not 500, not 0 of 1000.
    const score = computeScore(buildScoreInput({ runway: [], tasks: [], sessions: [] }, window), window.now);
    expect(score.total).toBe(0);
    expect(score.measuredMax).toBe(0);
    expect(score.complete).toBe(false);
    expect(score.unmeasured).toHaveLength(6);
  });

  it('measures all six from a recorded run', () => {
    // Capacity 2. Two plans; the second is the one being scored for accuracy,
    // its S tasks estimated from the first plan's.
    const tasks: ScoreTaskRow[] = [
      task('1', 'S', 0, 4, { planId: 'p1', filesChanged: ['a.ts'] }),
      task('2', 'S', 0, 4, { planId: 'p1', filesChanged: ['b.ts'] }),
      task('3', 'S', 5, 4, { planId: 'p1', filesChanged: ['c.ts'], dependencies: ['1'] }),
      task('1', 'S', 20, 4, { planId: 'p2', filesChanged: ['d.ts'] }),
      task('2', 'S', 20, 8, { planId: 'p2', filesChanged: ['e.ts'] }),
      task('3', 'S', 30, 2, { planId: 'p2', filesChanged: ['f.ts'], dependencies: ['2'] }),
    ];
    const sessions = tasks.map((t, i) =>
      session({
        id: `s${i}`,
        startedAt: t.startedAt!,
        endedAt: t.completedAt!,
        listCostUsd: 1,
        referenceCostUsd: 4,
        referenceModel: 'claude-fable-5',
        model: 'claude-opus-5-5',
      })
    );
    // A reading every five minutes from half an hour before the first task to
    // the end: seventy minutes of runway history, which is over the hour the
    // dimension needs.
    const runway = Array.from({ length: 15 }, (_, i) => ({ at: m(-30 + i * 5), runwayHours: 6, capacity: 2 }));

    const now = m(40);
    const score = computeScore(buildScoreInput({ tasks, sessions, runway }, { from: m(-30), now }), now);

    expect(score.unmeasured).toEqual([]);
    expect(score.complete).toBe(true);
    expect(score.dimensions.runwayHealth.value).toBe(250);
    // Three of the second plan's tasks were estimated at the first plan's
    // median of 4 minutes and took 4, 8 and 2: errors 0, 0.5, 0.5 → 1 − 1/3.
    expect(score.dimensions.planAccuracy.ratio).toBeCloseTo(2 / 3, 9);
    // $6 spent against $24 at the reference: a 75% saving.
    expect(score.dimensions.costEfficiency.ratio).toBeCloseTo(0.75, 9);
    expect(score.dimensions.costEfficiency.basis.referenceModel).toBe('claude-fable-5');
  });
});
