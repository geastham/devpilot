export { ActivityEvent, CompletedTask, Complexity, ConductorScore, ConflictingFile, Database, DatabaseConfig, EventType, FileStatus, HorizonItem, InFlightFile, Model, NewActivityEvent, NewCompletedTask, NewConductorScore, NewConflictingFile, NewHorizonItem, NewInFlightFile, NewPlan, NewRufloSession, NewScoreHistory, NewTask, NewTouchedFile, NewWorkstream, Plan, PostgresDatabase, RufloSession, SQLiteDatabase, ScoreHistory, SessionStatus, Task, TouchedFile, Workstream, Zone, activityEvents, closeDatabase, completedTasks, completedTasksRelations, complexityValues, conductorScores, conductorScoresRelations, conflictingFiles, conflictingFilesRelations, createDatabase, databaseConfigSchema, eventTypeValues, fileStatusValues, getDatabase, getDatabaseConfig, horizonItems, horizonItemsRelations, inFlightFiles, inFlightFilesRelations, initDatabase, modelValues, plans, plansRelations, resetDatabase, rufloSessions, rufloSessionsRelations, scoreHistory, scoreHistoryRelations, sessionStatusValues, tasks, tasksRelations, touchedFiles, touchedFilesRelations, workstreams, workstreamsRelations, zoneValues } from './db/index.js';
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
declare function handleLinearWebhook(payload: LinearWebhookPayload): Promise<{
    handled: boolean;
    action?: string;
}>;

/**
 * Linear integration module
 */

type index$1_CreateIssueInput = CreateIssueInput;
type index$1_DevPilotLinearClient = DevPilotLinearClient;
declare const index$1_DevPilotLinearClient: typeof DevPilotLinearClient;
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
declare namespace index$1 {
  export { type index$1_CreateIssueInput as CreateIssueInput, index$1_DevPilotLinearClient as DevPilotLinearClient, type index$1_LinearConfig as LinearConfig, type index$1_LinearIssue as LinearIssue, type index$1_LinearWebhookPayload as LinearWebhookPayload, type index$1_SessionCompletionSync as SessionCompletionSync, type index$1_SessionProgressUpdate as SessionProgressUpdate, type index$1_SessionToLinearSync as SessionToLinearSync, type index$1_SyncResult as SyncResult, type index$1_UpdateIssueInput as UpdateIssueInput, index$1_getLinearClient as getLinearClient, index$1_handleLinearWebhook as handleLinearWebhook, index$1_initLinearClient as initLinearClient, index$1_isLinearConfigured as isLinearConfigured, index$1_syncCompletionToLinear as syncCompletionToLinear, index$1_syncProgressToLinear as syncProgressToLinear, index$1_syncSessionToLinear as syncSessionToLinear };
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
    status: 'queued' | 'running' | 'waiting' | 'complete' | 'error';
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
 * Orchestrator bridge module
 */

type index_CompletionReport = CompletionReport;
type index_DispatchRequest = DispatchRequest;
type index_DispatchResponse = DispatchResponse;
type index_OrchestratorClient = OrchestratorClient;
declare const index_OrchestratorClient: typeof OrchestratorClient;
type index_OrchestratorConfig = OrchestratorConfig;
type index_OrchestratorHealth = OrchestratorHealth;
type index_StatusUpdate = StatusUpdate;
type index_TaskSpec = TaskSpec;
declare const index_buildDispatchRequest: typeof buildDispatchRequest;
declare const index_getOrchestratorClient: typeof getOrchestratorClient;
declare const index_initOrchestratorClient: typeof initOrchestratorClient;
declare const index_isOrchestratorConfigured: typeof isOrchestratorConfigured;
declare namespace index {
  export { type index_CompletionReport as CompletionReport, type index_DispatchRequest as DispatchRequest, type index_DispatchResponse as DispatchResponse, index_OrchestratorClient as OrchestratorClient, type index_OrchestratorConfig as OrchestratorConfig, type index_OrchestratorHealth as OrchestratorHealth, type index_StatusUpdate as StatusUpdate, type index_TaskSpec as TaskSpec, index_buildDispatchRequest as buildDispatchRequest, index_getOrchestratorClient as getOrchestratorClient, index_initOrchestratorClient as initOrchestratorClient, index_isOrchestratorConfigured as isOrchestratorConfigured };
}

declare const VERSION = "0.1.0";

export { VERSION, index$1 as linear, index as orchestrator };
