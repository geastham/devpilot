import { E as EventType } from './enums-CbVZMWqb.js';
import { g as WaveTask } from './wave-planner-BYl3JIm1.js';

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

interface ProjectedPlanIds {
    planId: string;
    workstreamIds: string[];
    taskIds: string[];
}
/**
 * Build spec markdown from an item + optional existing plan.
 * Ported from the Next route's buildSpecContent() (typed, no `any`).
 */
declare function buildSpecContentForItem(item: {
    title: string;
    plan?: {
        acceptanceCriteria?: string[];
        workstreams?: {
            label: string;
            tasks: {
                label: string;
                filePaths?: string[];
            }[];
        }[];
    } | null;
}): string;
/**
 * Run the wave planner for a horizon item that has no plan yet: creates the
 * plans row first (the generator requires a planId), then generates + persists
 * the wave plan.
 */
declare function generatePlanForItem(params: {
    horizonItemId: string;
    title: string;
    repo: string;
    workingDir: string;
    apiKey: string;
}): Promise<{
    generation: WavePlanGenerationResult;
    planId: string;
}>;
/**
 * Project a persisted wave plan into legacy plans/workstreams/tasks/touchedFiles
 * rows. Deterministic — derives everything from the generation result and the
 * static cost table; no AI calls.
 */
declare function projectWavePlanToPlan(params: {
    planId: string;
    generation: WavePlanGenerationResult;
    inFlightPaths: string[];
}): Promise<ProjectedPlanIds>;

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
    /** Base URL the executing agent POSTs callbacks to, e.g. "http://localhost:3000/api/orchestrator". */
    callbackUrl: string;
}
/** Per-wave dispatch context loaded once from wavePlan → horizonItem. */
interface WaveDispatchContext {
    repo: string;
    itemTitle: string;
    linearTicketId?: string | null;
}
/** Result of a single successful task dispatch. */
interface TaskDispatchOutcome {
    sessionId: string;
    externalJobId: string;
    mode: string;
}
/** Translate a WaveSSEEvent type to the activity_events enum value (uppercase). */
declare function toActivityEventType(t: WaveSSEEvent['type']): EventType;
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
 * - Real dispatch to the OrchestratorService (session-native / ao-cli / http)
 */
declare class WaveDispatchCoordinator {
    private config;
    private db;
    constructor(config: WaveExecutionConfig);
    /**
     * Dispatch a wave of tasks.
     * Checks fleet capacity, builds dispatch requests, dispatches in batches with
     * staggering. Tasks that can't reach an orchestrator (unconfigured/disabled)
     * are left pending and counted as queued — never burned as failures (§9.1).
     */
    dispatchWave(wavePlanId: string, _waveIndex: number, tasks: WaveTask[]): Promise<DispatchResult>;
    /**
     * Re-dispatch a single task previously marked 'retrying' (controller retry
     * path). Honours the pause guard: if the plan is no longer executing, the
     * task stays 'retrying' and is counted as queued.
     */
    redispatchTask(wavePlanId: string, taskCode: string): Promise<DispatchResult>;
    /**
     * Build a dispatch request for a task
     * Includes task details, file scope, model, predecessor context, and constraints
     */
    buildDispatchRequest(task: WaveTask, predecessorContext: PredecessorSummary[]): WaveDispatchRequest;
    /**
     * Get predecessor context for a task
     * Fetches completion summaries for task's completed dependencies.
     */
    getPredecessorContext(wavePlanId: string, taskCode: string): Promise<PredecessorSummary[]>;
    /**
     * Load repo / item title / linear ticket for a wave plan (wavePlans →
     * horizonItems). Cached per dispatchWave call by the caller.
     */
    private loadDispatchContext;
    /**
     * Check fleet capacity
     * Returns available workers and whether new tasks can be dispatched
     */
    private checkFleetCapacity;
    /**
     * Dispatch a single task to the orchestrator service.
     *
     * Creates a rufloSessions row, builds the session prompt + DispatchRequest,
     * dispatches through the active adapter, and records the session ↔ task
     * correlation on success. Throws 'ORCHESTRATOR_UNAVAILABLE' when no
     * orchestrator is configured (caller queues rather than fails the task).
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
     * Dispatches current wave if not complete.
     * @returns the DispatchResult of the re-dispatched current wave, or null if
     *          the current wave was already complete (nothing re-dispatched).
     */
    resume(wavePlanId: string): Promise<DispatchResult | null>;
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
     * Handle wave completion: mark the wave complete, then either finish the plan
     * (last wave) or auto-advance to the next wave. Invoked by the
     * ExecutionBridge's CompletionListener callback (§6.5) and by onTaskComplete.
     */
    handleWaveComplete(wavePlanId: string, waveIndex: number): Promise<void>;
    /**
     * Handle task failure. Within the retry limit, mark the task 'retrying' and
     * re-dispatch it immediately if the plan is still executing (a paused plan
     * re-dispatches the task on resume). Beyond the limit, fail terminally per
     * policy. This is where the former re-dispatch placeholder was resolved.
     */
    onTaskFailed(wavePlanId: string, taskCode: string, error: string): Promise<void>;
    /**
     * Terminally fail a task and apply the failure policy: 'halt' fails the plan
     * and skips remaining pending tasks; 'continue' leaves other tasks running.
     */
    private failTask;
    /**
     * Check if all tasks in a wave are complete
     */
    private checkWaveComplete;
    /**
     * Delay helper for wave advancement
     */
    private delay;
}

