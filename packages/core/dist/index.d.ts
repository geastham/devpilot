import { WaveTask } from './db/index.js';
export { ActivityEvent, CompletedTask, ConductorScore, ConflictingFile, Database, DatabaseConfig, DependencyEdge, HorizonItem, InFlightFile, NewActivityEvent, NewCompletedTask, NewConductorScore, NewConflictingFile, NewDependencyEdge, NewHorizonItem, NewInFlightFile, NewPlan, NewRufloSession, NewScoreHistory, NewTask, NewTouchedFile, NewWave, NewWavePlan, NewWavePlanMetric, NewWaveTask, NewWorkstream, Plan, PostgresDatabase, RufloSession, SQLiteDatabase, ScoreHistory, Task, TouchedFile, Wave, WavePlan, WavePlanMetric, Workstream, activityEvents, closeDatabase, completedTasks, completedTasksRelations, conductorScores, conductorScoresRelations, conflictingFiles, conflictingFilesRelations, createDatabase, databaseConfigSchema, dependencyEdges, dependencyEdgesRelations, getDatabase, getDatabaseConfig, horizonItems, horizonItemsRelations, inFlightFiles, inFlightFilesRelations, initDatabase, palaceClosets, palaceClosetsRelations, palaceDiary, palaceDrawers, palaceDrawersRelations, palaceHalls, palaceKgTriples, palaceRooms, palaceRoomsRelations, palaceTunnels, palaceWings, palaceWingsRelations, plans, plansRelations, resetDatabase, rufloSessions, rufloSessionsRelations, scoreHistory, scoreHistoryRelations, tasks, tasksRelations, touchedFiles, touchedFilesRelations, wavePlanMetrics, wavePlanMetricsRelations, wavePlans, wavePlansRelations, waveTasks, waveTasksRelations, waves, wavesRelations, wikiArticles, wikiArticlesRelations, wikiLog, wikiLogRelations, wikiSources, wikiSourcesRelations, workstreams, workstreamsRelations } from './db/index.js';
export { C as Complexity, D as DependencyEdgeType, E as EventType, F as FileStatus, M as Model, O as OrchestratorMode, S as SessionStatus, b as WavePlanStatus, c as WaveStatus, d as WaveTaskStatus, W as WikiArticleStatus, e as WikiLogAction, a as WikiSourceType, Z as Zone, f as complexityValues, g as dependencyEdgeTypeValues, h as eventTypeValues, i as fileStatusValues, m as modelValues, o as orchestratorModeValues, s as sessionStatusValues, w as wavePlanStatusValues, j as waveStatusValues, k as waveTaskStatusValues, l as wikiArticleStatusValues, n as wikiLogActionValues, p as wikiSourceTypeValues, z as zoneValues } from './enums-CbO5o4Mt.js';
import { LinearClient } from '@linear/sdk';
export { i as orchestrator } from './index-BJhi-VPz.js';
import { W as WikiCompiler, I as IngestResult, a as WikiCompilerConfig, b as WikiSessionHook } from './index-D3V2lrfa.js';
export { i as wiki } from './index-D3V2lrfa.js';
import 'zod';
import 'drizzle-orm/better-sqlite3';
import 'drizzle-orm';
import 'drizzle-orm/sqlite-core';
import 'drizzle-orm/postgres-js';

interface ParsedWavePlan {
    waves: ParsedWave[];
    dependencyEdges: ParsedEdge[];
    criticalPath: string[];
    statistics: ParsedStatistics;
    rawMarkdown: string;
}
interface ParsedWave {
    waveIndex: number;
    label: string;
    tasks: ParsedTask[];
}
interface ParsedTask {
    taskCode: string;
    description: string;
    filePaths: string[];
    dependencies: string[];
    canRunInParallel: boolean;
    recommendedModel: 'haiku' | 'sonnet' | 'opus';
    complexity: 'S' | 'M' | 'L' | 'XL';
}
interface ParsedEdge {
    from: string;
    to: string;
    type: 'hard' | 'soft';
}
interface ParsedStatistics {
    totalTasks: number;
    totalWaves: number;
    maxParallelism: number;
    criticalPathLength: number;
    sequentialChains: number;
}
interface ValidationResult {
    valid: boolean;
    errors: ValidationError[];
    warnings: ValidationWarning[];
    correctedPlan?: ParsedWavePlan;
}
interface ValidationError {
    code: ValidationErrorCode;
    message: string;
    taskCodes?: string[];
    detail?: string;
}
type ValidationErrorCode = 'CYCLE_DETECTED' | 'MISSING_DEPENDENCY' | 'NO_ROOT_TASK' | 'EMPTY_PLAN' | 'DUPLICATE_TASK_CODE';
interface ValidationWarning {
    code: ValidationWarningCode;
    message: string;
    taskCodes?: string[];
    detail?: string;
}
type ValidationWarningCode = 'FILE_OVERLAP_SAME_WAVE' | 'DANGLING_DEPENDENCY' | 'ORPHAN_SUBGRAPH' | 'STATISTICS_MISMATCH';
interface CriticalPathResult {
    path: string[];
    length: number;
    annotations: Map<string, CriticalPathAnnotation>;
}
interface CriticalPathAnnotation {
    taskCode: string;
    isOnCriticalPath: boolean;
    distanceFromRoot: number;
    distanceToEnd: number;
    slack: number;
}
interface WaveAssignmentResult {
    waves: AssignedWave[];
    totalWaves: number;
    maxParallelism: number;
    adjustments: WaveAdjustment[];
}
interface AssignedWave {
    waveIndex: number;
    label: string;
    tasks: ParsedTask[];
}
interface WaveAdjustment {
    type: 'FILE_CONFLICT_BUMP' | 'CAPACITY_SPLIT';
    taskCode: string;
    fromWave: number;
    toWave: number;
    reason: string;
}
interface PlanScore {
    parallelizationScore: number;
    maxParallelism: number;
    waveEfficiency: number;
    dependencyDensity: number;
    fileConflictScore: number;
    confidenceSignals: ConfidenceSignalUpdate;
}
interface ConfidenceSignalUpdate {
    parallelization: 'HIGH' | 'MEDIUM' | 'LOW';
    conflictRisk: 'HIGH' | 'MEDIUM' | 'LOW';
}
interface DAGNode {
    taskCode: string;
    inDegree: number;
    outDegree: number;
    dependencies: Set<string>;
    dependents: Set<string>;
    filePaths: Set<string>;
}
interface TopologicalSortResult {
    order: string[];
    valid: boolean;
    cycleParticipants?: string[];
}
interface WavePlannerConfig {
    maxTasksPerWave?: number;
    minParallelizationScore?: number;
    enableAutoCorrection?: boolean;
    strictFileOwnership?: boolean;
}
interface OptimizationResult {
    success: boolean;
    wavePlan?: ParsedWavePlan;
    criticalPath?: CriticalPathResult;
    waveAssignment?: WaveAssignmentResult;
    score?: PlanScore;
    validation?: ValidationResult;
    error?: string;
}
interface PromptContext {
    specContent: string;
    itemTitle: string;
    itemId: string;
    repo: string;
    fleetContext: FleetContextBlock;
    codebaseContext: CodebaseContextBlock;
    constraints: ConstraintBlock;
    memoryContext?: MemoryContextBlock;
    completedWork?: CompletedWorkBlock;
    remainingWork?: RemainingWorkBlock;
}
interface FleetContextBlock {
    availableWorkers: Record<string, number>;
    inFlightFiles: {
        path: string;
        sessionId: string;
        ticketId: string;
        estimatedMinutesRemaining: number;
    }[];
    activeSessions: {
        repo: string;
        ticketId: string;
        progressPercent: number;
        estimatedRemainingMinutes: number;
    }[];
}
interface CodebaseContextBlock {
    fileTree: string;
    recentlyModifiedFiles: string[];
    moduleStructure?: string;
}
interface ConstraintBlock {
    avoidFiles: string[];
    preferModel?: 'haiku' | 'sonnet' | 'opus';
    maxCost?: number;
    maxConcurrency?: number;
    customConstraints: string[];
}
interface MemoryContextBlock {
    relevantSessions: {
        date: string;
        ticketId: string;
        summary: string;
        constraintApplied?: string;
    }[];
    /**
     * Optional MemPalace context — the L0-L3 tiered loading stack.
     *
     * When present, this augments `relevantSessions` with:
     *   - identity (L0): always-loaded project/persona identity
     *   - criticalFacts (L1): always-loaded critical facts
     *   - topicalClosets (L2): on-demand topical recall
     *
     * The wave planner template renders both blocks when available.
     * This field is strictly additive — the Wiki and legacy memory
     * flows continue to work if MemPalace is disabled.
     */
    palace?: {
        identity: string;
        criticalFacts: string[];
        topicalClosets: {
            topic: string;
            summary: string;
            citations: string[];
        }[];
        tokenEstimate: number;
        wingSlug: string;
    };
}
interface CompletedWorkBlock {
    tasks: {
        taskCode: string;
        description: string;
        filesModified: string[];
        completionSummary: string;
    }[];
}
interface RemainingWorkBlock {
    tasks: {
        taskCode: string;
        description: string;
        originalDependencies: string[];
        originalFiles: string[];
    }[];
}
interface GenerationResult {
    content: string;
    tokensInput: number;
    tokensOutput: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
    durationMs: number;
    model: string;
}
interface WaveDispatchRequest {
    wavePlanId: string;
    waveIndex: number;
    taskCode: string;
    taskDescription: string;
    fileScope: string[];
    model: 'haiku' | 'sonnet' | 'opus';
    predecessorContext: PredecessorSummary[];
    constraints: string[];
}
interface PredecessorSummary {
    taskCode: string;
    description: string;
    filesModified: string[];
    completionSummary: string;
}
interface WavePlanExecutionState {
    wavePlanId: string;
    status: 'draft' | 'approved' | 'executing' | 'paused' | 'completed' | 'failed' | 're-optimizing';
    currentWaveIndex: number;
    activeTasks: Map<string, ActiveTaskInfo>;
    completedWaves: number[];
}
interface ActiveTaskInfo {
    taskCode: string;
    wavePlanId: string;
    sessionId: string;
    startedAt: Date;
}
type WaveSSEEvent = {
    type: 'wave_plan_created';
    wavePlanId: string;
    itemId: string;
    totalWaves: number;
} | {
    type: 'wave_dispatching';
    wavePlanId: string;
    waveIndex: number;
    taskCount: number;
} | {
    type: 'wave_task_dispatched';
    wavePlanId: string;
    taskCode: string;
    sessionId: string;
} | {
    type: 'wave_task_complete';
    wavePlanId: string;
    taskCode: string;
    waveIndex: number;
} | {
    type: 'wave_task_failed';
    wavePlanId: string;
    taskCode: string;
    error: string;
} | {
    type: 'wave_complete';
    wavePlanId: string;
    waveIndex: number;
    nextWaveIndex: number | null;
} | {
    type: 'wave_advance';
    wavePlanId: string;
    fromWave: number;
    toWave: number;
} | {
    type: 'wave_plan_complete';
    wavePlanId: string;
    metrics: object;
} | {
    type: 'wave_plan_failed';
    wavePlanId: string;
    failedWave: number;
    failedTask: string;
} | {
    type: 'wave_plan_reoptimizing';
    wavePlanId: string;
    reason: string;
};

