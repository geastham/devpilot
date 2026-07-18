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
 * SCAFFOLD NOTE
 * -------------
 * The concrete mechanism for *creating* and *steering* a session (remote
 * session API, trigger/routine, hosted bridge, etc.) is environment-specific
 * and intentionally not hardcoded here. It lives behind the `SessionTransport`
 * interface so it can be wired to whatever dispatch surface DevPilot targets.
 * `HttpSessionTransport` is a reasonable default that POSTs to a configurable
 * session API; its routes are placeholders (marked TODO) pending the real
 * dispatch contract.
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
} from './types';

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
  /** Managed environment the session should run in, if applicable. */
  environmentId?: string;
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
}

/**
 * Default transport: POSTs to a configurable session dispatcher over HTTP.
 *
 * TODO(session-native): the endpoint paths below are placeholders. Replace
 * with the real DevPilot bridge / Claude Code remote-session contract once
 * defined, and thread through auth (workspace token, environment id).
 */
export class HttpSessionTransport implements SessionTransport {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey?: string,
    private readonly timeoutMs = 30000
  ) {}

  async createSession(params: CreateSessionParams): Promise<CreateSessionResult> {
    try {
      const res = await this.fetch('/sessions', {
        method: 'POST',
        body: JSON.stringify(params),
      });
      if (!res.ok) {
        return { accepted: false, error: `Session create failed: ${res.status} ${await res.text()}` };
      }
      const json = (await res.json()) as { sessionId?: string; externalSessionId?: string; id?: string };
      return {
        accepted: true,
        externalSessionId: json.externalSessionId ?? json.sessionId ?? json.id,
      };
    } catch (error) {
      return { accepted: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  async sendMessage(externalSessionId: string, message: string) {
    try {
      const res = await this.fetch(`/sessions/${externalSessionId}/messages`, {
        method: 'POST',
        body: JSON.stringify({ message }),
      });
      return res.ok
        ? { success: true }
        : { success: false, error: `send failed: ${res.status}` };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  async stopSession(externalSessionId: string) {
    try {
      const res = await this.fetch(`/sessions/${externalSessionId}/stop`, { method: 'POST' });
      return res.ok
        ? { success: true, message: `Session ${externalSessionId} stopped` }
        : { success: false, message: `stop failed: ${res.status}` };
    } catch (error) {
      return { success: false, message: error instanceof Error ? error.message : String(error) };
    }
  }

  async getSession(externalSessionId: string): Promise<Partial<JobStatus> | null> {
    try {
      const res = await this.fetch(`/sessions/${externalSessionId}`);
      if (!res.ok) return null;
      return (await res.json()) as Partial<JobStatus>;
    } catch {
      return null;
    }
  }

  async health() {
    try {
      const res = await this.fetch('/health');
      if (!res.ok) return { status: 'down' as const, version: 'unknown' };
      const json = (await res.json()) as { version?: string };
      return { status: 'healthy' as const, version: json.version ?? 'unknown' };
    } catch {
      return { status: 'down' as const, version: 'unknown' };
    }
  }

  private async fetch(path: string, options: RequestInit = {}): Promise<Response> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.apiKey) headers['Authorization'] = `Bearer ${this.apiKey}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
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
        config.apiKey,
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
      environmentId: this.config.sessionEnvironmentId,
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
