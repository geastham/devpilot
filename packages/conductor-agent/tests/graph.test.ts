import { describe, it, expect, vi } from 'vitest';
import { MemorySaver, Command } from '@langchain/langgraph';
import { createConductorGraph } from '../src/graph';
import type {
  ConductorPorts,
  ConductorEvent,
  DispatchWaveResult,
  RunResult,
  WavePlanShape,
  WaveOutcome,
} from '../src/types';

/**
 * The graph is exercised end to end against stub ports — no database, no API,
 * no dispatch. That is the payoff of keeping effects behind `ConductorPorts`:
 * every branch that used to be an `if` buried in a 449-line controller is
 * reachable here in a few lines, including the ones that were previously very
 * hard to provoke (a wave failing twice, a conductor rejecting a plan).
 */

function planWith(waveCount: number): WavePlanShape {
  return {
    waves: Array.from({ length: waveCount }, (_, i) => ({
      waveNumber: i,
      tasks: [{ taskCode: `${i}.1` }],
    })),
    dependencyEdges: [],
  };
}

interface StubOptions {
  scores?: number[];
  waveOutcomes?: WaveOutcome[];
  waveCount?: number;
  /**
   * What `dispatchWave` returns, call by call; the last entry repeats. Lets a
   * test say "this dispatch found the wave already over".
   */
  dispatchResults?: DispatchWaveResult[];
}

function stubPorts(options: StubOptions = {}) {
  /**
   * Scores are RATIOS in [0,1] — the domain `PlanScore.parallelizationScore`
   * actually uses. These fixtures used to be 90/40/85, a 0-100 scale that
   * matched the old `minParallelizationScore: 70` default and nothing else.
   * The suite was self-consistent and wrong: the live scorer emits values like
   * 0.888, so `score < 70` held for every real plan and refinement always ran
   * to the iteration cap. Keep these as ratios or the tests stop describing
   * production again.
   */
  const scores = options.scores ?? [0.9];
  const waveCount = options.waveCount ?? 1;
  const outcomes = options.waveOutcomes ?? [];
  const events: ConductorEvent[] = [];

  let scoreCall = 0;
  let waveCall = 0;

  const calls = {
    generate: 0,
    refine: 0,
    persist: 0,
    dispatch: [] as number[],
    constraintsSeen: [] as string[][],
    ended: [] as Array<{ wavePlanId: string; result: RunResult }>,
  };

  const ports: ConductorPorts = {
    async generatePlan() {
      calls.generate++;
      return { plan: planWith(waveCount), tokensUsed: 100 };
    },
    async refinePlan(input) {
      calls.refine++;
      calls.constraintsSeen.push(input.constraints ?? []);
      return { plan: planWith(waveCount), tokensUsed: 50 };
    },
    scorePlan() {
      // Walk the script, then hold the last value.
      const value = scores[Math.min(scoreCall, scores.length - 1)];
      scoreCall++;
      return { parallelizationScore: value };
    },
    async persistPlan() {
      calls.persist++;
      return { wavePlanId: 'wp_test' };
    },
    async dispatchWave(_id, waveIndex) {
      const scripted = options.dispatchResults;
      const result = scripted?.[Math.min(calls.dispatch.length, scripted.length - 1)];
      calls.dispatch.push(waveIndex);
      return result ?? { dispatched: 1, queued: 0, errors: [] };
    },
    async endRun(wavePlanId, result) {
      calls.ended.push({ wavePlanId, result });
    },
    async waitForWave() {
      const outcome = outcomes[Math.min(waveCall, outcomes.length - 1)] ?? {
        state: 'complete' as const,
      };
      waveCall++;
      return outcome;
    },
    onEvent(event) {
      events.push(event);
    },
  };

  return { ports, calls, events };
}

const input = {
  itemId: 'item_1',
  itemTitle: 'Add batch operations',
  repo: 'acme/widget',
  specContent: 'spec text',
};

const thread = (id: string) => ({ configurable: { thread_id: id } });