/**
 * Topological sort using Kahn's algorithm.
 * Returns the sorted order if the graph is a valid DAG, or indicates cycle detection.
 */
declare function topologicalSort(graph: Map<string, DAGNode>): TopologicalSortResult;
/**
 * Build a DAG graph from parsed tasks and edges.
 */
declare function buildDAGGraph(tasks: ParsedTask[], edges: {
    from: string;
    to: string;
}[]): Map<string, DAGNode>;
/**
 * Group items by a key function.
 */
declare function groupBy<T, K>(items: T[], keyFn: (item: T) => K): Map<K, T[]>;
/**
 * Extract wave number from task code (e.g., "2.3" -> 2, "1.1" -> 1)
 */
declare function extractWaveFromTaskCode(taskCode: string): number;
/**
 * Normalize model name to lowercase enum value.
 */
declare function normalizeModel(raw: string | undefined | null): 'haiku' | 'sonnet' | 'opus';
/**
 * Normalize complexity to uppercase enum value.
 */
declare function normalizeComplexity(raw: string | undefined | null): 'S' | 'M' | 'L' | 'XL';
/**
 * Parse a dependency string into an array of task codes.
 * Handles formats: "None", "1.1", "1.1, 2.1", "1.1; 2.1"
 */
declare function parseDependencies(raw: string | undefined | null): string[];
/**
 * Parse file paths from a string.
 * Handles formats: "file1.ts", "file1.ts, file2.ts", "file1.ts; file2.ts", newline-separated
 */
declare function parseFilePaths(raw: string | undefined | null): string[];
/**
 * Find common theme/words in task descriptions for wave labeling.
 */
declare function findCommonTheme(descriptions: string[]): string | null;
/**
 * Generate a wave label from index and tasks.
 */
declare function generateWaveLabel(originalIndex: number, tasks: ParsedTask[], subIndex?: number): string;
/**
 * Sleep utility for delays.
 */
declare function sleep(ms: number): Promise<void>;

/**
 * Parse Claude's markdown response into structured wave plan data.
 *
 * Expected format:
 * ## Wave 1: Label (N tasks)
 * | Task ID | Description | Files | Dependencies | Parallel? | Model | Complexity |
 * |---------|-------------|-------|--------------|-----------|-------|------------|
 * | 1.1 | ... | ... | ... | Yes | Haiku | S |
 *
 * ## Critical Path
 * 1.1 -> 2.1 -> 3.1
 *
 * ## Statistics
 * | Metric | Value |
 * |--------|-------|
 * | Total Tasks | 10 |
 * | Total Waves | 3 |
 * ...
 */
declare function parseWavePlanResponse(markdown: string): ParsedWavePlan;
/**
 * Helper to extract task codes from a wave plan for validation.
 */
declare function extractAllTaskCodes(plan: ParsedWavePlan): string[];
/**
 * Helper to find a task by its code.
 */
declare function findTaskByCode(plan: ParsedWavePlan, taskCode: string): ParsedTask | undefined;
/**
 * Helper to get all tasks in a specific wave.
 */
declare function getTasksInWave(plan: ParsedWavePlan, waveIndex: number): ParsedTask[];

interface DAGValidatorConfig {
    enableAutoCorrection?: boolean;
    strictFileOwnership?: boolean;
}
/**
 * Validates that the parsed wave plan forms a valid directed acyclic graph
 * with proper file ownership and task structure.
 *
 * @param tasks - Array of parsed tasks
 * @param edges - Array of dependency edges
 * @param config - Optional validation configuration
 * @returns ValidationResult with errors, warnings, and optional corrected plan
 */
declare function validateDAG(tasks: ParsedTask[], edges: ParsedEdge[], config?: DAGValidatorConfig): ValidationResult;

/**
 * Computes the critical path through a DAG of tasks using topological-sort-based
 * dynamic programming.
 *
 * The critical path is the longest path through the dependency graph, representing
 * the minimum time required to complete all tasks even with unlimited parallelism.
 *
 * Algorithm:
 * 1. Build DAG graph from tasks and edges
 * 2. Run topological sort to get valid ordering
 * 3. Forward pass: Compute distanceFromRoot for each task
 * 4. Find terminal node with maximum distance (end of critical path)
 * 5. Backtrack: Build path from end to start using predecessor tracking
 * 6. Backward pass: Compute distanceToEnd for slack calculation
 * 7. Compute slack: slack = (totalLength - 1) - (distFromRoot + distToEnd)
 *
 * @param tasks - Array of parsed tasks
 * @param edges - Array of dependency edges (from -> to)
 * @returns CriticalPathResult containing path, length, and per-task annotations
 */
declare function computeCriticalPath(tasks: ParsedTask[], edges: ParsedEdge[]): CriticalPathResult;

/**
 * Configuration for wave assignment.
 */
interface WaveAssignerConfig {
    maxTasksPerWave?: number;
}
/**
 * Assigns tasks to waves based on dependency depths, resolving file conflicts
 * and applying capacity constraints.
 *
 * Algorithm:
 * 1. Compute wave depths via topological sort
 * 2. Group tasks by depth into initial waves
 * 3. Resolve file conflicts within waves
 * 4. Apply fleet capacity constraints
 *
 * @param tasks - Array of parsed tasks
 * @param edges - Array of dependency edges
 * @param config - Optional configuration
 * @returns WaveAssignmentResult with assigned waves and adjustments
 */
declare function assignWaves(tasks: ParsedTask[], edges: ParsedEdge[], config?: WaveAssignerConfig): WaveAssignmentResult;

/**
 * Computes quality metrics for a wave plan assignment.
 *
 * Metrics:
 * - parallelizationScore: Ratio of parallelizable work (0-1)
 * - maxParallelism: Peak tasks in any wave
 * - waveEfficiency: Average tasks per wave
 * - dependencyDensity: How interconnected the DAG is
 * - fileConflictScore: Ratio of conflict-free file references (0-1)
 * - confidenceSignals: Quality indicators based on scores
 *
 * @param assignment - Wave assignment result
 * @param criticalPathLength - Length of critical path (number of tasks)
 * @param edges - Dependency edges
 * @param tasks - All tasks
 * @returns PlanScore with computed metrics
 */
declare function scorePlan(assignment: WaveAssignmentResult, criticalPathLength: number, edges: ParsedEdge[], tasks: ParsedTask[]): PlanScore;

interface AIClientConfig {
    apiKey: string;
    model: string;
    maxTokens: number;
    timeout?: number;
}
declare class WavePlannerAIClient {
    private client;
    private config;
    constructor(config: AIClientConfig);
    /**
     * Generate a wave plan by calling Claude API
     * @param prompt - The constructed prompt for wave planning
     * @returns Generation result with content and metadata
     */
    generatePlan(prompt: string): Promise<GenerationResult>;
    /**
     * Generate a wave plan with retry logic and exponential backoff
     * @param prompt - The constructed prompt for wave planning
     * @param maxRetries - Maximum number of retry attempts (default: 3)
     * @returns Generation result with content and metadata
     */
    generateWithRetry(prompt: string, maxRetries?: number): Promise<GenerationResult>;
}

/**
 * Creates a flat plan where all tasks are in wave 1 with no dependencies.
 * Used as fallback when Claude response parsing fails.
 *
 * @param tasks - Array of parsed tasks
 * @returns A single-wave plan with all tasks parallelizable
 */
declare function createFlatPlan(tasks: ParsedTask[]): ParsedWavePlan;
/**
 * Creates a flat plan from simple task descriptions.
 * Useful when we have task descriptions but parsing failed entirely.
 *
 * @param descriptions - Array of task description strings
 * @returns A single-wave plan with basic task structures
 */
declare function createFlatPlanFromDescriptions(descriptions: string[]): ParsedWavePlan;

/**
 * FleetContextService
 * Assembles context about the current fleet state for plan generation
 */
declare class FleetContextService {
    /**
     * Assemble fleet context for a target repository
     * Queries active sessions and in-flight files to determine available capacity
     *
     * @param targetRepo - The repository to check fleet context for
     * @returns FleetContextBlock with available workers, in-flight files, and active sessions
     */
    assembleContext(targetRepo: string): Promise<FleetContextBlock>;
    /**
     * Extract file paths that should be avoided from fleet context
     * These files are currently being worked on by other sessions
     *
     * @param fleetContext - The fleet context block
     * @returns Array of file paths to avoid
     */
    getAvoidFiles(fleetContext: FleetContextBlock): string[];
}

/**
 * CodebaseContextService
 * Assembles context about the codebase structure and recent changes
 */
declare class CodebaseContextService {
    /**
     * Assemble codebase context for a repository
     * Generates file tree and identifies recently modified files
     *
     * @param repo - The repository identifier
     * @param workingDir - The working directory path for the repository
     * @returns CodebaseContextBlock with file tree and recently modified files
     */
    assembleContext(repo: string, workingDir: string): Promise<CodebaseContextBlock>;
    /**
     * Generate an ASCII file tree representation of the directory
     * Excludes common build artifacts and dependencies
     *
     * @param dir - The directory to generate the tree for
     * @param maxDepth - Maximum depth to traverse (default: 3)
     * @returns ASCII file tree string
     */
    private generateFileTree;
    /**
     * Get recently modified files using git or file system stats
     * Prefers git for better accuracy
     *
     * @param dir - The directory to check
     * @param limit - Maximum number of files to return (default: 20)
     * @returns Array of file paths (relative to the working directory)
     */
    private getRecentlyModifiedFiles;
    /**
     * Fallback method to get recently modified files using file system stats
     *
     * @param dir - The directory to check
     * @param limit - Maximum number of files to return
     * @returns Array of file paths (relative to the working directory)
     */
    private getRecentlyModifiedFilesByStats;
}