type index_AIClientConfig = AIClientConfig;
type index_ActiveTaskInfo = ActiveTaskInfo;
type index_AssignedWave = AssignedWave;
type index_CodebaseContextBlock = CodebaseContextBlock;
type index_CodebaseContextService = CodebaseContextService;
declare const index_CodebaseContextService: typeof CodebaseContextService;
type index_CompletedWorkBlock = CompletedWorkBlock;
type index_CompletionListener = CompletionListener;
declare const index_CompletionListener: typeof CompletionListener;
type index_ConcurrencyManager = ConcurrencyManager;
declare const index_ConcurrencyManager: typeof ConcurrencyManager;
type index_ConfidenceSignalUpdate = ConfidenceSignalUpdate;
type index_ConstraintBlock = ConstraintBlock;
type index_CriticalPathAnnotation = CriticalPathAnnotation;
type index_CriticalPathResult = CriticalPathResult;
type index_DAGNode = DAGNode;
type index_DAGValidatorConfig = DAGValidatorConfig;
type index_DispatchError = DispatchError;
type index_DispatchResult = DispatchResult;
type index_FleetCapacity = FleetCapacity;
type index_FleetContextBlock = FleetContextBlock;
type index_FleetContextService = FleetContextService;
declare const index_FleetContextService: typeof FleetContextService;
type index_GenerationResult = GenerationResult;
type index_MemoryContextBlock = MemoryContextBlock;
type index_OptimizationResult = OptimizationResult;
type index_ParsedEdge = ParsedEdge;
type index_ParsedStatistics = ParsedStatistics;
type index_ParsedTask = ParsedTask;
type index_ParsedWave = ParsedWave;
type index_ParsedWavePlan = ParsedWavePlan;
type index_PlanRefinementConfig = PlanRefinementConfig;
type index_PlanRefinementService = PlanRefinementService;
declare const index_PlanRefinementService: typeof PlanRefinementService;
type index_PlanScore = PlanScore;
type index_PredecessorSummary = PredecessorSummary;
type index_ProjectedPlanIds = ProjectedPlanIds;
type index_PromptConstructor = PromptConstructor;
declare const index_PromptConstructor: typeof PromptConstructor;
type index_PromptConstructorConfig = PromptConstructorConfig;
type index_PromptContext = PromptContext;
type index_PromptTemplate = PromptTemplate;
type index_RefinementPromptTemplate = RefinementPromptTemplate;
type index_RefinementResult = RefinementResult;
type index_RemainingWorkBlock = RemainingWorkBlock;
type index_TaskDispatchOutcome = TaskDispatchOutcome;
type index_TopologicalSortResult = TopologicalSortResult;
type index_ValidationError = ValidationError;
type index_ValidationErrorCode = ValidationErrorCode;
type index_ValidationResult = ValidationResult;
type index_ValidationWarning = ValidationWarning;
type index_ValidationWarningCode = ValidationWarningCode;
type index_WaveAdjustment = WaveAdjustment;
type index_WaveAssignerConfig = WaveAssignerConfig;
type index_WaveAssignmentResult = WaveAssignmentResult;
type index_WaveDispatchContext = WaveDispatchContext;
type index_WaveDispatchCoordinator = WaveDispatchCoordinator;
declare const index_WaveDispatchCoordinator: typeof WaveDispatchCoordinator;
type index_WaveDispatchRequest = WaveDispatchRequest;
type index_WaveExecutionConfig = WaveExecutionConfig;
type index_WaveExecutionController = WaveExecutionController;
declare const index_WaveExecutionController: typeof WaveExecutionController;
type index_WavePlanExecutionState = WavePlanExecutionState;
type index_WavePlanGenerationResult = WavePlanGenerationResult;
type index_WavePlanGenerator = WavePlanGenerator;
declare const index_WavePlanGenerator: typeof WavePlanGenerator;
type index_WavePlanGeneratorConfig = WavePlanGeneratorConfig;
type index_WavePlannerAIClient = WavePlannerAIClient;
declare const index_WavePlannerAIClient: typeof WavePlannerAIClient;
type index_WavePlannerConfig = WavePlannerConfig;
type index_WaveProgress = WaveProgress;
type index_WaveSSEEvent = WaveSSEEvent;
declare const index_advanceToNextWave: typeof advanceToNextWave;
declare const index_assignWaves: typeof assignWaves;
declare const index_autoAdvanceWave: typeof autoAdvanceWave;
declare const index_buildDAGGraph: typeof buildDAGGraph;
declare const index_buildSpecContentForItem: typeof buildSpecContentForItem;
declare const index_collectFinalMetrics: typeof collectFinalMetrics;
declare const index_computeCriticalPath: typeof computeCriticalPath;
declare const index_createFlatPlan: typeof createFlatPlan;
declare const index_createFlatPlanFromDescriptions: typeof createFlatPlanFromDescriptions;
declare const index_createPlanRefinementService: typeof createPlanRefinementService;
declare const index_createPromptConstructor: typeof createPromptConstructor;
declare const index_createWavePlanGenerator: typeof createWavePlanGenerator;
declare const index_defaultTemplate: typeof defaultTemplate;
declare const index_extractAllTaskCodes: typeof extractAllTaskCodes;
declare const index_extractWaveFromTaskCode: typeof extractWaveFromTaskCode;
declare const index_findCommonTheme: typeof findCommonTheme;
declare const index_findTaskByCode: typeof findTaskByCode;
declare const index_generatePlanForItem: typeof generatePlanForItem;
declare const index_generateWaveLabel: typeof generateWaveLabel;
declare const index_generateWavePlan: typeof generateWavePlan;
declare const index_getTasksInWave: typeof getTasksInWave;
declare const index_groupBy: typeof groupBy;
declare const index_markWavePlanComplete: typeof markWavePlanComplete;
declare const index_normalizeComplexity: typeof normalizeComplexity;
declare const index_normalizeModel: typeof normalizeModel;
declare const index_parseDependencies: typeof parseDependencies;
declare const index_parseFilePaths: typeof parseFilePaths;
declare const index_parseWavePlanResponse: typeof parseWavePlanResponse;
declare const index_projectWavePlanToPlan: typeof projectWavePlanToPlan;
declare const index_refinementTemplate: typeof refinementTemplate;
declare const index_scorePlan: typeof scorePlan;
declare const index_simplifiedTemplate: typeof simplifiedTemplate;
declare const index_sleep: typeof sleep;
declare const index_toActivityEventType: typeof toActivityEventType;
declare const index_topologicalSort: typeof topologicalSort;
declare const index_validateDAG: typeof validateDAG;
declare namespace index {
  export { type index_AIClientConfig as AIClientConfig, type index_ActiveTaskInfo as ActiveTaskInfo, type index_AssignedWave as AssignedWave, type index_CodebaseContextBlock as CodebaseContextBlock, index_CodebaseContextService as CodebaseContextService, type index_CompletedWorkBlock as CompletedWorkBlock, index_CompletionListener as CompletionListener, index_ConcurrencyManager as ConcurrencyManager, type index_ConfidenceSignalUpdate as ConfidenceSignalUpdate, type index_ConstraintBlock as ConstraintBlock, type index_CriticalPathAnnotation as CriticalPathAnnotation, type index_CriticalPathResult as CriticalPathResult, type index_DAGNode as DAGNode, type index_DAGValidatorConfig as DAGValidatorConfig, type index_DispatchError as DispatchError, type index_DispatchResult as DispatchResult, type index_FleetCapacity as FleetCapacity, type index_FleetContextBlock as FleetContextBlock, index_FleetContextService as FleetContextService, type index_GenerationResult as GenerationResult, type index_MemoryContextBlock as MemoryContextBlock, type index_OptimizationResult as OptimizationResult, type index_ParsedEdge as ParsedEdge, type index_ParsedStatistics as ParsedStatistics, type index_ParsedTask as ParsedTask, type index_ParsedWave as ParsedWave, type index_ParsedWavePlan as ParsedWavePlan, type index_PlanRefinementConfig as PlanRefinementConfig, index_PlanRefinementService as PlanRefinementService, type index_PlanScore as PlanScore, type index_PredecessorSummary as PredecessorSummary, type index_ProjectedPlanIds as ProjectedPlanIds, index_PromptConstructor as PromptConstructor, type index_PromptConstructorConfig as PromptConstructorConfig, type index_PromptContext as PromptContext, type index_PromptTemplate as PromptTemplate, type index_RefinementPromptTemplate as RefinementPromptTemplate, type index_RefinementResult as RefinementResult, type index_RemainingWorkBlock as RemainingWorkBlock, type index_TaskDispatchOutcome as TaskDispatchOutcome, type index_TopologicalSortResult as TopologicalSortResult, type index_ValidationError as ValidationError, type index_ValidationErrorCode as ValidationErrorCode, type index_ValidationResult as ValidationResult, type index_ValidationWarning as ValidationWarning, type index_ValidationWarningCode as ValidationWarningCode, type index_WaveAdjustment as WaveAdjustment, type index_WaveAssignerConfig as WaveAssignerConfig, type index_WaveAssignmentResult as WaveAssignmentResult, type index_WaveDispatchContext as WaveDispatchContext, index_WaveDispatchCoordinator as WaveDispatchCoordinator, type index_WaveDispatchRequest as WaveDispatchRequest, type index_WaveExecutionConfig as WaveExecutionConfig, index_WaveExecutionController as WaveExecutionController, type index_WavePlanExecutionState as WavePlanExecutionState, type index_WavePlanGenerationResult as WavePlanGenerationResult, index_WavePlanGenerator as WavePlanGenerator, type index_WavePlanGeneratorConfig as WavePlanGeneratorConfig, index_WavePlannerAIClient as WavePlannerAIClient, type index_WavePlannerConfig as WavePlannerConfig, type index_WaveProgress as WaveProgress, type index_WaveSSEEvent as WaveSSEEvent, index_advanceToNextWave as advanceToNextWave, index_assignWaves as assignWaves, index_autoAdvanceWave as autoAdvanceWave, index_buildDAGGraph as buildDAGGraph, index_buildSpecContentForItem as buildSpecContentForItem, index_collectFinalMetrics as collectFinalMetrics, index_computeCriticalPath as computeCriticalPath, index_createFlatPlan as createFlatPlan, index_createFlatPlanFromDescriptions as createFlatPlanFromDescriptions, index_createPlanRefinementService as createPlanRefinementService, index_createPromptConstructor as createPromptConstructor, index_createWavePlanGenerator as createWavePlanGenerator, index_defaultTemplate as defaultTemplate, index_extractAllTaskCodes as extractAllTaskCodes, index_extractWaveFromTaskCode as extractWaveFromTaskCode, index_findCommonTheme as findCommonTheme, index_findTaskByCode as findTaskByCode, index_generatePlanForItem as generatePlanForItem, index_generateWaveLabel as generateWaveLabel, index_generateWavePlan as generateWavePlan, index_getTasksInWave as getTasksInWave, index_groupBy as groupBy, index_markWavePlanComplete as markWavePlanComplete, index_normalizeComplexity as normalizeComplexity, index_normalizeModel as normalizeModel, index_parseDependencies as parseDependencies, index_parseFilePaths as parseFilePaths, index_parseWavePlanResponse as parseWavePlanResponse, index_projectWavePlanToPlan as projectWavePlanToPlan, index_refinementTemplate as refinementTemplate, index_scorePlan as scorePlan, index_simplifiedTemplate as simplifiedTemplate, index_sleep as sleep, index_toActivityEventType as toActivityEventType, index_topologicalSort as topologicalSort, index_validateDAG as validateDAG };
}

