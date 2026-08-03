// src/messages.ts
import { z } from "zod";
var TaskDispatchMessageSchema = z.object({
  /** cuid2, assigned at enqueue time. */
  messageId: z.string().min(1),
  /** dispatch_sessions.id — THE REPORT-BACK KEY. Without it a client cannot report progress. */
  sessionId: z.string().min(1),
  /** dispatch_queue.id — the claim/settle key. */
  queueId: z.string().min(1),
  orgId: z.string().min(1),
  workspaceId: z.string().min(1),
  linearIssueId: z.string().min(1),
  /** e.g. 'ENG-394' */
  linearIdentifier: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
  teamId: z.string().min(1),
  priority: z.number().int().min(0).max(4).optional(),
  labels: z.array(z.string()).optional(),
  repo: z.string().min(1),
  /** Required — routing is resolved before enqueue, never by the client. */
  targetOrchestratorId: z.string().min(1),
  /** ISO 8601 */
  dispatchedAt: z.string().datetime()
});
function parseTaskDispatchMessage(input) {
  return TaskDispatchMessageSchema.parse(input);
}
function safeParseTaskDispatchMessage(input) {
  return TaskDispatchMessageSchema.safeParse(input);
}

// src/status.ts
import { z as z2 } from "zod";
var SESSION_STATUSES = [
  "pending",
  "dispatched",
  "running",
  "complete",
  "error",
  "cancelled"
];
var SessionStatusSchema = z2.enum(SESSION_STATUSES);
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
var SessionEventTypeSchema = z2.enum(SESSION_EVENT_TYPES);