/**
 * Base interface for all wave planner prompt templates.
 * Templates render structured prompts that guide Claude to generate
 * wave-decomposed execution plans.
 */
interface PromptTemplate {
    /** Human-readable template identifier */
    name: string;
    /** Template version for tracking iterations */
    version: string;
    /**
     * Renders the complete prompt string from the given context.
     * @param context - All relevant context for plan generation
     * @returns Formatted prompt string ready for Claude API
     */
    render(context: PromptContext): string;
}
/**
 * Extended template interface for refinement operations.
 * Used when iteratively improving existing plans.
 */
interface RefinementPromptTemplate extends PromptTemplate {
    /**
     * Renders a refinement prompt with additional context about the current plan.
     * @param context - Base prompt context
     * @param currentPlan - The existing plan to improve (markdown format)
     * @param currentScore - Quality score of the current plan (0-1)
     * @returns Formatted refinement prompt
     */
    renderRefinement(context: PromptContext, currentPlan: string, currentScore: number): string;
}

/** Memory tier for the L0-L3 loading stack. */
type MemoryTier = 0 | 1 | 2 | 3;
/** Type of memory captured in a drawer. */
type MemoryType = 'fact' | 'event' | 'discovery' | 'preference' | 'advice' | 'decision';
/** Type of wing — projects are primary, personas are optional. */
type WingType = 'project' | 'persona' | 'scratch';
/** Hall relationship types between rooms in the same wing. */
type HallRelation = 'depends_on' | 'related_to' | 'supersedes' | 'contradicts';
/** Source of a drawer — provenance tracking. */
interface DrawerSource {
    /** e.g. "wiki_article", "session_log", "commit", "spec", "manual" */
    kind: string;
    /** e.g. wiki slug, session id, commit sha */
    ref: string;
}
/** A wing — top-level memory grouping. */
interface Wing {
    id: string;
    slug: string;
    name: string;
    wingType: WingType;
    repo?: string;
    description?: string;
}
/** A room — topic-specific storage within a wing. */
interface Room {
    id: string;
    wingId: string;
    slug: string;
    name: string;
    topic: string;
    description?: string;
}
/** A drawer — verbatim original content, never summarized. */
interface Drawer {
    id: string;
    roomId: string;
    memoryType: MemoryType;
    label: string;
    content: string;
    aaakContent?: string;
    contentHash: string;
    source?: DrawerSource;
    tags: string[];
    salience: number;
    createdAt: Date;
}
/** A closet — compressed summary pointing back to drawers. */
interface Closet {
    id: string;
    roomId: string;
    summary: string;
    drawerIds: string[];
    tier: MemoryTier;
    tokenCost: number;
}
/** A hall — typed relationship between rooms. */
interface Hall {
    id: string;
    wingId: string;
    fromRoomId: string;
    toRoomId: string;
    relation: HallRelation;
    weight: number;
}
/** A tunnel — cross-wing reference. */
interface Tunnel {
    id: string;
    fromRoomId: string;
    toRoomId: string;
    reason?: string;
}
/** A knowledge graph triple with temporal validity. */
interface KgTriple {
    id: string;
    wingId: string;
    subject: string;
    predicate: string;
    object: string;
    validFrom: Date;
    validUntil?: Date;
    sourceDrawerId?: string;
    confidence: number;
}
interface AddDrawerInput {
    wingSlug: string;
    roomSlug: string;
    /** Room is auto-created if it doesn't exist */
    roomName?: string;
    roomTopic?: string;
    memoryType: MemoryType;
    label: string;
    content: string;
    aaakContent?: string;
    source?: DrawerSource;
    tags?: string[];
    salience?: number;
}
interface AddDrawerResult {
    drawerId: string;
    created: boolean;
    roomId: string;
    wingId: string;
}
interface SearchInput {
    wingSlug?: string;
    query: string;
    topic?: string;
    memoryTypes?: MemoryType[];
    limit?: number;
}
interface SearchHit {
    drawerId: string;
    roomSlug: string;
    wingSlug: string;
    label: string;
    snippet: string;
    score: number;
    memoryType: MemoryType;
    source?: DrawerSource;
}
interface SearchResult {
    hits: SearchHit[];
    totalScanned: number;
}
interface KgAddInput {
    wingSlug: string;
    subject: string;
    predicate: string;
    object: string;
    validFrom?: Date;
    sourceDrawerId?: string;
    confidence?: number;
}
interface KgQueryInput {
    wingSlug: string;
    subject?: string;
    predicate?: string;
    object?: string;
    /** If true, only return triples currently valid */
    currentOnly?: boolean;
}
interface KgInvalidateInput {
    wingSlug: string;
    subject: string;
    predicate: string;
    reason?: string;
}
interface KgContradiction {
    subject: string;
    predicate: string;
    oldObject: string;
    newObject: string;
    oldDrawerId?: string;
    newDrawerId?: string;
    detectedAt: Date;
}
interface WakeUpInput {
    wingSlug: string;
    /** Optional topic hint to bias which critical facts get loaded */
    topic?: string;
}
/** L0 + L1 context — always loaded, ~170 tokens. */
interface WakeUpResult {
    /** L0 — identity, ~50 tokens */
    identity: string;
    /** L1 — critical facts, ~120 tokens */
    criticalFacts: string[];
    tokenEstimate: number;
}
interface RecallInput {
    wingSlug: string;
    topic: string;
    limit?: number;
}
/** L2 — on-demand topical recall. */
interface RecallResult {
    topic: string;
    closets: Closet[];
    tokenEstimate: number;
}
/** MemPalace client mode. */
type MemPalaceMode = 'local' | 'mcp' | 'disabled';
interface MemPalaceConfig {
    /** Active mode. "local" uses the SQLite shim, "mcp" uses an external MemPalace MCP server, "disabled" is a no-op. */
    mode: MemPalaceMode;
    /** Default wing slug — usually the repo identifier */
    defaultWingSlug: string;
    /** Default wing human name */
    defaultWingName?: string;
    /** Optional MCP endpoint (e.g. local Unix socket or HTTP) when mode=mcp */
    mcpEndpoint?: string;
    /** Repository this palace is bound to */
    repo?: string;
}
/**
 * Rendered MemPalace context for injection into wave planner prompts.
 * This replaces/augments the flat `MemoryContextBlock.relevantSessions`
 * with a tiered L0-L3 loading stack.
 */
interface PalaceContextBlock {
    /** L0 — identity string, always loaded */
    identity: string;
    /** L1 — critical facts, always loaded */
    criticalFacts: string[];
    /** L2 — topical closets, loaded on topic match */
    topicalClosets: {
        topic: string;
        summary: string;
        citations: string[];
    }[];
    /** Approximate token cost of this block */
    tokenEstimate: number;
    /** Wing the context was drawn from */
    wingSlug: string;
}

/**
 * MemPalaceClient is the abstraction over the memory backend.
 *
 * Three implementations ship with DevPilot:
 *   - LocalShimClient: SQLite-backed, self-contained, no external dependencies
 *   - McpAdapterClient: routes to a real MemPalace MCP server when present
 *   - DisabledClient: no-op, returns empty results (useful for tests)
 *
 * The service layer (MemPalaceService) selects an implementation based on
 * MemPalaceConfig.mode. Callers should not instantiate clients directly —
 * use `createMemPalaceClient()` below.
 */
interface MemPalaceClient {
    readonly mode: 'local' | 'mcp' | 'disabled';
    /** Ensure a wing exists, creating it if necessary. */
    ensureWing(slug: string, name?: string, repo?: string): Promise<Wing>;
    /** Add a drawer (verbatim content). Deduplicated by content hash. */
    addDrawer(input: AddDrawerInput): Promise<AddDrawerResult>;
    /** Search drawers by query. */
    search(input: SearchInput): Promise<SearchResult>;
    /** L0+L1 wake-up — always-loaded context. */
    wakeUp(input: WakeUpInput): Promise<WakeUpResult>;
    /** L2 topical recall. */
    recall(input: RecallInput): Promise<RecallResult>;
    /** Add a KG triple. Auto-detects contradictions. */
    kgAdd(input: KgAddInput): Promise<{
        tripleId: string;
        contradictions: KgContradiction[];
    }>;
    /** Query KG triples. */
    kgQuery(input: KgQueryInput): Promise<KgTriple[]>;
    /** Invalidate KG triples matching subject+predicate. */
    kgInvalidate(input: KgInvalidateInput): Promise<{
        invalidatedCount: number;
    }>;
    /** List wings. */
    listWings(): Promise<Wing[]>;
    /** List rooms in a wing. */
    listRooms(wingSlug: string): Promise<Room[]>;
}
/**
 * LocalShimClient is a pure-SQLite implementation of MemPalaceClient.
 * It provides MemPalace's API surface without requiring the external MCP
 * server. Retrieval is keyword-based (no embeddings), which trades recall
 * quality for zero external dependencies. When higher-quality retrieval is
 * needed, configure `mode: 'mcp'` and point at a real MemPalace instance.
 */
declare class LocalShimClient implements MemPalaceClient {
    readonly mode: "local";
    ensureWing(slug: string, name?: string, repo?: string): Promise<Wing>;
    addDrawer(input: AddDrawerInput): Promise<AddDrawerResult>;
    search(input: SearchInput): Promise<SearchResult>;
    wakeUp(input: WakeUpInput): Promise<WakeUpResult>;
    recall(input: RecallInput): Promise<RecallResult>;
    kgAdd(input: KgAddInput): Promise<{
        tripleId: string;
        contradictions: KgContradiction[];
    }>;
    kgQuery(input: KgQueryInput): Promise<KgTriple[]>;
    kgInvalidate(input: KgInvalidateInput): Promise<{
        invalidatedCount: number;
    }>;
    listWings(): Promise<Wing[]>;
    listRooms(wingSlug: string): Promise<Room[]>;
    private ensureRoom;
    private rowToWing;
    private rowToRoom;
    private rowToCloset;
}
/**
 * McpAdapterClient forwards calls to a MemPalace MCP server running as a
 * sidecar. The actual MCP transport is injected by the host application
 * (Claude Code, a devpilot CLI, etc.) so this module stays pure.
 *
 * The transport is just a function that takes a tool name and arguments
 * and returns the parsed JSON response. Wire it up at startup:
 *
 *   const client = new McpAdapterClient({
 *     endpoint: '...',
 *     transport: async (tool, args) => mcpCall('mempalace', tool, args)
 *   });
 */
