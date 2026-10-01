/**
 * Claude Session Adapter (session-native)
 *
 * Implements IOrchestratorAdapter by dispatching work to managed Claude Code
 * sessions instead of shelling out to the `ao` CLI. Unlike the legacy
 * `ao-cli` adapter, this adapter is PUSH-BASED: the running session reports
 * progress and completion back to DevPilot's callback endpoints
 * (`/api/orchestrator/status`, `/api/orchestrator/complete`). There is no poll
 * loop and no stdout scraping.
 *
 * The dispatcher/callback wire contract this transport implements is defined
 * normatively in spec/trd/01-TIER1-EXECUTION-LOOP.md §7. The concrete session
 * runner behind `DEVPILOT_SESSION_API_URL` (hosted DevPilot bridge, local
 * session-runner daemon, etc.) is environment-specific and lives behind the
 * `SessionTransport` interface; `HttpSessionTransport` is the default that
 * speaks the §7.1 `/v1` HTTP API.
 */

import type {
  IOrchestratorAdapter,
  IPushCapableAdapter,
  OrchestratorAdapterConfig,
  JobStatus,
  SendMessageResult,
  OrchestratorMode,
} from './adapter';
import type {
  DispatchRequest,
  DispatchResponse,
  OrchestratorHealth,
  StatusUpdate,
  CompletionReport,
  IntegrateOutcome,
  IntegrateRequest,
  IntegrationResult,
  IsolationSupport,
  TaskIsolation,
} from './types';

/** The `/v1/health` capability a runner reports when it can isolate a task. */
export const ISOLATION_CAPABILITY = 'isolation';

/**
 * Parameters for creating a session-native dispatch.
 */
export interface CreateSessionParams {
  /** DevPilot session id, used to correlate pushed callbacks. */
  sessionId: string;
  repo: string;
  prompt: string;
  model?: 'haiku' | 'sonnet' | 'opus';
  filePaths?: string[];
  acceptanceCriteria?: string[];
  constraints?: string[];
  linearTicketId?: string;
  /** URL base the session should POST status/completion to. */
  callbackUrl: string;
  /** Shared secret the session echoes as X-DevPilot-Callback-Token (§7.2). */
  callbackToken?: string;
  /** Managed environment the session should run in, if applicable. */
  environmentId?: string;
  /**
   * Give this session its own git worktree and branch — one task of a run.
   *
   * A transport MUST NOT send this to a runner that has not said it can do it.
   * A runner from before the capability ignores a field it does not know, so
   * the task would run in the shared checkout while everything upstream
   * believed it was isolated — and the merge at the end of the wave would then
   * find no branch. `HttpSessionTransport` checks; see `capabilities`.
   */
  isolation?: TaskIsolation;
  metadata?: Record<string, unknown>;
}

export interface CreateSessionResult {
  accepted: boolean;
  /** Provider-side session identifier used for status/cancel/send. */
  externalSessionId?: string;
  error?: string;
}

/**
 * Transport that knows how to create and steer a concrete session.
 * Swap the implementation to target a specific dispatch surface.
 */
export interface SessionTransport {
  createSession(params: CreateSessionParams): Promise<CreateSessionResult>;
  sendMessage(
    externalSessionId: string,
    message: string
  ): Promise<{ success: boolean; error?: string }>;
  stopSession(
    externalSessionId: string
  ): Promise<{ success: boolean; message: string }>;
  /** Optional pull fallback for environments that can't push. */
  getSession?(externalSessionId: string): Promise<Partial<JobStatus> | null>;
  /** Optional health probe. */
  health?(): Promise<Pick<OrchestratorHealth, 'status' | 'version'>>;
  /**
   * Optional. What the runner says it can do beyond the original contract
   * (`/v1/health` → `capabilities`), or null when it could not be asked.
   *
   * Null is not the same as an empty list: an empty list is a runner that
   * answered and listed nothing, and null is no answer at all. A transport
   * without this method cannot isolate, and is treated as saying so.
   */
  capabilities?(): Promise<string[] | null>;
  /**
   * Optional. Merge a wave's task branches into the run branch
   * (`POST /v1/integrate`). Never rejects: a runner that cannot be reached is
   * an answer (`ok: false`), because the caller has to do something with it.
   */
  integrate?(request: IntegrateRequest): Promise<IntegrateOutcome>;
}

