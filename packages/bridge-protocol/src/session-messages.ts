import { z } from 'zod';

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

// ── Enumerations ────────────────────────────────────────────────────────────

/**
 * §3.3. `observe` is the default and the safe one: agents read when asked, and
 * a message landing in the transcript wakes nobody. Anything else is opt-in,
 * budget-bounded and expiring.
 */
export const SESSION_MODES = ['observe', 'relay', 'auto'] as const;
export const SessionModeSchema = z.enum(SESSION_MODES);
export type SessionMode = z.infer<typeof SessionModeSchema>;

/**
 * Deliberately coarse. Enough for the UI to pick a bubble style and for rate
 * limits to distinguish a human typing from an agent dumping build output — and
 * deliberately not enough to reveal anything about content.
 */
export const SESSION_MESSAGE_KINDS = ['chat', 'agent_output', 'system'] as const;
export const SessionMessageKindSchema = z.enum(SESSION_MESSAGE_KINDS);
export type SessionMessageKind = z.infer<typeof SessionMessageKindSchema>;

export const PARTICIPANT_KINDS = ['human', 'agent'] as const;
export const ParticipantKindSchema = z.enum(PARTICIPANT_KINDS);
export type ParticipantKind = z.infer<typeof ParticipantKindSchema>;

/** Open-ended by intent: a bridge implementation may carry an agent we do not ship. */
export const AGENT_KINDS = ['claude-code', 'codex', 'ao', 'other'] as const;
export const AgentKindSchema = z.enum(AGENT_KINDS);
export type AgentKind = z.infer<typeof AgentKindSchema>;

// ── Limits (§5) ─────────────────────────────────────────────────────────────
//
// Declared in the protocol so a client can refuse an oversized message locally
// instead of discovering the cap as a 429 after the round trip. These are the
// DEFAULTS; the server's configured value is authoritative and is what actually
// enforces. A client must never treat agreement here as permission.

export const SESSION_LIMITS = {
  /** Per participant, per session. */
  messagesPerMinute: 60,
  /** Ciphertext bytes, not plaintext — what the server actually stores. */
  maxCiphertextBytes: 256 * 1024,
  /** §3.3 `auto` bounds. Exhausting either drops the session to `observe`. */
  autoDefaultBudget: 20,
  autoDefaultTtlMinutes: 30,
} as const;

// ── Core records ────────────────────────────────────────────────────────────

export const SessionMessageSchema = z.object({
  id: z.string().min(1),
  sessionId: z.string().min(1),
  /** Null once a participant row is removed; the message survives them. */
  participantId: z.string().min(1).nullable(),
  /**
   * AES-256-GCM, base64(iv).base64(ct).base64(tag), encrypted with a key
   * derived from the session key by sessionCrypto. OPAQUE TO THE SERVER.
   */
  ciphertext: z.string().min(1),
  /** Which key version sealed this, so rotation does not orphan history (§4.4). */
  keyVersion: z.number().int().positive(),
  kind: SessionMessageKindSchema,
  /** Monotonic per session, assigned by the server. Clients order by THIS, not by clock. */
  seq: z.number().int().positive(),
  createdAt: z.string().datetime(),
});
export type SessionMessage = z.infer<typeof SessionMessageSchema>;

export const SessionParticipantSchema = z.object({
  id: z.string().min(1),
  sessionId: z.string().min(1),
  kind: ParticipantKindSchema,
  /** Chosen by the joiner and NOT AUTHENTICATED. The UI must not imply otherwise. */
  displayName: z.string().min(1).max(120),
  agentKind: AgentKindSchema.nullable().optional(),
  joinedAt: z.string().datetime(),
  lastSeenAt: z.string().datetime().nullable().optional(),
  leftAt: z.string().datetime().nullable().optional(),
});
export type SessionParticipant = z.infer<typeof SessionParticipantSchema>;

/**
 * Session metadata as a participant sees it.
 *
 * Note what is absent: `joinKeyHash` and `orgId` are server-side concerns and
 * are never returned to a participant, who may be from another org entirely.
 */
export const SharedSessionSchema = z.object({
  id: z.string().min(1),
  /** Plaintext BY CHOICE — it is the portal list label. Never put secrets here. */
  title: z.string().min(1).max(200),
  mode: SessionModeSchema,
  keyVersion: z.number().int().positive(),
  linearIdentifier: z.string().min(1).nullable().optional(),
  autoBudgetRemaining: z.number().int().nonnegative().optional(),
  autoExpiresAt: z.string().datetime().nullable().optional(),
  closedAt: z.string().datetime().nullable().optional(),
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
  lastSeq: z.number().int().nonnegative().optional(),
  createdAt: z.string().datetime(),
});
export type SharedSession = z.infer<typeof SharedSessionSchema>;

// ── Requests & responses (§5) ───────────────────────────────────────────────

/**
 * POST /api/sessions/shared
 *
 * Carries `joinKeyHash` and NOT the key, nor the verifier. The client derives
 * both locally; only the hash is transmissible. A `key` field on this schema
 * would be a breach of §7.1 — hence the `.strict()`, which makes an accidental
 * extra field a parse failure rather than a silently forwarded secret.
 */
