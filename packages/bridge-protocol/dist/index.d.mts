import { z } from 'zod';

/**
 * The bridge wire contract — TRD 05 §4.3.
 *
 * THIS IS THE SINGLE DEFINITION. Do not mirror, copy, or re-declare it.
 *
 * It used to be declared twice — once in packages/bridge/src/services/pubsub/types.ts
 * and once in packages/bridge-client/src/pubsub.ts — and the two drifted apart:
 * the shapes disagreed, and NEITHER carried `sessionId`, so a client that
 * received a dispatch had no key to report progress against. TRD 03 §4.4
 * instructed the two sides to keep duplicate copies in sync by hand; that
 * instruction is withdrawn. One published definition makes the whole class of
 * bug impossible.
 */
declare const TaskDispatchMessageSchema: z.ZodObject<{
    /** cuid2, assigned at enqueue time. */
    messageId: z.ZodString;
    /** dispatch_sessions.id — THE REPORT-BACK KEY. Without it a client cannot report progress. */
    sessionId: z.ZodString;
    /** dispatch_queue.id — the claim/settle key. */
    queueId: z.ZodString;
    orgId: z.ZodString;
    workspaceId: z.ZodString;
    linearIssueId: z.ZodString;
    /** e.g. 'ENG-394' */
    linearIdentifier: z.ZodString;
    title: z.ZodString;
    description: z.ZodOptional<z.ZodString>;
    teamId: z.ZodString;
    priority: z.ZodOptional<z.ZodNumber>;
    labels: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    repo: z.ZodString;
    /** Required — routing is resolved before enqueue, never by the client. */
    targetOrchestratorId: z.ZodString;
    /** ISO 8601 */
    dispatchedAt: z.ZodString;
}, "strip", z.ZodTypeAny, {
    messageId: string;
    sessionId: string;
    queueId: string;
    orgId: string;
    workspaceId: string;
    linearIssueId: string;
    linearIdentifier: string;
    title: string;
    teamId: string;
    repo: string;
    targetOrchestratorId: string;
    dispatchedAt: string;
    description?: string | undefined;
    priority?: number | undefined;
    labels?: string[] | undefined;
}, {
    messageId: string;
    sessionId: string;
    queueId: string;
    orgId: string;
    workspaceId: string;
    linearIssueId: string;
    linearIdentifier: string;
    title: string;
    teamId: string;
    repo: string;
    targetOrchestratorId: string;
    dispatchedAt: string;
    description?: string | undefined;
    priority?: number | undefined;
    labels?: string[] | undefined;
}>;
type TaskDispatchMessage = z.infer<typeof TaskDispatchMessageSchema>;
/** Parse an untrusted payload (queue row, poll response, realtime event). */
declare function parseTaskDispatchMessage(input: unknown): TaskDispatchMessage;
declare function safeParseTaskDispatchMessage(input: unknown): z.SafeParseReturnType<{
    messageId: string;
    sessionId: string;
    queueId: string;
    orgId: string;
    workspaceId: string;
    linearIssueId: string;
    linearIdentifier: string;
    title: string;
    teamId: string;
    repo: string;
    targetOrchestratorId: string;
    dispatchedAt: string;
    description?: string | undefined;
    priority?: number | undefined;
    labels?: string[] | undefined;
}, {
    messageId: string;
    sessionId: string;
    queueId: string;
    orgId: string;
    workspaceId: string;
    linearIssueId: string;
    linearIdentifier: string;
    title: string;
    teamId: string;
    repo: string;
    targetOrchestratorId: string;
    dispatchedAt: string;
    description?: string | undefined;
    priority?: number | undefined;
    labels?: string[] | undefined;
}>;

/**
 * The session status vocabulary — TRD 05.
 *
 * One list, shared by the CLI, the bridge, and the database CHECK constraint on
 * dispatch_sessions.status. If you add a value here you MUST add it to that
 * constraint in the same change, or writes will fail at runtime rather than at
 * compile time.
 */
declare const SESSION_STATUSES: readonly ["pending", "dispatched", "running", "complete", "error", "cancelled"];
declare const SessionStatusSchema: z.ZodEnum<["pending", "dispatched", "running", "complete", "error", "cancelled"]>;
type SessionStatus = z.infer<typeof SessionStatusSchema>;
declare const TERMINAL_STATUSES: readonly ["complete", "error", "cancelled"];
type TerminalStatus = (typeof TERMINAL_STATUSES)[number];
declare function isTerminal(status: SessionStatus): status is TerminalStatus;
declare const SESSION_EVENT_TYPES: readonly ["created", "dispatched", "progress", "complete", "error", "cancelled", "telemetry"];
declare const SessionEventTypeSchema: z.ZodEnum<["created", "dispatched", "progress", "complete", "error", "cancelled", "telemetry"]>;
type SessionEventType = z.infer<typeof SessionEventTypeSchema>;

