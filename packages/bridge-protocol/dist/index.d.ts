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
 * sessionCrypto — TRD 06 §4.4, §6.1. End-to-end encryption for shared sessions.
 *
 * THE INVARIANT THIS FILE EXISTS TO ENFORCE: the session key never reaches
 * devpilot.sh. It is generated on a client, lives in the URL fragment (which
 * browsers do not transmit), and is held in process memory by the CLI and the
 * MCP server. The hosted plane stores one hash and relays opaque bytes.
 *
 * Contrast with the website's lib/bridge/crypto.ts, which encrypts Linear
 * credentials with a SERVER-held key (BRIDGE_ENCRYPTION_KEY). That is correct
 * there — the server must use those credentials. It is wrong here, because a
 * server-held key means the server can read the transcript, which is the whole
 * thing we are claiming it cannot do.
 *
 * ─── Key derivation (TRD 06 §5, as corrected) ───────────────────────────────
 *
 * The spec's original join proof was "client sends sha256(key), server compares
 * to the stored joinKeyHash". That makes the stored column DIRECTLY REPLAYABLE:
 * the value in the database is the same value the wire accepts, so a leaked
 * backup or a read-only insider can join any session. It is the store-the-
 * password-verbatim mistake.
 *
 * So one root secret is split into two independent HKDF branches:
 *
 *   k            32 random bytes, base64url — the fragment value, never sent
 *    ├─ HKDF(k, "content") ──▶ encKey        AES-256-GCM key. Never leaves the client.
 *    └─ HKDF(k, "verify")  ──▶ joinVerifier  sent as the join proof
 *                                  │
 *                                  └─ sha256 ──▶ joinKeyHash   what we store
 *
 * A database read yields only sha256(verifier), which cannot be used to join and
 * cannot decrypt anything. The verifier is a different branch from the content
 * key, so possessing it never yields plaintext. And §7.1 — "the key never
 * reaches the server" — becomes literally true, which under the original
 * formulation it was not: sha256(key) is a function of the key, sent on every
 * request.
 *
 * ─── Why this API is async ──────────────────────────────────────────────────
 *
 * §6.1 sketched synchronous signatures. That is not implementable against
 * WebCrypto, whose SubtleCrypto operations are all promise-returning, and
 * WebCrypto is the only AES implementation present in BOTH Node 18+ and the
 * browser. The alternatives were a Node/browser split (two implementations, the
 * exact drift TRD 05 deleted packages/bridge to prevent) or shipping a hand
 * rolled AES in JS (worse in every way). One async implementation, three
 * consumers. The spec is corrected rather than the code contorted.
 */
declare class SessionCryptoError extends Error {
    constructor(message: string);
}
declare class SessionKeyError extends SessionCryptoError {
    constructor(message: string);
}
declare class SessionDecryptionError extends SessionCryptoError {
    constructor(message: string);
}
/** What a client computes at creation time and sends to the server. */
interface JoinCredentials {
    /** base64url. Sent as the join proof, in a header. Never stored by us. */
    verifier: string;
    /** sha256 hex of the verifier. THE ONLY THING THE SERVER PERSISTS. */
    joinKeyHash: string;
}
/**
 * A key bound to its derived AES key, so a long-lived reader (`session tail`,
 * the MCP server) derives once instead of per message.
 *
 * Deliberately NOT a module-level cache keyed by the key string: that would
 * retain session keys in memory for the life of the process with no way to
 * drop them. Holding the handle is an explicit choice with an obvious end.
 */
interface SessionCipher {
    encrypt(plain: string): Promise<string>;
    decrypt(payload: string): Promise<string>;
}
declare const sessionCrypto: {
    /** 32 random bytes, base64url. This is the value that goes in the fragment. */
    generateKey(): string;
    /**
     * Derive the join proof and the value the server stores.
     *
     * Creation sends `joinKeyHash` only. Joining sends `verifier`; the server
     * hashes it with `hashJoinVerifier` and compares in constant time.
     */
    deriveJoinCredentials(key: string): Promise<JoinCredentials>;
    /** Server-side half of the join check. Takes the verifier, never the key. */
    hashJoinVerifier(verifier: string): Promise<string>;
    /**
     * Constant-time comparison of a presented verifier against a stored hash.
     *
     * The server calls this. It cannot derive the verifier from what it stores,
     * which is the entire point of the split.
     */
    verifyJoinProof(verifier: string, storedJoinKeyHash: string): Promise<boolean>;
    encrypt(plain: string, key: string): Promise<string>;
    /** Throws SessionDecryptionError on a wrong key or a tampered payload. */
    decrypt(payload: string, key: string): Promise<string>;
    /** Bind a key once for repeated use. */
    open(key: string): Promise<SessionCipher>;
};
/**
 * Build a join link. The key goes after the `#` and nowhere else — browsers do
 * not send fragments, so it never reaches our logs, proxies, or database.
 */
declare function buildJoinLink(baseUrl: string, sessionId: string, key: string): string;
/**
 * Split a join link into its id and key.
 *
 * Parsed by hand rather than with `new URL()` so this behaves identically in
 * Node and the browser and never round-trips the key through anything that
 * might log a URL.
 */
declare function parseJoinLink(link: string): {
    sessionId: string;
    key: string;
};

/**
 * Shared-session wire contract — TRD 06 §5, §6.1.
 *
 * Separate file from messages.ts, which is dispatch-shaped: one Linear issue to
 * one orchestrator, server-readable, single-writer. These are conversation-
 * shaped: many participants, ciphertext, ordered by `seq`. Mixing them in one
 * module would blur the one distinction a reader most needs to keep straight —
 * which of these payloads the server can read (dispatch) and which it cannot
 * (everything here).
 *
 * THE RULE FOR THIS FILE: every plaintext field below is plaintext ON PURPOSE
 * and appears in the §3.2 "server sees" column. Adding a field here is a change
 * to the privacy claim, not a schema tweak. Message content goes in
 * `ciphertext` and nowhere else.
 */
/**
 * §3.3. `observe` is the default and the safe one: agents read when asked, and
 * a message landing in the transcript wakes nobody. Anything else is opt-in,
 * budget-bounded and expiring.
 */
declare const SESSION_MODES: readonly ["observe", "relay", "auto"];
declare const SessionModeSchema: z.ZodEnum<["observe", "relay", "auto"]>;
type SessionMode = z.infer<typeof SessionModeSchema>;
/**
 * Deliberately coarse. Enough for the UI to pick a bubble style and for rate
 * limits to distinguish a human typing from an agent dumping build output — and
 * deliberately not enough to reveal anything about content.
 */
