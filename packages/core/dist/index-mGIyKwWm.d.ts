import { O as OrchestratorConfig, a as OrchestratorHealth, D as DispatchRequest, b as DispatchResponse, I as IOrchestratorAdapter, c as OrchestratorMode, d as OrchestratorAdapterConfig, J as JobStatus, S as SendMessageResult, C as CompletionReport, e as OrchestratorService, f as ClaudeSessionAdapter, g as CreateSessionParams, h as CreateSessionResult, H as HttpSessionTransport, i as IPushCapableAdapter, j as OrchestratorEvent, k as OrchestratorEventCallback, l as OrchestratorEventType, m as SessionTransport, n as StatusUpdate, T as TaskSpec, o as createClaudeSessionAdapter, p as getOrchestratorService, q as getOrchestratorServiceOrNull, r as initOrchestratorService, s as isOrchestratorServiceInitialized, t as isPushCapableAdapter } from './service-CmLM9G-i.js';

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
 * Session prompt envelope (spec/trd/01-TIER1-EXECUTION-LOOP.md §7.3).
 *
 * Composes the markdown task prompt handed to a Claude Code session at dispatch
 * time. The critical piece is the Reporting Protocol section: it tells the
 * session exactly how to POST status/completion callbacks (§7.2) so DevPilot's
 * ExecutionBridge learns when the wave task finishes. The same text is reused
 * verbatim for the `ao-cli` fallback (where the reporting section is harmless —
 * the ao poller supersedes it).
 */
interface SessionPromptPredecessor {
    taskCode: string;
    description: string;
    filesModified: string[];
    completionSummary: string;
}
interface SessionPromptInput {
    taskDescription: string;
    repo: string;
    fileScope: string[];
    predecessorContext: SessionPromptPredecessor[];
    acceptanceCriteria?: string[];
    constraints?: string[];
    callbackUrl: string;
    sessionId: string;
}
/**
 * Build the composed task prompt for a session dispatch.
 */
declare function buildSessionPrompt(input: SessionPromptInput): string;

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
 * Shared host wiring (spec/trd/01-TIER1-EXECUTION-LOOP.md §6.7).
 *
 * The Next app (src/lib/orchestrator.ts) and the CLI Fastify server
 * (packages/cli/src/server/index.ts) both drive the same status-poller
 * callbacks that write session progress/completion back to the database.
 * Extracting them here keeps the two hosts identical and avoids drift.
 */

/**
 * Build the DB-updating status-poller callbacks (session-level progress /
 * completion / error), resolving the database lazily via getDatabase().
 */
declare function createDbStatusPollerCallbacks(): Pick<StatusPollerConfig, 'onStatusUpdate' | 'onComplete' | 'onError'>;

/**
 * Orchestrator bridge module
 */

