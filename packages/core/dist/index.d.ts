export { ActivityEvent, CompletedTask, Complexity, ConductorScore, ConflictingFile, Database, DatabaseConfig, EventType, FileStatus, HorizonItem, InFlightFile, Model, NewActivityEvent, NewCompletedTask, NewConductorScore, NewConflictingFile, NewHorizonItem, NewInFlightFile, NewPlan, NewRufloSession, NewScoreHistory, NewTask, NewTouchedFile, NewWorkstream, OrchestratorMode, Plan, PostgresDatabase, RufloSession, SQLiteDatabase, ScoreHistory, SessionStatus, Task, TouchedFile, Workstream, Zone, activityEvents, closeDatabase, completedTasks, completedTasksRelations, complexityValues, conductorScores, conductorScoresRelations, conflictingFiles, conflictingFilesRelations, createDatabase, databaseConfigSchema, eventTypeValues, fileStatusValues, getDatabase, getDatabaseConfig, horizonItems, horizonItemsRelations, inFlightFiles, inFlightFilesRelations, initDatabase, modelValues, orchestratorModeValues, plans, plansRelations, resetDatabase, rufloSessions, rufloSessionsRelations, scoreHistory, scoreHistoryRelations, sessionStatusValues, tasks, tasksRelations, touchedFiles, touchedFilesRelations, workstreams, workstreamsRelations, zoneValues } from './db/index.js';
import { LinearClient } from '@linear/sdk';
import 'zod';
import 'drizzle-orm/better-sqlite3';
import 'drizzle-orm';
import 'drizzle-orm/sqlite-core';
import 'drizzle-orm/postgres-js';

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

/**
 * Orchestrator bridge type definitions
 * Defines the contract between DevPilot and the external agent-orchestrator
 */
interface OrchestratorConfig {
    url: string;
    apiKey?: string;
    callbackUrl: string;
    timeout?: number;
}
/**
 * Request sent to orchestrator when dispatching work
 */
interface DispatchRequest {
    sessionId: string;
    repo: string;
    taskSpec: TaskSpec;
    linearTicketId?: string;
    callbackUrl: string;
    metadata?: Record<string, unknown>;
}
interface TaskSpec {
    prompt: string;
    filePaths: string[];
    model: 'haiku' | 'sonnet' | 'opus';
    workstream?: string;
    acceptanceCriteria?: string[];
    constraints?: string[];
    estimatedMinutes?: number;
}
/**
 * Status update received from orchestrator during execution
 */
interface StatusUpdate {
    sessionId: string;
    status: 'queued' | 'running' | 'waiting' | 'complete' | 'error' | 'cancelled';
    progressPercent: number;
    currentStep?: string;
    currentFile?: string;
    message?: string;
    filesModified?: string[];
    tokensUsed?: number;
    timestamp: string;
}
/**
 * Completion report received when orchestrator finishes a task
 */
interface CompletionReport {
    sessionId: string;
    success: boolean;
    prUrl?: string;
    commitSha?: string;
    filesModified: string[];
    filesCreated: string[];
    filesDeleted: string[];
    summary: string;
    tokensUsed: number;
    costUsd: number;
    durationMinutes: number;
    error?: {
        code: string;
        message: string;
        recoverable: boolean;
    };
    metadata?: Record<string, unknown>;
}
/**
 * Response from orchestrator when dispatch is accepted
 */
interface DispatchResponse {
    accepted: boolean;
    orchestratorJobId?: string;
    estimatedStartTime?: string;
    queuePosition?: number;
    error?: string;
}
/**
 * Health check response from orchestrator
 */
interface OrchestratorHealth {
    status: 'healthy' | 'degraded' | 'down';
    version: string;
    activeJobs: number;
    queueLength: number;
    availableWorkers: number;
}

/**
 * Orchestrator Adapter Interface
 *
 * Defines the contract for orchestrator implementations.
 * Allows switching between HTTP-based orchestrator and ao CLI.
 */

/**
 * Orchestrator modes supported by DevPilot
 */
