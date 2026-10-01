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
/** How a wave that is over ended. */
type SettledWaveOutcome = {
    state: 'complete';
} | {
    state: 'failed';
    failures: Array<{
        taskCode: string;
        error: string;
    }>;
};
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
type WaveOutcome = SettledWaveOutcome | {
    state: 'in-flight';
};
interface DispatchWaveResult {
    dispatched: number;
    queued: number;
    errors: Array<{
        taskCode: string;
        error: string;
    }>;
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
type RunResult = {
    status: 'complete';
} | {
    status: 'failed';
    reason: string;
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
    /** True when this pass re-entered a wave already in flight (`in-flight`). */
    backfill?: boolean;
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
 *                                          │                  ├─(failed)─▶ retry? ─┬─▶ dispatch
 *                                          ├──────────────────│────────────────────┘   └─▶ fail (halt)
 *                                          └──(in-flight)─────┘
 *
 * `dispatch` is the only node that starts agents, for the first pass over a
 * wave and for every later one: a wave too large for the host's concurrency cap
 * is drained by `in-flight` signals sending the run back through it, not by the
 * host dispatching on the side.
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
    waveSignal: WaveOutcome | null;
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
    waveSignal?: WaveOutcome | _langchain_langgraph.OverwriteValue<WaveOutcome | null> | null | undefined;
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
    waveSignal: _langchain_langgraph.BaseChannel<WaveOutcome | null, WaveOutcome | _langchain_langgraph.OverwriteValue<WaveOutcome | null> | null, unknown>;
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
    waveSignal: _langchain_langgraph.BaseChannel<WaveOutcome | null, WaveOutcome | _langchain_langgraph.OverwriteValue<WaveOutcome | null> | null, unknown>;
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
        waveSignal: _langchain_langgraph.BaseChannel<WaveOutcome | null, WaveOutcome | _langchain_langgraph.OverwriteValue<WaveOutcome | null> | null, unknown>;
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
        waveSignal: _langchain_langgraph.BaseChannel<WaveOutcome | null, WaveOutcome | _langchain_langgraph.OverwriteValue<WaveOutcome | null> | null, unknown>;
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
        waveSignal: _langchain_langgraph.BaseChannel<WaveOutcome | null, WaveOutcome | _langchain_langgraph.OverwriteValue<WaveOutcome | null> | null, unknown>;
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
        waveSignal: _langchain_langgraph.BaseChannel<WaveOutcome | null, WaveOutcome | _langchain_langgraph.OverwriteValue<WaveOutcome | null> | null, unknown>;
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
        waveSignal: _langchain_langgraph.BaseChannel<WaveOutcome | null, WaveOutcome | _langchain_langgraph.OverwriteValue<WaveOutcome | null> | null, unknown>;
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
        waveSignal: _langchain_langgraph.BaseChannel<WaveOutcome | null, WaveOutcome | _langchain_langgraph.OverwriteValue<WaveOutcome | null> | null, unknown>;
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
        waveSignal: _langchain_langgraph.BaseChannel<WaveOutcome | null, WaveOutcome | _langchain_langgraph.OverwriteValue<WaveOutcome | null> | null, unknown>;
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
        waveSignal: _langchain_langgraph.BaseChannel<WaveOutcome | null, WaveOutcome | _langchain_langgraph.OverwriteValue<WaveOutcome | null> | null, unknown>;
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
        waveSignal: _langchain_langgraph.BaseChannel<WaveOutcome | null, WaveOutcome | _langchain_langgraph.OverwriteValue<WaveOutcome | null> | null, unknown>;
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
        waveSignal: _langchain_langgraph.BaseChannel<WaveOutcome | null, WaveOutcome | _langchain_langgraph.OverwriteValue<WaveOutcome | null> | null, unknown>;
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
    waveSignal: _langchain_langgraph.BaseChannel<WaveOutcome | null, WaveOutcome | _langchain_langgraph.OverwriteValue<WaveOutcome | null> | null, unknown>;
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

export { type ConductorAgentOptions, type ConductorConfig, type ConductorEvent, type ConductorGraph, type ConductorPorts, ConductorState, type ConductorStateType, type ConductorUpdate, DEFAULT_CONFIG, type DispatchWaveResult, type GeneratePlanInput, type GeneratePlanOutput, type PlanScoreShape, type ReviewDecision, type ReviewRequest, type RunResult, type SettledWaveOutcome, type WaveOutcome, type WavePlanShape, createConductorGraph, makeNodes };