interface McpTransport {
    (toolName: string, args: Record<string, unknown>): Promise<unknown>;
}
declare class McpAdapterClient implements MemPalaceClient {
    readonly mode: "mcp";
    private transport;
    constructor(transport: McpTransport);
    ensureWing(slug: string, name?: string, repo?: string): Promise<Wing>;
    addDrawer(input: AddDrawerInput): Promise<AddDrawerResult>;
    search(input: SearchInput): Promise<SearchResult>;
    wakeUp(input: WakeUpInput): Promise<WakeUpResult>;
    recall(input: RecallInput): Promise<RecallResult>;
    kgAdd(input: KgAddInput): Promise<{
        tripleId: string;
        contradictions: KgContradiction[];
    }>;
    kgQuery(input: KgQueryInput): Promise<KgTriple[]>;
    kgInvalidate(input: KgInvalidateInput): Promise<{
        invalidatedCount: number;
    }>;
    listWings(): Promise<Wing[]>;
    listRooms(wingSlug: string): Promise<Room[]>;
}
declare class DisabledClient implements MemPalaceClient {
    readonly mode: "disabled";
    ensureWing(slug: string, name?: string): Promise<Wing>;
    addDrawer(input: AddDrawerInput): Promise<AddDrawerResult>;
    search(): Promise<SearchResult>;
    wakeUp(input: WakeUpInput): Promise<WakeUpResult>;
    recall(input: RecallInput): Promise<RecallResult>;
    kgAdd(): Promise<{
        tripleId: string;
        contradictions: KgContradiction[];
    }>;
    kgQuery(): Promise<KgTriple[]>;
    kgInvalidate(): Promise<{
        invalidatedCount: number;
    }>;
    listWings(): Promise<Wing[]>;
    listRooms(): Promise<Room[]>;
}
declare function createMemPalaceClient(config: MemPalaceConfig, mcpTransport?: McpTransport): MemPalaceClient;
/** Rough token estimate — 4 chars ≈ 1 token. */
declare function estimateTokens(text: string): number;

/**
 * MemPalaceService is the primary entry point for callers who want to use
 * MemPalace without worrying about which backend is active. It:
 *
 *   1. Holds a single MemPalaceClient (local, mcp, or disabled)
 *   2. Assembles PalaceContextBlocks for wave planner prompts
 *   3. Coordinates ingestion from sources (wiki, session logs, commits)
 *
 * It does NOT own:
 *   - The Wiki system (that keeps its own compiler, its own /wiki folder,
 *     its own backlink maintenance). The service only *reads* from the
 *     wiki and *writes* drawer copies into MemPalace.
 *   - Session capture (the session hook owns that and delegates to both
 *     the Wiki compiler and this service).
 *
 * The Wiki remains the canonical human-readable documentation layer.
 * MemPalace remains the canonical structured-retrieval / prompt-injection
 * layer. They are complementary.
 */
declare class MemPalaceService {
    readonly client: MemPalaceClient;
    private config;
    constructor(config: MemPalaceConfig, mcpTransport?: McpTransport);
    get enabled(): boolean;
    /**
     * Assemble a PalaceContextBlock for injection into wave planner prompts.
     *
     * - L0 (always): identity
     * - L1 (always): critical facts
     * - L2 (on-demand): topical recall for hints derived from the task
     * - L3 (deep search): only triggered by explicit queries elsewhere
     *
     * Returns null if the service is disabled or has no content to inject.
     */
    assemblePromptContext(options: {
        wingSlug?: string;
        topicHints?: string[];
        maxTokens?: number;
    }): Promise<PalaceContextBlock | null>;
    /**
     * Add a drawer to MemPalace. Convenience wrapper that fills in the
     * default wing slug when callers don't specify one.
     */
    addDrawer(input: Omit<AddDrawerInput, 'wingSlug'> & {
        wingSlug?: string;
    }): Promise<void>;
    /**
     * Add a KG triple to the default wing. Returns any contradictions
     * detected during insertion so the caller can decide what to do.
     */
    addFact(input: {
        subject: string;
        predicate: string;
        object: string;
        sourceDrawerId?: string;
        confidence?: number;
        wingSlug?: string;
    }): Promise<{
        tripleId: string;
        contradictions: KgContradiction[];
    }>;
    /**
     * Convenience search across the default wing.
     */
    quickSearch(query: string, limit?: number): Promise<SearchHit[]>;
    /**
     * Render a PalaceContextBlock as a markdown snippet suitable for
     * injecting into a prompt template.
     */
    static renderBlock(block: PalaceContextBlock | null | undefined): string;
}
/**
 * Factory helper.
 */
declare function createMemPalaceService(config: MemPalaceConfig, mcpTransport?: McpTransport): MemPalaceService;

interface PromptConstructorConfig {
    /** Working directory for codebase context */
    workingDir: string;
    /** Maximum concurrency per wave */
    maxConcurrency?: number;
    /** Preferred model for tasks */
    preferModel?: 'haiku' | 'sonnet' | 'opus';
    /** Maximum cost in USD */
    maxCost?: number;
    /** Custom constraints to include in prompt */
    customConstraints?: string[];
    /** Which template to use */
    template?: 'default' | 'simplified' | 'refinement';
    /**
     * Optional MemPalace wing slug override. When omitted, the service's
     * default wing (usually the repo identifier) is used.
     */
    memPalaceWingSlug?: string;
    /**
     * Optional topic hints passed to MemPalace L2 recall. Typically derived
     * from the spec content or ticket metadata (e.g. ["auth", "billing"]).
     */
    memPalaceTopicHints?: string[];
    /**
     * Token budget for MemPalace context block. Defaults to 2000.
     */
    memPalaceMaxTokens?: number;
}
/**
 * PromptConstructor assembles complete prompt context from various services
 * and renders prompts using the appropriate template.
 *
 * Responsibilities:
 * - Gather fleet context (active sessions, in-flight files)
 * - Gather codebase context (file tree, recently modified files)
 * - Assemble constraints
 * - Select and render appropriate template
 */
declare class PromptConstructor {
    private fleetContextService;
    private codebaseContextService;
    private templates;
    private memPalaceService?;
    constructor(options?: {
        memPalaceService?: MemPalaceService;
    });
    /**
     * Attach (or replace) the MemPalace service after construction.
     * Useful for wiring in dependency-injection-style contexts.
     */
    setMemPalaceService(service: MemPalaceService | undefined): void;
    /**
     * Assemble full prompt context from services and configuration.
     *
     * @param specContent - The specification content to plan
     * @param itemTitle - Title of the horizon item
     * @param itemId - ID of the horizon item
     * @param repo - Repository identifier
     * @param config - Constructor configuration
     * @returns Complete PromptContext ready for template rendering
     */
    assembleContext(specContent: string, itemTitle: string, itemId: string, repo: string, config: PromptConstructorConfig): Promise<PromptContext>;
    /**
     * Assemble MemoryContextBlock. Currently produces only the palace
     * portion; the legacy `relevantSessions` list is left empty for
     * callers that don't supply one (the wave planner then only renders
     * the palace block).
     */
    private assembleMemoryContext;
    /**
     * Assemble constraints from configuration and fleet context.
     */
    private assembleConstraints;
    /**
     * Construct a full prompt for wave plan generation.
     *
     * @param specContent - The specification content to plan
     * @param itemTitle - Title of the horizon item
     * @param itemId - ID of the horizon item
     * @param repo - Repository identifier
     * @param config - Constructor configuration
     * @returns Rendered prompt string ready for Claude API
     */
    constructPrompt(specContent: string, itemTitle: string, itemId: string, repo: string, config: PromptConstructorConfig): Promise<string>;
    /**
     * Construct a refinement prompt for improving an existing plan.
     *
     * @param specContent - The specification content
     * @param itemTitle - Title of the horizon item
     * @param itemId - ID of the horizon item
     * @param repo - Repository identifier
     * @param config - Constructor configuration
     * @param currentPlan - Current plan markdown to refine
     * @param currentScore - Current parallelization score (0-1)
     * @returns Rendered refinement prompt
     */
    constructRefinementPrompt(specContent: string, itemTitle: string, itemId: string, repo: string, config: PromptConstructorConfig, currentPlan: string, currentScore: number): Promise<string>;
    /**
     * Construct a reoptimization prompt for mid-execution replanning.
     *
     * @param specContent - The specification content
     * @param itemTitle - Title of the horizon item
     * @param itemId - ID of the horizon item
     * @param repo - Repository identifier
     * @param config - Constructor configuration
     * @param completedTasks - Summary of completed tasks
     * @param remainingTasks - Remaining tasks to replan
     * @returns Rendered reoptimization prompt
     */
    constructReoptimizePrompt(specContent: string, itemTitle: string, itemId: string, repo: string, config: PromptConstructorConfig, completedTasks: {
        taskCode: string;
        description: string;
        filesModified: string[];
        completionSummary: string;
    }[], remainingTasks: {
        taskCode: string;
        description: string;
        originalDependencies: string[];
        originalFiles: string[];
    }[]): Promise<string>;
    /**
     * Get available template names.
     */
    getAvailableTemplates(): string[];
    /**
     * Register a custom template.
     */
    registerTemplate(name: string, template: PromptTemplate): void;
}
/**
 * Create a prompt constructor instance.
 * Convenience factory function.
 */
declare function createPromptConstructor(options?: {
    memPalaceService?: MemPalaceService;
}): PromptConstructor;

interface PlanRefinementConfig {
    /** Minimum parallelization score to accept (0-1) */
    minParallelizationScore: number;
    /** Maximum refinement iterations */
    maxRefinementIterations: number;
    /** Whether to use simplified template on retry */
    useSimplifiedOnRetry: boolean;
    /** Maximum tasks per wave for capacity constraints */
    maxTasksPerWave?: number;
}
interface RefinementResult {
    /** Final optimized plan */
    plan: ParsedWavePlan;
    /** Quality score of the plan */
    score: PlanScore;
    /** Number of refinement iterations performed */
    iterationsPerformed: number;
    /** Total tokens used across all iterations */
    totalTokensUsed: number;
    /** Whether refinement was successful */
    success: boolean;
    /** Error message if refinement failed */
    error?: string;
}
/**
 * PlanRefinementService handles iterative refinement of wave plans.
 *
 * Responsibilities:
 * - Generate initial plan via AI
 * - Validate and score the plan
 * - Iteratively refine if below quality threshold
 * - Fall back to flat plan on complete failure
 */