export { type DispatchResult as $, type AddDrawerInput as A, type AIClientConfig as B, type Closet as C, DisabledClient as D, type ActiveTaskInfo as E, type AssignedWave as F, type CodebaseContextBlock as G, type Hall as H, CodebaseContextService as I, type CompletedWorkBlock as J, type KgAddInput as K, LocalShimClient as L, MemPalaceService as M, CompletionListener as N, ConcurrencyManager as O, type PalaceContextBlock as P, type ConfidenceSignalUpdate as Q, type RecallInput as R, type SearchHit as S, type Tunnel as T, type ConstraintBlock as U, type CriticalPathAnnotation as V, type WakeUpInput as W, type CriticalPathResult as X, type DAGNode as Y, type DAGValidatorConfig as Z, type DispatchError as _, type MemPalaceConfig as a, generatePlanForItem as a$, type FleetCapacity as a0, type FleetContextBlock as a1, FleetContextService as a2, type GenerationResult as a3, type MemoryContextBlock as a4, type OptimizationResult as a5, type ParsedEdge as a6, type ParsedStatistics as a7, type ParsedTask as a8, type ParsedWave as a9, type WaveExecutionConfig as aA, WaveExecutionController as aB, type WavePlanExecutionState as aC, type WavePlanGenerationResult as aD, WavePlanGenerator as aE, type WavePlanGeneratorConfig as aF, WavePlannerAIClient as aG, type WavePlannerConfig as aH, type WaveProgress as aI, type WaveSSEEvent as aJ, advanceToNextWave as aK, assignWaves as aL, autoAdvanceWave as aM, buildDAGGraph as aN, buildSpecContentForItem as aO, collectFinalMetrics as aP, computeCriticalPath as aQ, createFlatPlan as aR, createFlatPlanFromDescriptions as aS, createPlanRefinementService as aT, createPromptConstructor as aU, createWavePlanGenerator as aV, defaultTemplate as aW, extractAllTaskCodes as aX, extractWaveFromTaskCode as aY, findCommonTheme as aZ, findTaskByCode as a_, type ParsedWavePlan as aa, type PlanRefinementConfig as ab, PlanRefinementService as ac, type PlanScore as ad, type PredecessorSummary as ae, type ProjectedPlanIds as af, PromptConstructor as ag, type PromptConstructorConfig as ah, type PromptContext as ai, type PromptTemplate as aj, type RefinementPromptTemplate as ak, type RefinementResult as al, type RemainingWorkBlock as am, type TaskDispatchOutcome as an, type TopologicalSortResult as ao, type ValidationError as ap, type ValidationErrorCode as aq, type ValidationResult as ar, type ValidationWarning as as, type ValidationWarningCode as at, type WaveAdjustment as au, type WaveAssignerConfig as av, type WaveAssignmentResult as aw, type WaveDispatchContext as ax, WaveDispatchCoordinator as ay, type WaveDispatchRequest as az, type AddDrawerResult as b, generateWaveLabel as b0, generateWavePlan as b1, getTasksInWave as b2, groupBy as b3, markWavePlanComplete as b4, normalizeComplexity as b5, normalizeModel as b6, parseDependencies as b7, parseFilePaths as b8, parseWavePlanResponse as b9, projectWavePlanToPlan as ba, refinementTemplate as bb, scorePlan as bc, simplifiedTemplate as bd, sleep as be, toActivityEventType as bf, topologicalSort as bg, validateDAG as bh, type Drawer as c, type DrawerSource as d, type HallRelation as e, type KgContradiction as f, type KgInvalidateInput as g, type KgQueryInput as h, type KgTriple as i, McpAdapterClient as j, type McpTransport as k, type MemPalaceClient as l, type MemPalaceMode as m, type MemoryTier as n, type MemoryType as o, type RecallResult as p, type Room as q, type SearchInput as r, type SearchResult as s, type WakeUpResult as t, type Wing as u, type WingType as v, createMemPalaceClient as w, createMemPalaceService as x, estimateTokens as y, index as z };
