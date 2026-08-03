import { z } from 'zod';

/**
 * The session status vocabulary — TRD 05.
 *
 * One list, shared by the CLI, the bridge, and the database CHECK constraint on
 * dispatch_sessions.status. If you add a value here you MUST add it to that
 * constraint in the same change, or writes will fail at runtime rather than at
 * compile time.
 */
export const SESSION_STATUSES = [
  'pending',
  'dispatched',
  'running',
  'complete',
  'error',
  'cancelled',
] as const;

export const SessionStatusSchema = z.enum(SESSION_STATUSES);
export type SessionStatus = z.infer<typeof SessionStatusSchema>;

export const TERMINAL_STATUSES = ['complete', 'error', 'cancelled'] as const;
export type TerminalStatus = (typeof TERMINAL_STATUSES)[number];

export function isTerminal(status: SessionStatus): status is TerminalStatus {
  return (TERMINAL_STATUSES as readonly string[]).includes(status);
}

export const SESSION_EVENT_TYPES = [
  'created',
  'dispatched',
  'progress',
  'complete',
  'error',
  'cancelled',
  'telemetry',
] as const;

export const SessionEventTypeSchema = z.enum(SESSION_EVENT_TYPES);
export type SessionEventType = z.infer<typeof SessionEventTypeSchema>;
