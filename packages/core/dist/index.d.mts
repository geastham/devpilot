export { ActivityEvent, CompletedTask, Complexity, ConductorScore, ConflictingFile, Database, DatabaseConfig, EventType, FileStatus, HorizonItem, InFlightFile, Model, NewActivityEvent, NewCompletedTask, NewConductorScore, NewConflictingFile, NewHorizonItem, NewInFlightFile, NewPlan, NewRufloSession, NewScoreHistory, NewTask, NewTouchedFile, NewWorkstream, OrchestratorMode, Plan, PostgresDatabase, RufloSession, SQLiteDatabase, ScoreHistory, SessionStatus, Task, TouchedFile, Workstream, Zone, activityEvents, closeDatabase, completedTasks, completedTasksRelations, complexityValues, conductorScores, conductorScoresRelations, conflictingFiles, conflictingFilesRelations, createDatabase, databaseConfigSchema, eventTypeValues, fileStatusValues, getDatabase, getDatabaseConfig, horizonItems, horizonItemsRelations, inFlightFiles, inFlightFilesRelations, initDatabase, modelValues, orchestratorModeValues, plans, plansRelations, resetDatabase, rufloSessions, rufloSessionsRelations, scoreHistory, scoreHistoryRelations, sessionStatusValues, tasks, tasksRelations, touchedFiles, touchedFilesRelations, workstreams, workstreamsRelations, zoneValues } from './db/index.mjs';
import { LinearClient } from '@linear/sdk';
export { i as orchestrator } from './index-D-MH25FF.mjs';
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

type index_CreateIssueInput = CreateIssueInput;
type index_DevPilotLinearClient = DevPilotLinearClient;
declare const index_DevPilotLinearClient: typeof DevPilotLinearClient;
type index_DispatchIntent = DispatchIntent;
type index_LinearConfig = LinearConfig;
type index_LinearIssue = LinearIssue;
type index_LinearWebhookPayload = LinearWebhookPayload;
type index_SessionCompletionSync = SessionCompletionSync;
type index_SessionProgressUpdate = SessionProgressUpdate;
type index_SessionToLinearSync = SessionToLinearSync;
type index_SyncResult = SyncResult;
type index_UpdateIssueInput = UpdateIssueInput;
declare const index_getLinearClient: typeof getLinearClient;
declare const index_handleLinearWebhook: typeof handleLinearWebhook;
declare const index_initLinearClient: typeof initLinearClient;
declare const index_isLinearConfigured: typeof isLinearConfigured;
declare const index_syncCompletionToLinear: typeof syncCompletionToLinear;
declare const index_syncProgressToLinear: typeof syncProgressToLinear;
declare const index_syncSessionToLinear: typeof syncSessionToLinear;
declare const index_verifyLinearWebhookSignature: typeof verifyLinearWebhookSignature;
declare namespace index {
  export { type index_CreateIssueInput as CreateIssueInput, index_DevPilotLinearClient as DevPilotLinearClient, type index_DispatchIntent as DispatchIntent, type index_LinearConfig as LinearConfig, type index_LinearIssue as LinearIssue, type index_LinearWebhookPayload as LinearWebhookPayload, type index_SessionCompletionSync as SessionCompletionSync, type index_SessionProgressUpdate as SessionProgressUpdate, type index_SessionToLinearSync as SessionToLinearSync, type index_SyncResult as SyncResult, type index_UpdateIssueInput as UpdateIssueInput, index_getLinearClient as getLinearClient, index_handleLinearWebhook as handleLinearWebhook, index_initLinearClient as initLinearClient, index_isLinearConfigured as isLinearConfigured, index_syncCompletionToLinear as syncCompletionToLinear, index_syncProgressToLinear as syncProgressToLinear, index_syncSessionToLinear as syncSessionToLinear, index_verifyLinearWebhookSignature as verifyLinearWebhookSignature };
}

declare const VERSION = "0.1.0";

export { VERSION, index as linear };
