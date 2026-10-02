import { aO as ParsedTask, aP as DAGNode, aQ as TopologicalSortResult, aR as ParsedWavePlan, aS as ParsedEdge, aT as ValidationResult, aU as CriticalPathResult, aV as WaveAssignmentResult, aW as PlanScore, aX as GenerationResult, aY as FleetContextBlock, aZ as CodebaseContextBlock, a_ as PromptContext, a$ as CompletedWorkBlock, b0 as RemainingWorkBlock, b1 as PlanCodeGraph, b2 as WaveAssignerConfig, b3 as WaveSSEEvent, D as Database, b4 as ActiveTaskInfo, L as WaveTask, b5 as PredecessorSummary, b6 as WaveDispatchRequest, b7 as AssignedWave, b8 as BLAST_RADIUS_LISTED, b9 as BlastRadiusLine, ba as CodeGraphReview, bb as ConfidenceSignalUpdate, bc as ConstraintBlock, bd as CriticalPathAnnotation, be as DependentClaim, bf as GraphDependentsSource, bg as MAX_DEPENDENT_CLAIMS_PER_TASK, bh as MemoryContextBlock, bi as OptimizationResult, bj as ParsedStatistics, bk as ParsedWave, bl as SelectedDependentClaims, bm as SequencedLine, bn as TaskBlastRadius, bo as ValidationError, bp as ValidationErrorCode, bq as ValidationWarning, br as ValidationWarningCode, bs as WaveAdjustment, bt as WavePlanExecutionState, bu as WavePlannerConfig, bv as assignWaves, bw as blastRadiusOf, bx as codeGraphOf, by as dependentClaimsOf, bz as describeCodeGraph, bA as isPlanCodeGraph, bB as readPlanCodeGraph, bC as selectDependentClaims, bD as withCodeGraph } from './index-DSM9TIYe.js';
import { E as EventType } from './enums-CbVZMWqb.js';
import { SQL } from 'drizzle-orm';
import { b as OrchestratorService, h as OrchestratorEvent } from './service-BbWARg0h.js';

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

/**
 * Model IDs for the planning agents.
 *
 * These live in one place because they had been hardcoded at six call sites
 * (`conductor.ts`, `conductor-graph.ts`, `generator.ts`, the reoptimize route,
 * the wiki command, and a doc comment). When `claude-sonnet-4-20250514` was
 * retired, every planning run failed with
 *
 *     404 not_found_error: model: claude-sonnet-4-20250514
 *
 * and the fix had to be applied six times. A retired model ID is a *when*, not
 * an *if* — so the ID belongs in one constant that every caller reads.
 *
 * Resolution order at every call site: an explicit `options.model`, then the
 * environment variable, then the constant. The env override is what lets a
 * conductor drop the planner to a cheaper tier for a cost-sensitive run
 * without a rebuild.
 */
/**
 * The wave planner's default.
 *
 * Opus rather than a cheaper tier is a deliberate product call, not a reflex:
 * DESIGN.md §1 argues the bottleneck is *planning throughput and quality*, not
 * agent capacity. A plan is one call of at most `maxTokens` output that then
 * governs an entire fleet of dispatched sessions — the cheapest place in the
 * system to spend model quality, and the most expensive place to skimp. A bad
 * decomposition wastes far more in dispatched-agent tokens than the planning
 * call itself ever costs.
 */
declare const DEFAULT_PLANNER_MODEL = "claude-opus-5";
/**
 * Wiki/asset generation. Summarisation over already-retrieved content is not
 * the same problem as decomposition, so it does not need the same tier.
 */
declare const DEFAULT_WIKI_MODEL = "claude-sonnet-5";
/**
 * Resolve the planner model: explicit argument → env override → default.
 */
declare function resolvePlannerModel(explicit?: string): string;
/**
 * The planner's output ceiling: 16,000 tokens.
 *
 * It was 8,192, written in three places. The ceiling is not the plan's alone:
 * it covers the model's thinking too, and on the default planner model
 * thinking is on unless a request switches it off — which no request here
 * does. So a plan had whatever of 8,192 the thinking left, and a plan that ran
 * out was refused as truncated (correctly — see `ai-client.ts`) and the run
 * fell back to a flat list.
 *
 * 16,000 is headroom, not spend: output is billed as generated. It is also
 * under the size at which the SDK refuses a non-streaming request (above
 * 21,333 tokens it requires streaming), so this needs no change to how the
 * call is made.
 */
declare const DEFAULT_PLANNER_MAX_TOKENS = 16000;
/** Resolve the ceiling: explicit argument → `WAVE_PLANNER_MAX_TOKENS` → default. */
declare function resolvePlannerMaxTokens(explicit?: number, env?: NodeJS.ProcessEnv): number;
/**
 * Resolve the wiki model: explicit argument → env override → default.
 */
declare function resolveWikiModel(explicit?: string): string;

interface AIClientConfig {
    apiKey: string;
    /** Model ID. Prefer `resolvePlannerModel()` over a literal — see models.ts. */
    model: string;
    maxTokens: number;
    timeout?: number;
}
/**
 * The model answered, and the answer was cut off at the token ceiling.
 *
 * Its own type for two reasons. It carries what was received, so the record of
 * the call can say how many tokens were spent and that this is why it failed —
 * a truncated plan used to be indistinguishable, afterwards, from a network
 * error. And it is not retried: the same prompt against the same ceiling is
 * cut off in the same place, and it was being sent four times, with backoff,
 * before the failure was reported.
 */
