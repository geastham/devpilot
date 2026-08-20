import { describe, it, expect, vi } from 'vitest';
import { MemorySaver, Command } from '@langchain/langgraph';
import { createConductorGraph } from '../src/graph';
import type {
  ConductorPorts,
  ConductorEvent,
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
      calls.dispatch.push(waveIndex);
      return { dispatched: 1, queued: 0, errors: [] };
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

  it('still plans from scratch when only a plan is supplied without an id', async () => {
    const { ports, calls } = stubPorts({ waveCount: 1 });
    const graph = createConductorGraph({ ports, config: { requireReview: false } });

    await graph.invoke({ ...input, plan: planWith(1) }, thread('e2'));

    expect(calls.generate).toBe(1);
    expect(calls.persist).toBe(1);
  });
});
