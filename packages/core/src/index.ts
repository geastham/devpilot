// Main package exports
export * from './db';

// Wave Planner
export * as wavePlanner from './wave-planner';

// Integrations
export * as linear from './integrations/linear';

// Orchestrator bridge
export * as orchestrator from './orchestrator';

// Wiki - LLM-compiled knowledge base
export * as wiki from './wiki';

// MemPalace - structured, temporal, hierarchical memory layer
// that augments (never replaces) the Wiki.
export * as mempalace from './mempalace';

// Conductor Score model — the single declaration of dimension maxima (TRD 16)
export * as score from './score';

// Version
export const VERSION = '0.1.0';
