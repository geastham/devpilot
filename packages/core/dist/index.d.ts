export { ActivityEvent, CompletedTask, Complexity, ConductorScore, ConflictingFile, Database, DatabaseConfig, DependencyEdge, DependencyEdgeType, EventType, FileStatus, HorizonItem, InFlightFile, Model, NewActivityEvent, NewCompletedTask, NewConductorScore, NewConflictingFile, NewDependencyEdge, NewHorizonItem, NewInFlightFile, NewPlan, NewRufloSession, NewScoreHistory, NewTask, NewTouchedFile, NewWave, NewWavePlan, NewWavePlanMetric, NewWaveTask, NewWorkstream, OrchestratorMode, Plan, PostgresDatabase, RufloSession, SQLiteDatabase, ScoreHistory, SessionStatus, Task, TouchedFile, Wave, WavePlan, WavePlanMetric, WavePlanStatus, WaveStatus, WaveTask, WaveTaskStatus, Workstream, Zone, activityEvents, closeDatabase, completedTasks, completedTasksRelations, complexityValues, conductorScores, conductorScoresRelations, conflictingFiles, conflictingFilesRelations, createDatabase, databaseConfigSchema, dependencyEdgeTypeValues, dependencyEdges, dependencyEdgesRelations, eventTypeValues, fileStatusValues, getDatabase, getDatabaseConfig, horizonItems, horizonItemsRelations, inFlightFiles, inFlightFilesRelations, initDatabase, modelValues, orchestratorModeValues, plans, plansRelations, resetDatabase, rufloSessions, rufloSessionsRelations, scoreHistory, scoreHistoryRelations, sessionStatusValues, tasks, tasksRelations, touchedFiles, touchedFilesRelations, wavePlanMetrics, wavePlanMetricsRelations, wavePlanStatusValues, wavePlans, wavePlansRelations, waveStatusValues, waveTaskStatusValues, waveTasks, waveTasksRelations, waves, wavesRelations, workstreams, workstreamsRelations, zoneValues } from './db/index.js';
import { LinearClient } from '@linear/sdk';
export { i as orchestrator } from './index-D-MH25FF.js';
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

