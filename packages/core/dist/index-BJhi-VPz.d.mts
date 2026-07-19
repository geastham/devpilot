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
 *
 * - `claude-session`: session-native dispatch. Spawns/resumes a managed Claude
 *   Code session and receives progress via pushed callbacks (no polling). This
 *   is the forward-looking default; `ao-cli` is retained as a legacy fallback.
 * - `ao-cli`: legacy. Shells out to the `ao` CLI and scrapes `ao status` on a
 *   poll loop. Superseded by `claude-session`; kept for backward compatibility.
 * - `http`: dispatch to a remote orchestrator over HTTP.
 * - `disabled`: no orchestrator.
 */
type OrchestratorMode = 'claude-session' | 'http' | 'ao-cli' | 'disabled';
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
    sessionApiUrl?: string;
    sessionEnvironmentId?: string;
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
     * Whether this adapter receives progress via pushed callbacks rather than
     * being polled. Push-based adapters (e.g. `claude-session`) should NOT be
     * tracked by the StatusPoller. Undefined/false preserves the legacy
     * poll-based behavior used by `ao-cli` and `http`.
     */
    readonly pushBased?: boolean;
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
 * Capability mixin for push-based adapters.
 *
 * Session-native adapters don't poll for status — instead the running session
 * POSTs progress and completion to DevPilot's callback endpoints
 * (`/api/orchestrator/status`, `/api/orchestrator/complete`). Those endpoints
 * (or the OrchestratorService) forward the payloads here so the adapter can
 * cache last-known state to answer `getJobStatus`/`getCompletionReport`.
 */
interface IPushCapableAdapter {
    ingestStatus(externalJobId: string, update: StatusUpdate): void;
    ingestCompletion(externalJobId: string, report: CompletionReport): void;
}
/**
 * Type guard for adapters that accept pushed status/completion updates.
 */
declare function isPushCapableAdapter(adapter: IOrchestratorAdapter): adapter is IOrchestratorAdapter & IPushCapableAdapter;

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
 * Claude Session Adapter (session-native)
 *
 * Implements IOrchestratorAdapter by dispatching work to managed Claude Code
 * sessions instead of shelling out to the `ao` CLI. Unlike the legacy
 * `ao-cli` adapter, this adapter is PUSH-BASED: the running session reports
 * progress and completion back to DevPilot's callback endpoints
 * (`/api/orchestrator/status`, `/api/orchestrator/complete`). There is no poll
 * loop and no stdout scraping.
 *
 * SCAFFOLD NOTE
 * -------------
 * The concrete mechanism for *creating* and *steering* a session (remote
 * session API, trigger/routine, hosted bridge, etc.) is environment-specific
 * and intentionally not hardcoded here. It lives behind the `SessionTransport`
 * interface so it can be wired to whatever dispatch surface DevPilot targets.
 * `HttpSessionTransport` is a reasonable default that POSTs to a configurable
 * session API; its routes are placeholders (marked TODO) pending the real
 * dispatch contract.
 */

/**
 * Parameters for creating a session-native dispatch.
 */
interface CreateSessionParams {
    /** DevPilot session id, used to correlate pushed callbacks. */
    sessionId: string;
    repo: string;
    prompt: string;
    model?: 'haiku' | 'sonnet' | 'opus';
    filePaths?: string[];
    acceptanceCriteria?: string[];
    constraints?: string[];
    linearTicketId?: string;
    /** URL base the session should POST status/completion to. */
    callbackUrl: string;
    /** Managed environment the session should run in, if applicable. */
    environmentId?: string;
    metadata?: Record<string, unknown>;
}
interface CreateSessionResult {
    accepted: boolean;
    /** Provider-side session identifier used for status/cancel/send. */
    externalSessionId?: string;
    error?: string;
}
/**
 * Transport that knows how to create and steer a concrete session.
 * Swap the implementation to target a specific dispatch surface.
 */
interface SessionTransport {
    createSession(params: CreateSessionParams): Promise<CreateSessionResult>;
    sendMessage(externalSessionId: string, message: string): Promise<{
        success: boolean;
        error?: string;
    }>;
    stopSession(externalSessionId: string): Promise<{
        success: boolean;
        message: string;
    }>;
    /** Optional pull fallback for environments that can't push. */
    getSession?(externalSessionId: string): Promise<Partial<JobStatus> | null>;
    /** Optional health probe. */
    health?(): Promise<Pick<OrchestratorHealth, 'status' | 'version'>>;
}
/**
 * Default transport: POSTs to a configurable session dispatcher over HTTP.
 *
 * TODO(session-native): the endpoint paths below are placeholders. Replace
 * with the real DevPilot bridge / Claude Code remote-session contract once
 * defined, and thread through auth (workspace token, environment id).
 */