describe('conductor graph — planning', () => {
  it('skips refinement when the first plan already clears the threshold', async () => {
    const { ports, calls } = stubPorts({ scores: [0.9] });
    const graph = createConductorGraph({ ports, config: { requireReview: false } });

    const result = await graph.invoke(input, thread('t1'));

    expect(calls.generate).toBe(1);
    expect(calls.refine).toBe(0);
    expect(result.status).toBe('complete');
  });

  it('refines until the score clears the threshold', async () => {
    const { ports, calls } = stubPorts({ scores: [0.4, 0.55, 0.85] });
    const graph = createConductorGraph({ ports, config: { requireReview: false } });

    await graph.invoke(input, thread('t2'));

    expect(calls.refine).toBe(2);
  });

  it('gives up after maxRefinementIterations rather than looping forever', async () => {
    const { ports, calls } = stubPorts({ scores: [0.1] });
    const graph = createConductorGraph({
      ports,
      config: { requireReview: false, maxRefinementIterations: 3 },
    });

    const result = await graph.invoke(input, thread('t3'));

    // 1 generate + 2 refines = 3 iterations, then it proceeds anyway.
    expect(calls.refine).toBe(2);
    expect(result.status).toBe('complete');
  });

  it('keeps the better plan when a refinement scores worse', async () => {
    // Initial 50, refinement 20: the refinement must be discarded.
    const { ports } = stubPorts({ scores: [0.5, 0.2, 0.2] });
    const graph = createConductorGraph({
      ports,
      config: { requireReview: false, maxRefinementIterations: 2 },
    });

    const result = await graph.invoke(input, thread('t4'));

    expect(result.score?.parallelizationScore).toBe(0.5);
  });
});

describe('conductor graph — human review interrupt', () => {
  it('suspends at review and resumes on approval', async () => {
    const { ports, calls } = stubPorts({ scores: [0.9] });
    const graph = createConductorGraph({
      ports,
      config: { requireReview: true },
      checkpointer: new MemorySaver(),
    });
    const cfg = thread('r1');

    const paused = await graph.invoke(input, cfg);

    // The run stopped without dispatching anything.
    expect(calls.persist).toBe(0);
    expect(calls.dispatch).toEqual([]);
    expect((paused as any).__interrupt__?.[0]?.value?.itemTitle).toBe(
      'Add batch operations'
    );

    const resumed = await graph.invoke(new Command({ resume: { action: 'approve' } }), cfg);

    expect(calls.persist).toBe(1);
    expect(calls.dispatch).toEqual([0]);
    expect(resumed.status).toBe('complete');
  });

  it("feeds the conductor's constraints back into refinement", async () => {
    const { ports, calls } = stubPorts({ scores: [0.9] });
    const graph = createConductorGraph({
      ports,
      config: { requireReview: true },
      checkpointer: new MemorySaver(),
    });
    const cfg = thread('r2');

    await graph.invoke(input, cfg);
    await graph.invoke(
      new Command({ resume: { action: 'refine', constraints: ['do not touch src/db'] } }),
      cfg
    );

    expect(calls.refine).toBe(1);
    expect(calls.constraintsSeen[0]).toContain('do not touch src/db');
  });

  it('aborts the run when the conductor rejects the plan', async () => {
    const { ports, calls } = stubPorts({ scores: [0.9] });
    const graph = createConductorGraph({
      ports,
      config: { requireReview: true },
      checkpointer: new MemorySaver(),
    });
    const cfg = thread('r3');

    await graph.invoke(input, cfg);
    const result = await graph.invoke(
      new Command({ resume: { action: 'abort', reason: 'wrong approach' } }),
      cfg
    );

    expect(result.status).toBe('failed');
    expect(result.errors).toContain('wrong approach');
    expect(calls.dispatch).toEqual([]);
  });
});

describe('conductor graph — wave execution', () => {
  it('dispatches every wave in order', async () => {
    const { ports, calls, events } = stubPorts({ waveCount: 3 });
    const graph = createConductorGraph({ ports, config: { requireReview: false } });

    const result = await graph.invoke(input, thread('w1'));

    expect(calls.dispatch).toEqual([0, 1, 2]);
    expect(result.completedWaves).toEqual([0, 1, 2]);
    expect(events.some((e) => e.type === 'run:complete')).toBe(true);
  });

  it('retries a failed wave, then halts when the budget is spent', async () => {
    const { ports, calls } = stubPorts({
      waveCount: 2,
      waveOutcomes: [
        { state: 'failed', failures: [{ taskCode: '0.1', error: 'boom' }] },
        { state: 'failed', failures: [{ taskCode: '0.1', error: 'boom again' }] },
      ],
    });
    const graph = createConductorGraph({
      ports,
      config: { requireReview: false, waveRetryLimit: 1, failurePolicy: 'halt' },
    });

    const result = await graph.invoke(input, thread('w2'));

    // Wave 0 dispatched twice (original + one retry), then the run stops.
    expect(calls.dispatch).toEqual([0, 0]);
    expect(result.status).toBe('failed');
  });

  it('advances past a failed wave under the continue policy', async () => {
    const { ports, calls } = stubPorts({
      waveCount: 2,
      waveOutcomes: [
        { state: 'failed', failures: [{ taskCode: '0.1', error: 'boom' }] },
        { state: 'failed', failures: [{ taskCode: '0.1', error: 'boom' }] },
        { state: 'complete' },
      ],
    });
    const graph = createConductorGraph({
      ports,
      config: { requireReview: false, waveRetryLimit: 1, failurePolicy: 'continue' },
    });

    const result = await graph.invoke(input, thread('w3'));

    expect(calls.dispatch).toEqual([0, 0, 1]);
    expect(result.status).toBe('complete');
  });

  it('interrupts to wait for a wave when no waitForWave port is supplied', async () => {
    const { ports, calls } = stubPorts({ waveCount: 1 });
    // Drop the port: the host will drive completion by resuming.
    const { waitForWave, ...pushPorts } = ports as any;
    const graph = createConductorGraph({
      ports: pushPorts,
      config: { requireReview: false },
      checkpointer: new MemorySaver(),
    });
    const cfg = thread('w4');

    const paused = await graph.invoke(input, cfg);

    expect(calls.dispatch).toEqual([0]);
    expect((paused as any).__interrupt__?.[0]?.value?.waveIndex).toBe(0);

    const resumed = await graph.invoke(
      new Command({ resume: { state: 'complete' } }),
      cfg
    );

    expect(resumed.status).toBe('complete');
  });
});