/**
 * Request/response schemas for the bridge HTTP surface — TRD 05 §5.
 *
 * Both sides compile against these: the client serializes from them and the
 * bridge validates with them. That is what turns the historical
 * "register always 400s" defect — client sent { repos, maxConcurrentJobs },
 * bridge required `name` — into a compile error instead of a runtime failure
 * nobody saw until it was deployed.
 */
declare const RegisterRequestSchema: z.ZodObject<{
    /** REQUIRED. Its absence is the historical 400. Defaults to os.hostname() client-side. */
    name: z.ZodString;
    repos: z.ZodArray<z.ZodString, "many">;
    maxConcurrentJobs: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    name: string;
    repos: string[];
    maxConcurrentJobs: number;
}, {
    name: string;
    repos: string[];
    maxConcurrentJobs?: number | undefined;
}>;
type RegisterRequest = z.infer<typeof RegisterRequestSchema>;
declare const RealtimeCredentialsSchema: z.ZodObject<{
    /**
     * Everything the client needs to open the channel, returned by the bridge so
     * a machine does not have to be told out-of-band where the realtime endpoint
     * lives. Both URL and anon key are public by design — the dispatch_queue RLS
     * policy plus the scoped `jwt` are what constrain access.
     */
    supabaseUrl: z.ZodString;
    anonKey: z.ZodString;
    jwt: z.ZodString;
    expiresAt: z.ZodString;
    channel: z.ZodString;
    table: z.ZodString;
}, "strip", z.ZodTypeAny, {
    supabaseUrl: string;
    anonKey: string;
    jwt: string;
    expiresAt: string;
    channel: string;
    table: string;
}, {
    supabaseUrl: string;
    anonKey: string;
    jwt: string;
    expiresAt: string;
    channel: string;
    table: string;
}>;
declare const RegisterResponseSchema: z.ZodObject<{
    orchestratorId: z.ZodString;
    orgId: z.ZodString;
    /** null when SUPABASE_JWT_SECRET is unavailable — the client falls back to polling. */
    realtime: z.ZodNullable<z.ZodObject<{
        /**
         * Everything the client needs to open the channel, returned by the bridge so
         * a machine does not have to be told out-of-band where the realtime endpoint
         * lives. Both URL and anon key are public by design — the dispatch_queue RLS
         * policy plus the scoped `jwt` are what constrain access.
         */
        supabaseUrl: z.ZodString;
        anonKey: z.ZodString;
        jwt: z.ZodString;
        expiresAt: z.ZodString;
        channel: z.ZodString;
        table: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        supabaseUrl: string;
        anonKey: string;
        jwt: string;
        expiresAt: string;
        channel: string;
        table: string;
    }, {
        supabaseUrl: string;
        anonKey: string;
        jwt: string;
        expiresAt: string;
        channel: string;
        table: string;
    }>>;
}, "strip", z.ZodTypeAny, {
    orgId: string;
    orchestratorId: string;
    realtime: {
        supabaseUrl: string;
        anonKey: string;
        jwt: string;
        expiresAt: string;
        channel: string;
        table: string;
    } | null;
}, {
    orgId: string;
    orchestratorId: string;
    realtime: {
        supabaseUrl: string;
        anonKey: string;
        jwt: string;
        expiresAt: string;
        channel: string;
        table: string;
    } | null;
}>;
type RegisterResponse = z.infer<typeof RegisterResponseSchema>;
declare const HeartbeatRequestSchema: z.ZodObject<{
    activeJobs: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    activeJobs?: number | undefined;
}, {
    activeJobs?: number | undefined;
}>;
type HeartbeatRequest = z.infer<typeof HeartbeatRequestSchema>;
declare const SessionStatusUpdateSchema: z.ZodObject<{
    status: z.ZodEnum<["pending", "dispatched", "running", "complete", "error", "cancelled"]>;
    progressPercent: z.ZodNumber;
    message: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    status: "pending" | "dispatched" | "running" | "complete" | "error" | "cancelled";
    progressPercent: number;
    message?: string | undefined;
}, {
    status: "pending" | "dispatched" | "running" | "complete" | "error" | "cancelled";
    progressPercent: number;
    message?: string | undefined;
}>;
type SessionStatusUpdate = z.infer<typeof SessionStatusUpdateSchema>;
declare const SessionCompleteSchema: z.ZodObject<{
    success: z.ZodBoolean;
    prUrl: z.ZodOptional<z.ZodString>;
    summary: z.ZodOptional<z.ZodString>;
    tokensUsed: z.ZodOptional<z.ZodNumber>;
    costUsd: z.ZodOptional<z.ZodNumber>;
    errorMessage: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    success: boolean;
    prUrl?: string | undefined;
    summary?: string | undefined;
    tokensUsed?: number | undefined;
    costUsd?: number | undefined;
    errorMessage?: string | undefined;
}, {
    success: boolean;
    prUrl?: string | undefined;
    summary?: string | undefined;
    tokensUsed?: number | undefined;
    costUsd?: number | undefined;
    errorMessage?: string | undefined;
}>;
type SessionComplete = z.infer<typeof SessionCompleteSchema>;
declare const SessionCompleteResponseSchema: z.ZodObject<{
    status: z.ZodLiteral<"completed">;
    /** false when Linear sync failed — never fails the request itself. */
    linearSynced: z.ZodBoolean;
    linearError: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    status: "completed";
    linearSynced: boolean;
    linearError?: string | undefined;
}, {
    status: "completed";
    linearSynced: boolean;
    linearError?: string | undefined;
}>;
declare const DispatchPollResponseSchema: z.ZodObject<{
    /** Unclaimed queue rows for the calling orchestrator, oldest first. */
    messages: z.ZodArray<z.ZodUnknown, "many">;
}, "strip", z.ZodTypeAny, {
    messages: unknown[];
}, {
    messages: unknown[];
}>;
declare const ERROR_CODES: readonly ["unauthenticated", "forbidden", "not_found", "invalid_request", "conflict", "rate_limited", "internal", "service_unavailable"];
declare const ApiErrorSchema: z.ZodObject<{
    error: z.ZodObject<{
        code: z.ZodEnum<["unauthenticated", "forbidden", "not_found", "invalid_request", "conflict", "rate_limited", "internal", "service_unavailable"]>;
        message: z.ZodString;
        details: z.ZodOptional<z.ZodUnknown>;
    }, "strip", z.ZodTypeAny, {
        code: "unauthenticated" | "forbidden" | "not_found" | "invalid_request" | "conflict" | "rate_limited" | "internal" | "service_unavailable";
        message: string;
        details?: unknown;
    }, {
        code: "unauthenticated" | "forbidden" | "not_found" | "invalid_request" | "conflict" | "rate_limited" | "internal" | "service_unavailable";
        message: string;
        details?: unknown;
    }>;
}, "strip", z.ZodTypeAny, {
    error: {
        code: "unauthenticated" | "forbidden" | "not_found" | "invalid_request" | "conflict" | "rate_limited" | "internal" | "service_unavailable";
        message: string;
        details?: unknown;
    };
}, {
    error: {
        code: "unauthenticated" | "forbidden" | "not_found" | "invalid_request" | "conflict" | "rate_limited" | "internal" | "service_unavailable";
        message: string;
        details?: unknown;
    };
}>;
type ApiErrorBody = z.infer<typeof ApiErrorSchema>;
/** Pull a usable message out of a bridge error response. */
declare function formatApiError(body: unknown, fallback: string): string;

