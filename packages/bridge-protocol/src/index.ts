/**
 * @devpilot.sh/bridge-protocol — the DevPilot bridge wire contract.
 *
 * Published so the protocol is open and implementable independently of the
 * hosted platform: point DEVPILOT_BRIDGE_URL at any service that honours these
 * shapes. Zero runtime dependencies beyond zod.
 */
export {
  TaskDispatchMessageSchema,
  parseTaskDispatchMessage,
  safeParseTaskDispatchMessage,
  type TaskDispatchMessage,
} from './messages';

export {
  SESSION_STATUSES,
  SessionStatusSchema,
  TERMINAL_STATUSES,
  isTerminal,
  SESSION_EVENT_TYPES,
  SessionEventTypeSchema,
  type SessionStatus,
  type TerminalStatus,
  type SessionEventType,
} from './status';

export {
  RegisterRequestSchema,
  RegisterResponseSchema,
  RealtimeCredentialsSchema,
  HeartbeatRequestSchema,
  SessionStatusUpdateSchema,
  SessionCompleteSchema,
  SessionCompleteResponseSchema,
  DispatchPollResponseSchema,
  ApiErrorSchema,
  ERROR_CODES,
  formatApiError,
  type RegisterRequest,
  type RegisterResponse,
  type HeartbeatRequest,
  type SessionStatusUpdate,
  type SessionComplete,
  type ApiErrorBody,
} from './api';

export {
  buildProgressComment,
  buildCompletionComment,
  buildBridgeCompletionComment,
  type ProgressCommentInput,
  type CompletionCommentInput,
} from './linear';
