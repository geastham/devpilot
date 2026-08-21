"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var index_exports = {};
__export(index_exports, {
  ADOPTION_AGENTS: () => ADOPTION_AGENTS,
  ADOPTION_LIMITS: () => ADOPTION_LIMITS,
  ADOPTION_MATCH_KINDS: () => ADOPTION_MATCH_KINDS,
  ADOPTION_OUTCOME_STATUSES: () => ADOPTION_OUTCOME_STATUSES,
  AGENT_KINDS: () => AGENT_KINDS,
  AdoptionAgentSchema: () => AdoptionAgentSchema,
  AdoptionCandidateSchema: () => AdoptionCandidateSchema,
  AdoptionMatchKindSchema: () => AdoptionMatchKindSchema,
  AdoptionOutcomeSchema: () => AdoptionOutcomeSchema,
  AdoptionOutcomeStatusSchema: () => AdoptionOutcomeStatusSchema,
  AdoptionRequestSchema: () => AdoptionRequestSchema,
  AdoptionResponseSchema: () => AdoptionResponseSchema,
  AgentKindSchema: () => AgentKindSchema,
  ApiErrorSchema: () => ApiErrorSchema,
  CreateSharedSessionRequestSchema: () => CreateSharedSessionRequestSchema,
  CreateSharedSessionResponseSchema: () => CreateSharedSessionResponseSchema,
  DiscoveredRepoSchema: () => DiscoveredRepoSchema,
  DiscoveryRequestSchema: () => DiscoveryRequestSchema,
  DiscoveryResponseSchema: () => DiscoveryResponseSchema,
  DispatchPollResponseSchema: () => DispatchPollResponseSchema,
  ERROR_CODES: () => ERROR_CODES,
  HeartbeatRequestSchema: () => HeartbeatRequestSchema,
  JOIN_PROOF_HEADER: () => JOIN_PROOF_HEADER,
  JoinSessionRequestSchema: () => JoinSessionRequestSchema,
  JoinSessionResponseSchema: () => JoinSessionResponseSchema,
  ObservationRequestSchema: () => ObservationRequestSchema,
  ObservationResponseSchema: () => ObservationResponseSchema,
  PARTICIPANT_KINDS: () => PARTICIPANT_KINDS,
  ParticipantKindSchema: () => ParticipantKindSchema,
  PostSessionMessageRequestSchema: () => PostSessionMessageRequestSchema,
  PostSessionMessageResponseSchema: () => PostSessionMessageResponseSchema,
  RealtimeCredentialsSchema: () => RealtimeCredentialsSchema,
  RegisterRequestSchema: () => RegisterRequestSchema,
  RegisterResponseSchema: () => RegisterResponseSchema,
  RepoSlugSchema: () => RepoSlugSchema,
  RotateSessionKeyRequestSchema: () => RotateSessionKeyRequestSchema,
  RotateSessionKeyResponseSchema: () => RotateSessionKeyResponseSchema,
  SESSION_EVENT_TYPES: () => SESSION_EVENT_TYPES,
  SESSION_LIMITS: () => SESSION_LIMITS,
  SESSION_MESSAGE_KINDS: () => SESSION_MESSAGE_KINDS,
  SESSION_MODES: () => SESSION_MODES,
  SESSION_STATUSES: () => SESSION_STATUSES,
  SessionCompleteResponseSchema: () => SessionCompleteResponseSchema,
  SessionCompleteSchema: () => SessionCompleteSchema,
  SessionCryptoError: () => SessionCryptoError,
  SessionDecryptionError: () => SessionDecryptionError,
  SessionEventTypeSchema: () => SessionEventTypeSchema,
  SessionKeyError: () => SessionKeyError,
  SessionMessageKindSchema: () => SessionMessageKindSchema,
  SessionMessagePageSchema: () => SessionMessagePageSchema,
  SessionMessageSchema: () => SessionMessageSchema,
  SessionModeSchema: () => SessionModeSchema,
  SessionParticipantSchema: () => SessionParticipantSchema,
  SessionStatusSchema: () => SessionStatusSchema,
  SessionStatusUpdateSchema: () => SessionStatusUpdateSchema,
  SetSessionModeRequestSchema: () => SetSessionModeRequestSchema,
  SharedSessionSchema: () => SharedSessionSchema,
  TERMINAL_STATUSES: () => TERMINAL_STATUSES,
  TaskDispatchMessageSchema: () => TaskDispatchMessageSchema,
  buildAdoptionComment: () => buildAdoptionComment,
  buildAdoptionIssueDescription: () => buildAdoptionIssueDescription,
  buildBridgeCompletionComment: () => buildBridgeCompletionComment,
  buildCompletionComment: () => buildCompletionComment,
  buildJoinLink: () => buildJoinLink,
  buildProgressComment: () => buildProgressComment,
  escapeLinearMarkdown: () => escapeLinearMarkdown,
  formatApiError: () => formatApiError,
  isTerminal: () => isTerminal,
  linearIdentifierFromBranch: () => linearIdentifierFromBranch,
  parseJoinLink: () => parseJoinLink,
  parseSessionMessage: () => parseSessionMessage,
  parseSessionMessagePage: () => parseSessionMessagePage,
  parseTaskDispatchMessage: () => parseTaskDispatchMessage,
  safeParseSessionMessage: () => safeParseSessionMessage,
  safeParseTaskDispatchMessage: () => safeParseTaskDispatchMessage,
  sessionCrypto: () => sessionCrypto
});
module.exports = __toCommonJS(index_exports);

