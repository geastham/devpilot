import { z } from 'zod';
import { SessionStatusSchema } from './status';

/**
 * Request/response schemas for the bridge HTTP surface — TRD 05 §5.
 *
 * Both sides compile against these: the client serializes from them and the
 * bridge validates with them. That is what turns the historical
 * "register always 400s" defect — client sent { repos, maxConcurrentJobs },
 * bridge required `name` — into a compile error instead of a runtime failure
 * nobody saw until it was deployed.
 */

// --- POST /api/orchestrators/register --------------------------------------
export const RegisterRequestSchema = z.object({
  /** REQUIRED. Its absence is the historical 400. Defaults to os.hostname() client-side. */
  name: z.string().min(1).max(120),
  repos: z.array(z.string().min(1)),
  maxConcurrentJobs: z.number().int().min(1).max(64).default(4),
});
export type RegisterRequest = z.infer<typeof RegisterRequestSchema>;

export const RealtimeCredentialsSchema = z.object({
  /**
   * Everything the client needs to open the channel, returned by the bridge so
   * a machine does not have to be told out-of-band where the realtime endpoint
   * lives. Both URL and anon key are public by design — the dispatch_queue RLS
   * policy plus the scoped `jwt` are what constrain access.
   */
  supabaseUrl: z.string().url(),
  anonKey: z.string().min(1),
  jwt: z.string().min(1),
  expiresAt: z.string().datetime(),
  channel: z.string().min(1),
  table: z.string().min(1),
});

export const RegisterResponseSchema = z.object({
  orchestratorId: z.string().min(1),
  orgId: z.string().min(1),
  /** null when SUPABASE_JWT_SECRET is unavailable — the client falls back to polling. */
  realtime: RealtimeCredentialsSchema.nullable(),
});
export type RegisterResponse = z.infer<typeof RegisterResponseSchema>;

// --- POST /api/orchestrators/:id/heartbeat ---------------------------------
export const HeartbeatRequestSchema = z.object({
  activeJobs: z.number().int().min(0).optional(),
});
export type HeartbeatRequest = z.infer<typeof HeartbeatRequestSchema>;

// --- POST /api/sessions/:id/status -----------------------------------------
export const SessionStatusUpdateSchema = z.object({
  status: SessionStatusSchema,
  progressPercent: z.number().int().min(0).max(100),
  message: z.string().max(2000).optional(),
});
export type SessionStatusUpdate = z.infer<typeof SessionStatusUpdateSchema>;

// --- POST /api/sessions/:id/complete ---------------------------------------
export const SessionCompleteSchema = z.object({
  success: z.boolean(),
  prUrl: z.string().url().optional(),
  summary: z.string().max(10_000).optional(),
  tokensUsed: z.number().int().min(0).optional(),
  costUsd: z.number().min(0).optional(),
  errorMessage: z.string().max(10_000).optional(),
});
export type SessionComplete = z.infer<typeof SessionCompleteSchema>;

export const SessionCompleteResponseSchema = z.object({
  status: z.literal('completed'),
  /** false when Linear sync failed — never fails the request itself. */
  linearSynced: z.boolean(),
  linearError: z.string().optional(),
});

// --- GET /api/dispatch/poll ------------------------------------------------
export const DispatchPollResponseSchema = z.object({
  /** Unclaimed queue rows for the calling orchestrator, oldest first. */
  messages: z.array(z.unknown()),
});

// --- Errors ----------------------------------------------------------------
export const ERROR_CODES = [
  'unauthenticated',
  'forbidden',
  'not_found',
  'invalid_request',
  'conflict',
  'rate_limited',
  'internal',
  'service_unavailable',
] as const;

export const ApiErrorSchema = z.object({
  error: z.object({
    code: z.enum(ERROR_CODES),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});
export type ApiErrorBody = z.infer<typeof ApiErrorSchema>;

/** Pull a usable message out of a bridge error response. */
export function formatApiError(body: unknown, fallback: string): string {
  const parsed = ApiErrorSchema.safeParse(body);
  return parsed.success ? `${parsed.data.error.code}: ${parsed.data.error.message}` : fallback;
}
