// src/graph.ts
import { StateGraph, START, END } from "@langchain/langgraph";

// src/state.ts
import { Annotation } from "@langchain/langgraph";
var ConductorState = Annotation.Root({
  // --- Inputs, fixed for the run -------------------------------------------
  itemId: Annotation,
  itemTitle: Annotation,
  repo: Annotation,
  specContent: Annotation,
  // --- Planning ------------------------------------------------------------
  plan: Annotation({
    reducer: (_prev, next) => next,
    default: () => null
  }),
  score: Annotation({
    reducer: (_prev, next) => next,
    default: () => null
  }),
  refinementIterations: Annotation({
    reducer: (_prev, next) => next,
    default: () => 0
  }),
  /** Constraints the conductor added at review; fed back into refinement. */
  constraints: Annotation({
    // Appended, not replaced: a conductor who refines twice means both sets.
    reducer: (prev, next) => [...prev, ...next],
    default: () => []
  }),
  // --- Execution -----------------------------------------------------------
  wavePlanId: Annotation({
    reducer: (_prev, next) => next,
    default: () => null
  }),
  currentWaveIndex: Annotation({
    reducer: (_prev, next) => next,
    default: () => 0
  }),
  /** Retries used on the CURRENT wave; reset when a wave is left behind. */
  waveRetries: Annotation({
    reducer: (_prev, next) => next,
    default: () => 0
  }),
  /**
   * The most recent dispatch outcome. Surfaced because a wave that dispatches
   * ZERO tasks is otherwise indistinguishable from one that dispatched fine —
   * that ambiguity hid a real bug where every task was silently queued.
   */
  lastDispatch: Annotation({
    reducer: (_prev, next) => next,
    default: () => null
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
  waveSignal: Annotation({
    reducer: (_prev, next) => next,
    default: () => null
  }),
  completedWaves: Annotation({
    reducer: (prev, next) => [...prev, ...next],
    default: () => []
  }),
  // --- Accounting ----------------------------------------------------------
  tokensUsed: Annotation({
    reducer: (prev, next) => prev + next,
    default: () => 0
  }),
  costUsd: Annotation({
    reducer: (prev, next) => prev + next,
    default: () => 0
  }),
  errors: Annotation({
    reducer: (prev, next) => [...prev, ...next],
    default: () => []
  }),
  // --- Terminal ------------------------------------------------------------
  status: Annotation({
    reducer: (_prev, next) => next,
    default: () => "planning"
  })
});

// src/nodes.ts
import { interrupt } from "@langchain/langgraph";
function planInput(state) {
  return {
    itemId: state.itemId,
    itemTitle: state.itemTitle,
    repo: state.repo,
    specContent: state.specContent,
    constraints: state.constraints
  };
}
function makeNodes(ports, config) {
  const emit = (event) => ports.onEvent?.(event);
  async function generate(state) {
    const result = await ports.generatePlan(planInput(state));
    const score = await ports.scorePlan(result.plan);
    emit({ type: "plan:generated", iterations: 1, score: score.parallelizationScore });
    return {
      plan: result.plan,
      score,
      refinementIterations: 1,
      tokensUsed: result.tokensUsed ?? 0,
      costUsd: result.costUsd ?? 0,
      status: "planning"
    };
  }
  async function refine(state) {
    const result = await ports.refinePlan({
      ...planInput(state),
      previousPlan: state.plan ?? void 0,
      previousScore: state.score ?? void 0
    });
    const score = await ports.scorePlan(result.plan);
    const improved = score.parallelizationScore > (state.score?.parallelizationScore ?? -Infinity);
    emit({
      type: "plan:refined",
      iterations: state.refinementIterations + 1,
      score: score.parallelizationScore,
      improved
    });
    return {
      plan: improved ? result.plan : state.plan,
      score: improved ? score : state.score,
      refinementIterations: state.refinementIterations + 1,
      tokensUsed: result.tokensUsed ?? 0,
      costUsd: result.costUsd ?? 0
    };
  }
  async function review(state) {
    const request = {
      itemId: state.itemId,
      itemTitle: state.itemTitle,
      plan: state.plan,
      score: state.score,
      refinementIterations: state.refinementIterations,
      belowThreshold: (state.score?.parallelizationScore ?? 0) < config.minParallelizationScore
    };
    const decision = interrupt(request);
    if (decision.action === "abort") {
      emit({ type: "plan:aborted", reason: decision.reason });
      return {
        status: "aborted",
        errors: decision.reason ? [decision.reason] : ["aborted at review"]
      };
    }
    if (decision.action === "refine") {
      return { constraints: decision.constraints, status: "planning" };
    }
    return { status: "executing" };
  }
  async function persist(state) {
    const { wavePlanId } = await ports.persistPlan(
      state.plan,
      state.score,
      planInput(state)
    );
    emit({ type: "plan:approved", wavePlanId });
    return { wavePlanId, status: "executing", currentWaveIndex: 0 };
  }
  async function dispatch(state) {
    const backfill = state.waveSignal?.state === "in-flight";
    const result = await ports.dispatchWave(state.wavePlanId, state.currentWaveIndex);
    emit({
      type: "wave:dispatched",
      waveIndex: state.currentWaveIndex,
      dispatched: result.dispatched,
      queued: result.queued,
      ...backfill ? { backfill: true } : {}
    });
    return {
      // A run that is dispatching is executing. `persist` says so too, but a run
      // that ADOPTS an existing plan enters here without passing through it, and
      // reported `planning` for its whole life — so anything that narrates an
      // executing run (DevPilot's bridge watcher does) said nothing about it.
      status: "executing",
      lastDispatch: { dispatched: result.dispatched, queued: result.queued },
      waveSignal: result.settled ?? null,
      errors: result.errors.map((e) => `wave ${state.currentWaveIndex} ${e.taskCode}: ${e.error}`)
    };
  }
  async function awaitWave(state) {
    const known = state.waveSignal;
    const outcome = known && known.state !== "in-flight" ? known : ports.waitForWave ? await ports.waitForWave(state.wavePlanId, state.currentWaveIndex) : interrupt({
      wavePlanId: state.wavePlanId,
      waveIndex: state.currentWaveIndex
    });
    if (outcome.state === "in-flight") {
      return { waveSignal: outcome };
    }
    if (outcome.state === "complete") {
      emit({ type: "wave:complete", waveIndex: state.currentWaveIndex });
      return { waveSignal: outcome, completedWaves: [state.currentWaveIndex] };
    }
    emit({
      type: "wave:failed",
      waveIndex: state.currentWaveIndex,
      failures: outcome.failures.length
    });
    return {
      waveSignal: outcome,
      errors: outcome.failures.map(
        (f) => `wave ${state.currentWaveIndex} ${f.taskCode}: ${f.error}`
      )
    };
  }
  async function advance(state) {
    return { currentWaveIndex: state.currentWaveIndex + 1, waveRetries: 0 };
  }
  async function retryWave(state) {
    return { waveRetries: state.waveRetries + 1 };
  }
  async function finish(state) {
    if (state.wavePlanId) {
      await ports.endRun?.(state.wavePlanId, { status: "complete" });
    }
    emit({ type: "run:complete", waves: state.plan?.waves.length ?? 0 });
    return { status: "complete" };
  }
  async function fail(state) {
    const reason = state.errors[state.errors.length - 1] ?? "unknown failure";
    if (state.wavePlanId) {
      await ports.endRun?.(state.wavePlanId, { status: "failed", reason });
    }
    emit({ type: "run:failed", reason });
    return { status: "failed" };
  }
  return { generate, refine, review, persist, dispatch, awaitWave, advance, retryWave, finish, fail };
}

// src/types.ts
var DEFAULT_CONFIG = {
  minParallelizationScore: 0.7,
  maxRefinementIterations: 3,
  requireReview: true,
  failurePolicy: "halt",
  waveRetryLimit: 1
};

// src/graph.ts
function createConductorGraph(options) {
  const config = { ...DEFAULT_CONFIG, ...options.config };
  const n = makeNodes(options.ports, config);
  function entry(state) {
    return state.plan && state.wavePlanId ? "dispatch" : "generate";
  }
  function afterPlanning(state) {
    const score = state.score?.parallelizationScore ?? 0;
    const canRefine = state.refinementIterations < config.maxRefinementIterations;
    if (score < config.minParallelizationScore && canRefine) return "refine";
    return config.requireReview ? "review" : "persist";
  }
  function afterReview(state) {
    if (state.status === "aborted") return "fail";
    if (state.status === "planning") return "refine";
    return "persist";
  }
  function afterWave(state) {
    if (state.waveSignal?.state === "in-flight") return "dispatch";
    const failed = state.waveSignal?.state !== "complete";
    if (failed) {
      if (state.waveRetries < config.waveRetryLimit) return "retryWave";
      if (config.failurePolicy === "halt") return "fail";
      return "advance";
    }
    return "advance";
  }
  function afterAdvance(state) {
    const total = state.plan?.waves.length ?? 0;
    return state.currentWaveIndex < total ? "dispatch" : "finish";
  }
  const graph = new StateGraph(ConductorState).addNode("generate", n.generate).addNode("refine", n.refine).addNode("review", n.review).addNode("persist", n.persist).addNode("dispatch", n.dispatch).addNode("awaitWave", n.awaitWave).addNode("advance", n.advance).addNode("retryWave", n.retryWave).addNode("finish", n.finish).addNode("fail", n.fail).addConditionalEdges(START, entry, ["generate", "dispatch"]).addConditionalEdges("generate", afterPlanning, ["refine", "review", "persist"]).addConditionalEdges("refine", afterPlanning, ["refine", "review", "persist"]).addConditionalEdges("review", afterReview, ["persist", "refine", "fail"]).addEdge("persist", "dispatch").addEdge("dispatch", "awaitWave").addConditionalEdges("awaitWave", afterWave, [
    "dispatch",
    "advance",
    "retryWave",
    "fail",
    "finish"
  ]).addEdge("retryWave", "dispatch").addConditionalEdges("advance", afterAdvance, ["dispatch", "finish"]).addEdge("finish", END).addEdge("fail", END);
  return graph.compile({ checkpointer: options.checkpointer });
}

// src/index.ts
import { Command, START as START2, END as END2 } from "@langchain/langgraph";
export {
  Command,
  ConductorState,
  DEFAULT_CONFIG,
  END2 as END,
  START2 as START,
  createConductorGraph,
  makeNodes
};
//# sourceMappingURL=index.mjs.map