declare const SESSION_MESSAGE_KINDS: readonly ["chat", "agent_output", "system"];
declare const SessionMessageKindSchema: z.ZodEnum<["chat", "agent_output", "system"]>;
type SessionMessageKind = z.infer<typeof SessionMessageKindSchema>;
declare const PARTICIPANT_KINDS: readonly ["human", "agent"];
declare const ParticipantKindSchema: z.ZodEnum<["human", "agent"]>;
type ParticipantKind = z.infer<typeof ParticipantKindSchema>;
/** Open-ended by intent: a bridge implementation may carry an agent we do not ship. */
declare const AGENT_KINDS: readonly ["claude-code", "codex", "ao", "other"];
declare const AgentKindSchema: z.ZodEnum<["claude-code", "codex", "ao", "other"]>;
type AgentKind = z.infer<typeof AgentKindSchema>;
declare const SESSION_LIMITS: {
    /** Per participant, per session. */
    readonly messagesPerMinute: 60;
    /** Ciphertext bytes, not plaintext — what the server actually stores. */
    readonly maxCiphertextBytes: number;
    /** §3.3 `auto` bounds. Exhausting either drops the session to `observe`. */
    readonly autoDefaultBudget: 20;
    readonly autoDefaultTtlMinutes: 30;
};
declare const SessionMessageSchema: z.ZodObject<{
    id: z.ZodString;
    sessionId: z.ZodString;
    /** Null once a participant row is removed; the message survives them. */
    participantId: z.ZodNullable<z.ZodString>;
    /**
     * AES-256-GCM, base64(iv).base64(ct).base64(tag), encrypted with a key
     * derived from the session key by sessionCrypto. OPAQUE TO THE SERVER.
     */
    ciphertext: z.ZodString;
    /** Which key version sealed this, so rotation does not orphan history (§4.4). */
    keyVersion: z.ZodNumber;
    kind: z.ZodEnum<["chat", "agent_output", "system"]>;
    /** Monotonic per session, assigned by the server. Clients order by THIS, not by clock. */
    seq: z.ZodNumber;
    createdAt: z.ZodString;
}, "strip", z.ZodTypeAny, {
    sessionId: string;
    id: string;
    participantId: string | null;
    ciphertext: string;
    keyVersion: number;
    kind: "chat" | "agent_output" | "system";
    seq: number;
    createdAt: string;
}, {
    sessionId: string;
    id: string;
    participantId: string | null;
    ciphertext: string;
    keyVersion: number;
    kind: "chat" | "agent_output" | "system";
    seq: number;
    createdAt: string;
}>;
type SessionMessage = z.infer<typeof SessionMessageSchema>;
declare const SessionParticipantSchema: z.ZodObject<{
    id: z.ZodString;
    sessionId: z.ZodString;
    kind: z.ZodEnum<["human", "agent"]>;
    /** Chosen by the joiner and NOT AUTHENTICATED. The UI must not imply otherwise. */
    displayName: z.ZodString;
    agentKind: z.ZodOptional<z.ZodNullable<z.ZodEnum<["claude-code", "codex", "ao", "other"]>>>;
    joinedAt: z.ZodString;
    lastSeenAt: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    leftAt: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    sessionId: string;
    id: string;
    kind: "human" | "agent";
    displayName: string;
    joinedAt: string;
    agentKind?: "claude-code" | "codex" | "ao" | "other" | null | undefined;
    lastSeenAt?: string | null | undefined;
    leftAt?: string | null | undefined;
}, {
    sessionId: string;
    id: string;
    kind: "human" | "agent";
    displayName: string;
    joinedAt: string;
    agentKind?: "claude-code" | "codex" | "ao" | "other" | null | undefined;
    lastSeenAt?: string | null | undefined;
    leftAt?: string | null | undefined;
}>;
type SessionParticipant = z.infer<typeof SessionParticipantSchema>;
/**
 * Session metadata as a participant sees it.
 *
 * Note what is absent: `joinKeyHash` and `orgId` are server-side concerns and
 * are never returned to a participant, who may be from another org entirely.
 */
declare const SharedSessionSchema: z.ZodObject<{
    id: z.ZodString;
    /** Plaintext BY CHOICE — it is the portal list label. Never put secrets here. */
    title: z.ZodString;
    mode: z.ZodEnum<["observe", "relay", "auto"]>;
    keyVersion: z.ZodNumber;
    linearIdentifier: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    autoBudgetRemaining: z.ZodOptional<z.ZodNumber>;
    autoExpiresAt: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    closedAt: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    /**
     * Highest assigned `seq`, so a joiner knows how far behind it is without
     * fetching the transcript first.
     *
     * ADDED IN WAVE 4. Wave 2 introduced the column and Wave 3's route has been
     * returning it since, but this schema — the thing that is supposed to BE the
     * wire contract — never declared it. Caught by the MCP server, which is the
     * first consumer to read the session object through the published types
     * rather than through a hand-written fetch.
     */
    lastSeq: z.ZodOptional<z.ZodNumber>;
    createdAt: z.ZodString;
}, "strip", z.ZodTypeAny, {
    title: string;
    id: string;
    keyVersion: number;
    createdAt: string;
    mode: "observe" | "relay" | "auto";
    linearIdentifier?: string | null | undefined;
    autoBudgetRemaining?: number | undefined;
    autoExpiresAt?: string | null | undefined;
    closedAt?: string | null | undefined;
    lastSeq?: number | undefined;
}, {
    title: string;
    id: string;
    keyVersion: number;
    createdAt: string;
    mode: "observe" | "relay" | "auto";
    linearIdentifier?: string | null | undefined;
    autoBudgetRemaining?: number | undefined;
    autoExpiresAt?: string | null | undefined;
    closedAt?: string | null | undefined;
    lastSeq?: number | undefined;
}>;
type SharedSession = z.infer<typeof SharedSessionSchema>;
/**
 * POST /api/sessions/shared
 *
 * Carries `joinKeyHash` and NOT the key, nor the verifier. The client derives
 * both locally; only the hash is transmissible. A `key` field on this schema
 * would be a breach of §7.1 — hence the `.strict()`, which makes an accidental
 * extra field a parse failure rather than a silently forwarded secret.
 */
