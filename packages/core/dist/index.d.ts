export { ActivityEvent, CompletedTask, ConductorScore, ConflictingFile, Database, DatabaseConfig, HorizonItem, InFlightFile, NewActivityEvent, NewCompletedTask, NewConductorScore, NewConflictingFile, NewHorizonItem, NewInFlightFile, NewPlan, NewRufloSession, NewScoreHistory, NewTask, NewTouchedFile, NewWorkstream, Plan, PostgresDatabase, RufloSession, SQLiteDatabase, ScoreHistory, Task, TouchedFile, Workstream, activityEvents, closeDatabase, completedTasks, completedTasksRelations, conductorScores, conductorScoresRelations, conflictingFiles, conflictingFilesRelations, createDatabase, databaseConfigSchema, getDatabase, getDatabaseConfig, horizonItems, horizonItemsRelations, inFlightFiles, inFlightFilesRelations, initDatabase, palaceClosets, palaceClosetsRelations, palaceDiary, palaceDrawers, palaceDrawersRelations, palaceHalls, palaceKgTriples, palaceRooms, palaceRoomsRelations, palaceTunnels, palaceWings, palaceWingsRelations, plans, plansRelations, resetDatabase, rufloSessions, rufloSessionsRelations, scoreHistory, scoreHistoryRelations, tasks, tasksRelations, touchedFiles, touchedFilesRelations, wikiArticles, wikiArticlesRelations, wikiLog, wikiLogRelations, wikiSources, wikiSourcesRelations, workstreams, workstreamsRelations } from './db/index.js';
export { C as Complexity, D as DependencyEdgeType, E as EventType, F as FileStatus, M as Model, O as OrchestratorMode, S as SessionStatus, b as WavePlanStatus, c as WaveStatus, d as WaveTaskStatus, W as WikiArticleStatus, e as WikiLogAction, a as WikiSourceType, Z as Zone, f as complexityValues, g as dependencyEdgeTypeValues, h as eventTypeValues, i as fileStatusValues, m as modelValues, o as orchestratorModeValues, s as sessionStatusValues, w as wavePlanStatusValues, j as waveStatusValues, k as waveTaskStatusValues, l as wikiArticleStatusValues, n as wikiLogActionValues, p as wikiSourceTypeValues, z as zoneValues } from './enums-CbVZMWqb.js';
export { D as DependencyEdge, N as NewDependencyEdge, a as NewWave, b as NewWavePlan, c as NewWavePlanMetric, d as NewWaveTask, W as Wave, e as WavePlan, f as WavePlanMetric, g as WaveTask, h as dependencyEdges, i as dependencyEdgesRelations, w as wavePlanMetrics, j as wavePlanMetricsRelations, k as wavePlans, l as wavePlansRelations, m as waveTasks, n as waveTasksRelations, o as waves, p as wavesRelations } from './wave-planner-BYl3JIm1.js';
import { M as MemPalaceService, a as MemPalaceConfig, b as MemPalaceClient, W as Wing, A as AddDrawerInput, c as AddDrawerResult, S as SearchInput, d as SearchResult, e as WakeUpInput, f as WakeUpResult, R as RecallInput, g as RecallResult, K as KgAddInput, h as KgContradiction, i as KgQueryInput, j as KgTriple, k as KgInvalidateInput, l as Room, C as Closet, D as DisabledClient, m as Drawer, n as DrawerSource, H as Hall, o as HallRelation, L as LocalShimClient, p as McpAdapterClient, q as McpTransport, r as MemPalaceMode, s as MemoryTier, t as MemoryType, P as PalaceContextBlock, u as SearchHit, T as Tunnel, v as WingType, w as createMemPalaceClient, x as createMemPalaceService, y as estimateTokens } from './index-DlwAMN3Z.js';
export { z as wavePlanner } from './index-DlwAMN3Z.js';
import { LinearClient } from '@linear/sdk';
export { i as orchestrator } from './index-DpIvY3Ak.js';
import { W as WikiCompiler, I as IngestResult, a as WikiCompilerConfig, b as WikiSessionHook } from './index-D4fLDY0o.js';
export { i as wiki } from './index-D4fLDY0o.js';
export { i as score } from './index-Drhl0OQH.js';
import 'zod';
import 'drizzle-orm/better-sqlite3';
import 'drizzle-orm';
import 'drizzle-orm/sqlite-core';
import 'drizzle-orm/postgres-js';
import './service-CmLM9G-i.js';

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

