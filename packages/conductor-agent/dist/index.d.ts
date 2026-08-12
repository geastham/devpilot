import * as _langchain_langgraph from '@langchain/langgraph';
import { BaseCheckpointSaver } from '@langchain/langgraph';
export { Command, END, START } from '@langchain/langgraph';

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
interface WavePlanShape {
    waves: Array<{
        waveNumber: number;
        tasks: Array<{
            taskCode: string;
            [key: string]: unknown;
        }>;
        [key: string]: unknown;
    }>;
    dependencyEdges?: Array<{
        from: string;
        to: string;
        [key: string]: unknown;
    }>;
    [key: string]: unknown;
}
/** The minimum a score must expose for the refinement branch to decide. */
interface PlanScoreShape {
    parallelizationScore: number;
    [key: string]: unknown;
}
interface GeneratePlanInput {
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
interface GeneratePlanOutput {
    plan: WavePlanShape;
    tokensUsed?: number;
    costUsd?: number;
}
interface DispatchWaveResult {
    dispatched: number;
    queued: number;
    errors: Array<{
        taskCode: string;
        error: string;
    }>;
}
type WaveOutcome = {
    state: 'complete';
} | {
    state: 'failed';
    failures: Array<{
        taskCode: string;
        error: string;
    }>;
};
/** What the conductor asks a human at the review interrupt. */
interface ReviewRequest {
    itemId: string;
    itemTitle: string;
    plan: WavePlanShape;
    score: PlanScoreShape;
    refinementIterations: number;
    /** True when refinement gave up below threshold — the human is the tiebreak. */
    belowThreshold: boolean;
}
/** What the human sends back to resume it. */
type ReviewDecision = {
    action: 'approve';
} | {
    action: 'refine';
    constraints: string[];
} | {
    action: 'abort';
    reason?: string;
};
interface ConductorPorts {
    /** Produce a first plan. */
    generatePlan(input: GeneratePlanInput): Promise<GeneratePlanOutput>;
    /** Produce an improved plan given the previous one and its score. */
    refinePlan(input: GeneratePlanInput): Promise<GeneratePlanOutput>;
    /** Deterministic. Not an LLM call, and must not become one. */
    scorePlan(plan: WavePlanShape): PlanScoreShape | Promise<PlanScoreShape>;
    /** Persist an approved plan; returns the host's id for it. */
    persistPlan(plan: WavePlanShape, score: PlanScoreShape, input: GeneratePlanInput): Promise<{
        wavePlanId: string;
    }>;
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
type ConductorEvent = {
    type: 'plan:generated';
    iterations: number;
    score: number;
} | {
    type: 'plan:refined';
    iterations: number;
    score: number;
    improved: boolean;
} | {
    type: 'plan:approved';
    wavePlanId: string;
} | {
    type: 'plan:aborted';
    reason?: string;
} | {
    type: 'wave:dispatched';
    waveIndex: number;
    dispatched: number;
    queued: number;
} | {
    type: 'wave:complete';
    waveIndex: number;
} | {
    type: 'wave:failed';
    waveIndex: number;
    failures: number;
} | {
    type: 'run:complete';
    waves: number;
} | {
    type: 'run:failed';
    reason: string;
};
interface ConductorConfig {
    /** Refinement stops once the score reaches this. */
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
declare const DEFAULT_CONFIG: ConductorConfig;

/**
 * The conductor graph.
 *
 *   generate ─▶ score-gate ─┬─(below threshold, budget left)─▶ refine ─┐
 *                           │                                          │
 *                           └─(good enough / out of budget)─▶ review ◀─┘
 *                                                               │
 *                    ┌────────(refine w/ constraints)────────────┤
 *                    │                                           │
 *                    ▼                              (approve)    ▼
 *                 refine                                      persist
 *                                                                │
 *                                          ┌─────────────────────┘
 *                                          ▼
 *                                      dispatch ─▶ awaitWave ─┬─(ok)──▶ advance ─┬─(more)─▶ dispatch
 *                                          ▲                  │                  └─(none)─▶ finish
 *                                          │                  └─(failed)─▶ retry? ─┬─▶ dispatch
 *                                          └───────────────────────────────────────┘   └─▶ fail (halt)
 *
 * Every branch below was previously an `if` somewhere inside a 449-line
 * controller, spread across `approve`, `dispatchWave`, `onTaskComplete`,
 * `handleWaveComplete` and `onTaskFailed`. The behaviour is the same; what
 * changes is that the decisions are declared in one place, and the run is
 * suspendable at any of them.
 */
interface ConductorAgentOptions {
    ports: ConductorPorts;
    config?: Partial<ConductorConfig>;
    /**
     * Required for `interrupt()` to survive a process restart. Without one the
     * graph still interrupts, but only within a single live run.
     */
    checkpointer?: BaseCheckpointSaver;
}
declare function createConductorGraph(options: ConductorAgentOptions): _langchain_langgraph.CompiledStateGraph<{
    itemId: string;
    itemTitle: string;
    repo: string;
    specContent: string;
    plan: WavePlanShape | null;
    score: PlanScoreShape | null;
    refinementIterations: number;
    constraints: string[];
    wavePlanId: string | null;
    currentWaveIndex: number;
    waveRetries: number;
    lastDispatch: {
        dispatched: number;
        queued: number;
    } | null;
    completedWaves: number[];
    tokensUsed: number;
    costUsd: number;
    errors: string[];
    status: "failed" | "complete" | "planning" | "awaiting-review" | "executing" | "aborted";
}, {
    itemId?: string | undefined;
    itemTitle?: string | undefined;
    repo?: string | undefined;
    specContent?: string | undefined;
    plan?: WavePlanShape | _langchain_langgraph.OverwriteValue<WavePlanShape | null> | null | undefined;
    score?: PlanScoreShape | _langchain_langgraph.OverwriteValue<PlanScoreShape | null> | null | undefined;
    refinementIterations?: number | _langchain_langgraph.OverwriteValue<number> | undefined;
    constraints?: string[] | _langchain_langgraph.OverwriteValue<string[]> | undefined;
    wavePlanId?: string | _langchain_langgraph.OverwriteValue<string | null> | null | undefined;
    currentWaveIndex?: number | _langchain_langgraph.OverwriteValue<number> | undefined;
    waveRetries?: number | _langchain_langgraph.OverwriteValue<number> | undefined;
    lastDispatch?: {
        dispatched: number;
        queued: number;
    } | _langchain_langgraph.OverwriteValue<{
        dispatched: number;
        queued: number;
    } | null> | null | undefined;
    completedWaves?: number[] | _langchain_langgraph.OverwriteValue<number[]> | undefined;
    tokensUsed?: number | _langchain_langgraph.OverwriteValue<number> | undefined;
    costUsd?: number | _langchain_langgraph.OverwriteValue<number> | undefined;
    errors?: string[] | _langchain_langgraph.OverwriteValue<string[]> | undefined;
    status?: "failed" | "complete" | "planning" | "awaiting-review" | "executing" | "aborted" | _langchain_langgraph.OverwriteValue<"failed" | "complete" | "planning" | "awaiting-review" | "executing" | "aborted"> | undefined;
}, "refine" | "generate" | "dispatch" | "review" | "persist" | "fail" | "advance" | "retryWave" | "finish" | "__start__" | "awaitWave", {
    itemId: {
        (annotation: _langchain_langgraph.SingleReducer<string, string>): _langchain_langgraph.BaseChannel<string, string | _langchain_langgraph.OverwriteValue<string>, unknown>;
        (): _langchain_langgraph.LastValue<string>;
        Root: <S extends _langchain_langgraph.StateDefinition>(sd: S) => _langchain_langgraph.AnnotationRoot<S>;
    };
    itemTitle: {
        (annotation: _langchain_langgraph.SingleReducer<string, string>): _langchain_langgraph.BaseChannel<string, string | _langchain_langgraph.OverwriteValue<string>, unknown>;
        (): _langchain_langgraph.LastValue<string>;
        Root: <S extends _langchain_langgraph.StateDefinition>(sd: S) => _langchain_langgraph.AnnotationRoot<S>;
    };
    repo: {
        (annotation: _langchain_langgraph.SingleReducer<string, string>): _langchain_langgraph.BaseChannel<string, string | _langchain_langgraph.OverwriteValue<string>, unknown>;
        (): _langchain_langgraph.LastValue<string>;
        Root: <S extends _langchain_langgraph.StateDefinition>(sd: S) => _langchain_langgraph.AnnotationRoot<S>;
    };
    specContent: {
        (annotation: _langchain_langgraph.SingleReducer<string, string>): _langchain_langgraph.BaseChannel<string, string | _langchain_langgraph.OverwriteValue<string>, unknown>;
        (): _langchain_langgraph.LastValue<string>;
        Root: <S extends _langchain_langgraph.StateDefinition>(sd: S) => _langchain_langgraph.AnnotationRoot<S>;
    };
    plan: _langchain_langgraph.BaseChannel<WavePlanShape | null, WavePlanShape | _langchain_langgraph.OverwriteValue<WavePlanShape | null> | null, unknown>;
    score: _langchain_langgraph.BaseChannel<PlanScoreShape | null, PlanScoreShape | _langchain_langgraph.OverwriteValue<PlanScoreShape | null> | null, unknown>;
    refinementIterations: _langchain_langgraph.BaseChannel<number, number | _langchain_langgraph.OverwriteValue<number>, unknown>;
    constraints: _langchain_langgraph.BaseChannel<string[], string[] | _langchain_langgraph.OverwriteValue<string[]>, unknown>;
    wavePlanId: _langchain_langgraph.BaseChannel<string | null, string | _langchain_langgraph.OverwriteValue<string | null> | null, unknown>;
    currentWaveIndex: _langchain_langgraph.BaseChannel<number, number | _langchain_langgraph.OverwriteValue<number>, unknown>;
    waveRetries: _langchain_langgraph.BaseChannel<number, number | _langchain_langgraph.OverwriteValue<number>, unknown>;
    lastDispatch: _langchain_langgraph.BaseChannel<{
        dispatched: number;
        queued: number;
    } | null, {
        dispatched: number;
        queued: number;
    } | _langchain_langgraph.OverwriteValue<{
        dispatched: number;
        queued: number;
    } | null> | null, unknown>;
    completedWaves: _langchain_langgraph.BaseChannel<number[], number[] | _langchain_langgraph.OverwriteValue<number[]>, unknown>;
    tokensUsed: _langchain_langgraph.BaseChannel<number, number | _langchain_langgraph.OverwriteValue<number>, unknown>;
    costUsd: _langchain_langgraph.BaseChannel<number, number | _langchain_langgraph.OverwriteValue<number>, unknown>;
    errors: _langchain_langgraph.BaseChannel<string[], string[] | _langchain_langgraph.OverwriteValue<string[]>, unknown>;
    status: _langchain_langgraph.BaseChannel<"failed" | "complete" | "planning" | "awaiting-review" | "executing" | "aborted", "failed" | "complete" | "planning" | "awaiting-review" | "executing" | "aborted" | _langchain_langgraph.OverwriteValue<"failed" | "complete" | "planning" | "awaiting-review" | "executing" | "aborted">, unknown>;
}, {
    itemId: {
        (annotation: _langchain_langgraph.SingleReducer<string, string>): _langchain_langgraph.BaseChannel<string, string | _langchain_langgraph.OverwriteValue<string>, unknown>;
        (): _langchain_langgraph.LastValue<string>;
        Root: <S extends _langchain_langgraph.StateDefinition>(sd: S) => _langchain_langgraph.AnnotationRoot<S>;
    };
    itemTitle: {
        (annotation: _langchain_langgraph.SingleReducer<string, string>): _langchain_langgraph.BaseChannel<string, string | _langchain_langgraph.OverwriteValue<string>, unknown>;
        (): _langchain_langgraph.LastValue<string>;
        Root: <S extends _langchain_langgraph.StateDefinition>(sd: S) => _langchain_langgraph.AnnotationRoot<S>;
    };
    repo: {
        (annotation: _langchain_langgraph.SingleReducer<string, string>): _langchain_langgraph.BaseChannel<string, string | _langchain_langgraph.OverwriteValue<string>, unknown>;
        (): _langchain_langgraph.LastValue<string>;
        Root: <S extends _langchain_langgraph.StateDefinition>(sd: S) => _langchain_langgraph.AnnotationRoot<S>;
    };
    specContent: {
        (annotation: _langchain_langgraph.SingleReducer<string, string>): _langchain_langgraph.BaseChannel<string, string | _langchain_langgraph.OverwriteValue<string>, unknown>;
        (): _langchain_langgraph.LastValue<string>;
        Root: <S extends _langchain_langgraph.StateDefinition>(sd: S) => _langchain_langgraph.AnnotationRoot<S>;
    };
    plan: _langchain_langgraph.BaseChannel<WavePlanShape | null, WavePlanShape | _langchain_langgraph.OverwriteValue<WavePlanShape | null> | null, unknown>;
    score: _langchain_langgraph.BaseChannel<PlanScoreShape | null, PlanScoreShape | _langchain_langgraph.OverwriteValue<PlanScoreShape | null> | null, unknown>;
    refinementIterations: _langchain_langgraph.BaseChannel<number, number | _langchain_langgraph.OverwriteValue<number>, unknown>;
    constraints: _langchain_langgraph.BaseChannel<string[], string[] | _langchain_langgraph.OverwriteValue<string[]>, unknown>;
    wavePlanId: _langchain_langgraph.BaseChannel<string | null, string | _langchain_langgraph.OverwriteValue<string | null> | null, unknown>;
    currentWaveIndex: _langchain_langgraph.BaseChannel<number, number | _langchain_langgraph.OverwriteValue<number>, unknown>;
    waveRetries: _langchain_langgraph.BaseChannel<number, number | _langchain_langgraph.OverwriteValue<number>, unknown>;
    lastDispatch: _langchain_langgraph.BaseChannel<{
        dispatched: number;
        queued: number;
    } | null, {
        dispatched: number;
        queued: number;
    } | _langchain_langgraph.OverwriteValue<{
        dispatched: number;
        queued: number;
    } | null> | null, unknown>;
    completedWaves: _langchain_langgraph.BaseChannel<number[], number[] | _langchain_langgraph.OverwriteValue<number[]>, unknown>;
    tokensUsed: _langchain_langgraph.BaseChannel<number, number | _langchain_langgraph.OverwriteValue<number>, unknown>;
    costUsd: _langchain_langgraph.BaseChannel<number, number | _langchain_langgraph.OverwriteValue<number>, unknown>;
    errors: _langchain_langgraph.BaseChannel<string[], string[] | _langchain_langgraph.OverwriteValue<string[]>, unknown>;
    status: _langchain_langgraph.BaseChannel<"failed" | "complete" | "planning" | "awaiting-review" | "executing" | "aborted", "failed" | "complete" | "planning" | "awaiting-review" | "executing" | "aborted" | _langchain_langgraph.OverwriteValue<"failed" | "complete" | "planning" | "awaiting-review" | "executing" | "aborted">, unknown>;
}, _langchain_langgraph.StateDefinition, {
    generate: Partial<_langchain_langgraph.StateType<{
        itemId: {
            (annotation: _langchain_langgraph.SingleReducer<string, string>): _langchain_langgraph.BaseChannel<string, string | _langchain_langgraph.OverwriteValue<string>, unknown>;
            (): _langchain_langgraph.LastValue<string>;
            Root: <S extends _langchain_langgraph.StateDefinition>(sd: S) => _langchain_langgraph.AnnotationRoot<S>;
        };
        itemTitle: {
            (annotation: _langchain_langgraph.SingleReducer<string, string>): _langchain_langgraph.BaseChannel<string, string | _langchain_langgraph.OverwriteValue<string>, unknown>;
            (): _langchain_langgraph.LastValue<string>;
            Root: <S extends _langchain_langgraph.StateDefinition>(sd: S) => _langchain_langgraph.AnnotationRoot<S>;
        };
        repo: {
            (annotation: _langchain_langgraph.SingleReducer<string, string>): _langchain_langgraph.BaseChannel<string, string | _langchain_langgraph.OverwriteValue<string>, unknown>;
            (): _langchain_langgraph.LastValue<string>;
            Root: <S extends _langchain_langgraph.StateDefinition>(sd: S) => _langchain_langgraph.AnnotationRoot<S>;
        };
        specContent: {
            (annotation: _langchain_langgraph.SingleReducer<string, string>): _langchain_langgraph.BaseChannel<string, string | _langchain_langgraph.OverwriteValue<string>, unknown>;
            (): _langchain_langgraph.LastValue<string>;
            Root: <S extends _langchain_langgraph.StateDefinition>(sd: S) => _langchain_langgraph.AnnotationRoot<S>;
        };
        plan: _langchain_langgraph.BaseChannel<WavePlanShape | null, WavePlanShape | _langchain_langgraph.OverwriteValue<WavePlanShape | null> | null, unknown>;
        score: _langchain_langgraph.BaseChannel<PlanScoreShape | null, PlanScoreShape | _langchain_langgraph.OverwriteValue<PlanScoreShape | null> | null, unknown>;
        refinementIterations: _langchain_langgraph.BaseChannel<number, number | _langchain_langgraph.OverwriteValue<number>, unknown>;
        constraints: _langchain_langgraph.BaseChannel<string[], string[] | _langchain_langgraph.OverwriteValue<string[]>, unknown>;
        wavePlanId: _langchain_langgraph.BaseChannel<string | null, string | _langchain_langgraph.OverwriteValue<string | null> | null, unknown>;
        currentWaveIndex: _langchain_langgraph.BaseChannel<number, number | _langchain_langgraph.OverwriteValue<number>, unknown>;
        waveRetries: _langchain_langgraph.BaseChannel<number, number | _langchain_langgraph.OverwriteValue<number>, unknown>;
        lastDispatch: _langchain_langgraph.BaseChannel<{
            dispatched: number;
            queued: number;
        } | null, {
            dispatched: number;
            queued: number;
        } | _langchain_langgraph.OverwriteValue<{
            dispatched: number;
            queued: number;
        } | null> | null, unknown>;
        completedWaves: _langchain_langgraph.BaseChannel<number[], number[] | _langchain_langgraph.OverwriteValue<number[]>, unknown>;
        tokensUsed: _langchain_langgraph.BaseChannel<number, number | _langchain_langgraph.OverwriteValue<number>, unknown>;
        costUsd: _langchain_langgraph.BaseChannel<number, number | _langchain_langgraph.OverwriteValue<number>, unknown>;
        errors: _langchain_langgraph.BaseChannel<string[], string[] | _langchain_langgraph.OverwriteValue<string[]>, unknown>;
        status: _langchain_langgraph.BaseChannel<"failed" | "complete" | "planning" | "awaiting-review" | "executing" | "aborted", "failed" | "complete" | "planning" | "awaiting-review" | "executing" | "aborted" | _langchain_langgraph.OverwriteValue<"failed" | "complete" | "planning" | "awaiting-review" | "executing" | "aborted">, unknown>;
    }>>;
    refine: Partial<_langchain_langgraph.StateType<{
        itemId: {
            (annotation: _langchain_langgraph.SingleReducer<string, string>): _langchain_langgraph.BaseChannel<string, string | _langchain_langgraph.OverwriteValue<string>, unknown>;
            (): _langchain_langgraph.LastValue<string>;
            Root: <S extends _langchain_langgraph.StateDefinition>(sd: S) => _langchain_langgraph.AnnotationRoot<S>;
        };
        itemTitle: {
            (annotation: _langchain_langgraph.SingleReducer<string, string>): _langchain_langgraph.BaseChannel<string, string | _langchain_langgraph.OverwriteValue<string>, unknown>;
            (): _langchain_langgraph.LastValue<string>;
            Root: <S extends _langchain_langgraph.StateDefinition>(sd: S) => _langchain_langgraph.AnnotationRoot<S>;
        };
        repo: {
            (annotation: _langchain_langgraph.SingleReducer<string, string>): _langchain_langgraph.BaseChannel<string, string | _langchain_langgraph.OverwriteValue<string>, unknown>;
            (): _langchain_langgraph.LastValue<string>;
            Root: <S extends _langchain_langgraph.StateDefinition>(sd: S) => _langchain_langgraph.AnnotationRoot<S>;
        };
        specContent: {
            (annotation: _langchain_langgraph.SingleReducer<string, string>): _langchain_langgraph.BaseChannel<string, string | _langchain_langgraph.OverwriteValue<string>, unknown>;
            (): _langchain_langgraph.LastValue<string>;
            Root: <S extends _langchain_langgraph.StateDefinition>(sd: S) => _langchain_langgraph.AnnotationRoot<S>;
        };
        plan: _langchain_langgraph.BaseChannel<WavePlanShape | null, WavePlanShape | _langchain_langgraph.OverwriteValue<WavePlanShape | null> | null, unknown>;
        score: _langchain_langgraph.BaseChannel<PlanScoreShape | null, PlanScoreShape | _langchain_langgraph.OverwriteValue<PlanScoreShape | null> | null, unknown>;
        refinementIterations: _langchain_langgraph.BaseChannel<number, number | _langchain_langgraph.OverwriteValue<number>, unknown>;
        constraints: _langchain_langgraph.BaseChannel<string[], string[] | _langchain_langgraph.OverwriteValue<string[]>, unknown>;
        wavePlanId: _langchain_langgraph.BaseChannel<string | null, string | _langchain_langgraph.OverwriteValue<string | null> | null, unknown>;
        currentWaveIndex: _langchain_langgraph.BaseChannel<number, number | _langchain_langgraph.OverwriteValue<number>, unknown>;
        waveRetries: _langchain_langgraph.BaseChannel<number, number | _langchain_langgraph.OverwriteValue<number>, unknown>;
        lastDispatch: _langchain_langgraph.BaseChannel<{
            dispatched: number;
            queued: number;
        } | null, {
            dispatched: number;
            queued: number;
        } | _langchain_langgraph.OverwriteValue<{
            dispatched: number;
            queued: number;
        } | null> | null, unknown>;
        completedWaves: _langchain_langgraph.BaseChannel<number[], number[] | _langchain_langgraph.OverwriteValue<number[]>, unknown>;
        tokensUsed: _langchain_langgraph.BaseChannel<number, number | _langchain_langgraph.OverwriteValue<number>, unknown>;
        costUsd: _langchain_langgraph.BaseChannel<number, number | _langchain_langgraph.OverwriteValue<number>, unknown>;
        errors: _langchain_langgraph.BaseChannel<string[], string[] | _langchain_langgraph.OverwriteValue<string[]>, unknown>;
        status: _langchain_langgraph.BaseChannel<"failed" | "complete" | "planning" | "awaiting-review" | "executing" | "aborted", "failed" | "complete" | "planning" | "awaiting-review" | "executing" | "aborted" | _langchain_langgraph.OverwriteValue<"failed" | "complete" | "planning" | "awaiting-review" | "executing" | "aborted">, unknown>;
    }>>;
    review: Partial<_langchain_langgraph.StateType<{
        itemId: {
            (annotation: _langchain_langgraph.SingleReducer<string, string>): _langchain_langgraph.BaseChannel<string, string | _langchain_langgraph.OverwriteValue<string>, unknown>;
            (): _langchain_langgraph.LastValue<string>;
            Root: <S extends _langchain_langgraph.StateDefinition>(sd: S) => _langchain_langgraph.AnnotationRoot<S>;
        };
        itemTitle: {
            (annotation: _langchain_langgraph.SingleReducer<string, string>): _langchain_langgraph.BaseChannel<string, string | _langchain_langgraph.OverwriteValue<string>, unknown>;
            (): _langchain_langgraph.LastValue<string>;
            Root: <S extends _langchain_langgraph.StateDefinition>(sd: S) => _langchain_langgraph.AnnotationRoot<S>;
        };
        repo: {
            (annotation: _langchain_langgraph.SingleReducer<string, string>): _langchain_langgraph.BaseChannel<string, string | _langchain_langgraph.OverwriteValue<string>, unknown>;
            (): _langchain_langgraph.LastValue<string>;
            Root: <S extends _langchain_langgraph.StateDefinition>(sd: S) => _langchain_langgraph.AnnotationRoot<S>;
        };
        specContent: {
            (annotation: _langchain_langgraph.SingleReducer<string, string>): _langchain_langgraph.BaseChannel<string, string | _langchain_langgraph.OverwriteValue<string>, unknown>;
            (): _langchain_langgraph.LastValue<string>;
            Root: <S extends _langchain_langgraph.StateDefinition>(sd: S) => _langchain_langgraph.AnnotationRoot<S>;
        };
        plan: _langchain_langgraph.BaseChannel<WavePlanShape | null, WavePlanShape | _langchain_langgraph.OverwriteValue<WavePlanShape | null> | null, unknown>;
        score: _langchain_langgraph.BaseChannel<PlanScoreShape | null, PlanScoreShape | _langchain_langgraph.OverwriteValue<PlanScoreShape | null> | null, unknown>;
        refinementIterations: _langchain_langgraph.BaseChannel<number, number | _langchain_langgraph.OverwriteValue<number>, unknown>;
        constraints: _langchain_langgraph.BaseChannel<string[], string[] | _langchain_langgraph.OverwriteValue<string[]>, unknown>;
        wavePlanId: _langchain_langgraph.BaseChannel<string | null, string | _langchain_langgraph.OverwriteValue<string | null> | null, unknown>;
        currentWaveIndex: _langchain_langgraph.BaseChannel<number, number | _langchain_langgraph.OverwriteValue<number>, unknown>;
        waveRetries: _langchain_langgraph.BaseChannel<number, number | _langchain_langgraph.OverwriteValue<number>, unknown>;
        lastDispatch: _langchain_langgraph.BaseChannel<{
            dispatched: number;
            queued: number;
        } | null, {
            dispatched: number;
            queued: number;
        } | _langchain_langgraph.OverwriteValue<{
            dispatched: number;
            queued: number;
        } | null> | null, unknown>;
        completedWaves: _langchain_langgraph.BaseChannel<number[], number[] | _langchain_langgraph.OverwriteValue<number[]>, unknown>;
        tokensUsed: _langchain_langgraph.BaseChannel<number, number | _langchain_langgraph.OverwriteValue<number>, unknown>;
        costUsd: _langchain_langgraph.BaseChannel<number, number | _langchain_langgraph.OverwriteValue<number>, unknown>;
        errors: _langchain_langgraph.BaseChannel<string[], string[] | _langchain_langgraph.OverwriteValue<string[]>, unknown>;
        status: _langchain_langgraph.BaseChannel<"failed" | "complete" | "planning" | "awaiting-review" | "executing" | "aborted", "failed" | "complete" | "planning" | "awaiting-review" | "executing" | "aborted" | _langchain_langgraph.OverwriteValue<"failed" | "complete" | "planning" | "awaiting-review" | "executing" | "aborted">, unknown>;
    }>>;
    persist: Partial<_langchain_langgraph.StateType<{
        itemId: {
            (annotation: _langchain_langgraph.SingleReducer<string, string>): _langchain_langgraph.BaseChannel<string, string | _langchain_langgraph.OverwriteValue<string>, unknown>;
            (): _langchain_langgraph.LastValue<string>;
            Root: <S extends _langchain_langgraph.StateDefinition>(sd: S) => _langchain_langgraph.AnnotationRoot<S>;
        };
        itemTitle: {
            (annotation: _langchain_langgraph.SingleReducer<string, string>): _langchain_langgraph.BaseChannel<string, string | _langchain_langgraph.OverwriteValue<string>, unknown>;
            (): _langchain_langgraph.LastValue<string>;
            Root: <S extends _langchain_langgraph.StateDefinition>(sd: S) => _langchain_langgraph.AnnotationRoot<S>;
        };
        repo: {
            (annotation: _langchain_langgraph.SingleReducer<string, string>): _langchain_langgraph.BaseChannel<string, string | _langchain_langgraph.OverwriteValue<string>, unknown>;
            (): _langchain_langgraph.LastValue<string>;
            Root: <S extends _langchain_langgraph.StateDefinition>(sd: S) => _langchain_langgraph.AnnotationRoot<S>;
        };
        specContent: {
            (annotation: _langchain_langgraph.SingleReducer<string, string>): _langchain_langgraph.BaseChannel<string, string | _langchain_langgraph.OverwriteValue<string>, unknown>;
            (): _langchain_langgraph.LastValue<string>;
            Root: <S extends _langchain_langgraph.StateDefinition>(sd: S) => _langchain_langgraph.AnnotationRoot<S>;
        };
        plan: _langchain_langgraph.BaseChannel<WavePlanShape | null, WavePlanShape | _langchain_langgraph.OverwriteValue<WavePlanShape | null> | null, unknown>;
        score: _langchain_langgraph.BaseChannel<PlanScoreShape | null, PlanScoreShape | _langchain_langgraph.OverwriteValue<PlanScoreShape | null> | null, unknown>;
        refinementIterations: _langchain_langgraph.BaseChannel<number, number | _langchain_langgraph.OverwriteValue<number>, unknown>;
        constraints: _langchain_langgraph.BaseChannel<string[], string[] | _langchain_langgraph.OverwriteValue<string[]>, unknown>;
        wavePlanId: _langchain_langgraph.BaseChannel<string | null, string | _langchain_langgraph.OverwriteValue<string | null> | null, unknown>;
        currentWaveIndex: _langchain_langgraph.BaseChannel<number, number | _langchain_langgraph.OverwriteValue<number>, unknown>;
        waveRetries: _langchain_langgraph.BaseChannel<number, number | _langchain_langgraph.OverwriteValue<number>, unknown>;
        lastDispatch: _langchain_langgraph.BaseChannel<{
            dispatched: number;
            queued: number;
        } | null, {
            dispatched: number;
            queued: number;
        } | _langchain_langgraph.OverwriteValue<{
            dispatched: number;
            queued: number;
        } | null> | null, unknown>;
        completedWaves: _langchain_langgraph.BaseChannel<number[], number[] | _langchain_langgraph.OverwriteValue<number[]>, unknown>;
        tokensUsed: _langchain_langgraph.BaseChannel<number, number | _langchain_langgraph.OverwriteValue<number>, unknown>;
        costUsd: _langchain_langgraph.BaseChannel<number, number | _langchain_langgraph.OverwriteValue<number>, unknown>;
        errors: _langchain_langgraph.BaseChannel<string[], string[] | _langchain_langgraph.OverwriteValue<string[]>, unknown>;
        status: _langchain_langgraph.BaseChannel<"failed" | "complete" | "planning" | "awaiting-review" | "executing" | "aborted", "failed" | "complete" | "planning" | "awaiting-review" | "executing" | "aborted" | _langchain_langgraph.OverwriteValue<"failed" | "complete" | "planning" | "awaiting-review" | "executing" | "aborted">, unknown>;
    }>>;
    dispatch: Partial<_langchain_langgraph.StateType<{
        itemId: {
            (annotation: _langchain_langgraph.SingleReducer<string, string>): _langchain_langgraph.BaseChannel<string, string | _langchain_langgraph.OverwriteValue<string>, unknown>;
            (): _langchain_langgraph.LastValue<string>;
            Root: <S extends _langchain_langgraph.StateDefinition>(sd: S) => _langchain_langgraph.AnnotationRoot<S>;
        };
        itemTitle: {
            (annotation: _langchain_langgraph.SingleReducer<string, string>): _langchain_langgraph.BaseChannel<string, string | _langchain_langgraph.OverwriteValue<string>, unknown>;
            (): _langchain_langgraph.LastValue<string>;
            Root: <S extends _langchain_langgraph.StateDefinition>(sd: S) => _langchain_langgraph.AnnotationRoot<S>;
        };
        repo: {
            (annotation: _langchain_langgraph.SingleReducer<string, string>): _langchain_langgraph.BaseChannel<string, string | _langchain_langgraph.OverwriteValue<string>, unknown>;
            (): _langchain_langgraph.LastValue<string>;
            Root: <S extends _langchain_langgraph.StateDefinition>(sd: S) => _langchain_langgraph.AnnotationRoot<S>;
        };
        specContent: {
            (annotation: _langchain_langgraph.SingleReducer<string, string>): _langchain_langgraph.BaseChannel<string, string | _langchain_langgraph.OverwriteValue<string>, unknown>;
            (): _langchain_langgraph.LastValue<string>;
            Root: <S extends _langchain_langgraph.StateDefinition>(sd: S) => _langchain_langgraph.AnnotationRoot<S>;
        };
        plan: _langchain_langgraph.BaseChannel<WavePlanShape | null, WavePlanShape | _langchain_langgraph.OverwriteValue<WavePlanShape | null> | null, unknown>;
        score: _langchain_langgraph.BaseChannel<PlanScoreShape | null, PlanScoreShape | _langchain_langgraph.OverwriteValue<PlanScoreShape | null> | null, unknown>;
        refinementIterations: _langchain_langgraph.BaseChannel<number, number | _langchain_langgraph.OverwriteValue<number>, unknown>;
        constraints: _langchain_langgraph.BaseChannel<string[], string[] | _langchain_langgraph.OverwriteValue<string[]>, unknown>;
        wavePlanId: _langchain_langgraph.BaseChannel<string | null, string | _langchain_langgraph.OverwriteValue<string | null> | null, unknown>;
        currentWaveIndex: _langchain_langgraph.BaseChannel<number, number | _langchain_langgraph.OverwriteValue<number>, unknown>;
        waveRetries: _langchain_langgraph.BaseChannel<number, number | _langchain_langgraph.OverwriteValue<number>, unknown>;
        lastDispatch: _langchain_langgraph.BaseChannel<{
            dispatched: number;
            queued: number;
        } | null, {
            dispatched: number;
            queued: number;
        } | _langchain_langgraph.OverwriteValue<{
            dispatched: number;
            queued: number;
        } | null> | null, unknown>;
        completedWaves: _langchain_langgraph.BaseChannel<number[], number[] | _langchain_langgraph.OverwriteValue<number[]>, unknown>;
        tokensUsed: _langchain_langgraph.BaseChannel<number, number | _langchain_langgraph.OverwriteValue<number>, unknown>;
        costUsd: _langchain_langgraph.BaseChannel<number, number | _langchain_langgraph.OverwriteValue<number>, unknown>;
        errors: _langchain_langgraph.BaseChannel<string[], string[] | _langchain_langgraph.OverwriteValue<string[]>, unknown>;
        status: _langchain_langgraph.BaseChannel<"failed" | "complete" | "planning" | "awaiting-review" | "executing" | "aborted", "failed" | "complete" | "planning" | "awaiting-review" | "executing" | "aborted" | _langchain_langgraph.OverwriteValue<"failed" | "complete" | "planning" | "awaiting-review" | "executing" | "aborted">, unknown>;
    }>>;
    awaitWave: Partial<_langchain_langgraph.StateType<{
        itemId: {
            (annotation: _langchain_langgraph.SingleReducer<string, string>): _langchain_langgraph.BaseChannel<string, string | _langchain_langgraph.OverwriteValue<string>, unknown>;
            (): _langchain_langgraph.LastValue<string>;
            Root: <S extends _langchain_langgraph.StateDefinition>(sd: S) => _langchain_langgraph.AnnotationRoot<S>;
        };
        itemTitle: {
            (annotation: _langchain_langgraph.SingleReducer<string, string>): _langchain_langgraph.BaseChannel<string, string | _langchain_langgraph.OverwriteValue<string>, unknown>;
            (): _langchain_langgraph.LastValue<string>;
            Root: <S extends _langchain_langgraph.StateDefinition>(sd: S) => _langchain_langgraph.AnnotationRoot<S>;
        };
        repo: {
            (annotation: _langchain_langgraph.SingleReducer<string, string>): _langchain_langgraph.BaseChannel<string, string | _langchain_langgraph.OverwriteValue<string>, unknown>;
            (): _langchain_langgraph.LastValue<string>;
            Root: <S extends _langchain_langgraph.StateDefinition>(sd: S) => _langchain_langgraph.AnnotationRoot<S>;
        };
        specContent: {
            (annotation: _langchain_langgraph.SingleReducer<string, string>): _langchain_langgraph.BaseChannel<string, string | _langchain_langgraph.OverwriteValue<string>, unknown>;
            (): _langchain_langgraph.LastValue<string>;
            Root: <S extends _langchain_langgraph.StateDefinition>(sd: S) => _langchain_langgraph.AnnotationRoot<S>;
        };
        plan: _langchain_langgraph.BaseChannel<WavePlanShape | null, WavePlanShape | _langchain_langgraph.OverwriteValue<WavePlanShape | null> | null, unknown>;
        score: _langchain_langgraph.BaseChannel<PlanScoreShape | null, PlanScoreShape | _langchain_langgraph.OverwriteValue<PlanScoreShape | null> | null, unknown>;
        refinementIterations: _langchain_langgraph.BaseChannel<number, number | _langchain_langgraph.OverwriteValue<number>, unknown>;
        constraints: _langchain_langgraph.BaseChannel<string[], string[] | _langchain_langgraph.OverwriteValue<string[]>, unknown>;
        wavePlanId: _langchain_langgraph.BaseChannel<string | null, string | _langchain_langgraph.OverwriteValue<string | null> | null, unknown>;
        currentWaveIndex: _langchain_langgraph.BaseChannel<number, number | _langchain_langgraph.OverwriteValue<number>, unknown>;
        waveRetries: _langchain_langgraph.BaseChannel<number, number | _langchain_langgraph.OverwriteValue<number>, unknown>;
        lastDispatch: _langchain_langgraph.BaseChannel<{
            dispatched: number;
            queued: number;
        } | null, {
            dispatched: number;
            queued: number;
        } | _langchain_langgraph.OverwriteValue<{
            dispatched: number;
            queued: number;
        } | null> | null, unknown>;
        completedWaves: _langchain_langgraph.BaseChannel<number[], number[] | _langchain_langgraph.OverwriteValue<number[]>, unknown>;
        tokensUsed: _langchain_langgraph.BaseChannel<number, number | _langchain_langgraph.OverwriteValue<number>, unknown>;
        costUsd: _langchain_langgraph.BaseChannel<number, number | _langchain_langgraph.OverwriteValue<number>, unknown>;
        errors: _langchain_langgraph.BaseChannel<string[], string[] | _langchain_langgraph.OverwriteValue<string[]>, unknown>;
        status: _langchain_langgraph.BaseChannel<"failed" | "complete" | "planning" | "awaiting-review" | "executing" | "aborted", "failed" | "complete" | "planning" | "awaiting-review" | "executing" | "aborted" | _langchain_langgraph.OverwriteValue<"failed" | "complete" | "planning" | "awaiting-review" | "executing" | "aborted">, unknown>;
    }>>;
    advance: Partial<_langchain_langgraph.StateType<{
        itemId: {
            (annotation: _langchain_langgraph.SingleReducer<string, string>): _langchain_langgraph.BaseChannel<string, string | _langchain_langgraph.OverwriteValue<string>, unknown>;
            (): _langchain_langgraph.LastValue<string>;
            Root: <S extends _langchain_langgraph.StateDefinition>(sd: S) => _langchain_langgraph.AnnotationRoot<S>;
        };
        itemTitle: {
            (annotation: _langchain_langgraph.SingleReducer<string, string>): _langchain_langgraph.BaseChannel<string, string | _langchain_langgraph.OverwriteValue<string>, unknown>;
            (): _langchain_langgraph.LastValue<string>;
            Root: <S extends _langchain_langgraph.StateDefinition>(sd: S) => _langchain_langgraph.AnnotationRoot<S>;
        };
        repo: {
            (annotation: _langchain_langgraph.SingleReducer<string, string>): _langchain_langgraph.BaseChannel<string, string | _langchain_langgraph.OverwriteValue<string>, unknown>;
            (): _langchain_langgraph.LastValue<string>;
            Root: <S extends _langchain_langgraph.StateDefinition>(sd: S) => _langchain_langgraph.AnnotationRoot<S>;
        };
        specContent: {
            (annotation: _langchain_langgraph.SingleReducer<string, string>): _langchain_langgraph.BaseChannel<string, string | _langchain_langgraph.OverwriteValue<string>, unknown>;
            (): _langchain_langgraph.LastValue<string>;
            Root: <S extends _langchain_langgraph.StateDefinition>(sd: S) => _langchain_langgraph.AnnotationRoot<S>;
        };
        plan: _langchain_langgraph.BaseChannel<WavePlanShape | null, WavePlanShape | _langchain_langgraph.OverwriteValue<WavePlanShape | null> | null, unknown>;
        score: _langchain_langgraph.BaseChannel<PlanScoreShape | null, PlanScoreShape | _langchain_langgraph.OverwriteValue<PlanScoreShape | null> | null, unknown>;
        refinementIterations: _langchain_langgraph.BaseChannel<number, number | _langchain_langgraph.OverwriteValue<number>, unknown>;
        constraints: _langchain_langgraph.BaseChannel<string[], string[] | _langchain_langgraph.OverwriteValue<string[]>, unknown>;
        wavePlanId: _langchain_langgraph.BaseChannel<string | null, string | _langchain_langgraph.OverwriteValue<string | null> | null, unknown>;
        currentWaveIndex: _langchain_langgraph.BaseChannel<number, number | _langchain_langgraph.OverwriteValue<number>, unknown>;
        waveRetries: _langchain_langgraph.BaseChannel<number, number | _langchain_langgraph.OverwriteValue<number>, unknown>;
        lastDispatch: _langchain_langgraph.BaseChannel<{
            dispatched: number;
            queued: number;
        } | null, {
            dispatched: number;
            queued: number;
        } | _langchain_langgraph.OverwriteValue<{
            dispatched: number;
            queued: number;
        } | null> | null, unknown>;
        completedWaves: _langchain_langgraph.BaseChannel<number[], number[] | _langchain_langgraph.OverwriteValue<number[]>, unknown>;
        tokensUsed: _langchain_langgraph.BaseChannel<number, number | _langchain_langgraph.OverwriteValue<number>, unknown>;
        costUsd: _langchain_langgraph.BaseChannel<number, number | _langchain_langgraph.OverwriteValue<number>, unknown>;
        errors: _langchain_langgraph.BaseChannel<string[], string[] | _langchain_langgraph.OverwriteValue<string[]>, unknown>;
        status: _langchain_langgraph.BaseChannel<"failed" | "complete" | "planning" | "awaiting-review" | "executing" | "aborted", "failed" | "complete" | "planning" | "awaiting-review" | "executing" | "aborted" | _langchain_langgraph.OverwriteValue<"failed" | "complete" | "planning" | "awaiting-review" | "executing" | "aborted">, unknown>;
    }>>;
    retryWave: Partial<_langchain_langgraph.StateType<{
        itemId: {
            (annotation: _langchain_langgraph.SingleReducer<string, string>): _langchain_langgraph.BaseChannel<string, string | _langchain_langgraph.OverwriteValue<string>, unknown>;
            (): _langchain_langgraph.LastValue<string>;
            Root: <S extends _langchain_langgraph.StateDefinition>(sd: S) => _langchain_langgraph.AnnotationRoot<S>;
        };
        itemTitle: {
            (annotation: _langchain_langgraph.SingleReducer<string, string>): _langchain_langgraph.BaseChannel<string, string | _langchain_langgraph.OverwriteValue<string>, unknown>;
            (): _langchain_langgraph.LastValue<string>;
            Root: <S extends _langchain_langgraph.StateDefinition>(sd: S) => _langchain_langgraph.AnnotationRoot<S>;
        };
        repo: {
            (annotation: _langchain_langgraph.SingleReducer<string, string>): _langchain_langgraph.BaseChannel<string, string | _langchain_langgraph.OverwriteValue<string>, unknown>;
            (): _langchain_langgraph.LastValue<string>;
            Root: <S extends _langchain_langgraph.StateDefinition>(sd: S) => _langchain_langgraph.AnnotationRoot<S>;
        };
        specContent: {
            (annotation: _langchain_langgraph.SingleReducer<string, string>): _langchain_langgraph.BaseChannel<string, string | _langchain_langgraph.OverwriteValue<string>, unknown>;
            (): _langchain_langgraph.LastValue<string>;
            Root: <S extends _langchain_langgraph.StateDefinition>(sd: S) => _langchain_langgraph.AnnotationRoot<S>;
        };
        plan: _langchain_langgraph.BaseChannel<WavePlanShape | null, WavePlanShape | _langchain_langgraph.OverwriteValue<WavePlanShape | null> | null, unknown>;
        score: _langchain_langgraph.BaseChannel<PlanScoreShape | null, PlanScoreShape | _langchain_langgraph.OverwriteValue<PlanScoreShape | null> | null, unknown>;
        refinementIterations: _langchain_langgraph.BaseChannel<number, number | _langchain_langgraph.OverwriteValue<number>, unknown>;
        constraints: _langchain_langgraph.BaseChannel<string[], string[] | _langchain_langgraph.OverwriteValue<string[]>, unknown>;
        wavePlanId: _langchain_langgraph.BaseChannel<string | null, string | _langchain_langgraph.OverwriteValue<string | null> | null, unknown>;
        currentWaveIndex: _langchain_langgraph.BaseChannel<number, number | _langchain_langgraph.OverwriteValue<number>, unknown>;
        waveRetries: _langchain_langgraph.BaseChannel<number, number | _langchain_langgraph.OverwriteValue<number>, unknown>;
        lastDispatch: _langchain_langgraph.BaseChannel<{
            dispatched: number;
            queued: number;
        } | null, {
            dispatched: number;
            queued: number;
        } | _langchain_langgraph.OverwriteValue<{
            dispatched: number;
            queued: number;
        } | null> | null, unknown>;
        completedWaves: _langchain_langgraph.BaseChannel<number[], number[] | _langchain_langgraph.OverwriteValue<number[]>, unknown>;
        tokensUsed: _langchain_langgraph.BaseChannel<number, number | _langchain_langgraph.OverwriteValue<number>, unknown>;
        costUsd: _langchain_langgraph.BaseChannel<number, number | _langchain_langgraph.OverwriteValue<number>, unknown>;
        errors: _langchain_langgraph.BaseChannel<string[], string[] | _langchain_langgraph.OverwriteValue<string[]>, unknown>;
        status: _langchain_langgraph.BaseChannel<"failed" | "complete" | "planning" | "awaiting-review" | "executing" | "aborted", "failed" | "complete" | "planning" | "awaiting-review" | "executing" | "aborted" | _langchain_langgraph.OverwriteValue<"failed" | "complete" | "planning" | "awaiting-review" | "executing" | "aborted">, unknown>;
    }>>;
    finish: Partial<_langchain_langgraph.StateType<{
        itemId: {
            (annotation: _langchain_langgraph.SingleReducer<string, string>): _langchain_langgraph.BaseChannel<string, string | _langchain_langgraph.OverwriteValue<string>, unknown>;
            (): _langchain_langgraph.LastValue<string>;
            Root: <S extends _langchain_langgraph.StateDefinition>(sd: S) => _langchain_langgraph.AnnotationRoot<S>;
        };
        itemTitle: {
            (annotation: _langchain_langgraph.SingleReducer<string, string>): _langchain_langgraph.BaseChannel<string, string | _langchain_langgraph.OverwriteValue<string>, unknown>;
            (): _langchain_langgraph.LastValue<string>;
            Root: <S extends _langchain_langgraph.StateDefinition>(sd: S) => _langchain_langgraph.AnnotationRoot<S>;
        };
        repo: {
            (annotation: _langchain_langgraph.SingleReducer<string, string>): _langchain_langgraph.BaseChannel<string, string | _langchain_langgraph.OverwriteValue<string>, unknown>;
            (): _langchain_langgraph.LastValue<string>;
            Root: <S extends _langchain_langgraph.StateDefinition>(sd: S) => _langchain_langgraph.AnnotationRoot<S>;
        };
        specContent: {
            (annotation: _langchain_langgraph.SingleReducer<string, string>): _langchain_langgraph.BaseChannel<string, string | _langchain_langgraph.OverwriteValue<string>, unknown>;
            (): _langchain_langgraph.LastValue<string>;
            Root: <S extends _langchain_langgraph.StateDefinition>(sd: S) => _langchain_langgraph.AnnotationRoot<S>;
        };
        plan: _langchain_langgraph.BaseChannel<WavePlanShape | null, WavePlanShape | _langchain_langgraph.OverwriteValue<WavePlanShape | null> | null, unknown>;
        score: _langchain_langgraph.BaseChannel<PlanScoreShape | null, PlanScoreShape | _langchain_langgraph.OverwriteValue<PlanScoreShape | null> | null, unknown>;
        refinementIterations: _langchain_langgraph.BaseChannel<number, number | _langchain_langgraph.OverwriteValue<number>, unknown>;
        constraints: _langchain_langgraph.BaseChannel<string[], string[] | _langchain_langgraph.OverwriteValue<string[]>, unknown>;
        wavePlanId: _langchain_langgraph.BaseChannel<string | null, string | _langchain_langgraph.OverwriteValue<string | null> | null, unknown>;
        currentWaveIndex: _langchain_langgraph.BaseChannel<number, number | _langchain_langgraph.OverwriteValue<number>, unknown>;
        waveRetries: _langchain_langgraph.BaseChannel<number, number | _langchain_langgraph.OverwriteValue<number>, unknown>;
        lastDispatch: _langchain_langgraph.BaseChannel<{
            dispatched: number;
            queued: number;
        } | null, {
            dispatched: number;
            queued: number;
        } | _langchain_langgraph.OverwriteValue<{
            dispatched: number;
            queued: number;
        } | null> | null, unknown>;
        completedWaves: _langchain_langgraph.BaseChannel<number[], number[] | _langchain_langgraph.OverwriteValue<number[]>, unknown>;
        tokensUsed: _langchain_langgraph.BaseChannel<number, number | _langchain_langgraph.OverwriteValue<number>, unknown>;
        costUsd: _langchain_langgraph.BaseChannel<number, number | _langchain_langgraph.OverwriteValue<number>, unknown>;
        errors: _langchain_langgraph.BaseChannel<string[], string[] | _langchain_langgraph.OverwriteValue<string[]>, unknown>;
        status: _langchain_langgraph.BaseChannel<"failed" | "complete" | "planning" | "awaiting-review" | "executing" | "aborted", "failed" | "complete" | "planning" | "awaiting-review" | "executing" | "aborted" | _langchain_langgraph.OverwriteValue<"failed" | "complete" | "planning" | "awaiting-review" | "executing" | "aborted">, unknown>;
    }>>;
    fail: Partial<_langchain_langgraph.StateType<{
        itemId: {
            (annotation: _langchain_langgraph.SingleReducer<string, string>): _langchain_langgraph.BaseChannel<string, string | _langchain_langgraph.OverwriteValue<string>, unknown>;
            (): _langchain_langgraph.LastValue<string>;
            Root: <S extends _langchain_langgraph.StateDefinition>(sd: S) => _langchain_langgraph.AnnotationRoot<S>;
        };
        itemTitle: {
            (annotation: _langchain_langgraph.SingleReducer<string, string>): _langchain_langgraph.BaseChannel<string, string | _langchain_langgraph.OverwriteValue<string>, unknown>;
            (): _langchain_langgraph.LastValue<string>;
            Root: <S extends _langchain_langgraph.StateDefinition>(sd: S) => _langchain_langgraph.AnnotationRoot<S>;
        };
        repo: {
            (annotation: _langchain_langgraph.SingleReducer<string, string>): _langchain_langgraph.BaseChannel<string, string | _langchain_langgraph.OverwriteValue<string>, unknown>;
            (): _langchain_langgraph.LastValue<string>;
            Root: <S extends _langchain_langgraph.StateDefinition>(sd: S) => _langchain_langgraph.AnnotationRoot<S>;
        };
        specContent: {
            (annotation: _langchain_langgraph.SingleReducer<string, string>): _langchain_langgraph.BaseChannel<string, string | _langchain_langgraph.OverwriteValue<string>, unknown>;
            (): _langchain_langgraph.LastValue<string>;
            Root: <S extends _langchain_langgraph.StateDefinition>(sd: S) => _langchain_langgraph.AnnotationRoot<S>;
        };
        plan: _langchain_langgraph.BaseChannel<WavePlanShape | null, WavePlanShape | _langchain_langgraph.OverwriteValue<WavePlanShape | null> | null, unknown>;
        score: _langchain_langgraph.BaseChannel<PlanScoreShape | null, PlanScoreShape | _langchain_langgraph.OverwriteValue<PlanScoreShape | null> | null, unknown>;
        refinementIterations: _langchain_langgraph.BaseChannel<number, number | _langchain_langgraph.OverwriteValue<number>, unknown>;
        constraints: _langchain_langgraph.BaseChannel<string[], string[] | _langchain_langgraph.OverwriteValue<string[]>, unknown>;
        wavePlanId: _langchain_langgraph.BaseChannel<string | null, string | _langchain_langgraph.OverwriteValue<string | null> | null, unknown>;
        currentWaveIndex: _langchain_langgraph.BaseChannel<number, number | _langchain_langgraph.OverwriteValue<number>, unknown>;
        waveRetries: _langchain_langgraph.BaseChannel<number, number | _langchain_langgraph.OverwriteValue<number>, unknown>;
        lastDispatch: _langchain_langgraph.BaseChannel<{
            dispatched: number;
            queued: number;
        } | null, {
            dispatched: number;
            queued: number;
        } | _langchain_langgraph.OverwriteValue<{
            dispatched: number;
            queued: number;
        } | null> | null, unknown>;
        completedWaves: _langchain_langgraph.BaseChannel<number[], number[] | _langchain_langgraph.OverwriteValue<number[]>, unknown>;
        tokensUsed: _langchain_langgraph.BaseChannel<number, number | _langchain_langgraph.OverwriteValue<number>, unknown>;
        costUsd: _langchain_langgraph.BaseChannel<number, number | _langchain_langgraph.OverwriteValue<number>, unknown>;
        errors: _langchain_langgraph.BaseChannel<string[], string[] | _langchain_langgraph.OverwriteValue<string[]>, unknown>;
        status: _langchain_langgraph.BaseChannel<"failed" | "complete" | "planning" | "awaiting-review" | "executing" | "aborted", "failed" | "complete" | "planning" | "awaiting-review" | "executing" | "aborted" | _langchain_langgraph.OverwriteValue<"failed" | "complete" | "planning" | "awaiting-review" | "executing" | "aborted">, unknown>;
    }>>;
}, unknown, unknown, []>;
type ConductorGraph = ReturnType<typeof createConductorGraph>;

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
declare const ConductorState: _langchain_langgraph.AnnotationRoot<{
    itemId: {
        (annotation: _langchain_langgraph.SingleReducer<string, string>): _langchain_langgraph.BaseChannel<string, string | _langchain_langgraph.OverwriteValue<string>, unknown>;
        (): _langchain_langgraph.LastValue<string>;
        Root: <S extends _langchain_langgraph.StateDefinition>(sd: S) => _langchain_langgraph.AnnotationRoot<S>;
    };
    itemTitle: {
        (annotation: _langchain_langgraph.SingleReducer<string, string>): _langchain_langgraph.BaseChannel<string, string | _langchain_langgraph.OverwriteValue<string>, unknown>;
        (): _langchain_langgraph.LastValue<string>;
        Root: <S extends _langchain_langgraph.StateDefinition>(sd: S) => _langchain_langgraph.AnnotationRoot<S>;
    };
    repo: {
        (annotation: _langchain_langgraph.SingleReducer<string, string>): _langchain_langgraph.BaseChannel<string, string | _langchain_langgraph.OverwriteValue<string>, unknown>;
        (): _langchain_langgraph.LastValue<string>;
        Root: <S extends _langchain_langgraph.StateDefinition>(sd: S) => _langchain_langgraph.AnnotationRoot<S>;
    };
    specContent: {
        (annotation: _langchain_langgraph.SingleReducer<string, string>): _langchain_langgraph.BaseChannel<string, string | _langchain_langgraph.OverwriteValue<string>, unknown>;
        (): _langchain_langgraph.LastValue<string>;
        Root: <S extends _langchain_langgraph.StateDefinition>(sd: S) => _langchain_langgraph.AnnotationRoot<S>;
    };
    plan: _langchain_langgraph.BaseChannel<WavePlanShape | null, WavePlanShape | _langchain_langgraph.OverwriteValue<WavePlanShape | null> | null, unknown>;
    score: _langchain_langgraph.BaseChannel<PlanScoreShape | null, PlanScoreShape | _langchain_langgraph.OverwriteValue<PlanScoreShape | null> | null, unknown>;
    refinementIterations: _langchain_langgraph.BaseChannel<number, number | _langchain_langgraph.OverwriteValue<number>, unknown>;
    /** Constraints the conductor added at review; fed back into refinement. */
    constraints: _langchain_langgraph.BaseChannel<string[], string[] | _langchain_langgraph.OverwriteValue<string[]>, unknown>;
    wavePlanId: _langchain_langgraph.BaseChannel<string | null, string | _langchain_langgraph.OverwriteValue<string | null> | null, unknown>;
    currentWaveIndex: _langchain_langgraph.BaseChannel<number, number | _langchain_langgraph.OverwriteValue<number>, unknown>;
    /** Retries used on the CURRENT wave; reset when a wave is left behind. */
    waveRetries: _langchain_langgraph.BaseChannel<number, number | _langchain_langgraph.OverwriteValue<number>, unknown>;
    /**
     * The most recent dispatch outcome. Surfaced because a wave that dispatches
     * ZERO tasks is otherwise indistinguishable from one that dispatched fine —
     * that ambiguity hid a real bug where every task was silently queued.
     */
    lastDispatch: _langchain_langgraph.BaseChannel<{
        dispatched: number;
        queued: number;
    } | null, {
        dispatched: number;
        queued: number;
    } | _langchain_langgraph.OverwriteValue<{
        dispatched: number;
        queued: number;
    } | null> | null, unknown>;
    completedWaves: _langchain_langgraph.BaseChannel<number[], number[] | _langchain_langgraph.OverwriteValue<number[]>, unknown>;
    tokensUsed: _langchain_langgraph.BaseChannel<number, number | _langchain_langgraph.OverwriteValue<number>, unknown>;
    costUsd: _langchain_langgraph.BaseChannel<number, number | _langchain_langgraph.OverwriteValue<number>, unknown>;
    errors: _langchain_langgraph.BaseChannel<string[], string[] | _langchain_langgraph.OverwriteValue<string[]>, unknown>;
    status: _langchain_langgraph.BaseChannel<"failed" | "complete" | "planning" | "awaiting-review" | "executing" | "aborted", "failed" | "complete" | "planning" | "awaiting-review" | "executing" | "aborted" | _langchain_langgraph.OverwriteValue<"failed" | "complete" | "planning" | "awaiting-review" | "executing" | "aborted">, unknown>;
}>;
type ConductorStateType = typeof ConductorState.State;
type ConductorUpdate = Partial<ConductorStateType>;

declare function makeNodes(ports: ConductorPorts, config: ConductorConfig): {
    generate: (state: ConductorStateType) => Promise<ConductorUpdate>;
    refine: (state: ConductorStateType) => Promise<ConductorUpdate>;
    review: (state: ConductorStateType) => Promise<ConductorUpdate>;
    persist: (state: ConductorStateType) => Promise<ConductorUpdate>;
    dispatch: (state: ConductorStateType) => Promise<ConductorUpdate>;
    awaitWave: (state: ConductorStateType) => Promise<ConductorUpdate>;
    advance: (state: ConductorStateType) => Promise<ConductorUpdate>;
    retryWave: (state: ConductorStateType) => Promise<ConductorUpdate>;
    finish: (state: ConductorStateType) => Promise<ConductorUpdate>;
    fail: (state: ConductorStateType) => Promise<ConductorUpdate>;
};

export { type ConductorAgentOptions, type ConductorConfig, type ConductorEvent, type ConductorGraph, type ConductorPorts, ConductorState, type ConductorStateType, type ConductorUpdate, DEFAULT_CONFIG, type DispatchWaveResult, type GeneratePlanInput, type GeneratePlanOutput, type PlanScoreShape, type ReviewDecision, type ReviewRequest, type WaveOutcome, type WavePlanShape, createConductorGraph, makeNodes };
