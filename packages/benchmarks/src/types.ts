/**
 * DevPilot Benchmark Suite - Type Definitions
 *
 * All type definitions for the benchmark suite, organized by domain.
 */

// =============================================================================
// Benchmark Identifiers
// =============================================================================

/** Known benchmark project identifiers */
export type BenchmarkId = '01-forgepress' | '02-taskforge' | '03-insightboard';

/** Execution scenario types */
export type ScenarioType = 'baseline' | 'devpilot';

/** Model tiers for Claude */
export type ModelTier = 'haiku' | 'sonnet' | 'opus';

// =============================================================================
// Run Configuration
// =============================================================================

export interface RunConfig {
  /** Benchmark IDs to run */
  benchmarks: BenchmarkId[];
  /** Scenarios to execute */
  scenarios: ScenarioType[];
  /** Number of iterations per scenario */
  iterations: number;
  /** Run benchmarks in parallel */
  parallel: boolean;
  /** Per-scenario timeout in milliseconds */
  timeoutMs: number;
  /** Archive workspaces after execution */
  archiveWorkspaces: boolean;
  /** Output directory for results */
  outputDir: string;
  /** Override version tag */
  versionTag?: string;
  /** Max concurrent sessions for DevPilot scenario */
  maxConcurrentSessions: number;
  /** Model for baseline scenario */
  baselineModel: ModelTier;
  /** Dry run mode - validate only */
  dryRun: boolean;
}

// =============================================================================
// Benchmark Run
// =============================================================================

export type BenchmarkRunStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface BenchmarkRun {
  /** Unique run identifier (cuid2) */
  id: string;
  /** Benchmark being run */
  benchmarkId: BenchmarkId;
  /** DevPilot version string */
  devpilotVersion: string;
  /** Git commit SHA */
  gitCommit: string;
  /** Git tag if on a tag */
  gitTag?: string;
  /** ISO 8601 timestamp */
  timestamp: string;
  /** Configuration used for this run */
  config: RunConfig;
  /** Scenario results */
  scenarios: {
    baseline: ScenarioResult | null;
    devpilot: ScenarioResult | null;
  };
  /** Computed comparison */
  comparison: ComparisonResult | null;
  /** Composite score */
  compositeScore: CompositeScore | null;
}

// =============================================================================
// Scenario Result
// =============================================================================

export type ScenarioStatus =
  | 'pending'
  | 'preparing'
  | 'running'
  | 'testing'
  | 'completed'
  | 'failed'
  | 'timeout';

export interface ScenarioResult {
  /** Scenario type */
  scenario: ScenarioType;
  /** Execution status */
  status: ScenarioStatus;

  // Timing
  /** ISO 8601 start time */
  startedAt: string;
  /** ISO 8601 completion time */
  completedAt: string;
  /** Total wall clock time in milliseconds */
  wallClockMs: number;

  // Token metrics
  /** Total input tokens */
  totalTokensInput: number;
  /** Total output tokens */
  totalTokensOutput: number;
  /** Total tokens (input + output) */
  totalTokens: number;
  /** Cache read tokens */
  cacheReadTokens: number;
  /** Cache write tokens */
  cacheWriteTokens: number;

  // Cost metrics
  /** Total cost in USD */
  totalCostUsd: number;
  /** Cost breakdown by session */
  costBreakdown: CostEntry[];

  // Quality metrics
  /** Acceptance test results */
  acceptanceResults: AcceptanceResult;
  /** First attempt pass rate (0.0 - 1.0) */
  firstAttemptPassRate: number;

  // Planning (DevPilot scenario only)
  /** Generated wave plan */
  wavePlan?: WavePlan;
  /** Wave execution log */
  waveExecutionLog?: WaveExecution[];
  /** Rework ratio (total edits / minimum required creates) */
  reworkRatio?: number;

  // Execution detail
  /** Individual session records */
  sessions: SessionRecord[];
  /** Ordered execution timeline */
  timeline: TimelineEvent[];
  /** Execution errors */
  errors: ExecutionError[];

  // Output artifacts
  /** Created files */
  filesCreated: string[];
  /** Modified files */
  filesModified: string[];
}

