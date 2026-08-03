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
export const TaskDispatchMessageSchema = z.object({
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
  dispatchedAt: z.string().datetime(),
});

export type TaskDispatchMessage = z.infer<typeof TaskDispatchMessageSchema>;

/** Parse an untrusted payload (queue row, poll response, realtime event). */
export function parseTaskDispatchMessage(input: unknown): TaskDispatchMessage {
  return TaskDispatchMessageSchema.parse(input);
}

export function safeParseTaskDispatchMessage(input: unknown) {
  return TaskDispatchMessageSchema.safeParse(input);
}