/**
 * Graphiti-backed MemPalace client — TRD 18.
 *
 * WHY GRAPHITI, AND WHY THIS SHAPE.
 *
 * `docs/MEMORY-LANDSCAPE.md` concluded that experience memory is worth owning
 * and the substrate underneath it is not. Graphiti is the substrate: Apache 2.0,
 * ~20k stars, an MCP server at 1.0 with hundreds of thousands of weekly users,
 * and — decisively — it is what Zep's own commercial product runs on, so it is
 * maintained because they depend on it rather than as a lead magnet. Its
 * embedded backend is FalkorDB Lite, the same store Synaptic Wiki already uses.
 *
 * It closes the gap none of our four constructs could: **temporal validity**.
 * Facts carry a `reference_time` and can be superseded, so "this decomposition
 * worked before the refactor" becomes expressible instead of silently wrong.
 *
 * ADOPTING IT DELETES A BUG RATHER THAN FIXING ONE. MemPalace's local shim
 * writes drawers and reads closets with nothing converting between them, so
 * recall returned nothing for everything ever written. Graphiti has one store:
 * `search` reads what `add` wrote. There is no `evolve` stage to build because
 * there is no split to reconcile.
 *
 * WRITES ARE DETERMINISTIC BY DEFAULT. Graphiti's `add_memory` runs LLM
 * extraction and needs an API key; `add_triplet` inserts a fact directly and
 * does not. DevPilot's run records are already structured — the plan IS the
 * record — so the default path uses triplets. Memory that fails closed when no
 * key is configured would be worse than no memory, because it would fail
 * exactly when someone is evaluating the product.
 */

interface GraphitiConfig {
    /** Base URL of the Graphiti MCP server, e.g. http://127.0.0.1:8000/mcp/ */
    endpoint: string;
    /** Optional bearer token when the server sits behind auth (hosted tier). */
    apiKey?: string;
    /** Per-request timeout. Memory must never hang a dispatch. */
    timeoutMs?: number;
    /**
     * `deterministic` writes facts via `add_triplet` and needs no LLM key.
     * `llm` writes episodes via `add_memory`, letting Graphiti extract entities —
     * richer, but it requires a key on the SERVER and costs a model call per write.
     */
    extraction?: 'deterministic' | 'llm';
    onLog?: (line: string) => void;
}
declare class GraphitiClient implements MemPalaceClient {
    private readonly config;
    readonly mode: "mcp";
    private nextId;
    constructor(config: GraphitiConfig);
    private log;
    /**
     * Call one MCP tool. Never throws — every failure degrades to `null`.
     *
     * Memory improves a plan; it does not gate one. A Graphiti server that is
     * down, slow, or speaking a version we do not understand must cost the
     * conductor nothing but the absence of recall.
     */
    private call;
    /**
     * A wing is a Graphiti `group_id`.
     *
     * Namespaces are implicit — writing to a group creates it — so there is
     * nothing to provision. This returns a synthetic Wing rather than making a
     * round trip for a no-op.
     */
    ensureWing(slug: string, name?: string, repo?: string): Promise<Wing>;
    addDrawer(input: AddDrawerInput): Promise<AddDrawerResult>;
    search(input: SearchInput): Promise<SearchResult>;
    /** L0/L1 — the entities that matter most in this namespace. */
    wakeUp(input: WakeUpInput): Promise<WakeUpResult>;
    /**
     * L2 topical recall.
     *
     * This is the method the local shim could not answer: it read closets, and
     * nothing ever produced one. Here it is a fact search, so it returns what was
     * written.
     */
    recall(input: RecallInput): Promise<RecallResult>;
    kgAdd(input: KgAddInput): Promise<{
        tripleId: string;
        contradictions: KgContradiction[];
    }>;
    kgQuery(input: KgQueryInput): Promise<KgTriple[]>;
    /**
     * Temporal invalidation — the capability the port declared and no backend
     * implemented. Graphiti expires an edge rather than deleting it, so the
     * history of what we used to believe survives.
     */
    kgInvalidate(input: KgInvalidateInput): Promise<{
        invalidatedCount: number;
    }>;
    /**
     * Graphiti exposes no namespace listing — `group_id`s are implicit, so there
     * is nothing to enumerate. Returning empty is honest; the alternative would be
     * inventing a registry we do not maintain.
     */
    listWings(): Promise<Wing[]>;
    listRooms(_wingSlug: string): Promise<Room[]>;
    /** Is the server reachable? Used to decide whether to fall back to local. */
    healthy(): Promise<boolean>;
}