type OrchestratorMode = 'http' | 'ao-cli' | 'disabled';
/**
 * Configuration for orchestrator adapter
 */
interface OrchestratorAdapterConfig {
    mode: OrchestratorMode;
    url?: string;
    apiKey?: string;
    callbackUrl?: string;
    timeout?: number;
    aoProjectName?: string;
    aoPath?: string;
    workingDirectory?: string;
    pollIntervalMs?: number;
}
/**
 * Job status with additional ao-specific fields
 */
interface JobStatus {
    sessionId: string;
    externalJobId?: string;
    status: 'queued' | 'running' | 'waiting' | 'complete' | 'error' | 'cancelled';
    progressPercent: number;
    currentStep?: string;
    currentFile?: string;
    message?: string;
    filesModified?: string[];
    tokensUsed?: number;
    costUsd?: number;
    startedAt?: string;
    updatedAt?: string;
}
/**
 * Result of sending a message to an active session
 */
interface SendMessageResult {
    success: boolean;
    message?: string;
    error?: string;
}
/**
 * Interface that all orchestrator adapters must implement
 */
interface IOrchestratorAdapter {
    /**
     * Get adapter mode identifier
     */
    readonly mode: OrchestratorMode;
    /**
     * Check if orchestrator is healthy and available
     */
    healthCheck(): Promise<OrchestratorHealth>;
    /**
     * Dispatch a task to the orchestrator
     * Returns immediately with job ID, actual execution is async
     */
    dispatch(request: DispatchRequest): Promise<DispatchResponse>;
    /**
     * Get the current status of a job
     */
    getJobStatus(externalJobId: string): Promise<JobStatus>;
    /**
     * Cancel a running job
     */
    cancel(externalJobId: string): Promise<{
        success: boolean;
        message: string;
    }>;
    /**
     * Send a message to an active session (for clarifications/guidance)
     */
    sendMessage?(externalJobId: string, message: string): Promise<SendMessageResult>;
    /**
     * Get completion report for a finished job
     */
    getCompletionReport?(externalJobId: string): Promise<CompletionReport | null>;
    /**
     * Stop polling/cleanup resources
     */
    shutdown?(): Promise<void>;
}
/**
 * Event types emitted by orchestrator adapters
 */
type OrchestratorEventType = 'job:started' | 'job:progress' | 'job:complete' | 'job:error' | 'job:cancelled';
/**
 * Event payload for orchestrator events
 */
interface OrchestratorEvent {
    type: OrchestratorEventType;
    sessionId: string;
    externalJobId: string;
    timestamp: string;
    data: StatusUpdate | CompletionReport | {
        error: string;
    };
}
/**
 * Callback for orchestrator events
 */
type OrchestratorEventCallback = (event: OrchestratorEvent) => void;

/**
 * HTTP client for communicating with the external agent-orchestrator
 */

declare class OrchestratorClient {
    private config;
    constructor(config: OrchestratorConfig);
    /**
     * Check if orchestrator is healthy
     */
    healthCheck(): Promise<OrchestratorHealth>;
    /**
     * Dispatch a task to the orchestrator
     */
    dispatch(request: DispatchRequest): Promise<DispatchResponse>;
    /**
     * Cancel a running job
     */
    cancel(sessionId: string): Promise<{
        success: boolean;
        message: string;
    }>;
    /**
     * Get status of a specific job
     */
    getJobStatus(sessionId: string): Promise<{
        status: string;
        progressPercent: number;
        message?: string;
    }>;
    /**
     * Get queue information
     */
    getQueue(): Promise<{
        length: number;
        estimatedWaitMinutes: number;
        jobs: {
            sessionId: string;
            status: string;
            queuePosition: number;
        }[];
    }>;
    private fetch;
}
declare function initOrchestratorClient(config: OrchestratorConfig): OrchestratorClient;
declare function getOrchestratorClient(): OrchestratorClient;
declare function isOrchestratorConfigured(): boolean;
/**
 * Build a dispatch request from session data
 */