declare const CreateSharedSessionRequestSchema: z.ZodObject<{
    title: z.ZodString;
    /** sha256 hex of the join verifier. 64 lowercase hex chars. */
    joinKeyHash: z.ZodString;
    linearIssueId: z.ZodOptional<z.ZodString>;
    linearIdentifier: z.ZodOptional<z.ZodString>;
}, "strict", z.ZodTypeAny, {
    title: string;
    joinKeyHash: string;
    linearIssueId?: string | undefined;
    linearIdentifier?: string | undefined;
}, {
    title: string;
    joinKeyHash: string;
    linearIssueId?: string | undefined;
    linearIdentifier?: string | undefined;
}>;
type CreateSharedSessionRequest = z.infer<typeof CreateSharedSessionRequestSchema>;
declare const CreateSharedSessionResponseSchema: z.ZodObject<{
    session: z.ZodObject<{
        id: z.ZodString;
        /** Plaintext BY CHOICE — it is the portal list label. Never put secrets here. */
        title: z.ZodString;
        mode: z.ZodEnum<["observe", "relay", "auto"]>;
        keyVersion: z.ZodNumber;
        linearIdentifier: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        autoBudgetRemaining: z.ZodOptional<z.ZodNumber>;
        autoExpiresAt: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        closedAt: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        /**
         * Highest assigned `seq`, so a joiner knows how far behind it is without
         * fetching the transcript first.
         *
         * ADDED IN WAVE 4. Wave 2 introduced the column and Wave 3's route has been
         * returning it since, but this schema — the thing that is supposed to BE the
         * wire contract — never declared it. Caught by the MCP server, which is the
         * first consumer to read the session object through the published types
         * rather than through a hand-written fetch.
         */
        lastSeq: z.ZodOptional<z.ZodNumber>;
        createdAt: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        title: string;
        id: string;
        keyVersion: number;
        createdAt: string;
        mode: "observe" | "relay" | "auto";
        linearIdentifier?: string | null | undefined;
        autoBudgetRemaining?: number | undefined;
        autoExpiresAt?: string | null | undefined;
        closedAt?: string | null | undefined;
        lastSeq?: number | undefined;
    }, {
        title: string;
        id: string;
        keyVersion: number;
        createdAt: string;
        mode: "observe" | "relay" | "auto";
        linearIdentifier?: string | null | undefined;
        autoBudgetRemaining?: number | undefined;
        autoExpiresAt?: string | null | undefined;
        closedAt?: string | null | undefined;
        lastSeq?: number | undefined;
    }>;
}, "strip", z.ZodTypeAny, {
    session: {
        title: string;
        id: string;
        keyVersion: number;
        createdAt: string;
        mode: "observe" | "relay" | "auto";
        linearIdentifier?: string | null | undefined;
        autoBudgetRemaining?: number | undefined;
        autoExpiresAt?: string | null | undefined;
        closedAt?: string | null | undefined;
        lastSeq?: number | undefined;
    };
}, {
    session: {
        title: string;
        id: string;
        keyVersion: number;
        createdAt: string;
        mode: "observe" | "relay" | "auto";
        linearIdentifier?: string | null | undefined;
        autoBudgetRemaining?: number | undefined;
        autoExpiresAt?: string | null | undefined;
        closedAt?: string | null | undefined;
        lastSeq?: number | undefined;
    };
}>;
type CreateSharedSessionResponse = z.infer<typeof CreateSharedSessionResponseSchema>;
/**
 * POST /api/sessions/shared/:id/join
 *
 * The proof travels in the `X-Session-Key-Proof` header rather than the body,
 * so it stays out of anything that logs request payloads.
 */
