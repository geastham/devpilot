import { Annotation } from '@langchain/langgraph';
import type { PlanScoreShape, WaveOutcome, WavePlanShape } from './types';

/**
 * The conductor's state channel.
 *
 * This is the whole reason for the rewrite. The old controller kept the run's
 * status in database columns and the rest — refinement counters, retry counts,
 * which wave is live — in local variables inside whichever method was executing.
 * That state could not be inspected mid-run, could not be checkpointed, and
 * could not be resumed after a restart: a process that died between dispatching
 * a wave and observing its completion stranded the plan with no record of what
 * it had been doing.
 *
 * Here it is one serialisable object. Every field the graph branches on lives in
 * it, so a checkpointer can suspend the run at any node and resume it later —
 * which is exactly what waiting hours for a wave of agents requires.
 */
export const ConductorState = Annotation.Root({
  // --- Inputs, fixed for the run -------------------------------------------
  itemId: Annotation<string>,
  itemTitle: Annotation<string>,
  repo: Annotation<string>,
  specContent: Annotation<string>,

  // --- Planning ------------------------------------------------------------
  plan: Annotation<WavePlanShape | null>({
    reducer: (_prev, next) => next,
    default: () => null,
  }),
  score: Annotation<PlanScoreShape | null>({
    reducer: (_prev, next) => next,
    default: () => null,
  }),
  refinementIterations: Annotation<number>({
    reducer: (_prev, next) => next,
    default: () => 0,
  }),
  /** Constraints the conductor added at review; fed back into refinement. */
  constraints: Annotation<string[]>({
    // Appended, not replaced: a conductor who refines twice means both sets.
    reducer: (prev, next) => [...prev, ...next],
    default: () => [],
  }),

  // --- Execution -----------------------------------------------------------
  wavePlanId: Annotation<string | null>({
    reducer: (_prev, next) => next,
    default: () => null,
  }),
  /**
   * How many waves the persisted plan has, when the host said. Null when it
   * did not, and for a plan that was adopted rather than persisted here — the
   * graph then counts `plan.waves`, as it always did.
   *
   * A channel, not something read off `plan`, because the two are different
   * things: `plan` is what the planner wrote and the reviewer approved, and
   * this is what the host laid out when it wrote it down. See
   * `ConductorPorts.persistPlan`.
   */
  totalWaves: Annotation<number | null>({
    reducer: (_prev, next) => next,
    default: () => null,
  }),
  currentWaveIndex: Annotation<number>({
    reducer: (_prev, next) => next,
    default: () => 0,
  }),
  /** Retries used on the CURRENT wave; reset when a wave is left behind. */
  waveRetries: Annotation<number>({
    reducer: (_prev, next) => next,
    default: () => 0,
  }),
  /**
   * The most recent dispatch outcome. Surfaced because a wave that dispatches
   * ZERO tasks is otherwise indistinguishable from one that dispatched fine —
   * that ambiguity hid a real bug where every task was silently queued.
   */
  lastDispatch: Annotation<{ dispatched: number; queued: number } | null>({
    reducer: (_prev, next) => next,
    default: () => null,
  }),
  /**
   * The current wave's most recent answer, and what the branch after a wave
   * reads.
   *
   * `dispatch` writes it: the outcome when the wave was already over as
   * dispatch returned, otherwise null ("ask"). `awaitWave` then writes whatever
   * it was told. A channel rather than a local because the two are separate
   * nodes with a checkpoint between them, and because `in-flight` has to
   * survive from `awaitWave` to the next `dispatch` for that pass to know it is
   * a backfill.
   */
  waveSignal: Annotation<WaveOutcome | null>({
    reducer: (_prev, next) => next,
    default: () => null,
  }),
  completedWaves: Annotation<number[]>({
    reducer: (prev, next) => [...prev, ...next],
    default: () => [],
  }),

  // --- Accounting ----------------------------------------------------------
  tokensUsed: Annotation<number>({
    reducer: (prev, next) => prev + next,
    default: () => 0,
  }),
  costUsd: Annotation<number>({
    reducer: (prev, next) => prev + next,
    default: () => 0,
  }),
  errors: Annotation<string[]>({
    reducer: (prev, next) => [...prev, ...next],
    default: () => [],
  }),

  // --- Terminal ------------------------------------------------------------
  status: Annotation<
    'planning' | 'awaiting-review' | 'executing' | 'complete' | 'failed' | 'aborted'
  >({
    reducer: (_prev, next) => next,
    default: () => 'planning',
  }),
});

export type ConductorStateType = typeof ConductorState.State;
export type ConductorUpdate = Partial<ConductorStateType>;
