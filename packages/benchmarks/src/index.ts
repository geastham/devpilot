/**
 * DevPilot Benchmark Suite
 *
 * Compare baseline vs orchestrated AI coding performance.
 *
 * @packageDocumentation
 */

// =============================================================================
// Type Exports
// =============================================================================

export * from './types';

// =============================================================================
// Configuration
// =============================================================================

export {
  BenchmarkConfigSchema,
  BenchmarkIdSchema,
  ScenarioTypeSchema,
  ModelTierSchema,
  ModelPricingSchema,
  RunConfigSchema,
  DEFAULT_MODEL_PRICING,
  SCORING_CONSTANTS,
  defineConfig,
  loadConfig,
  getModelPricing,
  toRunConfig,
  loadEnvConfig,
  mergeConfig,
  type BenchmarkConfig,
} from './config';

// =============================================================================
// Metrics
// =============================================================================

export {
  TokenTracker,
  createTokenTracker,
  parseTokenUsage,
} from './metrics/token-tracker';

export {
  CostCalculator,
  createCostCalculator,
} from './metrics/cost-calculator';

export {
  TimelineRecorder,
  createTimelineRecorder,
} from './metrics/timeline';

export {
  MetricsCollector,
  createMetricsCollector,
} from './metrics/collector';

// =============================================================================
// Storage
// =============================================================================

export {
  getVersionInfo,
  sanitizeVersionForPath,
  createTimestampPath,
  parseTimestampPath,
} from './storage/version-tagger';

export {
  ResultsWriter,
  createResultsWriter,
} from './storage/results-writer';

export {
  HistoryReader,
  createHistoryReader,
} from './storage/history-reader';

// =============================================================================
// Analysis
// =============================================================================

export {
  ScoringEngine,
  createScoringEngine,
  calculateScore,
  DEFAULT_WEIGHTS,
} from './analysis/scoring';

export {
  WaveAnalyzer,
  createWaveAnalyzer,
  analyzeWavePlan,
} from './analysis/wave-analyzer';

export {
  Comparator,
  createComparator,
  compareScenarios,
} from './analysis/comparator';

export {
  TrendAnalyzer,
  createTrendAnalyzer,
  analyzeTrends,
} from './analysis/trend';

// =============================================================================
// Reporters
// =============================================================================

export {
  JsonReporter,
  createJsonReporter,
} from './reporters/json';

export {
  MarkdownReporter,
  createMarkdownReporter,
} from './reporters/markdown';

export {
  ConsoleReporter,
  createConsoleReporter,
} from './reporters/console';

// =============================================================================
// Runner
// =============================================================================

export {
  BenchmarkRunner,
  createBenchmarkRunner,
  ProcessManager,
  createProcessManager,
  WorkspaceManager,
  createWorkspaceManager,
  AcceptanceRunner,
  createAcceptanceRunner,
  BaselineExecutor,
  createBaselineExecutor,
  DevPilotExecutor,
  createDevPilotExecutor,
} from './runner';
