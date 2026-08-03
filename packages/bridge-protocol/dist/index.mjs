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
};
//# sourceMappingURL=index.mjs.map