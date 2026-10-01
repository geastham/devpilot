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
    /**
     * Run this session as one task of a run, in its own git worktree, on its own
     * branch. Set by the wave dispatcher for a task of an isolated plan, and by
     * nothing else: a single dispatch from the fleet has no run to belong to.
     *
     * Only the `claude-session` adapter acts on it. The other modes do not
     * isolate, and the dispatcher never sets it for them.
     */
    isolation?: TaskIsolation;
    metadata?: Record<string, unknown>;
}
/** Which run a task belongs to, and which task of it this is. */
interface TaskIsolation {
    /** Groups the tasks of one run; the runner names the run branch after it. */
    runId: string;
    /** The task within the run, e.g. `2.1`; the runner names the task branch after it. */
    taskCode: string;
    /** One line describing the task, for the commit the runner makes. */
    title?: string;
}
/** `POST /v1/integrate`: merge these tasks' branches into the run branch. */
interface IntegrateRequest {
    repo: string;
    runId: string;
    /** Merged in this order, each on its own. */
    taskCodes: string[];
}
/** What the runner answers when a merge was carried out. */
interface IntegrationResult {
    runBranch: string;
    /** The run branch's head after the tasks that could be merged were. */
    headSha: string;
    merged: {
        taskCode: string;
        branch: string;
        commitSha: string;
        alreadyMerged: boolean;
    }[];
    /** Tasks whose branch did not merge. The run branch does not contain them. */
    conflicts: {
        taskCode: string;
        branch: string;
        files: string[];
    }[];
    /** Tasks the runner has no branch for. */
    missing: string[];
}
/**
 * The answer to an integrate call.
 *
 * `ok: false` is a failure of the merge itself — the run branch is checked out
 * somewhere, the runner is gone, git refused — as opposed to a task whose
 * branch conflicted, which is a successful answer with `conflicts` in it. The
 * difference matters to the caller: a conflict is one task's problem and that
 * task is retried, while this is nobody's task's fault and ends the run with
 * `message`, which is written for the person who has to act on it.
 */
type IntegrateOutcome = {
    ok: true;
    result: IntegrationResult;
} | {
    ok: false;
    code: string;
    message: string;
};
/** Whether tasks dispatched now can be isolated, and if not, why not. */
interface IsolationSupport {
    supported: boolean;
    /** Present when `supported` is false. Recorded on the plan and shown to a person. */
    reason?: string;
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
    /**
     * Live picture of what the agent is doing, when the runner can supply one.
     *
     * Optional because this contract predates it: a runner built before
     * `stream-json` reports status without telemetry, and the cockpit must keep
     * accepting those rather than treating a missing instrument as an error.
     */
    telemetry?: {
        toolCalls?: number;
        filesTouched?: string[];
        filesRead?: string[];
        commands?: string[];
        lastText?: string;
        lastAction?: {
            tool: string;
            path?: string;
            atMs: number;
        };
        actions?: {
            tool: string;
            path?: string;
            atMs: number;
        }[];
        costUsd?: number;
        tokensIn?: number;
        tokensOut?: number;
        turns?: number;
        elapsedMs?: number;
        idleMs?: number;
    };
    timestamp: string;
}
/**
 * Completion report received when orchestrator finishes a task
 */
interface CompletionReport {
    sessionId: string;
    success: boolean;
    prUrl?: string;
    /**
     * For an isolated task, the head of its branch. Otherwise the checkout's
     * HEAD when the session ended, which the session may or may not have moved.
     */
    commitSha?: string;
    /** The task's branch. Present only when the task was isolated. */
    branch?: string;
    /** The commit the task's branch was cut from. Present only when isolated. */
    baseSha?: string;
    /**
     * For an isolated task these three are git's diff from `baseSha` to
     * `commitSha` and are exact. Otherwise the runner compares two `git status`
     * readings of a checkout other agents may be writing to.
     */
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
     * Whether a task dispatched through this adapter can be given its own
     * worktree and branch (`DispatchRequest.isolation`).
     *
     * Optional, and absent means no: only `claude-session` implements it. The
     * wave dispatcher asks once per plan, before the plan's first task, and the
     * answer is recorded on the plan — see `WaveDispatchCoordinator`.
     */
    isolationSupport?(): Promise<IsolationSupport>;
    /**
     * Merge a wave's task branches into the run branch. Only meaningful where
     * `isolationSupport` is.
     */
    integrate?(request: IntegrateRequest): Promise<IntegrateOutcome>;
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

/** The `/v1/health` capability a runner reports when it can isolate a task. */
declare const ISOLATION_CAPABILITY = "isolation";
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
    /**
     * Give this session its own git worktree and branch — one task of a run.
     *
     * A transport MUST NOT send this to a runner that has not said it can do it.
     * A runner from before the capability ignores a field it does not know, so
     * the task would run in the shared checkout while everything upstream
     * believed it was isolated — and the merge at the end of the wave would then
     * find no branch. `HttpSessionTransport` checks; see `capabilities`.
     */
    isolation?: TaskIsolation;
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
    /**
     * Optional. What the runner says it can do beyond the original contract
     * (`/v1/health` → `capabilities`), or null when it could not be asked.
     *
     * Null is not the same as an empty list: an empty list is a runner that
     * answered and listed nothing, and null is no answer at all. A transport
     * without this method cannot isolate, and is treated as saying so.
     */
    capabilities?(): Promise<string[] | null>;
    /**
     * Optional. Merge a wave's task branches into the run branch
     * (`POST /v1/integrate`). Never rejects: a runner that cannot be reached is
     * an answer (`ok: false`), because the caller has to do something with it.
     */
    integrate?(request: IntegrateRequest): Promise<IntegrateOutcome>;
}
/**
 * Default transport speaking the §7.1 dispatcher API over HTTP. All routes are
 * versioned under `/v1`; auth is `Authorization: Bearer <sessionApiKey>`.
 */