declare function buildDispatchRequest(params: {
    sessionId: string;
    repo: string;
    title: string;
    filePaths: string[];
    model?: 'haiku' | 'sonnet' | 'opus';
    workstream?: string;
    acceptanceCriteria?: string[];
    linearTicketId?: string;
    callbackUrl: string;
    estimatedMinutes?: number;
}): DispatchRequest;

/**
 * ao CLI Adapter
 *
 * Implements IOrchestratorAdapter using the ao (agent-orchestrator) CLI.
 * Executes ao spawn, ao status, ao send, and ao stop commands.
 */

/**
 * ao CLI adapter implementation
 */
declare class AoCliAdapter implements IOrchestratorAdapter {
    readonly mode: OrchestratorMode;
    private config;
    private aoPath;
    private projectName;
    private workingDirectory?;
    constructor(config: OrchestratorAdapterConfig);
    /**
     * Execute an ao command and return stdout
     */
    private execAo;
    /**
     * Check if ao CLI is available and working
     */
    healthCheck(): Promise<OrchestratorHealth>;
    /**
     * Dispatch a task using ao spawn
     * Command: ao spawn <project> <ticket-id> "<prompt>"
     */
    dispatch(request: DispatchRequest): Promise<DispatchResponse>;
    /**
     * Get job status using ao status <session>
     */
    getJobStatus(externalJobId: string): Promise<JobStatus>;
    /**
     * Cancel a job using ao stop <session>
     */
    cancel(externalJobId: string): Promise<{
        success: boolean;
        message: string;
    }>;
    /**
     * Send a message to an active session using ao send <session> "<message>"
     */
    sendMessage(externalJobId: string, message: string): Promise<SendMessageResult>;
    /**
     * Get completion report for a finished job
     * Uses ao status with detailed output
     */
    getCompletionReport(externalJobId: string): Promise<CompletionReport | null>;
    /**
     * Cleanup - no persistent resources for CLI adapter
     */
    shutdown(): Promise<void>;
}
/**
 * Create an ao CLI adapter instance
 */
declare function createAoCliAdapter(config: OrchestratorAdapterConfig): AoCliAdapter;

/**
 * Unified Orchestrator Service
 *
 * Strategy pattern implementation that switches between HTTP and ao-cli adapters.
 * Provides a single interface for fleet dispatch regardless of underlying orchestrator.
 */

/**
 * Session mapping to track DevPilot session <-> external job ID relationship
 */
interface SessionMapping {
    sessionId: string;
    externalJobId: string;
    mode: OrchestratorMode;
    startedAt: Date;
    lastStatusAt?: Date;
}
/**
 * Unified orchestrator service
 */
declare class OrchestratorService {
    private adapter;
    private config;
    private sessionMappings;
    private eventCallbacks;
    constructor(config: OrchestratorAdapterConfig);
    /**
     * Create the appropriate adapter based on mode
     */
    private createAdapter;
    /**
     * Get current orchestrator mode
     */
    get mode(): OrchestratorMode;
    /**
     * Check if orchestrator is available
     */
    get isEnabled(): boolean;
    /**
     * Subscribe to orchestrator events
     */
    onEvent(callback: OrchestratorEventCallback): () => void;
    /**
     * Emit an event to all subscribers
     */
    private emitEvent;
    /**
     * Check orchestrator health
     */
    healthCheck(): Promise<OrchestratorHealth>;
    /**
     * Dispatch a task to the orchestrator
     * Stores session mapping for later status queries
     */
    dispatch(request: DispatchRequest): Promise<DispatchResponse & {
        mode: OrchestratorMode;
    }>;
    /**
     * Get job status by DevPilot session ID
     */
    getJobStatusBySessionId(sessionId: string): Promise<JobStatus | null>;
    /**
     * Get job status by external job ID
     */
    getJobStatus(externalJobId: string): Promise<JobStatus>;
    /**
     * Cancel a job by DevPilot session ID
     */
    cancelBySessionId(sessionId: string): Promise<{
        success: boolean;
        message: string;
    }>;
    /**
     * Cancel a job by external job ID
     */
    cancel(externalJobId: string): Promise<{
        success: boolean;
        message: string;
    }>;
    /**
     * Send a message to an active session
     */
    sendMessage(sessionId: string, message: string): Promise<SendMessageResult>;
    /**
     * Get completion report for a finished job
     */
    getCompletionReport(sessionId: string): Promise<CompletionReport | null>;
    /**
     * Mark a session as complete (for external completion notifications)
     */
    markSessionComplete(sessionId: string, report: CompletionReport): void;
    /**
     * Get all active session mappings
     */
    getActiveSessions(): SessionMapping[];
    /**
     * Get external job ID for a session
     */
    getExternalJobId(sessionId: string): string | undefined;
    /**
     * Shutdown the orchestrator service
     */
    shutdown(): Promise<void>;
}
/**
 * Initialize the orchestrator service with configuration
 */