/**
 * The host drives these by resuming an interrupt, as DevPilot does: there is no
 * `waitForWave`, so "the graph is waiting" is a pending interrupt and "the
 * graph stopped" is the absence of one.
 */
function pushDriven(options: StubOptions, config: Parameters<typeof createConductorGraph>[0]['config']) {
  const stub = stubPorts(options);
  const { waitForWave, ...ports } = stub.ports as any;
  const graph = createConductorGraph({
    ports,
    config: { requireReview: false, ...config },
    checkpointer: new MemorySaver(),
  });
  return { ...stub, graph };
}

const waitingOn = (result: any): number | undefined => result.__interrupt__?.[0]?.value?.waveIndex;

describe('conductor graph — a failed wave ends the run', () => {
  it('reaches a terminal failed state, and says why, when a task has failed its retry', async () => {
    // DevPilot's configuration: the host retries a failed TASK itself, so by
    // the time the wave is reported failed there is nothing left to retry.
    const { graph, calls, events } = pushDriven(
      { waveCount: 2 },
      { waveRetryLimit: 0, failurePolicy: 'halt' }
    );
    const cfg = thread('f1');

    const paused = await graph.invoke(input, cfg);
    expect(waitingOn(paused)).toBe(0);

    const result = await graph.invoke(
      new Command({
        resume: {
          state: 'failed',
          failures: [{ taskCode: '0.1', error: 'tests failed again' }],
        },
      }),
      cfg
    );

    // Terminal: failed, nothing pending, nowhere left to go.
    expect(result.status).toBe('failed');
    expect(waitingOn(result)).toBeUndefined();
    const snapshot = await graph.getState(cfg);
    expect(snapshot.next).toEqual([]);
    expect(snapshot.tasks.flatMap((t) => t.interrupts ?? [])).toEqual([]);

    // The wave was not re-dispatched and the next wave never started.
    expect(calls.dispatch).toEqual([0]);

    // The host was told, with a reason that names the task and its error.
    expect(calls.ended).toEqual([
      { wavePlanId: 'wp_test', result: { status: 'failed', reason: 'wave 0 0.1: tests failed again' } },
    ]);
    expect(result.errors).toContain('wave 0 0.1: tests failed again');
    expect(events.at(-1)).toEqual({ type: 'run:failed', reason: 'wave 0 0.1: tests failed again' });
  });

  it('never waits on a wave that is already over when dispatch returns', async () => {
    // The exact hang: the wave is retried, the host finds no task left to
    // dispatch, and the graph used to suspend on it anyway — waiting for a
    // completion callback from agents that were never started.
    const failures = [{ taskCode: '0.1', error: 'boom' }];
    const { graph, calls } = pushDriven(
      {
        waveCount: 2,
        dispatchResults: [
          { dispatched: 1, queued: 0, errors: [] },
          { dispatched: 0, queued: 0, errors: [], settled: { state: 'failed', failures } },
        ],
      },
      { waveRetryLimit: 1, failurePolicy: 'halt' }
    );
    const cfg = thread('f2');

    await graph.invoke(input, cfg);
    const result = await graph.invoke(new Command({ resume: { state: 'failed', failures } }), cfg);

    // Retried once (the limit), learned from dispatch that the wave is over,
    // and stopped — without a second interrupt for anyone to resume.
    expect(calls.dispatch).toEqual([0, 0]);
    expect(result.status).toBe('failed');
    expect(waitingOn(result)).toBeUndefined();
    expect(calls.ended).toHaveLength(1);
    expect(calls.ended[0].result.status).toBe('failed');
  });

  it('advances straight past a wave that dispatch reports already complete', async () => {
    const { graph, calls } = pushDriven(
      {
        waveCount: 2,
        dispatchResults: [
          { dispatched: 0, queued: 0, errors: [], settled: { state: 'complete' } },
          { dispatched: 1, queued: 0, errors: [] },
        ],
      },
      {}
    );

    const paused = await graph.invoke(input, thread('f3'));

    expect(calls.dispatch).toEqual([0, 1]);
    expect(paused.completedWaves).toEqual([0]);
    expect(waitingOn(paused)).toBe(1);
  });
});