// src/messages.ts
var import_zod = require("zod");
var TaskDispatchMessageSchema = import_zod.z.object({
  /** cuid2, assigned at enqueue time. */
  messageId: import_zod.z.string().min(1),
  /** dispatch_sessions.id — THE REPORT-BACK KEY. Without it a client cannot report progress. */
  sessionId: import_zod.z.string().min(1),
  /** dispatch_queue.id — the claim/settle key. */
  queueId: import_zod.z.string().min(1),
  orgId: import_zod.z.string().min(1),
  workspaceId: import_zod.z.string().min(1),
  linearIssueId: import_zod.z.string().min(1),
  /** e.g. 'ENG-394' */
  linearIdentifier: import_zod.z.string().min(1),
  title: import_zod.z.string().min(1),
  description: import_zod.z.string().optional(),
  teamId: import_zod.z.string().min(1),
  priority: import_zod.z.number().int().min(0).max(4).optional(),
  labels: import_zod.z.array(import_zod.z.string()).optional(),
  repo: import_zod.z.string().min(1),
  /** Required — routing is resolved before enqueue, never by the client. */
  targetOrchestratorId: import_zod.z.string().min(1),
  /** ISO 8601 */
  dispatchedAt: import_zod.z.string().datetime()
});
function parseTaskDispatchMessage(input) {
  return TaskDispatchMessageSchema.parse(input);
}
function safeParseTaskDispatchMessage(input) {
  return TaskDispatchMessageSchema.safeParse(input);
}

// src/status.ts
var import_zod2 = require("zod");
var SESSION_STATUSES = [
  "pending",
  "dispatched",
  "running",
  "complete",
  "error",
  "cancelled"
];
var SessionStatusSchema = import_zod2.z.enum(SESSION_STATUSES);
var TERMINAL_STATUSES = ["complete", "error", "cancelled"];
function isTerminal(status) {
  return TERMINAL_STATUSES.includes(status);
}
var SESSION_EVENT_TYPES = [
  "created",
  "dispatched",
  "progress",
  "complete",
  "error",
  "cancelled",
  "telemetry"
];
var SessionEventTypeSchema = import_zod2.z.enum(SESSION_EVENT_TYPES);

// src/api.ts
var import_zod3 = require("zod");
var RegisterRequestSchema = import_zod3.z.object({
  /** REQUIRED. Its absence is the historical 400. Defaults to os.hostname() client-side. */
  name: import_zod3.z.string().min(1).max(120),
  repos: import_zod3.z.array(import_zod3.z.string().min(1)),
  maxConcurrentJobs: import_zod3.z.number().int().min(1).max(64).default(4)
});
var RealtimeCredentialsSchema = import_zod3.z.object({
  /**
   * Everything the client needs to open the channel, returned by the bridge so
   * a machine does not have to be told out-of-band where the realtime endpoint
   * lives. Both URL and anon key are public by design — the dispatch_queue RLS
   * policy plus the scoped `jwt` are what constrain access.
   */
  supabaseUrl: import_zod3.z.string().url(),
  anonKey: import_zod3.z.string().min(1),
  jwt: import_zod3.z.string().min(1),
  expiresAt: import_zod3.z.string().datetime(),
  channel: import_zod3.z.string().min(1),
  table: import_zod3.z.string().min(1)
});
var RegisterResponseSchema = import_zod3.z.object({
  orchestratorId: import_zod3.z.string().min(1),
  orgId: import_zod3.z.string().min(1),
  /** null when SUPABASE_JWT_SECRET is unavailable — the client falls back to polling. */
  realtime: RealtimeCredentialsSchema.nullable()
});
var HeartbeatRequestSchema = import_zod3.z.object({
  activeJobs: import_zod3.z.number().int().min(0).optional()
});
var SessionStatusUpdateSchema = import_zod3.z.object({
  status: SessionStatusSchema,
  progressPercent: import_zod3.z.number().int().min(0).max(100),
  message: import_zod3.z.string().max(2e3).optional()
});
var SessionCompleteSchema = import_zod3.z.object({
  success: import_zod3.z.boolean(),
  prUrl: import_zod3.z.string().url().optional(),
  summary: import_zod3.z.string().max(1e4).optional(),
  tokensUsed: import_zod3.z.number().int().min(0).optional(),
  costUsd: import_zod3.z.number().min(0).optional(),
  errorMessage: import_zod3.z.string().max(1e4).optional()
});
var SessionCompleteResponseSchema = import_zod3.z.object({
  status: import_zod3.z.literal("completed"),
  /** false when Linear sync failed — never fails the request itself. */
  linearSynced: import_zod3.z.boolean(),
  linearError: import_zod3.z.string().optional()
});
var DispatchPollResponseSchema = import_zod3.z.object({
  /** Unclaimed queue rows for the calling orchestrator, oldest first. */
  messages: import_zod3.z.array(import_zod3.z.unknown())
});
var ERROR_CODES = [
  "unauthenticated",
  "forbidden",
  "not_found",
  "invalid_request",
  "conflict",
  "rate_limited",
  "internal",
  "service_unavailable"
];
var ApiErrorSchema = import_zod3.z.object({
  error: import_zod3.z.object({
    code: import_zod3.z.enum(ERROR_CODES),
    message: import_zod3.z.string(),
    details: import_zod3.z.unknown().optional()
  })
});
function formatApiError(body, fallback) {
  const parsed = ApiErrorSchema.safeParse(body);
  return parsed.success ? `${parsed.data.error.code}: ${parsed.data.error.message}` : fallback;
}