declare const JOIN_PROOF_HEADER = "x-session-key-proof";
declare const JoinSessionRequestSchema: z.ZodObject<{
    displayName: z.ZodString;
    kind: z.ZodDefault<z.ZodEnum<["human", "agent"]>>;
    agentKind: z.ZodOptional<z.ZodEnum<["claude-code", "codex", "ao", "other"]>>;
    /** Set when an agent participant is bound to a registered machine. */
    orchestratorId: z.ZodOptional<z.ZodString>;
}, "strict", z.ZodTypeAny, {
    kind: "human" | "agent";
    displayName: string;
    orchestratorId?: string | undefined;
    agentKind?: "claude-code" | "codex" | "ao" | "other" | undefined;
}, {
    displayName: string;
    orchestratorId?: string | undefined;
    kind?: "human" | "agent" | undefined;
    agentKind?: "claude-code" | "codex" | "ao" | "other" | undefined;
}>;
type JoinSessionRequest = z.infer<typeof JoinSessionRequestSchema>;
declare const JoinSessionResponseSchema: z.ZodObject<{
    /**
     * Short-lived JWT scoped to ONE session. Message routes authenticate with
     * this and never with org membership — that is what lets an outside
     * collaborator participate without being provisioned into the org (§5).
     */
    participantToken: z.ZodString;
    expiresAt: z.ZodString;
    participant: z.ZodObject<{
        id: z.ZodString;
        sessionId: z.ZodString;
        kind: z.ZodEnum<["human", "agent"]>;
        /** Chosen by the joiner and NOT AUTHENTICATED. The UI must not imply otherwise. */
        displayName: z.ZodString;
        agentKind: z.ZodOptional<z.ZodNullable<z.ZodEnum<["claude-code", "codex", "ao", "other"]>>>;
        joinedAt: z.ZodString;
        lastSeenAt: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        leftAt: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    }, "strip", z.ZodTypeAny, {
        sessionId: string;
        id: string;
        kind: "human" | "agent";
        displayName: string;
        joinedAt: string;
        agentKind?: "claude-code" | "codex" | "ao" | "other" | null | undefined;
        lastSeenAt?: string | null | undefined;
        leftAt?: string | null | undefined;
    }, {
        sessionId: string;
        id: string;
        kind: "human" | "agent";
        displayName: string;
        joinedAt: string;
        agentKind?: "claude-code" | "codex" | "ao" | "other" | null | undefined;
        lastSeenAt?: string | null | undefined;
        leftAt?: string | null | undefined;
    }>;
    session: z.ZodObject<{
        id: z.ZodString;
        /** Plaintext BY CHOICE — it is the portal list label. Never put secrets here. */
        title: z.ZodString;
        mode: z.ZodEnum<["observe", "relay", "auto"]>;
        keyVersion: z.ZodNumber;
        linearIdentifier: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        autoBudgetRemaining: z.ZodOptional<z.ZodNumber>;
        autoExpiresAt: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        closedAt: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        /**
         * Highest assigned `seq`, so a joiner knows how far behind it is without
         * fetching the transcript first.
         *
         * ADDED IN WAVE 4. Wave 2 introduced the column and Wave 3's route has been
         * returning it since, but this schema — the thing that is supposed to BE the
         * wire contract — never declared it. Caught by the MCP server, which is the
         * first consumer to read the session object through the published types
         * rather than through a hand-written fetch.
         */
        lastSeq: z.ZodOptional<z.ZodNumber>;
        createdAt: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        title: string;
        id: string;
        keyVersion: number;
        createdAt: string;
        mode: "observe" | "relay" | "auto";
        linearIdentifier?: string | null | undefined;
        autoBudgetRemaining?: number | undefined;
        autoExpiresAt?: string | null | undefined;
        closedAt?: string | null | undefined;
        lastSeq?: number | undefined;
    }, {
        title: string;
        id: string;
        keyVersion: number;
        createdAt: string;
        mode: "observe" | "relay" | "auto";
        linearIdentifier?: string | null | undefined;
        autoBudgetRemaining?: number | undefined;
        autoExpiresAt?: string | null | undefined;
        closedAt?: string | null | undefined;
        lastSeq?: number | undefined;
    }>;
}, "strip", z.ZodTypeAny, {
    expiresAt: string;
    session: {
        title: string;
        id: string;
        keyVersion: number;
        createdAt: string;
        mode: "observe" | "relay" | "auto";
        linearIdentifier?: string | null | undefined;
        autoBudgetRemaining?: number | undefined;
        autoExpiresAt?: string | null | undefined;
        closedAt?: string | null | undefined;
        lastSeq?: number | undefined;
    };
    participantToken: string;
    participant: {
        sessionId: string;
        id: string;
        kind: "human" | "agent";
        displayName: string;
        joinedAt: string;
        agentKind?: "claude-code" | "codex" | "ao" | "other" | null | undefined;
        lastSeenAt?: string | null | undefined;
        leftAt?: string | null | undefined;
    };
}, {
    expiresAt: string;
    session: {
        title: string;
        id: string;
        keyVersion: number;
        createdAt: string;
        mode: "observe" | "relay" | "auto";
        linearIdentifier?: string | null | undefined;
        autoBudgetRemaining?: number | undefined;
        autoExpiresAt?: string | null | undefined;
        closedAt?: string | null | undefined;
        lastSeq?: number | undefined;
    };
    participantToken: string;
    participant: {
        sessionId: string;
        id: string;
        kind: "human" | "agent";
        displayName: string;
        joinedAt: string;
        agentKind?: "claude-code" | "codex" | "ao" | "other" | null | undefined;
        lastSeenAt?: string | null | undefined;
        leftAt?: string | null | undefined;
    };
}>;
type JoinSessionResponse = z.infer<typeof JoinSessionResponseSchema>;
/** POST /api/sessions/shared/:id/messages — the server assigns `seq`, never the client. */
declare const PostSessionMessageRequestSchema: z.ZodObject<{
    ciphertext: z.ZodString;
    kind: z.ZodDefault<z.ZodEnum<["chat", "agent_output", "system"]>>;
    keyVersion: z.ZodNumber;
    /**
     * Client-generated idempotency key. A retried POST after a timeout must not
     * double-post: the transport is at-least-once, so the write has to be
     * deduplicated somewhere, and the client is the only party that knows two
     * requests were the same intent.
     */
    clientNonce: z.ZodOptional<z.ZodString>;
}, "strict", z.ZodTypeAny, {
    ciphertext: string;
    keyVersion: number;
    kind: "chat" | "agent_output" | "system";
    clientNonce?: string | undefined;
}, {
    ciphertext: string;
    keyVersion: number;
    kind?: "chat" | "agent_output" | "system" | undefined;
    clientNonce?: string | undefined;
}>;
type PostSessionMessageRequest = z.infer<typeof PostSessionMessageRequestSchema>;
declare const PostSessionMessageResponseSchema: z.ZodObject<{
    message: z.ZodObject<{
        id: z.ZodString;
        sessionId: z.ZodString;
        /** Null once a participant row is removed; the message survives them. */
        participantId: z.ZodNullable<z.ZodString>;
        /**
         * AES-256-GCM, base64(iv).base64(ct).base64(tag), encrypted with a key
         * derived from the session key by sessionCrypto. OPAQUE TO THE SERVER.
         */
        ciphertext: z.ZodString;
        /** Which key version sealed this, so rotation does not orphan history (§4.4). */
        keyVersion: z.ZodNumber;
        kind: z.ZodEnum<["chat", "agent_output", "system"]>;
        /** Monotonic per session, assigned by the server. Clients order by THIS, not by clock. */
        seq: z.ZodNumber;
        createdAt: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        sessionId: string;
        id: string;
        participantId: string | null;
        ciphertext: string;
        keyVersion: number;
        kind: "chat" | "agent_output" | "system";
        seq: number;
        createdAt: string;
    }, {
        sessionId: string;
        id: string;
        participantId: string | null;
        ciphertext: string;
        keyVersion: number;
        kind: "chat" | "agent_output" | "system";
        seq: number;
        createdAt: string;
    }>;
}, "strip", z.ZodTypeAny, {
    message: {
        sessionId: string;
        id: string;
        participantId: string | null;
        ciphertext: string;
        keyVersion: number;
        kind: "chat" | "agent_output" | "system";
        seq: number;
        createdAt: string;
    };
}, {
    message: {
        sessionId: string;
        id: string;
        participantId: string | null;
        ciphertext: string;
        keyVersion: number;
        kind: "chat" | "agent_output" | "system";
        seq: number;
        createdAt: string;
    };
}>;
type PostSessionMessageResponse = z.infer<typeof PostSessionMessageResponseSchema>;
/** GET /api/sessions/shared/:id/messages?since=<seq> */
declare const SessionMessagePageSchema: z.ZodObject<{
    messages: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        sessionId: z.ZodString;
        /** Null once a participant row is removed; the message survives them. */
        participantId: z.ZodNullable<z.ZodString>;
        /**
         * AES-256-GCM, base64(iv).base64(ct).base64(tag), encrypted with a key
         * derived from the session key by sessionCrypto. OPAQUE TO THE SERVER.
         */
        ciphertext: z.ZodString;
        /** Which key version sealed this, so rotation does not orphan history (§4.4). */
        keyVersion: z.ZodNumber;
        kind: z.ZodEnum<["chat", "agent_output", "system"]>;
        /** Monotonic per session, assigned by the server. Clients order by THIS, not by clock. */
        seq: z.ZodNumber;
        createdAt: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        sessionId: string;
        id: string;
        participantId: string | null;
        ciphertext: string;
        keyVersion: number;
        kind: "chat" | "agent_output" | "system";
        seq: number;
        createdAt: string;
    }, {
        sessionId: string;
        id: string;
        participantId: string | null;
        ciphertext: string;
        keyVersion: number;
        kind: "chat" | "agent_output" | "system";
        seq: number;
        createdAt: string;
    }>, "many">;
    /** Highest `seq` in this page; the cursor for the next `?since=`. */
    latestSeq: z.ZodNumber;
    hasMore: z.ZodBoolean;
}, "strip", z.ZodTypeAny, {
    messages: {
        sessionId: string;
        id: string;
        participantId: string | null;
        ciphertext: string;
        keyVersion: number;
        kind: "chat" | "agent_output" | "system";
        seq: number;
        createdAt: string;
    }[];
    latestSeq: number;
    hasMore: boolean;
}, {
    messages: {
        sessionId: string;
        id: string;
        participantId: string | null;
        ciphertext: string;
        keyVersion: number;
        kind: "chat" | "agent_output" | "system";
        seq: number;
        createdAt: string;
    }[];
    latestSeq: number;
    hasMore: boolean;
}>;
type SessionMessagePage = z.infer<typeof SessionMessagePageSchema>;
/** POST /api/sessions/shared/:id/mode */
declare const SetSessionModeRequestSchema: z.ZodEffects<z.ZodObject<{
    mode: z.ZodEnum<["observe", "relay", "auto"]>;
    /** Required when mode is `auto`; ignored otherwise. §3.3 admits no unbounded autonomy. */
    autoBudget: z.ZodOptional<z.ZodNumber>;
    autoTtlMinutes: z.ZodOptional<z.ZodNumber>;
}, "strict", z.ZodTypeAny, {
    mode: "observe" | "relay" | "auto";
    autoBudget?: number | undefined;
    autoTtlMinutes?: number | undefined;
}, {
    mode: "observe" | "relay" | "auto";
    autoBudget?: number | undefined;
    autoTtlMinutes?: number | undefined;
}>, {
    mode: "observe" | "relay" | "auto";
    autoBudget?: number | undefined;
    autoTtlMinutes?: number | undefined;
}, {
    mode: "observe" | "relay" | "auto";
    autoBudget?: number | undefined;
    autoTtlMinutes?: number | undefined;
}>;
type SetSessionModeRequest = z.infer<typeof SetSessionModeRequestSchema>;
/**
 * POST /api/sessions/shared/:id/rotate
 *
 * Same asymmetry as creation: the caller generates the new key client-side and
 * sends only its hash. Rotation stops FUTURE reads by old-link holders; it does
 * not retract past access, and nothing in this schema should suggest it does.
 */
