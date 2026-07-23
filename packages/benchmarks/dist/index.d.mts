import { z } from 'zod';
import { SpawnOptions, ChildProcess } from 'child_process';

/**
 * DevPilot Benchmark Suite - Type Definitions
 *
 * All type definitions for the benchmark suite, organized by domain.
 */
/** Known benchmark project identifiers */
type BenchmarkId = '01-forgepress' | '02-taskforge' | '03-insightboard';
/** Execution scenario types */
type ScenarioType = 'baseline' | 'devpilot';
/** Model tiers for Claude */
type ModelTier = 'haiku' | 'sonnet' | 'opus';
interface RunConfig {
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
type BenchmarkRunStatus = 'pending' | 'running' | 'completed' | 'partial' | 'failed' | 'cancelled';
interface BenchmarkRun {
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
    /** Wave plan analysis vs ground truth (DevPilot scenario, if evaluated) */
    waveAnalysis?: WaveAnalysis | null;
}
type ScenarioStatus = 'pending' | 'preparing' | 'running' | 'testing' | 'completed' | 'failed' | 'timeout';
interface ScenarioResult {
    /** Scenario type */
    scenario: ScenarioType;
    /** Execution status */
    status: ScenarioStatus;
    /** ISO 8601 start time */
    startedAt: string;
    /** ISO 8601 completion time */
    completedAt: string;
    /** Total wall clock time in milliseconds */
    wallClockMs: number;
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
    /** Total cost in USD */
    totalCostUsd: number;
    /** Cost breakdown by session */
    costBreakdown: CostEntry[];
    /** Acceptance test results */
    acceptanceResults: AcceptanceResult;
    /** First attempt pass rate (0.0 - 1.0) */
    firstAttemptPassRate: number;
    /** Generated wave plan */
    wavePlan?: WavePlan;
    /** Wave execution log */
    waveExecutionLog?: WaveExecution[];
    /** Rework ratio (total edits / minimum required creates) */
    reworkRatio?: number;
    /** Individual session records */
    sessions: SessionRecord[];
    /** Ordered execution timeline */
    timeline: TimelineEvent[];
    /** Execution errors */
    errors: ExecutionError[];
    /** Created files */
    filesCreated: string[];
    /** Modified files */
    filesModified: string[];
}
interface TokenUsage {
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
interface ModelPricing {
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
interface CostEntry {
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
interface WavePlan {
    /** Wave definitions */
    waves: Wave[];
    /** Estimated critical path duration in ms */
    criticalPathMs: number;
    /** Peak concurrent sessions */
    maxParallelism: number;
    /** Total tasks across all waves */
    totalTasks: number;
}
interface Wave {
    /** Wave number (1-indexed) */
    waveNumber: number;
    /** Tasks in this wave */
    tasks: PlannedTask[];
    /** Wave numbers this depends on */
    dependsOn: number[];
    /** Estimated duration in ms */
    estimatedDurationMs: number;
}
interface PlannedTask {
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
interface WaveExecution {
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
interface SessionRecord {
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
type TimelineEventType = 'run_start' | 'scenario_start' | 'wave_start' | 'session_start' | 'session_progress' | 'session_complete' | 'session_error' | 'wave_complete' | 'acceptance_start' | 'acceptance_complete' | 'scenario_complete' | 'run_complete';
interface TimelineEvent {
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
interface AcceptanceResult {
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
interface AcceptanceTest {
    /** Test name */
    name: string;
    /** Pass/fail status */
    status: 'pass' | 'fail';
    /** Test output if any */
    output?: string;
}
interface ComparisonResult {
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
interface CompositeScore {
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
interface ScoreComponent {
    /** Raw value before normalization */
    raw: number;
    /** Normalized value (0-100) */
    normalized: number;
    /** Weighted value */
    weighted: number;
    /** Weight applied (0-1) */
    weight: number;
}
interface WaveAnalysis {
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
interface TrendAnalysis {
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
type TrendDirection = 'improving' | 'stable' | 'regressing';
interface VersionDataPoint {
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
interface GroundTruth {
    /** Benchmark ID */
    benchmarkId: BenchmarkId;
    /** Wave definitions */
    waves: GroundTruthWave[];
    /** Critical path task IDs */
    criticalPath: string[];
    /** Maximum parallelism achievable */
    maxParallelism: number;
}
interface GroundTruthWave {
    /** Wave number */
    wave: number;
    /** Tasks in this wave */
    tasks: string[];
    /** Tasks that can run in parallel */
    parallel: string[];
    /** Wave dependencies */
    dependsOn?: number[];
}
interface WorkspaceInfo {
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
interface ExecutionError {
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
interface VersionInfo {
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
interface RunManifest {
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
    /** Overall run status */
    status: BenchmarkRunStatus;
    /** Total wall clock duration of the run in milliseconds */
    durationMs: number;
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
        /** Average quality delta (devpilot pass rate - baseline pass rate) */
        avgQualityDelta: number;
        /** Average composite score */
        avgCompositeScore: number;
    };
    /** Model pricing at time of run */
    pricingSnapshot: ModelPricing[];
}
interface ReportOptions {
    /** Output format */
    format: 'console' | 'markdown' | 'json';
    /** Output file path (for markdown/json) */
    outputPath?: string;
    /** Include timeline visualization */
    includeTimeline: boolean;
    /** Include session details */
    includeSessionDetails: boolean;
}
interface GanttDataPoint {
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

/**
 * DevPilot Benchmark Suite - Configuration Schema
 *
 * Zod schemas for validating benchmark configuration.
 */

/** Recursively-optional variant of a type, for sparse config overrides. */
type DeepPartial<T> = {
    [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K];
};
declare const BenchmarkIdSchema: z.ZodEnum<["01-forgepress", "02-taskforge", "03-insightboard"]>;
declare const ScenarioTypeSchema: z.ZodEnum<["baseline", "devpilot"]>;
declare const ModelTierSchema: z.ZodEnum<["haiku", "sonnet", "opus"]>;
declare const ModelPricingSchema: z.ZodObject<{
    model: z.ZodString;
    inputPer1M: z.ZodNumber;
    outputPer1M: z.ZodNumber;
    cacheReadPer1M: z.ZodNumber;
    cacheWritePer1M: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    model: string;
    inputPer1M: number;
    outputPer1M: number;
    cacheReadPer1M: number;
    cacheWritePer1M: number;
}, {
    model: string;
    inputPer1M: number;
    outputPer1M: number;
    cacheReadPer1M: number;
    cacheWritePer1M: number;
}>;
declare const DEFAULT_MODEL_PRICING: ModelPricing[];
declare const BenchmarkConfigSchema: z.ZodObject<{
    benchmarks: z.ZodDefault<z.ZodObject<{
        /** Benchmark IDs to include */
        include: z.ZodDefault<z.ZodArray<z.ZodEnum<["01-forgepress", "02-taskforge", "03-insightboard"]>, "many">>;
        /** Path to benchmark definitions */
        benchmarkDir: z.ZodDefault<z.ZodString>;
        /** Path to ground truth files */
        groundTruthDir: z.ZodDefault<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        include: ("01-forgepress" | "02-taskforge" | "03-insightboard")[];
        benchmarkDir: string;
        groundTruthDir: string;
    }, {
        include?: ("01-forgepress" | "02-taskforge" | "03-insightboard")[] | undefined;
        benchmarkDir?: string | undefined;
        groundTruthDir?: string | undefined;
    }>>;
    baseline: z.ZodDefault<z.ZodObject<{
        /** Path to Claude Code CLI binary */
        claudeCodeBinary: z.ZodDefault<z.ZodString>;
        /** Model to use */
        model: z.ZodDefault<z.ZodEnum<["haiku", "sonnet", "opus"]>>;
        /** Maximum retries on failure */
        maxRetries: z.ZodDefault<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        model: "haiku" | "sonnet" | "opus";
        claudeCodeBinary: string;
        maxRetries: number;
    }, {
        model?: "haiku" | "sonnet" | "opus" | undefined;
        claudeCodeBinary?: string | undefined;
        maxRetries?: number | undefined;
    }>>;
    devpilot: z.ZodDefault<z.ZodObject<{
        /** Orchestrator mode */
        orchestratorMode: z.ZodDefault<z.ZodEnum<["http", "ao-cli"]>>;
        /** HTTP orchestrator URL (for http mode) */
        orchestratorUrl: z.ZodOptional<z.ZodString>;
        /** API key for orchestrator */
        apiKey: z.ZodOptional<z.ZodString>;
        /** Max concurrent sessions */
        maxConcurrentSessions: z.ZodDefault<z.ZodNumber>;
        /** Model for planning */
        planningModel: z.ZodDefault<z.ZodEnum<["haiku", "sonnet", "opus"]>>;
        /** Model for execution */
        executionModel: z.ZodDefault<z.ZodEnum<["haiku", "sonnet", "opus"]>>;
        /** Agent-orchestrator project name (for ao-cli mode) */
        aoProjectName: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        orchestratorMode: "http" | "ao-cli";
        maxConcurrentSessions: number;
        planningModel: "haiku" | "sonnet" | "opus";
        executionModel: "haiku" | "sonnet" | "opus";
        orchestratorUrl?: string | undefined;
        apiKey?: string | undefined;
        aoProjectName?: string | undefined;
    }, {
        orchestratorMode?: "http" | "ao-cli" | undefined;
        orchestratorUrl?: string | undefined;
        apiKey?: string | undefined;
        maxConcurrentSessions?: number | undefined;
        planningModel?: "haiku" | "sonnet" | "opus" | undefined;
        executionModel?: "haiku" | "sonnet" | "opus" | undefined;
        aoProjectName?: string | undefined;
    }>>;
    execution: z.ZodDefault<z.ZodObject<{
        /** Timeout per scenario in minutes */
        timeoutMinutes: z.ZodDefault<z.ZodNumber>;
        /** Ideal completion time in minutes (for scoring) */
        idealTimeMinutes: z.ZodDefault<z.ZodNumber>;
        /** Number of iterations per scenario */
        iterations: z.ZodDefault<z.ZodNumber>;
        /** Run benchmarks in parallel */
        parallel: z.ZodDefault<z.ZodBoolean>;
        /** Archive workspaces after execution */
        archiveWorkspaces: z.ZodDefault<z.ZodBoolean>;
    }, "strip", z.ZodTypeAny, {
        timeoutMinutes: number;
        idealTimeMinutes: number;
        iterations: number;
        parallel: boolean;
        archiveWorkspaces: boolean;
    }, {
        timeoutMinutes?: number | undefined;
        idealTimeMinutes?: number | undefined;
        iterations?: number | undefined;
        parallel?: boolean | undefined;
        archiveWorkspaces?: boolean | undefined;
    }>>;
    pricing: z.ZodDefault<z.ZodArray<z.ZodObject<{
        model: z.ZodString;
        inputPer1M: z.ZodNumber;
        outputPer1M: z.ZodNumber;
        cacheReadPer1M: z.ZodNumber;
        cacheWritePer1M: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        model: string;
        inputPer1M: number;
        outputPer1M: number;
        cacheReadPer1M: number;
        cacheWritePer1M: number;
    }, {
        model: string;
        inputPer1M: number;
        outputPer1M: number;
        cacheReadPer1M: number;
        cacheWritePer1M: number;
    }>, "many">>;
    scoring: z.ZodDefault<z.ZodObject<{
        weights: z.ZodDefault<z.ZodEffects<z.ZodObject<{
            acceptanceTests: z.ZodDefault<z.ZodNumber>;
            wavePlanQuality: z.ZodDefault<z.ZodNumber>;
            firstAttemptPassRate: z.ZodDefault<z.ZodNumber>;
            completionTime: z.ZodDefault<z.ZodNumber>;
            reworkRatio: z.ZodDefault<z.ZodNumber>;
        }, "strip", z.ZodTypeAny, {
            acceptanceTests: number;
            wavePlanQuality: number;
            firstAttemptPassRate: number;
            completionTime: number;
            reworkRatio: number;
        }, {
            acceptanceTests?: number | undefined;
            wavePlanQuality?: number | undefined;
            firstAttemptPassRate?: number | undefined;
            completionTime?: number | undefined;
            reworkRatio?: number | undefined;
        }>, {
            acceptanceTests: number;
            wavePlanQuality: number;
            firstAttemptPassRate: number;
            completionTime: number;
            reworkRatio: number;
        }, {
            acceptanceTests?: number | undefined;
            wavePlanQuality?: number | undefined;
            firstAttemptPassRate?: number | undefined;
            completionTime?: number | undefined;
            reworkRatio?: number | undefined;
        }>>;
    }, "strip", z.ZodTypeAny, {
        weights: {
            acceptanceTests: number;
            wavePlanQuality: number;
            firstAttemptPassRate: number;
            completionTime: number;
            reworkRatio: number;
        };
    }, {
        weights?: {
            acceptanceTests?: number | undefined;
            wavePlanQuality?: number | undefined;
            firstAttemptPassRate?: number | undefined;
            completionTime?: number | undefined;
            reworkRatio?: number | undefined;
        } | undefined;
    }>>;
    output: z.ZodDefault<z.ZodObject<{
        /** Results directory */
        resultsDir: z.ZodDefault<z.ZodString>;
        /** Reporters to use */
        reporters: z.ZodDefault<z.ZodArray<z.ZodEnum<["console", "markdown", "json"]>, "many">>;
    }, "strip", z.ZodTypeAny, {
        resultsDir: string;
        reporters: ("console" | "markdown" | "json")[];
    }, {
        resultsDir?: string | undefined;
        reporters?: ("console" | "markdown" | "json")[] | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    baseline: {
        model: "haiku" | "sonnet" | "opus";
        claudeCodeBinary: string;
        maxRetries: number;
    };
    devpilot: {
        orchestratorMode: "http" | "ao-cli";
        maxConcurrentSessions: number;
        planningModel: "haiku" | "sonnet" | "opus";
        executionModel: "haiku" | "sonnet" | "opus";
        orchestratorUrl?: string | undefined;
        apiKey?: string | undefined;
        aoProjectName?: string | undefined;
    };
    execution: {
        timeoutMinutes: number;
        idealTimeMinutes: number;
        iterations: number;
        parallel: boolean;
        archiveWorkspaces: boolean;
    };
    benchmarks: {
        include: ("01-forgepress" | "02-taskforge" | "03-insightboard")[];
        benchmarkDir: string;
        groundTruthDir: string;
    };
    pricing: {
        model: string;
        inputPer1M: number;
        outputPer1M: number;
        cacheReadPer1M: number;
        cacheWritePer1M: number;
    }[];
    scoring: {
        weights: {
            acceptanceTests: number;
            wavePlanQuality: number;
            firstAttemptPassRate: number;
            completionTime: number;
            reworkRatio: number;
        };
    };
    output: {
        resultsDir: string;
        reporters: ("console" | "markdown" | "json")[];
    };
}, {
    baseline?: {
        model?: "haiku" | "sonnet" | "opus" | undefined;
        claudeCodeBinary?: string | undefined;
        maxRetries?: number | undefined;
    } | undefined;
    devpilot?: {
        orchestratorMode?: "http" | "ao-cli" | undefined;
        orchestratorUrl?: string | undefined;
        apiKey?: string | undefined;
        maxConcurrentSessions?: number | undefined;
        planningModel?: "haiku" | "sonnet" | "opus" | undefined;
        executionModel?: "haiku" | "sonnet" | "opus" | undefined;
        aoProjectName?: string | undefined;
    } | undefined;
    execution?: {
        timeoutMinutes?: number | undefined;
        idealTimeMinutes?: number | undefined;
        iterations?: number | undefined;
        parallel?: boolean | undefined;
        archiveWorkspaces?: boolean | undefined;
    } | undefined;
    benchmarks?: {
        include?: ("01-forgepress" | "02-taskforge" | "03-insightboard")[] | undefined;
        benchmarkDir?: string | undefined;
        groundTruthDir?: string | undefined;
    } | undefined;
    pricing?: {
        model: string;
        inputPer1M: number;
        outputPer1M: number;
        cacheReadPer1M: number;
        cacheWritePer1M: number;
    }[] | undefined;
    scoring?: {
        weights?: {
            acceptanceTests?: number | undefined;
            wavePlanQuality?: number | undefined;
            firstAttemptPassRate?: number | undefined;
            completionTime?: number | undefined;
            reworkRatio?: number | undefined;
        } | undefined;
    } | undefined;
    output?: {
        resultsDir?: string | undefined;
        reporters?: ("console" | "markdown" | "json")[] | undefined;
    } | undefined;
}>;
type BenchmarkConfig = z.infer<typeof BenchmarkConfigSchema>;
declare const RunConfigSchema: z.ZodObject<{
    benchmarks: z.ZodArray<z.ZodEnum<["01-forgepress", "02-taskforge", "03-insightboard"]>, "many">;
    scenarios: z.ZodArray<z.ZodEnum<["baseline", "devpilot"]>, "many">;
    iterations: z.ZodNumber;
    parallel: z.ZodBoolean;
    timeoutMs: z.ZodNumber;
    archiveWorkspaces: z.ZodBoolean;
    outputDir: z.ZodString;
    versionTag: z.ZodOptional<z.ZodString>;
    maxConcurrentSessions: z.ZodNumber;
    baselineModel: z.ZodEnum<["haiku", "sonnet", "opus"]>;
    dryRun: z.ZodBoolean;
}, "strip", z.ZodTypeAny, {
    benchmarks: ("01-forgepress" | "02-taskforge" | "03-insightboard")[];
    maxConcurrentSessions: number;
    iterations: number;
    parallel: boolean;
    archiveWorkspaces: boolean;
    scenarios: ("baseline" | "devpilot")[];
    timeoutMs: number;
    outputDir: string;
    baselineModel: "haiku" | "sonnet" | "opus";
    dryRun: boolean;
    versionTag?: string | undefined;
}, {
    benchmarks: ("01-forgepress" | "02-taskforge" | "03-insightboard")[];
    maxConcurrentSessions: number;
    iterations: number;
    parallel: boolean;
    archiveWorkspaces: boolean;
    scenarios: ("baseline" | "devpilot")[];
    timeoutMs: number;
    outputDir: string;
    baselineModel: "haiku" | "sonnet" | "opus";
    dryRun: boolean;
    versionTag?: string | undefined;
}>;
/**
 * Define benchmark configuration with type checking.
 */
declare function defineConfig(config: Partial<BenchmarkConfig>): BenchmarkConfig;
/**
 * Load and validate configuration from a file.
 */
declare function loadConfig(configPath?: string): Promise<BenchmarkConfig>;
/**
 * Get model pricing by model name.
 */
declare function getModelPricing(config: BenchmarkConfig, model: string): ModelPricing | undefined;
/**
 * Convert BenchmarkConfig to RunConfig with CLI overrides.
 */
declare function toRunConfig(config: BenchmarkConfig, overrides?: Partial<RunConfig>): RunConfig;
/**
 * Load configuration values from environment variables.
 */
declare function loadEnvConfig(): DeepPartial<BenchmarkConfig>;
/**
 * Merge environment config with file config.
 */
declare function mergeConfig(fileConfig: BenchmarkConfig, envConfig: DeepPartial<BenchmarkConfig>): BenchmarkConfig;
declare const SCORING_CONSTANTS: {
    /** Time for perfect score (100) in ms */
    IDEAL_TIME_MS: number;
    /** Time for zero score in ms */
    MAX_TIME_MS: number;
    /** Grade thresholds */
    GRADES: {
        readonly A: 90;
        readonly B: 80;
        readonly C: 70;
        readonly D: 60;
        readonly F: 0;
    };
};

/**
 * Token Tracker
 *
 * Parses and aggregates token usage from Claude Code CLI output
 * and CompletionReport objects.
 */

/**
 * Token snapshot aggregated by session and model.
 */
interface TokenSnapshot {
    /** Usage by session ID */
    bySession: Map<string, TokenUsage>;
    /** Usage by model name */
    byModel: Map<string, TokenUsage>;
    /** Total usage across all sessions */
    total: TokenUsage;
    /** Cache hit rate (0-1) */
    cacheHitRate: number;
}
/**
 * Tracks and aggregates token usage across sessions.
 */
declare class TokenTracker {
    private usageBySession;
    private usageByModel;
    /**
     * Record token usage for a session.
     */
    recordUsage(sessionId: string, model: string, usage: TokenUsage): void;
    /**
     * Parse and record token usage from Claude Code CLI output.
     * Returns true if parsing was successful.
     */
    recordFromOutput(sessionId: string, model: string, output: string): boolean;
    /**
     * Record token usage from a CompletionReport.
     */
    recordFromCompletionReport(sessionId: string, model: string, report: {
        tokensUsed?: number;
        inputTokens?: number;
        outputTokens?: number;
        cacheReadTokens?: number;
        cacheWriteTokens?: number;
    }): void;
    /**
     * Parse JSON output format from Claude Code CLI.
     *
     * Expected format:
     * {
     *   "usage": {
     *     "input_tokens": 12500,
     *     "output_tokens": 45000,
     *     "cache_read_input_tokens": 5000,
     *     "cache_creation_input_tokens": 2000
     *   }
     * }
     */
    parseJsonOutput(output: string): TokenUsage | null;
    /**
     * Extract TokenUsage from a parsed object.
     */
    private extractUsageFromObject;
    /**
     * Extract a number from an object using multiple possible keys.
     */
    private extractNumber;
    /**
     * Parse text output format from Claude Code CLI.
     *
     * Expected formats:
     * - "Total tokens: 57500 (12500 input, 45000 output)"
     * - "Cache: 5000 read, 2000 written"
     * - "Tokens used: 57,500"
     */
    parseTextOutput(output: string): TokenUsage | null;
    /**
     * Get token usage for a specific session.
     */
    getSessionUsage(sessionId: string): TokenUsage | null;
    /**
     * Get aggregated token usage for a model.
     */
    getModelUsage(model: string): TokenUsage;
    /**
     * Get total token usage across all sessions.
     */
    getTotalUsage(): TokenUsage;
    /**
     * Calculate cache hit rate (proportion of tokens from cache).
     */
    getCacheHitRate(): number;
    /**
     * Get complete snapshot of token usage.
     */
    getSnapshot(): TokenSnapshot;
    /**
     * Clear all recorded usage.
     */
    clear(): void;
}
/**
 * Create an empty token usage object.
 */
declare function createEmptyUsage(): TokenUsage;
/**
 * Add two token usage objects together.
 */
declare function addUsage(a: TokenUsage, b: TokenUsage): TokenUsage;

/**
 * Cost Calculator
 *
 * Maps token usage to USD costs based on model pricing.
 */

/**
 * Cost breakdown by category.
 */
interface CostBreakdown {
    inputCost: number;
    outputCost: number;
    cacheReadCost: number;
    cacheWriteCost: number;
    totalCost: number;
}
/**
 * Calculates costs from token usage based on model pricing.
 */
declare class CostCalculator {
    private pricing;
    private pricingSnapshot;
    constructor(pricingConfig?: ModelPricing[]);
    /**
     * Load pricing configuration.
     */
    loadPricing(pricing: ModelPricing[]): void;
    /**
     * Set pricing for a specific model.
     */
    setPricing(model: string, pricing: ModelPricing): void;
    /**
     * Get pricing for a model.
     */
    getPricing(model: string): ModelPricing | undefined;
    /**
     * Calculate cost for a given model and token usage.
     */
    calculateCost(model: string, usage: TokenUsage): number;
    /**
     * Calculate detailed cost breakdown.
     */
    calculateBreakdown(model: string, usage: TokenUsage): CostBreakdown;
    /**
     * Calculate cost for a session record.
     */
    calculateSessionCost(session: SessionRecord): CostEntry;
    /**
     * Calculate total cost for multiple sessions.
     */
    calculateTotalCost(sessions: SessionRecord[]): number;
    /**
     * Get cost breakdown for multiple sessions.
     */
    getCostBreakdown(sessions: SessionRecord[]): CostEntry[];
    /**
     * Get aggregated cost by model.
     */
    getCostByModel(sessions: SessionRecord[]): Map<string, number>;
    /**
     * Get the pricing snapshot (for storing in results).
     */
    getPricingSnapshot(): ModelPricing[];
    /**
     * Format cost as a string with appropriate precision.
     */
    static formatCost(costUsd: number): string;
    /**
     * Estimate cost for a planned task.
     */
    estimateCost(model: string, estimatedInputTokens: number, estimatedOutputTokens: number): number;
}
/**
 * Create a cost calculator with default pricing.
 */
declare function createCostCalculator(customPricing?: ModelPricing[]): CostCalculator;

/**
 * Timeline Recorder
 *
 * Records execution events for Gantt-style analysis and
 * duration calculations.
 */

/**
 * Event context for nested event hierarchy.
 */
interface EventContext {
    type: 'run' | 'benchmark' | 'scenario' | 'wave' | 'session';
    id: string;
    startTime: Date;
}
/**
 * Records and analyzes execution timeline events.
 */
declare class TimelineRecorder {
    private events;
    private contextStack;
    private startTime;
    constructor();
    /**
     * Record a timeline event.
     */
    recordEvent(type: TimelineEventType, data?: Record<string, unknown>): void;
    /**
     * Push a new context onto the stack.
     */
    pushContext(context: EventContext): void;
    /**
     * Pop the current context from the stack.
     */
    popContext(): EventContext | undefined;
    /**
     * Get the current context.
     */
    getCurrentContext(): EventContext | undefined;
    /**
     * Record run start.
     */
    runStart(runId: string): void;
    /**
     * Record run complete.
     */
    runComplete(results?: Record<string, unknown>): void;
    /**
     * Record scenario start.
     */
    scenarioStart(scenario: 'baseline' | 'devpilot'): void;
    /**
     * Record scenario complete.
     */
    scenarioComplete(scenario: 'baseline' | 'devpilot', result?: Record<string, unknown>): void;
    /**
     * Record wave start.
     */
    waveStart(waveNumber: number, taskCount: number): void;
    /**
     * Record wave complete.
     */
    waveComplete(waveNumber: number, result?: Record<string, unknown>): void;
    /**
     * Record session start.
     */
    sessionStart(sessionId: string, taskId?: string): void;
    /**
     * Record session progress.
     */
    sessionProgress(sessionId: string, progress: number, message?: string): void;
    /**
     * Record session complete.
     */
    sessionComplete(sessionId: string, success: boolean): void;
    /**
     * Record session error.
     */
    sessionError(sessionId: string, error: string): void;
    /**
     * Record acceptance test start.
     */
    acceptanceStart(): void;
    /**
     * Record acceptance test complete.
     */
    acceptanceComplete(result?: Record<string, unknown>): void;
    /**
     * Get all events.
     */
    getEvents(): TimelineEvent[];
    /**
     * Get events by type.
     */
    getEventsByType(type: TimelineEventType): TimelineEvent[];
    /**
     * Get events for a specific session.
     */
    getEventsBySession(sessionId: string): TimelineEvent[];
    /**
     * Get events for a specific wave.
     */
    getEventsByWave(waveNumber: number): TimelineEvent[];
    /**
     * Get events within a time range.
     */
    getEventRange(start: Date, end: Date): TimelineEvent[];
    /**
     * Calculate duration between two event types.
     */
    calculateDuration(startEvent: TimelineEventType, endEvent: TimelineEventType): number;
    /**
     * Get session durations.
     */
    getSessionDurations(): Map<string, number>;
    /**
     * Get wave durations.
     */
    getWaveDurations(): Map<number, number>;
    /**
     * Get total run duration.
     */
    getTotalDuration(): number;
    /**
     * Export events as JSON.
     */
    toJSON(): TimelineEvent[];
    /**
     * Export as Gantt chart data points.
     */
    toGanttData(): GanttDataPoint[];
    /**
     * Clear all recorded events.
     */
    clear(): void;
}
/**
 * Create a new timeline recorder.
 */
declare function createTimelineRecorder(): TimelineRecorder;

/**
 * Metrics Collector
 *
 * Central aggregator for all metrics during benchmark execution.
 * Provides real-time access to metrics and calculates derived values.
 */

/**
 * Real-time metrics snapshot.
 */
interface MetricsSnapshot {
    /** Wall clock time since start in ms */
    wallClockMs: number;
    /** Total tokens used */
    totalTokens: number;
    /** Total input tokens */
    totalTokensInput: number;
    /** Total output tokens */
    totalTokensOutput: number;
    /** Total cost in USD */
    totalCostUsd: number;
    /** Active sessions count */
    sessionsActive: number;
    /** Completed sessions count */
    sessionsCompleted: number;
    /** Failed sessions count */
    sessionsFailed: number;
    /** Files created count */
    filesCreated: number;
    /** Files modified count */
    filesModified: number;
}
/**
 * Session metrics summary.
 */
interface SessionMetrics {
    sessionId: string;
    model: string;
    durationMs: number;
    tokens: TokenUsage;
    costUsd: number;
    success: boolean;
}
/**
 * Scenario-level aggregated metrics.
 */
interface ScenarioMetrics {
    /** Total wall clock time in ms */
    wallClockMs: number;
    /** Total token usage */
    tokens: TokenUsage;
    /** Total cost in USD */
    totalCostUsd: number;
    /** Cost breakdown by session */
    costBreakdown: CostEntry[];
    /** Session count */
    sessionCount: number;
    /** Success rate (0-1) */
    successRate: number;
    /** Files created */
    filesCreated: string[];
    /** Files modified */
    filesModified: string[];
    /** Rework ratio */
    reworkRatio: number;
    /** First attempt pass rate */
    firstAttemptPassRate: number;
}
/**
 * Central metrics collector that aggregates from multiple sources.
 */
declare class MetricsCollector {
    private tokenTracker;
    private costCalculator;
    private timeline;
    private sessions;
    private startTime;
    private filesCreated;
    private filesModified;
    constructor(tokenTracker?: TokenTracker, costCalculator?: CostCalculator, timeline?: TimelineRecorder);
    /**
     * Start metrics collection.
     */
    start(runId: string): void;
    /**
     * Stop metrics collection.
     */
    stop(results?: Record<string, unknown>): void;
    /**
     * Register a new session.
     */
    registerSession(session: SessionRecord): void;
    /**
     * Record token usage for a session directly.
     *
     * Convenience wrapper around the underlying token tracker that resolves the
     * model from the registered session (falling back to 'unknown' when the
     * session has not been registered yet).
     */
    recordTokenUsage(sessionId: string, usage: TokenUsage): void;
    /**
     * Update an existing session.
     */
    updateSession(sessionId: string, update: Partial<SessionRecord>): void;
    /**
     * Mark a session as complete.
     */
    completeSession(sessionId: string, report: {
        success: boolean;
        tokensInput?: number;
        tokensOutput?: number;
        cacheReadTokens?: number;
        cacheWriteTokens?: number;
        costUsd?: number;
        filesCreated?: string[];
        filesModified?: string[];
        error?: string;
    }): void;
    /**
     * Get current metrics snapshot.
     */
    getSnapshot(): MetricsSnapshot;
    /**
     * Get metrics for a specific session.
     */
    getSessionMetrics(sessionId: string): SessionMetrics | undefined;
    /**
     * Aggregate metrics for a scenario.
     */
    aggregateScenarioMetrics(sessions: SessionRecord[], firstAttemptPassRate?: number): ScenarioMetrics;
    /**
     * Calculate rework ratio.
     *
     * Rework Ratio = Total file edits / Minimum required file creates
     * Where:
     * - "File edit" = any modification to an already-created file
     * - "Minimum required file creates" = count of unique files created
     *
     * Lower is better. 1.0 = perfect (no rework).
     */
    calculateReworkRatio(sessions: SessionRecord[]): number;
    /**
     * Calculate parallelism efficiency.
     *
     * Efficiency = Total session-seconds / (Wall-clock seconds × max concurrent slots)
     *
     * 1.0 = every slot utilized the entire run.
     */
    calculateParallelismEfficiency(sessions: SessionRecord[], maxSlots: number, wallClockMs: number): number;
    /**
     * Get the underlying timeline recorder for direct event recording.
     */
    getTimeline(): TimelineRecorder;
    /**
     * Export timeline events.
     */
    exportTimeline(): TimelineEvent[];
    /**
     * Export session log.
     */
    exportSessionLog(): SessionRecord[];
    /**
     * Get the underlying components.
     */
    getComponents(): {
        tokenTracker: TokenTracker;
        costCalculator: CostCalculator;
        timeline: TimelineRecorder;
    };
    /**
     * Get pricing snapshot for storing in results.
     */
    getPricingSnapshot(): ModelPricing[];
    /**
     * Clear all collected data.
     */
    clear(): void;
}
/**
 * Create a new metrics collector.
 */
declare function createMetricsCollector(pricing?: ModelPricing[]): MetricsCollector;

/**
 * Version Tagger
 *
 * Detects current git version info for tagging benchmark results.
 */

/**
 * Get version information from git and package.json.
 */
declare function getVersionInfo(projectRoot?: string): VersionInfo;
/**
 * Create a version tag string suitable for directory naming.
 * Sanitizes the version string to remove characters that are
 * problematic in file paths.
 */
declare function sanitizeVersionForPath(version: string): string;
/**
 * Create a timestamp string suitable for directory naming.
 * Format: YYYY-MM-DDTHH-MM-SSZ
 */
declare function createTimestampPath(date?: Date): string;
/**
 * Parse a timestamp path back to a Date.
 */
declare function parseTimestampPath(timestampPath: string): Date;

/**
 * Results Writer
 *
 * Writes structured benchmark results to disk in a versioned directory structure.
 */

/**
 * Results directory structure:
 *
 * benchmarks/results/
 * ├── latest/                    -> symlink to most recent version directory
 * ├── v0.1.0/
 * │   └── 2026-03-12T14-30-00Z/
 * │       ├── run-manifest.json
 * │       ├── report.md
 * │       ├── summary.json
 * │       ├── 01-forgepress/
 * │       │   ├── baseline/
 * │       │   │   ├── session-log.jsonl
 * │       │   │   ├── timeline.json
 * │       │   │   └── acceptance.txt
 * │       │   ├── devpilot/
 * │       │   │   ├── wave-plan.json
 * │       │   │   ├── session-log.jsonl
 * │       │   │   ├── timeline.json
 * │       │   │   └── acceptance.txt
 * │       │   ├── comparison.json
 * │       │   └── wave-analysis.json
 */
interface ResultsWriterConfig {
    /** Base results directory */
    resultsDir: string;
    /** Project root for version detection */
    projectRoot?: string;
}
/**
 * Writes benchmark results to disk.
 */
declare class ResultsWriter {
    private resultsDir;
    private projectRoot;
    constructor(config: ResultsWriterConfig);
    /**
     * Write a complete run manifest and return the run directory path.
     */
    writeRunManifest(manifest: RunManifest): Promise<string>;
    /**
     * Write results for a specific benchmark.
     */
    writeBenchmarkResult(runDir: string, benchmarkRun: BenchmarkRun): Promise<void>;
    /**
     * Write results for a specific scenario.
     */
    writeScenarioResult(benchmarkDir: string, scenario: 'baseline' | 'devpilot', result: ScenarioResult): Promise<void>;
    /**
     * Write wave analysis results.
     */
    writeWaveAnalysis(benchmarkDir: string, analysis: WaveAnalysis): Promise<void>;
    /**
     * Write a markdown report.
     */
    writeReport(runDir: string, reportContent: string): Promise<void>;
    /**
     * Update the 'latest' symlink to point to the most recent run.
     */
    updateLatestSymlink(runDir: string): Promise<void>;
    /**
     * Archive a workspace directory.
     */
    archiveWorkspace(workspaceDir: string, outputPath: string): Promise<string>;
    /**
     * Get the path for a specific run.
     */
    getRunPath(version: string, timestamp: string): string;
    /**
     * Check if a run exists.
     */
    runExists(version: string, timestamp: string): Promise<boolean>;
    private writeJson;
}
/**
 * Create a results writer.
 */
declare function createResultsWriter(config: ResultsWriterConfig): ResultsWriter;

/**
 * History Reader
 *
 * Reads historical benchmark results for trend analysis.
 */

interface HistoryReaderConfig {
    /** Base results directory */
    resultsDir: string;
}
/**
 * Reads historical benchmark results.
 */
declare class HistoryReader {
    private resultsDir;
    constructor(config: HistoryReaderConfig);
    /**
     * List all versions that have results.
     */
    listVersions(): Promise<string[]>;
    /**
     * List all runs for a version, sorted by timestamp (most recent first).
     */
    listRuns(version: string): Promise<string[]>;
    /**
     * Read a run manifest.
     */
    readRunManifest(version: string, timestamp: string): Promise<RunManifest | null>;
    /**
     * Get the latest run.
     */
    getLatestRun(): Promise<RunManifest | null>;
    /**
     * Get trend data points for a benchmark.
     */
    getTrendDataPoints(benchmarkId: BenchmarkId, limit?: number): Promise<VersionDataPoint[]>;
    /**
     * Read comparison results for a benchmark.
     */
    readComparison(version: string, timestamp: string, benchmarkId: BenchmarkId): Promise<ComparisonResult | null>;
    /**
     * Read wave analysis for a benchmark.
     */
    readWaveAnalysis(version: string, timestamp: string, benchmarkId: BenchmarkId): Promise<WaveAnalysis | null>;
    /**
     * Get all benchmark runs across all versions for trend analysis.
     */
    getAllBenchmarkRuns(benchmarkId: BenchmarkId, limit?: number): Promise<BenchmarkRun[]>;
    /**
     * Find runs matching a criteria.
     */
    findRuns(criteria: {
        version?: string;
        benchmarkId?: BenchmarkId;
        minScore?: number;
        maxScore?: number;
        fromDate?: Date;
        toDate?: Date;
    }, limit?: number): Promise<RunManifest[]>;
    /**
     * Get statistics across all runs.
     */
    getOverallStatistics(benchmarkId?: BenchmarkId): Promise<{
        totalRuns: number;
        versions: number;
        avgScore: number;
        bestScore: number;
        worstScore: number;
        avgSpeedup: number;
    }>;
}
/**
 * Create a history reader.
 */
declare function createHistoryReader(config: HistoryReaderConfig): HistoryReader;

/**
 * Scoring Engine
 *
 * Calculates composite benchmark scores per methodology rubric.
 */

/**
 * Default scoring weights from BENCHMARK-METHODOLOGY.md:
 * - Acceptance tests: 30%
 * - Wave plan quality: 25%
 * - First-attempt pass rate: 20%
 * - Completion time: 15%
 * - Rework ratio: 10%
 */
declare const DEFAULT_WEIGHTS: {
    readonly acceptanceTests: 0.3;
    readonly wavePlanQuality: 0.25;
    readonly firstAttemptPassRate: 0.2;
    readonly completionTime: 0.15;
    readonly reworkRatio: 0.1;
};
interface ScoringConfig {
    weights?: typeof DEFAULT_WEIGHTS;
    /** Ideal completion time for perfect score (ms) */
    idealTimeMs?: number;
    /** Maximum completion time before zero score (ms) */
    maxTimeMs?: number;
}
/**
 * Scoring engine for computing composite benchmark scores.
 */
declare class ScoringEngine {
    private weights;
    private idealTimeMs;
    private maxTimeMs;
    constructor(config?: ScoringConfig);
    /**
     * Calculate composite score for a scenario result.
     */
    calculateScore(result: ScenarioResult, waveAnalysis?: WaveAnalysis): CompositeScore;
    /**
     * Score acceptance tests.
     * Raw value: pass rate (0-1)
     * Normalized: pass rate * 100 (0-100)
     */
    private scoreAcceptanceTests;
    /**
     * Score wave plan quality.
     * Uses the wave analysis score (0-25) if available, scaled to 0-100.
     */
    private scoreWavePlanQuality;
    /**
     * Score first-attempt pass rate.
     * Raw value: first attempt pass rate (0-1)
     */
    private scoreFirstAttemptPassRate;
    /**
     * Score completion time.
     * Linear scale: idealTimeMs = 100, maxTimeMs = 0
     * Below ideal = 100 (capped)
     * Above max = 0 (capped)
     */
    private scoreCompletionTime;
    /**
     * Score rework ratio.
     * Raw value: rework ratio (1.0 = perfect, higher = more rework)
     * Normalized: max(0, 100 - (ratio - 1) * 100)
     * A ratio of 1.0 = 100 points
     * A ratio of 2.0 = 0 points
     */
    private scoreReworkRatio;
    /**
     * Calculate letter grade from total score.
     */
    private calculateGrade;
    /**
     * Format a score component for display.
     */
    static formatComponent(component: ScoreComponent): string;
    /**
     * Get a summary string for a composite score.
     */
    static formatScore(score: CompositeScore): string;
}
/**
 * Create a scoring engine with default or custom config.
 */
declare function createScoringEngine(config?: ScoringConfig): ScoringEngine;
/**
 * Quick helper to calculate score without instantiating engine.
 */
declare function calculateScore(result: ScenarioResult, waveAnalysis?: WaveAnalysis, config?: ScoringConfig): CompositeScore;

/**
 * Wave Analyzer
 *
 * Compares generated wave plans against ground-truth DAGs.
 */

/**
 * Analyzes wave plans against ground truth.
 */
declare class WaveAnalyzer {
    /**
     * Analyze a generated wave plan against ground truth.
     */
    analyze(generated: WavePlan, groundTruth: GroundTruth): WaveAnalysis;
    /**
     * Build a map of task ID to wave number from a WavePlan.
     */
    private buildTaskWaveMap;
    /**
     * Build a map of task ID to wave number from ground truth.
     */
    private buildGroundTruthTaskWaveMap;
    /**
     * Get dependencies for a task from ground truth.
     */
    private getTaskDependencies;
    /**
     * Calculate edit distance between two task-wave maps.
     */
    private calculateEditDistance;
    /**
     * Calculate final wave plan score (0-25).
     */
    private calculateFinalScore;
    /**
     * Get a human-readable summary of the analysis.
     */
    static summarize(analysis: WaveAnalysis): string;
}
/**
 * Create a wave analyzer.
 */
declare function createWaveAnalyzer(): WaveAnalyzer;
/**
 * Quick helper to analyze without instantiating.
 */
declare function analyzeWavePlan(generated: WavePlan, groundTruth: GroundTruth): WaveAnalysis;

/**
 * Comparator
 *
 * Side-by-side comparison of baseline vs DevPilot scenario results.
 */

/**
 * Compare baseline and DevPilot scenario results.
 */
declare class Comparator {
    /**
     * Compare two scenario results.
     */
    compare(baseline: ScenarioResult, devpilot: ScenarioResult, waveAnalysis?: WaveAnalysis): ComparisonResult;
    /**
     * Calculate composite advantage between scenarios.
     */
    private calculateCompositeAdvantage;
    /**
     * Generate a human-readable comparison summary.
     */
    static summarize(comparison: ComparisonResult): string[];
    /**
     * Determine the overall winner.
     */
    static determineWinner(comparison: ComparisonResult): 'baseline' | 'devpilot' | 'tie';
}
/**
 * Create a comparator.
 */
declare function createComparator(): Comparator;
/**
 * Quick helper to compare without instantiating.
 */
declare function compareScenarios(baseline: ScenarioResult, devpilot: ScenarioResult, waveAnalysis?: WaveAnalysis): ComparisonResult;

/**
 * Trend Analyzer
 *
 * Cross-version trend analysis for benchmark results.
 */

/**
 * Analyzes trends across multiple benchmark runs.
 */
declare class TrendAnalyzer {
    /**
     * Analyze trends for a benchmark.
     */
    analyze(benchmarkId: BenchmarkId, dataPoints: VersionDataPoint[]): TrendAnalysis;
    /**
     * Calculate trend direction from a series of values.
     */
    private calculateTrend;
    /**
     * Calculate linear regression slope.
     */
    private linearRegressionSlope;
    /**
     * Calculate delta from the previous version.
     */
    private calculateLatestDelta;
    /**
     * Create an empty analysis for when there's no data.
     */
    private emptyAnalysis;
    /**
     * Calculate statistics for a series of values.
     */
    static calculateStatistics(values: number[]): {
        mean: number;
        median: number;
        stdDev: number;
        min: number;
        max: number;
    };
    /**
     * Format trend direction for display.
     */
    static formatTrend(direction: TrendDirection): string;
    /**
     * Generate a trend summary.
     */
    static summarize(analysis: TrendAnalysis): string[];
}
/**
 * Create a trend analyzer.
 */
declare function createTrendAnalyzer(): TrendAnalyzer;
/**
 * Quick helper to analyze trends.
 */
declare function analyzeTrends(benchmarkId: BenchmarkId, dataPoints: VersionDataPoint[]): TrendAnalysis;

/**
 * JSON Reporter
 *
 * Machine-readable JSON output generation.
 */

interface JsonReportOptions {
    pretty?: boolean;
    includeRawOutput?: boolean;
}
/**
 * Generates JSON reports from benchmark results.
 */
declare class JsonReporter {
    private options;
    constructor(options?: JsonReportOptions);
    /**
     * Generate full run report as JSON.
     */
    generateRunReport(run: RunManifest): string;
    /**
     * Generate comparison report as JSON.
     */
    generateComparisonReport(baseline: ScenarioResult, devpilot: ScenarioResult, comparison: ComparisonResult, waveAnalysis?: WaveAnalysis): string;
    /**
     * Generate trend report as JSON.
     */
    generateTrendReport(analysis: TrendAnalysis): string;
    /**
     * Generate score report as JSON.
     */
    generateScoreReport(scenario: ScenarioResult, score: CompositeScore, waveAnalysis?: WaveAnalysis): string;
    /**
     * Generate summary report as JSON.
     */
    generateSummaryReport(run: RunManifest): string;
    /**
     * Write report to file.
     */
    writeReport(filePath: string, content: string): Promise<void>;
    /**
     * Strip raw output from run for smaller file size.
     */
    private stripRawOutput;
    /**
     * Strip raw output from scenario.
     */
    private stripScenarioOutput;
    /**
     * Summarize scenario for comparison report.
     */
    private summarizeScenario;
    /**
     * Determine winner from comparison.
     */
    private determineWinner;
    /**
     * Serialize to JSON string.
     */
    private serialize;
}
/**
 * Create a JSON reporter.
 */
declare function createJsonReporter(options?: JsonReportOptions): JsonReporter;

/**
 * Markdown Reporter
 *
 * Generate human-readable Markdown reports.
 */

/**
 * Generates Markdown reports from benchmark results.
 */
declare class MarkdownReporter {
    /**
     * Generate full run report.
     */
    generateRunReport(run: RunManifest): string;
    /**
     * Generate executive summary.
     */
    private generateExecutiveSummary;
    /**
     * Generate results table.
     */
    private generateResultsTable;
    /**
     * Generate comparison section.
     */
    private generateComparisonSection;
    /**
     * Generate wave analysis section.
     */
    private generateWaveAnalysisSection;
    /**
     * Generate scenario section.
     */
    private generateScenarioSection;
    /**
     * Generate score report.
     */
    generateScoreReport(score: CompositeScore): string;
    /**
     * Generate trend report.
     */
    generateTrendReport(analysis: TrendAnalysis): string;
    /**
     * Generate ASCII Gantt chart.
     */
    generateGanttChart(events: TimelineEvent[], widthChars?: number): string;
    /**
     * Write report to file.
     */
    writeReport(filePath: string, content: string): Promise<void>;
    /**
     * Format status with emoji.
     */
    private formatStatus;
    /**
     * Format duration.
     */
    private formatDuration;
}
/**
 * Create a Markdown reporter.
 */
declare function createMarkdownReporter(): MarkdownReporter;

/**
 * Console Reporter
 *
 * Rich terminal output for benchmark results.
 */

/**
 * Console reporter for terminal output.
 */
declare class ConsoleReporter {
    private verbose;
    constructor(verbose?: boolean);
    /**
     * Print run header.
     */
    printHeader(run: RunManifest): void;
    /**
     * Print run summary.
     */
    printSummary(run: RunManifest): void;
    /**
     * Print results table.
     */
    printResultsTable(run: RunManifest): void;
    /**
     * Print comparison details.
     */
    printComparison(benchmarkId: string, comparison: ComparisonResult, waveAnalysis?: WaveAnalysis): void;
    /**
     * Print score card.
     */
    printScoreCard(scenario: ScenarioResult, score: CompositeScore): void;
    /**
     * Print a score bar.
     */
    private printScoreBar;
    /**
     * Print trend analysis.
     */
    printTrends(analysis: TrendAnalysis): void;
    /**
     * Print progress during execution.
     */
    printProgress(message: string, current?: number, total?: number): void;
    /**
     * Print success message.
     */
    printSuccess(message: string): void;
    /**
     * Print error message.
     */
    printError(message: string): void;
    /**
     * Print warning message.
     */
    printWarning(message: string): void;
    /**
     * Create a progress bar.
     */
    private createProgressBar;
    /**
     * Format speedup value.
     */
    private formatSpeedup;
    /**
     * Format percentage value.
     */
    private formatPercentage;
    /**
     * Format wave score.
     */
    private formatWaveScore;
    /**
     * Format duration.
     */
    private formatDuration;
    private formatDurationAbs;
    /**
     * Format trend direction.
     */
    private formatTrendDirection;
    /**
     * Format delta value.
     */
    private formatDelta;
}
/**
 * Create a console reporter.
 */
declare function createConsoleReporter(verbose?: boolean): ConsoleReporter;

/**
 * Process Manager
 *
 * Subprocess lifecycle management for benchmark execution.
 */

interface ProcessResult {
    stdout: string;
    stderr: string;
    exitCode: number | null;
    signal: NodeJS.Signals | null;
    durationMs: number;
}
interface StreamingProcess {
    process: ChildProcess;
    stdout: string[];
    stderr: string[];
    promise: Promise<ProcessResult>;
    kill: () => Promise<void>;
}
/**
 * Manages subprocess lifecycle for benchmark execution.
 */
declare class ProcessManager {
    private registry;
    private defaultTimeoutMs;
    constructor(defaultTimeoutMs?: number);
    /**
     * Spawn a process and wait for completion.
     */
    spawn(command: string, args: string[], options?: SpawnOptions & {
        workspaceId?: string;
        timeoutMs?: number;
    }): Promise<ProcessResult>;
    /**
     * Spawn a process with streaming output capture.
     */
    spawnStreaming(command: string, args: string[], options?: SpawnOptions & {
        workspaceId?: string;
        timeoutMs?: number;
        onStdout?: (data: string) => void;
        onStderr?: (data: string) => void;
    }): StreamingProcess;
    /**
     * Kill all processes registered for a workspace.
     */
    killWorkspace(workspaceId: string): Promise<number>;
    /**
     * Kill all registered processes.
     */
    killAll(): Promise<number>;
    /**
     * Get count of active processes.
     */
    getActiveCount(): number;
    /**
     * Get active processes for a workspace.
     */
    getWorkspaceProcesses(workspaceId: string): number[];
}
/**
 * Create a process manager with default settings.
 */
declare function createProcessManager(defaultTimeoutMs?: number): ProcessManager;

/**
 * Workspace Manager
 *
 * Manages isolated workspace environments for benchmark execution.
 */

interface WorkspaceConfig {
    runId: string;
    benchmarkId: BenchmarkId;
    scenario: ScenarioType;
    benchmarksDir: string;
    archiveOnCleanup?: boolean;
}
/**
 * Manages workspace creation, setup, and cleanup for benchmark execution.
 */
declare class WorkspaceManager {
    private processManager;
    private activeWorkspaces;
    constructor(processManager: ProcessManager);
    /**
     * Create and setup a workspace for benchmark execution.
     */
    createWorkspace(config: WorkspaceConfig): Promise<WorkspaceInfo>;
    /**
     * Find the benchmark directory path.
     */
    private findBenchmarkPath;
    /**
     * Make shell scripts executable.
     */
    private makeScriptsExecutable;
    /**
     * Initialize package.json for the workspace.
     */
    private initializePackageJson;
    /**
     * Cleanup a workspace.
     */
    cleanupWorkspace(workspaceId: string, options?: {
        archive?: boolean;
        archivePath?: string;
    }): Promise<void>;
    /**
     * Archive a workspace to a tar.gz file.
     */
    archiveWorkspace(workspacePath: string, archivePath: string): Promise<void>;
    /**
     * Cleanup all active workspaces.
     */
    cleanupAll(): Promise<number>;
    /**
     * Get workspace info.
     */
    getWorkspace(workspaceId: string): WorkspaceInfo | undefined;
    /**
     * List active workspaces.
     */
    listWorkspaces(): WorkspaceInfo[];
    /**
     * Get workspace ID from components.
     */
    static getWorkspaceId(runId: string, scenario: ScenarioType, benchmarkId: BenchmarkId): string;
}
/**
 * Create a workspace manager.
 */
declare function createWorkspaceManager(processManager: ProcessManager): WorkspaceManager;

/**
 * Acceptance Runner
 *
 * Executes acceptance test scripts and parses results.
 */

interface AcceptanceRunnerConfig {
    timeoutMs?: number;
    serverStartupDelayMs?: number;
}
/**
 * Runs acceptance tests for benchmark validation.
 */
declare class AcceptanceRunner {
    private processManager;
    private config;
    constructor(processManager: ProcessManager, config?: AcceptanceRunnerConfig);
    /**
     * Run acceptance tests in a workspace.
     */
    run(workspacePath: string): Promise<AcceptanceResult>;
    /**
     * Find the acceptance test script.
     */
    private findTestScript;
    /**
     * Check if the workspace needs a server running for tests.
     */
    private needsServer;
    /**
     * Start a development server.
     */
    private startServer;
    /**
     * Run the test script.
     */
    private runTestScript;
    /**
     * Parse test output to extract individual test results.
     */
    private parseTestOutput;
    /**
     * Find error context for a failed test.
     */
    private findErrorContext;
    /**
     * Create an empty result for when no tests are found.
     */
    private createEmptyResult;
    /**
     * Delay helper.
     */
    private delay;
}
/**
 * Create an acceptance runner.
 */
declare function createAcceptanceRunner(processManager: ProcessManager, config?: AcceptanceRunnerConfig): AcceptanceRunner;

/**
 * Baseline Executor
 *
 * Executes benchmark using a single Claude Code session (baseline scenario).
 */

interface BaselineExecutorConfig {
    timeoutMs?: number;
    model?: string;
    claudeCliPath?: string;
    retryOnFailure?: boolean;
    verbose?: boolean;
}
/**
 * Executes baseline scenario using single Claude Code session.
 */
declare class BaselineExecutor {
    private processManager;
    private acceptanceRunner;
    private config;
    constructor(processManager: ProcessManager, acceptanceRunner: AcceptanceRunner, config?: BaselineExecutorConfig);
    /**
     * Execute baseline scenario.
     */
    execute(workspace: WorkspaceInfo, collector: MetricsCollector): Promise<ScenarioResult>;
    /**
     * Build a canonical session record from execution output.
     */
    private buildSession;
    /**
     * Assemble a completed scenario result from aggregated metrics.
     */
    private buildResult;
    /**
     * Assemble a failed scenario result with zeroed metrics.
     */
    private buildFailedResult;
    /**
     * Build the prompt for Claude Code.
     */
    private buildPrompt;
    /**
     * Execute Claude Code CLI.
     */
    private executeClaudeCode;
    /**
     * Parse token usage from Claude Code output.
     */
    private parseTokenUsage;
    /**
     * Retry execution after test failures.
     */
    private retryExecution;
}
/**
 * Create a baseline executor.
 */
declare function createBaselineExecutor(processManager: ProcessManager, acceptanceRunner: AcceptanceRunner, config?: BaselineExecutorConfig): BaselineExecutor;

/**
 * DevPilot Executor
 *
 * Executes benchmark using orchestrated parallel sessions (DevPilot scenario).
 */

interface DevPilotExecutorConfig {
    timeoutMs?: number;
    model?: string;
    plannerModel?: string;
    claudeCliPath?: string;
    maxConcurrency?: number;
    retryOnFailure?: boolean;
    verbose?: boolean;
}
/**
 * Executes DevPilot scenario with orchestrated parallel sessions.
 */
declare class DevPilotExecutor {
    private processManager;
    private acceptanceRunner;
    private config;
    constructor(processManager: ProcessManager, acceptanceRunner: AcceptanceRunner, config?: DevPilotExecutorConfig);
    /**
     * Execute DevPilot scenario.
     */
    execute(workspace: WorkspaceInfo, collector: MetricsCollector): Promise<ScenarioResult>;
    /**
     * Assemble a completed scenario result from aggregated metrics.
     */
    private buildResult;
    /**
     * Assemble a failed scenario result with zeroed metrics.
     */
    private buildFailedResult;
    /**
     * Build a canonical session record from execution output.
     */
    private buildSession;
    /**
     * Generate wave plan from PRD.
     */
    private generateWavePlan;
    /**
     * Parse wave plan from Claude output.
     */
    private parseWavePlan;
    /**
     * Convert a raw parsed task object into a canonical PlannedTask.
     */
    private toPlannedTask;
    /**
     * Execute a single wave.
     */
    private executeWave;
    /**
     * Execute a single task.
     */
    private executeTask;
    /**
     * Execute remediation wave for failed tests.
     */
    private executeRemediationWave;
    /**
     * Execute Claude Code CLI.
     */
    private executeClaudeCode;
    /**
     * Parse token usage from output.
     */
    private parseTokenUsage;
    /**
     * Calculate rework ratio.
     */
    private calculateReworkRatio;
}
/**
 * Create a DevPilot executor.
 */
declare function createDevPilotExecutor(processManager: ProcessManager, acceptanceRunner: AcceptanceRunner, config?: DevPilotExecutorConfig): DevPilotExecutor;

/**
 * Runner Module
 *
 * Main benchmark runner orchestration.
 */

interface BenchmarkRunnerConfig {
    benchmarksDir: string;
    resultsDir: string;
    projectRoot?: string;
    parallel?: boolean;
    timeoutMs?: number;
    maxConcurrency?: number;
    claudeCliPath?: string;
    archiveWorkspaces?: boolean;
    verbose?: boolean;
}
/**
 * Main benchmark runner that orchestrates execution.
 */
declare class BenchmarkRunner {
    private config;
    private processManager;
    private workspaceManager;
    private acceptanceRunner;
    private baselineExecutor;
    private devpilotExecutor;
    private resultsWriter;
    private scoringEngine;
    private waveAnalyzer;
    private comparator;
    constructor(config: BenchmarkRunnerConfig);
    /**
     * Run benchmarks.
     */
    run(runConfig: RunConfig): Promise<RunManifest>;
    /**
     * Run a single benchmark.
     */
    private runBenchmark;
    /**
     * Load ground truth files.
     */
    private loadGroundTruths;
    /**
     * Create run summary.
     */
    private createSummary;
    /**
     * Determine overall run status.
     */
    private determineStatus;
}
/**
 * Create a benchmark runner.
 */
declare function createBenchmarkRunner(config: BenchmarkRunnerConfig): BenchmarkRunner;

export { type AcceptanceResult, AcceptanceRunner, type AcceptanceTest, BaselineExecutor, type BenchmarkConfig, BenchmarkConfigSchema, type BenchmarkId, BenchmarkIdSchema, type BenchmarkRun, type BenchmarkRunStatus, BenchmarkRunner, Comparator, type ComparisonResult, type CompositeScore, ConsoleReporter, CostCalculator, type CostEntry, DEFAULT_MODEL_PRICING, DEFAULT_WEIGHTS, DevPilotExecutor, type ExecutionError, type GanttDataPoint, type GroundTruth, type GroundTruthWave, HistoryReader, JsonReporter, MarkdownReporter, MetricsCollector, type ModelPricing, ModelPricingSchema, type ModelTier, ModelTierSchema, type PlannedTask, ProcessManager, type ReportOptions, ResultsWriter, type RunConfig, RunConfigSchema, type RunManifest, SCORING_CONSTANTS, type ScenarioResult, type ScenarioStatus, type ScenarioType, ScenarioTypeSchema, type ScoreComponent, ScoringEngine, type SessionRecord, type TimelineEvent, type TimelineEventType, TimelineRecorder, TokenTracker, type TokenUsage, type TrendAnalysis, TrendAnalyzer, type TrendDirection, type VersionDataPoint, type VersionInfo, type Wave, type WaveAnalysis, WaveAnalyzer, type WaveExecution, type WavePlan, type WorkspaceInfo, WorkspaceManager, addUsage, analyzeTrends, analyzeWavePlan, calculateScore, compareScenarios, createAcceptanceRunner, createBaselineExecutor, createBenchmarkRunner, createComparator, createConsoleReporter, createCostCalculator, createDevPilotExecutor, createEmptyUsage, createHistoryReader, createJsonReporter, createMarkdownReporter, createMetricsCollector, createProcessManager, createResultsWriter, createScoringEngine, createTimelineRecorder, createTimestampPath, createTrendAnalyzer, createWaveAnalyzer, createWorkspaceManager, defineConfig, getModelPricing, getVersionInfo, loadConfig, loadEnvConfig, mergeConfig, parseTimestampPath, sanitizeVersionForPath, toRunConfig };