/**
 * Linear comment formatting — TRD 05 §6.1.
 *
 * Ported from packages/core/src/integrations/linear/sync.ts (buildProgressComment /
 * buildCompletionComment) so there is exactly ONE definition rather than a copy
 * on each side of the repo boundary. `packages/core` re-exports from here;
 * a conforming third-party bridge gets the same formatting for free.
 *
 * Zero dependencies beyond zod elsewhere in the package — these are pure string
 * builders so any implementation can use them without pulling in Linear's SDK.
 */
/** Matches core's SessionProgressUpdate.status. */
type ProgressStatus = 'running' | 'waiting' | 'complete' | 'error';
interface ProgressCommentInput {
    progressPercent: number;
    status: ProgressStatus;
    currentWorkstream?: string;
    message?: string;
    filesModified?: string[];
}
interface CompletionCommentInput {
    success: boolean;
    prUrl?: string;
    completionMessage?: string;
    filesModified?: string[];
}
declare function buildProgressComment(input: ProgressCommentInput): string;
declare function buildCompletionComment(input: CompletionCommentInput): string;
/**
 * The comment the hosted bridge posts when a session finishes. Failure never
 * throws and never blocks the orchestrator's completion report (TRD 05 §6.3),
 * so this must produce something sane for every input.
 */
declare function buildBridgeCompletionComment(input: {
    success: boolean;
    identifier: string;
    prUrl?: string;
    summary?: string;
    errorMessage?: string;
}): string;

export { type ApiErrorBody, ApiErrorSchema, type CompletionCommentInput, DispatchPollResponseSchema, ERROR_CODES, type HeartbeatRequest, HeartbeatRequestSchema, type ProgressCommentInput, RealtimeCredentialsSchema, type RegisterRequest, RegisterRequestSchema, type RegisterResponse, RegisterResponseSchema, SESSION_EVENT_TYPES, SESSION_STATUSES, type SessionComplete, SessionCompleteResponseSchema, SessionCompleteSchema, type SessionEventType, SessionEventTypeSchema, type SessionStatus, SessionStatusSchema, type SessionStatusUpdate, SessionStatusUpdateSchema, TERMINAL_STATUSES, type TaskDispatchMessage, TaskDispatchMessageSchema, type TerminalStatus, buildBridgeCompletionComment, buildCompletionComment, buildProgressComment, formatApiError, isTerminal, parseTaskDispatchMessage, safeParseTaskDispatchMessage };
