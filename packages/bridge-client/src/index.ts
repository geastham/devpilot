/**
 * @devpilot.sh/bridge-client — connect a machine to a DevPilot bridge.
 *
 * 0.2.0 replaced the GCP Pub/Sub transport with a durable queue plus Supabase
 * Realtime. See CHANGELOG.md for the migration.
 */
export { BridgeClient, BridgeError, type BridgeClientConfig } from './client';
export { RealtimeSubscriber, type RealtimeSubscriberConfig } from './realtime';
export {
  DispatchLoop,
  type DispatchLoopConfig,
  type DispatchHandler,
} from './dispatch-loop';
export { HeartbeatService, type HeartbeatConfig } from './heartbeat';
export {
  SharedSessionClient,
  type SharedSessionJoinOptions,
  type TranscriptEntry,
  type EntryStatus,
} from './shared-session';

/** @deprecated Removed in 0.2.0 — throws with upgrade instructions. */
export { PubSubSubscriber } from './pubsub';

// Re-exported so consumers need only one import for the common case.
export type {
  TaskDispatchMessage,
  RegisterRequest,
  RegisterResponse,
  SessionStatus,
  SessionStatusUpdate,
  SessionComplete,
} from '@devpilot.sh/bridge-protocol';
