import {
  AdoptionRequestSchema,
  AdoptionResponseSchema,
  DiscoveryRequestSchema,
  DiscoveryResponseSchema,
  ObservationRequestSchema,
  ObservationResponseSchema,
  RegisterRequestSchema,
  RegisterResponseSchema,
  formatApiError,
  type AdoptionRequest,
  type AdoptionResponse,
  type DiscoveryRequest,
  type DiscoveryResponse,
  type ObservationRequest,
  type ObservationResponse,
  type RegisterRequest,
  type RegisterResponse,
  type SessionComplete,
  type SessionStatusUpdate,
  type TaskDispatchMessage,
} from '@devpilot.sh/bridge-protocol';

export interface BridgeClientConfig {
  bridgeUrl: string;
  /** Long-lived `dp_orch_…` token minted in the dashboard. */
  token: string;
  fetchImpl?: typeof fetch;
}

export class BridgeError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'BridgeError';
  }
}

/**
 * HTTP client for a DevPilot bridge — TRD 05 §6.5.
 *
 * Talks to *a* bridge, not *the* bridge: point `bridgeUrl` at devpilot.sh or at
 * any service implementing @devpilot.sh/bridge-protocol.
 */
/** What the hosted cockpit needs to render a plan. Structure, never source. */
export interface MirroredPlan {
  cockpitItemId?: string;
  parallelization?: number;
  waves: {
    label?: string;
    tasks: {
      taskCode: string;
      description: string;
      filePaths?: string[];
      complexity?: string;
      recommendedModel?: string;
      canRunInParallel?: boolean;
    }[];
  }[];
  dependencyEdges?: { from: string; to: string; type?: string }[];
  criticalPath?: string[];
}

/** A decision taken in the hosted cockpit, on its way to the conductor. */
export interface SessionCommandMessage {
  id: string;
  sessionId: string;
  command: 'approve' | 'replan' | 'abort';
  payload?: { constraints?: string[] };
  createdAt?: string;
}

/**
 * The instrument readings the hosted cockpit renders.
 *
 * Note what is absent: no assistant text, no tool inputs. That omission is the
 * contract, not an oversight — see `reportTelemetry`.
 */
export interface MirroredTelemetry {
  toolCalls: number;
  /** Repo-relative paths. */
  filesTouched: string[];
  currentAction?: string;
  costUsd?: number;
  costEstimated?: boolean;
  tokensIn?: number;
  tokensOut?: number;
  turns?: number;
  elapsedMs?: number;
  idleMs?: number;
}

export class BridgeClient {
  private readonly fetchImpl: typeof fetch;
  private orchestratorId: string | null = null;

  constructor(private readonly config: BridgeClientConfig) {
    this.fetchImpl = config.fetchImpl ?? globalThis.fetch;
  }

  private url(path: string): string {
    return `${this.hostedUrl()}${path}`;
  }