declare function initOrchestratorService(config: OrchestratorAdapterConfig): OrchestratorService;
/**
 * Get the orchestrator service instance
 * Throws if not initialized
 */
declare function getOrchestratorService(): OrchestratorService;
/**
 * Check if orchestrator service is initialized
 */
declare function isOrchestratorServiceInitialized(): boolean;
/**
 * Get orchestrator service if initialized, otherwise return null
 */
declare function getOrchestratorServiceOrNull(): OrchestratorService | null;

/**
 * Status Poller
 *
 * Polls orchestrator for status updates on active sessions.
 * Updates rufloSessions table and syncs progress to Linear.
 */

/**
 * Configuration for status poller
 */
interface StatusPollerConfig {
    pollIntervalMs: number;
    maxRetries: number;
    onStatusUpdate?: (sessionId: string, status: JobStatus) => Promise<void>;
    onComplete?: (sessionId: string, report: CompletionReport) => Promise<void>;
    onError?: (sessionId: string, error: Error) => Promise<void>;
}
/**
 * Tracked session state
 */
interface TrackedSession {
    sessionId: string;
    externalJobId: string;
    lastStatus?: JobStatus;
    retryCount: number;
    startedAt: Date;
    lastPollAt?: Date;
}
/**
 * Status poller for orchestrator sessions
 */
declare class StatusPoller {
    private orchestrator;
    private config;
    private trackedSessions;
    private pollInterval;
    private isRunning;
    private unsubscribe?;
    constructor(orchestrator: OrchestratorService, config?: Partial<StatusPollerConfig>);
    /**
     * Handle events from orchestrator service
     */
    private handleOrchestratorEvent;
    /**
     * Start tracking a session for polling
     */
    trackSession(sessionId: string, externalJobId: string): void;
    /**
     * Stop tracking a session
     */
    untrackSession(sessionId: string): void;
    /**
     * Start the polling loop
     */
    start(): void;
    /**
     * Stop the polling loop
     */
    stop(): void;
    /**
     * Poll all tracked sessions for status
     */
    private poll;
    /**
     * Poll a single session for status
     */
    private pollSession;
    /**
     * Handle session completion
     */
    private handleCompletion;
    /**
     * Get all currently tracked sessions
     */
    getTrackedSessions(): TrackedSession[];
    /**
     * Get polling statistics
     */
    getStats(): {
        isRunning: boolean;
        trackedCount: number;
        pollIntervalMs: number;
    };
    /**
     * Shutdown the poller
     */
    shutdown(): void;
}
/**
 * Initialize the status poller
 */
declare function initStatusPoller(orchestrator: OrchestratorService, config?: Partial<StatusPollerConfig>): StatusPoller;
/**
 * Get the status poller instance
 */
declare function getStatusPoller(): StatusPoller;
/**
 * Check if status poller is initialized
 */
declare function isStatusPollerInitialized(): boolean;
/**
 * Get status poller if initialized, otherwise return null
 */
declare function getStatusPollerOrNull(): StatusPoller | null;

/**
 * Orchestrator bridge module
 */

