import { g as OrchestratorConfig, O as OrchestratorHealth, D as DispatchRequest, a as DispatchResponse, C as CompletionReport, f as GraphAffectedTestsOutcome, e as GraphAffectedTestsRequest, d as GraphDependentsOutcome, G as GraphDependentsRequest, c as IntegrateOutcome, b as IntegrateRequest, h as IntegrationResult, I as IsolationSupport, S as StatusUpdate, T as TaskIsolation, i as TaskSpec } from './types-CbuwQ_x5.mjs';
import { I as IOrchestratorAdapter, O as OrchestratorMode, a as OrchestratorAdapterConfig, J as JobStatus, S as SendMessageResult, b as OrchestratorService, C as CODE_GRAPH_CAPABILITY, c as ClaudeSessionAdapter, d as CreateSessionParams, e as CreateSessionResult, G as GRAPH_TIMEOUT_MS, H as HttpSessionTransport, f as IPushCapableAdapter, g as ISOLATION_CAPABILITY, h as OrchestratorEvent, i as OrchestratorEventCallback, j as OrchestratorEventType, k as SessionTransport, l as createClaudeSessionAdapter, m as getOrchestratorService, n as getOrchestratorServiceOrNull, o as initOrchestratorService, p as isOrchestratorServiceInitialized, q as isPushCapableAdapter } from './service-D5M864nu.mjs';

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
     * Fetch the completion report for a finished job.
     *
     * The ao-cli and claude-session adapters both implement this; the HTTP
     * adapter did not, and `OrchestratorAdapter.getCompletionReport` is optional —
     * so StatusPoller.handleCompletion received null and NEVER invoked its
     * onComplete callback. In practice that meant an http-mode job could run to
     * completion locally and the host would never be told: the session sat at its
     * last polled status forever.
     *
     * Returns null (rather than throwing) when the job is unknown or not yet
     * finished, which is what the poller expects.
     */
    getCompletionReport(externalJobId: string): Promise<CompletionReport | null>;
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
 * time: the task, what the whole item is for, the files in scope, the tests a
 * code graph reaches from them (when there is one), what the tasks before it
 * reported, and how the session should finish.
 *
 * How it should finish depends on who reports to DevPilot (§7.2 allows either
 * "the session (or runner on its behalf)"), and that is the `reporting` input:
 *
 * - `'runner'` — the session runner reports status and completion itself, from
 *   the process exit code, `claude`'s result envelope and the repo's git state.
 *   The agent is asked only for a good final message, because the runner sends
 *   that message as the completion summary.
 * - `'agent'` — the session is told to `curl` the callbacks itself: the
 *   original Reporting Protocol section, unchanged.
 *
 * The prompt used to carry the Reporting Protocol unconditionally. On the
 * runner path that instruction could not work — the token is a literal
 * `<callback-token>` placeholder and the permission mode denies the `curl` —
 * and it was not harmless either. In one run database 19 of 20 worker sessions
 * spent turns attempting it, and 16 of the 20 completion summaries were about
 * the failed callback rather than the work. Those summaries are what the next
 * wave receives as "Context From Predecessors", so the instruction wasted turns
 * in every session and then poisoned the handoff between them.
 */