declare const index_AddDrawerInput: typeof AddDrawerInput;
declare const index_AddDrawerResult: typeof AddDrawerResult;
declare const index_Closet: typeof Closet;
declare const index_DisabledClient: typeof DisabledClient;
declare const index_Drawer: typeof Drawer;
declare const index_DrawerSource: typeof DrawerSource;
type index_DualFeedHookConfig = DualFeedHookConfig;
type index_DualFeedSessionHook = DualFeedSessionHook;
declare const index_DualFeedSessionHook: typeof DualFeedSessionHook;
type index_GraphitiClient = GraphitiClient;
declare const index_GraphitiClient: typeof GraphitiClient;
type index_GraphitiConfig = GraphitiConfig;
declare const index_Hall: typeof Hall;
declare const index_HallRelation: typeof HallRelation;
declare const index_KgAddInput: typeof KgAddInput;
declare const index_KgContradiction: typeof KgContradiction;
declare const index_KgInvalidateInput: typeof KgInvalidateInput;
declare const index_KgQueryInput: typeof KgQueryInput;
declare const index_KgTriple: typeof KgTriple;
declare const index_LocalShimClient: typeof LocalShimClient;
declare const index_McpAdapterClient: typeof McpAdapterClient;
declare const index_McpTransport: typeof McpTransport;
declare const index_MemPalaceClient: typeof MemPalaceClient;
declare const index_MemPalaceConfig: typeof MemPalaceConfig;
declare const index_MemPalaceMode: typeof MemPalaceMode;
declare const index_MemPalaceService: typeof MemPalaceService;
declare const index_MemoryTier: typeof MemoryTier;
declare const index_MemoryType: typeof MemoryType;
declare const index_PalaceContextBlock: typeof PalaceContextBlock;
declare const index_RecallInput: typeof RecallInput;
declare const index_RecallResult: typeof RecallResult;
declare const index_Room: typeof Room;
declare const index_SearchHit: typeof SearchHit;
declare const index_SearchInput: typeof SearchInput;
declare const index_SearchResult: typeof SearchResult;
declare const index_Tunnel: typeof Tunnel;
declare const index_WakeUpInput: typeof WakeUpInput;
declare const index_WakeUpResult: typeof WakeUpResult;
type index_WikiBridgeConfig = WikiBridgeConfig;
type index_WikiPalaceBridge = WikiPalaceBridge;
declare const index_WikiPalaceBridge: typeof WikiPalaceBridge;
declare const index_Wing: typeof Wing;
declare const index_WingType: typeof WingType;
declare const index_createMemPalaceClient: typeof createMemPalaceClient;
declare const index_createMemPalaceService: typeof createMemPalaceService;
declare const index_createWikiPalaceBridge: typeof createWikiPalaceBridge;
declare const index_estimateTokens: typeof estimateTokens;
declare namespace index {
  export { index_AddDrawerInput as AddDrawerInput, index_AddDrawerResult as AddDrawerResult, index_Closet as Closet, index_DisabledClient as DisabledClient, index_Drawer as Drawer, index_DrawerSource as DrawerSource, type index_DualFeedHookConfig as DualFeedHookConfig, index_DualFeedSessionHook as DualFeedSessionHook, index_GraphitiClient as GraphitiClient, type index_GraphitiConfig as GraphitiConfig, index_Hall as Hall, index_HallRelation as HallRelation, index_KgAddInput as KgAddInput, index_KgContradiction as KgContradiction, index_KgInvalidateInput as KgInvalidateInput, index_KgQueryInput as KgQueryInput, index_KgTriple as KgTriple, index_LocalShimClient as LocalShimClient, index_McpAdapterClient as McpAdapterClient, index_McpTransport as McpTransport, index_MemPalaceClient as MemPalaceClient, index_MemPalaceConfig as MemPalaceConfig, index_MemPalaceMode as MemPalaceMode, index_MemPalaceService as MemPalaceService, index_MemoryTier as MemoryTier, index_MemoryType as MemoryType, index_PalaceContextBlock as PalaceContextBlock, index_RecallInput as RecallInput, index_RecallResult as RecallResult, index_Room as Room, index_SearchHit as SearchHit, index_SearchInput as SearchInput, index_SearchResult as SearchResult, index_Tunnel as Tunnel, index_WakeUpInput as WakeUpInput, index_WakeUpResult as WakeUpResult, type index_WikiBridgeConfig as WikiBridgeConfig, index_WikiPalaceBridge as WikiPalaceBridge, index_Wing as Wing, index_WingType as WingType, index_createMemPalaceClient as createMemPalaceClient, index_createMemPalaceService as createMemPalaceService, index_createWikiPalaceBridge as createWikiPalaceBridge, index_estimateTokens as estimateTokens };
}

declare const VERSION = "0.1.0";

export { VERSION, index$1 as linear, index as mempalace };