declare class PlanRefinementService {
    private promptConstructor;
    private aiClient;
    private config;
    constructor(aiClientConfig: AIClientConfig, refinementConfig?: Partial<PlanRefinementConfig>);
    /**
     * Generate and refine a wave plan until quality threshold is met.
     *
     * @param specContent - Specification content to plan
     * @param itemTitle - Title of the horizon item
     * @param itemId - ID of the horizon item
     * @param repo - Repository identifier
     * @param constructorConfig - Prompt constructor configuration
     * @returns Refinement result with final plan and metrics
     */
    generateAndRefine(specContent: string, itemTitle: string, itemId: string, repo: string, constructorConfig: PromptConstructorConfig): Promise<RefinementResult>;
    /**
     * Generate initial plan without refinement.
     */
    private generateInitialPlan;
    /**
     * Refine an existing plan to improve parallelization.
     */
    private refineplan;
    /**
     * Score a parsed wave plan.
     */
    private scorePlan;
    /**
     * Create a fallback flat plan from specification.
     * This is a last resort when AI generation completely fails.
     */
    private createFallbackPlan;
    /**
     * Extract task descriptions from specification text.
     * Simple heuristic parser for numbered/bulleted lists.
     */
    private extractTasksFromSpec;
}
/**
 * Create a plan refinement service instance.
 */
declare function createPlanRefinementService(aiClientConfig: AIClientConfig, refinementConfig?: Partial<PlanRefinementConfig>): PlanRefinementService;

interface WavePlanGeneratorConfig {
    /** AI client configuration */
    aiClient: AIClientConfig;
    /** Plan refinement configuration */
    refinement?: Partial<PlanRefinementConfig>;
    /** Wave assigner configuration */
    waveAssigner?: WaveAssignerConfig;
    /** Whether to auto-persist plans to database */
    autoPersist?: boolean;
}
interface WavePlanGenerationResult {
    /** Generated wave plan ID (if persisted) */
    wavePlanId?: string;
    /** Parsed wave plan */
    wavePlan: ParsedWavePlan;
    /** Critical path analysis */
    criticalPath: CriticalPathResult;
    /** Wave assignment with adjustments */
    waveAssignment: WaveAssignmentResult;
    /** Plan quality score */
    score: PlanScore;
    /** Generation metrics */
    metrics: {
        totalTokensUsed: number;
        refinementIterations: number;
        generationDurationMs: number;
    };
    /** Whether generation was successful */
    success: boolean;
    /** Error or warning message */
    message?: string;
}
/**
 * WavePlanGenerator orchestrates the full wave plan generation pipeline:
 * 1. Construct prompt from context
 * 2. Generate plan via AI
 * 3. Parse and validate response
 * 4. Compute critical path
 * 5. Assign waves with conflict resolution
 * 6. Score the plan
 * 7. Refine if needed
 * 8. Persist to database
 */
declare class WavePlanGenerator {
    private refinementService;
    private config;
    constructor(config: WavePlanGeneratorConfig);
    /**
     * Generate a complete wave plan for a horizon item.
     *
     * @param horizonItemId - ID of the horizon item
     * @param planId - ID of the associated plan
     * @param specContent - Specification content to plan
     * @param itemTitle - Title of the horizon item
     * @param repo - Repository identifier
     * @param constructorConfig - Prompt constructor configuration
     * @returns Complete generation result with persisted plan
     */
    generate(horizonItemId: string, planId: string, specContent: string, itemTitle: string, repo: string, constructorConfig: PromptConstructorConfig): Promise<WavePlanGenerationResult>;
    /**
     * Generate a fallback flat plan when AI generation fails.
     */
    private generateFallbackPlan;
    /**
     * Persist a wave plan to the database.
     */
    private persistWavePlan;
    /**
     * Extract task descriptions from specification text.
     */
    private extractTaskDescriptions;
    /**
     * Reoptimize an existing wave plan mid-execution.
     *
     * @param wavePlanId - ID of the wave plan to reoptimize
     * @param specContent - Original specification content
     * @param itemTitle - Title of the horizon item
     * @param repo - Repository identifier
     * @param constructorConfig - Prompt constructor configuration
     * @returns New wave plan generation result
     */
    reoptimize(wavePlanId: string, specContent: string, itemTitle: string, repo: string, constructorConfig: PromptConstructorConfig): Promise<WavePlanGenerationResult>;
}
/**
 * Create a wave plan generator instance.
 */
declare function createWavePlanGenerator(config: WavePlanGeneratorConfig): WavePlanGenerator;
/**
 * Generate a wave plan with default configuration.
 * Convenience function for simple use cases.
 */
declare function generateWavePlan(horizonItemId: string, planId: string, specContent: string, itemTitle: string, repo: string, workingDir: string, apiKey: string): Promise<WavePlanGenerationResult>;

/**
 * Default wave planner prompt template.
 * Generates comprehensive wave-decomposed execution plans with:
 * - Task decomposition into independent waves
 * - Dependency graph construction
 * - Critical path identification
 * - Parallelization optimization
 */
declare const defaultTemplate: PromptTemplate;

/**
 * Simplified wave planner prompt template.
 * Used as a fallback when the default template produces unparseable results.
 * Focuses on minimal instructions and clear output format.
 */
declare const simplifiedTemplate: PromptTemplate;

/**
 * Refinement prompt template for improving low-quality wave plans.
 * Used when initial plans have poor parallelization scores or other quality issues.
 * Focuses on increasing parallelism and reducing critical path length.
 */
declare const refinementTemplate: RefinementPromptTemplate;

interface WaveExecutionConfig {
    maxConcurrentSubagents: number;
    maxTotalActiveTasks: number;
    subagentDispatchDelayMs: number;
    waveAdvanceDelayMs: number;
    retryLimit: number;
    failurePolicy: 'halt' | 'continue';
    autoAdvance: boolean;
}
interface DispatchResult {
    dispatched: number;
    queued: number;
    errors: DispatchError[];
}
interface DispatchError {
    taskCode: string;
    error: string;
}
interface FleetCapacity {
    totalWorkers: number;
    activeWorkers: number;
    availableWorkers: number;
    canDispatch: boolean;
}
interface WaveProgress {
    waveIndex: number;
    totalTasks: number;
    completedTasks: number;
    runningTasks: number;
    failedTasks: number;
    status: 'pending' | 'dispatching' | 'active' | 'completed' | 'failed';
}

/**
 * ConcurrencyManager
 *
 * Manages concurrency limits for wave plan execution:
 * - Tracks active tasks across all wave plans
 * - Enforces maxTotalActiveTasks (global limit)
 * - Enforces maxConcurrentSubagents (per-plan limit)
 * - Provides checks before dispatching new tasks
 */
declare class ConcurrencyManager {
    private activeTasks;
    private config;
    constructor(config: {
        maxConcurrentSubagents: number;
        maxTotalActiveTasks: number;
    });
    /**
     * Check if we can dispatch additional tasks globally
     * @param count - Number of tasks to dispatch (default: 1)
     * @returns true if dispatch is allowed
     */
    canDispatch(count?: number): boolean;
    /**
     * Check if a specific wave plan can accept more dispatches
     * @param wavePlanId - The wave plan to check
     * @returns true if the plan can accept more tasks
     */
    canDispatchToWave(wavePlanId: string): boolean;
    /**
     * Register a new active task
     * @param taskCode - Unique task identifier
     * @param wavePlanId - Parent wave plan ID
     * @param sessionId - Execution session ID
     */
    registerTask(taskCode: string, wavePlanId: string, sessionId: string): void;
    /**
     * Unregister a completed or failed task
     * @param taskCode - Task identifier to remove
     */
    unregisterTask(taskCode: string): void;
    /**
     * Get total number of active tasks across all plans
     * @returns Count of active tasks
     */
    getActiveTasks(): number;
    /**
     * Get all active task codes for a specific wave plan
     * @param wavePlanId - Wave plan to query
     * @returns Array of task codes
     */
    getActiveTasksForPlan(wavePlanId: string): string[];
    /**
     * Get detailed info for a specific active task
     * @param taskCode - Task to query
     * @returns Task info or undefined if not active
     */
    getActiveTaskInfo(taskCode: string): ActiveTaskInfo | undefined;
    /**
     * Get all active tasks (for debugging/monitoring)
     * @returns Map of all active tasks
     */
    getAllActiveTasks(): Map<string, ActiveTaskInfo>;
    /**
     * Reset the manager (useful for testing)
     */
    reset(): void;
}

/**
 * CompletionListener handles task completion events from the orchestrator.
 * It updates task statuses, tracks completion, and determines when waves are complete.
 */
declare class CompletionListener {
    private onWaveComplete;
    private db;
    constructor(onWaveComplete: (wavePlanId: string, waveIndex: number) => Promise<void>);
    /**
     * Handle task started event.
     * Updates the wave task status to 'running' and records start time.
     */
    handleTaskStarted(wavePlanId: string, taskCode: string, sessionId: string): Promise<void>;
    /**
     * Handle task completion event.
     * Updates task status, stores completion summary, and checks if wave is complete.
     */
    handleTaskComplete(wavePlanId: string, taskCode: string, completionSummary?: string): Promise<void>;
    /**
     * Handle task failure event.
     * Updates task status based on retry count and emits failure event.
     */
    handleTaskFailed(wavePlanId: string, taskCode: string, error: string, retryCount: number): Promise<void>;
    /**
     * Check if all tasks in a wave are complete.
     * Returns true if all tasks are in a terminal state (completed, failed, or skipped).
     */
    private checkWaveCompletion;
    /**
     * Emit a wave execution event to the activity_events table.
     */
    private emitEvent;
}

/**
 * Auto-advance to the next wave after completing the current wave.
 * Handles final metrics collection if this is the last wave.
 */
declare function autoAdvanceWave(wavePlanId: string, completedWaveIndex: number, config: WaveExecutionConfig): Promise<void>;
/**
 * Mark the wave plan as completed.
 * Updates status and sets completion timestamp.
 */