type index_AoCliAdapter = AoCliAdapter;
declare const index_AoCliAdapter: typeof AoCliAdapter;
declare const index_ClaudeSessionAdapter: typeof ClaudeSessionAdapter;
declare const index_CompletionReport: typeof CompletionReport;
declare const index_CreateSessionParams: typeof CreateSessionParams;
declare const index_CreateSessionResult: typeof CreateSessionResult;
declare const index_DispatchRequest: typeof DispatchRequest;
declare const index_DispatchResponse: typeof DispatchResponse;
declare const index_HttpSessionTransport: typeof HttpSessionTransport;
declare const index_IOrchestratorAdapter: typeof IOrchestratorAdapter;
declare const index_IPushCapableAdapter: typeof IPushCapableAdapter;
declare const index_JobStatus: typeof JobStatus;
declare const index_OrchestratorAdapterConfig: typeof OrchestratorAdapterConfig;
type index_OrchestratorClient = OrchestratorClient;
declare const index_OrchestratorClient: typeof OrchestratorClient;
declare const index_OrchestratorConfig: typeof OrchestratorConfig;
declare const index_OrchestratorEvent: typeof OrchestratorEvent;
declare const index_OrchestratorEventCallback: typeof OrchestratorEventCallback;
declare const index_OrchestratorEventType: typeof OrchestratorEventType;
declare const index_OrchestratorHealth: typeof OrchestratorHealth;
declare const index_OrchestratorMode: typeof OrchestratorMode;
declare const index_OrchestratorService: typeof OrchestratorService;
declare const index_SendMessageResult: typeof SendMessageResult;
type index_SessionPromptInput = SessionPromptInput;
type index_SessionPromptPredecessor = SessionPromptPredecessor;
declare const index_SessionTransport: typeof SessionTransport;
type index_StatusPoller = StatusPoller;
declare const index_StatusPoller: typeof StatusPoller;
type index_StatusPollerConfig = StatusPollerConfig;
declare const index_StatusUpdate: typeof StatusUpdate;
declare const index_TaskSpec: typeof TaskSpec;
declare const index_buildDispatchRequest: typeof buildDispatchRequest;
declare const index_buildSessionPrompt: typeof buildSessionPrompt;
declare const index_createAoCliAdapter: typeof createAoCliAdapter;
declare const index_createClaudeSessionAdapter: typeof createClaudeSessionAdapter;
declare const index_createDbStatusPollerCallbacks: typeof createDbStatusPollerCallbacks;
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
  export { index_AoCliAdapter as AoCliAdapter, index_ClaudeSessionAdapter as ClaudeSessionAdapter, index_CompletionReport as CompletionReport, index_CreateSessionParams as CreateSessionParams, index_CreateSessionResult as CreateSessionResult, index_DispatchRequest as DispatchRequest, index_DispatchResponse as DispatchResponse, index_HttpSessionTransport as HttpSessionTransport, index_IOrchestratorAdapter as IOrchestratorAdapter, index_IPushCapableAdapter as IPushCapableAdapter, index_JobStatus as JobStatus, index_OrchestratorAdapterConfig as OrchestratorAdapterConfig, index_OrchestratorClient as OrchestratorClient, index_OrchestratorConfig as OrchestratorConfig, index_OrchestratorEvent as OrchestratorEvent, index_OrchestratorEventCallback as OrchestratorEventCallback, index_OrchestratorEventType as OrchestratorEventType, index_OrchestratorHealth as OrchestratorHealth, index_OrchestratorMode as OrchestratorMode, index_OrchestratorService as OrchestratorService, index_SendMessageResult as SendMessageResult, type index_SessionPromptInput as SessionPromptInput, type index_SessionPromptPredecessor as SessionPromptPredecessor, index_SessionTransport as SessionTransport, index_StatusPoller as StatusPoller, type index_StatusPollerConfig as StatusPollerConfig, index_StatusUpdate as StatusUpdate, index_TaskSpec as TaskSpec, index_buildDispatchRequest as buildDispatchRequest, index_buildSessionPrompt as buildSessionPrompt, index_createAoCliAdapter as createAoCliAdapter, index_createClaudeSessionAdapter as createClaudeSessionAdapter, index_createDbStatusPollerCallbacks as createDbStatusPollerCallbacks, index_getOrchestratorClient as getOrchestratorClient, index_getOrchestratorService as getOrchestratorService, index_getOrchestratorServiceOrNull as getOrchestratorServiceOrNull, index_getStatusPoller as getStatusPoller, index_getStatusPollerOrNull as getStatusPollerOrNull, index_initOrchestratorClient as initOrchestratorClient, index_initOrchestratorService as initOrchestratorService, index_initStatusPoller as initStatusPoller, index_isOrchestratorConfigured as isOrchestratorConfigured, index_isOrchestratorServiceInitialized as isOrchestratorServiceInitialized, index_isPushCapableAdapter as isPushCapableAdapter, index_isStatusPollerInitialized as isStatusPollerInitialized };
}

export { AoCliAdapter as A, OrchestratorClient as O, type SessionPromptInput as S, type SessionPromptPredecessor as a, StatusPoller as b, type StatusPollerConfig as c, buildDispatchRequest as d, buildSessionPrompt as e, createAoCliAdapter as f, createDbStatusPollerCallbacks as g, getOrchestratorClient as h, index as i, getStatusPoller as j, getStatusPollerOrNull as k, initOrchestratorClient as l, initStatusPoller as m, isOrchestratorConfigured as n, isStatusPollerInitialized as o };
