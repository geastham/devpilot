/**
 * `@devpilot.sh/conductor-agent`
 *
 * The DevPilot conductor as a LangGraph agent: plan → score → refine → human
 * review → dispatch → advance, as one resumable graph.
 *
 * The graph owns control flow. Effects arrive through `ConductorPorts`, so it
 * has no dependency on DevPilot and runs anywhere six functions can be supplied.
 */

export { createConductorGraph, type ConductorAgentOptions, type ConductorGraph } from './graph';
export { ConductorState, type ConductorStateType, type ConductorUpdate } from './state';
export { makeNodes } from './nodes';
export {
  DEFAULT_CONFIG,
  type ConductorConfig,
  type ConductorPorts,
  type ConductorEvent,
  type WavePlanShape,
  type PlanScoreShape,
  type GeneratePlanInput,
  type GeneratePlanOutput,
  type DispatchWaveResult,
  type WaveOutcome,
  type ReviewRequest,
  type ReviewDecision,
} from './types';

// Re-exported so hosts can drive interrupts without depending on LangGraph
// directly — resuming a review is `graph.invoke(new Command({ resume: decision }))`.
export { Command, START, END } from '@langchain/langgraph';