  /**
   * The hosted plane's base URL, without a trailing slash.
   *
   * Exposed because agent activities need to link a person to the hosted
   * cockpit. The first version of those links pointed at the *local* cockpit,
   * which is a dead link for anyone not sitting at the machine the bridge runs
   * on — and most people on the hosted product never run it at all.
   */
  hostedUrl(): string {
    return this.config.bridgeUrl.replace(/\/+$/, '');
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await this.fetchImpl(this.url(path), {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.token}`,
        ...(init.headers ?? {}),
      },
    });

    if (!res.ok) {
      // Surface the server's actual reason. The 0.1.x client threw
      // `Registration failed: ${response.statusText}` and discarded the body,
      // so a user saw "Bad Request" with no indication of what was wrong —
      // which is how the missing-`name` defect stayed invisible.
      const body = await res.json().catch(() => null);
      throw new BridgeError(
        formatApiError(
          body,
          `${init.method ?? 'GET'} ${path} failed: ${res.status} ${res.statusText}`,
        ),
        res.status,
      );
    }

    return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
  }

  /**
   * Register this machine.
   *
   * `name` is REQUIRED and validated locally before the request goes out. In
   * 0.1.x the client sent `{repos, maxConcurrentJobs}` while the bridge
   * required `name`, so this call returned 400 every single time and the
   * pipeline never once connected end to end.
   */
  async register(capabilities: RegisterRequest): Promise<RegisterResponse> {
    const body = RegisterRequestSchema.parse(capabilities);
    const raw = await this.request<unknown>('/api/orchestrators/register', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    const parsed = RegisterResponseSchema.parse(raw);
    this.orchestratorId = parsed.orchestratorId;
    return parsed;
  }

  async heartbeat(activeJobs?: number): Promise<void> {
    if (!this.orchestratorId) throw new BridgeError('Not registered', 400);
    await this.request(`/api/orchestrators/${this.orchestratorId}/heartbeat`, {
      method: 'POST',
      body: JSON.stringify({ activeJobs }),
    });
  }

  /** Unclaimed work for this machine. The fallback transport and the sweep. */
  async poll(): Promise<TaskDispatchMessage[]> {
    const res = await this.request<{ messages: TaskDispatchMessage[] }>('/api/dispatch/poll');
    return res.messages;
  }

  /** Claim. Returns null when another worker won the race. */
  async claim(queueId: string): Promise<TaskDispatchMessage | null> {
    try {
      const res = await this.request<{ message: TaskDispatchMessage }>(
        `/api/dispatch/${queueId}/claim`,
        { method: 'POST' },
      );
      return res.message;
    } catch (err) {
      if (err instanceof BridgeError && err.status === 409) return null;
      throw err;
    }
  }

  /** Nack, so a claimed row is not stranded until the stale sweep. */
  async release(queueId: string, error: string): Promise<void> {
    await this.request(`/api/dispatch/${queueId}/release`, {
      method: 'POST',
      body: JSON.stringify({ error }),
    });
  }

  async reportSessionStatus(sessionId: string, status: SessionStatusUpdate): Promise<void> {
    await this.request(`/api/sessions/${sessionId}/status`, {
      method: 'POST',
      body: JSON.stringify(status),
    });
  }

  async reportSessionComplete(sessionId: string, report: SessionComplete): Promise<void> {
    await this.request(`/api/sessions/${sessionId}/complete`, {
      method: 'POST',
      body: JSON.stringify(report),
    });
  }

  /**
   * Mirror a wave plan to the hosted cockpit.
   *
   * Derived structure only — waves, task descriptions, file paths, dependency
   * edges. Never source: no file contents, no diffs. The hosted schema has no
   * column for those, which is the enforcement; this comment is only the intent.
   *
   * Best-effort by design. Mirroring is what makes the plan visible on
   * devpilot.sh, but the run is real work already underway on this machine, and
   * losing it because a display copy failed to upload would be an absurd trade.
   * Callers get a boolean and decide whether to mention it.
   */
  async mirrorSessionPlan(sessionId: string, plan: MirroredPlan): Promise<boolean> {
    try {
      await this.request(`/api/sessions/${sessionId}/plan`, {
        method: 'POST',
        body: JSON.stringify(plan),
      });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Pending commands for this machine's sessions.
   *
   * The counterpart to everything else here: the hosted plane finally has a way
   * to answer a run, and this is how the answer arrives. Rides the same poll
   * the bridge already runs rather than a second transport.
   */
  async pollSessionCommands(): Promise<SessionCommandMessage[]> {
    const res = await this.request<{ commands: SessionCommandMessage[] }>(
      '/api/dispatch/commands'
    );
    return res.commands ?? [];
  }

  /** Close out commands once applied. Never throws: see the caller. */
  async acknowledgeCommands(
    commandIds: string[],
    status: 'applied' | 'failed',
    error?: string
  ): Promise<boolean> {
    if (commandIds.length === 0) return true;
    try {
      await this.request('/api/dispatch/commands', {
        method: 'POST',
        body: JSON.stringify({ commandIds, status, ...(error ? { error } : {}) }),
      });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Offer agent sessions found already running on this machine — TRD 21 §7.1.
   *
   * The reverse of `poll`: that asks the bridge for work, this tells the bridge
   * about work it never sent. THROWS, unlike `mirrorSessionPlan`, because
   * adoption is something a user explicitly asked for and a silent failure
   * would leave them staring at a board that did not change.
   *
   * The request carries no transcript content and cannot: `AdoptionRequest` is
   * a `.strict()` schema with no field for it (TRD 21 DECISION B).
   */
  async adoptSessions(request: AdoptionRequest): Promise<AdoptionResponse> {
    const body = AdoptionRequestSchema.parse(request);
    const raw = await this.request<unknown>('/api/adoptions', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    return AdoptionResponseSchema.parse(raw);
  }

  /**
   * Report the repositories this machine has agent history for — TRD 21 §7.2.
   *
   * Best-effort, and NEVER throws: this rides `bridge connect`, and a machine
   * failing to connect because an inventory upload was refused would trade the
   * product for a nicety. Callers get null and decide whether to mention it.
   */
  async reportDiscovery(request: DiscoveryRequest): Promise<DiscoveryResponse | null> {
    try {
      const body = DiscoveryRequestSchema.parse(request);
      const raw = await this.request<unknown>('/api/discovery', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      return DiscoveryResponseSchema.parse(raw);
    } catch {
      return null;
    }
  }

  /**
   * Report the agent sessions running on this machine — TRD 22 §7.
   *
   * The sweep behind a live cockpit. Unlike `adoptSessions` this needs no Linear
   * workspace, no team and no route, so it is safe to run continuously from the
   * moment a bridge connects.
   *
   * NEVER THROWS. This rides the bridge's own loop, and a machine that stopped
   * running dispatched work because an observation upload failed would have
   * traded the product for a display.
   */
  async reportObservations(request: ObservationRequest): Promise<ObservationResponse | null> {
    try {
      const body = ObservationRequestSchema.parse(request);
      const raw = await this.request<unknown>('/api/observations', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      return ObservationResponseSchema.parse(raw);
    } catch {
      return null;
    }
  }

  /**
   * Mirror what an agent is doing to the hosted cockpit.
   *
   * Derived facts only. The caller is responsible for not passing prose or raw
   * tool inputs — a Write tool's input IS the file contents — and the hosted
   * schema has no column for either, so a mistake here is rejected rather than
   * stored.
   *
   * Best-effort and never throws: this is an instrument reading, and losing a
   * frame of it must never cost the run it describes.
   */
  async reportTelemetry(sessionId: string, telemetry: MirroredTelemetry): Promise<boolean> {
    try {
      await this.request(`/api/sessions/${sessionId}/telemetry`, {
        method: 'POST',
        body: JSON.stringify(telemetry),
      });
      return true;
    } catch {
      return false;
    }
  }

  /** Fixes the `getOrchestatorId` typo from 0.1.x. */
  getOrchestratorId(): string | null {
    return this.orchestratorId;
  }

  setOrchestratorId(id: string): void {
    this.orchestratorId = id;
  }
}
