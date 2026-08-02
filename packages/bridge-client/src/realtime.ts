import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';

export interface RealtimeSubscriberConfig {
  supabaseUrl: string;
  anonKey: string;
  /** Short-lived JWT from POST /api/orchestrators/token. Carries orchestrator_id. */
  jwt: string;
  orchestratorId: string;
  /** Fired when a row addressed to this machine appears. */
  onNotify: (queueId: string) => void;
  /** Fired on (re)connect — the DispatchLoop sweeps in response. */
  onReconnect: () => void;
  onError?: (err: Error) => void;
}

/**
 * Realtime transport — TRD 05 §6.5. Replaces PubSubSubscriber.
 *
 * This is a LATENCY OPTIMIZATION, not the delivery mechanism. Realtime is
 * at-most-once: a disconnect drops events with no replay. Correctness comes
 * from DispatchLoop's sweep against the queue table. If this class never
 * connects at all, the system still works — just with poll-interval latency.
 *
 * The channel is filtered server-side by orchestrator_id AND constrained by the
 * dispatch_queue RLS policy, so another machine's JWT receives nothing.
 */
export class RealtimeSubscriber {
  private client: SupabaseClient | null = null;
  private channel: RealtimeChannel | null = null;
  private running = false;

  constructor(private readonly config: RealtimeSubscriberConfig) {}

  async start(): Promise<void> {
    if (this.running) return;

    // Imported dynamically so a poll-only deployment never loads it.
    const { createClient } = await import('@supabase/supabase-js');

    this.client = createClient(this.config.supabaseUrl, this.config.anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      realtime: { params: { eventsPerSecond: 10 } },
    });

    // Without this the channel connects as `anon` and the RLS policy matches
    // nothing — it would appear to work and silently deliver zero events.
    await this.client.realtime.setAuth(this.config.jwt);

    this.running = true;

    this.channel = this.client
      .channel(`dispatch:${this.config.orchestratorId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'dispatch_queue',
          filter: `orchestrator_id=eq.${this.config.orchestratorId}`,
        },
        (payload: { new?: { id?: string } }) => {
          const id = payload.new?.id;
          if (id) this.config.onNotify(id);
        },
      )
      .subscribe((status: string) => {
        if (status === 'SUBSCRIBED') {
          // Every (re)subscribe triggers a sweep: anything that arrived while
          // the socket was down is still sitting in the table.
          this.config.onReconnect();
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          this.config.onError?.(new Error(`Realtime channel ${status}`));
        }
      });
  }

  /** Refresh before the 1h JWT expires, or the channel silently goes deaf. */
  async updateAuth(jwt: string): Promise<void> {
    if (this.client) await this.client.realtime.setAuth(jwt);
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.channel) await this.channel.unsubscribe();
    if (this.client) await this.client.realtime.disconnect();
    this.channel = null;
    this.client = null;
  }

  get isRunning(): boolean {
    return this.running;
  }
}