declare function markWavePlanComplete(wavePlanId: string): Promise<void>;
/**
 * Collect final metrics for the completed wave plan.
 * Calculates performance statistics and stores them in wave_plan_metrics.
 */
declare function collectFinalMetrics(wavePlanId: string): Promise<void>;
/**
 * Advance to the next wave.
 * Updates the wave plan's current wave index and marks the next wave as pending.
 */
declare function advanceToNextWave(wavePlanId: string, nextWaveIndex: number): Promise<void>;

/**
 * WaveDispatchCoordinator
 *
 * Handles batch dispatching of wave tasks with:
 * - Fleet capacity checking
 * - Batch processing with staggering
 * - Predecessor context gathering
 * - Dispatch request building
 */
declare class WaveDispatchCoordinator {
    private config;
    private db;
    constructor(config: WaveExecutionConfig);
    /**
     * Dispatch a wave of tasks
     * Checks fleet capacity, builds dispatch requests, and dispatches in batches with staggering
     */
    dispatchWave(wavePlanId: string, waveIndex: number, tasks: WaveTask[]): Promise<DispatchResult>;
    /**
     * Build a dispatch request for a task
     * Includes task details, file scope, model, predecessor context, and constraints
     */
    buildDispatchRequest(task: WaveTask, predecessorContext: PredecessorSummary[]): WaveDispatchRequest;
    /**
     * Get predecessor context for a task
     * Fetches completion summaries for task's dependencies
     */
    getPredecessorContext(wavePlanId: string, taskCode: string): Promise<PredecessorSummary[]>;
    /**
     * Check fleet capacity
     * Returns available workers and whether new tasks can be dispatched
     */
    private checkFleetCapacity;
    /**
     * Dispatch to orchestrator
     * Placeholder for integration with external orchestrator
     * TODO: Implement actual dispatch to orchestrator service
     */
    private dispatchToOrchestrator;
    /**
     * Map database model enum to dispatch model format
     */
    private mapModelToDispatchModel;
    /**
     * Delay helper for staggering dispatches
     */
    private delay;
}

/**
 * WaveExecutionController
 *
 * Manages the lifecycle of wave plan execution with state machine transitions:
 * - draft → approved (on approve)
 * - approved → executing (on first dispatch)
 * - executing → paused (on pause)
 * - executing → completed (all waves done)
 * - executing → failed (task failure with halt policy)
 * - paused → executing (on resume)
 * - any → re-optimizing (on reoptimize request)
 */
declare class WaveExecutionController {
    private config;
    private dispatchCoordinator;
    private db;
    constructor(config: WaveExecutionConfig, dispatchCoordinator: WaveDispatchCoordinator);
    /**
     * Approve a wave plan and dispatch wave 0
     * Transitions: draft → approved → executing
     */
    approve(wavePlanId: string): Promise<void>;
    /**
     * Pause execution of a wave plan
     * Transitions: executing → paused
     * Does not cancel running tasks, just stops new dispatches
     */
    pause(wavePlanId: string): Promise<void>;
    /**
     * Resume execution of a paused wave plan
     * Transitions: paused → executing
     * Dispatches current wave if not complete
     */
    resume(wavePlanId: string): Promise<void>;
    /**
     * Abort a wave plan execution
     * Transitions: any → failed
     * Marks pending tasks as 'skipped'
     */
    abort(wavePlanId: string): Promise<void>;
    /**
     * Dispatch a wave
     * Gets wave tasks and uses dispatch coordinator to dispatch batch
     * Updates wave status: pending → dispatching → active
     */
    dispatchWave(wavePlanId: string, waveIndex: number): Promise<DispatchResult>;
    /**
     * Handle task completion
     * Updates task status, checks if wave is complete, and advances if autoAdvance is enabled
     */
    onTaskComplete(wavePlanId: string, taskCode: string): Promise<void>;
    /**
     * Handle task failure
     * Implements retry logic or marks as failed based on policy
     */
    onTaskFailed(wavePlanId: string, taskCode: string, error: string): Promise<void>;
    /**
     * Check if all tasks in a wave are complete
     */
    private checkWaveComplete;
    /**
     * Delay helper for wave advancement
     */
    private delay;
}

type index$2_AIClientConfig = AIClientConfig;
type index$2_ActiveTaskInfo = ActiveTaskInfo;
type index$2_AssignedWave = AssignedWave;
type index$2_CodebaseContextBlock = CodebaseContextBlock;
type index$2_CodebaseContextService = CodebaseContextService;
declare const index$2_CodebaseContextService: typeof CodebaseContextService;
type index$2_CompletedWorkBlock = CompletedWorkBlock;
type index$2_CompletionListener = CompletionListener;
declare const index$2_CompletionListener: typeof CompletionListener;
type index$2_ConcurrencyManager = ConcurrencyManager;
declare const index$2_ConcurrencyManager: typeof ConcurrencyManager;
type index$2_ConfidenceSignalUpdate = ConfidenceSignalUpdate;
type index$2_ConstraintBlock = ConstraintBlock;
type index$2_CriticalPathAnnotation = CriticalPathAnnotation;
type index$2_CriticalPathResult = CriticalPathResult;
type index$2_DAGNode = DAGNode;
type index$2_DAGValidatorConfig = DAGValidatorConfig;
type index$2_DispatchError = DispatchError;
type index$2_DispatchResult = DispatchResult;
type index$2_FleetCapacity = FleetCapacity;
type index$2_FleetContextBlock = FleetContextBlock;
type index$2_FleetContextService = FleetContextService;
declare const index$2_FleetContextService: typeof FleetContextService;
type index$2_GenerationResult = GenerationResult;
type index$2_MemoryContextBlock = MemoryContextBlock;
type index$2_OptimizationResult = OptimizationResult;
type index$2_ParsedEdge = ParsedEdge;
type index$2_ParsedStatistics = ParsedStatistics;
type index$2_ParsedTask = ParsedTask;
type index$2_ParsedWave = ParsedWave;
type index$2_ParsedWavePlan = ParsedWavePlan;
type index$2_PlanRefinementConfig = PlanRefinementConfig;
type index$2_PlanRefinementService = PlanRefinementService;
declare const index$2_PlanRefinementService: typeof PlanRefinementService;
type index$2_PlanScore = PlanScore;
type index$2_PredecessorSummary = PredecessorSummary;
type index$2_PromptConstructor = PromptConstructor;
declare const index$2_PromptConstructor: typeof PromptConstructor;
type index$2_PromptConstructorConfig = PromptConstructorConfig;
type index$2_PromptContext = PromptContext;
type index$2_PromptTemplate = PromptTemplate;
type index$2_RefinementPromptTemplate = RefinementPromptTemplate;
type index$2_RefinementResult = RefinementResult;
type index$2_RemainingWorkBlock = RemainingWorkBlock;
type index$2_TopologicalSortResult = TopologicalSortResult;
type index$2_ValidationError = ValidationError;
type index$2_ValidationErrorCode = ValidationErrorCode;
type index$2_ValidationResult = ValidationResult;
type index$2_ValidationWarning = ValidationWarning;
type index$2_ValidationWarningCode = ValidationWarningCode;
type index$2_WaveAdjustment = WaveAdjustment;
type index$2_WaveAssignerConfig = WaveAssignerConfig;
type index$2_WaveAssignmentResult = WaveAssignmentResult;
type index$2_WaveDispatchCoordinator = WaveDispatchCoordinator;
declare const index$2_WaveDispatchCoordinator: typeof WaveDispatchCoordinator;
type index$2_WaveDispatchRequest = WaveDispatchRequest;
type index$2_WaveExecutionConfig = WaveExecutionConfig;
type index$2_WaveExecutionController = WaveExecutionController;
declare const index$2_WaveExecutionController: typeof WaveExecutionController;
type index$2_WavePlanExecutionState = WavePlanExecutionState;
type index$2_WavePlanGenerationResult = WavePlanGenerationResult;
type index$2_WavePlanGenerator = WavePlanGenerator;
declare const index$2_WavePlanGenerator: typeof WavePlanGenerator;
type index$2_WavePlanGeneratorConfig = WavePlanGeneratorConfig;
type index$2_WavePlannerAIClient = WavePlannerAIClient;
declare const index$2_WavePlannerAIClient: typeof WavePlannerAIClient;
type index$2_WavePlannerConfig = WavePlannerConfig;
type index$2_WaveProgress = WaveProgress;
type index$2_WaveSSEEvent = WaveSSEEvent;
declare const index$2_advanceToNextWave: typeof advanceToNextWave;
declare const index$2_assignWaves: typeof assignWaves;
declare const index$2_autoAdvanceWave: typeof autoAdvanceWave;
declare const index$2_buildDAGGraph: typeof buildDAGGraph;
declare const index$2_collectFinalMetrics: typeof collectFinalMetrics;
declare const index$2_computeCriticalPath: typeof computeCriticalPath;
declare const index$2_createFlatPlan: typeof createFlatPlan;
declare const index$2_createFlatPlanFromDescriptions: typeof createFlatPlanFromDescriptions;
declare const index$2_createPlanRefinementService: typeof createPlanRefinementService;
declare const index$2_createPromptConstructor: typeof createPromptConstructor;
declare const index$2_createWavePlanGenerator: typeof createWavePlanGenerator;
declare const index$2_defaultTemplate: typeof defaultTemplate;
declare const index$2_extractAllTaskCodes: typeof extractAllTaskCodes;
declare const index$2_extractWaveFromTaskCode: typeof extractWaveFromTaskCode;
declare const index$2_findCommonTheme: typeof findCommonTheme;
declare const index$2_findTaskByCode: typeof findTaskByCode;
declare const index$2_generateWaveLabel: typeof generateWaveLabel;
declare const index$2_generateWavePlan: typeof generateWavePlan;
declare const index$2_getTasksInWave: typeof getTasksInWave;
declare const index$2_groupBy: typeof groupBy;
declare const index$2_markWavePlanComplete: typeof markWavePlanComplete;
declare const index$2_normalizeComplexity: typeof normalizeComplexity;
declare const index$2_normalizeModel: typeof normalizeModel;
declare const index$2_parseDependencies: typeof parseDependencies;
declare const index$2_parseFilePaths: typeof parseFilePaths;
declare const index$2_parseWavePlanResponse: typeof parseWavePlanResponse;
declare const index$2_refinementTemplate: typeof refinementTemplate;
declare const index$2_scorePlan: typeof scorePlan;
declare const index$2_simplifiedTemplate: typeof simplifiedTemplate;
declare const index$2_sleep: typeof sleep;
declare const index$2_topologicalSort: typeof topologicalSort;
declare const index$2_validateDAG: typeof validateDAG;
declare namespace index$2 {
  export { type index$2_AIClientConfig as AIClientConfig, type index$2_ActiveTaskInfo as ActiveTaskInfo, type index$2_AssignedWave as AssignedWave, type index$2_CodebaseContextBlock as CodebaseContextBlock, index$2_CodebaseContextService as CodebaseContextService, type index$2_CompletedWorkBlock as CompletedWorkBlock, index$2_CompletionListener as CompletionListener, index$2_ConcurrencyManager as ConcurrencyManager, type index$2_ConfidenceSignalUpdate as ConfidenceSignalUpdate, type index$2_ConstraintBlock as ConstraintBlock, type index$2_CriticalPathAnnotation as CriticalPathAnnotation, type index$2_CriticalPathResult as CriticalPathResult, type index$2_DAGNode as DAGNode, type index$2_DAGValidatorConfig as DAGValidatorConfig, type index$2_DispatchError as DispatchError, type index$2_DispatchResult as DispatchResult, type index$2_FleetCapacity as FleetCapacity, type index$2_FleetContextBlock as FleetContextBlock, index$2_FleetContextService as FleetContextService, type index$2_GenerationResult as GenerationResult, type index$2_MemoryContextBlock as MemoryContextBlock, type index$2_OptimizationResult as OptimizationResult, type index$2_ParsedEdge as ParsedEdge, type index$2_ParsedStatistics as ParsedStatistics, type index$2_ParsedTask as ParsedTask, type index$2_ParsedWave as ParsedWave, type index$2_ParsedWavePlan as ParsedWavePlan, type index$2_PlanRefinementConfig as PlanRefinementConfig, index$2_PlanRefinementService as PlanRefinementService, type index$2_PlanScore as PlanScore, type index$2_PredecessorSummary as PredecessorSummary, index$2_PromptConstructor as PromptConstructor, type index$2_PromptConstructorConfig as PromptConstructorConfig, type index$2_PromptContext as PromptContext, type index$2_PromptTemplate as PromptTemplate, type index$2_RefinementPromptTemplate as RefinementPromptTemplate, type index$2_RefinementResult as RefinementResult, type index$2_RemainingWorkBlock as RemainingWorkBlock, type index$2_TopologicalSortResult as TopologicalSortResult, type index$2_ValidationError as ValidationError, type index$2_ValidationErrorCode as ValidationErrorCode, type index$2_ValidationResult as ValidationResult, type index$2_ValidationWarning as ValidationWarning, type index$2_ValidationWarningCode as ValidationWarningCode, type index$2_WaveAdjustment as WaveAdjustment, type index$2_WaveAssignerConfig as WaveAssignerConfig, type index$2_WaveAssignmentResult as WaveAssignmentResult, index$2_WaveDispatchCoordinator as WaveDispatchCoordinator, type index$2_WaveDispatchRequest as WaveDispatchRequest, type index$2_WaveExecutionConfig as WaveExecutionConfig, index$2_WaveExecutionController as WaveExecutionController, type index$2_WavePlanExecutionState as WavePlanExecutionState, type index$2_WavePlanGenerationResult as WavePlanGenerationResult, index$2_WavePlanGenerator as WavePlanGenerator, type index$2_WavePlanGeneratorConfig as WavePlanGeneratorConfig, index$2_WavePlannerAIClient as WavePlannerAIClient, type index$2_WavePlannerConfig as WavePlannerConfig, type index$2_WaveProgress as WaveProgress, type index$2_WaveSSEEvent as WaveSSEEvent, index$2_advanceToNextWave as advanceToNextWave, index$2_assignWaves as assignWaves, index$2_autoAdvanceWave as autoAdvanceWave, index$2_buildDAGGraph as buildDAGGraph, index$2_collectFinalMetrics as collectFinalMetrics, index$2_computeCriticalPath as computeCriticalPath, index$2_createFlatPlan as createFlatPlan, index$2_createFlatPlanFromDescriptions as createFlatPlanFromDescriptions, index$2_createPlanRefinementService as createPlanRefinementService, index$2_createPromptConstructor as createPromptConstructor, index$2_createWavePlanGenerator as createWavePlanGenerator, index$2_defaultTemplate as defaultTemplate, index$2_extractAllTaskCodes as extractAllTaskCodes, index$2_extractWaveFromTaskCode as extractWaveFromTaskCode, index$2_findCommonTheme as findCommonTheme, index$2_findTaskByCode as findTaskByCode, index$2_generateWaveLabel as generateWaveLabel, index$2_generateWavePlan as generateWavePlan, index$2_getTasksInWave as getTasksInWave, index$2_groupBy as groupBy, index$2_markWavePlanComplete as markWavePlanComplete, index$2_normalizeComplexity as normalizeComplexity, index$2_normalizeModel as normalizeModel, index$2_parseDependencies as parseDependencies, index$2_parseFilePaths as parseFilePaths, index$2_parseWavePlanResponse as parseWavePlanResponse, index$2_refinementTemplate as refinementTemplate, index$2_scorePlan as scorePlan, index$2_simplifiedTemplate as simplifiedTemplate, index$2_sleep as sleep, index$2_topologicalSort as topologicalSort, index$2_validateDAG as validateDAG };
}