type index$1_ActiveTaskInfo = ActiveTaskInfo;
type index$1_AssignedWave = AssignedWave;
type index$1_CodebaseContextBlock = CodebaseContextBlock;
type index$1_CompletedWorkBlock = CompletedWorkBlock;
type index$1_ConfidenceSignalUpdate = ConfidenceSignalUpdate;
type index$1_ConstraintBlock = ConstraintBlock;
type index$1_CriticalPathAnnotation = CriticalPathAnnotation;
type index$1_CriticalPathResult = CriticalPathResult;
type index$1_DAGNode = DAGNode;
type index$1_DAGValidatorConfig = DAGValidatorConfig;
type index$1_FleetContextBlock = FleetContextBlock;
type index$1_GenerationResult = GenerationResult;
type index$1_MemoryContextBlock = MemoryContextBlock;
type index$1_OptimizationResult = OptimizationResult;
type index$1_ParsedEdge = ParsedEdge;
type index$1_ParsedStatistics = ParsedStatistics;
type index$1_ParsedTask = ParsedTask;
type index$1_ParsedWave = ParsedWave;
type index$1_ParsedWavePlan = ParsedWavePlan;
type index$1_PlanScore = PlanScore;
type index$1_PredecessorSummary = PredecessorSummary;
type index$1_PromptContext = PromptContext;
type index$1_RemainingWorkBlock = RemainingWorkBlock;
type index$1_TopologicalSortResult = TopologicalSortResult;
type index$1_ValidationError = ValidationError;
type index$1_ValidationErrorCode = ValidationErrorCode;
type index$1_ValidationResult = ValidationResult;
type index$1_ValidationWarning = ValidationWarning;
type index$1_ValidationWarningCode = ValidationWarningCode;
type index$1_WaveAdjustment = WaveAdjustment;
type index$1_WaveAssignerConfig = WaveAssignerConfig;
type index$1_WaveAssignmentResult = WaveAssignmentResult;
type index$1_WaveDispatchRequest = WaveDispatchRequest;
type index$1_WavePlanExecutionState = WavePlanExecutionState;
type index$1_WavePlannerConfig = WavePlannerConfig;
type index$1_WaveSSEEvent = WaveSSEEvent;
declare const index$1_assignWaves: typeof assignWaves;
declare const index$1_buildDAGGraph: typeof buildDAGGraph;
declare const index$1_computeCriticalPath: typeof computeCriticalPath;
declare const index$1_extractAllTaskCodes: typeof extractAllTaskCodes;
declare const index$1_extractWaveFromTaskCode: typeof extractWaveFromTaskCode;
declare const index$1_findCommonTheme: typeof findCommonTheme;
declare const index$1_findTaskByCode: typeof findTaskByCode;
declare const index$1_generateWaveLabel: typeof generateWaveLabel;
declare const index$1_getTasksInWave: typeof getTasksInWave;
declare const index$1_groupBy: typeof groupBy;
declare const index$1_normalizeComplexity: typeof normalizeComplexity;
declare const index$1_normalizeModel: typeof normalizeModel;
declare const index$1_parseDependencies: typeof parseDependencies;
declare const index$1_parseFilePaths: typeof parseFilePaths;
declare const index$1_parseWavePlanResponse: typeof parseWavePlanResponse;
declare const index$1_scorePlan: typeof scorePlan;
declare const index$1_sleep: typeof sleep;
declare const index$1_topologicalSort: typeof topologicalSort;
declare const index$1_validateDAG: typeof validateDAG;
declare namespace index$1 {
  export { type index$1_ActiveTaskInfo as ActiveTaskInfo, type index$1_AssignedWave as AssignedWave, type index$1_CodebaseContextBlock as CodebaseContextBlock, type index$1_CompletedWorkBlock as CompletedWorkBlock, type index$1_ConfidenceSignalUpdate as ConfidenceSignalUpdate, type index$1_ConstraintBlock as ConstraintBlock, type index$1_CriticalPathAnnotation as CriticalPathAnnotation, type index$1_CriticalPathResult as CriticalPathResult, type index$1_DAGNode as DAGNode, type index$1_DAGValidatorConfig as DAGValidatorConfig, type index$1_FleetContextBlock as FleetContextBlock, type index$1_GenerationResult as GenerationResult, type index$1_MemoryContextBlock as MemoryContextBlock, type index$1_OptimizationResult as OptimizationResult, type index$1_ParsedEdge as ParsedEdge, type index$1_ParsedStatistics as ParsedStatistics, type index$1_ParsedTask as ParsedTask, type index$1_ParsedWave as ParsedWave, type index$1_ParsedWavePlan as ParsedWavePlan, type index$1_PlanScore as PlanScore, type index$1_PredecessorSummary as PredecessorSummary, type index$1_PromptContext as PromptContext, type index$1_RemainingWorkBlock as RemainingWorkBlock, type index$1_TopologicalSortResult as TopologicalSortResult, type index$1_ValidationError as ValidationError, type index$1_ValidationErrorCode as ValidationErrorCode, type index$1_ValidationResult as ValidationResult, type index$1_ValidationWarning as ValidationWarning, type index$1_ValidationWarningCode as ValidationWarningCode, type index$1_WaveAdjustment as WaveAdjustment, type index$1_WaveAssignerConfig as WaveAssignerConfig, type index$1_WaveAssignmentResult as WaveAssignmentResult, type index$1_WaveDispatchRequest as WaveDispatchRequest, type index$1_WavePlanExecutionState as WavePlanExecutionState, type index$1_WavePlannerConfig as WavePlannerConfig, type index$1_WaveSSEEvent as WaveSSEEvent, index$1_assignWaves as assignWaves, index$1_buildDAGGraph as buildDAGGraph, index$1_computeCriticalPath as computeCriticalPath, index$1_extractAllTaskCodes as extractAllTaskCodes, index$1_extractWaveFromTaskCode as extractWaveFromTaskCode, index$1_findCommonTheme as findCommonTheme, index$1_findTaskByCode as findTaskByCode, index$1_generateWaveLabel as generateWaveLabel, index$1_getTasksInWave as getTasksInWave, index$1_groupBy as groupBy, index$1_normalizeComplexity as normalizeComplexity, index$1_normalizeModel as normalizeModel, index$1_parseDependencies as parseDependencies, index$1_parseFilePaths as parseFilePaths, index$1_parseWavePlanResponse as parseWavePlanResponse, index$1_scorePlan as scorePlan, index$1_sleep as sleep, index$1_topologicalSort as topologicalSort, index$1_validateDAG as validateDAG };
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

type index_CreateIssueInput = CreateIssueInput;
type index_DevPilotLinearClient = DevPilotLinearClient;
declare const index_DevPilotLinearClient: typeof DevPilotLinearClient;
type index_DispatchIntent = DispatchIntent;
type index_LinearConfig = LinearConfig;
type index_LinearIssue = LinearIssue;
type index_LinearWebhookPayload = LinearWebhookPayload;
type index_SessionCompletionSync = SessionCompletionSync;
type index_SessionProgressUpdate = SessionProgressUpdate;
type index_SessionToLinearSync = SessionToLinearSync;
type index_SyncResult = SyncResult;
type index_UpdateIssueInput = UpdateIssueInput;
declare const index_getLinearClient: typeof getLinearClient;
declare const index_handleLinearWebhook: typeof handleLinearWebhook;
declare const index_initLinearClient: typeof initLinearClient;
declare const index_isLinearConfigured: typeof isLinearConfigured;
declare const index_syncCompletionToLinear: typeof syncCompletionToLinear;
declare const index_syncProgressToLinear: typeof syncProgressToLinear;
declare const index_syncSessionToLinear: typeof syncSessionToLinear;
declare const index_verifyLinearWebhookSignature: typeof verifyLinearWebhookSignature;
declare namespace index {
  export { type index_CreateIssueInput as CreateIssueInput, index_DevPilotLinearClient as DevPilotLinearClient, type index_DispatchIntent as DispatchIntent, type index_LinearConfig as LinearConfig, type index_LinearIssue as LinearIssue, type index_LinearWebhookPayload as LinearWebhookPayload, type index_SessionCompletionSync as SessionCompletionSync, type index_SessionProgressUpdate as SessionProgressUpdate, type index_SessionToLinearSync as SessionToLinearSync, type index_SyncResult as SyncResult, type index_UpdateIssueInput as UpdateIssueInput, index_getLinearClient as getLinearClient, index_handleLinearWebhook as handleLinearWebhook, index_initLinearClient as initLinearClient, index_isLinearConfigured as isLinearConfigured, index_syncCompletionToLinear as syncCompletionToLinear, index_syncProgressToLinear as syncProgressToLinear, index_syncSessionToLinear as syncSessionToLinear, index_verifyLinearWebhookSignature as verifyLinearWebhookSignature };
}

declare const VERSION = "0.1.0";

export { VERSION, index as linear, index$1 as wavePlanner };