// =============================================================================
// Token & Cost Metrics
// =============================================================================

export interface TokenUsage {
  /** Input tokens */
  inputTokens: number;
  /** Output tokens */
  outputTokens: number;
  /** Cache read tokens */
  cacheReadTokens: number;
  /** Cache write tokens */
  cacheWriteTokens: number;
  /** Total tokens */
  totalTokens: number;
}

export interface ModelPricing {
  /** Model identifier */
  model: string;
  /** USD per 1M input tokens */
  inputPer1M: number;
  /** USD per 1M output tokens */
  outputPer1M: number;
  /** USD per 1M cache read tokens */
  cacheReadPer1M: number;
  /** USD per 1M cache write tokens */
  cacheWritePer1M: number;
}

export interface CostEntry {
  /** Session ID */
  sessionId: string;
  /** Model used */
  model: string;
  /** Token usage */
  tokens: TokenUsage;
  /** Cost in USD */
  costUsd: number;
  /** Breakdown */
  breakdown: {
    inputCost: number;
    outputCost: number;
    cacheReadCost: number;
    cacheWriteCost: number;
  };
}

// =============================================================================
// Wave Planning (DevPilot Scenario)
// =============================================================================

export interface WavePlan {
  /** Wave definitions */
  waves: Wave[];
  /** Estimated critical path duration in ms */
  criticalPathMs: number;
  /** Peak concurrent sessions */
  maxParallelism: number;
  /** Total tasks across all waves */
  totalTasks: number;
}

export interface Wave {
  /** Wave number (1-indexed) */
  waveNumber: number;
  /** Tasks in this wave */
  tasks: PlannedTask[];
  /** Wave numbers this depends on */
  dependsOn: number[];
  /** Estimated duration in ms */
  estimatedDurationMs: number;
}

export interface PlannedTask {
  /** Task ID */
  id: string;
  /** Human-readable name */
  name: string;
  /** Files this task will create/modify */
  files: string[];
  /** Prompt to send to Claude Code */
  prompt: string;
  /** Model to use */
  model: ModelTier;
  /** Task IDs this depends on */
  dependsOn: string[];
  /** Estimated duration in ms */
  estimatedDurationMs: number;
}

export interface WaveExecution {
  /** Wave number */
  waveNumber: number;
  /** Planned task count */
  plannedTasks: number;
  /** Completed task count */
  completedTasks: number;
  /** Failed task count */
  failedTasks: number;
  /** ISO 8601 start time */
  startedAt: string;
  /** ISO 8601 completion time */
  completedAt: string;
  /** Wall clock time in ms */
  wallClockMs: number;
  /** Session records for this wave */
  sessions: SessionRecord[];
  /** Actual parallelism achieved */
  parallelismActual: number;
  /** Time where agent slots sat unused in ms */
  idleTimeMs: number;
}

// =============================================================================
// Session Records
// =============================================================================

export interface SessionRecord {
  /** Session ID */
  sessionId: string;
  /** Scenario type */
  scenario: ScenarioType;
  /** Wave number (DevPilot only) */
  waveNumber?: number;
  /** Task ID (DevPilot only) */
  taskId?: string;
  /** Model used */
  model: string;
  /** Prompt sent */
  prompt: string;
  /** ISO 8601 start time */
  startedAt: string;
  /** ISO 8601 completion time */
  completedAt?: string;
  /** Duration in ms */
  durationMs: number;
  /** Input tokens */
  tokensInput: number;
  /** Output tokens */
  tokensOutput: number;
  /** Cache read tokens */
  cacheReadTokens: number;
  /** Cache write tokens */
  cacheWriteTokens: number;
  /** Cost in USD */
  costUsd: number;
  /** Files created */
  filesCreated: string[];
  /** Files modified */
  filesModified: string[];
  /** Success flag */
  success: boolean;
  /** Error message if failed */
  error?: string;
  /** Raw stdout */
  stdout?: string;
  /** Raw stderr */
  stderr?: string;
}

// =============================================================================
// Timeline Events
// =============================================================================

