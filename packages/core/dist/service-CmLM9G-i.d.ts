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
    sessionApiKey?: string;
    sessionEnvironmentId?: string;
    callbackToken?: string;
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
 * Claude Session Adapter (session-native)
 *
 * Implements IOrchestratorAdapter by dispatching work to managed Claude Code
 * sessions instead of shelling out to the `ao` CLI. Unlike the legacy
 * `ao-cli` adapter, this adapter is PUSH-BASED: the running session reports
 * progress and completion back to DevPilot's callback endpoints
 * (`/api/orchestrator/status`, `/api/orchestrator/complete`). There is no poll
 * loop and no stdout scraping.
 *
 * The dispatcher/callback wire contract this transport implements is defined
 * normatively in spec/trd/01-TIER1-EXECUTION-LOOP.md §7. The concrete session
 * runner behind `DEVPILOT_SESSION_API_URL` (hosted DevPilot bridge, local
 * session-runner daemon, etc.) is environment-specific and lives behind the
 * `SessionTransport` interface; `HttpSessionTransport` is the default that
 * speaks the §7.1 `/v1` HTTP API.
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
    /** Shared secret the session echoes as X-DevPilot-Callback-Token (§7.2). */
    callbackToken?: string;
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
 * Default transport speaking the §7.1 dispatcher API over HTTP. All routes are
 * versioned under `/v1`; auth is `Authorization: Bearer <sessionApiKey>`.
 */
declare class HttpSessionTransport implements SessionTransport {
    private readonly baseUrl;
    private readonly apiKey?;
    private readonly timeoutMs;
    constructor(baseUrl: string, apiKey?: string | undefined, timeoutMs?: number);
    /** Extract the runner's session id from a create/idempotent response body. */
    private static readExternalId;
    createSession(params: CreateSessionParams): Promise<CreateSessionResult>;
    sendMessage(externalSessionId: string, message: string): Promise<{
        success: boolean;
        error: string;
    } | {
        success: boolean;
        error?: undefined;
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

export { type CompletionReport as C, type DispatchRequest as D, HttpSessionTransport as H, type IOrchestratorAdapter as I, type JobStatus as J, type OrchestratorConfig as O, type SendMessageResult as S, type TaskSpec as T, type OrchestratorHealth as a, type DispatchResponse as b, type OrchestratorMode as c, type OrchestratorAdapterConfig as d, OrchestratorService as e, ClaudeSessionAdapter as f, type CreateSessionParams as g, type CreateSessionResult as h, type IPushCapableAdapter as i, type OrchestratorEvent as j, type OrchestratorEventCallback as k, type OrchestratorEventType as l, type SessionTransport as m, type StatusUpdate as n, createClaudeSessionAdapter as o, getOrchestratorService as p, getOrchestratorServiceOrNull as q, initOrchestratorService as r, isOrchestratorServiceInitialized as s, isPushCapableAdapter as t };