declare const RotateSessionKeyRequestSchema: z.ZodObject<{
    joinKeyHash: z.ZodString;
}, "strict", z.ZodTypeAny, {
    joinKeyHash: string;
}, {
    joinKeyHash: string;
}>;
type RotateSessionKeyRequest = z.infer<typeof RotateSessionKeyRequestSchema>;
declare const RotateSessionKeyResponseSchema: z.ZodObject<{
    keyVersion: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    keyVersion: number;
}, {
    keyVersion: number;
}>;
type RotateSessionKeyResponse = z.infer<typeof RotateSessionKeyResponseSchema>;
declare function parseSessionMessage(input: unknown): SessionMessage;
declare function safeParseSessionMessage(input: unknown): z.SafeParseReturnType<{
    sessionId: string;
    id: string;
    participantId: string | null;
    ciphertext: string;
    keyVersion: number;
    kind: "chat" | "agent_output" | "system";
    seq: number;
    createdAt: string;
}, {
    sessionId: string;
    id: string;
    participantId: string | null;
    ciphertext: string;
    keyVersion: number;
    kind: "chat" | "agent_output" | "system";
    seq: number;
    createdAt: string;
}>;
declare function parseSessionMessagePage(input: unknown): SessionMessagePage;

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

/**
 * Session adoption & fleet discovery — TRD 21 §5.
 *
 * The reverse of `messages.ts`. That file describes work the bridge is being
 * *given*; this one describes work the bridge *found already running* on the
 * machine and is reporting upward.
 *
 * ## Why every schema here is `.strict()`
 *
 * TRD 21 DECISION B: the transcript never leaves the machine. That claim needs
 * an enforcement mechanism, not a comment, because the pressure to widen it is
 * real — the very next feature anyone asks for is "show me what the agent
 * said", and the cheapest way to build it is one more field.
 *
 * `.strict()` makes an unknown key a parse failure on BOTH sides. A caller
 * cannot smuggle content through by adding a property, and a bridge cannot
 * start accepting one without amending this file, which is a reviewable diff in
 * a published package. The hosted table additionally has no column that could
 * hold transcript text, so the two defences are independent.
 *
 * The closed list of what may cross is in TRD 21 §3.3. `touchedPaths` is the
 * only genuinely new class of information — file PATHS, never contents — and it
 * exists so the in-flight-file guard is correct for adopted sessions.
 */
/**
 * Agents whose local session store this protocol knows how to read.
 *
 * A one-element enum rather than a free string: an unrecognised agent name
 * would be recorded and rendered as though the hosted side understood its
 * semantics, when in fact nothing would. Adding `codex` means adding a probe.
 */