/** Who tells DevPilot how a session is going. See the module comment. */
type SessionReporting = 'runner' | 'agent';
interface SessionPromptPredecessor {
    taskCode: string;
    description: string;
    filesModified: string[];
    /**
     * What `filesModified` actually holds.
     *
     * - `'changed'` — what git says the task's branch changed, from the commit
     *   it was cut from to its head. Only an isolated task has this. Exact: an
     *   empty list means the task changed nothing.
     * - `'touched'` — files the runner observed the session write to, as of its
     *   last status report. Real, but possibly short of the final few edits.
     * - `'scoped'` — the files the plan assigned to the task. Nothing checked
     *   that the task stayed inside them, or touched them at all.
     *
     * Defaults to `'scoped'`. That is what the one caller has always passed, and
     * the prompt nevertheless presented it as "Files modified".
     */
    filesSource?: 'changed' | 'touched' | 'scoped';
    completionSummary: string;
}
/** The horizon item a task belongs to: what the work as a whole is for. */
interface SessionPromptGoal {
    title: string;
    /** The ticket body. Untrusted text; rendered as a labelled block. */
    description?: string | null;
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
    /**
     * Who reports status and completion. Defaults to `'agent'`, which is what
     * this function did before the option existed; pass `'runner'` when the
     * session runner reports on the session's behalf.
     */
    reporting?: SessionReporting;
    /**
     * The item this task is one part of. Without it a worker is handed a
     * one-sentence task and no idea what the work around it is for.
     */
    goal?: SessionPromptGoal;
    /**
     * True when the predecessors' work is actually in the checkout this session
     * will be given: the plan is isolated, and every predecessor listed has been
     * merged into the branch this task's worktree is cut from.
     *
     * The prompt then says so. Left false or absent it says only that they
     * completed — which is all that is known in a shared checkout, where a
     * predecessor's edits are there unless something has since written over
     * them, and nothing checked.
     */
    predecessorsMerged?: boolean;
    /**
     * Test files reached from the files in `fileScope`, when a code graph could
     * say (TRD 27 §5.2). The first `MAX_REACHED_TESTS_LISTED` are listed.
     *
     * Absent or empty adds nothing: the prompt is then, byte for byte, the one
     * built before this field existed — which is every prompt for a repository
     * with no index.
     */
    reachedTests?: string[];
    /** True when the list handed in was itself cut short, so "all of them" cannot be claimed. */
    reachedTestsTruncated?: boolean;
}
/** How many reached tests a worker is shown. The rest are counted, not listed. */
declare const MAX_REACHED_TESTS_LISTED = 10;
/**
 * Which reporting mode an orchestrator mode needs.
 *
 * - `claude-session`: the session runner reports on the agent's behalf (see
 *   the header of the CLI's `session-runner/claude-runner.ts`), so the agent
 *   is not asked to.
 * - `ao-cli`, `http`: kept on agent reporting. Both are also polled, and the
 *   module comment here used to call the section "harmless" for ao-cli — but
 *   neither the `ao` CLI nor a remote HTTP orchestrator is code in this
 *   repository, so nothing here can show that their completions do not lean on
 *   the session's own report. Until something does, their prompt is unchanged.
 */
