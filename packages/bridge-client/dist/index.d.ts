import { RegisterRequest, RegisterResponse, TaskDispatchMessage, SessionStatusUpdate, SessionComplete } from '@devpilot.sh/bridge-protocol';
export { RegisterRequest, RegisterResponse, SessionComplete, SessionStatus, SessionStatusUpdate, TaskDispatchMessage } from '@devpilot.sh/bridge-protocol';

interface BridgeClientConfig {
    bridgeUrl: string;
    /** Long-lived `dp_orch_…` token minted in the dashboard. */
    token: string;
    fetchImpl?: typeof fetch;
}
declare class BridgeError extends Error {
    readonly status: number;
    constructor(message: string, status: number);
}
/**
 * HTTP client for a DevPilot bridge — TRD 05 §6.5.
 *
 * Talks to *a* bridge, not *the* bridge: point `bridgeUrl` at devpilot.sh or at
 * any service implementing @devpilot.sh/bridge-protocol.
 */
declare class BridgeClient {
    private readonly config;
    private readonly fetchImpl;
    private orchestratorId;
    constructor(config: BridgeClientConfig);
    private url;
    private request;
    /**
     * Register this machine.
     *
     * `name` is REQUIRED and validated locally before the request goes out. In
     * 0.1.x the client sent `{repos, maxConcurrentJobs}` while the bridge
     * required `name`, so this call returned 400 every single time and the
     * pipeline never once connected end to end.
     */
    register(capabilities: RegisterRequest): Promise<RegisterResponse>;
    heartbeat(activeJobs?: number): Promise<void>;
    /** Unclaimed work for this machine. The fallback transport and the sweep. */
    poll(): Promise<TaskDispatchMessage[]>;
    /** Claim. Returns null when another worker won the race. */
    claim(queueId: string): Promise<TaskDispatchMessage | null>;
    /** Nack, so a claimed row is not stranded until the stale sweep. */
    release(queueId: string, error: string): Promise<void>;
    reportSessionStatus(sessionId: string, status: SessionStatusUpdate): Promise<void>;
    reportSessionComplete(sessionId: string, report: SessionComplete): Promise<void>;
    /** Fixes the `getOrchestatorId` typo from 0.1.x. */
    getOrchestratorId(): string | null;
    setOrchestratorId(id: string): void;
}

interface RealtimeSubscriberConfig {
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
declare class RealtimeSubscriber {
    private readonly config;
    private client;
    private channel;
    private running;
    constructor(config: RealtimeSubscriberConfig);
    start(): Promise<void>;
    /** Refresh before the 1h JWT expires, or the channel silently goes deaf. */
    updateAuth(jwt: string): Promise<void>;
    stop(): Promise<void>;
    get isRunning(): boolean;
}

type DispatchHandler = (message: TaskDispatchMessage) => Promise<void>;
interface DispatchLoopConfig {
    client: BridgeClient;
    orchestratorId: string;
    handler: DispatchHandler;
    /** Realtime credentials from register(). Absent => poll-only. */
    realtime?: {
        supabaseUrl: string;
        anonKey: string;
        jwt: string;
    } | null;
    /** Safety-net sweep interval. Also the poll interval when Realtime is off. */
    sweepIntervalMs?: number;
    maxConcurrent?: number;
    onLog?: (line: string) => void;
    onError?: (err: Error) => void;
}
/**
 * Where the delivery guarantee lives — TRD 05 §3.2, §6.5.
 *
 * Realtime tells us to look sooner. The SWEEP is what makes delivery
 * at-least-once: on start, on every reconnect, and on a timer, we ask the
 * bridge for unclaimed rows. A dispatch that arrived while the process was
 * down, or whose Realtime event was dropped, is still sitting in the table.
 *
 * Turn Realtime off entirely and this class is still correct — only slower.
 * That property is why `--transport poll` is a supported mode rather than a
 * degraded fallback.
 */
declare class DispatchLoop {
    private readonly config;
    private subscriber;
    private timer;
    private running;
    private sweeping;
    /** Claimed and not yet settled — used only to respect maxConcurrent. */
    private readonly inFlight;
    constructor(config: DispatchLoopConfig);
    get activeJobs(): number;
    start(): Promise<void>;
    stop(): Promise<void>;
    /** Ask for unclaimed work and take what we have capacity for. */
    sweep(): Promise<void>;
    private hasCapacity;
    /**
     * Claim then run. The claim is server-side and conditional, so losing a race
     * is a normal outcome (null) rather than an error — that is how two machines
     * can watch the same queue safely.
     */
    private take;
}

interface HeartbeatConfig {
    client: BridgeClient;
    intervalMs?: number;
    /** Reports current load so the bridge can respect concurrency limits. */
    activeJobs?: () => number;
    onError?: (err: Error) => void;
}
/**
 * Periodic liveness. The portal derives online/offline from heartbeat recency
 * rather than trusting a boolean, so stopping this makes a machine go stale
 * rather than lying about being online forever.
 */
declare class HeartbeatService {
    private readonly config;
    private timer;
    constructor(config: HeartbeatConfig);
    start(): void;
    stop(): void;
}

/** @deprecated Removed in 0.2.0. Use RealtimeSubscriber. */
declare class PubSubSubscriber {
    constructor();
}

export { BridgeClient, type BridgeClientConfig, BridgeError, type DispatchHandler, DispatchLoop, type DispatchLoopConfig, type HeartbeatConfig, HeartbeatService, PubSubSubscriber, RealtimeSubscriber, type RealtimeSubscriberConfig };
