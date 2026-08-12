import { StateGraph, START, END } from '@langchain/langgraph';
import type { BaseCheckpointSaver } from '@langchain/langgraph';
import { ConductorState, type ConductorStateType } from './state';
import { makeNodes } from './nodes';
import { DEFAULT_CONFIG, type ConductorConfig, type ConductorPorts } from './types';

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
export interface ConductorAgentOptions {
  ports: ConductorPorts;
  config?: Partial<ConductorConfig>;
  /**
   * Required for `interrupt()` to survive a process restart. Without one the
   * graph still interrupts, but only within a single live run.
   */
  checkpointer?: BaseCheckpointSaver;
}

export function createConductorGraph(options: ConductorAgentOptions) {
  const config: ConductorConfig = { ...DEFAULT_CONFIG, ...options.config };
  const n = makeNodes(options.ports, config);

  /**
   * Entry: plan from scratch, or adopt one that already exists.
   *
   * A host with an approved, persisted plan — a migration from an older
   * execution path, or a run being restarted — should not be forced to
   * regenerate it just to reach the dispatch loop. Supplying `plan` and
   * `wavePlanId` at invoke time enters at `dispatch`.
   */
  function entry(state: ConductorStateType): 'generate' | 'dispatch' {
    return state.plan && state.wavePlanId ? 'dispatch' : 'generate';
  }

  /** After scoring: refine, or move on to review. */
  function afterPlanning(state: ConductorStateType): 'refine' | 'review' | 'persist' {
    const score = state.score?.parallelizationScore ?? 0;
    const canRefine = state.refinementIterations < config.maxRefinementIterations;

    if (score < config.minParallelizationScore && canRefine) return 'refine';
    // Skipping review means dispatching a plan no human has seen — allowed, but
    // only because a host explicitly asked for it.
    return config.requireReview ? 'review' : 'persist';
  }

  /** After the review interrupt resolves. */
  function afterReview(state: ConductorStateType): 'persist' | 'refine' | 'fail' {
    if (state.status === 'aborted') return 'fail';
    // The conductor asked for changes: their constraints are in state now, and
    // the refinement budget is deliberately NOT reset — a human who keeps
    // rejecting should hit review again, not spin the model indefinitely.
    if (state.status === 'planning') return 'refine';
    return 'persist';
  }

  /** After a wave settles: next wave, retry, or stop. */
  function afterWave(
    state: ConductorStateType
  ): 'advance' | 'retryWave' | 'fail' | 'finish' {
    const failed = !state.completedWaves.includes(state.currentWaveIndex);

    if (failed) {
      if (state.waveRetries < config.waveRetryLimit) return 'retryWave';
      if (config.failurePolicy === 'halt') return 'fail';
      // `continue` policy: a failed wave still advances. Downstream tasks may
      // depend on it, which is why this is not the default.
      return 'advance';
    }

    return 'advance';
  }

  /** After advancing: another wave, or done. */
  function afterAdvance(state: ConductorStateType): 'dispatch' | 'finish' {
    const total = state.plan?.waves.length ?? 0;
    return state.currentWaveIndex < total ? 'dispatch' : 'finish';
  }

  const graph = new StateGraph(ConductorState)
    .addNode('generate', n.generate)
    .addNode('refine', n.refine)
    .addNode('review', n.review)
    .addNode('persist', n.persist)
    .addNode('dispatch', n.dispatch)
    .addNode('awaitWave', n.awaitWave)
    .addNode('advance', n.advance)
    .addNode('retryWave', n.retryWave)
    .addNode('finish', n.finish)
    .addNode('fail', n.fail)

    .addConditionalEdges(START, entry, ['generate', 'dispatch'])
    .addConditionalEdges('generate', afterPlanning, ['refine', 'review', 'persist'])
    .addConditionalEdges('refine', afterPlanning, ['refine', 'review', 'persist'])
    .addConditionalEdges('review', afterReview, ['persist', 'refine', 'fail'])
    .addEdge('persist', 'dispatch')
    .addEdge('dispatch', 'awaitWave')
    .addConditionalEdges('awaitWave', afterWave, ['advance', 'retryWave', 'fail', 'finish'])
    .addEdge('retryWave', 'dispatch')
    .addConditionalEdges('advance', afterAdvance, ['dispatch', 'finish'])
    .addEdge('finish', END)
    .addEdge('fail', END);

  return graph.compile({ checkpointer: options.checkpointer });
}

export type ConductorGraph = ReturnType<typeof createConductorGraph>;
