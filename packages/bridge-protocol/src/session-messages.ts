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
/**
 * Why someone is being asked into a session. A label for people and agents;
 * the MODE is still what governs what an agent may do.
 *
 *   look — "I'm seeing something, come and see." Agents post only when asked.
 *   pair — people and their agents work one problem; agents ask before replying.
 *   fix  — the agents may work it out between them, bounded.
 */
export const SESSION_INTENTS = ['look', 'pair', 'fix'] as const;
export const SessionIntentSchema = z.enum(SESSION_INTENTS);
export type SessionIntent = z.infer<typeof SessionIntentSchema>;

/** The mode an intent starts a session in. */
export const INTENT_MODE: Record<SessionIntent, SessionMode> = { look: 'observe', pair: 'relay', fix: 'auto' };

/** How long a session lasts before it ends and its messages are deleted. */
export const SESSION_LIFETIMES = ['1h', '24h', '7d'] as const;
export const SessionLifetimeSchema = z.enum(SESSION_LIFETIMES);
export type SessionLifetime = z.infer<typeof SessionLifetimeSchema>;

const REPO_NAME = /^(?!\.+\/)[A-Za-z0-9._-]+\/(?!\.+$)[A-Za-z0-9._-]+$/;

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
  /** Absent from a hosted plane older than these fields. */
  intent: SessionIntentSchema.optional(),
  /** `owner/name` of the repository the session is about. */
  repo: z.string().nullable().optional(),
  /** When the session ends and its messages are deleted. */
  expiresAt: z.string().datetime().optional(),
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
    intent: SessionIntentSchema.optional(),
    /** `owner/name`. Never a path. */
    repo: z.string().regex(REPO_NAME).max(200).optional(),
    lifetime: SessionLifetimeSchema.optional(),
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

// ── The handoff ─────────────────────────────────────────────────────────────

export interface SessionHandoffInput {
  title: string;
  /** The full join link, fragment included. This text IS a credential. */
  link: string;
  mode: SessionMode;
  autoBudget?: number;
  autoTtlMinutes?: number;
  intent?: SessionIntent;
  repo?: string | null;
  /** ISO time the session ends. */
  expiresAt?: string;
}

/** What each intent asks of whoever is being brought in, in one line. */
export const INTENT_ASK: Record<SessionIntent, string> = {
  look: 'I am seeing something and want another pair of eyes on it.',
  pair: 'I want to work this through together, with our agents following along.',
  fix: 'I want our agents to work this out between them and report back.',
};

/**
 * What a joining agent is told about why it is there and what to do first.
 * ONE builder, used by the handoff message and by the join tool's answer.
 */
export function sessionBriefing(input: { intent?: SessionIntent; mode: SessionMode; repo?: string | null; expiresAt?: string }): string {
  const lines: string[] = [];
  if (input.intent) lines.push(`Why you were brought in: ${INTENT_ASK[input.intent]}`);
  if (input.repo) lines.push(`It is about the repository ${input.repo}.`);
  lines.push(
    input.mode === 'auto'
      ? 'What is expected of you: read the opening context, then work the problem with the other agent — reply with ' +
          'devpilot_session_post, wait with devpilot_session_wait — and tell your person what you conclude. Stop when ' +
          'the session says the budget is spent.'
      : input.mode === 'relay'
        ? 'What is expected of you: read the opening context, tell your person what is being asked and what you make ' +
            'of it, and ask them before you reply. You may wait for new messages with devpilot_session_wait.'
        : 'What is expected of you: read the opening context and tell your person what is being asked and what you ' +
            'make of it. Post only when they ask you to.',
  );
  if (input.expiresAt) lines.push(`The session ends at ${input.expiresAt}; its messages are deleted then.`);
  return lines.join('\n');
}

/**
 * The message one person sends another to bring their agent into a session.
 *
 * Starting a session produced a bare link and "others join with: devpilot
 * session join". The person receiving it had to already know that an MCP server
 * existed, how to add it, and what to ask their agent to do with a URL — so in
 * practice a shared session started with a second conversation explaining how
 * to have the first one.
 *
 * This is written to be pasted whole into the recipient's Claude Code. Half of
 * it addresses the person (how to get the tools, how to treat the link) and
 * half addresses their agent (join, read, report back before acting). The
 * agent's half ends with what the session's mode permits, because that is the
 * instruction most likely to be got wrong: an agent told only to "join" does
 * not know whether replying on its own is expected.
 *
 * It carries the link and therefore the key. Whoever renders it is responsible
 * for where it goes — the MCP server puts it on the clipboard rather than into
 * a tool result for exactly that reason.
 *
 * ONE builder, here, so the CLI, the MCP server and the portal cannot each say
 * it slightly differently.
 */
export function buildSessionHandoff(input: SessionHandoffInput): string {
  const budget = input.autoBudget ?? SESSION_LIMITS.autoDefaultBudget;
  const ttl = input.autoTtlMinutes ?? SESSION_LIMITS.autoDefaultTtlMinutes;

  const modeLine =
    input.mode === 'auto'
      ? `This session is in auto mode for up to ${budget} agent messages or ${ttl} minutes: ` +
        'you may reply to the other agent with devpilot_session_post and wait for answers ' +
        'with devpilot_session_wait. Stop when the session says the budget is spent.'
      : input.mode === 'relay'
        ? 'This session is in relay mode: you may wait for new messages with ' +
          'devpilot_session_wait, but ask me before replying.'
        : 'This session is in observe mode: post only when I ask you to.';

  const why = input.intent ? [INTENT_ASK[input.intent] + (input.repo ? ` (${input.repo})` : ''), ''] : [];
  const ends = input.expiresAt ? [`It ends ${input.expiresAt.slice(0, 16).replace('T', ' ')} UTC, and what was said is deleted then.`] : [];

  return [
    `Join my DevPilot shared session: "${input.title}"`,
    '',
    ...why,
    input.link,
    '',
    'Paste this whole message into Claude Code. It tells your agent what to do:',
    '',
    '  Call devpilot_session_join with the link above, then devpilot_session_read,',
    '  and tell me what the other side has posted before you do anything else.',
    `  ${modeLine}`,
    '',
    'No devpilot_session tools? Run this once in a terminal, then start a new Claude Code session:',
    '  claude mcp add --scope user devpilot-local -- npx -y @devpilot.sh/mcp-session',
    '',
    'Or just open the link in a browser to read along. No DevPilot account is needed either way.',
    '',
    'This link is the key to the session. Anyone holding it can read all of it, so send it in a DM, not a channel.',
    ...ends,
  ].join('\n');
}

/**
 * Find a join link inside arbitrary text — a pasted handoff, a clipboard.
 *
 * Returns the link or null. Deliberately strict about the shape (`/s/<id>` and
 * a `#k=` fragment) so that a clipboard holding something else is not mistaken
 * for one, and never throws: the caller is usually deciding what to tell a
 * person, and "there is no link here" is an answer.
 */
export function findJoinLink(text: string): string | null {
  const match = /(?:https?:\/\/)?[A-Za-z0-9.-]+(?::\d+)?\/s\/[A-Za-z0-9_%-]+#k=[A-Za-z0-9_-]+/.exec(text);
  return match ? match[0] : null;
}

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