declare class PlannerTruncatedError extends Error {
    readonly generation: GenerationResult;
    readonly retryable = false;
    constructor(message: string, generation: GenerationResult);
}
declare class WavePlannerAIClient {
    private client;
    private config;
    /** The model this client asks for — which may be an alias the API resolves. */
    get modelRequested(): string;
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
     * @param targetScore - The threshold the plan is being held to (0-1), when the caller knows it
     * @returns Formatted refinement prompt
     */
    renderRefinement(context: PromptContext, currentPlan: string, currentScore: number, targetScore?: number): string;
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
type MemPalaceMode = 'local' | 'falkor-lite' | 'mcp' | 'graphiti' | 'disabled';
interface MemPalaceConfig {
    /** Active mode. "local" uses the SQLite shim, "mcp" uses an external MemPalace MCP server, "disabled" is a no-op. */
    mode: MemPalaceMode;
    /** Default wing slug — usually the repo identifier */
    defaultWingSlug: string;
    /** Default wing human name */
    defaultWingName?: string;
    /** Optional MCP endpoint (e.g. local Unix socket or HTTP) when mode=mcp */
    mcpEndpoint?: string;
    /** Bearer token for a Graphiti server behind auth (hosted tier). */
    mcpApiKey?: string;
    /** Snapshot directory for mode=falkor-lite. Omit for ephemeral. */
    dataDir?: string;
    /**
     * Graphiti write path. `deterministic` uses add_triplet and needs no LLM key
     * on the server; `llm` uses add_memory and does. Defaults to deterministic —
     * memory must not fail closed when no key is configured (TRD 18 §4).
     */
    graphitiExtraction?: 'deterministic' | 'llm';
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
    /**
     * For a plan made mid-run: what has already been done, and what is left.
     *
     * The templates have always been able to render these (`renderWorkContext`),
     * and `PromptContext` has always had the fields. Nothing set them: a
     * re-plan told the model "N tasks are already complete" as a sentence and
     * gave it none of them, so it planned the whole specification again without
     * knowing which files had changed or what had failed.
     */
    completedWork?: CompletedWorkBlock;
    remainingWork?: RemainingWorkBlock;
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
     * A template's name and version, for the record of a planner call. A prompt
     * is only comparable with another made from the same template at the same
     * version; without this a trace would say what was sent and not what wrote it.
     */
    templateInfo(name: string): {
        name: string;
        version: string;
    };
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
    constructRefinementPrompt(specContent: string, itemTitle: string, itemId: string, repo: string, config: PromptConstructorConfig, currentPlan: string, currentScore: number, targetScore?: number): Promise<string>;
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
/**
 * The refinement gate's threshold, for every path that plans.
 *
 * There were two. The route that generates a plan directly read
 * `WAVE_PLANNER_MIN_PARALLELIZATION` and defaulted to 0.3; the conductor graph
 * — the path every ticket from the bridge takes — had its own default of 0.7
 * and read no setting at all. So the same specification was held to "the
 * critical path is at most 70% of the tasks" on one path and "at most 30%" on
 * the other, and on the stricter one a plan of ten tasks in four waves (0.6)
 * was sent back twice to be cut smaller.
 *
 * One function, read by both. 0.3 is the looser of the two and is kept as the
 * default because the gate's number is a ratio of counts, not a measurement
 * of plans that went well — see `parallelizationGateApplies`. Until there is
 * such a measurement the gate should spend as few model calls as it can.
 */
declare const DEFAULT_MIN_PARALLELIZATION_SCORE = 0.3;
declare function resolveMinParallelizationScore(explicit?: number, env?: NodeJS.ProcessEnv): number;
/**
 * Plans smaller than this are not held to the parallelization gate.
 *
 * The score is `1 - criticalPath / tasks`. For a plan of one task that is 0;
 * for two or three tasks in sequence it is 0. None of those is a bad plan — a
 * specification that is one change is one task — but each was below any
 * threshold, so each was sent back to a prompt whose advice is to break work
 * into smaller pieces, up to the iteration limit, and a refinement was kept
 * whenever it scored higher, which splitting always does. The gate was
 * manufacturing tasks out of work that did not have them.
 *
 * With fewer than four tasks there is not enough plan for the ratio to say
 * anything, so the gate is not asked.
 */
declare const MIN_TASKS_FOR_PARALLELIZATION_GATE = 4;
declare function parallelizationGateApplies(taskCount: number): boolean;
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
    /**
     * Public so a host can attach a MemPalace service after construction —
     * `setMemPalaceService` is how recall reaches the planning prompt. Without an
     * accessor the service was unreachable and every memory written was write-only.
     */
    readonly promptConstructor: PromptConstructor;
    private aiClient;
    private config;
    /**
     * Why the most recent refinement pass was discarded, if it was.
     *
     * A discarded refinement is no longer fatal, which means it is no longer
     * loud either — without this the conductor would silently burn a model call
     * per iteration and report an unchanged score with no reason given.
     */
    lastRefinementError?: string;
    /**
     * The planning run a call belongs to, for its trace: an initial plan starts
     * one and its refinements continue it. A service built fresh after a restart
     * starts a new run for a refinement; the trace's `basedOnSha` still says
     * which plan it was refining.
     */
    private runId;
    private step;
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
    /**
     * Public because the conductor graph (`@devpilot.sh/conductor-agent`) drives
     * generation and refinement as separate nodes with its own scoring gate
     * between them. `generateAndRefine` remains the batteries-included entry point
     * for callers that just want a plan.
     */
    generateInitialPlan(specContent: string, itemTitle: string, itemId: string, repo: string, constructorConfig: PromptConstructorConfig): Promise<{
        plan: ParsedWavePlan;
        score: PlanScore;
        tokensUsed: number;
    }>;
    /** What every trace of a call carries, before the call has an answer. */
    private traceBase;
    /**
     * Refine an existing plan to improve parallelization.
     */
    /** Public for the same reason as `generateInitialPlan`. */
    refineplan(specContent: string, itemTitle: string, itemId: string, repo: string, constructorConfig: PromptConstructorConfig, currentPlan: ParsedWavePlan, currentScore: number): Promise<{
        plan: ParsedWavePlan;
        score: PlanScore;
        tokensUsed: number;
    }>;
    /**
     * Score a parsed wave plan.
     *
     * Public alongside `generateInitialPlan` / `refineplan`: the conductor graph
     * branches on this score between its generate and refine nodes, and the
     * standalone `scorePlan()` export needs the wave assignment and critical path
     * computed first — which is exactly what this composes.
     */
    scorePlan(plan: ParsedWavePlan): PlanScore;
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
    /**
     * Whether the waves were assigned with a code graph — and when they were
     * not, why not. Always present: a plan made without the graph says so.
     */
    codeGraph: PlanCodeGraph;
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
    /**
     * Public so the conductor graph can persist an approved plan as its own node.
     * The graph decides *when* a plan is approved (after a human interrupt); the
     * write itself is unchanged and still versions against prior plans.
     *
     * `codeGraph` is what a code graph said when `waveAssignment` was made — or
     * that it was not used, and why. Optional for the callers that predate it;
     * left out, the plan row records that nobody asked (NULL), which is the
     * truth. The assignment's adjustments are recorded either way.
     */
    persistWavePlan(horizonItemId: string, planId: string, wavePlan: ParsedWavePlan, criticalPath: CriticalPathResult, waveAssignment: WaveAssignmentResult, score: PlanScore, codeGraph?: PlanCodeGraph): Promise<string>;
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
 * The planner's record of itself: every call to the planning model, and every
 * decision a person made about a plan.
 *
 * A plan is the most leveraged thing DevPilot produces — one model call that
 * then governs a fleet of sessions — and until this file the only thing kept
 * of that call was the answer that was chosen. Not what the model had been
 * told, not the plans tried and discarded on the way, not what a reviewer
 * sent back or why. A planner cannot be improved from that: there is nothing
 * to hold a plan's outcome against.
 *
 * So each call writes a row (`planner_traces`), each review writes a row
 * (`planner_reviews`), and when a plan is persisted every row that led to it
 * is given its id. From there the outcome is already recorded, task by task,
 * in `wave_tasks`. `planner-corpus.ts` joins the two.
 *
 * ## Three rules
 *
 * NEVER IN THE WAY. Every function here catches everything. A record that can
 * fail a planning run is worse than no record, and a database that is locked
 * or missing a table must cost a plan nothing.
 *
 * LOCAL. A prompt holds the specification, the repository's file tree and any
 * memory that was recalled; a response is the plan. They are written to the
 * cockpit's own database, on the machine the cockpit runs on, and nothing in
 * DevPilot sends them anywhere. Whether any of it should ever leave is a
 * decision for the person whose code it is, and is not made here.
 *
 * OFF IS OFF. `DEVPILOT_PLANNER_TRACE=0` records nothing.
 */

type PlannerTraceKind = 'initial' | 'refine' | 'reoptimize';
type PlannerTraceOutcome = 'valid' | 'invalid' | 'error';
interface PlannerTraceRecord {
    runId: string;
    step: number;
    kind: PlannerTraceKind;
    itemId: string;
    repo: string;
    template: string;
    templateVersion: string;
    modelRequested: string;
    prompt: string;
    constraints?: string[];
    /** What the model answered, when it did. */
    response?: {
        content: string;
        model: string;
        stopReason: string | null;
        tokensInput: number;
        tokensOutput: number;
        cacheReadTokens: number;
        cacheWriteTokens: number;
        durationMs: number;
    };
    /** For a refinement: the plan it was asked to improve, and the score to beat. */
    basedOn?: {
        rawMarkdown: string;
        score: number;
    };
    outcome: PlannerTraceOutcome;
    errors?: string[];
    warnings?: string[];
    taskCount?: number;
    score?: PlanScore;
}
interface PlanReviewRecord {
    itemId: string;
    /** The plan that was on screen, as the planner wrote it. */
    rawMarkdown?: string | null;
    action: 'approve' | 'refine' | 'abort';
    constraints?: string[];
    reason?: string;
    score?: number | null;
}
/** False when `DEVPILOT_PLANNER_TRACE` says no. On by default. */
declare function plannerTraceEnabled(env?: NodeJS.ProcessEnv): boolean;
/** A plan's identity: the hash of its text exactly as the model wrote it. */
declare function planSha(text: string): string;
declare function newPlannerRunId(): string;
/** Record one call to the planning model. Never throws. */
declare function recordPlannerTrace(record: PlannerTraceRecord): Promise<void>;
/** Record what a person decided about a plan they were shown. Never throws. */
declare function recordPlanReview(review: PlanReviewRecord): Promise<void>;
/**
 * A plan has been persisted for the item: give its id to everything that led
 * to it.
 *
 * "Everything that led to it" is every call and every review for the item not
 * already claimed by an earlier plan — the initial attempt, the refinements
 * that were kept and the ones that were not, the review that sent it back.
 * The one call whose answer IS this plan is marked `chosen`, matched on the
 * hash of the text; a fallback plan, which no model wrote, has none.
 *
 * Never throws.
 */
declare function linkTracesToPlan(itemId: string, rawMarkdown: string | null | undefined, wavePlanId: string): Promise<void>;
/** For tests: forget that a warning was printed. */
declare function resetPlannerTraceWarning(): void;

/**
 * A planning episode: what the planner was told, what it answered, what a
 * person said about it, and how the plan turned out.
 *
 * `trace.ts` writes the first three as they happen. The fourth was already
 * being recorded, task by task, by the execution side — status, attempts,
 * errors, the files each task really changed, when it merged, what its session
 * cost. This file is the join, and the handful of figures that turn a finished
 * run into something a plan can be judged by.
 *
 * It is the half that decides what counts, on plain rows: no database, no
 * clock. The loader that fills the rows is column mappings.
 *
 * ## What an outcome is, and is not
 *
 * Everything here is about how the plan RAN: did its tasks finish, first time,
 * without colliding, on the files it said they would touch. Nothing here knows
 * whether the code was right. A plan whose every task finished cleanly and
 * built the wrong thing scores perfectly, and a reader must not take these
 * figures for a measure of quality. They are the part of quality a planner is
 * directly responsible for.
 *
 * ## Local
 *
 * An episode holds a specification, a file tree, a plan and what agents said
 * they did. `redactEpisode` produces the same episode with every piece of text
 * and every path removed, leaving shape and figures.
 */
declare const PLANNER_EPISODE_SCHEMA = "devpilot.planner-episode/1";
interface EpisodeCall {
    step: number;
    kind: string;
    at: string;
    template: string;
    templateVersion: string;
    modelRequested: string;
    model: string | null;
    prompt: string | null;
    response: string | null;
    /** `valid`, `invalid` or `error`. */
    outcome: string;
    errors: string[];
    warnings: string[];
    taskCount: number | null;
    score: number | null;
    previousScore: number | null;
    /** For a refinement: whether it scored above the plan it was given. */
    improved: boolean | null;
    /** Whether this call's answer is the plan that was persisted. */
    chosen: boolean;
    stopReason: string | null;
    tokensInput: number | null;
    tokensOutput: number | null;
    cacheReadTokens: number | null;
    cacheWriteTokens: number | null;
    durationMs: number | null;
    constraints: string[];
}
interface EpisodeReview {
    at: string;
    action: string;
    constraints: string[];
    reason: string | null;
    score: number | null;
}
interface EpisodeTask {
    taskCode: string;
    waveIndex: number;
    description: string | null;
    /** The files the plan said the task would touch. */
    filePaths: string[];
    dependencies: string[];
    complexity: string | null;
    recommendedModel: string | null;
    status: string;
    attempts: number;
    error: string | null;
    summary: string | null;
    /** The files the task's latest attempt changed. Null is "not recorded", not "none". */
    filesChanged: string[] | null;
    startedAt: number | null;
    completedAt: number | null;
    merged: boolean;
    /** The latest attempt's session, when it ended and reported. */
    costUsd: number | null;
    tokens: number | null;
}
interface EpisodePlan {
    wavePlanId: string;
    status: string;
    failureReason: string | null;
    version: number;
    totalWaves: number;
    totalTasks: number;
    criticalPathLength: number;
    parallelizationScore: number;
    isolated: boolean | null;
    /** How many tasks the assigner moved, by reason. Null when it was not recorded. */
    adjustments: Record<string, number> | null;
    codeGraphUsed: boolean | null;
    createdAt: number;
    startedAt: number | null;
    completedAt: number | null;
    tasks: EpisodeTask[];
}
interface PlanOutcome {
    /** How the run ended: `completed`, `failed`, `running`, or `not-run` (never dispatched). */
    ended: 'completed' | 'failed' | 'running' | 'not-run';
    tasks: {
        total: number;
        /** Tasks that were dispatched at least once. */
        dispatched: number;
        completed: number;
        failed: number;
        skipped: number;
        /** Needed more than one attempt, however they ended. */
        retried: number;
        /** Ended on a branch that would not merge into the run branch. */
        conflicted: number;
        /** Dispatched and ended, one way or another — what the first-attempt rate is out of. */
        settled: number;
        /** Of those, completed without a retry. */
        firstAttempt: number;
    };
    /**
     * Of the tasks that were dispatched and have ended, the share that completed
     * on their first attempt. Null when none has ended.
     */
    firstAttemptPassRate: number | null;
    /**
     * How well the plan predicted which files each task would touch — the
     * prediction every conflict check rests on. Over tasks whose changes were
     * recorded:
     *
     *   precision  of the files the plan named, the share that were changed
     *   recall     of the files that were changed, the share the plan named
     *
     * Null when no task recorded its changes.
     */
    files: {
        tasksMeasured: number;
        planned: number;
        changed: number;
        both: number;
        precision: number | null;
        recall: number | null;
    } | null;
    /**
     * Pairs of tasks that ran in the same wave and changed the same file — the
     * collision the wave layout exists to prevent, counted from what was
     * actually changed rather than what was planned.
     */
    sameWaveCollisions: number;
    /** First dispatch to last ending. Null until the run has both. */
    wallClockMs: number | null;
    /** Added over the tasks whose session reported one. Latest attempt only. */
    costUsd: number | null;
    tokens: number | null;
}
interface PlannerEpisode {
    schema: typeof PLANNER_EPISODE_SCHEMA;
    itemId: string;
    repo: string | null;
    calls: EpisodeCall[];
    reviews: EpisodeReview[];
    /** Null when no plan was persisted: the run was abandoned at review, or every call failed. */
    plan: EpisodePlan | null;
    outcome: PlanOutcome | null;
}
/** The figures a finished — or unfinished — run is judged by. */
declare function planOutcome(plan: EpisodePlan): PlanOutcome;
/**
 * Group calls, reviews and plans into episodes.
 *
 * One episode per persisted plan, holding the calls and reviews that carry its
 * id. Calls and reviews that never led to a plan — a run abandoned at review,
 * or one where every call failed — are one episode per item, with no plan. A
 * plan with no recorded calls (made before calls were recorded) is still an
 * episode: its outcome is real, and it is what calibration is drawn from.
 *
 * Newest first, by the plan's creation or the first call.
 */
declare function buildEpisodes(input: {
    calls: (EpisodeCall & {
        itemId: string;
        repo: string;
        wavePlanId: string | null;
    })[];
    reviews: (EpisodeReview & {
        itemId: string;
        wavePlanId: string | null;
    })[];
    plans: (EpisodePlan & {
        itemId: string;
        repo: string | null;
    })[];
}): PlannerEpisode[];
/**
 * The same episode with every piece of text and every path taken out.
 *
 * What is left is shape and figures: how many calls, which template and model,
 * token counts, scores, whether each call was valid, what the reviewer chose
 * (not what they wrote), each task's wave, complexity, attempts and ending,
 * how many files it named and changed, and the outcome. It is what could be
 * compared across workspaces without any of them showing another its code.
 *
 * Counts replace lists. Nothing is hashed: a hash of a file path is a path to
 * anyone who can guess the path.
 */
declare function redactEpisode(episode: PlannerEpisode): PlannerEpisode;
interface CorpusSummary {
    episodes: number;
    withPlan: number;
    /** Plans whose run has ended, one way or the other. */
    ended: number;
    calls: number;
    /** Calls by how they ended. */
    callOutcomes: Record<string, number>;
    /** Refinement calls, and how many scored above the plan they were given. */
    refinements: number;
    refinementsImproved: number;
    /** Calls that stopped at the token ceiling. */
    truncated: number;
    reviews: Record<string, number>;
    tokensInput: number;
    tokensOutput: number;
    /** Over ended runs. */
    firstAttemptPassRate: number | null;
    filePrecision: number | null;
    fileRecall: number | null;
    sameWaveCollisions: number;
}
/** A corpus at a glance: how the planner is doing, on this machine's own runs. */
declare function summarizeCorpus(episodes: readonly PlannerEpisode[]): CorpusSummary;
declare const PLANNER_FIGURES_VERSION = 1;
/**
 * One plan as numbers: how it was made, what a reviewer did, how it ran.
 *
 * This is the part of an episode the hosted plane is sent. It is defined as
 * its own type, field by field, rather than as "an episode with the text
 * removed", so that what crosses is a list someone can read — and so that a
 * field added to an episode later does not cross by default.
 *
 * WHAT IS NOT HERE, and has no field to be in: the prompt, the response, the
 * specification, a task's description, a file path, a reviewer's words, an
 * error message, an agent's summary. Every field is a count, a ratio's two
 * halves, a duration, a cost, a flag, or one of three identifiers DevPilot or
 * the model provider chose (template name, template version, model id).
 *
 * Rates are sent as their two counts, not as the quotient: figures from many
 * plans are pooled by adding counts, and a mean of rates would let a plan of
 * two tasks weigh the same as a plan of thirty.
 */
interface PlannerFigures {
    v: typeof PLANNER_FIGURES_VERSION;
    calls: number;
    callsValid: number;
    callsRejected: number;
    callsFailed: number;
    /** Calls cut off at the token ceiling. */
    callsTruncated: number;
    refinements: number;
    /** Refinements that scored above the plan they were given. */
    refinementsImproved: number;
    tokensInput: number;
    tokensOutput: number;
    /** Time spent in planner calls, added up. Null when no call recorded one. */
    planningMs: number | null;
    /** The model that wrote the plan that was persisted. Null when no recorded call did. */
    model: string | null;
    template: string | null;
    templateVersion: string | null;
    reviewsApproved: number;
    reviewsSentBack: number;
    reviewsAbandoned: number;
    tasks: number;
    waves: number;
    criticalPathLength: number;
    parallelization: number;
    codeGraphUsed: boolean | null;
    /** Tasks the assigner moved, by reason. Null when the plan predates their being recorded. */
    movedForSharedFile: number | null;
    movedForDependency: number | null;
    movedForCapacity: number | null;
    ended: PlanOutcome['ended'];
    tasksDispatched: number;
    tasksCompleted: number;
    tasksFailed: number;
    tasksSkipped: number;
    tasksRetried: number;
    tasksConflicted: number;
    tasksSettled: number;
    tasksFirstAttempt: number;
    /** Planned-versus-changed files, over the tasks that recorded their changes. Counts only. */
    filesTasksMeasured: number;
    filesPlanned: number;
    filesChanged: number;
    filesBoth: number;
    sameWaveCollisions: number;
    wallClockMs: number | null;
    costUsd: number | null;
    tokens: number | null;
}
/**
 * The figures for one episode, or null when it has no plan.
 *
 * Built by reading named fields, never by copying an object — the reason a
 * string from an episode cannot arrive in the result by accident.
 */
declare function planFigures(episode: PlannerEpisode): PlannerFigures | null;

interface ProjectedPlanIds {
    planId: string;
    workstreamIds: string[];
    taskIds: string[];
}
/**
 * Build spec markdown from an item + optional existing plan.
 * Ported from the Next route's buildSpecContent() (typed, no `any`).
 *
 * Order: the title as the only top-level heading, then the ticket description
 * when the item has one, then whatever the existing plan contributes. An item
 * with no description produces exactly what it did before descriptions existed.
 */
declare function buildSpecContentForItem(item: {
    title: string;
    description?: string | null;
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
    /** The item's ticket description, when it has one. */
    description?: string | null;
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
 * The ticket description: the body of the tracker issue a horizon item came
 * from, as distinct from its title.
 *
 * Until this existed the planner was given the title and nothing else. The
 * bridge has always forwarded the body, the cockpit dropped it on the floor,
 * and a ticket called "Fix checkout" whose body was the actual specification
 * was planned from two words.
 *
 * Everything here is pure and imports nothing, on purpose: it is used by the
 * planner's spec builder, by the worker prompt in `orchestrator/`, and by the
 * Next route that stores the text, and those must not drag one another in.
 *
 * The description is UNTRUSTED. It is written in a tracker any teammate — or
 * any integration with a token — can write to, and it ends up inside prompts.
 * So it is never interpreted here, only bounded, escaped and labelled.
 */
/**
 * The longest description that is stored or shown to a model.
 *
 * A tracker puts no useful bound on a ticket body, and people paste logs into
 * them. The text is stored on the item (so every board load returns it) and
 * then sent to the planner inside a prompt that also carries the file tree and
 * fleet state, and again to every worker dispatched for the item. 20,000
 * characters is roughly 5,000 tokens: room for a real specification, not for a
 * stack trace that crowds out the instructions around it.
 */
declare const MAX_ITEM_DESCRIPTION_CHARS = 20000;
/**
 * Turn whatever arrived as a description into what gets stored.
 *
 * Returns null for anything that is not a non-blank string, so "no
 * description" has exactly one representation and callers need one check.
 * Over-long text is cut to `MAX_ITEM_DESCRIPTION_CHARS` including the notice,
 * which makes this idempotent: normalising an already-normalised description
 * returns it unchanged.
 */
declare function normalizeItemDescription(raw: unknown): string | null;
/**
 * Decide which description a newly created item should carry.
 *
 * The incoming one wins when there is one. When there is not, the item
 * inherits the most recent description already held for the same ticket
 * (`existing`, newest first): the same ticket can be posted again — after its
 * item was swept off the board, or by a redelivery that raced the "is it
 * already there?" check — and a re-post that happens to omit the body must not
 * leave the new item with less than the board already knew.
 */
declare function resolveItemDescription(incoming: unknown, existing?: ReadonlyArray<string | null | undefined>): string | null;
/**
 * Render a description for inclusion in a prompt: a sentence saying what it
 * is, then the text between `<ticket-description>` tags.
 *
 * Two things are escaped, and nothing else is touched:
 *
 * - Runs of three or more backticks become tildes. Both open a markdown code
 *   block, so the ticket reads the same — but every planner template embeds
 *   the spec inside a ``` fence, and a ticket containing a code block would
 *   otherwise close that fence and spill the rest of itself into the prompt as
 *   though it were instructions.
 * - The delimiting tags themselves, so the text cannot end its own block early.
 *
 * Headings, lists and everything else are left exactly as written. They need
 * no escaping because of where they are: inside the tags, a `# Heading` is
 * visibly part of the ticket and not the title of anything.
 */
declare function renderTicketDescription(description: string): string;

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

/**
 * Work history: what DevPilot's own runs did to a file.
 *
 * A code graph says what a file IS — its symbols, what calls what — and every
 * code graph says that; it is derivable from the repository. What no indexer
 * has is what HAPPENED to the file: which ticket led to which task changing
 * it, whether that task had to be retried, what it collided with, what its
 * agent said it did, and what it cost. DevPilot already records all of that,
 * one row per task. This joins it on file path (TRD 27 §4, the L2 layer).
 *
 * It is the kind of memory worth giving an agent because the agent cannot
 * work it out from the checkout: "the last task that touched this file
 * conflicted with the run branch and was redone" is not in any source file.
 *
 * Like `score/evidence.ts`, this is the half that decides what counts, on
 * plain rows, with no database and no clock — so each decision can be tested
 * without either. The loader that fills the rows is column mappings.
 *
 * LOCAL DATA. Completion summaries and error text are written by agents and
 * runners about the user's code. Nothing here sends them anywhere, and a
 * caller that puts them in a prompt must treat them as untrusted text.
 */
/** One wave task, with what is needed of its plan, its item and its session. */
interface WorkHistoryRow {
    taskCode: string;
    label: string;
    status: string;
    /** The files the plan assigned the task. */
    filePaths: string[];
    /**
     * The files the task's latest attempt changed, from its completion report.
     * Null is "not recorded", which is not `[]` — a task that changed nothing.
     */
    filesChanged: string[] | null;
    /** Epoch ms; null when it has not happened. */
    startedAt: number | null;
    lastAttemptAt: number | null;
    completedAt: number | null;
    retryCount: number;
    errorMessage: string | null;
    completionSummary: string | null;
    wavePlanId: string;
    /** The horizon item the plan belongs to. */
    itemTitle: string;
    ticketId: string | null;
    /** The session of the task's latest attempt, or null when it has none. */
    session: {
        /** True once the session reached COMPLETE or ERROR. */
        terminal: boolean;
        /** `ruflo_sessions.cost_usd`: whole cents, written only when a completion report is applied. */
        reportedCostCents: number | null;
        /** `telemetry.costUsd`: the runner's reading — final if it sent one at the end, else its last while running. */
        telemetryCostUsd: number | null;
    } | null;
}
interface WorkHistoryEntry {
    taskCode: string;
    /** The task's label. */
    task: string;
    /** The item the task belonged to, and its ticket. */
    item: string;
    ticketId: string | null;
    wavePlanId: string;
    status: string;
    /** When it ended, or — for one that has not — when its latest attempt started. ISO-8601. */
    at: string;
    /**
     * How the task is known to concern the path. `'changed'`: the path is in the
     * files its attempt changed. `'planned'`: nothing recorded what it changed,
     * and the path is among the files the plan gave it — which is not the same
     * as having touched it.
     */
    matchedOn: 'changed' | 'planned';
    /** True when the task needed more than one attempt. */
    retried: boolean;
    attempts: number;
    /**
     * The most recent failure recorded for the task, if any — also present on a
     * task that then succeeded on its retry, where it is why the first attempt
     * did not. Capped in length.
     */
    error: string | null;
    /** True when that failure was its branch not merging into the run branch. */
    conflicted: boolean;
    /** The agent's final message, cut to `SUMMARY_MAX_CHARS`. */
    summary: string | null;
    summaryTruncated: boolean;
    /**
     * What the latest attempt's session cost, in USD — only when that session
     * ended and reported. Null for a session still running (its reading is an
     * estimate that omits most of its output), and for a task with no session.
     * Earlier attempts of a retried task are not included.
     */
    costUsd: number | null;
}
interface WorkHistoryResult {
    /** Under each path as it was asked about, most recent first. */
    byPath: Record<string, WorkHistoryEntry[]>;
    /** For each path, how many matching tasks there were in all. */
    totals: Record<string, number>;
}
declare const DEFAULT_HISTORY_LIMIT = 5;
declare const MAX_HISTORY_LIMIT = 20;
declare const SUMMARY_MAX_CHARS = 400;
/**
 * For each path, the most recent tasks that changed it.
 *
 * WHICH TASKS. One whose recorded changes include the path; or, when nothing
 * recorded what it changed, one the plan assigned the path to. Recorded
 * changes win when they exist: a task that was given `a.ts` and is known to
 * have changed only `b.ts` is not history for `a.ts`.
 *
 * A task that was never dispatched is left out whatever its files — it is a
 * plan, not history. That covers `pending` tasks and the `skipped` tasks of a
 * run that ended early.
 *
 * ORDER. By when the task ended; for one still running, by when its latest
 * attempt started. Newest first, at most `limit` per path.
 */
declare function workHistoryForPaths(rows: readonly WorkHistoryRow[], paths: readonly string[], opts?: {
    limit?: number;
}): WorkHistoryResult;

interface WaveExecutionConfig {
    /**
     * default: 4 — at most this many of ONE plan's tasks in flight
     * (`dispatched` + `running`). A cap, enforced by the dispatch claim; it used
     * to be the size of one dispatch call's batch, so two calls two seconds apart
     * put eight agents on a plan capped at four.
     */
    maxConcurrentSubagents: number;
    /**
     * default: 8 — at most this many tasks in flight across every live plan.
     * Counts `dispatched` + `running`; it used to count `running` alone, a status
     * nothing ever set, so the count was always zero.
     */
    maxTotalActiveTasks: number;
    subagentDispatchDelayMs: number;
    waveAdvanceDelayMs: number;
    retryLimit: number;
    failurePolicy: 'halt' | 'continue';
    /**
     * default: true — LEGACY PATH ONLY.
     *
     * Whether `WaveExecutionController.handleWaveComplete` starts the next wave
     * by itself. That method is the only reader of this flag, and the
     * `ExecutionBridge` calls it only for a plan that no `WaveDriver` owns — a
     * plan dispatched through `/api/wave-plans/:id/dispatch` with nothing else
     * sequencing it. A plan the conductor graph is running is advanced by the
     * graph and by nothing else, whatever this says; see `WaveDriver` in
     * `execution-bridge.ts` for why there must be exactly one.
     */
    autoAdvance: boolean;
    /** Base URL the executing agent POSTs callbacks to, e.g. "http://localhost:3000/api/orchestrator". */
    callbackUrl: string;
}
/** Per-wave dispatch context loaded once from wavePlan → horizonItem. */
interface WaveDispatchContext {
    repo: string;
    itemTitle: string;
    /** The item's ticket description, when it has one. Untrusted text. */
    itemDescription?: string | null;
    linearTicketId?: string | null;
    /**
     * The run the plan's tasks belong to (`wave_plans.run_id`), and whether each
     * task gets its own worktree and branch (`wave_plans.isolated`). Decided at
     * the plan's first dispatch; see `WaveDispatchCoordinator.ensureRun`.
     */
    run: {
        id: string;
        isolated: boolean;
    };
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
 * What state a wave is in, decided in one place.
 *
 * "Is this wave over?" used to be answered five times, by five lists that did
 * not agree. The Next app's resume bridge counted `completed`, `failed` and
 * `cancelled` — the last of which is not a wave-task status at all — and left
 * out `skipped`. The completion listener and the controller counted
 * `completed`, `failed` and `skipped`. So a wave the controller considered
 * finished (a task failed its retry, the rest were skipped) was one the resume
 * bridge considered still running, and the conductor graph was never woken:
 * the run sat at "executing" until someone noticed.
 *
 * Everything that needs the answer imports it from here. A status added to the
 * enum without being classified below is a compile error, not a hang.
 */

/** A task that will not change again. A wave is over when every task is one of these. */
declare const TERMINAL_WAVE_TASK_STATUSES: readonly ["completed", "failed", "skipped"];
/**
 * A task an agent is (as far as the database knows) working on right now.
 *
 * `dispatched` is claimed-and-sent; `running` is the same task once the
 * orchestrator has confirmed the job started. Both occupy a worker, so both
 * count against the concurrency caps — counting only `running` is how the cap
 * came to cap nothing (see `freeDispatchSlots`).
 */
declare const IN_FLIGHT_WAVE_TASK_STATUSES: readonly ["dispatched", "running"];
/** A task the next dispatch pass may claim. `retrying` failed once and is owed another attempt. */
declare const DISPATCHABLE_WAVE_TASK_STATUSES: readonly ["pending", "retrying"];
/** A plan nothing will be dispatched for again. */
declare const TERMINAL_WAVE_PLAN_STATUSES: readonly ["completed", "failed"];
declare function isTerminalWaveTaskStatus(status: string): boolean;
declare function isInFlightWaveTaskStatus(status: string): boolean;
declare function isDispatchableWaveTaskStatus(status: string): boolean;
declare function isTerminalWavePlanStatus(status: string): boolean;
/**
 * A wave is over when every task in it is terminal.
 *
 * A wave with no tasks is over: there is nothing to wait for, and treating it
 * as "not over" is a wait that nothing can ever end.
 */
declare function isWaveOver(tasks: readonly {
    status: string;
}[]): boolean;
/** The two caps from `WaveExecutionConfig`, which is assignable to this. */
interface DispatchLimits {
    /** At most this many of ONE plan's tasks in flight. */
    maxConcurrentSubagents: number;
    /** At most this many tasks in flight across every live plan. */
    maxTotalActiveTasks: number;
}
/**
 * SQL for "tasks in flight across every plan that is still live".
 *
 * Tasks of a terminal plan are deliberately not counted. A plan that was failed
 * or abandoned can leave tasks `dispatched` forever — the reconciler only
 * settles tasks of live plans — and counting those would let a dead run hold a
 * worker slot permanently. The cost is that the siblings a halted plan leaves
 * running are briefly invisible to this count; the session runner's own
 * `--max-concurrent` still answers 429 for them, which queues rather than fails.
 *
 * Exported as SQL rather than run here because the dispatch claim embeds it in
 * its `UPDATE … WHERE`: a count read in one statement and acted on in the next
 * is a cap two concurrent dispatchers can both pass.
 */
declare function inFlightEverywhereSql(): SQL;
/** SQL for "tasks of this plan in flight". */
declare function inFlightInPlanSql(wavePlanId: string): SQL;
/**
 * How many more tasks of this plan could be dispatched right now.
 *
 * This is advice — whether a backfill pass is worth starting. The cap itself is
 * enforced by the claim in `WaveDispatchCoordinator`, which re-evaluates the
 * same two counts inside the statement that takes the task.
 */
declare function freeDispatchSlots(wavePlanId: string, limits: DispatchLimits, db?: Database): Promise<number>;
/**
 * How a finished wave ended. Structurally the conductor agent's settled
 * `WaveOutcome`, declared here because core must not import that package (it is
 * what carries the langchain dependency).
 */
type SettledWave = {
    state: 'complete';
} | {
    state: 'failed';
    failures: {
        taskCode: string;
        error: string;
    }[];
};
type WaveSignal = 
/** Stop waiting: the wave — or the whole run — has ended. */
{
    kind: 'over';
    outcome: SettledWave;
}
/**
 * Every task has finished, and the wave is still not over: the plan gives
 * each task its own branch, and work that completed has not been merged into
 * the run branch yet. `taskCodes` is every completed task of the wave, in
 * task-code order — what the runner is to be asked to merge.
 *
 * Nothing may act on this as if it were `over`. The next wave's tasks are cut
 * from the run branch, so starting them now would start them without the
 * work they depend on. Only `WaveExecutionController.signalForDriver` turns
 * it into something a driver acts on, by doing the merge.
 */
 | {
    kind: 'merge';
    taskCodes: string[];
}
/** The wave is still going and has tasks a dispatch pass could start now. */
 | {
    kind: 'backfill';
    dispatchable: number;
    freeSlots: number;
}
/** Nothing to do yet. `reason` is for a log line, not for branching. */
 | {
    kind: 'wait';
    reason: string;
};
/**
 * Task codes in the order a person would list them: `1.2` before `1.10`.
 *
 * It is the order a wave's branches are merged in. The order decides which of
 * two conflicting tasks goes in and which is sent back, so it has to be the
 * same every time the same wave is merged, and a plain string sort would put
 * `1.10` ahead of `1.2`.
 */
declare function compareTaskCodes(a: string, b: string): number;
/**
 * Decide what a wave's rows mean for whoever is driving the plan.
 *
 * Pure, so the decision is testable without a graph and the Next app's resume
 * bridge can stay a thin wrapper around it.
 *
 * The order of the checks is the policy:
 *
 * 1. **A failed plan is over, whatever its tasks are doing.** Under the `halt`
 *    policy a task that fails its retry fails the plan and skips everything not
 *    yet started, but siblings already running are left to finish — killing an
 *    agent mid-edit leaves a worse tree than letting it land. Those siblings
 *    must not hold the run open: the outcome is already decided, nothing new
 *    will be dispatched, and one of them going silent would otherwise leave the
 *    driver waiting on a plan the reconciler no longer looks at.
 * 2. **An isolated plan's wave is not over until what completed is merged.**
 *    Every task terminal, and a completed one not yet in the run branch, is
 *    `merge` — not `over`. This sits here, in the reading itself, rather than
 *    in each caller's handling of `over`, so that there is no way to ask "is
 *    the wave over?" and be told yes about work the next wave would not find.
 *    A wave with nothing completed has nothing to merge and falls through:
 *    every task failed or was skipped, and it is over (failed) as it always
 *    was.
 * 3. **Otherwise a wave is over when every task is terminal** — complete if all
 *    of them completed, failed if any did not.
 * 4. **Otherwise, backfill** when the plan is executing, a task is dispatchable
 *    and a slot is free.
 * 5. **Otherwise wait.**
 */
declare function readWaveSignal(plan: {
    status: string;
    failureReason?: string | null;
    isolated?: boolean | null;
}, tasks: readonly {
    taskCode: string;
    status: string;
    errorMessage?: string | null;
    mergedAt?: Date | null;
}[], freeSlots: number): WaveSignal;
/** `readWaveSignal` over the rows as they are in the database right now. */
declare function waveSignalFor(wavePlanId: string, waveIndex: number, limits: DispatchLimits, db?: Database): Promise<WaveSignal>;

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
 * Where an attempt's work is and what it changed, as its completion report
 * said. The four `wave_tasks` columns of the same names.
 */
interface TaskWork {
    branch: string | null;
    baseSha: string | null;
    commitSha: string | null;
    /** NULL is "the report did not say", which is not `[]`. */
    filesChanged: string[] | null;
}
/**
 * Read a task's work out of whatever arrived as its completion report.
 *
 * The payload is JSON a runner posted, typed here but not checked on the way
 * in, so each field is taken only if it is what it should be:
 *
 * - `branch` and `baseSha` are sent for an isolated task and for nothing else.
 * - `commitSha` is kept ONLY alongside a branch. Without one it is the shared
 *   checkout's HEAD when the session ended — a commit the task may have had
 *   nothing to do with — and storing that as the task's commit would be a
 *   claim nobody checked.
 * - `filesChanged` is the union of the three file lists, when the report has
 *   any of them. A payload with none (a `job:error` that carries only an error
 *   string) recorded nothing, and that is NULL rather than an empty list.
 */
declare function workFromReport(report: unknown): TaskWork;
/**
 * CompletionListener records what the orchestrator reports about a wave task —
 * that it started, that it completed — and emits the matching activity event.
 *
 * It records; it does not decide. It used to be handed two callbacks,
 * `onWaveComplete` and `onCapacityFreed`, and called them from inside the
 * completion write, which made "a task finished" and "start the next wave" one
 * indivisible act owned by whoever constructed the listener. With a second
 * component — the conductor graph — also starting waves, that is two drivers.
 * What happens *because* a task changed is now the `ExecutionBridge`'s call
 * (`settle`), which asks who owns the plan first.
 *
 * Failure is not handled here either: the retry-once rule and the failure
 * policy live in `WaveExecutionController.onTaskFailed`, and a second
 * implementation of them here (`handleTaskFailed`, which nothing called and
 * which wrote the status unconditionally) could only disagree with it.
 *
 * Every write is conditional on the state it expects to find, so the same
 * report delivered twice — a retried callback, or a callback racing the
 * reconciler — is applied once. Each method returns whether it changed the row.
 */
declare class CompletionListener {
    private db;
    constructor();
    /**
     * Handle task started event: `dispatched → running`.
     *
     * Only from `dispatched`, and only for the session the task is currently
     * linked to — a late `job:started` for an attempt that has since been
     * retried, or for a task that already finished, changes nothing.
     *
     * It does not touch `startedAt`. The dispatch claim recorded when the attempt
     * began; overwriting it here is how a task's start time came to be the moment
     * of its most recent event rather than of its first attempt.
     */
    handleTaskStarted(wavePlanId: string, taskCode: string, sessionId: string): Promise<boolean>;
    /**
     * Handle task completion event: store the summary and mark the task
     * `completed`.
     *
     * Applies to any task that is not already terminal. That is wider than "in
     * flight" on purpose: a task that was judged lost and is waiting for its
     * retry (`retrying`), or that a pause reset to `pending`, still names the
     * session that is now reporting success — the dispatch claim clears
     * `assignedSessionId` the moment a new attempt takes the task — and work that
     * was actually done should not be done again. A terminal task stays as it is:
     * a duplicate callback is a no-op (§9.5), and a task already `failed` may
     * have failed its plan, which a late success cannot un-fail.
     *
     * `sessionId`, when given, pins the write to the attempt that is reporting.
     *
     * `work` is where the attempt's work is and what it changed, taken from the
     * report that is being applied and written in the same statement as the
     * status — so a task is never `completed` with its branch still to come, and
     * the merge that may follow immediately finds the commit. It is absent when
     * the completion is applied from the session row by the reconciler: that row
     * does not carry a branch, a base, a commit or a file list, so those four
     * columns stay NULL for such a task, which reads — correctly — as "not
     * recorded".
     */
    handleTaskComplete(wavePlanId: string, taskCode: string, completionSummary?: string, sessionId?: string, work?: TaskWork, 
    /**
     * When the task actually finished, if that is not "now". The reconciler
     * passes the session row's own end time: it is recording a completion that
     * happened earlier — possibly weeks earlier, on a database left with tasks
     * in flight — and stamping it with the time of recording gave such a task
     * a duration of however long the cockpit had been switched off. Run
     * against a real database, six tasks that took minutes in August read as
     * forty-one days each.
     */
    completedAt?: Date): Promise<boolean>;
    /**
     * Record where a FAILED attempt's work is.
     *
     * The runner commits what a failed agent left and reports the branch it is
     * on, so the person deciding what went wrong can read it. Whether the task
     * is retried or the plan fails is not decided here — this only writes the
     * four columns, and only for the attempt that is reporting while it is still
     * the one in flight. Call it before the failure is applied.
     */
    recordTaskWork(wavePlanId: string, taskCode: string, sessionId: string, work: TaskWork): Promise<void>;
    /**
     * Emit a wave execution event to the activity_events table.
     */
    private emitEvent;
}

/**
 * What is left of the third wave-advancement path.
 *
 * This file used to hold `autoAdvanceWave`, `markWavePlanComplete` and
 * `advanceToNextWave`: a complete, exported implementation of "a wave finished,
 * start the next one" that nothing called. The live implementations were
 * `WaveExecutionController.handleWaveComplete` and the conductor graph, which
 * between them were already one driver too many; a third, waiting to be wired
 * up by whoever found it first, was removed rather than left as a trap.
 *
 * `collectFinalMetrics` is the part that was worth keeping, and it had no
 * caller either. `WaveExecutionController.completePlan` calls it now — the one
 * place a plan becomes `completed`, on both the conductor and the legacy path.
 */
/**
 * Collect final metrics for the completed wave plan.
 * Calculates performance statistics and stores them in wave_plan_metrics.
 *
 * One row per plan. A second call for the same plan changes nothing.
 */
declare function collectFinalMetrics(wavePlanId: string): Promise<void>;

/**
 * A run's name: `<ticket>-<last six of the wave plan id>`, or `run-<…>` for an
 * item with no ticket.
 *
 * Readable, because it ends up in branch names a person will type
 * (`devpilot/AVA-12-k3x9qd/run`), and unique, because two plans for one ticket
 * — a re-plan — must not share a run branch. The ticket is reduced to
 * characters git allows in a ref here as well as on the runner: the runner
 * would do it anyway, and the name stored on the plan should be the name in
 * the branch.
 */
declare function runIdFor(linearTicketId: string | null | undefined, wavePlanId: string): string;
/**
 * WaveDispatchCoordinator
 *
 * Handles dispatching of wave tasks with:
 * - A per-task claim, so a task is sent to exactly one agent however many
 *   callers ask (see `claimTask`)
 * - Concurrency caps enforced inside that claim
 * - Staggering between dispatches
 * - Predecessor context gathering
 * - Real dispatch to the OrchestratorService (session-native / ao-cli / http)
 */
declare class WaveDispatchCoordinator {
    private config;
    private db;
    constructor(config: WaveExecutionConfig);
    /**
     * Dispatch what can be dispatched of a wave.
     *
     * Safe to call any number of times, from any number of callers, at once. It
     * has to be: a wave larger than the cap is drained by calling this again each
     * time a slot frees, completions arrive in bursts, and a retry is just
     * another pass over the same wave. The `tasks` argument is a snapshot and is
     * treated as one — it nominates candidates, and `claimTask` decides.
     *
     * Tasks that cannot reach an orchestrator (unconfigured/disabled) or that the
     * runner turns away for capacity are left dispatchable and counted as queued
     * — never burned as failures (§9.1).
     */
    dispatchWave(wavePlanId: string, _waveIndex: number, tasks: WaveTask[]): Promise<DispatchResult>;
    /**
     * Take a task for dispatch, or learn that it is not ours to take.
     *
     * This is what makes dispatch idempotent, and it is one statement on
     * purpose. Two components used to be able to dispatch a wave about two
     * seconds apart — the conductor graph, and the execution bridge's
     * auto-advance — each iterating a snapshot it had read earlier and neither
     * looking again, so a task still `pending` in both snapshots was sent to two
     * agents. Checking the status and then writing it is the same bug with a
     * smaller window. A conditional UPDATE has no window: the task moves
     * `pending|retrying → dispatched` only if it is still dispatchable, and only
     * the caller whose UPDATE changed the row sends the prompt.
     *
     * The same statement carries the three things that must be true at that
     * instant and not a moment before:
     *
     *  - the plan is `executing` — so a paused plan dispatches nothing, and a
     *    plan that has just been failed dispatches nothing more;
     *  - fewer than `maxTotalActiveTasks` tasks are in flight across live plans;
     *  - fewer than `maxConcurrentSubagents` of this plan's are.
     *
     * It also clears `assignedSessionId`. On a retry that column still names the
     * previous attempt's session, which is terminal; left in place, a reconciler
     * pass landing between this claim and the new session being linked would
     * read "in flight, session ended in ERROR" and fail the attempt that has not
     * started yet.
     *
     * And it clears where the previous attempt's work was — branch, base, commit,
     * files, merged. They describe an attempt this claim supersedes: the runner
     * renames that attempt's branch the moment the new one starts, so the name
     * recorded here would point at the new attempt's (empty) branch, and a
     * `mergedAt` carried over would tell the wave gate the retry was already in.
     *
     * Returns the claimed row, or null.
     */
    private claimTask;
    /**
     * Hand a claimed task back because nothing was dispatched for it.
     *
     * It returns to the status it was claimed from, with the timestamps it had:
     * an attempt that never reached an agent did not start, and must not be
     * recorded as the task's first. For the same reason it gets back what the
     * claim cleared about the previous attempt's work — that attempt is still the
     * latest one there has been, and its branch has not been renamed.
     */
    private releaseClaim;
    /**
     * Build a dispatch request for a task
     * Includes task details, file scope, model, predecessor context, and constraints
     */
    buildDispatchRequest(task: WaveTask, predecessorContext: PredecessorSummary[]): WaveDispatchRequest;
    /**
     * Get predecessor context for a task
     * Fetches completion summaries for task's completed dependencies.
     *
     * The files reported for a predecessor are, in order of how much is known:
     *
     *  - `'changed'` — what git says its branch changed. Only for a task that
     *    ran isolated: its completion report's file list is then the diff from
     *    the commit the branch was cut from to its head, and exact. An empty
     *    list here means the task changed nothing, and is reported as that.
     *  - `'touched'` — the files its session wrote to, as the runner observed.
     *  - `'scoped'` — only the files the plan gave it.
     *
     * `filesSource` says which, so the prompt can label them honestly. This used
     * to pass the planned paths as "files modified".
     *
     * A task that was NOT isolated has a recorded file list too, and it is
     * deliberately not used as `'changed'`: there the runner compares two
     * `git status` readings of a checkout that every other agent in the wave is
     * writing to, so the list can hold a sibling's files. What the session's own
     * tool calls wrote is the better account of that task, and comes first as it
     * did before.
     *
     * `merged` is whether the predecessor's branch is in the run branch — and so
     * in the checkout the successor is about to be given.
     */
    getPredecessorContext(wavePlanId: string, taskCode: string): Promise<PredecessorSummary[]>;
    /**
     * The files a task's session wrote to, as the session runner observed them
     * (`ruflo_sessions.telemetry.filesTouched`, repo-relative).
     *
     * Null when that is not known: the task has no session, the runner predates
     * telemetry, or it reported none. An empty list is treated as "not known"
     * rather than "touched nothing" — telemetry arrives on status callbacks, so
     * a session can finish before its last edits are reflected in it.
     */
    private getTouchedFiles;
    /**
     * Load repo / item title / description / linear ticket for a wave plan
     * (wavePlans → horizonItems), and the run the plan's tasks belong to. Cached
     * per dispatchWave call by the caller.
     */
    private loadDispatchContext;
    /**
     * The run this plan's tasks belong to, and whether they are isolated —
     * decided the first time anything is dispatched for the plan, and read from
     * the plan row every time after.
     *
     * This is the only place the decision is made, and every dispatch for a plan
     * passes through it (a wave's first pass, a backfill, a retry, the legacy
     * route and the conductor graph alike), so there is no path that sends a
     * task without the plan having been asked.
     *
     * **Decided once.** The run id and the answer are written together in one
     * statement that only succeeds while the plan is still undecided, and then
     * read back — so two dispatchers arriving together for a plan's first wave
     * both use the first one's decision. It is not revisited when the runner
     * later changes: a plan that started isolated and then met a runner that
     * cannot isolate fails its next task with that reason (the transport
     * refuses to send it), and a plan that started un-isolated stays that way
     * even after the runner is upgraded. Half a plan on branches and half in the
     * shared checkout is worse than either.
     *
     * **Never silently.** When the answer is no, the reason is on the plan row
     * (`isolation_note`) and the conductor route reports it. The plan then runs
     * exactly as plans did before isolation existed.
     *
     * **Not for a plan that has already started.** A plan can reach this
     * undecided with tasks already run: it was mid-run when the cockpit was
     * upgraded to a version that asks. Its earlier waves ran in the shared
     * checkout and left their work there, uncommitted. Isolating the rest would
     * cut each remaining task a worktree from the last COMMIT — without any of
     * that work — which is the half-isolated plan the rule above exists to
     * prevent. So such a plan is decided un-isolated without the runner being
     * asked, and finishes the way it began.
     */
    private ensureRun;
    /**
     * Dispatch a single, already-claimed task to the orchestrator service.
     *
     * Creates a rufloSessions row, links the task to it, builds the session
     * prompt + DispatchRequest and dispatches through the active adapter. Throws
     * 'ORCHESTRATOR_UNAVAILABLE' when no orchestrator is configured (caller
     * queues rather than fails the task). Whatever it throws, it leaves no
     * session row and no link behind.
     */
    private dispatchToOrchestrator;
    /**
     * The test files reached from a task's files, or null when there is nothing
     * to tell the worker: the task names no files, there is no code graph to
     * ask, or it found none.
     *
     * Asked of the runner, like the plan's dependents, because the index lives
     * in the checkout and only the runner knows where that is. The request
     * names the repository and nothing about the task's run, so the answer
     * cannot come from an isolated task's own worktree: it describes the
     * repository as it was last indexed, not the run branch the task's checkout
     * is cut from. That is one more reason the prompt presents the list as
     * information.
     *
     * Never throws and never fails a dispatch. "Unavailable" is not logged or
     * recorded per task: it is the normal state of a repository with no index,
     * and the plan already says whether a graph was there when it was made.
     */
    private reachedTests;
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
 * What a wave dispatch reports to the component driving the plan: the usual
 * counts, plus — when the wave is already over as dispatch returns — how it
 * ended. See `WaveExecutionController.driveWave`.
 */
interface DrivenWave extends DispatchResult {
    settled?: SettledWave;
}
/** Which attempt a failure report is about. Pins the write to that attempt. */
interface TaskAttemptRef {
    /** `wave_tasks.assignedSessionId` of the attempt that is reporting. */
    sessionId?: string;
    /**
     * When the attempt actually ended, if that is not "now".
     *
     * A failure applied by the reconciler is being RECORDED now, but it happened
     * when the session row says it did — possibly weeks ago, on a database that
     * was left with tasks in flight. Stamping it with the time of recording gave
     * such a task a duration of however long the cockpit had been switched off.
     */
    endedAt?: Date;
}
/**
 * What recording a failure did: the task is owed a retry, the task is
 * terminally failed, or the report changed nothing (a duplicate, or about an
 * attempt that is no longer the current one).
 */
type TaskFailureOutcome = 'retrying' | 'failed' | 'ignored';
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
 *
 * WHO ADVANCES A PLAN. This class contains two kinds of method, and it matters
 * which is which:
 *
 *  - Effects, safe for anyone to call: `dispatchWave`, `driveWave`,
 *    `onTaskFailed`, `cancelTask`, `recordWaveIfOver`, `signalForDriver`,
 *    `completePlan`, `failPlan`. They record what happened and dispatch what
 *    they are asked to. None of them decides that a wave is over and the next
 *    one should start. (`signalForDriver` is how a driver finds out that one
 *    is; for an isolated plan it merges the wave before it says so.)
 *  - One decision: `handleWaveComplete`, which does decide that — it starts the
 *    next wave when `autoAdvance` is set and completes the plan after the last.
 *    It is the LEGACY driver, for a plan dispatched through
 *    `/api/wave-plans/:id/dispatch` with nothing else sequencing it. Its only
 *    callers are the `ExecutionBridge`, for a plan no `WaveDriver` owns, and
 *    `onTaskComplete` below, which itself has no caller.
 *
 * A plan the conductor graph is running is advanced by the graph, through
 * `driveWave` / `completePlan` / `failPlan`, and `handleWaveComplete` is never
 * called for it. Two components advancing one plan is how a task came to be
 * dispatched twice; see `WaveDriver` in `execution-bridge.ts`.
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
     * Pause an executing plan that was found idle when the cockpit started, and
     * say why on the plan. Returns whether this call paused it.
     *
     * The plan is otherwise left exactly as it was — tasks, waves, wave pointer
     * and `updatedAt` included, so the time it has been idle stays readable from
     * the row. Paused is enough to stop anything being dispatched: the dispatch
     * claim requires an `executing` plan. It is the ordinary pause, undone the
     * ordinary way (`resume`), which also clears the reason.
     *
     * Called by the execution bridge's start-up pass and by nothing else; see
     * `ExecutionBridge.holdStalePlans` for why it exists.
     */
    holdStalePlan(wavePlanId: string, lastActivity: Date): Promise<boolean>;
    /**
     * Dispatch a wave
     * Gets wave tasks and uses dispatch coordinator to dispatch what it can.
     * Updates wave status: pending → dispatching → active
     *
     * Safe to call repeatedly and concurrently for the same wave: it is also the
     * backfill pass (run again each time a slot frees) and the retry pass, and
     * the coordinator's per-task claim is what keeps a task from being sent
     * twice. Every write here is therefore conditional on being the FIRST — a
     * second call must not move the wave's status or its start time.
     */
    dispatchWave(wavePlanId: string, waveIndex: number): Promise<DispatchResult>;
    /**
     * Dispatch a wave on behalf of whoever is driving the plan, and say whether
     * there is anything to wait for.
     *
     * This is `dispatchWave` plus the two things a driver needs and the legacy
     * path does for itself: the plan's wave pointer is moved to this wave (the
     * cockpit and the hosted plane read the row, not a graph checkpoint), and the
     * result carries `settled` when the wave is ALREADY over.
     *
     * `settled` exists because "dispatch, then wait to be told the wave ended"
     * has a hole: if nothing was dispatched there is nothing that will ever
     * report, and the driver waits forever. That is exactly what happened when a
     * task failed its retry — the graph re-dispatched the wave, found no task
     * left to dispatch, and suspended on a wave whose every task was already
     * terminal. It is equally what would happen to a wave whose every task is
     * refused at dispatch, or to an empty one.
     */
    driveWave(wavePlanId: string, waveIndex: number): Promise<DrivenWave>;
    /**
     * What a wave's driver is told about it: the reading `waveSignalFor` gives,
     * with the wave's merge done first when one is due.
     *
     * THIS IS THE ONLY WAY A DRIVER LEARNS THAT A WAVE IS OVER, and that is why
     * the merge lives here. Every component that advances a plan asks this —
     * `driveWave` for the conductor graph's dispatch, the Next app's
     * `resumeConductorForTask` before it resumes the graph, and the execution
     * bridge for a plan nothing else drives — and none of them reads the rows
     * for itself. So the merge has one caller, it happens before anyone is told
     * "complete", and the next wave cannot be dispatched until it has returned:
     * whoever would dispatch it is waiting on this call.
     *
     * It could not go in the graph's nodes, because the graph is not the only
     * driver (the legacy path advances plans too) and core cannot import it. It
     * could not go in the execution bridge's settling of a task, because a wave
     * can be found already over by a dispatch that no task report preceded.
     *
     * What it does with a wave that is due a merge (`merge` from the reading):
     *
     *  - asks the runner to merge the wave's completed tasks, in task-code order;
     *  - records which were merged, and the run branch and its head on the plan;
     *  - fails a task whose branch conflicted, with the files — by the same
     *    retry-once rule as any failed task. Its retry is cut from the merged
     *    head, the wave comes back here when it completes, and the wave is
     *    merged again. A task that conflicts on its retry fails the plan;
     *  - fails the plan when the merge itself could not be done, with the
     *    runner's message. That is not a task's fault and no task is retried.
     *
     * and then reads the wave again, which is the answer.
     *
     * A wave whose tasks all failed or were skipped has nothing to merge. The
     * reading never says `merge` for it, the runner is not asked, and it is over
     * (failed) exactly as it was before isolation existed.
     *
     * When the run has ended in failure, what did complete in this wave is
     * merged too, so the run branch holds it — see `mergeDue`.
     *
     * Safe to call twice, and across a restart: the runner's merge is
     * idempotent, a wave is only due one while it has a completed task not yet
     * recorded as merged, and every write below is conditional on the attempt
     * it read.
     */
    signalForDriver(wavePlanId: string, waveIndex: number): Promise<WaveSignal>;
    /** `signalForDriver`, also saying whether a wave-ending merge was carried out. */
    private settleSignal;
    /**
     * Whether this wave should be merged now, with which tasks, and what a
     * conflict means.
     *
     *  - The reading says `merge`: the wave has ended and its completed tasks
     *    are not all in the run branch. A conflict fails the task.
     *  - The plan has FAILED and this wave has completed work that is not
     *    merged: merge it, so the run branch holds everything that succeeded.
     *    Here a conflict is left alone — the run is over, there is no retry to
     *    give, and the task stays `completed` on its own branch, unmerged, which
     *    the conductor route reports as exactly that. A failure of the merge
     *    itself is left alone too; the plan keeps the reason it already has.
     *
     * The second case merges only what had completed when the driver was told
     * the run failed. A sibling still running at that moment finishes later, on
     * its own branch, and is NOT merged for a plan the conductor graph runs:
     * the graph has stopped waiting on the wave, so nothing asks again. Doing
     * that would mean a second way into the merge, and it was not worth one.
     */
    private mergeDue;
    /**
     * Ask the runner to merge these tasks into the run branch, and write down
     * what it answered. Returns false when there was nobody to ask.
     *
     * ONE CALLER: `settleSignal`. Do not add another — see `signalForDriver`.
     */
    private integrateWave;
    /** A completed attempt that has not been merged — the one that was read. */
    private unmergedAttempt;
    /**
     * A task that completed, and whose work could not be merged: fail it, by the
     * same rule as a task whose agent failed.
     *
     * The wave was recorded as ended when its last task settled. It has not
     * ended — a task is about to run again, or has just failed for good — so it
     * is reopened first, and whichever of those happens is then recorded on it
     * the ordinary way.
     */
    private failUnmerged;
    /**
     * Handle task completion
     *
     * Legacy, and it has no caller: completions are recorded by
     * `CompletionListener.handleTaskComplete` (conditionally, with the summary)
     * and settled by the `ExecutionBridge`. Kept only because
     * docs/CONDUCTOR-AGENT.md schedules its removal with `approve` once the old
     * routes are gone; do not add a caller.
     */
    onTaskComplete(wavePlanId: string, taskCode: string): Promise<void>;
    /**
     * If every task in the wave is terminal, record that on the wave row — its
     * final status and the moment it ended — and return true.
     *
     * `completedAt` is the instant the LAST task settled, written once. It used
     * to be written when a task failed its retry, with siblings still running,
     * and then again (with status `completed`) when they finished; a failed wave
     * therefore read as completed and its end time moved.
     *
     * Records only. It does not start the next wave or complete the plan.
     */
    recordWaveIfOver(wavePlanId: string, waveIndex: number): Promise<boolean>;
    /**
     * LEGACY DRIVER. A wave of a plan that nothing else is sequencing has ended:
     * finish the plan (last wave) or, when `autoAdvance` is set, start the next
     * wave. Invoked by the ExecutionBridge (§6.5) for plans no `WaveDriver` owns.
     *
     * Never call this for a plan the conductor graph is running. The graph makes
     * this same decision itself, and the two used to both make it: the graph
     * resumed and dispatched wave N+1, and about two seconds later this method
     * dispatched it again.
     *
     * Idempotent. It does nothing unless the wave really is over and the plan is
     * still executing, and only the call that moves the plan's wave pointer goes
     * on to dispatch.
     */
    handleWaveComplete(wavePlanId: string, waveIndex: number): Promise<void>;
    /**
     * Mark a plan `completed` and record its final metrics.
     *
     * Only from `executing` or `paused` — never from `failed`. Returns whether
     * this call was the one that completed it, so the metrics are collected once.
     *
     * Called by the legacy driver after the last wave, and by the conductor
     * graph's `endRun` port when the graph reaches `finish`.
     */
    completePlan(wavePlanId: string): Promise<boolean>;
    /**
     * Fail a plan, loudly, and stop anything further being dispatched for it.
     *
     *  - The plan goes to `failed` with `reason` recorded. The FIRST reason
     *    stands: the write is conditional on the plan not already being terminal,
     *    and returns false (changing nothing) when it is.
     *  - Tasks never dispatched (`pending`) become `skipped`.
     *  - Tasks that failed once and were waiting for their retry (`retrying`)
     *    become `failed`, keeping the error they already carry. They are not
     *    "skipped" — they ran and failed — and left as `retrying` they would be
     *    non-terminal forever with nothing allowed to dispatch them.
     *  - Tasks already in flight are LEFT ALONE. Their agents are mid-edit;
     *    killing them leaves a worse working tree than letting them land, and
     *    their completions are still recorded when they arrive. Nothing new is
     *    dispatched meanwhile: the dispatch claim requires an `executing` plan.
     *  - The failing wave is marked `failed`; waves never started, `skipped`.
     *
     * `cause` names the task that ended the plan, when a task did.
     */
    failPlan(wavePlanId: string, reason: string, cause?: {
        waveIndex: number;
        taskCode: string;
    }): Promise<boolean>;
    /**
     * Record that a task's current attempt failed.
     *
     * Within the retry limit the task becomes `retrying` and is owed another
     * attempt; beyond it the task is terminally failed and the failure policy
     * applies. Returns which, or `'ignored'` when the report changed nothing.
     *
     * It does NOT re-dispatch. It used to — calling the coordinator directly the
     * moment the task was marked — which made this a third place a dispatch
     * could originate. A `retrying` task is dispatchable, so the next dispatch
     * pass over its wave picks it up: the conductor graph's, when the graph owns
     * the plan, or the bridge's backfill when nothing does. A paused plan
     * dispatches nothing, so the retry waits for resume, as before.
     *
     * Only an attempt that is in flight can fail. A report about a task that is
     * already terminal, or already waiting for its retry, or (when `attempt`
     * names a session) about an attempt that has since been superseded, is
     * ignored — which is what makes a callback and the reconciler reporting the
     * same failure spend one retry rather than two.
     */
    onTaskFailed(wavePlanId: string, taskCode: string, error: string, attempt?: TaskAttemptRef): Promise<TaskFailureOutcome>;
    /** The attempt a failure report may change: in flight, and the one named. */
    private inFlightAttempt;
    /**
     * The retry-once rule, for whichever attempt `only` selects.
     *
     * There are two kinds of failure and one rule. An agent that fails is an
     * attempt in flight (`onTaskFailed`); a branch that will not merge is an
     * attempt that completed (`failUnmerged`). Both spend the task's one retry,
     * and both fail the plan when there is none left — a task that conflicts on
     * its retry ends the run exactly as a task that fails twice does.
     */
    private recordFailure;
    /**
     * Terminally fail a task with no retry — used by the ExecutionBridge for
     * cancellations (job:cancelled is terminal). Applies the failure policy.
     */
    cancelTask(wavePlanId: string, taskCode: string, reason: string, attempt?: TaskAttemptRef): Promise<TaskFailureOutcome>;
    /**
     * Terminally fail the attempt `only` selects and apply the failure policy.
     */
    private failTask;
    /**
     * Apply the failure policy for a task that is terminally failed: 'halt'
     * fails the plan (see `failPlan`); 'continue' leaves other tasks running.
     *
     * The plan's recorded reason names the task and its error, because "failed"
     * with nothing attached sends whoever reads it to a log.
     */
    private applyFailurePolicy;
    /**
     * Emit a wave execution event to the activity_events table.
     *
     * The failure path used to emit nothing at all — a task could be retried and
     * a plan failed without a single row saying so.
     */
    private emitEvent;
    /**
     * Delay helper for wave advancement
     */
    private delay;
}

/**
 * ExecutionBridge (spec/trd/01-TIER1-EXECUTION-LOOP.md §6.5).
 *
 * Subscribes to the OrchestratorService event stream and routes job:* events to
 * the wave execution machinery, correlating each event's DevPilot sessionId to
 * its owning wave task via waveTasks.assignedSessionId. The correlation lives
 * in the DB rather than the service's in-memory mappings, which is what lets a
 * finished session settle its wave task after a process restart — and, for the
 * reports that never arrive at all, what lets `reconcile` settle it from the
 * session row instead.
 *
 * It records what happened to a task. What happens NEXT — backfilling the wave,
 * ending it, starting another — belongs to whoever drives the plan; see
 * `WaveDriver`.
 */

/**
 * The one component that decides a wave is over and starts the next.
 *
 * THERE MUST BE EXACTLY ONE PER PLAN. There were two: the conductor graph
 * resumed on a wave's last completion and dispatched the next wave, and this
 * bridge, hearing the same completion, called
 * `WaveExecutionController.handleWaveComplete`, which waited two seconds and
 * dispatched it again. Neither looked at what the other had done, so a task
 * could be sent to two agents. (A third implementation, `autoAdvanceWave`, sat
 * unused in `auto-advance.ts` and has been deleted.)
 *
 * So ownership is asked, per plan, every time a task changes:
 *
 *  - A plan a driver `owns` is advanced by that driver and by nothing else.
 *    The bridge records the task's new state, emits the event, and calls
 *    `notify`. It does not dispatch — not the next wave, and not the rest of
 *    this one: backfilling a wave when a slot frees and re-dispatching a task
 *    that is owed a retry are dispatches too, and they are the driver's.
 *  - A plan no driver owns is the legacy path — dispatched by hand through
 *    `/api/wave-plans/:id/dispatch`, with nothing sequencing it. For those the
 *    bridge itself backfills and calls `handleWaveComplete`, which advances
 *    when `WaveExecutionConfig.autoAdvance` is set. That path behaves as it
 *    always has; `autoAdvance` now governs it alone.
 *
 * In the Next app the driver is the conductor graph (`src/lib/orchestrator.ts`
 * supplies it). It is an interface rather than an import because the graph
 * carries the langchain dependency, which core deliberately does not.
 */
interface WaveDriver {
    /**
     * Whether this driver runs the plan. Asked on every task change, so it must
     * be answerable from durable state — a plan does not stop being the graph's
     * because the process restarted.
     *
     * If it throws, the bridge does nothing further for that change (and records
     * the error): falling back to the legacy path on a failed lookup would be
     * exactly the second driver this exists to prevent.
     */
    owns(wavePlanId: string): Promise<boolean>;
    /**
     * Something changed in this wave of a plan the driver owns — a task
     * completed, failed, was reconciled, or the reconciler is simply checking
     * in. The driver looks at the wave and acts. Called repeatedly and
     * redundantly; it must be idempotent.
     */
    notify(wavePlanId: string, waveIndex: number): Promise<WaveDriverAnswer>;
}
/** What the driver did with a notification. Diagnostic, not control flow. */
interface WaveDriverAnswer {
    resumed: boolean;
    reason?: string;
}
/**
 * Default stall window: how long a session may go without reporting before its
 * task is treated as lost.
 *
 * Generous on purpose. Declaring a task lost does not stop its agent — nothing
 * here can — it spends the task's retry and starts a SECOND agent on the same
 * files. If the first one was merely quiet, the two now overwrite each other.
 * So the window must be long enough that silence means the runner is gone, not
 * that the agent is thinking:
 *
 *  - the session runner heartbeats every 90s regardless of what the agent is
 *    doing (TRD-01 §7.2 requires two-minute liveness), so thirty minutes is
 *    twenty consecutive missed heartbeats;
 *  - it also matches the runner's own default wall-clock cap (`--timeout 30`),
 *    past which a healthy runner reports the session as failed itself. An
 *    operator who raises that cap should raise this with it.
 */
declare const DEFAULT_RECONCILE_STALL_MS: number;
/** Default interval between reconciler passes. */
declare const DEFAULT_RECONCILE_INTERVAL_MS = 60000;
/**
 * Default age past which a plan found `executing` at start-up is held rather
 * than resumed. See `ExecutionBridge.holdStalePlans`.
 *
 * Six hours: longer than a cockpit is down for a restart, an upgrade, or a
 * laptop lid shut over lunch, with a working day's margin — and far shorter
 * than the weeks an abandoned run sits in a database.
 */
declare const DEFAULT_RESUME_MAX_AGE_MS: number;
interface ReconcileOptions {
    /** How often to reconcile after the pass at start. Default 60s. */
    intervalMs?: number;
    /** See `DEFAULT_RECONCILE_STALL_MS`. */
    stallMs?: number;
    /**
     * See `DEFAULT_RESUME_MAX_AGE_MS`. `0` turns the guard off: every plan left
     * `executing` is resumed at start-up however long it has been idle.
     */
    resumeMaxAgeMs?: number;
}
interface ExecutionBridgeOptions {
    execution: WaveExecutionConfig;
    /**
     * The component that advances plans it owns. Omit it and every plan is on
     * the legacy path, advanced by this bridge. See `WaveDriver`.
     */
    driver?: WaveDriver;
    /**
     * Reconcile wave tasks against their session rows when the bridge starts and
     * then on a timer (see `reconcile`). Off unless asked for: a host that wants
     * it says so, and a test that constructs a bridge does not get a timer.
     */
    reconcile?: ReconcileOptions | false;
}
/** What one orchestrator event did to the wave task it was about. */
interface TaskSettlement {
    /** The wave task the session belongs to; null for a plain fleet session. */
    task: {
        wavePlanId: string;
        waveIndex: number;
        taskCode: string;
    } | null;
    /**
     * The state recorded. `ignored` means the report changed nothing — a
     * duplicate, or about an attempt that is no longer current.
     */
    recorded: 'running' | 'completed' | TaskFailureOutcome | null;
    /** The driver's answer, when the plan has one and the task changed. */
    driver?: WaveDriverAnswer;
    /** Set when handling the event threw. The fault is also in the activity feed. */
    error?: string;
}
/** What one reconciler pass did. */
interface ReconcileReport {
    /** In-flight tasks of live plans looked at. */
    examined: number;
    /** Tasks whose session had completed without the task hearing of it. */
    completed: number;
    /** Tasks whose session had ended in error without the task hearing of it. */
    failed: number;
    /** Tasks whose session is missing or silent past the stall window. */
    lost: number;
    /** Waves handed to their driver (or the legacy path) to look at. */
    settled: number;
    /** Plans paused by the start-up pass because they had been idle too long. */
    held: number;
    errors: string[];
}
declare class ExecutionBridge {
    private orchestrator;
    private db;
    private coordinator;
    private controller;
    private listener;
    private driver?;
    private reconcileOptions;
    private unsubscribe;
    private reconcileTimer;
    private reconciling;
    private startedAt;
    /** The newest unfinished handler per session, for `settlementFor`/`drain`. */
    private readonly inFlight;
    constructor(orchestrator: OrchestratorService, options: ExecutionBridgeOptions);
    /**
     * Subscribe to orchestrator events and, when configured, reconcile once now
     * and then on a timer. Idempotent.
     */
    start(): void;
    /** Unsubscribe and stop reconciling. */
    stop(): void;
    /**
     * The outcome of the event currently being handled for a session, or of
     * nothing if none is.
     *
     * For the completion callback route: it forwards a report to the
     * orchestrator service, which emits the event this bridge handles — and it
     * wants to answer the runner only once the task is recorded and the driver
     * has been told, and to say what the driver did. The subscription above
     * registers the handler synchronously, inside the service's `emit`, so by
     * the time the route asks, the promise is here.
     */
    settlementFor(sessionId: string): Promise<TaskSettlement>;
    /** Resolves when no event is being handled and no reconcile pass is running. */
    drain(): Promise<void>;
    /** Resolve a DevPilot sessionId to its owning wave task, if any. */
    private resolveTask;
    /**
     * Apply one orchestrator event to the wave task it is about, then let the
     * wave's driver react. Never rejects.
     *
     * Events for one session can be handled out of order and more than once —
     * handlers run concurrently, callbacks are retried, and the reconciler may
     * apply the same outcome from the session row. Every write underneath is a
     * conditional UPDATE, so each outcome lands once whoever delivers it.
     */
    handleEvent(event: OrchestratorEvent): Promise<TaskSettlement>;
    /**
     * A task in this wave changed: record the wave's end if it has ended, then
     * hand the wave to whoever drives the plan.
     *
     * For an owned plan that is `driver.notify` and nothing else.
     *
     * For a legacy plan the bridge does the driving itself — and, like every
     * driver, it asks `signalForDriver` rather than reading the wave's rows: for
     * a plan whose tasks each have their own branch, the wave's work is merged
     * before this is told the wave is over. Both halves of the driving
     * matter. `handleWaveComplete` ends the wave. The backfill is what
     * drains a wave larger than the cap: without it the executor was a
     * **deadlock for any wave larger than `maxConcurrentSubagents`** —
     * `dispatchWave` dispatches up to the cap and leaves the remainder `pending`,
     * nothing ever dispatched them, and the wave could never complete, so the run
     * hung with the fleet idle. It stayed hidden because the only wave plan
     * executed end to end had fewer tasks per wave than the cap; the first live
     * plan generated afterwards had waves of 8, 9 and 9 against a cap of 4. A
     * task that FAILS frees its slot exactly as one that succeeds, and a
     * `retrying` task is itself dispatchable, which is why this runs after every
     * change and not only after completions.
     */
    private settle;
    /**
     * Bring wave tasks back into agreement with their session rows.
     *
     * A wave task learns that its session ended from one event, delivered once,
     * in memory. Anything that loses that delivery strands the task in
     * `dispatched`/`running` forever: a cockpit restart between the callback and
     * the write, a handler that threw, a runner that died and will never call
     * back. Observed in a real database as six tasks still `dispatched` whose
     * sessions were `COMPLETE` with cost recorded — and a stranded task is a wave
     * that never ends and a run that never reports.
     *
     * For every in-flight task of a plan that is not terminal:
     *
     *  (a) its session row is terminal → apply that completion or failure, by the
     *      same methods the callback would have used;
     *  (b) its session row is missing, or has reported nothing for longer than
     *      the stall window → fail the task as `lost: no report since <time>`,
     *      so the ordinary retry-once rule applies and a second loss fails the
     *      plan loudly.
     *
     * Then every wave that changed — and the current wave of every executing
     * plan, changed or not — is handed to its driver, which resumes the run if
     * the wave has ended and dispatches what is queued if a slot is free. The
     * unconditional check-in is deliberate: it is the only thing that will ever
     * move a wave whose dispatch queued every task (nothing in flight means
     * nothing will report), or whose settle was itself interrupted.
     *
     * Safe alongside live callbacks: every write is conditional, so a callback
     * and this pass applying the same outcome apply it once, and the driver's
     * `notify` is idempotent. Passes do not overlap. Never rejects.
     *
     * Tasks of terminal plans are left alone by design — a failed plan's
     * siblings are allowed to finish, and nothing waits on them.
     *
     * A task of a PAUSED plan is never declared lost. Its finished sessions are
     * still applied — that is writing down what happened — but silence is not
     * judged until the plan is resumed: losing a task spends its retry and can
     * fail the plan, and a plan somebody paused (or that was held at start-up,
     * below) is not to be changed underneath them. Nothing is lost by waiting;
     * a paused plan dispatches nothing, so the retry could not start anyway.
     *
     * `startup` marks the pass made when the bridge starts. That pass alone
     * first holds plans that have been idle too long to resume without a person
     * (`holdStalePlans`).
     */
    reconcile(now?: Date, options?: {
        startup?: boolean;
    }): Promise<ReconcileReport>;
    /**
     * Pause every plan left `executing` whose last activity is older than the
     * resume window, so that starting the cockpit starts no agents for it.
     * Returns the ids of the plans it paused.
     *
     * WHY. The start-up pass exists to pick up what a restart dropped: it
     * applies outcomes from session rows, hands every executing plan's wave to
     * its driver, and the driver dispatches what is owed — the next wave, a
     * retry, a queued task, a run that was cut off in the middle of dispatching.
     * That is right for a cockpit that was down for a minute. It is wrong for a
     * plan left `executing` weeks ago: a database that has been in use for a
     * while holds several, the first start after an upgrade would wake them all,
     * and each wakes real agents that spend the operator's tokens on work nobody
     * asked for today.
     *
     * THE ONE PLACE. Everything that can dispatch at start-up without a person
     * — the reconciler's resume and backfill, the legacy path's advance, and the
     * re-entry of a run interrupted mid-dispatch — is reached from this pass's
     * `settle`, which runs after this and never for a plan this held. And a held
     * plan is `paused`, which the dispatch claim refuses whoever asks. So the
     * rule is enforced here once, not at each thing that could start an agent.
     *
     * WHAT COUNTS AS ACTIVITY. The latest of: the plan row's `updatedAt` (moved
     * by every dispatch pass, pause, resume and merge); its tasks' `startedAt`,
     * `lastAttemptAt` and `completedAt`; and `updatedAt` on the sessions those
     * tasks are assigned to (a live runner moves that every ninety seconds). It
     * is read BEFORE this pass applies anything, because applying a session that
     * finished three weeks ago stamps its task as completed now, and the plan
     * would then look as though it had been busy a moment ago.
     *
     * WHAT IS LEFT ALONE. Everything but the plan's status and reason (see
     * `WaveExecutionController.holdStalePlan`). Sessions of a held plan that
     * have already finished are still applied to their tasks by the pass — that
     * is bookkeeping, and it starts nothing — but the plan's driver is not told,
     * so the run is not resumed, nothing is merged and the wave pointer does not
     * move. A person resumes it (`/api/wave-plans/:id/resume`, or the cockpit),
     * and it then behaves as any resumed plan does.
     *
     * Start-up only. A plan that goes quiet while the cockpit is running is the
     * reconciler's ordinary business (a silent session is lost after the stall
     * window), and pausing it would stop the retry that is the remedy.
     */
    private holdStalePlans;
    /** When a plan last did anything. See `holdStalePlans` for what that means. */
    private lastActivity;
    private reconcileOnce;
    /**
     * Reconcile one in-flight task. Returns what was applied, or null when the
     * task is fine (or someone else settled it first).
     */
    private reconcileTask;
    /**
     * Whether a quiet session row means a quiet session.
     *
     * Only where something is contractually refreshing it. The session runner
     * heartbeats, so a `claude-session` row that stops moving has lost its
     * runner. The poll-based modes (`http`, `ao-cli`) write the row only when
     * the job's status CHANGES, so an hour-long job leaves it untouched for an
     * hour while perfectly healthy — silence there is not evidence, and a task
     * must not be failed on it. `NEEDS_SPEC` is a session waiting on a person,
     * which is not lost however long the person takes.
     *
     * A row with no mode recorded never got as far as an accepted dispatch (the
     * mode is written on acceptance), so it is judged by the clock too.
     */
    private reportsLiveness;
    /** Write a bridge fault to the activity feed. Never throws. */
    private recordFault;
    /** Extract a human-readable error from a job:error payload. */
    private errorMessage;
}
/** Initialize (or replace) the process-wide ExecutionBridge singleton. */
declare function initExecutionBridge(orchestrator: OrchestratorService, options: ExecutionBridgeOptions): ExecutionBridge;
declare function getExecutionBridgeOrNull(): ExecutionBridge | null;

type index_AIClientConfig = AIClientConfig;
declare const index_ActiveTaskInfo: typeof ActiveTaskInfo;
declare const index_AssignedWave: typeof AssignedWave;
declare const index_BLAST_RADIUS_LISTED: typeof BLAST_RADIUS_LISTED;
declare const index_BlastRadiusLine: typeof BlastRadiusLine;
declare const index_CodeGraphReview: typeof CodeGraphReview;
declare const index_CodebaseContextBlock: typeof CodebaseContextBlock;
type index_CodebaseContextService = CodebaseContextService;
declare const index_CodebaseContextService: typeof CodebaseContextService;
declare const index_CompletedWorkBlock: typeof CompletedWorkBlock;
type index_CompletionListener = CompletionListener;
declare const index_CompletionListener: typeof CompletionListener;
type index_ConcurrencyManager = ConcurrencyManager;
declare const index_ConcurrencyManager: typeof ConcurrencyManager;
declare const index_ConfidenceSignalUpdate: typeof ConfidenceSignalUpdate;
declare const index_ConstraintBlock: typeof ConstraintBlock;
type index_CorpusSummary = CorpusSummary;
declare const index_CriticalPathAnnotation: typeof CriticalPathAnnotation;
declare const index_CriticalPathResult: typeof CriticalPathResult;
declare const index_DAGNode: typeof DAGNode;
type index_DAGValidatorConfig = DAGValidatorConfig;
declare const index_DEFAULT_HISTORY_LIMIT: typeof DEFAULT_HISTORY_LIMIT;
declare const index_DEFAULT_MIN_PARALLELIZATION_SCORE: typeof DEFAULT_MIN_PARALLELIZATION_SCORE;
declare const index_DEFAULT_PLANNER_MAX_TOKENS: typeof DEFAULT_PLANNER_MAX_TOKENS;
declare const index_DEFAULT_PLANNER_MODEL: typeof DEFAULT_PLANNER_MODEL;
declare const index_DEFAULT_RECONCILE_INTERVAL_MS: typeof DEFAULT_RECONCILE_INTERVAL_MS;
declare const index_DEFAULT_RECONCILE_STALL_MS: typeof DEFAULT_RECONCILE_STALL_MS;
declare const index_DEFAULT_RESUME_MAX_AGE_MS: typeof DEFAULT_RESUME_MAX_AGE_MS;
declare const index_DEFAULT_WIKI_MODEL: typeof DEFAULT_WIKI_MODEL;
declare const index_DISPATCHABLE_WAVE_TASK_STATUSES: typeof DISPATCHABLE_WAVE_TASK_STATUSES;
declare const index_DependentClaim: typeof DependentClaim;
type index_DispatchError = DispatchError;
type index_DispatchLimits = DispatchLimits;
type index_DispatchResult = DispatchResult;
type index_DrivenWave = DrivenWave;
type index_EpisodeCall = EpisodeCall;
type index_EpisodePlan = EpisodePlan;
type index_EpisodeReview = EpisodeReview;
type index_EpisodeTask = EpisodeTask;
type index_ExecutionBridge = ExecutionBridge;
declare const index_ExecutionBridge: typeof ExecutionBridge;
type index_ExecutionBridgeOptions = ExecutionBridgeOptions;
type index_FleetCapacity = FleetCapacity;
declare const index_FleetContextBlock: typeof FleetContextBlock;
type index_FleetContextService = FleetContextService;
declare const index_FleetContextService: typeof FleetContextService;
declare const index_GenerationResult: typeof GenerationResult;
declare const index_GraphDependentsSource: typeof GraphDependentsSource;
declare const index_IN_FLIGHT_WAVE_TASK_STATUSES: typeof IN_FLIGHT_WAVE_TASK_STATUSES;
declare const index_MAX_DEPENDENT_CLAIMS_PER_TASK: typeof MAX_DEPENDENT_CLAIMS_PER_TASK;
declare const index_MAX_HISTORY_LIMIT: typeof MAX_HISTORY_LIMIT;
declare const index_MAX_ITEM_DESCRIPTION_CHARS: typeof MAX_ITEM_DESCRIPTION_CHARS;
declare const index_MIN_TASKS_FOR_PARALLELIZATION_GATE: typeof MIN_TASKS_FOR_PARALLELIZATION_GATE;
declare const index_MemoryContextBlock: typeof MemoryContextBlock;
declare const index_OptimizationResult: typeof OptimizationResult;
declare const index_PLANNER_EPISODE_SCHEMA: typeof PLANNER_EPISODE_SCHEMA;
declare const index_PLANNER_FIGURES_VERSION: typeof PLANNER_FIGURES_VERSION;
declare const index_ParsedEdge: typeof ParsedEdge;
declare const index_ParsedStatistics: typeof ParsedStatistics;
declare const index_ParsedTask: typeof ParsedTask;
declare const index_ParsedWave: typeof ParsedWave;
declare const index_ParsedWavePlan: typeof ParsedWavePlan;
declare const index_PlanCodeGraph: typeof PlanCodeGraph;
type index_PlanOutcome = PlanOutcome;
type index_PlanRefinementConfig = PlanRefinementConfig;
type index_PlanRefinementService = PlanRefinementService;
declare const index_PlanRefinementService: typeof PlanRefinementService;
type index_PlanReviewRecord = PlanReviewRecord;
declare const index_PlanScore: typeof PlanScore;
type index_PlannerEpisode = PlannerEpisode;
type index_PlannerFigures = PlannerFigures;
type index_PlannerTraceKind = PlannerTraceKind;
type index_PlannerTraceOutcome = PlannerTraceOutcome;
type index_PlannerTraceRecord = PlannerTraceRecord;
type index_PlannerTruncatedError = PlannerTruncatedError;
declare const index_PlannerTruncatedError: typeof PlannerTruncatedError;
declare const index_PredecessorSummary: typeof PredecessorSummary;
type index_ProjectedPlanIds = ProjectedPlanIds;
type index_PromptConstructor = PromptConstructor;
declare const index_PromptConstructor: typeof PromptConstructor;
type index_PromptConstructorConfig = PromptConstructorConfig;
declare const index_PromptContext: typeof PromptContext;
type index_PromptTemplate = PromptTemplate;
type index_ReconcileOptions = ReconcileOptions;
type index_ReconcileReport = ReconcileReport;
type index_RefinementPromptTemplate = RefinementPromptTemplate;
type index_RefinementResult = RefinementResult;
declare const index_RemainingWorkBlock: typeof RemainingWorkBlock;
declare const index_SUMMARY_MAX_CHARS: typeof SUMMARY_MAX_CHARS;
declare const index_SelectedDependentClaims: typeof SelectedDependentClaims;
declare const index_SequencedLine: typeof SequencedLine;
type index_SettledWave = SettledWave;
declare const index_TERMINAL_WAVE_PLAN_STATUSES: typeof TERMINAL_WAVE_PLAN_STATUSES;
declare const index_TERMINAL_WAVE_TASK_STATUSES: typeof TERMINAL_WAVE_TASK_STATUSES;
type index_TaskAttemptRef = TaskAttemptRef;
declare const index_TaskBlastRadius: typeof TaskBlastRadius;
type index_TaskDispatchOutcome = TaskDispatchOutcome;
type index_TaskFailureOutcome = TaskFailureOutcome;
type index_TaskSettlement = TaskSettlement;
type index_TaskWork = TaskWork;
declare const index_TopologicalSortResult: typeof TopologicalSortResult;
declare const index_ValidationError: typeof ValidationError;
declare const index_ValidationErrorCode: typeof ValidationErrorCode;
declare const index_ValidationResult: typeof ValidationResult;
declare const index_ValidationWarning: typeof ValidationWarning;
declare const index_ValidationWarningCode: typeof ValidationWarningCode;
declare const index_WaveAdjustment: typeof WaveAdjustment;
declare const index_WaveAssignerConfig: typeof WaveAssignerConfig;
declare const index_WaveAssignmentResult: typeof WaveAssignmentResult;
type index_WaveDispatchContext = WaveDispatchContext;
type index_WaveDispatchCoordinator = WaveDispatchCoordinator;
declare const index_WaveDispatchCoordinator: typeof WaveDispatchCoordinator;
declare const index_WaveDispatchRequest: typeof WaveDispatchRequest;
type index_WaveDriver = WaveDriver;
type index_WaveDriverAnswer = WaveDriverAnswer;
type index_WaveExecutionConfig = WaveExecutionConfig;
type index_WaveExecutionController = WaveExecutionController;
declare const index_WaveExecutionController: typeof WaveExecutionController;
declare const index_WavePlanExecutionState: typeof WavePlanExecutionState;
type index_WavePlanGenerationResult = WavePlanGenerationResult;
type index_WavePlanGenerator = WavePlanGenerator;
declare const index_WavePlanGenerator: typeof WavePlanGenerator;
type index_WavePlanGeneratorConfig = WavePlanGeneratorConfig;
type index_WavePlannerAIClient = WavePlannerAIClient;
declare const index_WavePlannerAIClient: typeof WavePlannerAIClient;
declare const index_WavePlannerConfig: typeof WavePlannerConfig;
type index_WaveProgress = WaveProgress;
declare const index_WaveSSEEvent: typeof WaveSSEEvent;
type index_WaveSignal = WaveSignal;
type index_WorkHistoryEntry = WorkHistoryEntry;
type index_WorkHistoryResult = WorkHistoryResult;
type index_WorkHistoryRow = WorkHistoryRow;
declare const index_assignWaves: typeof assignWaves;
declare const index_blastRadiusOf: typeof blastRadiusOf;
declare const index_buildDAGGraph: typeof buildDAGGraph;
declare const index_buildEpisodes: typeof buildEpisodes;
declare const index_buildSpecContentForItem: typeof buildSpecContentForItem;
declare const index_codeGraphOf: typeof codeGraphOf;
declare const index_collectFinalMetrics: typeof collectFinalMetrics;
declare const index_compareTaskCodes: typeof compareTaskCodes;
declare const index_computeCriticalPath: typeof computeCriticalPath;
declare const index_createFlatPlan: typeof createFlatPlan;
declare const index_createFlatPlanFromDescriptions: typeof createFlatPlanFromDescriptions;
declare const index_createPlanRefinementService: typeof createPlanRefinementService;
declare const index_createPromptConstructor: typeof createPromptConstructor;
declare const index_createWavePlanGenerator: typeof createWavePlanGenerator;
declare const index_defaultTemplate: typeof defaultTemplate;
declare const index_dependentClaimsOf: typeof dependentClaimsOf;
declare const index_describeCodeGraph: typeof describeCodeGraph;
declare const index_extractAllTaskCodes: typeof extractAllTaskCodes;
declare const index_extractWaveFromTaskCode: typeof extractWaveFromTaskCode;
declare const index_findCommonTheme: typeof findCommonTheme;
declare const index_findTaskByCode: typeof findTaskByCode;
declare const index_freeDispatchSlots: typeof freeDispatchSlots;
declare const index_generatePlanForItem: typeof generatePlanForItem;
declare const index_generateWaveLabel: typeof generateWaveLabel;
declare const index_generateWavePlan: typeof generateWavePlan;
declare const index_getExecutionBridgeOrNull: typeof getExecutionBridgeOrNull;
declare const index_getTasksInWave: typeof getTasksInWave;
declare const index_groupBy: typeof groupBy;
declare const index_inFlightEverywhereSql: typeof inFlightEverywhereSql;
declare const index_inFlightInPlanSql: typeof inFlightInPlanSql;
declare const index_initExecutionBridge: typeof initExecutionBridge;
declare const index_isDispatchableWaveTaskStatus: typeof isDispatchableWaveTaskStatus;
declare const index_isInFlightWaveTaskStatus: typeof isInFlightWaveTaskStatus;
declare const index_isPlanCodeGraph: typeof isPlanCodeGraph;
declare const index_isTerminalWavePlanStatus: typeof isTerminalWavePlanStatus;
declare const index_isTerminalWaveTaskStatus: typeof isTerminalWaveTaskStatus;
declare const index_isWaveOver: typeof isWaveOver;
declare const index_linkTracesToPlan: typeof linkTracesToPlan;
declare const index_newPlannerRunId: typeof newPlannerRunId;
declare const index_normalizeComplexity: typeof normalizeComplexity;
declare const index_normalizeItemDescription: typeof normalizeItemDescription;
declare const index_normalizeModel: typeof normalizeModel;
declare const index_parallelizationGateApplies: typeof parallelizationGateApplies;
declare const index_parseDependencies: typeof parseDependencies;
declare const index_parseFilePaths: typeof parseFilePaths;
declare const index_parseWavePlanResponse: typeof parseWavePlanResponse;
declare const index_planFigures: typeof planFigures;
declare const index_planOutcome: typeof planOutcome;
declare const index_planSha: typeof planSha;
declare const index_plannerTraceEnabled: typeof plannerTraceEnabled;
declare const index_projectWavePlanToPlan: typeof projectWavePlanToPlan;
declare const index_readPlanCodeGraph: typeof readPlanCodeGraph;
declare const index_readWaveSignal: typeof readWaveSignal;
declare const index_recordPlanReview: typeof recordPlanReview;
declare const index_recordPlannerTrace: typeof recordPlannerTrace;
declare const index_redactEpisode: typeof redactEpisode;
declare const index_refinementTemplate: typeof refinementTemplate;
declare const index_renderTicketDescription: typeof renderTicketDescription;
declare const index_resetPlannerTraceWarning: typeof resetPlannerTraceWarning;
declare const index_resolveItemDescription: typeof resolveItemDescription;
declare const index_resolveMinParallelizationScore: typeof resolveMinParallelizationScore;
declare const index_resolvePlannerMaxTokens: typeof resolvePlannerMaxTokens;
declare const index_resolvePlannerModel: typeof resolvePlannerModel;
declare const index_resolveWikiModel: typeof resolveWikiModel;
declare const index_runIdFor: typeof runIdFor;
declare const index_scorePlan: typeof scorePlan;
declare const index_selectDependentClaims: typeof selectDependentClaims;
declare const index_simplifiedTemplate: typeof simplifiedTemplate;
declare const index_sleep: typeof sleep;
declare const index_summarizeCorpus: typeof summarizeCorpus;
declare const index_toActivityEventType: typeof toActivityEventType;
declare const index_topologicalSort: typeof topologicalSort;
declare const index_validateDAG: typeof validateDAG;
declare const index_waveSignalFor: typeof waveSignalFor;
declare const index_withCodeGraph: typeof withCodeGraph;
declare const index_workFromReport: typeof workFromReport;
declare const index_workHistoryForPaths: typeof workHistoryForPaths;
declare namespace index {
  export { type index_AIClientConfig as AIClientConfig, index_ActiveTaskInfo as ActiveTaskInfo, index_AssignedWave as AssignedWave, index_BLAST_RADIUS_LISTED as BLAST_RADIUS_LISTED, index_BlastRadiusLine as BlastRadiusLine, index_CodeGraphReview as CodeGraphReview, index_CodebaseContextBlock as CodebaseContextBlock, index_CodebaseContextService as CodebaseContextService, index_CompletedWorkBlock as CompletedWorkBlock, index_CompletionListener as CompletionListener, index_ConcurrencyManager as ConcurrencyManager, index_ConfidenceSignalUpdate as ConfidenceSignalUpdate, index_ConstraintBlock as ConstraintBlock, type index_CorpusSummary as CorpusSummary, index_CriticalPathAnnotation as CriticalPathAnnotation, index_CriticalPathResult as CriticalPathResult, index_DAGNode as DAGNode, type index_DAGValidatorConfig as DAGValidatorConfig, index_DEFAULT_HISTORY_LIMIT as DEFAULT_HISTORY_LIMIT, index_DEFAULT_MIN_PARALLELIZATION_SCORE as DEFAULT_MIN_PARALLELIZATION_SCORE, index_DEFAULT_PLANNER_MAX_TOKENS as DEFAULT_PLANNER_MAX_TOKENS, index_DEFAULT_PLANNER_MODEL as DEFAULT_PLANNER_MODEL, index_DEFAULT_RECONCILE_INTERVAL_MS as DEFAULT_RECONCILE_INTERVAL_MS, index_DEFAULT_RECONCILE_STALL_MS as DEFAULT_RECONCILE_STALL_MS, index_DEFAULT_RESUME_MAX_AGE_MS as DEFAULT_RESUME_MAX_AGE_MS, index_DEFAULT_WIKI_MODEL as DEFAULT_WIKI_MODEL, index_DISPATCHABLE_WAVE_TASK_STATUSES as DISPATCHABLE_WAVE_TASK_STATUSES, index_DependentClaim as DependentClaim, type index_DispatchError as DispatchError, type index_DispatchLimits as DispatchLimits, type index_DispatchResult as DispatchResult, type index_DrivenWave as DrivenWave, type index_EpisodeCall as EpisodeCall, type index_EpisodePlan as EpisodePlan, type index_EpisodeReview as EpisodeReview, type index_EpisodeTask as EpisodeTask, index_ExecutionBridge as ExecutionBridge, type index_ExecutionBridgeOptions as ExecutionBridgeOptions, type index_FleetCapacity as FleetCapacity, index_FleetContextBlock as FleetContextBlock, index_FleetContextService as FleetContextService, index_GenerationResult as GenerationResult, index_GraphDependentsSource as GraphDependentsSource, index_IN_FLIGHT_WAVE_TASK_STATUSES as IN_FLIGHT_WAVE_TASK_STATUSES, index_MAX_DEPENDENT_CLAIMS_PER_TASK as MAX_DEPENDENT_CLAIMS_PER_TASK, index_MAX_HISTORY_LIMIT as MAX_HISTORY_LIMIT, index_MAX_ITEM_DESCRIPTION_CHARS as MAX_ITEM_DESCRIPTION_CHARS, index_MIN_TASKS_FOR_PARALLELIZATION_GATE as MIN_TASKS_FOR_PARALLELIZATION_GATE, index_MemoryContextBlock as MemoryContextBlock, index_OptimizationResult as OptimizationResult, index_PLANNER_EPISODE_SCHEMA as PLANNER_EPISODE_SCHEMA, index_PLANNER_FIGURES_VERSION as PLANNER_FIGURES_VERSION, index_ParsedEdge as ParsedEdge, index_ParsedStatistics as ParsedStatistics, index_ParsedTask as ParsedTask, index_ParsedWave as ParsedWave, index_ParsedWavePlan as ParsedWavePlan, index_PlanCodeGraph as PlanCodeGraph, type index_PlanOutcome as PlanOutcome, type index_PlanRefinementConfig as PlanRefinementConfig, index_PlanRefinementService as PlanRefinementService, type index_PlanReviewRecord as PlanReviewRecord, index_PlanScore as PlanScore, type index_PlannerEpisode as PlannerEpisode, type index_PlannerFigures as PlannerFigures, type index_PlannerTraceKind as PlannerTraceKind, type index_PlannerTraceOutcome as PlannerTraceOutcome, type index_PlannerTraceRecord as PlannerTraceRecord, index_PlannerTruncatedError as PlannerTruncatedError, index_PredecessorSummary as PredecessorSummary, type index_ProjectedPlanIds as ProjectedPlanIds, index_PromptConstructor as PromptConstructor, type index_PromptConstructorConfig as PromptConstructorConfig, index_PromptContext as PromptContext, type index_PromptTemplate as PromptTemplate, type index_ReconcileOptions as ReconcileOptions, type index_ReconcileReport as ReconcileReport, type index_RefinementPromptTemplate as RefinementPromptTemplate, type index_RefinementResult as RefinementResult, index_RemainingWorkBlock as RemainingWorkBlock, index_SUMMARY_MAX_CHARS as SUMMARY_MAX_CHARS, index_SelectedDependentClaims as SelectedDependentClaims, index_SequencedLine as SequencedLine, type index_SettledWave as SettledWave, index_TERMINAL_WAVE_PLAN_STATUSES as TERMINAL_WAVE_PLAN_STATUSES, index_TERMINAL_WAVE_TASK_STATUSES as TERMINAL_WAVE_TASK_STATUSES, type index_TaskAttemptRef as TaskAttemptRef, index_TaskBlastRadius as TaskBlastRadius, type index_TaskDispatchOutcome as TaskDispatchOutcome, type index_TaskFailureOutcome as TaskFailureOutcome, type index_TaskSettlement as TaskSettlement, type index_TaskWork as TaskWork, index_TopologicalSortResult as TopologicalSortResult, index_ValidationError as ValidationError, index_ValidationErrorCode as ValidationErrorCode, index_ValidationResult as ValidationResult, index_ValidationWarning as ValidationWarning, index_ValidationWarningCode as ValidationWarningCode, index_WaveAdjustment as WaveAdjustment, index_WaveAssignerConfig as WaveAssignerConfig, index_WaveAssignmentResult as WaveAssignmentResult, type index_WaveDispatchContext as WaveDispatchContext, index_WaveDispatchCoordinator as WaveDispatchCoordinator, index_WaveDispatchRequest as WaveDispatchRequest, type index_WaveDriver as WaveDriver, type index_WaveDriverAnswer as WaveDriverAnswer, type index_WaveExecutionConfig as WaveExecutionConfig, index_WaveExecutionController as WaveExecutionController, index_WavePlanExecutionState as WavePlanExecutionState, type index_WavePlanGenerationResult as WavePlanGenerationResult, index_WavePlanGenerator as WavePlanGenerator, type index_WavePlanGeneratorConfig as WavePlanGeneratorConfig, index_WavePlannerAIClient as WavePlannerAIClient, index_WavePlannerConfig as WavePlannerConfig, type index_WaveProgress as WaveProgress, index_WaveSSEEvent as WaveSSEEvent, type index_WaveSignal as WaveSignal, type index_WorkHistoryEntry as WorkHistoryEntry, type index_WorkHistoryResult as WorkHistoryResult, type index_WorkHistoryRow as WorkHistoryRow, index_assignWaves as assignWaves, index_blastRadiusOf as blastRadiusOf, index_buildDAGGraph as buildDAGGraph, index_buildEpisodes as buildEpisodes, index_buildSpecContentForItem as buildSpecContentForItem, index_codeGraphOf as codeGraphOf, index_collectFinalMetrics as collectFinalMetrics, index_compareTaskCodes as compareTaskCodes, index_computeCriticalPath as computeCriticalPath, index_createFlatPlan as createFlatPlan, index_createFlatPlanFromDescriptions as createFlatPlanFromDescriptions, index_createPlanRefinementService as createPlanRefinementService, index_createPromptConstructor as createPromptConstructor, index_createWavePlanGenerator as createWavePlanGenerator, index_defaultTemplate as defaultTemplate, index_dependentClaimsOf as dependentClaimsOf, index_describeCodeGraph as describeCodeGraph, index_extractAllTaskCodes as extractAllTaskCodes, index_extractWaveFromTaskCode as extractWaveFromTaskCode, index_findCommonTheme as findCommonTheme, index_findTaskByCode as findTaskByCode, index_freeDispatchSlots as freeDispatchSlots, index_generatePlanForItem as generatePlanForItem, index_generateWaveLabel as generateWaveLabel, index_generateWavePlan as generateWavePlan, index_getExecutionBridgeOrNull as getExecutionBridgeOrNull, index_getTasksInWave as getTasksInWave, index_groupBy as groupBy, index_inFlightEverywhereSql as inFlightEverywhereSql, index_inFlightInPlanSql as inFlightInPlanSql, index_initExecutionBridge as initExecutionBridge, index_isDispatchableWaveTaskStatus as isDispatchableWaveTaskStatus, index_isInFlightWaveTaskStatus as isInFlightWaveTaskStatus, index_isPlanCodeGraph as isPlanCodeGraph, index_isTerminalWavePlanStatus as isTerminalWavePlanStatus, index_isTerminalWaveTaskStatus as isTerminalWaveTaskStatus, index_isWaveOver as isWaveOver, index_linkTracesToPlan as linkTracesToPlan, index_newPlannerRunId as newPlannerRunId, index_normalizeComplexity as normalizeComplexity, index_normalizeItemDescription as normalizeItemDescription, index_normalizeModel as normalizeModel, index_parallelizationGateApplies as parallelizationGateApplies, index_parseDependencies as parseDependencies, index_parseFilePaths as parseFilePaths, index_parseWavePlanResponse as parseWavePlanResponse, index_planFigures as planFigures, index_planOutcome as planOutcome, index_planSha as planSha, index_plannerTraceEnabled as plannerTraceEnabled, index_projectWavePlanToPlan as projectWavePlanToPlan, index_readPlanCodeGraph as readPlanCodeGraph, index_readWaveSignal as readWaveSignal, index_recordPlanReview as recordPlanReview, index_recordPlannerTrace as recordPlannerTrace, index_redactEpisode as redactEpisode, index_refinementTemplate as refinementTemplate, index_renderTicketDescription as renderTicketDescription, index_resetPlannerTraceWarning as resetPlannerTraceWarning, index_resolveItemDescription as resolveItemDescription, index_resolveMinParallelizationScore as resolveMinParallelizationScore, index_resolvePlannerMaxTokens as resolvePlannerMaxTokens, index_resolvePlannerModel as resolvePlannerModel, index_resolveWikiModel as resolveWikiModel, index_runIdFor as runIdFor, index_scorePlan as scorePlan, index_selectDependentClaims as selectDependentClaims, index_simplifiedTemplate as simplifiedTemplate, index_sleep as sleep, index_summarizeCorpus as summarizeCorpus, index_toActivityEventType as toActivityEventType, index_topologicalSort as topologicalSort, index_validateDAG as validateDAG, index_waveSignalFor as waveSignalFor, index_withCodeGraph as withCodeGraph, index_workFromReport as workFromReport, index_workHistoryForPaths as workHistoryForPaths };
}

export { type DispatchError as $, type AddDrawerInput as A, type AIClientConfig as B, type Closet as C, DisabledClient as D, CodebaseContextService as E, CompletionListener as F, ConcurrencyManager as G, type Hall as H, type CorpusSummary as I, type DAGValidatorConfig as J, type KgAddInput as K, LocalShimClient as L, MemPalaceService as M, DEFAULT_HISTORY_LIMIT as N, DEFAULT_MIN_PARALLELIZATION_SCORE as O, type PalaceContextBlock as P, DEFAULT_PLANNER_MAX_TOKENS as Q, type RecallInput as R, type SearchInput as S, type Tunnel as T, DEFAULT_PLANNER_MODEL as U, DEFAULT_RECONCILE_INTERVAL_MS as V, type Wing as W, DEFAULT_RECONCILE_STALL_MS as X, DEFAULT_RESUME_MAX_AGE_MS as Y, DEFAULT_WIKI_MODEL as Z, DISPATCHABLE_WAVE_TASK_STATUSES as _, type MemPalaceConfig as a, compareTaskCodes as a$, type DispatchLimits as a0, type DispatchResult as a1, type DrivenWave as a2, type EpisodeCall as a3, type EpisodePlan as a4, type EpisodeReview as a5, type EpisodeTask as a6, ExecutionBridge as a7, type ExecutionBridgeOptions as a8, type FleetCapacity as a9, type SettledWave as aA, TERMINAL_WAVE_PLAN_STATUSES as aB, TERMINAL_WAVE_TASK_STATUSES as aC, type TaskAttemptRef as aD, type TaskDispatchOutcome as aE, type TaskFailureOutcome as aF, type TaskSettlement as aG, type TaskWork as aH, type WaveDispatchContext as aI, WaveDispatchCoordinator as aJ, type WaveDriver as aK, type WaveDriverAnswer as aL, type WaveExecutionConfig as aM, WaveExecutionController as aN, type WavePlanGenerationResult as aO, WavePlanGenerator as aP, type WavePlanGeneratorConfig as aQ, WavePlannerAIClient as aR, type WaveProgress as aS, type WaveSignal as aT, type WorkHistoryEntry as aU, type WorkHistoryResult as aV, type WorkHistoryRow as aW, buildDAGGraph as aX, buildEpisodes as aY, buildSpecContentForItem as aZ, collectFinalMetrics as a_, FleetContextService as aa, IN_FLIGHT_WAVE_TASK_STATUSES as ab, MAX_HISTORY_LIMIT as ac, MAX_ITEM_DESCRIPTION_CHARS as ad, MIN_TASKS_FOR_PARALLELIZATION_GATE as ae, PLANNER_EPISODE_SCHEMA as af, PLANNER_FIGURES_VERSION as ag, type PlanOutcome as ah, type PlanRefinementConfig as ai, PlanRefinementService as aj, type PlanReviewRecord as ak, type PlannerEpisode as al, type PlannerFigures as am, type PlannerTraceKind as an, type PlannerTraceOutcome as ao, type PlannerTraceRecord as ap, PlannerTruncatedError as aq, type ProjectedPlanIds as ar, PromptConstructor as as, type PromptConstructorConfig as at, type PromptTemplate as au, type ReconcileOptions as av, type ReconcileReport as aw, type RefinementPromptTemplate as ax, type RefinementResult as ay, SUMMARY_MAX_CHARS as az, type MemPalaceClient as b, computeCriticalPath as b0, createFlatPlan as b1, createFlatPlanFromDescriptions as b2, createPlanRefinementService as b3, createPromptConstructor as b4, createWavePlanGenerator as b5, defaultTemplate as b6, extractAllTaskCodes as b7, extractWaveFromTaskCode as b8, findCommonTheme as b9, planOutcome as bA, planSha as bB, plannerTraceEnabled as bC, projectWavePlanToPlan as bD, readWaveSignal as bE, recordPlanReview as bF, recordPlannerTrace as bG, redactEpisode as bH, refinementTemplate as bI, renderTicketDescription as bJ, resetPlannerTraceWarning as bK, resolveItemDescription as bL, resolveMinParallelizationScore as bM, resolvePlannerMaxTokens as bN, resolvePlannerModel as bO, resolveWikiModel as bP, runIdFor as bQ, scorePlan as bR, simplifiedTemplate as bS, sleep as bT, summarizeCorpus as bU, toActivityEventType as bV, topologicalSort as bW, validateDAG as bX, waveSignalFor as bY, workFromReport as bZ, workHistoryForPaths as b_, findTaskByCode as ba, freeDispatchSlots as bb, generatePlanForItem as bc, generateWaveLabel as bd, generateWavePlan as be, getExecutionBridgeOrNull as bf, getTasksInWave as bg, groupBy as bh, inFlightEverywhereSql as bi, inFlightInPlanSql as bj, initExecutionBridge as bk, isDispatchableWaveTaskStatus as bl, isInFlightWaveTaskStatus as bm, isTerminalWavePlanStatus as bn, isTerminalWaveTaskStatus as bo, isWaveOver as bp, linkTracesToPlan as bq, newPlannerRunId as br, normalizeComplexity as bs, normalizeItemDescription as bt, normalizeModel as bu, parallelizationGateApplies as bv, parseDependencies as bw, parseFilePaths as bx, parseWavePlanResponse as by, planFigures as bz, type AddDrawerResult as c, type SearchResult as d, type WakeUpInput as e, type WakeUpResult as f, type RecallResult as g, type KgContradiction as h, type KgQueryInput as i, type KgTriple as j, type KgInvalidateInput as k, type Room as l, type Drawer as m, type DrawerSource as n, type HallRelation as o, McpAdapterClient as p, type McpTransport as q, type MemPalaceMode as r, type MemoryTier as s, type MemoryType as t, type SearchHit as u, type WingType as v, createMemPalaceClient as w, createMemPalaceService as x, estimateTokens as y, index as z };