/**
 * How long a merge may take before this side gives up on the answer.
 *
 * Deliberately longer than a create. The runner's own cap is two minutes PER
 * git command, and a merge is several; giving up at the default thirty seconds
 * would fail a run whose merge then went on to succeed, leaving a run branch
 * that holds work the plan row says was never merged.
 */
const INTEGRATE_TIMEOUT_MS = 5 * 60_000;

/**
 * Default transport speaking the §7.1 dispatcher API over HTTP. All routes are
 * versioned under `/v1`; auth is `Authorization: Bearer <sessionApiKey>`.
 */
export class HttpSessionTransport implements SessionTransport {
  /**
   * The runner's capabilities, once it has told us.
   *
   * Cached because every isolated create asks, and a wave is many creates. It
   * is dropped whenever the runner fails to do something it was asked — a
   * refused create, a failed merge, no answer at all — because the usual
   * reason a runner starts behaving differently is that it is a different
   * runner: restarted, upgraded, or put back to an older version. The next
   * question then goes to `/v1/health` again rather than to a memory of a
   * process that may no longer exist. A read that fails is never cached.
   */
  private knownCapabilities: string[] | null = null;

  constructor(
    private readonly baseUrl: string,
    private readonly apiKey?: string,
    private readonly timeoutMs = 30000
  ) {}

  /** Extract the runner's session id from a create/idempotent response body. */
  private static readExternalId(json: unknown): string | undefined {
    const j = (json ?? {}) as { externalSessionId?: string; sessionId?: string; id?: string };
    return j.externalSessionId ?? j.sessionId ?? j.id;
  }

  async capabilities(): Promise<string[] | null> {
    if (this.knownCapabilities) return this.knownCapabilities;
    try {
      const res = await this.fetch('/v1/health');
      if (!res.ok) return null;
      const json = (await res.json()) as { capabilities?: unknown };
      // A runner from before capabilities has no such field: it answered, and
      // it can do none of them.
      const capabilities = Array.isArray(json.capabilities)
        ? json.capabilities.filter((c): c is string => typeof c === 'string')
        : [];
      this.knownCapabilities = capabilities;
      return capabilities;
    } catch {
      return null;
    }
  }

