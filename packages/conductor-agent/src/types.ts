/**
 * Domain shapes and the port interface the conductor graph runs against.
 *
 * NOTHING HERE IMPORTS `@devpilot.sh/core`, and that is deliberate. The graph
 * owns *control flow* — which wave runs next, when to refine, when to stop, when
 * to ask a human. The *effects* — API calls, database writes, dispatching an
 * agent — stay with the host and arrive through `ConductorPorts`.
 *
 * Two things fall out of that split. DevPilot keeps its existing, tested
 * dispatch path instead of having it rewritten underneath a framework; and the
 * agent is usable by anyone who can implement six functions, which is the point
 * of publishing it.
 *
 * Plan and score are structural, with index signatures, so a host's richer types
 * flow through untouched — the graph reads only the fields its branching needs.
 */

/** The minimum a plan must expose for the graph to sequence it. */
export interface WavePlanShape {
  waves: Array<{
    waveNumber: number;
    tasks: Array<{ taskCode: string; [key: string]: unknown }>;
    [key: string]: unknown;
  }>;
  dependencyEdges?: Array<{ from: string; to: string; [key: string]: unknown }>;
  [key: string]: unknown;
}

/** The minimum a score must expose for the refinement branch to decide. */
export interface PlanScoreShape {
  parallelizationScore: number;
  [key: string]: unknown;
}

export interface GeneratePlanInput {
  itemId: string;
  itemTitle: string;
  repo: string;
  specContent: string;
  /** Present on refinement passes only. */
  previousPlan?: WavePlanShape;
  previousScore?: PlanScoreShape;
  /** Constraints the conductor added at review. */
  constraints?: string[];
}

export interface GeneratePlanOutput {
  plan: WavePlanShape;
  tokensUsed?: number;
  costUsd?: number;
}

/** How a wave that is over ended. */
export type SettledWaveOutcome =
  | { state: 'complete' }
  | { state: 'failed'; failures: Array<{ taskCode: string; error: string }> };

/**
 * What the graph is told when it asks how a wave is going.
 *
 * `in-flight` is the answer that is not an ending: the wave is still running,
 * but something changed that a dispatch pass could act on — a slot freed with
 * tasks still queued behind the host's concurrency cap, or a task failed and is
 * owed its retry. The graph dispatches the same wave again and goes back to
 * waiting. It consumes no wave retry and marks nothing complete.
 *
 * It exists so that the graph is the only thing that dispatches. Without it a
 * host has to backfill a wave from its own completion callbacks, which is a
 * second component starting agents for a run the graph believes it is driving.
 */
export type WaveOutcome = SettledWaveOutcome | { state: 'in-flight' };

export interface DispatchWaveResult {
  dispatched: number;
  queued: number;
  errors: Array<{ taskCode: string; error: string }>;
  /**
   * Set when the wave is ALREADY over as dispatch returns: every task in it was
   * terminal before, or became so during, this call.
   *
   * The graph then acts on this instead of waiting. Waiting on a wave that
   * dispatched nothing is waiting on something that will never report — the
   * hang this field removes was a real one: a retried wave with no task left
   * to dispatch suspended the run forever.
   */
  settled?: SettledWaveOutcome;
}

/** How a run ended, as told to `ConductorPorts.endRun`. */
export type RunResult =
  | { status: 'complete' }
  | { status: 'failed'; reason: string };

/** What the conductor asks a human at the review interrupt. */
export interface ReviewRequest {
  itemId: string;
  itemTitle: string;
  plan: WavePlanShape;
  score: PlanScoreShape;
  refinementIterations: number;
  /** True when refinement gave up below threshold — the human is the tiebreak. */
  belowThreshold: boolean;
}

/** What the human sends back to resume it. */
export type ReviewDecision =
  | { action: 'approve' }
  | { action: 'refine'; constraints: string[] }
  | { action: 'abort'; reason?: string };