// src/session-crypto.ts
var KEY_BYTES = 32;
var IV_BYTES = 12;
var TAG_BYTES = 16;
var TAG_BITS = TAG_BYTES * 8;
var HKDF_SALT = "devpilot-session/v1";
var INFO_CONTENT = "dp-session-content/v1";
var INFO_VERIFY = "dp-session-verify/v1";
var SessionCryptoError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "SessionCryptoError";
  }
};
var SessionKeyError = class extends SessionCryptoError {
  constructor(message) {
    super(message);
    this.name = "SessionKeyError";
  }
};
var SessionDecryptionError = class extends SessionCryptoError {
  constructor(message) {
    super(message);
    this.name = "SessionDecryptionError";
  }
};
function subtleCrypto() {
  const c = globalThis.crypto;
  if (!c || !c.subtle) {
    throw new SessionCryptoError(
      "WebCrypto is unavailable. Shared sessions require Node 18+ or a browser with a secure context (https or localhost)."
    );
  }
  return c;
}
var utf8 = new TextEncoder();
var B64_STD = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
var B64_URL = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
var B64_REVERSE = (() => {
  const map = new Int16Array(128).fill(-1);
  for (let i = 0; i < 64; i++) {
    map[B64_STD.charCodeAt(i)] = i;
    map[B64_URL.charCodeAt(i)] = i;
  }
  return map;
})();
function toBase64(bytes, urlSafe) {
  const alpha = urlSafe ? B64_URL : B64_STD;
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = bytes[i + 1];
    const b2 = bytes[i + 2];
    out += alpha[b0 >> 2];
    out += alpha[(b0 & 3) << 4 | (b1 ?? 0) >> 4];
    if (b1 === void 0) {
      if (!urlSafe) out += "==";
      break;
    }
    out += alpha[(b1 & 15) << 2 | (b2 ?? 0) >> 6];
    if (b2 === void 0) {
      if (!urlSafe) out += "=";
      break;
    }
    out += alpha[b2 & 63];
  }
  return out;
}
function fromBase64(text) {
  const out = [];
  let acc = 0;
  let bits = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code === 61) break;
    const value = code < 128 ? B64_REVERSE[code] : -1;
    if (value < 0) {
      throw new SessionCryptoError("Malformed base64 payload.");
    }
    acc = acc << 6 | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out.push(acc >> bits & 255);
    }
  }
  return new Uint8Array(out);
}
function toHex(bytes) {
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i].toString(16).padStart(2, "0");
  }
  return out;
}
function parseKey(key) {
  let raw;
  try {
    raw = fromBase64(key);
  } catch {
    throw new SessionKeyError("Session key is not valid base64url.");
  }
  if (raw.length !== KEY_BYTES) {
    throw new SessionKeyError(
      `Session key must decode to ${KEY_BYTES} bytes, got ${raw.length}. The link is truncated or was not produced by sessionCrypto.generateKey().`
    );
  }
  return raw;
}
async function deriveBits(key, info, lengthBits) {
  const c = subtleCrypto();
  const ikm = await c.subtle.importKey("raw", parseKey(key), "HKDF", false, ["deriveBits"]);
  const bits = await c.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt: utf8.encode(HKDF_SALT), info: utf8.encode(info) },
    ikm,
    lengthBits
  );
  return new Uint8Array(bits);
}
async function deriveContentKey(key) {
  const raw = await deriveBits(key, INFO_CONTENT, KEY_BYTES * 8);
  return subtleCrypto().subtle.importKey("raw", raw, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt"
  ]);
}
async function sha256Hex(input) {
  const digest = await subtleCrypto().subtle.digest("SHA-256", utf8.encode(input));
  return toHex(new Uint8Array(digest));
}
async function encryptWithKey(plain, contentKey) {
  const c = subtleCrypto();
  const iv = c.getRandomValues(new Uint8Array(IV_BYTES));
  const sealed = new Uint8Array(
    await c.subtle.encrypt({ name: "AES-GCM", iv, tagLength: TAG_BITS }, contentKey, utf8.encode(plain))
  );
  const ct = sealed.subarray(0, sealed.length - TAG_BYTES);
  const tag = sealed.subarray(sealed.length - TAG_BYTES);
  return [toBase64(iv, false), toBase64(ct, false), toBase64(tag, false)].join(".");
}
async function decryptWithKey(payload, contentKey) {
  const parts = payload.split(".");
  if (parts.length !== 3) {
    throw new SessionDecryptionError("Ciphertext is malformed (expected iv.ciphertext.tag).");
  }
  let iv;
  let ct;
  let tag;
  try {
    iv = fromBase64(parts[0]);
    ct = fromBase64(parts[1]);
    tag = fromBase64(parts[2]);
  } catch {
    throw new SessionDecryptionError("Ciphertext is malformed (bad base64).");
  }
  if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) {
    throw new SessionDecryptionError("Ciphertext is malformed (bad iv or tag length).");
  }
  const sealed = new Uint8Array(ct.length + tag.length);
  sealed.set(ct, 0);
  sealed.set(tag, ct.length);
  try {
    const plain = await subtleCrypto().subtle.decrypt(
      { name: "AES-GCM", iv, tagLength: TAG_BITS },
      contentKey,
      sealed
    );
    return new TextDecoder().decode(plain);
  } catch {
    throw new SessionDecryptionError("Could not decrypt: wrong key or tampered ciphertext.");
  }
}
var sessionCrypto = {
  /** 32 random bytes, base64url. This is the value that goes in the fragment. */
  generateKey() {
    return toBase64(subtleCrypto().getRandomValues(new Uint8Array(KEY_BYTES)), true);
  },
  /**
   * Derive the join proof and the value the server stores.
   *
   * Creation sends `joinKeyHash` only. Joining sends `verifier`; the server
   * hashes it with `hashJoinVerifier` and compares in constant time.
   */
  async deriveJoinCredentials(key) {
    const verifier = toBase64(await deriveBits(key, INFO_VERIFY, KEY_BYTES * 8), true);
    return { verifier, joinKeyHash: await sha256Hex(verifier) };
  },
  /** Server-side half of the join check. Takes the verifier, never the key. */
  async hashJoinVerifier(verifier) {
    return sha256Hex(verifier);
  },
  /**
   * Constant-time comparison of a presented verifier against a stored hash.
   *
   * The server calls this. It cannot derive the verifier from what it stores,
   * which is the entire point of the split.
   */
  async verifyJoinProof(verifier, storedJoinKeyHash) {
    return timingSafeEqualString(await sha256Hex(verifier), storedJoinKeyHash);
  },
  async encrypt(plain, key) {
    return encryptWithKey(plain, await deriveContentKey(key));
  },
  /** Throws SessionDecryptionError on a wrong key or a tampered payload. */
  async decrypt(payload, key) {
    return decryptWithKey(payload, await deriveContentKey(key));
  },
  /** Bind a key once for repeated use. */
  async open(key) {
    const contentKey = await deriveContentKey(key);
    return {
      encrypt: (plain) => encryptWithKey(plain, contentKey),
      decrypt: (payload) => decryptWithKey(payload, contentKey)
    };
  }
};
function buildJoinLink(baseUrl, sessionId, key) {
  const base = baseUrl.replace(/\/+$/, "");
  return `${base}/s/${encodeURIComponent(sessionId)}#k=${key}`;
}
function parseJoinLink(link) {
  const hashAt = link.indexOf("#");
  if (hashAt === -1) {
    throw new SessionKeyError("Join link has no #k= fragment \u2014 the key is missing.");
  }
  const fragment = link.slice(hashAt + 1);
  const path = link.slice(0, hashAt);
  const keyMatch = /(?:^|&)k=([A-Za-z0-9_-]+)/.exec(fragment);
  if (!keyMatch) {
    throw new SessionKeyError("Join link fragment does not contain k=<key>.");
  }
  const idMatch = /\/s\/([^/?#]+)/.exec(path);
  if (!idMatch) {
    throw new SessionKeyError("Join link does not contain a /s/<id> path.");
  }
  const key = keyMatch[1];
  parseKey(key);
  return { sessionId: decodeURIComponent(idMatch[1]), key };
}
function timingSafeEqualString(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

// src/session-messages.ts
var import_zod4 = require("zod");
var SESSION_MODES = ["observe", "relay", "auto"];
var SessionModeSchema = import_zod4.z.enum(SESSION_MODES);
var SESSION_MESSAGE_KINDS = ["chat", "agent_output", "system"];
var SessionMessageKindSchema = import_zod4.z.enum(SESSION_MESSAGE_KINDS);
var PARTICIPANT_KINDS = ["human", "agent"];
var ParticipantKindSchema = import_zod4.z.enum(PARTICIPANT_KINDS);
var AGENT_KINDS = ["claude-code", "codex", "ao", "other"];
var AgentKindSchema = import_zod4.z.enum(AGENT_KINDS);
var SESSION_LIMITS = {
  /** Per participant, per session. */
  messagesPerMinute: 60,
  /** Ciphertext bytes, not plaintext — what the server actually stores. */
  maxCiphertextBytes: 256 * 1024,
  /** §3.3 `auto` bounds. Exhausting either drops the session to `observe`. */
  autoDefaultBudget: 20,
  autoDefaultTtlMinutes: 30
};
var SessionMessageSchema = import_zod4.z.object({
  id: import_zod4.z.string().min(1),
  sessionId: import_zod4.z.string().min(1),
  /** Null once a participant row is removed; the message survives them. */
  participantId: import_zod4.z.string().min(1).nullable(),
  /**
   * AES-256-GCM, base64(iv).base64(ct).base64(tag), encrypted with a key
   * derived from the session key by sessionCrypto. OPAQUE TO THE SERVER.
   */
  ciphertext: import_zod4.z.string().min(1),
  /** Which key version sealed this, so rotation does not orphan history (§4.4). */
  keyVersion: import_zod4.z.number().int().positive(),
  kind: SessionMessageKindSchema,
  /** Monotonic per session, assigned by the server. Clients order by THIS, not by clock. */
  seq: import_zod4.z.number().int().positive(),
  createdAt: import_zod4.z.string().datetime()
});
var SessionParticipantSchema = import_zod4.z.object({
  id: import_zod4.z.string().min(1),
  sessionId: import_zod4.z.string().min(1),
  kind: ParticipantKindSchema,
  /** Chosen by the joiner and NOT AUTHENTICATED. The UI must not imply otherwise. */
  displayName: import_zod4.z.string().min(1).max(120),
  agentKind: AgentKindSchema.nullable().optional(),
  joinedAt: import_zod4.z.string().datetime(),
  lastSeenAt: import_zod4.z.string().datetime().nullable().optional(),
  leftAt: import_zod4.z.string().datetime().nullable().optional()
});
var SharedSessionSchema = import_zod4.z.object({
  id: import_zod4.z.string().min(1),
  /** Plaintext BY CHOICE — it is the portal list label. Never put secrets here. */
  title: import_zod4.z.string().min(1).max(200),
  mode: SessionModeSchema,
  keyVersion: import_zod4.z.number().int().positive(),
  linearIdentifier: import_zod4.z.string().min(1).nullable().optional(),
  autoBudgetRemaining: import_zod4.z.number().int().nonnegative().optional(),
  autoExpiresAt: import_zod4.z.string().datetime().nullable().optional(),
  closedAt: import_zod4.z.string().datetime().nullable().optional(),
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
  lastSeq: import_zod4.z.number().int().nonnegative().optional(),
  createdAt: import_zod4.z.string().datetime()
});
var CreateSharedSessionRequestSchema = import_zod4.z.object({
  title: import_zod4.z.string().min(1).max(200),
  /** sha256 hex of the join verifier. 64 lowercase hex chars. */
  joinKeyHash: import_zod4.z.string().regex(/^[0-9a-f]{64}$/, "joinKeyHash must be 64 lowercase hex chars"),
  linearIssueId: import_zod4.z.string().min(1).optional(),
  linearIdentifier: import_zod4.z.string().min(1).optional()
}).strict();
var CreateSharedSessionResponseSchema = import_zod4.z.object({
  session: SharedSessionSchema
});
var JOIN_PROOF_HEADER = "x-session-key-proof";
var JoinSessionRequestSchema = import_zod4.z.object({
  displayName: import_zod4.z.string().min(1).max(120),
  kind: ParticipantKindSchema.default("human"),
  agentKind: AgentKindSchema.optional(),
  /** Set when an agent participant is bound to a registered machine. */
  orchestratorId: import_zod4.z.string().min(1).optional()
}).strict();
var JoinSessionResponseSchema = import_zod4.z.object({
  /**
   * Short-lived JWT scoped to ONE session. Message routes authenticate with
   * this and never with org membership — that is what lets an outside
   * collaborator participate without being provisioned into the org (§5).
   */
  participantToken: import_zod4.z.string().min(1),
  expiresAt: import_zod4.z.string().datetime(),
  participant: SessionParticipantSchema,
  session: SharedSessionSchema
});
var PostSessionMessageRequestSchema = import_zod4.z.object({
  ciphertext: import_zod4.z.string().min(1).max(SESSION_LIMITS.maxCiphertextBytes),
  kind: SessionMessageKindSchema.default("chat"),
  keyVersion: import_zod4.z.number().int().positive(),
  /**
   * Client-generated idempotency key. A retried POST after a timeout must not
   * double-post: the transport is at-least-once, so the write has to be
   * deduplicated somewhere, and the client is the only party that knows two
   * requests were the same intent.
   */
  clientNonce: import_zod4.z.string().min(8).max(64).optional()
}).strict();
var PostSessionMessageResponseSchema = import_zod4.z.object({
  message: SessionMessageSchema
});
var SessionMessagePageSchema = import_zod4.z.object({
  messages: import_zod4.z.array(SessionMessageSchema),
  /** Highest `seq` in this page; the cursor for the next `?since=`. */
  latestSeq: import_zod4.z.number().int().nonnegative(),
  hasMore: import_zod4.z.boolean()
});
var SetSessionModeRequestSchema = import_zod4.z.object({
  mode: SessionModeSchema,
  /** Required when mode is `auto`; ignored otherwise. §3.3 admits no unbounded autonomy. */
  autoBudget: import_zod4.z.number().int().positive().max(200).optional(),
  autoTtlMinutes: import_zod4.z.number().int().positive().max(240).optional()
}).strict().refine((v) => v.mode !== "auto" || v.autoBudget !== void 0 && v.autoTtlMinutes !== void 0, {
  message: "auto mode requires both autoBudget and autoTtlMinutes \u2014 it is never unbounded.",
  path: ["mode"]
});
var RotateSessionKeyRequestSchema = import_zod4.z.object({
  joinKeyHash: import_zod4.z.string().regex(/^[0-9a-f]{64}$/, "joinKeyHash must be 64 lowercase hex chars")
}).strict();
var RotateSessionKeyResponseSchema = import_zod4.z.object({
  keyVersion: import_zod4.z.number().int().positive()
});
function parseSessionMessage(input) {
  return SessionMessageSchema.parse(input);
}
function safeParseSessionMessage(input) {
  return SessionMessageSchema.safeParse(input);
}
function parseSessionMessagePage(input) {
  return SessionMessagePageSchema.parse(input);
}

// src/linear.ts
var PROGRESS_STATUS_EMOJI = {
  running: ":hourglass:",
  waiting: ":pause_button:",
  complete: ":white_check_mark:",
  error: ":x:"
};
var PROGRESS_FILE_LIMIT = 5;
var COMPLETION_FILE_LIMIT = 10;
function fileList(files, limit) {
  const lines = ["", "**Files modified:**"];
  files.slice(0, limit).forEach((f) => lines.push(`- \`${f}\``));
  if (files.length > limit) {
    lines.push(`- ... and ${files.length - limit} more`);
  }
  return lines;
}
function buildProgressComment(input) {
  const lines = [
    `${PROGRESS_STATUS_EMOJI[input.status]} **Progress Update: ${input.progressPercent}%**`,
    ""
  ];
  if (input.currentWorkstream) {
    lines.push(`Working on: ${input.currentWorkstream}`);
  }
  if (input.message) {
    lines.push("", input.message);
  }
  if (input.filesModified && input.filesModified.length > 0) {
    lines.push(...fileList(input.filesModified, PROGRESS_FILE_LIMIT));
  }
  return lines.join("\n");
}
function buildCompletionComment(input) {
  const emoji = input.success ? ":rocket:" : ":warning:";
  const status = input.success ? "Completed Successfully" : "Failed";
  const lines = [`${emoji} **Session ${status}**`, ""];
  if (input.prUrl) {
    lines.push(`**Pull Request:** [View PR](${input.prUrl})`);
  }
  if (input.completionMessage) {
    lines.push("", input.completionMessage);
  }
  if (input.filesModified && input.filesModified.length > 0) {
    lines.push(...fileList(input.filesModified, COMPLETION_FILE_LIMIT));
  }
  return lines.join("\n");
}
function buildBridgeCompletionComment(input) {
  if (!input.success) {
    return buildCompletionComment({
      success: false,
      completionMessage: input.errorMessage ? `Session failed \u2014 ${input.errorMessage}` : "Session failed \u2014 no error detail was reported."
    });
  }
  return buildCompletionComment({
    success: true,
    prUrl: input.prUrl,
    completionMessage: input.summary
  });
}

// src/adoption.ts
var import_zod5 = require("zod");
var ADOPTION_AGENTS = ["claude-code"];
var AdoptionAgentSchema = import_zod5.z.enum(ADOPTION_AGENTS);
var ADOPTION_MATCH_KINDS = ["branch", "title", "created"];
var AdoptionMatchKindSchema = import_zod5.z.enum(ADOPTION_MATCH_KINDS);
var ADOPTION_OUTCOME_STATUSES = [
  /** A new session row, and a new Linear issue. */
  "adopted",
  /** Already adopted — same `adoptionKey`. Nothing was written. */
  "duplicate",
  /** A new session row against an issue that already existed. */
  "attached",
  /** Nothing was written; `reason` says why. */
  "skipped"
];
var AdoptionOutcomeStatusSchema = import_zod5.z.enum(ADOPTION_OUTCOME_STATUSES);
var ADOPTION_LIMITS = {
  /** Per request. The CLI chunks beyond this. */
  MAX_CANDIDATES: 100,
  /** Paths only, and not many. A session touching more is summarised, not listed. */
  MAX_TOUCHED_PATHS: 50,
  MAX_TITLE_CHARS: 120,
  MAX_SUMMARY_CHARS: 400,
  /** Per discovery request. A machine with more repos than this has bigger problems. */
  MAX_DISCOVERED_REPOS: 500
};
var RepoSlugSchema = import_zod5.z.string().min(3).max(255).regex(/^[\w.-]+\/[\w.-]+$/, "repo must be owner/name");
var AdoptionCandidateSchema = import_zod5.z.object({
  /**
   * `sha256(machineName + ':' + sessionUuid)`, hex.
   *
   * Opaque on the wire and used only for idempotence. The machine name is in
   * the hash because two laptops share a session UUID only if someone copied
   * a `~/.claude` directory between them — and if they did, those genuinely
   * are two observations of two different machines.
   */
  adoptionKey: import_zod5.z.string().regex(/^[0-9a-f]{64}$/, "adoptionKey must be sha256 hex"),
  agent: AdoptionAgentSchema,
  /** One line. From the client's own session title where it has one. */
  title: import_zod5.z.string().min(1).max(ADOPTION_LIMITS.MAX_TITLE_CHARS),
  /** Derived locally. Never a quotation from the transcript. */
  summary: import_zod5.z.string().max(ADOPTION_LIMITS.MAX_SUMMARY_CHARS).optional(),
  repo: RepoSlugSchema,
  branch: import_zod5.z.string().max(255).optional(),
  startedAt: import_zod5.z.string().datetime(),
  lastActivityAt: import_zod5.z.string().datetime(),
  /** Approximate — see the probe's note on why it is not paid for exactly. */
  messageCount: import_zod5.z.number().int().nonnegative().optional(),
  /** Still running at scan time. */
  live: import_zod5.z.boolean(),
  /**
   * Changed file PATHS. Not contents, not diffs.
   *
   * This is what makes `getAvoidFiles` correct for a session DevPilot did not
   * start: without it, an adopted agent holds files nothing knows about.
   */
  touchedPaths: import_zod5.z.array(import_zod5.z.string().min(1).max(400)).max(ADOPTION_LIMITS.MAX_TOUCHED_PATHS).optional(),
  /**
   * Where this session is actually being driven — TRD 22 §6.3.
   *
   * DevPilot cannot steer a session it did not spawn, and pretending
   * otherwise would be worse than not offering it. But that reasoning
   * assumed the options were *steer* or *nothing*; there is a third, which
   * is to take the person to the place that already can.
   *
   * Constrained to `https://claude.ai/…` rather than any URL: this value
   * comes from a transcript, it is rendered as a link in a shared portal,
   * and an open redirect sourced from attacker-influenced local files is not
   * a trade worth making for flexibility nobody asked for.
   */
  webUrl: import_zod5.z.string().url().max(500).refine((u) => u.startsWith("https://claude.ai/"), "webUrl must be a claude.ai link").optional()
}).strict();
var AdoptionRequestSchema = import_zod5.z.object({
  machineName: import_zod5.z.string().min(1).max(255),
  candidates: import_zod5.z.array(AdoptionCandidateSchema).min(1).max(ADOPTION_LIMITS.MAX_CANDIDATES),
  /**
   * Preview. Every read runs — routing, duplicate detection, branch and title
   * matching — and the response says what creation *would* do. Nothing is
   * written and no Linear issue is created.
   *
   * This is what `devpilot sessions scan` calls, so the matches a user sees
   * before confirming are the real ones rather than a local guess that can
   * disagree with the server.
   */
  dryRun: import_zod5.z.boolean().default(false)
}).strict();
var AdoptionOutcomeSchema = import_zod5.z.object({
  adoptionKey: import_zod5.z.string(),
  status: AdoptionOutcomeStatusSchema,
  /** `dispatch_sessions.id`, or null when nothing was written. */
  sessionId: import_zod5.z.string().nullable(),
  linearIdentifier: import_zod5.z.string().nullable(),
  linearUrl: import_zod5.z.string().url().nullable(),
  matchedBy: AdoptionMatchKindSchema.nullable(),
  /** Present for `skipped`, and for any outcome worth explaining. */
  reason: import_zod5.z.string().max(400).optional()
});
var AdoptionResponseSchema = import_zod5.z.object({
  outcomes: import_zod5.z.array(AdoptionOutcomeSchema),
  adopted: import_zod5.z.number().int().nonnegative(),
  attached: import_zod5.z.number().int().nonnegative(),
  duplicates: import_zod5.z.number().int().nonnegative(),
  skipped: import_zod5.z.number().int().nonnegative(),
  /** Echoed so a client cannot mistake a preview for a write. */
  dryRun: import_zod5.z.boolean()
});
var ObservationRequestSchema = import_zod5.z.object({
  machineName: import_zod5.z.string().min(1).max(255),
  sessions: import_zod5.z.array(AdoptionCandidateSchema).max(ADOPTION_LIMITS.MAX_CANDIDATES),
  /**
   * Adoption keys this machine no longer sees as live.
   *
   * Without this a session that ends between two sweeps stays `running` in the
   * cockpit forever — the board would fill with agents that finished hours
   * ago, which is worse than showing nothing.
   */
  endedKeys: import_zod5.z.array(import_zod5.z.string().regex(/^[0-9a-f]{64}$/)).max(ADOPTION_LIMITS.MAX_CANDIDATES).default([])
}).strict();
var ObservationResponseSchema = import_zod5.z.object({
  observed: import_zod5.z.number().int().nonnegative(),
  created: import_zod5.z.number().int().nonnegative(),
  updated: import_zod5.z.number().int().nonnegative(),
  ended: import_zod5.z.number().int().nonnegative(),
  /** Projects auto-created for repos this org had not seen before. */
  projectsCreated: import_zod5.z.number().int().nonnegative()
});
var DiscoveredRepoSchema = import_zod5.z.object({
  repo: RepoSlugSchema,
  /** The grouping key the portal renders sections by — the GitHub org. */
  owner: import_zod5.z.string().min(1).max(255),
  /** `github.com`, `gitlab.com`, … Never a path. */
  host: import_zod5.z.string().min(1).max(255),
  /** Distinct working directories. Worktrees legitimately inflate this. */
  projectCount: import_zod5.z.number().int().nonnegative(),
  sessionCount: import_zod5.z.number().int().nonnegative(),
  /** The "this is happening right now" number. */
  liveSessionCount: import_zod5.z.number().int().nonnegative(),
  lastActivityAt: import_zod5.z.string().datetime().nullable()
}).strict();
var DiscoveryRequestSchema = import_zod5.z.object({
  machineName: import_zod5.z.string().min(1).max(255),
  repos: import_zod5.z.array(DiscoveredRepoSchema).max(ADOPTION_LIMITS.MAX_DISCOVERED_REPOS),
  /**
   * Directories with agent activity and no resolvable git remote.
   *
   * Reported as a count rather than a list: the paths are the user's private
   * directory layout, and "12 sessions DevPilot cannot route" is the whole of
   * what the onboarding surface needs to say.
   */
  unmappedProjectCount: import_zod5.z.number().int().nonnegative().default(0)
}).strict();
var DiscoveryResponseSchema = import_zod5.z.object({
  /** Rows written or updated. */
  accepted: import_zod5.z.number().int().nonnegative(),
  /** Of those, awaiting a member's decision. */
  proposed: import_zod5.z.number().int().nonnegative(),
  /** Already routed to a machine — nothing to decide. */
  alreadyRouted: import_zod5.z.number().int().nonnegative()
});
function escapeLinearMarkdown(text) {
  return text.replace(/\\/g, "\\\\").replace(/([`*_[\]()#<>|~])/g, "\\$1").replace(/\r?\n/g, " ").trim();
}
var ADOPTION_FILE_LIMIT = 10;
function durationLabel(startedAt, endedAt) {
  const ms = Date.parse(endedAt) - Date.parse(startedAt);
  if (!Number.isFinite(ms) || ms < 0) return "an unknown duration";
  const minutes = Math.round(ms / 6e4);
  if (minutes < 1) return "under a minute";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} hour${hours === 1 ? "" : "s"}` : `${hours}h ${rest}m`;
}
function buildAdoptionComment(input) {
  const lines = [
    `:eyes: **Agent session observed** \u2014 \`${escapeLinearMarkdown(input.agent)}\` on \`${escapeLinearMarkdown(input.machineName)}\``,
    "",
    `DevPilot did not start this session. It was found already running on the machine and recorded here so the work is on the board.`,
    "",
    `**Ran for:** ${durationLabel(input.startedAt, input.lastActivityAt)}`
  ];
  if (input.branch) {
    lines.push(`**Branch:** \`${escapeLinearMarkdown(input.branch)}\``);
  }
  if (input.summary) {
    lines.push("", escapeLinearMarkdown(input.summary));
  }
  if (input.touchedPaths && input.touchedPaths.length > 0) {
    lines.push("", "**Files touched:**");
    for (const path of input.touchedPaths.slice(0, ADOPTION_FILE_LIMIT)) {
      lines.push(`- \`${escapeLinearMarkdown(path)}\``);
    }
    if (input.touchedPaths.length > ADOPTION_FILE_LIMIT) {
      lines.push(`- \u2026 and ${input.touchedPaths.length - ADOPTION_FILE_LIMIT} more`);
    }
  }
  lines.push(
    "",
    "_This issue was not moved. Only a person can say whether observed work is done._"
  );
  return lines.join("\n");
}
function buildAdoptionIssueDescription(input) {
  const lines = [
    `Created by DevPilot from an agent session already running on \`${escapeLinearMarkdown(input.machineName)}\`.`,
    "",
    `**Repo:** \`${escapeLinearMarkdown(input.repo)}\``
  ];
  if (input.branch) {
    lines.push(`**Branch:** \`${escapeLinearMarkdown(input.branch)}\``);
  }
  lines.push(`**Session started:** ${escapeLinearMarkdown(input.startedAt)}`);
  if (input.summary) {
    lines.push("", escapeLinearMarkdown(input.summary));
  }
  lines.push(
    "",
    "_DevPilot observed this session; it did not dispatch it. Status here reflects_",
    "_whether the session is still running, not whether the work is complete._"
  );
  return lines.join("\n");
}
var BRANCH_IDENTIFIER_RE = /(?:^|[^A-Za-z0-9])([A-Za-z]{2,5})-(\d{1,6})(?![0-9])/g;
function linearIdentifierFromBranch(branch) {
  BRANCH_IDENTIFIER_RE.lastIndex = 0;
  for (let m = BRANCH_IDENTIFIER_RE.exec(branch); m; m = BRANCH_IDENTIFIER_RE.exec(branch)) {
    const rest = branch.slice(m.index + m[0].length);
    if (/^-\d{2}(?:-\d{2})?(?![0-9])/.test(rest)) continue;
    return `${m[1].toUpperCase()}-${m[2]}`;
  }
  return null;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  ADOPTION_AGENTS,
  ADOPTION_LIMITS,
  ADOPTION_MATCH_KINDS,
  ADOPTION_OUTCOME_STATUSES,
  AGENT_KINDS,
  AdoptionAgentSchema,
  AdoptionCandidateSchema,
  AdoptionMatchKindSchema,
  AdoptionOutcomeSchema,
  AdoptionOutcomeStatusSchema,
  AdoptionRequestSchema,
  AdoptionResponseSchema,
  AgentKindSchema,
  ApiErrorSchema,
  CreateSharedSessionRequestSchema,
  CreateSharedSessionResponseSchema,
  DiscoveredRepoSchema,
  DiscoveryRequestSchema,
  DiscoveryResponseSchema,
  DispatchPollResponseSchema,
  ERROR_CODES,
  HeartbeatRequestSchema,
  JOIN_PROOF_HEADER,
  JoinSessionRequestSchema,
  JoinSessionResponseSchema,
  ObservationRequestSchema,
  ObservationResponseSchema,
  PARTICIPANT_KINDS,
  ParticipantKindSchema,
  PostSessionMessageRequestSchema,
  PostSessionMessageResponseSchema,
  RealtimeCredentialsSchema,
  RegisterRequestSchema,
  RegisterResponseSchema,
  RepoSlugSchema,
  RotateSessionKeyRequestSchema,
  RotateSessionKeyResponseSchema,
  SESSION_EVENT_TYPES,
  SESSION_LIMITS,
  SESSION_MESSAGE_KINDS,
  SESSION_MODES,
  SESSION_STATUSES,
  SessionCompleteResponseSchema,
  SessionCompleteSchema,
  SessionCryptoError,
  SessionDecryptionError,
  SessionEventTypeSchema,
  SessionKeyError,
  SessionMessageKindSchema,
  SessionMessagePageSchema,
  SessionMessageSchema,
  SessionModeSchema,
  SessionParticipantSchema,
  SessionStatusSchema,
  SessionStatusUpdateSchema,
  SetSessionModeRequestSchema,
  SharedSessionSchema,
  TERMINAL_STATUSES,
  TaskDispatchMessageSchema,
  buildAdoptionComment,
  buildAdoptionIssueDescription,
  buildBridgeCompletionComment,
  buildCompletionComment,
  buildJoinLink,
  buildProgressComment,
  escapeLinearMarkdown,
  formatApiError,
  isTerminal,
  linearIdentifierFromBranch,
  parseJoinLink,
  parseSessionMessage,
  parseSessionMessagePage,
  parseTaskDispatchMessage,
  safeParseSessionMessage,
  safeParseTaskDispatchMessage,
  sessionCrypto
});
//# sourceMappingURL=index.js.map