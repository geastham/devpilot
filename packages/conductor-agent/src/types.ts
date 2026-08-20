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

export interface DispatchWaveResult {
  dispatched: number;
  queued: number;
  errors: Array<{ taskCode: string; error: string }>;
}

export type WaveOutcome =
  | { state: 'complete' }
  | { state: 'failed'; failures: Array<{ taskCode: string; error: string }> };

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
  /** Persist an approved plan; returns the host's id for it. */
  persistPlan(
    plan: WavePlanShape,
    score: PlanScoreShape,
    input: GeneratePlanInput
  ): Promise<{ wavePlanId: string }>;
  /** Dispatch every task in one wave. DevPilot delegates to its coordinator. */
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
  /** Optional progress sink. */
  onEvent?(event: ConductorEvent): void;
}

export type ConductorEvent =
  | { type: 'plan:generated'; iterations: number; score: number }
  | { type: 'plan:refined'; iterations: number; score: number; improved: boolean }
  | { type: 'plan:approved'; wavePlanId: string }
  | { type: 'plan:aborted'; reason?: string }
  | { type: 'wave:dispatched'; waveIndex: number; dispatched: number; queued: number }
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
  /** Hard cap on refinement passes. */
  maxRefinementIterations: number;
  /** Pause for human approval before dispatching. */
  requireReview: boolean;
  /** `halt` stops the run on a failed wave; `continue` advances anyway. */
  failurePolicy: 'halt' | 'continue';
  /** Re-dispatch attempts for a failed wave before the policy applies. */
  waveRetryLimit: number;
}

export const DEFAULT_CONFIG: ConductorConfig = {
  minParallelizationScore: 0.7,
  maxRefinementIterations: 3,
  requireReview: true,
  failurePolicy: 'halt',
  waveRetryLimit: 1,
};