declare const ADOPTION_AGENTS: readonly ["claude-code"];
declare const AdoptionAgentSchema: z.ZodEnum<["claude-code"]>;
type AdoptionAgent = (typeof ADOPTION_AGENTS)[number];
/** How an adopted session found its place on the board. */
declare const ADOPTION_MATCH_KINDS: readonly ["branch", "title", "created"];
declare const AdoptionMatchKindSchema: z.ZodEnum<["branch", "title", "created"]>;
type AdoptionMatchKind = (typeof ADOPTION_MATCH_KINDS)[number];
/** What happened to one candidate. */
declare const ADOPTION_OUTCOME_STATUSES: readonly ["adopted", "duplicate", "attached", "skipped"];
declare const AdoptionOutcomeStatusSchema: z.ZodEnum<["adopted", "duplicate", "attached", "skipped"]>;
type AdoptionOutcomeStatus = (typeof ADOPTION_OUTCOME_STATUSES)[number];
declare const ADOPTION_LIMITS: {
    /** Per request. The CLI chunks beyond this. */
    readonly MAX_CANDIDATES: 100;
    /** Paths only, and not many. A session touching more is summarised, not listed. */
    readonly MAX_TOUCHED_PATHS: 50;
    readonly MAX_TITLE_CHARS: 120;
    readonly MAX_SUMMARY_CHARS: 400;
    /** Per discovery request. A machine with more repos than this has bigger problems. */
    readonly MAX_DISCOVERED_REPOS: 500;
};
/**
 * `owner/name`. Deliberately the same shape the machine already declared at
 * register time, so adoption can never introduce a repo identifier the routing
 * table cannot match.
 */
declare const RepoSlugSchema: z.ZodString;
/**
 * One agent session observed on a machine, offered for a place on the board.
 *
 * NOTE what is absent and must stay absent: transcript, messages, prompt,
 * diff, patch, fileContents. There is a test asserting each of those is
 * rejected (`adoption.test.ts`), because this is the whole product boundary.
 */
declare const AdoptionCandidateSchema: z.ZodObject<{
    /**
     * `sha256(machineName + ':' + sessionUuid)`, hex.
     *
     * Opaque on the wire and used only for idempotence. The machine name is in
     * the hash because two laptops share a session UUID only if someone copied
     * a `~/.claude` directory between them — and if they did, those genuinely
     * are two observations of two different machines.
     */
    adoptionKey: z.ZodString;
    agent: z.ZodEnum<["claude-code"]>;
    /** One line. From the client's own session title where it has one. */
    title: z.ZodString;
    /** Derived locally. Never a quotation from the transcript. */
    summary: z.ZodOptional<z.ZodString>;
    repo: z.ZodString;
    branch: z.ZodOptional<z.ZodString>;
    startedAt: z.ZodString;
    lastActivityAt: z.ZodString;
    /** Approximate — see the probe's note on why it is not paid for exactly. */
    messageCount: z.ZodOptional<z.ZodNumber>;
    /** Still running at scan time. */
    live: z.ZodBoolean;
    /**
     * Changed file PATHS. Not contents, not diffs.
     *
     * This is what makes `getAvoidFiles` correct for a session DevPilot did not
     * start: without it, an adopted agent holds files nothing knows about.
     */
    touchedPaths: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
}, "strict", z.ZodTypeAny, {
    title: string;
    repo: string;
    agent: "claude-code";
    adoptionKey: string;
    startedAt: string;
    lastActivityAt: string;
    live: boolean;
    summary?: string | undefined;
    branch?: string | undefined;
    messageCount?: number | undefined;
    touchedPaths?: string[] | undefined;
}, {
    title: string;
    repo: string;
    agent: "claude-code";
    adoptionKey: string;
    startedAt: string;
    lastActivityAt: string;
    live: boolean;
    summary?: string | undefined;
    branch?: string | undefined;
    messageCount?: number | undefined;
    touchedPaths?: string[] | undefined;
}>;
type AdoptionCandidate = z.infer<typeof AdoptionCandidateSchema>;
declare const AdoptionRequestSchema: z.ZodObject<{
    machineName: z.ZodString;
    candidates: z.ZodArray<z.ZodObject<{
        /**
         * `sha256(machineName + ':' + sessionUuid)`, hex.
         *
         * Opaque on the wire and used only for idempotence. The machine name is in
         * the hash because two laptops share a session UUID only if someone copied
         * a `~/.claude` directory between them — and if they did, those genuinely
         * are two observations of two different machines.
         */
        adoptionKey: z.ZodString;
        agent: z.ZodEnum<["claude-code"]>;
        /** One line. From the client's own session title where it has one. */
        title: z.ZodString;
        /** Derived locally. Never a quotation from the transcript. */
        summary: z.ZodOptional<z.ZodString>;
        repo: z.ZodString;
        branch: z.ZodOptional<z.ZodString>;
        startedAt: z.ZodString;
        lastActivityAt: z.ZodString;
        /** Approximate — see the probe's note on why it is not paid for exactly. */
        messageCount: z.ZodOptional<z.ZodNumber>;
        /** Still running at scan time. */
        live: z.ZodBoolean;
        /**
         * Changed file PATHS. Not contents, not diffs.
         *
         * This is what makes `getAvoidFiles` correct for a session DevPilot did not
         * start: without it, an adopted agent holds files nothing knows about.
         */
        touchedPaths: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    }, "strict", z.ZodTypeAny, {
        title: string;
        repo: string;
        agent: "claude-code";
        adoptionKey: string;
        startedAt: string;
        lastActivityAt: string;
        live: boolean;
        summary?: string | undefined;
        branch?: string | undefined;
        messageCount?: number | undefined;
        touchedPaths?: string[] | undefined;
    }, {
        title: string;
        repo: string;
        agent: "claude-code";
        adoptionKey: string;
        startedAt: string;
        lastActivityAt: string;
        live: boolean;
        summary?: string | undefined;
        branch?: string | undefined;
        messageCount?: number | undefined;
        touchedPaths?: string[] | undefined;
    }>, "many">;
    /**
     * Preview. Every read runs — routing, duplicate detection, branch and title
     * matching — and the response says what creation *would* do. Nothing is
     * written and no Linear issue is created.
     *
     * This is what `devpilot sessions scan` calls, so the matches a user sees
     * before confirming are the real ones rather than a local guess that can
     * disagree with the server.
     */
    dryRun: z.ZodDefault<z.ZodBoolean>;
}, "strict", z.ZodTypeAny, {
    machineName: string;
    candidates: {
        title: string;
        repo: string;
        agent: "claude-code";
        adoptionKey: string;
        startedAt: string;
        lastActivityAt: string;
        live: boolean;
        summary?: string | undefined;
        branch?: string | undefined;
        messageCount?: number | undefined;
        touchedPaths?: string[] | undefined;
    }[];
    dryRun: boolean;
}, {
    machineName: string;
    candidates: {
        title: string;
        repo: string;
        agent: "claude-code";
        adoptionKey: string;
        startedAt: string;
        lastActivityAt: string;
        live: boolean;
        summary?: string | undefined;
        branch?: string | undefined;
        messageCount?: number | undefined;
        touchedPaths?: string[] | undefined;
    }[];
    dryRun?: boolean | undefined;
}>;
type AdoptionRequest = z.infer<typeof AdoptionRequestSchema>;
declare const AdoptionOutcomeSchema: z.ZodObject<{
    adoptionKey: z.ZodString;
    status: z.ZodEnum<["adopted", "duplicate", "attached", "skipped"]>;
    /** `dispatch_sessions.id`, or null when nothing was written. */
    sessionId: z.ZodNullable<z.ZodString>;
    linearIdentifier: z.ZodNullable<z.ZodString>;
    linearUrl: z.ZodNullable<z.ZodString>;
    matchedBy: z.ZodNullable<z.ZodEnum<["branch", "title", "created"]>>;
    /** Present for `skipped`, and for any outcome worth explaining. */
    reason: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    sessionId: string | null;
    linearIdentifier: string | null;
    status: "adopted" | "duplicate" | "attached" | "skipped";
    adoptionKey: string;
    linearUrl: string | null;
    matchedBy: "title" | "created" | "branch" | null;
    reason?: string | undefined;
}, {
    sessionId: string | null;
    linearIdentifier: string | null;
    status: "adopted" | "duplicate" | "attached" | "skipped";
    adoptionKey: string;
    linearUrl: string | null;
    matchedBy: "title" | "created" | "branch" | null;
    reason?: string | undefined;
}>;
type AdoptionOutcome = z.infer<typeof AdoptionOutcomeSchema>;
declare const AdoptionResponseSchema: z.ZodObject<{
    outcomes: z.ZodArray<z.ZodObject<{
        adoptionKey: z.ZodString;
        status: z.ZodEnum<["adopted", "duplicate", "attached", "skipped"]>;
        /** `dispatch_sessions.id`, or null when nothing was written. */
        sessionId: z.ZodNullable<z.ZodString>;
        linearIdentifier: z.ZodNullable<z.ZodString>;
        linearUrl: z.ZodNullable<z.ZodString>;
        matchedBy: z.ZodNullable<z.ZodEnum<["branch", "title", "created"]>>;
        /** Present for `skipped`, and for any outcome worth explaining. */
        reason: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        sessionId: string | null;
        linearIdentifier: string | null;
        status: "adopted" | "duplicate" | "attached" | "skipped";
        adoptionKey: string;
        linearUrl: string | null;
        matchedBy: "title" | "created" | "branch" | null;
        reason?: string | undefined;
    }, {
        sessionId: string | null;
        linearIdentifier: string | null;
        status: "adopted" | "duplicate" | "attached" | "skipped";
        adoptionKey: string;
        linearUrl: string | null;
        matchedBy: "title" | "created" | "branch" | null;
        reason?: string | undefined;
    }>, "many">;
    adopted: z.ZodNumber;
    attached: z.ZodNumber;
    duplicates: z.ZodNumber;
    skipped: z.ZodNumber;
    /** Echoed so a client cannot mistake a preview for a write. */
    dryRun: z.ZodBoolean;
}, "strip", z.ZodTypeAny, {
    adopted: number;
    attached: number;
    skipped: number;
    dryRun: boolean;
    outcomes: {
        sessionId: string | null;
        linearIdentifier: string | null;
        status: "adopted" | "duplicate" | "attached" | "skipped";
        adoptionKey: string;
        linearUrl: string | null;
        matchedBy: "title" | "created" | "branch" | null;
        reason?: string | undefined;
    }[];
    duplicates: number;
}, {
    adopted: number;
    attached: number;
    skipped: number;
    dryRun: boolean;
    outcomes: {
        sessionId: string | null;
        linearIdentifier: string | null;
        status: "adopted" | "duplicate" | "attached" | "skipped";
        adoptionKey: string;
        linearUrl: string | null;
        matchedBy: "title" | "created" | "branch" | null;
        reason?: string | undefined;
    }[];
    duplicates: number;
}>;
type AdoptionResponse = z.infer<typeof AdoptionResponseSchema>;
/**
 * A repo seen on a machine, with how much agent activity it carries.
 *
 * Separate from adoption on purpose (TRD 21 §3.1): discovery costs no model
 * call, writes to no board, and calls no Linear API, which is what makes it
 * safe to run on every connect. Adoption creates issues, so it does not.
 */