/**
 * Linear integration type definitions
 */
interface LinearConfig {
    apiKey: string;
    teamId: string;
    defaultProjectId?: string;
    webhookSecret?: string;
}
interface LinearIssue {
    id: string;
    identifier: string;
    title: string;
    description?: string;
    state: {
        id: string;
        name: string;
        type: string;
    };
    priority: number;
    url: string;
    createdAt: Date;
    updatedAt: Date;
}
interface CreateIssueInput {
    title: string;
    description?: string;
    teamId: string;
    projectId?: string;
    priority?: number;
    labels?: string[];
    parentId?: string;
}
interface UpdateIssueInput {
    stateId?: string;
    title?: string;
    description?: string;
    priority?: number;
}
interface LinearWebhookPayload {
    action: 'create' | 'update' | 'remove';
    type: 'Issue' | 'Comment' | 'Project' | 'Cycle';
    data: Record<string, unknown>;
    createdAt: string;
    url: string;
    organizationId: string;
    webhookId: string;
    webhookTimestamp: number;
}
interface SyncResult {
    success: boolean;
    issueId?: string;
    error?: string;
}

/**
 * Linear SDK wrapper client
 */

declare class DevPilotLinearClient {
    private client;
    private teamId;
    private defaultProjectId?;
    constructor(config: LinearConfig);
    /**
     * Get the underlying Linear client for advanced operations
     */
    getClient(): LinearClient;
    /**
     * Create a new issue in Linear
     */
    createIssue(input: CreateIssueInput): Promise<LinearIssue>;
    /**
     * Update an existing issue
     */
    updateIssue(issueId: string, input: UpdateIssueInput): Promise<LinearIssue>;
    /**
     * Get an issue by ID
     */
    getIssue(issueId: string): Promise<LinearIssue | null>;
    /**
     * Get workflow states for a team
     */
    getWorkflowStates(): Promise<{
        id: string;
        name: string;
        type: string;
    }[]>;
    /**
     * Move issue to a specific state
     */
    moveIssueToState(issueId: string, stateName: string): Promise<LinearIssue>;
    /**
     * Add a comment to an issue
     */
    addComment(issueId: string, body: string): Promise<void>;
    /**
     * Get team info
     */
    getTeam(): Promise<{
        id: string;
        name: string;
        key: string;
    }>;
    /**
     * Get all teams the user has access to
     */
    getTeams(): Promise<{
        id: string;
        name: string;
        key: string;
    }[]>;
}
declare function initLinearClient(config: LinearConfig): DevPilotLinearClient;
declare function getLinearClient(): DevPilotLinearClient;
declare function isLinearConfigured(): boolean;

/**
 * Linear bidirectional sync service
 * Handles synchronization between DevPilot sessions and Linear tickets
 */

interface SessionToLinearSync {
    sessionId: string;
    ticketTitle: string;
    repo: string;
    workstream?: string;
    estimatedMinutes?: number;
    planUrl?: string;
}
interface SessionProgressUpdate {
    linearTicketId: string;
    progressPercent: number;
    currentWorkstream?: string;
    filesModified?: string[];
    status: 'running' | 'waiting' | 'complete' | 'error';
    message?: string;
}
interface SessionCompletionSync {
    linearTicketId: string;
    success: boolean;
    prUrl?: string;
    filesModified: string[];
    completionMessage?: string;
}
interface DispatchIntent {
    linearIssueId: string;
    linearIdentifier: string;
    title: string;
    description?: string;
    teamId: string;
    priority?: number;
    labels?: string[];
}
/**
 * Create a Linear ticket when a session is dispatched
 */
declare function syncSessionToLinear(input: SessionToLinearSync): Promise<SyncResult>;
/**
 * Update Linear ticket with session progress
 */
declare function syncProgressToLinear(input: SessionProgressUpdate): Promise<SyncResult>;
/**
 * Mark Linear ticket as complete when session finishes
 */
declare function syncCompletionToLinear(input: SessionCompletionSync): Promise<SyncResult>;
/**
 * Handle incoming Linear webhook
 */
declare function handleLinearWebhook(payload: LinearWebhookPayload, options?: {
    botUserId?: string;
    webhookSecret?: string;
    signature?: string;
    rawBody?: string;
}): Promise<{
    handled: boolean;
    action?: string;
    dispatch?: DispatchIntent;
}>;

/**
 * Verifies the signature of a Linear webhook payload
 *
 * @param payload - The raw webhook payload as a string
 * @param signature - The signature from the 'linear-signature' header (format: "sha256=<hash>")
 * @param secret - The webhook secret from Linear
 * @returns Object with validation result and optional error message
 *
 * @example
 * ```typescript
 * const result = verifyLinearWebhookSignature(
 *   JSON.stringify(webhookBody),
 *   req.headers['linear-signature'],
 *   process.env.LINEAR_WEBHOOK_SECRET
 * );
 *
 * if (!result.valid) {
 *   console.error('Webhook verification failed:', result.error);
 * }
 * ```
 */