declare class HttpSessionTransport implements SessionTransport {
    private readonly baseUrl;
    private readonly apiKey?;
    private readonly timeoutMs;
    constructor(baseUrl: string, apiKey?: string | undefined, timeoutMs?: number);
    createSession(params: CreateSessionParams): Promise<CreateSessionResult>;
    sendMessage(externalSessionId: string, message: string): Promise<{
        success: boolean;
        error?: undefined;
    } | {
        success: boolean;
        error: string;
    }>;
    stopSession(externalSessionId: string): Promise<{
        success: boolean;
        message: string;
    }>;
    getSession(externalSessionId: string): Promise<Partial<JobStatus> | null>;
    health(): Promise<{
        status: "down";
        version: string;
    } | {
        status: "healthy";
        version: string;
    }>;
    private fetch;
}
/**
 * Session-native orchestrator adapter.
 */
declare class ClaudeSessionAdapter implements IOrchestratorAdapter, IPushCapableAdapter {
    readonly mode: OrchestratorMode;
    readonly pushBased = true;
    private readonly transport;
    private readonly config;
    private readonly cache;
    constructor(config: OrchestratorAdapterConfig, transport?: SessionTransport);
    healthCheck(): Promise<OrchestratorHealth>;
    dispatch(request: DispatchRequest): Promise<DispatchResponse>;
    getJobStatus(externalJobId: string): Promise<JobStatus>;
    cancel(externalJobId: string): Promise<{
        success: boolean;
        message: string;
    }>;
    sendMessage(externalJobId: string, message: string): Promise<SendMessageResult>;
    getCompletionReport(externalJobId: string): Promise<CompletionReport | null>;
    shutdown(): Promise<void>;
    /**
     * Feed a pushed status update (from the session's POST to
     * `/api/orchestrator/status`) into the adapter's cache.
     */
    ingestStatus(externalJobId: string, update: StatusUpdate): void;
    /**
     * Feed a pushed completion report (from the session's POST to
     * `/api/orchestrator/complete`) into the adapter's cache.
     */
    ingestCompletion(externalJobId: string, report: CompletionReport): void;
}
/**
 * Create a session-native adapter. Pass a custom transport to target a
 * specific dispatch surface; otherwise an HttpSessionTransport is built from
 * `config.sessionApiUrl`.
 */
