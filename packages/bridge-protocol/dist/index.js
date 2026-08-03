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
  ApiErrorSchema: () => ApiErrorSchema,
  DispatchPollResponseSchema: () => DispatchPollResponseSchema,
  ERROR_CODES: () => ERROR_CODES,
  HeartbeatRequestSchema: () => HeartbeatRequestSchema,
  RealtimeCredentialsSchema: () => RealtimeCredentialsSchema,
  RegisterRequestSchema: () => RegisterRequestSchema,
  RegisterResponseSchema: () => RegisterResponseSchema,
  SESSION_EVENT_TYPES: () => SESSION_EVENT_TYPES,
  SESSION_STATUSES: () => SESSION_STATUSES,
  SessionCompleteResponseSchema: () => SessionCompleteResponseSchema,
  SessionCompleteSchema: () => SessionCompleteSchema,
  SessionEventTypeSchema: () => SessionEventTypeSchema,
  SessionStatusSchema: () => SessionStatusSchema,
  SessionStatusUpdateSchema: () => SessionStatusUpdateSchema,
  TERMINAL_STATUSES: () => TERMINAL_STATUSES,
  TaskDispatchMessageSchema: () => TaskDispatchMessageSchema,
  buildBridgeCompletionComment: () => buildBridgeCompletionComment,
  buildCompletionComment: () => buildCompletionComment,
  buildProgressComment: () => buildProgressComment,
  formatApiError: () => formatApiError,
  isTerminal: () => isTerminal,
  parseTaskDispatchMessage: () => parseTaskDispatchMessage,
  safeParseTaskDispatchMessage: () => safeParseTaskDispatchMessage
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
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  ApiErrorSchema,
  DispatchPollResponseSchema,
  ERROR_CODES,
  HeartbeatRequestSchema,
  RealtimeCredentialsSchema,
  RegisterRequestSchema,
  RegisterResponseSchema,
  SESSION_EVENT_TYPES,
  SESSION_STATUSES,
  SessionCompleteResponseSchema,
  SessionCompleteSchema,
  SessionEventTypeSchema,
  SessionStatusSchema,
  SessionStatusUpdateSchema,
  TERMINAL_STATUSES,
  TaskDispatchMessageSchema,
  buildBridgeCompletionComment,
  buildCompletionComment,
  buildProgressComment,
  formatApiError,
  isTerminal,
  parseTaskDispatchMessage,
  safeParseTaskDispatchMessage
});
//# sourceMappingURL=index.js.map