export type TimelineEventType =
  | 'run_start'
  | 'scenario_start'
  | 'wave_start'
  | 'session_start'
  | 'session_progress'
  | 'session_complete'
  | 'session_error'
  | 'wave_complete'
  | 'acceptance_start'
  | 'acceptance_complete'
  | 'scenario_complete'
  | 'run_complete';

export interface TimelineEvent {
  /** ISO 8601 timestamp */
  timestamp: string;
  /** Event type */
  eventType: TimelineEventType;
  /** Session ID if applicable */
  sessionId?: string;
  /** Wave number if applicable */
  waveNumber?: number;
  /** Additional event data */
  data: Record<string, unknown>;
}

// =============================================================================
// Acceptance Testing
// =============================================================================

export interface AcceptanceResult {
  /** Total test count */
  totalTests: number;
  /** Passed test count */
  passed: number;
  /** Failed test count */
  failed: number;
  /** Pass rate (0.0 - 1.0) */
  passRate: number;
  /** Individual test details */
  details: AcceptanceTest[];
  /** Raw script output */
  scriptOutput: string;
}

export interface AcceptanceTest {
  /** Test name */
  name: string;
  /** Pass/fail status */
  status: 'pass' | 'fail';
  /** Test output if any */
  output?: string;
}

// =============================================================================
// Comparison & Scoring
// =============================================================================

export interface ComparisonResult {
  /** Speedup factor (baseline / devpilot wall clock) */
  speedup: number;
  /** Cost reduction (1 - devpilot/baseline) */
  costReduction: number;
  /** Time reduction in ms */
  timeReductionMs: number;
  /** Time reduction percentage */
  timeReductionPercent: number;
  /** Cost reduction in USD */
  costReductionUsd: number;
  /** Quality delta (devpilot pass rate - baseline pass rate) */
  qualityDelta: number;
  /** Token efficiency (baseline tokens / devpilot tokens) */
  tokenEfficiency: number;
  /** Wave plan score (0-25) */
  wavePlanScore: number;
  /** Overall composite advantage */
  compositeAdvantage: number;
}

export interface CompositeScore {
  /** Total score (0-100) */
  total: number;
  /** Score breakdown */
  breakdown: {
    /** Acceptance tests (30% weight) */
    acceptanceTests: ScoreComponent;
    /** Wave plan quality (25% weight) */
    wavePlanQuality: ScoreComponent;
    /** First attempt pass rate (20% weight) */
    firstAttemptPassRate: ScoreComponent;
    /** Completion time (15% weight) */
    completionTime: ScoreComponent;
    /** Rework ratio (10% weight) */
    reworkRatio: ScoreComponent;
  };
  /** Letter grade */
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
}

export interface ScoreComponent {
  /** Raw value before normalization */
  raw: number;
  /** Normalized value (0-100) */
  normalized: number;
  /** Weighted value */
  weighted: number;
  /** Weight applied (0-1) */
  weight: number;
}

// =============================================================================
// Wave Analysis
// =============================================================================

export interface WaveAnalysis {
  /** Ground truth wave count */
  groundTruthWaves: number;
  /** Generated wave count */
  generatedWaves: number;
  /** Task placement accuracy (0-1) */
  taskPlacementAccuracy: number;
  /** Dependency violations */
  dependencyViolations: string[];
  /** Missed parallelism opportunities */
  missedParallelism: string[];
  /** Unnecessary sequencing */
  unnecessarySequencing: string[];
  /** Edit distance between plans */
  editDistance: number;
  /** Wave plan score (0-25) */
  score: number;
}

// =============================================================================
// Trend Analysis
// =============================================================================

export interface TrendAnalysis {
  /** Benchmark ID */
  benchmarkId: BenchmarkId;
  /** Historical data points */
  versions: VersionDataPoint[];
  /** Trend directions */
  trends: {
    speedupTrend: TrendDirection;
    costTrend: TrendDirection;
    qualityTrend: TrendDirection;
  };
  /** Best performing version */
  bestVersion: string;
  /** Change from previous version */
  latestDelta: {
    speedupChange: number;
    costChange: number;
    scoreChange: number;
  };
}

