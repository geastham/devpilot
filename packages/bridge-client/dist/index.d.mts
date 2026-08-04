import { RegisterRequest, RegisterResponse, TaskDispatchMessage, SessionStatusUpdate, SessionComplete, SharedSession, SessionMessage, SessionMessageKind, SessionParticipant } from '@devpilot.sh/bridge-protocol';
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

/**
 * Shared agent sessions client — TRD 06 §5, §6.2, §6.3.
 *
 * One implementation for both consumers: `@devpilot.sh/mcp-session` (so Claude
 * Code can take part) and `devpilot session …` in the CLI. Duplicating it would
 * be the drift that got `packages/bridge` deleted in TRD 05.
 *
 * ─── The key never leaves this process ──────────────────────────────────────
 *
 * It is parsed out of the link fragment, held in a private field, and used only
 * to derive the join verifier and to encrypt/decrypt locally. It is never sent
 * to the bridge, never written to disk, and deliberately not exposed on the
 * instance — `toJSON` is overridden so an accidental `console.log(client)` or
 * `JSON.stringify(client)` cannot print it. That last one is not paranoia: a
 * debug log is exactly how a secret ends up in a terminal recording.
 *
 * ─── What "cannot decrypt" means here ───────────────────────────────────────
 *
 * Two kinds of message do not decrypt, and BOTH are reported rather than hidden:
 *
 *   system        server-authored plaintext (TRD 06 §3.2, corrected in v1.3).
 *                 The server cannot encrypt — it holds no key — so its notices
 *                 about auto-mode expiry arrive as plaintext with a `system:`
 *                 prefix. Attempting to decrypt one would just throw.
 *   undecryptable sealed under a superseded keyVersion. After a rotation, a
 *                 holder of only the new key genuinely cannot read history.
 *                 Silently dropping those would make the transcript look
 *                 complete when it is not, which is worse than a visible gap.
 */

interface SharedSessionJoinOptions {
    /** `https://devpilot.sh/s/<id>#k=<key>` — the fragment carries the key. */
    link: string;
    displayName: string;
    kind?: 'human' | 'agent';
    agentKind?: 'claude-code' | 'codex' | 'ao' | 'other';
    orchestratorId?: string;
    fetchImpl?: typeof fetch;
}
type EntryStatus = 'ok' | 'system' | 'undecryptable';
interface TranscriptEntry {
    id: string;
    seq: number;
    participantId: string | null;
    kind: SessionMessageKind;
    keyVersion: number;
    createdAt: string;
    /** Plaintext when readable; null otherwise. Never a decryption failure string. */
    text: string | null;
    status: EntryStatus;
    /** Present when status is 'system' — the parsed server notice. */
    systemNotice?: {
        type: string;
        reason?: string;
    };
}
declare class SharedSessionClient {
    #private;
    readonly sessionId: string;
    readonly baseUrl: string;
    private constructor();
    /** Joins by link. The key is taken from the fragment and kept in memory. */
    static join(options: SharedSessionJoinOptions): Promise<SharedSessionClient>;
    get participantId(): string;
    get session(): SharedSession;
    /** Encrypts locally, then posts. The bridge sees only ciphertext. */
    post(text: string, opts?: {
        kind?: 'chat' | 'agent_output';
        clientNonce?: string;
    }): Promise<SessionMessage>;
    /** Reads and decrypts locally. `since` is a seq cursor, never a clock. */
    read(since?: number): Promise<{
        entries: TranscriptEntry[];
        latestSeq: number;
        hasMore: boolean;
    }>;
    who(): Promise<SessionParticipant[]>;
    /**
     * Keeps `console.log(client)` and `JSON.stringify(client)` from printing the
     * key. Private fields are already invisible to JSON.stringify, but this is
     * cheap and states the intent where someone adding a field will read it.
     */
    toJSON(): {
        sessionId: string;
        baseUrl: string;
        participantId: string;
    };
}

/** @deprecated Removed in 0.2.0. Use RealtimeSubscriber. */
declare class PubSubSubscriber {
    constructor();
}

export { BridgeClient, type BridgeClientConfig, BridgeError, type DispatchHandler, DispatchLoop, type DispatchLoopConfig, type EntryStatus, type HeartbeatConfig, HeartbeatService, PubSubSubscriber, RealtimeSubscriber, type RealtimeSubscriberConfig, SharedSessionClient, type SharedSessionJoinOptions, type TranscriptEntry };