// src/api.ts
import { z as z3 } from "zod";
var RegisterRequestSchema = z3.object({
  /** REQUIRED. Its absence is the historical 400. Defaults to os.hostname() client-side. */
  name: z3.string().min(1).max(120),
  repos: z3.array(z3.string().min(1)),
  maxConcurrentJobs: z3.number().int().min(1).max(64).default(4)
});
var RealtimeCredentialsSchema = z3.object({
  /**
   * Everything the client needs to open the channel, returned by the bridge so
   * a machine does not have to be told out-of-band where the realtime endpoint
   * lives. Both URL and anon key are public by design — the dispatch_queue RLS
   * policy plus the scoped `jwt` are what constrain access.
   */
  supabaseUrl: z3.string().url(),
  anonKey: z3.string().min(1),
  jwt: z3.string().min(1),
  expiresAt: z3.string().datetime(),
  channel: z3.string().min(1),
  table: z3.string().min(1)
});
var RegisterResponseSchema = z3.object({
  orchestratorId: z3.string().min(1),
  orgId: z3.string().min(1),
  /** null when SUPABASE_JWT_SECRET is unavailable — the client falls back to polling. */
  realtime: RealtimeCredentialsSchema.nullable()
});
var HeartbeatRequestSchema = z3.object({
  activeJobs: z3.number().int().min(0).optional()
});
var SessionStatusUpdateSchema = z3.object({
  status: SessionStatusSchema,
  progressPercent: z3.number().int().min(0).max(100),
  message: z3.string().max(2e3).optional()
});
var SessionCompleteSchema = z3.object({
  success: z3.boolean(),
  prUrl: z3.string().url().optional(),
  summary: z3.string().max(1e4).optional(),
  tokensUsed: z3.number().int().min(0).optional(),
  costUsd: z3.number().min(0).optional(),
  errorMessage: z3.string().max(1e4).optional()
});
var SessionCompleteResponseSchema = z3.object({
  status: z3.literal("completed"),
  /** false when Linear sync failed — never fails the request itself. */
  linearSynced: z3.boolean(),
  linearError: z3.string().optional()
});
var DispatchPollResponseSchema = z3.object({
  /** Unclaimed queue rows for the calling orchestrator, oldest first. */
  messages: z3.array(z3.unknown())
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
var ApiErrorSchema = z3.object({
  error: z3.object({
    code: z3.enum(ERROR_CODES),
    message: z3.string(),
    details: z3.unknown().optional()
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
import { z as z4 } from "zod";
var SESSION_MODES = ["observe", "relay", "auto"];
var SessionModeSchema = z4.enum(SESSION_MODES);
var SESSION_MESSAGE_KINDS = ["chat", "agent_output", "system"];
var SessionMessageKindSchema = z4.enum(SESSION_MESSAGE_KINDS);
var PARTICIPANT_KINDS = ["human", "agent"];
var ParticipantKindSchema = z4.enum(PARTICIPANT_KINDS);
var AGENT_KINDS = ["claude-code", "codex", "ao", "other"];
var AgentKindSchema = z4.enum(AGENT_KINDS);
var SESSION_LIMITS = {
  /** Per participant, per session. */
  messagesPerMinute: 60,
  /** Ciphertext bytes, not plaintext — what the server actually stores. */
  maxCiphertextBytes: 256 * 1024,
  /** §3.3 `auto` bounds. Exhausting either drops the session to `observe`. */
  autoDefaultBudget: 20,
  autoDefaultTtlMinutes: 30
};
var SessionMessageSchema = z4.object({
  id: z4.string().min(1),
  sessionId: z4.string().min(1),
  /** Null once a participant row is removed; the message survives them. */
  participantId: z4.string().min(1).nullable(),
  /**
   * AES-256-GCM, base64(iv).base64(ct).base64(tag), encrypted with a key
   * derived from the session key by sessionCrypto. OPAQUE TO THE SERVER.
   */
  ciphertext: z4.string().min(1),
  /** Which key version sealed this, so rotation does not orphan history (§4.4). */
  keyVersion: z4.number().int().positive(),
  kind: SessionMessageKindSchema,
  /** Monotonic per session, assigned by the server. Clients order by THIS, not by clock. */
  seq: z4.number().int().positive(),
  createdAt: z4.string().datetime()
});
var SessionParticipantSchema = z4.object({
  id: z4.string().min(1),
  sessionId: z4.string().min(1),
  kind: ParticipantKindSchema,
  /** Chosen by the joiner and NOT AUTHENTICATED. The UI must not imply otherwise. */
  displayName: z4.string().min(1).max(120),
  agentKind: AgentKindSchema.nullable().optional(),
  joinedAt: z4.string().datetime(),
  lastSeenAt: z4.string().datetime().nullable().optional(),
  leftAt: z4.string().datetime().nullable().optional()
});
var SharedSessionSchema = z4.object({
  id: z4.string().min(1),
  /** Plaintext BY CHOICE — it is the portal list label. Never put secrets here. */
  title: z4.string().min(1).max(200),
  mode: SessionModeSchema,
  keyVersion: z4.number().int().positive(),
  linearIdentifier: z4.string().min(1).nullable().optional(),
  autoBudgetRemaining: z4.number().int().nonnegative().optional(),
  autoExpiresAt: z4.string().datetime().nullable().optional(),
  closedAt: z4.string().datetime().nullable().optional(),
  createdAt: z4.string().datetime()
});
var CreateSharedSessionRequestSchema = z4.object({
  title: z4.string().min(1).max(200),
  /** sha256 hex of the join verifier. 64 lowercase hex chars. */
  joinKeyHash: z4.string().regex(/^[0-9a-f]{64}$/, "joinKeyHash must be 64 lowercase hex chars"),
  linearIssueId: z4.string().min(1).optional(),
  linearIdentifier: z4.string().min(1).optional()
}).strict();
var CreateSharedSessionResponseSchema = z4.object({
  session: SharedSessionSchema
});
var JOIN_PROOF_HEADER = "x-session-key-proof";
var JoinSessionRequestSchema = z4.object({
  displayName: z4.string().min(1).max(120),
  kind: ParticipantKindSchema.default("human"),
  agentKind: AgentKindSchema.optional(),
  /** Set when an agent participant is bound to a registered machine. */
  orchestratorId: z4.string().min(1).optional()
}).strict();
var JoinSessionResponseSchema = z4.object({
  /**
   * Short-lived JWT scoped to ONE session. Message routes authenticate with
   * this and never with org membership — that is what lets an outside
   * collaborator participate without being provisioned into the org (§5).
   */
  participantToken: z4.string().min(1),
  expiresAt: z4.string().datetime(),
  participant: SessionParticipantSchema,
  session: SharedSessionSchema
});
var PostSessionMessageRequestSchema = z4.object({
  ciphertext: z4.string().min(1).max(SESSION_LIMITS.maxCiphertextBytes),
  kind: SessionMessageKindSchema.default("chat"),
  keyVersion: z4.number().int().positive(),
  /**
   * Client-generated idempotency key. A retried POST after a timeout must not
   * double-post: the transport is at-least-once, so the write has to be
   * deduplicated somewhere, and the client is the only party that knows two
   * requests were the same intent.
   */
  clientNonce: z4.string().min(8).max(64).optional()
}).strict();
var PostSessionMessageResponseSchema = z4.object({
  message: SessionMessageSchema
});
var SessionMessagePageSchema = z4.object({
  messages: z4.array(SessionMessageSchema),
  /** Highest `seq` in this page; the cursor for the next `?since=`. */
  latestSeq: z4.number().int().nonnegative(),
  hasMore: z4.boolean()
});
var SetSessionModeRequestSchema = z4.object({
  mode: SessionModeSchema,
  /** Required when mode is `auto`; ignored otherwise. §3.3 admits no unbounded autonomy. */
  autoBudget: z4.number().int().positive().max(200).optional(),
  autoTtlMinutes: z4.number().int().positive().max(240).optional()
}).strict().refine((v) => v.mode !== "auto" || v.autoBudget !== void 0 && v.autoTtlMinutes !== void 0, {
  message: "auto mode requires both autoBudget and autoTtlMinutes \u2014 it is never unbounded.",
  path: ["mode"]
});
var RotateSessionKeyRequestSchema = z4.object({
  joinKeyHash: z4.string().regex(/^[0-9a-f]{64}$/, "joinKeyHash must be 64 lowercase hex chars")
}).strict();
var RotateSessionKeyResponseSchema = z4.object({
  keyVersion: z4.number().int().positive()
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
export {
  AGENT_KINDS,
  AgentKindSchema,
  ApiErrorSchema,
  CreateSharedSessionRequestSchema,
  CreateSharedSessionResponseSchema,
  DispatchPollResponseSchema,
  ERROR_CODES,
  HeartbeatRequestSchema,
  JOIN_PROOF_HEADER,
  JoinSessionRequestSchema,
  JoinSessionResponseSchema,
  PARTICIPANT_KINDS,
  ParticipantKindSchema,
  PostSessionMessageRequestSchema,
  PostSessionMessageResponseSchema,
  RealtimeCredentialsSchema,
  RegisterRequestSchema,
  RegisterResponseSchema,
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
  buildBridgeCompletionComment,
  buildCompletionComment,
  buildJoinLink,
  buildProgressComment,
  formatApiError,
  isTerminal,
  parseJoinLink,
  parseSessionMessage,
  parseSessionMessagePage,
  parseTaskDispatchMessage,
  safeParseSessionMessage,
  safeParseTaskDispatchMessage,
  sessionCrypto
};
//# sourceMappingURL=index.mjs.map