export const CreateSharedSessionRequestSchema = z
  .object({
    title: z.string().min(1).max(200),
    /** sha256 hex of the join verifier. 64 lowercase hex chars. */
    joinKeyHash: z.string().regex(/^[0-9a-f]{64}$/, 'joinKeyHash must be 64 lowercase hex chars'),
    linearIssueId: z.string().min(1).optional(),
    linearIdentifier: z.string().min(1).optional(),
  })
  .strict();
export type CreateSharedSessionRequest = z.infer<typeof CreateSharedSessionRequestSchema>;

export const CreateSharedSessionResponseSchema = z.object({
  session: SharedSessionSchema,
});
export type CreateSharedSessionResponse = z.infer<typeof CreateSharedSessionResponseSchema>;

/**
 * POST /api/sessions/shared/:id/join
 *
 * The proof travels in the `X-Session-Key-Proof` header rather than the body,
 * so it stays out of anything that logs request payloads.
 */
export const JOIN_PROOF_HEADER = 'x-session-key-proof';

export const JoinSessionRequestSchema = z
  .object({
    displayName: z.string().min(1).max(120),
    kind: ParticipantKindSchema.default('human'),
    agentKind: AgentKindSchema.optional(),
    /** Set when an agent participant is bound to a registered machine. */
    orchestratorId: z.string().min(1).optional(),
  })
  .strict();
export type JoinSessionRequest = z.infer<typeof JoinSessionRequestSchema>;

export const JoinSessionResponseSchema = z.object({
  /**
   * Short-lived JWT scoped to ONE session. Message routes authenticate with
   * this and never with org membership — that is what lets an outside
   * collaborator participate without being provisioned into the org (§5).
   */
  participantToken: z.string().min(1),
  expiresAt: z.string().datetime(),
  participant: SessionParticipantSchema,
  session: SharedSessionSchema,
});
export type JoinSessionResponse = z.infer<typeof JoinSessionResponseSchema>;

/** POST /api/sessions/shared/:id/messages — the server assigns `seq`, never the client. */
export const PostSessionMessageRequestSchema = z
  .object({
    ciphertext: z.string().min(1).max(SESSION_LIMITS.maxCiphertextBytes),
    kind: SessionMessageKindSchema.default('chat'),
    keyVersion: z.number().int().positive(),
    /**
     * Client-generated idempotency key. A retried POST after a timeout must not
     * double-post: the transport is at-least-once, so the write has to be
     * deduplicated somewhere, and the client is the only party that knows two
     * requests were the same intent.
     */
    clientNonce: z.string().min(8).max(64).optional(),
  })
  .strict();
export type PostSessionMessageRequest = z.infer<typeof PostSessionMessageRequestSchema>;

export const PostSessionMessageResponseSchema = z.object({
  message: SessionMessageSchema,
});
export type PostSessionMessageResponse = z.infer<typeof PostSessionMessageResponseSchema>;

/** GET /api/sessions/shared/:id/messages?since=<seq> */
export const SessionMessagePageSchema = z.object({
  messages: z.array(SessionMessageSchema),
  /** Highest `seq` in this page; the cursor for the next `?since=`. */
  latestSeq: z.number().int().nonnegative(),
  hasMore: z.boolean(),
});
export type SessionMessagePage = z.infer<typeof SessionMessagePageSchema>;

/** POST /api/sessions/shared/:id/mode */
export const SetSessionModeRequestSchema = z
  .object({
    mode: SessionModeSchema,
    /** Required when mode is `auto`; ignored otherwise. §3.3 admits no unbounded autonomy. */
    autoBudget: z.number().int().positive().max(200).optional(),
    autoTtlMinutes: z.number().int().positive().max(240).optional(),
  })
  .strict()
  .refine((v) => v.mode !== 'auto' || (v.autoBudget !== undefined && v.autoTtlMinutes !== undefined), {
    message: 'auto mode requires both autoBudget and autoTtlMinutes — it is never unbounded.',
    path: ['mode'],
  });
export type SetSessionModeRequest = z.infer<typeof SetSessionModeRequestSchema>;

/**
 * POST /api/sessions/shared/:id/rotate
 *
 * Same asymmetry as creation: the caller generates the new key client-side and
 * sends only its hash. Rotation stops FUTURE reads by old-link holders; it does
 * not retract past access, and nothing in this schema should suggest it does.
 */
export const RotateSessionKeyRequestSchema = z
  .object({
    joinKeyHash: z.string().regex(/^[0-9a-f]{64}$/, 'joinKeyHash must be 64 lowercase hex chars'),
  })
  .strict();
export type RotateSessionKeyRequest = z.infer<typeof RotateSessionKeyRequestSchema>;

export const RotateSessionKeyResponseSchema = z.object({
  keyVersion: z.number().int().positive(),
});
export type RotateSessionKeyResponse = z.infer<typeof RotateSessionKeyResponseSchema>;

// ── Parse helpers ───────────────────────────────────────────────────────────

export function parseSessionMessage(input: unknown): SessionMessage {
  return SessionMessageSchema.parse(input);
}

export function safeParseSessionMessage(input: unknown) {
  return SessionMessageSchema.safeParse(input);
}

export function parseSessionMessagePage(input: unknown): SessionMessagePage {
  return SessionMessagePageSchema.parse(input);
}