  async createSession(params: CreateSessionParams): Promise<CreateSessionResult> {
    /**
     * Never send `isolation` to a runner that has not said it understands it.
     *
     * The plan decided to run isolated because a runner said it could. This
     * is the same question asked again at the last moment, for the case where
     * the runner behind the URL is no longer that one. Refusing here fails the
     * task with a reason; sending would start an agent in the shared checkout
     * with nothing recording that it was not isolated.
     */
    if (params.isolation) {
      const capabilities = await this.capabilities();
      if (!capabilities?.includes(ISOLATION_CAPABILITY)) {
        this.knownCapabilities = null;
        return {
          accepted: false,
          error:
            'ISOLATION_UNAVAILABLE: this run gives each task its own branch, and the session runner ' +
            (capabilities
              ? 'does not report that it can (it may have been replaced by an older version)'
              : 'did not answer when asked whether it can'),
        };
      }
    }

    try {
      const res = await this.fetch('/v1/sessions', {
        method: 'POST',
        body: JSON.stringify(params),
      });

      // 201 create / 200 idempotent re-post → accepted with the runner's id.
      if (res.status === 201 || res.status === 200) {
        const json = await res.json().catch(() => ({}));
        return { accepted: true, externalSessionId: HttpSessionTransport.readExternalId(json) };
      }

      // 409 → sessionId already dispatched: idempotent, body carries the
      // existing externalSessionId (§7.1). Treat as success.
      if (res.status === 409) {
        const json = await res.json().catch(() => ({}));
        const existing = HttpSessionTransport.readExternalId(json);
        if (existing) {
          return { accepted: true, externalSessionId: existing };
        }
        return { accepted: false, error: 'CONFLICT: session already dispatched without an id in response' };
      }

      // 429 → capacity: caller must queue the task, not fail it (§9.2).
      if (res.status === 429) {
        return { accepted: false, error: 'CAPACITY' };
      }

      // Anything else is the runner declining. Ask it what it is again before
      // the next isolated create (see `knownCapabilities`).
      this.knownCapabilities = null;
      const body = await res.text().catch(() => '');

      // The runner can isolate in general and cannot here — not a repository,
      // no commits yet. Its message says which, and is the whole reason the
      // task failed, so it is passed on as written rather than inside a JSON
      // body somebody has to read around.
      const refusal = HttpSessionTransport.readRefusal(body);
      if (refusal?.error === 'ISOLATION_UNAVAILABLE') {
        return { accepted: false, error: `ISOLATION_UNAVAILABLE: ${refusal.message ?? 'no reason given'}` };
      }

      return { accepted: false, error: `Session create failed: ${res.status} ${body}` };
    } catch (error) {
      this.knownCapabilities = null;
      return { accepted: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  private static readRefusal(body: string): { error?: string; message?: string } | null {
    try {
      const json = JSON.parse(body) as { error?: unknown; message?: unknown };
      return {
        error: typeof json.error === 'string' ? json.error : undefined,
        message: typeof json.message === 'string' ? json.message : undefined,
      };
    } catch {
      return null;
    }
  }

  async integrate(request: IntegrateRequest): Promise<IntegrateOutcome> {
    try {
      const res = await this.fetch(
        '/v1/integrate',
        { method: 'POST', body: JSON.stringify(request) },
        INTEGRATE_TIMEOUT_MS
      );
      const text = await res.text().catch(() => '');

      if (res.status === 200) {
        const result = HttpSessionTransport.readIntegration(text);
        if (result) return { ok: true, result };
        this.knownCapabilities = null;
        return {
          ok: false,
          code: 'BAD_RESPONSE',
          message: 'the session runner answered the merge with something that is not a merge result',
        };
      }

      this.knownCapabilities = null;
      const refusal = HttpSessionTransport.readRefusal(text);
      return {
        ok: false,
        code: refusal?.error ?? `HTTP_${res.status}`,
        // The runner's own sentence when it sent one: it says what is in the
        // way and what to do about it. A runner with no `/v1/integrate` at all
        // answers a bare 404, and that needs saying in words.
        message:
          refusal?.message ??
          `the session runner answered ${res.status}${refusal?.error ? ` (${refusal.error})` : ''} ` +
            `when asked to merge the wave — it may predate a branch per task`,
      };
    } catch (error) {
      this.knownCapabilities = null;
      return {
        ok: false,
        code: 'UNREACHABLE',
        message: `the session runner could not be reached to merge the wave (${
          error instanceof Error ? error.message : String(error)
        })`,
      };
    }
  }

  /** A merge result, if that is what the body is. Shape-checked: it is acted on. */
  private static readIntegration(body: string): IntegrationResult | null {
    try {
      const json = JSON.parse(body) as Partial<IntegrationResult>;
      if (typeof json.runBranch !== 'string' || typeof json.headSha !== 'string') return null;
      return {
        runBranch: json.runBranch,
        headSha: json.headSha,
        merged: Array.isArray(json.merged) ? json.merged : [],
        conflicts: Array.isArray(json.conflicts) ? json.conflicts : [],
        missing: Array.isArray(json.missing) ? json.missing : [],
      };
    } catch {
      return null;
    }
  }

  async sendMessage(externalSessionId: string, message: string) {
    try {
      const res = await this.fetch(`/v1/sessions/${externalSessionId}/messages`, {
        method: 'POST',
        body: JSON.stringify({ message }),
      });
      // 410 → session already terminal; steering is not possible.
      if (res.status === 410) {
        return { success: false, error: 'session already terminal' };
      }
      return res.ok
        ? { success: true }
        : { success: false, error: `send failed: ${res.status}` };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  async stopSession(externalSessionId: string) {
    try {
      const res = await this.fetch(`/v1/sessions/${externalSessionId}/stop`, { method: 'POST' });
      // 410 → already stopped: idempotent success.
      if (res.ok || res.status === 410) {
        return { success: true, message: `Session ${externalSessionId} stopped` };
      }
      return { success: false, message: `stop failed: ${res.status}` };
    } catch (error) {
      return { success: false, message: error instanceof Error ? error.message : String(error) };
    }
  }

  async getSession(externalSessionId: string): Promise<Partial<JobStatus> | null> {
    try {
      const res = await this.fetch(`/v1/sessions/${externalSessionId}`);
      if (!res.ok) return null;
      return (await res.json()) as Partial<JobStatus>;
    } catch {
      return null;
    }
  }

  async health() {
    try {
      const res = await this.fetch('/v1/health');
      if (!res.ok) return { status: 'down' as const, version: 'unknown' };
      const json = (await res.json()) as { version?: string };
      return { status: 'healthy' as const, version: json.version ?? 'unknown' };
    } catch {
      return { status: 'down' as const, version: 'unknown' };
    }
  }

  private async fetch(
    path: string,
    options: RequestInit = {},
    timeoutMs: number = this.timeoutMs
  ): Promise<Response> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.apiKey) headers['Authorization'] = `Bearer ${this.apiKey}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(`${this.baseUrl}${path}`, {
        ...options,
        headers: { ...headers, ...options.headers },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
  }
}

/** Last-known state cached from pushed callbacks, keyed by external session id. */
interface CachedSessionState {
  status: JobStatus;
  completion?: CompletionReport;
}

/**
 * Session-native orchestrator adapter.
 */
export class ClaudeSessionAdapter
  implements IOrchestratorAdapter, IPushCapableAdapter
{
  readonly mode: OrchestratorMode = 'claude-session';
  readonly pushBased = true;

  private readonly transport: SessionTransport;
  private readonly config: OrchestratorAdapterConfig;
  private readonly cache = new Map<string, CachedSessionState>();

  constructor(config: OrchestratorAdapterConfig, transport?: SessionTransport) {
    this.config = config;
    if (transport) {
      this.transport = transport;
    } else {
      if (!config.sessionApiUrl) {
        throw new Error(
          'claude-session adapter requires sessionApiUrl (or an injected SessionTransport)'
        );
      }
      this.transport = new HttpSessionTransport(
        config.sessionApiUrl,
        config.sessionApiKey ?? config.apiKey,
        config.timeout
      );
    }
  }

  async healthCheck(): Promise<OrchestratorHealth> {
    const base: OrchestratorHealth = {
      status: 'healthy',
      version: 'claude-session',
      activeJobs: this.cache.size,
      queueLength: 0,
      availableWorkers: 1,
    };
    if (this.transport.health) {
      const probe = await this.transport.health();
      return { ...base, status: probe.status, version: probe.version };
    }
    return base;
  }

  async dispatch(request: DispatchRequest): Promise<DispatchResponse> {
    const result = await this.transport.createSession({
      sessionId: request.sessionId,
      repo: request.repo,
      prompt: request.taskSpec.prompt,
      model: request.taskSpec.model,
      filePaths: request.taskSpec.filePaths,
      acceptanceCriteria: request.taskSpec.acceptanceCriteria,
      constraints: request.taskSpec.constraints,
      linearTicketId: request.linearTicketId,
      callbackUrl: request.callbackUrl,
      callbackToken: this.config.callbackToken,
      environmentId: this.config.sessionEnvironmentId,
      // Absent for every dispatch that is not a task of an isolated plan, and
      // then absent from the request body too: the runner runs the session in
      // the checkout itself, as it always has.
      ...(request.isolation ? { isolation: request.isolation } : {}),
      metadata: request.metadata,
    });

    if (!result.accepted || !result.externalSessionId) {
      return { accepted: false, error: result.error ?? 'Session dispatch rejected' };
    }

    // Seed cache so getJobStatus has an answer before the first callback lands.
    this.cache.set(result.externalSessionId, {
      status: {
        sessionId: request.sessionId,
        externalJobId: result.externalSessionId,
        status: 'queued',
        progressPercent: 0,
        message: 'Session dispatched, awaiting first update',
        startedAt: new Date().toISOString(),
      },
    });

    return {
      accepted: true,
      orchestratorJobId: result.externalSessionId,
      estimatedStartTime: new Date().toISOString(),
      queuePosition: 0,
    };
  }

  async getJobStatus(externalJobId: string): Promise<JobStatus> {
    const cached = this.cache.get(externalJobId);
    if (cached) return cached.status;

    // Pull fallback for environments that can't push.
    if (this.transport.getSession) {
      const pulled = await this.transport.getSession(externalJobId);
      if (pulled) {
        return {
          sessionId: externalJobId,
          externalJobId,
          status: pulled.status ?? 'running',
          progressPercent: pulled.progressPercent ?? 0,
          currentStep: pulled.currentStep,
          currentFile: pulled.currentFile,
          message: pulled.message,
          filesModified: pulled.filesModified,
          updatedAt: new Date().toISOString(),
        };
      }
    }

    return {
      sessionId: externalJobId,
      externalJobId,
      status: 'error',
      progressPercent: 0,
      message: 'Unknown session (no cached state and no pull fallback)',
    };
  }

  async cancel(externalJobId: string): Promise<{ success: boolean; message: string }> {
    const result = await this.transport.stopSession(externalJobId);
    if (result.success) this.cache.delete(externalJobId);
    return result;
  }

  async sendMessage(externalJobId: string, message: string): Promise<SendMessageResult> {
    const result = await this.transport.sendMessage(externalJobId, message);
    return result.success
      ? { success: true, message: 'Message delivered to session' }
      : { success: false, error: result.error };
  }

  async getCompletionReport(externalJobId: string): Promise<CompletionReport | null> {
    return this.cache.get(externalJobId)?.completion ?? null;
  }

  /**
   * Whether the runner behind this adapter can give a task its own branch.
   *
   * Three ways to be told no, and each is worded for the person who will read
   * it on the plan: the transport has no way to ask or to merge; the runner did
   * not answer; the runner answered and does not list the capability.
   *
   * "Did not answer" is reported as unsupported rather than waited out. The
   * plan's first task is about to be sent to that same runner; if it really is
   * down the dispatch fails and says so, and if it was a blip the plan runs
   * un-isolated with this reason on its row. What it must not do is guess.
   */
  async isolationSupport(): Promise<IsolationSupport> {
    if (!this.transport.capabilities || !this.transport.integrate) {
      return {
        supported: false,
        reason: 'the session transport in use cannot give a task its own branch or merge a wave',
      };
    }

    const capabilities = await this.transport.capabilities();
    if (capabilities === null) {
      return {
        supported: false,
        reason:
          'the session runner did not answer /v1/health when the run started, so it could not be ' +
          'asked whether it gives each task its own branch',
      };
    }
    if (!capabilities.includes(ISOLATION_CAPABILITY)) {
      return {
        supported: false,
        reason:
          `the session runner does not report the '${ISOLATION_CAPABILITY}' capability ` +
          '(it predates a worktree and branch per task) — upgrade the runner to isolate tasks',
      };
    }
    return { supported: true };
  }

  async integrate(request: IntegrateRequest): Promise<IntegrateOutcome> {
    if (!this.transport.integrate) {
      return {
        ok: false,
        code: 'UNSUPPORTED',
        message: 'the session transport in use cannot merge a wave',
      };
    }
    return this.transport.integrate(request);
  }

  async shutdown(): Promise<void> {
    this.cache.clear();
  }

  // --- IPushCapableAdapter -------------------------------------------------

  /**
   * Feed a pushed status update (from the session's POST to
   * `/api/orchestrator/status`) into the adapter's cache.
   */
  ingestStatus(externalJobId: string, update: StatusUpdate): void {
    const prev = this.cache.get(externalJobId);
    this.cache.set(externalJobId, {
      completion: prev?.completion,
      status: {
        sessionId: update.sessionId,
        externalJobId,
        status: update.status,
        progressPercent: update.progressPercent,
        currentStep: update.currentStep,
        currentFile: update.currentFile,
        message: update.message,
        filesModified: update.filesModified,
        tokensUsed: update.tokensUsed,
        updatedAt: update.timestamp,
      },
    });
  }

  /**
   * Feed a pushed completion report (from the session's POST to
   * `/api/orchestrator/complete`) into the adapter's cache.
   */
  ingestCompletion(externalJobId: string, report: CompletionReport): void {
    const prev = this.cache.get(externalJobId);
    this.cache.set(externalJobId, {
      completion: report,
      status: {
        sessionId: report.sessionId,
        externalJobId,
        status: report.success ? 'complete' : 'error',
        progressPercent: report.success ? 100 : prev?.status.progressPercent ?? 0,
        message: report.summary,
        filesModified: report.filesModified,
        tokensUsed: report.tokensUsed,
        costUsd: report.costUsd,
        updatedAt: new Date().toISOString(),
      },
    });
  }
}

/**
 * Create a session-native adapter. Pass a custom transport to target a
 * specific dispatch surface; otherwise an HttpSessionTransport is built from
 * `config.sessionApiUrl`.
 */
export function createClaudeSessionAdapter(
  config: OrchestratorAdapterConfig,
  transport?: SessionTransport
): ClaudeSessionAdapter {
  return new ClaudeSessionAdapter(config, transport);
}