export interface ConductorPorts {
  /** Produce a first plan. */
  generatePlan(input: GeneratePlanInput): Promise<GeneratePlanOutput>;
  /** Produce an improved plan given the previous one and its score. */
  refinePlan(input: GeneratePlanInput): Promise<GeneratePlanOutput>;
  /** Deterministic. Not an LLM call, and must not become one. */
  scorePlan(plan: WavePlanShape): PlanScoreShape | Promise<PlanScoreShape>;
  /**
   * Persist an approved plan; returns the host's id for it.
   *
   * `totalWaves` is how many waves the PERSISTED plan has, when that can differ
   * from `plan.waves.length` — and for a host that lays the waves out again as
   * it persists, it can. DevPilot's assigner moves apart two tasks the planner
   * put side by side that would collide, which adds a wave; a planner that
   * spreads tasks over more waves than their dependencies need loses some.
   *
   * The graph sequences `0 … totalWaves - 1` when it is given, and
   * `plan.waves` when it is not. Counting the planner's waves against a plan
   * with more was the worse of the two errors: the run reached `finish` and
   * `endRun` was told `complete` with the moved tasks never dispatched.
   */
  persistPlan(
    plan: WavePlanShape,
    score: PlanScoreShape,
    input: GeneratePlanInput
  ): Promise<{ wavePlanId: string; totalWaves?: number }>;
  /**
   * Dispatch what can be dispatched of one wave. DevPilot delegates to its
   * coordinator.
   *
   * MUST be idempotent: the graph calls it again for the same wave on an
   * `in-flight` outcome and on a wave retry, and a task that is already with an
   * agent must not be sent to a second one.
   */
  dispatchWave(wavePlanId: string, waveIndex: number): Promise<DispatchWaveResult>;
  /**
   * Optional. Resolve when the wave reaches a terminal state.
   *
   * When absent the graph `interrupt()`s instead and the host resumes it from a
   * completion callback — the right shape for waves that run for hours, and the
   * reason the graph needs a checkpointer. Provide this only when the host can
   * afford to hold a promise open (tests, short synchronous runs).
   */
  waitForWave?(wavePlanId: string, waveIndex: number): Promise<WaveOutcome>;
  /**
   * Optional. Told once, when a run that has a persisted plan ends.
   *
   * The graph's own state says `complete` or `failed`, but a host's other
   * readers look at the host's records, not at a checkpoint — and with the
   * graph as the only thing that decides a run is over, nothing else will
   * write the ending down. If this throws, the run does not reach END: a run
   * whose ending could not be recorded has not, as far as anyone watching can
   * tell, ended.
   */
  endRun?(wavePlanId: string, result: RunResult): void | Promise<void>;
  /** Optional progress sink. */
  onEvent?(event: ConductorEvent): void;
}

export type ConductorEvent =
  | { type: 'plan:generated'; iterations: number; score: number }
  | { type: 'plan:refined'; iterations: number; score: number; improved: boolean }
  | { type: 'plan:approved'; wavePlanId: string }
  | { type: 'plan:aborted'; reason?: string }
  | {
      type: 'wave:dispatched';
      waveIndex: number;
      dispatched: number;
      queued: number;
      /** True when this pass re-entered a wave already in flight (`in-flight`). */
      backfill?: boolean;
    }
  | { type: 'wave:complete'; waveIndex: number }
  | { type: 'wave:failed'; waveIndex: number; failures: number }
  | { type: 'run:complete'; waves: number }
  | { type: 'run:failed'; reason: string };

export interface ConductorConfig {
  /**
   * Refinement stops once the score reaches this.
   *
   * A RATIO in [0,1], matching `PlanScore.parallelizationScore` and core's
   * `PlanRefinementService`. This default was `70` — a percentage compared
   * against a ratio, so `0.89 < 70` held for every plan ever scored. The
   * refinement loop therefore ran to `maxRefinementIterations` no matter how
   * good the plan was, and the review panel's "could not improve it further"
   * warning appeared on every single plan, including perfect ones.
   */
  minParallelizationScore: number;
  /**
   * Plans with fewer tasks than this are not held to `minParallelizationScore`.
   *
   * The score is one minus the critical path's share of the tasks, so a plan
   * of one task scores 0, and so do two or three tasks in sequence. None of
   * those is a plan that needs improving, but each was below any threshold and
   * was sent back to be cut smaller until the iteration limit. A reviewer
   * can still ask for changes; this only stops the loop asking on its own.
   */
  minTasksForRefinement: number;
  /** Hard cap on refinement passes. */
  maxRefinementIterations: number;
  /** Pause for human approval before dispatching. */
  requireReview: boolean;
  /** `halt` stops the run on a failed wave; `continue` advances anyway. */
  failurePolicy: 'halt' | 'continue';
  /**
   * Re-dispatch attempts for a failed wave before the policy applies.
   *
   * A wave retry re-dispatches whatever the host's `dispatchWave` still
   * considers dispatchable. A host that retries failed TASKS itself (DevPilot
   * does, once each) should set this to 0: by the time a wave is reported
   * failed there, every task in it is terminal and a wave retry has nothing to
   * send.
   */
  waveRetryLimit: number;
}

export const DEFAULT_CONFIG: ConductorConfig = {
  minParallelizationScore: 0.7,
  minTasksForRefinement: 4,
  maxRefinementIterations: 3,
  requireReview: true,
  failurePolicy: 'halt',
  waveRetryLimit: 1,
};
