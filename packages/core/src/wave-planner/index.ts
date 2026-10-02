// Wave Planner - Barrel Export
// Parallelization-aware plan optimization, execution & storage

// Core types
export * from './types';

// Utilities
export * from './utils';

// Parser
export * from './parser';

// DAG validation
export * from './dag-validator';

// Critical path computation
export * from './critical-path';

// Wave assignment
export * from './wave-assigner';

// Plan scoring
export * from './plan-scorer';

// Code graph → blast radius and the assigner's dependent claims (TRD 27)
export * from './plan-code-graph';

// Model IDs (single source of truth — see models.ts on why)
export * from './models';

// AI client
export * from './ai-client';

// Fallback logic
export * from './fallback';

// Context services
export * from './fleet-context';
export * from './codebase-context';

// Prompt construction
export * from './prompt-constructor';

// Plan refinement
export * from './plan-refinement-service';

// Wave plan generation
export * from './generator';

// The planner's record of itself, and the join to how each plan turned out
export * from './trace';
export * from './planner-corpus';

// Plan projection (deterministic wave-plan → plans/workstreams/tasks projection)
export * from './plan-projection';

// Ticket description (bounding + escaping the untrusted ticket body)
export * from './ticket-description';

// Prompt templates
export * from './prompt-templates';

// Work history — what past tasks did to a file (TRD 27 §4, the L2 layer)
export * from './work-history';

// Execution
export * from './execution';
