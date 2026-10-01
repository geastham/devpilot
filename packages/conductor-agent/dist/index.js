"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var index_exports = {};
__export(index_exports, {
  Command: () => import_langgraph4.Command,
  ConductorState: () => ConductorState,
  DEFAULT_CONFIG: () => DEFAULT_CONFIG,
  END: () => import_langgraph4.END,
  START: () => import_langgraph4.START,
  createConductorGraph: () => createConductorGraph,
  makeNodes: () => makeNodes
});
module.exports = __toCommonJS(index_exports);

// src/graph.ts
var import_langgraph3 = require("@langchain/langgraph");

// src/state.ts
var import_langgraph = require("@langchain/langgraph");
var ConductorState = import_langgraph.Annotation.Root({
  // --- Inputs, fixed for the run -------------------------------------------
  itemId: import_langgraph.Annotation,
  itemTitle: import_langgraph.Annotation,
  repo: import_langgraph.Annotation,
  specContent: import_langgraph.Annotation,
  // --- Planning ------------------------------------------------------------
  plan: (0, import_langgraph.Annotation)({
    reducer: (_prev, next) => next,
    default: () => null
  }),
  score: (0, import_langgraph.Annotation)({
    reducer: (_prev, next) => next,
    default: () => null
  }),
  refinementIterations: (0, import_langgraph.Annotation)({
    reducer: (_prev, next) => next,
    default: () => 0
  }),
  /** Constraints the conductor added at review; fed back into refinement. */
  constraints: (0, import_langgraph.Annotation)({
    // Appended, not replaced: a conductor who refines twice means both sets.
    reducer: (prev, next) => [...prev, ...next],
    default: () => []
  }),
  // --- Execution -----------------------------------------------------------
  wavePlanId: (0, import_langgraph.Annotation)({
    reducer: (_prev, next) => next,
    default: () => null
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
  totalWaves: (0, import_langgraph.Annotation)({
    reducer: (_prev, next) => next,
    default: () => null
  }),
  currentWaveIndex: (0, import_langgraph.Annotation)({
    reducer: (_prev, next) => next,
    default: () => 0
  }),
  /** Retries used on the CURRENT wave; reset when a wave is left behind. */
  waveRetries: (0, import_langgraph.Annotation)({
    reducer: (_prev, next) => next,
    default: () => 0
  }),
  /**
   * The most recent dispatch outcome. Surfaced because a wave that dispatches
   * ZERO tasks is otherwise indistinguishable from one that dispatched fine —
   * that ambiguity hid a real bug where every task was silently queued.
   */
  lastDispatch: (0, import_langgraph.Annotation)({
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
  waveSignal: (0, import_langgraph.Annotation)({
    reducer: (_prev, next) => next,
    default: () => null
  }),
  completedWaves: (0, import_langgraph.Annotation)({
    reducer: (prev, next) => [...prev, ...next],
    default: () => []
  }),
  // --- Accounting ----------------------------------------------------------
  tokensUsed: (0, import_langgraph.Annotation)({
    reducer: (prev, next) => prev + next,
    default: () => 0
  }),
  costUsd: (0, import_langgraph.Annotation)({
    reducer: (prev, next) => prev + next,
    default: () => 0
  }),
  errors: (0, import_langgraph.Annotation)({
    reducer: (prev, next) => [...prev, ...next],
    default: () => []
  }),
  // --- Terminal ------------------------------------------------------------
  status: (0, import_langgraph.Annotation)({
    reducer: (_prev, next) => next,
    default: () => "planning"
  })
});

// src/nodes.ts
var import_langgraph2 = require("@langchain/langgraph");
function waveCount(state) {
  return state.totalWaves ?? state.plan?.waves.length ?? 0;
}
function usableWaveCount(value) {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null;
}
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
    const decision = (0, import_langgraph2.interrupt)(request);
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
    const { wavePlanId, totalWaves } = await ports.persistPlan(
      state.plan,
      state.score,
      planInput(state)
    );
    emit({ type: "plan:approved", wavePlanId });
    return {
      wavePlanId,
      // Only a usable count is kept. Anything else — absent, zero, not a whole
      // number — leaves the graph counting the planner's waves, which is what
      // it did before a host could say.
      totalWaves: usableWaveCount(totalWaves),
      status: "executing",
      currentWaveIndex: 0
    };
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
    const outcome = known && known.state !== "in-flight" ? known : ports.waitForWave ? await ports.waitForWave(state.wavePlanId, state.currentWaveIndex) : (0, import_langgraph2.interrupt)({
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
    emit({ type: "run:complete", waves: waveCount(state) });
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
    return state.currentWaveIndex < waveCount(state) ? "dispatch" : "finish";
  }
  const graph = new import_langgraph3.StateGraph(ConductorState).addNode("generate", n.generate).addNode("refine", n.refine).addNode("review", n.review).addNode("persist", n.persist).addNode("dispatch", n.dispatch).addNode("awaitWave", n.awaitWave).addNode("advance", n.advance).addNode("retryWave", n.retryWave).addNode("finish", n.finish).addNode("fail", n.fail).addConditionalEdges(import_langgraph3.START, entry, ["generate", "dispatch"]).addConditionalEdges("generate", afterPlanning, ["refine", "review", "persist"]).addConditionalEdges("refine", afterPlanning, ["refine", "review", "persist"]).addConditionalEdges("review", afterReview, ["persist", "refine", "fail"]).addEdge("persist", "dispatch").addEdge("dispatch", "awaitWave").addConditionalEdges("awaitWave", afterWave, [
    "dispatch",
    "advance",
    "retryWave",
    "fail",
    "finish"
  ]).addEdge("retryWave", "dispatch").addConditionalEdges("advance", afterAdvance, ["dispatch", "finish"]).addEdge("finish", import_langgraph3.END).addEdge("fail", import_langgraph3.END);
  return graph.compile({ checkpointer: options.checkpointer });
}

// src/index.ts
var import_langgraph4 = require("@langchain/langgraph");
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  Command,
  ConductorState,
  DEFAULT_CONFIG,
  END,
  START,
  createConductorGraph,
  makeNodes
});
//# sourceMappingURL=index.js.map