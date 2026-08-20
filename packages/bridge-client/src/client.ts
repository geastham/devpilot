import {
  RegisterRequestSchema,
  RegisterResponseSchema,
  formatApiError,
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

  /** Fixes the `getOrchestatorId` typo from 0.1.x. */
  getOrchestratorId(): string | null {
    return this.orchestratorId;
  }

  setOrchestratorId(id: string): void {
    this.orchestratorId = id;
  }
}