type index_AoCliAdapter = AoCliAdapter;
declare const index_AoCliAdapter: typeof AoCliAdapter;
type index_CompletionReport = CompletionReport;
type index_DispatchRequest = DispatchRequest;
type index_DispatchResponse = DispatchResponse;
type index_IOrchestratorAdapter = IOrchestratorAdapter;
type index_JobStatus = JobStatus;
type index_OrchestratorAdapterConfig = OrchestratorAdapterConfig;
type index_OrchestratorClient = OrchestratorClient;
declare const index_OrchestratorClient: typeof OrchestratorClient;
type index_OrchestratorConfig = OrchestratorConfig;
type index_OrchestratorEvent = OrchestratorEvent;
type index_OrchestratorEventCallback = OrchestratorEventCallback;
type index_OrchestratorEventType = OrchestratorEventType;
type index_OrchestratorHealth = OrchestratorHealth;
type index_OrchestratorMode = OrchestratorMode;
type index_OrchestratorService = OrchestratorService;
declare const index_OrchestratorService: typeof OrchestratorService;
type index_SendMessageResult = SendMessageResult;
type index_StatusPoller = StatusPoller;
declare const index_StatusPoller: typeof StatusPoller;
type index_StatusPollerConfig = StatusPollerConfig;
type index_StatusUpdate = StatusUpdate;
type index_TaskSpec = TaskSpec;
declare const index_buildDispatchRequest: typeof buildDispatchRequest;
declare const index_createAoCliAdapter: typeof createAoCliAdapter;
declare const index_getOrchestratorClient: typeof getOrchestratorClient;
declare const index_getOrchestratorService: typeof getOrchestratorService;
declare const index_getOrchestratorServiceOrNull: typeof getOrchestratorServiceOrNull;
declare const index_getStatusPoller: typeof getStatusPoller;
declare const index_getStatusPollerOrNull: typeof getStatusPollerOrNull;
declare const index_initOrchestratorClient: typeof initOrchestratorClient;
declare const index_initOrchestratorService: typeof initOrchestratorService;
declare const index_initStatusPoller: typeof initStatusPoller;
declare const index_isOrchestratorConfigured: typeof isOrchestratorConfigured;
declare const index_isOrchestratorServiceInitialized: typeof isOrchestratorServiceInitialized;
declare const index_isStatusPollerInitialized: typeof isStatusPollerInitialized;
declare namespace index {
  export { index_AoCliAdapter as AoCliAdapter, type index_CompletionReport as CompletionReport, type index_DispatchRequest as DispatchRequest, type index_DispatchResponse as DispatchResponse, type index_IOrchestratorAdapter as IOrchestratorAdapter, type index_JobStatus as JobStatus, type index_OrchestratorAdapterConfig as OrchestratorAdapterConfig, index_OrchestratorClient as OrchestratorClient, type index_OrchestratorConfig as OrchestratorConfig, type index_OrchestratorEvent as OrchestratorEvent, type index_OrchestratorEventCallback as OrchestratorEventCallback, type index_OrchestratorEventType as OrchestratorEventType, type index_OrchestratorHealth as OrchestratorHealth, type index_OrchestratorMode as OrchestratorMode, index_OrchestratorService as OrchestratorService, type index_SendMessageResult as SendMessageResult, index_StatusPoller as StatusPoller, type index_StatusPollerConfig as StatusPollerConfig, type index_StatusUpdate as StatusUpdate, type index_TaskSpec as TaskSpec, index_buildDispatchRequest as buildDispatchRequest, index_createAoCliAdapter as createAoCliAdapter, index_getOrchestratorClient as getOrchestratorClient, index_getOrchestratorService as getOrchestratorService, index_getOrchestratorServiceOrNull as getOrchestratorServiceOrNull, index_getStatusPoller as getStatusPoller, index_getStatusPollerOrNull as getStatusPollerOrNull, index_initOrchestratorClient as initOrchestratorClient, index_initOrchestratorService as initOrchestratorService, index_initStatusPoller as initStatusPoller, index_isOrchestratorConfigured as isOrchestratorConfigured, index_isOrchestratorServiceInitialized as isOrchestratorServiceInitialized, index_isStatusPollerInitialized as isStatusPollerInitialized };
}

declare const VERSION = "0.1.0";

export { VERSION, index$1 as linear, index as orchestrator };
