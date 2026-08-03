/**
 * REMOVED in 0.2.0.
 *
 * The Pub/Sub transport required every user's laptop to authenticate into
 * DevPilot's GCP project to pull a subscription, which is why the pipeline was
 * never completed. It is replaced by a durable queue table plus Supabase
 * Realtime (see RealtimeSubscriber and DispatchLoop).
 *
 * This shim exists so an old install fails with an actionable message rather
 * than an opaque GCP credentials error. It will be deleted in 0.3.0.
 */
const REMOVED =
  '@devpilot.sh/bridge-client: the Pub/Sub transport was removed in 0.2.0. ' +
  'Upgrade the DevPilot CLI (npm i -g @devpilot.sh/cli) and use `devpilot bridge connect`. ' +
  'GCP credentials are no longer required.';

/** @deprecated Removed in 0.2.0. Use RealtimeSubscriber. */
export class PubSubSubscriber {
  constructor() {
    throw new Error(REMOVED);
  }
}

/** @deprecated The message type now lives in @devpilot.sh/bridge-protocol. */
export type { TaskDispatchMessage } from '@devpilot.sh/bridge-protocol';