describe('conductor graph — backfilling a wave', () => {
  it('dispatches the same wave again on an in-flight signal, and goes back to waiting', async () => {
    const { graph, calls, events } = pushDriven({ waveCount: 2 }, { waveRetryLimit: 1 });
    const cfg = thread('b1');

    await graph.invoke(input, cfg);

    // A slot freed with tasks still queued: not an ending.
    const still = await graph.invoke(new Command({ resume: { state: 'in-flight' } }), cfg);

    expect(calls.dispatch).toEqual([0, 0]);
    expect(waitingOn(still)).toBe(0);
    expect(still.status).toBe('executing');
    // It is not a retry and not a completion.
    expect(still.waveRetries).toBe(0);
    expect(still.completedWaves).toEqual([]);
    expect(events.filter((e) => e.type === 'wave:dispatched')).toEqual([
      { type: 'wave:dispatched', waveIndex: 0, dispatched: 1, queued: 0 },
      { type: 'wave:dispatched', waveIndex: 0, dispatched: 1, queued: 0, backfill: true },
    ]);

    // Any number of them, then the wave ends as usual and the run moves on.
    await graph.invoke(new Command({ resume: { state: 'in-flight' } }), cfg);
    const next = await graph.invoke(new Command({ resume: { state: 'complete' } }), cfg);

    expect(calls.dispatch).toEqual([0, 0, 0, 1]);
    expect(waitingOn(next)).toBe(1);
    // The first pass over the new wave is a dispatch, not a backfill.
    expect(events.filter((e) => e.type === 'wave:dispatched').at(-1)).toEqual({
      type: 'wave:dispatched',
      waveIndex: 1,
      dispatched: 1,
      queued: 0,
    });
  });
});

describe('conductor graph — ending a run', () => {
  it('tells the host once when the run completes', async () => {
    const { graph, calls } = pushDriven({ waveCount: 1 }, {});
    const cfg = thread('n1');

    await graph.invoke(input, cfg);
    expect(calls.ended).toEqual([]);

    const result = await graph.invoke(new Command({ resume: { state: 'complete' } }), cfg);

    expect(result.status).toBe('complete');
    expect(calls.ended).toEqual([{ wavePlanId: 'wp_test', result: { status: 'complete' } }]);
  });

  it('has nothing to tell the host about a run rejected at review', async () => {
    const { ports, calls } = stubPorts({ scores: [0.9] });
    const graph = createConductorGraph({
      ports,
      config: { requireReview: true },
      checkpointer: new MemorySaver(),
    });
    const cfg = thread('n2');

    await graph.invoke(input, cfg);
    const result = await graph.invoke(new Command({ resume: { action: 'abort' } }), cfg);

    // No plan was ever persisted, so there is no wave plan to mark.
    expect(result.status).toBe('failed');
    expect(calls.ended).toEqual([]);
  });
});

describe('conductor graph — accounting', () => {
  it('accumulates tokens across generation and refinement', async () => {
    const { ports } = stubPorts({ scores: [0.4, 0.85] });
    const graph = createConductorGraph({ ports, config: { requireReview: false } });

    const result = await graph.invoke(input, thread('a1'));

    // 100 from generate + 50 from one refine.
    expect(result.tokensUsed).toBe(150);
  });
});