declare function verifyLinearWebhookSignature(payload: string, signature: string, secret: string): {
    valid: boolean;
    error?: string;
};

/**
 * Linear integration module
 */

type index$1_CreateIssueInput = CreateIssueInput;
type index$1_DevPilotLinearClient = DevPilotLinearClient;
declare const index$1_DevPilotLinearClient: typeof DevPilotLinearClient;
type index$1_DispatchIntent = DispatchIntent;
type index$1_LinearConfig = LinearConfig;
type index$1_LinearIssue = LinearIssue;
type index$1_LinearWebhookPayload = LinearWebhookPayload;
type index$1_SessionCompletionSync = SessionCompletionSync;
type index$1_SessionProgressUpdate = SessionProgressUpdate;
type index$1_SessionToLinearSync = SessionToLinearSync;
type index$1_SyncResult = SyncResult;
type index$1_UpdateIssueInput = UpdateIssueInput;
declare const index$1_getLinearClient: typeof getLinearClient;
declare const index$1_handleLinearWebhook: typeof handleLinearWebhook;
declare const index$1_initLinearClient: typeof initLinearClient;
declare const index$1_isLinearConfigured: typeof isLinearConfigured;
declare const index$1_syncCompletionToLinear: typeof syncCompletionToLinear;
declare const index$1_syncProgressToLinear: typeof syncProgressToLinear;
declare const index$1_syncSessionToLinear: typeof syncSessionToLinear;
declare const index$1_verifyLinearWebhookSignature: typeof verifyLinearWebhookSignature;
declare namespace index$1 {
  export { type index$1_CreateIssueInput as CreateIssueInput, index$1_DevPilotLinearClient as DevPilotLinearClient, type index$1_DispatchIntent as DispatchIntent, type index$1_LinearConfig as LinearConfig, type index$1_LinearIssue as LinearIssue, type index$1_LinearWebhookPayload as LinearWebhookPayload, type index$1_SessionCompletionSync as SessionCompletionSync, type index$1_SessionProgressUpdate as SessionProgressUpdate, type index$1_SessionToLinearSync as SessionToLinearSync, type index$1_SyncResult as SyncResult, type index$1_UpdateIssueInput as UpdateIssueInput, index$1_getLinearClient as getLinearClient, index$1_handleLinearWebhook as handleLinearWebhook, index$1_initLinearClient as initLinearClient, index$1_isLinearConfigured as isLinearConfigured, index$1_syncCompletionToLinear as syncCompletionToLinear, index$1_syncProgressToLinear as syncProgressToLinear, index$1_syncSessionToLinear as syncSessionToLinear, index$1_verifyLinearWebhookSignature as verifyLinearWebhookSignature };
}

interface WikiBridgeConfig {
    /** Wing slug to mirror wiki content into. Usually the repo identifier. */
    wingSlug: string;
    /** If true, attempt to derive KG triples from wiki articles. */
    extractFacts?: boolean;
}
declare class WikiPalaceBridge {
    private wiki;
    private palace;
    private config;
    constructor(wiki: WikiCompiler, palace: MemPalaceService, config: WikiBridgeConfig);
    /**
     * After a wiki ingest, mirror the created/updated articles into MemPalace
     * as drawers. The Wiki is the source of truth; drawers are copies indexed
     * by article slug for efficient recall.
     *
     * Call this immediately after `WikiCompiler.ingest()` returns.
     */
    mirrorIngest(result: IngestResult): Promise<{
        mirroredCount: number;
    }>;
    /**
     * Mirror a single article explicitly. Useful for CLI flows and backfill.
     */
    mirrorArticle(slug: string): Promise<boolean>;
    /**
     * Given a set of KG contradictions (typically returned from
     * `MemPalaceService.addFact()`), build a list of wiki article slugs that
     * should be re-examined. Callers can pass these to `WikiCompiler.ingest()`
     * with fresh source material, or mark the articles stale directly.
     *
     * The bridge itself never mutates the wiki — it only advises.
     */
    candidateArticlesFromContradictions(contradictions: {
        subject: string;
        predicate: string;
        oldObject: string;
        newObject: string;
        oldDrawerId?: string;
    }[]): {
        articleSlug: string;
        reason: string;
    }[];
    private maybeExtractFact;
}
declare function createWikiPalaceBridge(wiki: WikiCompiler, palace: MemPalaceService, config: WikiBridgeConfig): WikiPalaceBridge;

interface DualFeedHookConfig {
    wiki: WikiCompilerConfig;
    mempalace: MemPalaceConfig;
    /** If true, flush the wiki to disk after each session. */
    flushWiki?: boolean;
}
declare class DualFeedSessionHook {
    private wikiHook;
    private wikiCompiler;
    private palace;
    private bridge;
    private config;
    constructor(config: DualFeedHookConfig);
    /**
     * Called when a Claude Code session ends.
     * Flow:
     *   1. Wiki compiler extracts articles from the session log
     *   2. (If enabled) bridge mirrors those articles into MemPalace
     *   3. (If enabled) wiki is flushed to the `/wiki` folder on disk
     */
    onSessionEnd(sessionLog: string, sessionId: string): Promise<{
        wikiResult: IngestResult;
        mirroredCount: number;
        wikiFlush?: {
            filesWritten: number;
            wikiDir: string;
        };
    }>;
    /**
     * Called on commit. Wiki owns commit ingestion; MemPalace mirrors the
     * resulting articles.
     */
    onCommit(commitSha: string, commitMessage: string, diffContent: string): Promise<{
        wikiResult: IngestResult;
        mirroredCount: number;
    }>;
    /**
     * Called on spec update. Same dual-feed pattern as onCommit.
     */
    onSpecUpdate(specContent: string, specTitle: string, filePath: string): Promise<{
        wikiResult: IngestResult;
        mirroredCount: number;
    }>;
    /** Explicit access to the wiki hook for callers that still need it. */
    get wikiSessionHook(): WikiSessionHook;
    /** Explicit access to the palace service for callers that still need it. */
    get palaceService(): MemPalaceService;
}

type index_AddDrawerInput = AddDrawerInput;
type index_AddDrawerResult = AddDrawerResult;
type index_Closet = Closet;
type index_DisabledClient = DisabledClient;
declare const index_DisabledClient: typeof DisabledClient;
type index_Drawer = Drawer;
type index_DrawerSource = DrawerSource;
type index_DualFeedHookConfig = DualFeedHookConfig;
type index_DualFeedSessionHook = DualFeedSessionHook;
declare const index_DualFeedSessionHook: typeof DualFeedSessionHook;
type index_Hall = Hall;
type index_HallRelation = HallRelation;
type index_KgAddInput = KgAddInput;
type index_KgContradiction = KgContradiction;
type index_KgInvalidateInput = KgInvalidateInput;
type index_KgQueryInput = KgQueryInput;
type index_KgTriple = KgTriple;
type index_LocalShimClient = LocalShimClient;
declare const index_LocalShimClient: typeof LocalShimClient;
type index_McpAdapterClient = McpAdapterClient;
declare const index_McpAdapterClient: typeof McpAdapterClient;
type index_McpTransport = McpTransport;
type index_MemPalaceClient = MemPalaceClient;
type index_MemPalaceConfig = MemPalaceConfig;
type index_MemPalaceMode = MemPalaceMode;
type index_MemPalaceService = MemPalaceService;
declare const index_MemPalaceService: typeof MemPalaceService;
type index_MemoryTier = MemoryTier;
type index_MemoryType = MemoryType;
type index_PalaceContextBlock = PalaceContextBlock;
type index_RecallInput = RecallInput;
type index_RecallResult = RecallResult;
type index_Room = Room;
type index_SearchHit = SearchHit;
type index_SearchInput = SearchInput;
type index_SearchResult = SearchResult;
type index_Tunnel = Tunnel;
type index_WakeUpInput = WakeUpInput;
type index_WakeUpResult = WakeUpResult;
type index_WikiBridgeConfig = WikiBridgeConfig;
type index_WikiPalaceBridge = WikiPalaceBridge;
declare const index_WikiPalaceBridge: typeof WikiPalaceBridge;
type index_Wing = Wing;
type index_WingType = WingType;
declare const index_createMemPalaceClient: typeof createMemPalaceClient;
declare const index_createMemPalaceService: typeof createMemPalaceService;
declare const index_createWikiPalaceBridge: typeof createWikiPalaceBridge;
declare const index_estimateTokens: typeof estimateTokens;
declare namespace index {
  export { type index_AddDrawerInput as AddDrawerInput, type index_AddDrawerResult as AddDrawerResult, type index_Closet as Closet, index_DisabledClient as DisabledClient, type index_Drawer as Drawer, type index_DrawerSource as DrawerSource, type index_DualFeedHookConfig as DualFeedHookConfig, index_DualFeedSessionHook as DualFeedSessionHook, type index_Hall as Hall, type index_HallRelation as HallRelation, type index_KgAddInput as KgAddInput, type index_KgContradiction as KgContradiction, type index_KgInvalidateInput as KgInvalidateInput, type index_KgQueryInput as KgQueryInput, type index_KgTriple as KgTriple, index_LocalShimClient as LocalShimClient, index_McpAdapterClient as McpAdapterClient, type index_McpTransport as McpTransport, type index_MemPalaceClient as MemPalaceClient, type index_MemPalaceConfig as MemPalaceConfig, type index_MemPalaceMode as MemPalaceMode, index_MemPalaceService as MemPalaceService, type index_MemoryTier as MemoryTier, type index_MemoryType as MemoryType, type index_PalaceContextBlock as PalaceContextBlock, type index_RecallInput as RecallInput, type index_RecallResult as RecallResult, type index_Room as Room, type index_SearchHit as SearchHit, type index_SearchInput as SearchInput, type index_SearchResult as SearchResult, type index_Tunnel as Tunnel, type index_WakeUpInput as WakeUpInput, type index_WakeUpResult as WakeUpResult, type index_WikiBridgeConfig as WikiBridgeConfig, index_WikiPalaceBridge as WikiPalaceBridge, type index_Wing as Wing, type index_WingType as WingType, index_createMemPalaceClient as createMemPalaceClient, index_createMemPalaceService as createMemPalaceService, index_createWikiPalaceBridge as createWikiPalaceBridge, index_estimateTokens as estimateTokens };
}

declare const VERSION = "0.1.0";

export { VERSION, WaveTask, index$1 as linear, index as mempalace, index$2 as wavePlanner };