declare const DiscoveredRepoSchema: z.ZodObject<{
    repo: z.ZodString;
    /** The grouping key the portal renders sections by — the GitHub org. */
    owner: z.ZodString;
    /** `github.com`, `gitlab.com`, … Never a path. */
    host: z.ZodString;
    /** Distinct working directories. Worktrees legitimately inflate this. */
    projectCount: z.ZodNumber;
    sessionCount: z.ZodNumber;
    /** The "this is happening right now" number. */
    liveSessionCount: z.ZodNumber;
    lastActivityAt: z.ZodNullable<z.ZodString>;
}, "strict", z.ZodTypeAny, {
    repo: string;
    lastActivityAt: string | null;
    owner: string;
    host: string;
    projectCount: number;
    sessionCount: number;
    liveSessionCount: number;
}, {
    repo: string;
    lastActivityAt: string | null;
    owner: string;
    host: string;
    projectCount: number;
    sessionCount: number;
    liveSessionCount: number;
}>;
type DiscoveredRepo = z.infer<typeof DiscoveredRepoSchema>;
declare const DiscoveryRequestSchema: z.ZodObject<{
    machineName: z.ZodString;
    repos: z.ZodArray<z.ZodObject<{
        repo: z.ZodString;
        /** The grouping key the portal renders sections by — the GitHub org. */
        owner: z.ZodString;
        /** `github.com`, `gitlab.com`, … Never a path. */
        host: z.ZodString;
        /** Distinct working directories. Worktrees legitimately inflate this. */
        projectCount: z.ZodNumber;
        sessionCount: z.ZodNumber;
        /** The "this is happening right now" number. */
        liveSessionCount: z.ZodNumber;
        lastActivityAt: z.ZodNullable<z.ZodString>;
    }, "strict", z.ZodTypeAny, {
        repo: string;
        lastActivityAt: string | null;
        owner: string;
        host: string;
        projectCount: number;
        sessionCount: number;
        liveSessionCount: number;
    }, {
        repo: string;
        lastActivityAt: string | null;
        owner: string;
        host: string;
        projectCount: number;
        sessionCount: number;
        liveSessionCount: number;
    }>, "many">;
    /**
     * Directories with agent activity and no resolvable git remote.
     *
     * Reported as a count rather than a list: the paths are the user's private
     * directory layout, and "12 sessions DevPilot cannot route" is the whole of
     * what the onboarding surface needs to say.
     */
    unmappedProjectCount: z.ZodDefault<z.ZodNumber>;
}, "strict", z.ZodTypeAny, {
    repos: {
        repo: string;
        lastActivityAt: string | null;
        owner: string;
        host: string;
        projectCount: number;
        sessionCount: number;
        liveSessionCount: number;
    }[];
    machineName: string;
    unmappedProjectCount: number;
}, {
    repos: {
        repo: string;
        lastActivityAt: string | null;
        owner: string;
        host: string;
        projectCount: number;
        sessionCount: number;
        liveSessionCount: number;
    }[];
    machineName: string;
    unmappedProjectCount?: number | undefined;
}>;
type DiscoveryRequest = z.infer<typeof DiscoveryRequestSchema>;
declare const DiscoveryResponseSchema: z.ZodObject<{
    /** Rows written or updated. */
    accepted: z.ZodNumber;
    /** Of those, awaiting a member's decision. */
    proposed: z.ZodNumber;
    /** Already routed to a machine — nothing to decide. */
    alreadyRouted: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    accepted: number;
    proposed: number;
    alreadyRouted: number;
}, {
    accepted: number;
    proposed: number;
    alreadyRouted: number;
}>;
type DiscoveryResponse = z.infer<typeof DiscoveryResponseSchema>;
/**
 * Neutralise markdown in attacker-influenced text before it reaches a board.
 *
 * A transcript is untrusted input the moment a user pastes anything into a
 * session, and title/summary are the two fields derived from it. They land in a
 * Linear issue that a whole team reads, so a summary containing
 * `[click here](javascript:…)` or a fenced block that swallows the rest of the
 * comment is a real outcome, not a hypothetical one.
 *
 * Escaping rather than stripping: a title that legitimately contains an
 * underscore should still read correctly.
 */