declare function sessionReportingForMode(mode: OrchestratorMode): SessionReporting;
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
    private isPolling;
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
    private pollOnce;
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
declare const index_CODE_GRAPH_CAPABILITY: typeof CODE_GRAPH_CAPABILITY;
declare const index_ClaudeSessionAdapter: typeof ClaudeSessionAdapter;
declare const index_CompletionReport: typeof CompletionReport;
declare const index_CreateSessionParams: typeof CreateSessionParams;
declare const index_CreateSessionResult: typeof CreateSessionResult;
declare const index_DispatchRequest: typeof DispatchRequest;
declare const index_DispatchResponse: typeof DispatchResponse;
declare const index_GRAPH_TIMEOUT_MS: typeof GRAPH_TIMEOUT_MS;
declare const index_GraphAffectedTestsOutcome: typeof GraphAffectedTestsOutcome;
declare const index_GraphAffectedTestsRequest: typeof GraphAffectedTestsRequest;
declare const index_GraphDependentsOutcome: typeof GraphDependentsOutcome;
declare const index_GraphDependentsRequest: typeof GraphDependentsRequest;
declare const index_HttpSessionTransport: typeof HttpSessionTransport;
declare const index_IOrchestratorAdapter: typeof IOrchestratorAdapter;
declare const index_IPushCapableAdapter: typeof IPushCapableAdapter;
declare const index_ISOLATION_CAPABILITY: typeof ISOLATION_CAPABILITY;
declare const index_IntegrateOutcome: typeof IntegrateOutcome;
declare const index_IntegrateRequest: typeof IntegrateRequest;
declare const index_IntegrationResult: typeof IntegrationResult;
declare const index_IsolationSupport: typeof IsolationSupport;
declare const index_JobStatus: typeof JobStatus;
declare const index_MAX_REACHED_TESTS_LISTED: typeof MAX_REACHED_TESTS_LISTED;
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
type index_SessionPromptGoal = SessionPromptGoal;
type index_SessionPromptInput = SessionPromptInput;
type index_SessionPromptPredecessor = SessionPromptPredecessor;
type index_SessionReporting = SessionReporting;
declare const index_SessionTransport: typeof SessionTransport;
type index_StatusPoller = StatusPoller;
declare const index_StatusPoller: typeof StatusPoller;
type index_StatusPollerConfig = StatusPollerConfig;
declare const index_StatusUpdate: typeof StatusUpdate;
declare const index_TaskIsolation: typeof TaskIsolation;
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
declare const index_sessionReportingForMode: typeof sessionReportingForMode;
declare namespace index {
  export { index_AoCliAdapter as AoCliAdapter, index_CODE_GRAPH_CAPABILITY as CODE_GRAPH_CAPABILITY, index_ClaudeSessionAdapter as ClaudeSessionAdapter, index_CompletionReport as CompletionReport, index_CreateSessionParams as CreateSessionParams, index_CreateSessionResult as CreateSessionResult, index_DispatchRequest as DispatchRequest, index_DispatchResponse as DispatchResponse, index_GRAPH_TIMEOUT_MS as GRAPH_TIMEOUT_MS, index_GraphAffectedTestsOutcome as GraphAffectedTestsOutcome, index_GraphAffectedTestsRequest as GraphAffectedTestsRequest, index_GraphDependentsOutcome as GraphDependentsOutcome, index_GraphDependentsRequest as GraphDependentsRequest, index_HttpSessionTransport as HttpSessionTransport, index_IOrchestratorAdapter as IOrchestratorAdapter, index_IPushCapableAdapter as IPushCapableAdapter, index_ISOLATION_CAPABILITY as ISOLATION_CAPABILITY, index_IntegrateOutcome as IntegrateOutcome, index_IntegrateRequest as IntegrateRequest, index_IntegrationResult as IntegrationResult, index_IsolationSupport as IsolationSupport, index_JobStatus as JobStatus, index_MAX_REACHED_TESTS_LISTED as MAX_REACHED_TESTS_LISTED, index_OrchestratorAdapterConfig as OrchestratorAdapterConfig, index_OrchestratorClient as OrchestratorClient, index_OrchestratorConfig as OrchestratorConfig, index_OrchestratorEvent as OrchestratorEvent, index_OrchestratorEventCallback as OrchestratorEventCallback, index_OrchestratorEventType as OrchestratorEventType, index_OrchestratorHealth as OrchestratorHealth, index_OrchestratorMode as OrchestratorMode, index_OrchestratorService as OrchestratorService, index_SendMessageResult as SendMessageResult, type index_SessionPromptGoal as SessionPromptGoal, type index_SessionPromptInput as SessionPromptInput, type index_SessionPromptPredecessor as SessionPromptPredecessor, type index_SessionReporting as SessionReporting, index_SessionTransport as SessionTransport, index_StatusPoller as StatusPoller, type index_StatusPollerConfig as StatusPollerConfig, index_StatusUpdate as StatusUpdate, index_TaskIsolation as TaskIsolation, index_TaskSpec as TaskSpec, index_buildDispatchRequest as buildDispatchRequest, index_buildSessionPrompt as buildSessionPrompt, index_createAoCliAdapter as createAoCliAdapter, index_createClaudeSessionAdapter as createClaudeSessionAdapter, index_createDbStatusPollerCallbacks as createDbStatusPollerCallbacks, index_getOrchestratorClient as getOrchestratorClient, index_getOrchestratorService as getOrchestratorService, index_getOrchestratorServiceOrNull as getOrchestratorServiceOrNull, index_getStatusPoller as getStatusPoller, index_getStatusPollerOrNull as getStatusPollerOrNull, index_initOrchestratorClient as initOrchestratorClient, index_initOrchestratorService as initOrchestratorService, index_initStatusPoller as initStatusPoller, index_isOrchestratorConfigured as isOrchestratorConfigured, index_isOrchestratorServiceInitialized as isOrchestratorServiceInitialized, index_isPushCapableAdapter as isPushCapableAdapter, index_isStatusPollerInitialized as isStatusPollerInitialized, index_sessionReportingForMode as sessionReportingForMode };
}

export { AoCliAdapter as A, MAX_REACHED_TESTS_LISTED as M, OrchestratorClient as O, type SessionPromptGoal as S, type SessionPromptInput as a, type SessionPromptPredecessor as b, type SessionReporting as c, StatusPoller as d, type StatusPollerConfig as e, buildDispatchRequest as f, buildSessionPrompt as g, createAoCliAdapter as h, index as i, createDbStatusPollerCallbacks as j, getOrchestratorClient as k, getStatusPoller as l, getStatusPollerOrNull as m, initOrchestratorClient as n, initStatusPoller as o, isOrchestratorConfigured as p, isStatusPollerInitialized as q, sessionReportingForMode as s };