declare class HttpSessionTransport implements SessionTransport {
    private readonly baseUrl;
    private readonly apiKey?;
    private readonly timeoutMs;
    /**
     * The runner's capabilities, once it has told us.
     *
     * Cached because every isolated create asks, and a wave is many creates. It
     * is dropped whenever the runner fails to do something it was asked — a
     * refused create, a failed merge, no answer at all — because the usual
     * reason a runner starts behaving differently is that it is a different
     * runner: restarted, upgraded, or put back to an older version. The next
     * question then goes to `/v1/health` again rather than to a memory of a
     * process that may no longer exist. A read that fails is never cached.
     */
    private knownCapabilities;
    constructor(baseUrl: string, apiKey?: string | undefined, timeoutMs?: number);
    /** Extract the runner's session id from a create/idempotent response body. */
    private static readExternalId;
    capabilities(): Promise<string[] | null>;
    createSession(params: CreateSessionParams): Promise<CreateSessionResult>;
    private static readRefusal;
    integrate(request: IntegrateRequest): Promise<IntegrateOutcome>;
    /** A merge result, if that is what the body is. Shape-checked: it is acted on. */
    private static readIntegration;
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
    /**
     * Whether the runner behind this adapter can give a task its own branch.
     *
     * Three ways to be told no, and each is worded for the person who will read
     * it on the plan: the transport has no way to ask or to merge; the runner did
     * not answer; the runner answered and does not list the capability.
     *
     * "Did not answer" is reported as unsupported rather than waited out. The
     * plan's first task is about to be sent to that same runner; if it really is
     * down the dispatch fails and says so, and if it was a blip the plan runs
     * un-isolated with this reason on its row. What it must not do is guess.
     */
    isolationSupport(): Promise<IsolationSupport>;
    integrate(request: IntegrateRequest): Promise<IntegrateOutcome>;
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
     * Whether a task dispatched now can be given its own worktree and branch.
     *
     * Only an adapter that says so can. `http` and `ao-cli` do not implement the
     * question and are answered for here — never isolated, and the reason says
     * which mode, so a plan row reading "not isolated" also says why.
     */
    isolationSupport(): Promise<IsolationSupport>;
    /**
     * Merge a wave's task branches into the run branch.
     *
     * Never rejects. Its one caller is the wave gate in
     * `WaveExecutionController`; nothing else should be merging a run.
     */
    integrate(request: IntegrateRequest): Promise<IntegrateOutcome>;
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
     *
     * Emits whether or not this process dispatched the session. It used to
     * return early when `sessionMappings` had no entry — and that map is process
     * memory, so after a restart it has no entry for anything still running.
     * Every completion that arrived after a restart was therefore swallowed
     * here: the callback route had already marked the session row COMPLETE, but
     * no `job:complete` was emitted, the ExecutionBridge never heard, and the
     * wave task stayed `dispatched` forever with its wave unable to end.
     *
     * The mapping is only the fast path to the external id. Subscribers key on
     * `sessionId` — the bridge resolves it to a wave task through the database —
     * and `ingestStatusUpdate` already falls back the same way. A duplicate is
     * harmless: subscribers apply a terminal report conditionally.
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

export { type CompletionReport as C, type DispatchRequest as D, HttpSessionTransport as H, type IOrchestratorAdapter as I, type JobStatus as J, type OrchestratorConfig as O, type SendMessageResult as S, type TaskIsolation as T, type OrchestratorHealth as a, type DispatchResponse as b, type OrchestratorMode as c, type OrchestratorAdapterConfig as d, OrchestratorService as e, ClaudeSessionAdapter as f, type CreateSessionParams as g, type CreateSessionResult as h, type IPushCapableAdapter as i, ISOLATION_CAPABILITY as j, type IntegrateOutcome as k, type IntegrateRequest as l, type IntegrationResult as m, type IsolationSupport as n, type OrchestratorEvent as o, type OrchestratorEventCallback as p, type OrchestratorEventType as q, type SessionTransport as r, type StatusUpdate as s, type TaskSpec as t, createClaudeSessionAdapter as u, getOrchestratorService as v, getOrchestratorServiceOrNull as w, initOrchestratorService as x, isOrchestratorServiceInitialized as y, isPushCapableAdapter as z };