declare function escapeLinearMarkdown(text: string): string;
interface AdoptionCommentInput {
    identifier: string;
    machineName: string;
    agent: AdoptionAgent;
    summary?: string;
    branch?: string;
    touchedPaths?: string[];
    startedAt: string;
    lastActivityAt: string;
}
/**
 * The comment an adopted session posts when it settles.
 *
 * The wording is load-bearing. TRD 21 DECISION A says an adopted session never
 * moves the issue's state, and the reason is that DevPilot did not do this work
 * and cannot judge whether it is finished. A comment that read like a normal
 * completion would undo that care in prose — anyone scanning the ticket would
 * take it as "the agent finished". So it says, in the first line, that the
 * session was observed rather than dispatched, and it never says "completed".
 */
declare function buildAdoptionComment(input: AdoptionCommentInput): string;
/** The body of an issue created for an adopted session. */
declare function buildAdoptionIssueDescription(input: {
    machineName: string;
    agent: AdoptionAgent;
    repo: string;
    branch?: string;
    summary?: string;
    startedAt: string;
}): string;
declare function linearIdentifierFromBranch(branch: string): string | null;

export { ADOPTION_AGENTS, ADOPTION_LIMITS, ADOPTION_MATCH_KINDS, ADOPTION_OUTCOME_STATUSES, AGENT_KINDS, type AdoptionAgent, AdoptionAgentSchema, type AdoptionCandidate, AdoptionCandidateSchema, type AdoptionCommentInput, type AdoptionMatchKind, AdoptionMatchKindSchema, type AdoptionOutcome, AdoptionOutcomeSchema, type AdoptionOutcomeStatus, AdoptionOutcomeStatusSchema, type AdoptionRequest, AdoptionRequestSchema, type AdoptionResponse, AdoptionResponseSchema, type AgentKind, AgentKindSchema, type ApiErrorBody, ApiErrorSchema, type CompletionCommentInput, type CreateSharedSessionRequest, CreateSharedSessionRequestSchema, type CreateSharedSessionResponse, CreateSharedSessionResponseSchema, type DiscoveredRepo, DiscoveredRepoSchema, type DiscoveryRequest, DiscoveryRequestSchema, type DiscoveryResponse, DiscoveryResponseSchema, DispatchPollResponseSchema, ERROR_CODES, type HeartbeatRequest, HeartbeatRequestSchema, JOIN_PROOF_HEADER, type JoinCredentials, type JoinSessionRequest, JoinSessionRequestSchema, type JoinSessionResponse, JoinSessionResponseSchema, PARTICIPANT_KINDS, type ParticipantKind, ParticipantKindSchema, type PostSessionMessageRequest, PostSessionMessageRequestSchema, type PostSessionMessageResponse, PostSessionMessageResponseSchema, type ProgressCommentInput, RealtimeCredentialsSchema, type RegisterRequest, RegisterRequestSchema, type RegisterResponse, RegisterResponseSchema, RepoSlugSchema, type RotateSessionKeyRequest, RotateSessionKeyRequestSchema, type RotateSessionKeyResponse, RotateSessionKeyResponseSchema, SESSION_EVENT_TYPES, SESSION_LIMITS, SESSION_MESSAGE_KINDS, SESSION_MODES, SESSION_STATUSES, type SessionCipher, type SessionComplete, SessionCompleteResponseSchema, SessionCompleteSchema, SessionCryptoError, SessionDecryptionError, type SessionEventType, SessionEventTypeSchema, SessionKeyError, type SessionMessage, type SessionMessageKind, SessionMessageKindSchema, type SessionMessagePage, SessionMessagePageSchema, SessionMessageSchema, type SessionMode, SessionModeSchema, type SessionParticipant, SessionParticipantSchema, type SessionStatus, SessionStatusSchema, type SessionStatusUpdate, SessionStatusUpdateSchema, type SetSessionModeRequest, SetSessionModeRequestSchema, type SharedSession, SharedSessionSchema, TERMINAL_STATUSES, type TaskDispatchMessage, TaskDispatchMessageSchema, type TerminalStatus, buildAdoptionComment, buildAdoptionIssueDescription, buildBridgeCompletionComment, buildCompletionComment, buildJoinLink, buildProgressComment, escapeLinearMarkdown, formatApiError, isTerminal, linearIdentifierFromBranch, parseJoinLink, parseSessionMessage, parseSessionMessagePage, parseTaskDispatchMessage, safeParseSessionMessage, safeParseTaskDispatchMessage, sessionCrypto };