export type TrendDirection = 'improving' | 'stable' | 'regressing';

export interface VersionDataPoint {
  /** Version string */
  version: string;
  /** ISO 8601 timestamp */
  timestamp: string;
  /** Composite score */
  compositeScore: number;
  /** Speedup factor */
  speedup: number;
  /** Cost reduction percentage */
  costReduction: number;
  /** Pass rate */
  passRate: number;
}

// =============================================================================
// Ground Truth
// =============================================================================

export interface GroundTruth {
  /** Benchmark ID */
  benchmarkId: BenchmarkId;
  /** Wave definitions */
  waves: GroundTruthWave[];
  /** Critical path task IDs */
  criticalPath: string[];
  /** Maximum parallelism achievable */
  maxParallelism: number;
}

export interface GroundTruthWave {
  /** Wave number */
  wave: number;
  /** Tasks in this wave */
  tasks: string[];
  /** Tasks that can run in parallel */
  parallel: string[];
  /** Wave dependencies */
  dependsOn?: number[];
}

// =============================================================================
// Workspace Management
// =============================================================================

export interface WorkspaceInfo {
  /** Workspace ID */
  id: string;
  /** Root directory path */
  rootDir: string;
  /** Fixtures directory */
  fixturesDir: string;
  /** Acceptance tests directory */
  acceptanceDir: string;
  /** Output directory */
  outputDir: string;
  /** PRD file path */
  prdPath: string;
  /** Active process IDs */
  processIds: number[];
}

// =============================================================================
// Errors
// =============================================================================

export interface ExecutionError {
  /** ISO 8601 timestamp */
  timestamp: string;
  /** Execution phase */
  phase: 'setup' | 'execution' | 'testing' | 'cleanup';
  /** Error code */
  code: string;
  /** Error message */
  message: string;
  /** Session ID if applicable */
  sessionId?: string;
  /** Whether the error is recoverable */
  recoverable: boolean;
  /** Stack trace */
  stack?: string;
}

// =============================================================================
// Version Info
// =============================================================================

export interface VersionInfo {
  /** Version string (tag, package version, or commit) */
  version: string;
  /** Full git commit SHA */
  gitCommit: string;
  /** Git branch name */
  gitBranch: string;
  /** Git tag if on a tag */
  gitTag?: string;
  /** Whether there are uncommitted changes */
  isDirty: boolean;
}

// =============================================================================
// Run Manifest (Stored Results)
// =============================================================================

export interface RunManifest {
  /** Run ID */
  id: string;
  /** DevPilot version */
  version: string;
  /** Git commit */
  gitCommit: string;
  /** Git tag if on a tag */
  gitTag?: string;
  /** ISO 8601 timestamp */
  timestamp: string;
  /** Run configuration */
  config: RunConfig;
  /** All benchmark runs */
  benchmarks: BenchmarkRun[];
  /** Aggregate summary */
  summary: {
    /** Total benchmarks */
    totalBenchmarks: number;
    /** Passed benchmarks */
    passedBenchmarks: number;
    /** Average speedup */
    avgSpeedup: number;
    /** Average cost reduction */
    avgCostReduction: number;
    /** Average composite score */
    avgCompositeScore: number;
  };
  /** Model pricing at time of run */
  pricingSnapshot: ModelPricing[];
}

// =============================================================================
// Reporter Types
// =============================================================================

export interface ReportOptions {
  /** Output format */
  format: 'console' | 'markdown' | 'json';
  /** Output file path (for markdown/json) */
  outputPath?: string;
  /** Include timeline visualization */
  includeTimeline: boolean;
  /** Include session details */
  includeSessionDetails: boolean;
}

export interface GanttDataPoint {
  /** Unique ID */
  id: string;
  /** Task type */
  type: 'wave' | 'session';
  /** Display label */
  label: string;
  /** Start time relative to run start (ms) */
  startMs: number;
  /** End time relative to run start (ms) */
  endMs: number;
  /** Parent ID for nesting */
  parentId?: string;
  /** Display color */
  color?: string;
}