declare function createClaudeSessionAdapter(config: OrchestratorAdapterConfig, transport?: SessionTransport): ClaudeSessionAdapter;

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
    private sessionTransport?;
    constructor(config: OrchestratorAdapterConfig, sessionTransport?: SessionTransport);
    /**
     * Create the appropriate adapter based on mode
     */
    private createAdapter;
    /**
     * Whether the active adapter receives progress via pushed callbacks. When
     * true, the StatusPoller should not track its sessions.
     */
    get isPushBased(): boolean;
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
     * Ingest a pushed status update from a session callback
     * (`/api/orchestrator/status`). For push-based adapters this replaces the
     * poll loop: the payload is cached on the adapter and re-emitted as a
     * `job:progress` event to SSE subscribers. No-op mapping if the session is
     * unknown. Safe to call for non-push adapters (falls through to event only).
     */
    ingestStatusUpdate(update: StatusUpdate): void;
    /**
     * Ingest a pushed completion report from a session callback
     * (`/api/orchestrator/complete`). Caches it on the adapter (so
     * getCompletionReport can serve it) and finalizes the session.
     */
    ingestCompletionReport(report: CompletionReport): void;
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
declare function initOrchestratorService(config: OrchestratorAdapterConfig, sessionTransport?: SessionTransport): OrchestratorService;
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
type index_ClaudeSessionAdapter = ClaudeSessionAdapter;
declare const index_ClaudeSessionAdapter: typeof ClaudeSessionAdapter;
type index_CompletionReport = CompletionReport;
type index_CreateSessionParams = CreateSessionParams;
type index_CreateSessionResult = CreateSessionResult;
type index_DispatchRequest = DispatchRequest;
type index_DispatchResponse = DispatchResponse;
type index_HttpSessionTransport = HttpSessionTransport;
declare const index_HttpSessionTransport: typeof HttpSessionTransport;
type index_IOrchestratorAdapter = IOrchestratorAdapter;
type index_IPushCapableAdapter = IPushCapableAdapter;
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
type index_SessionTransport = SessionTransport;
type index_StatusPoller = StatusPoller;
declare const index_StatusPoller: typeof StatusPoller;
type index_StatusPollerConfig = StatusPollerConfig;
type index_StatusUpdate = StatusUpdate;
type index_TaskSpec = TaskSpec;
declare const index_buildDispatchRequest: typeof buildDispatchRequest;
declare const index_createAoCliAdapter: typeof createAoCliAdapter;
declare const index_createClaudeSessionAdapter: typeof createClaudeSessionAdapter;
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
declare const index_isPushCapableAdapter: typeof isPushCapableAdapter;
declare const index_isStatusPollerInitialized: typeof isStatusPollerInitialized;
declare namespace index {
  export { index_AoCliAdapter as AoCliAdapter, index_ClaudeSessionAdapter as ClaudeSessionAdapter, type index_CompletionReport as CompletionReport, type index_CreateSessionParams as CreateSessionParams, type index_CreateSessionResult as CreateSessionResult, type index_DispatchRequest as DispatchRequest, type index_DispatchResponse as DispatchResponse, index_HttpSessionTransport as HttpSessionTransport, type index_IOrchestratorAdapter as IOrchestratorAdapter, type index_IPushCapableAdapter as IPushCapableAdapter, type index_JobStatus as JobStatus, type index_OrchestratorAdapterConfig as OrchestratorAdapterConfig, index_OrchestratorClient as OrchestratorClient, type index_OrchestratorConfig as OrchestratorConfig, type index_OrchestratorEvent as OrchestratorEvent, type index_OrchestratorEventCallback as OrchestratorEventCallback, type index_OrchestratorEventType as OrchestratorEventType, type index_OrchestratorHealth as OrchestratorHealth, type index_OrchestratorMode as OrchestratorMode, index_OrchestratorService as OrchestratorService, type index_SendMessageResult as SendMessageResult, type index_SessionTransport as SessionTransport, index_StatusPoller as StatusPoller, type index_StatusPollerConfig as StatusPollerConfig, type index_StatusUpdate as StatusUpdate, type index_TaskSpec as TaskSpec, index_buildDispatchRequest as buildDispatchRequest, index_createAoCliAdapter as createAoCliAdapter, index_createClaudeSessionAdapter as createClaudeSessionAdapter, index_getOrchestratorClient as getOrchestratorClient, index_getOrchestratorService as getOrchestratorService, index_getOrchestratorServiceOrNull as getOrchestratorServiceOrNull, index_getStatusPoller as getStatusPoller, index_getStatusPollerOrNull as getStatusPollerOrNull, index_initOrchestratorClient as initOrchestratorClient, index_initOrchestratorService as initOrchestratorService, index_initStatusPoller as initStatusPoller, index_isOrchestratorConfigured as isOrchestratorConfigured, index_isOrchestratorServiceInitialized as isOrchestratorServiceInitialized, index_isPushCapableAdapter as isPushCapableAdapter, index_isStatusPollerInitialized as isStatusPollerInitialized };
}

export { AoCliAdapter as A, initOrchestratorClient as B, ClaudeSessionAdapter as C, type DispatchRequest as D, initOrchestratorService as E, initStatusPoller as F, isOrchestratorConfigured as G, HttpSessionTransport as H, type IOrchestratorAdapter as I, type JobStatus as J, isOrchestratorServiceInitialized as K, isPushCapableAdapter as L, isStatusPollerInitialized as M, type OrchestratorAdapterConfig as O, type SendMessageResult as S, type TaskSpec as T, type CompletionReport as a, type CreateSessionParams as b, type CreateSessionResult as c, type DispatchResponse as d, type IPushCapableAdapter as e, OrchestratorClient as f, type OrchestratorConfig as g, type OrchestratorEvent as h, index as i, type OrchestratorEventCallback as j, type OrchestratorEventType as k, type OrchestratorHealth as l, type OrchestratorMode as m, OrchestratorService as n, type SessionTransport as o, StatusPoller as p, type StatusPollerConfig as q, type StatusUpdate as r, buildDispatchRequest as s, createAoCliAdapter as t, createClaudeSessionAdapter as u, getOrchestratorClient as v, getOrchestratorService as w, getOrchestratorServiceOrNull as x, getStatusPoller as y, getStatusPollerOrNull as z };