describe('conductor graph — adopting an existing plan', () => {
  it('enters at dispatch when a persisted plan is supplied', async () => {
    const { ports, calls } = stubPorts({ waveCount: 2 });
    const graph = createConductorGraph({ ports, config: { requireReview: false } });

    const result = await graph.invoke(
      { ...input, plan: planWith(2), wavePlanId: 'wp_existing' },
      thread('e1')
    );

    // No planning at all — straight to the dispatch loop.
    expect(calls.generate).toBe(0);
    expect(calls.refine).toBe(0);
    expect(calls.persist).toBe(0);
    expect(calls.dispatch).toEqual([0, 1]);
    expect(result.status).toBe('complete');
  });

  it('reports an adopted run as executing while it waits on a wave', async () => {
    const { graph } = pushDriven({ waveCount: 1 }, {});

    const paused = await graph.invoke(
      { ...input, plan: planWith(1), wavePlanId: 'wp_existing' },
      thread('e3')
    );

    // It never passed through `persist`, which is what used to set this.
    expect(waitingOn(paused)).toBe(0);
    expect(paused.status).toBe('executing');
  });

  it('still plans from scratch when only a plan is supplied without an id', async () => {
    const { ports, calls } = stubPorts({ waveCount: 1 });
    const graph = createConductorGraph({ ports, config: { requireReview: false } });

    await graph.invoke({ ...input, plan: planWith(1) }, thread('e2'));

    expect(calls.generate).toBe(1);
    expect(calls.persist).toBe(1);
  });
});

/**
 * The plan a host persists is not always the plan the planner wrote.
 *
 * DevPilot's wave assigner recomputes the waves when it persists: two tasks the
 * planner put side by side that claim the same file — or, with a code graph,
 * where one's file depends on the other's — are moved apart, and the persisted
 * plan then has MORE waves than `plan.waves`. A planner that spreads tasks over
 * more waves than their dependencies need gives the opposite: fewer.
 *
 * The graph used to count `plan.waves` either way. With more persisted waves
 * it reached `finish` early and told the host the run was complete, with the
 * moved tasks never dispatched; with fewer it asked the host to dispatch a
 * wave that did not exist. `persistPlan` can now say how many waves it wrote.
 */
describe('conductor graph — the persisted plan decides how many waves there are', () => {
  function portsPersisting(plannedWaves: number, totalWaves: number | undefined) {
    const stub = stubPorts({ waveCount: plannedWaves });
    stub.ports.persistPlan = async () => {
      stub.calls.persist++;
      return totalWaves === undefined ? { wavePlanId: 'wp_test' } : { wavePlanId: 'wp_test', totalWaves };
    };
    return stub;
  }

  it('dispatches every wave the host persisted, when that is more than the planner wrote', async () => {
    const { ports, calls, events } = portsPersisting(2, 3);
    const graph = createConductorGraph({ ports, config: { requireReview: false } });

    const result = await graph.invoke(input, thread('w1'));

    expect(calls.dispatch).toEqual([0, 1, 2]);
    expect(result.completedWaves).toEqual([0, 1, 2]);
    expect(result.status).toBe('complete');
    expect(events).toContainEqual({ type: 'run:complete', waves: 3 });
    // Told once, after the last wave — not after the planner's last.
    expect(calls.ended).toEqual([{ wavePlanId: 'wp_test', result: { status: 'complete' } }]);
  });

  it('does not dispatch a wave the host did not persist, when it wrote fewer', async () => {
    const { ports, calls } = portsPersisting(3, 2);
    const graph = createConductorGraph({ ports, config: { requireReview: false } });

    const result = await graph.invoke(input, thread('w2'));

    expect(calls.dispatch).toEqual([0, 1]);
    expect(result.status).toBe('complete');
  });

  it('counts the planner’s waves, as before, for a host that does not say', async () => {
    const { ports, calls, events } = portsPersisting(2, undefined);
    const graph = createConductorGraph({ ports, config: { requireReview: false } });

    await graph.invoke(input, thread('w3'));

    expect(calls.dispatch).toEqual([0, 1]);
    expect(events).toContainEqual({ type: 'run:complete', waves: 2 });
  });

  it('counts the supplied plan’s waves for an adopted plan, which is never persisted here', async () => {
    const { ports, calls } = portsPersisting(1, 9);
    const graph = createConductorGraph({ ports, config: { requireReview: false } });

    await graph.invoke({ ...input, plan: planWith(2), wavePlanId: 'wp_existing' }, thread('w4'));

    expect(calls.persist).toBe(0);
    expect(calls.dispatch).toEqual([0, 1]);
  });

  it('keeps the count across the review interrupt and a checkpoint', async () => {
    const { ports, calls } = portsPersisting(1, 2);
    const graph = createConductorGraph({
      ports,
      config: { requireReview: true },
      checkpointer: new MemorySaver(),
    });
    const cfg = thread('w5');

    await graph.invoke(input, cfg);
    const resumed = await graph.invoke(new Command({ resume: { action: 'approve' } }), cfg);

    expect(calls.dispatch).toEqual([0, 1]);
    expect(resumed.totalWaves).toBe(2);
  });
});
