/**
 * Unified Orchestrator Service
 *
 * Strategy pattern implementation that switches between HTTP and ao-cli adapters.
 * Provides a single interface for fleet dispatch regardless of underlying orchestrator.
 */

import type {
  IOrchestratorAdapter,
  OrchestratorAdapterConfig,
  OrchestratorMode,
  JobStatus,
  SendMessageResult,
  OrchestratorEvent,
  OrchestratorEventCallback,
} from './adapter';
import { isPushCapableAdapter } from './adapter';
import type {
  DispatchRequest,
  DispatchResponse,
  OrchestratorHealth,
  StatusUpdate,
  CompletionReport,
} from './types';
import { OrchestratorClient } from './client';
import { AoCliAdapter } from './ao-cli-adapter';
import { ClaudeSessionAdapter, type SessionTransport } from './claude-session-adapter';

/**
 * HTTP adapter that wraps the existing OrchestratorClient
 * to implement IOrchestratorAdapter interface
 */
class HttpAdapter implements IOrchestratorAdapter {
  readonly mode: OrchestratorMode = 'http';
  private client: OrchestratorClient;

  constructor(config: OrchestratorAdapterConfig) {
    if (!config.url) {
      throw new Error('HTTP adapter requires url configuration');
    }
    this.client = new OrchestratorClient({
      url: config.url,
      apiKey: config.apiKey,
      callbackUrl: config.callbackUrl || '',
      timeout: config.timeout,
    });
  }

  async healthCheck(): Promise<OrchestratorHealth> {
    return this.client.healthCheck();
  }

  async dispatch(request: DispatchRequest): Promise<DispatchResponse> {
    return this.client.dispatch(request);
  }

  /**
   * Forwarded so http mode can actually finish.
   *
   * IOrchestratorAdapter.getCompletionReport is OPTIONAL, and this adapter did
   * not implement it — so OrchestratorService.getCompletionReport always
   * returned null for http mode, StatusPoller.handleCompletion never invoked
   * onComplete, and a job that finished locally was never reported to the host.
   * The ao-cli and claude-session adapters both implement it; this was the odd
   * one out.
   */
  async getCompletionReport(externalJobId: string): Promise<CompletionReport | null> {
    return this.client.getCompletionReport(externalJobId);
  }

  async getJobStatus(externalJobId: string): Promise<JobStatus> {
    const status = await this.client.getJobStatus(externalJobId);
    return {
      sessionId: externalJobId,
      externalJobId,
      status: status.status as JobStatus['status'],
      progressPercent: status.progressPercent,
      message: status.message,
    };
  }

  async cancel(externalJobId: string): Promise<{ success: boolean; message: string }> {
    return this.client.cancel(externalJobId);
  }

  async sendMessage(_externalJobId: string, _message: string): Promise<SendMessageResult> {
    // HTTP adapter doesn't support sending messages directly
    return {
      success: false,
      error: 'HTTP adapter does not support direct messaging',
    };
  }

  async shutdown(): Promise<void> {
    // HTTP client doesn't need cleanup
  }
}

/**
 * Disabled adapter that rejects all operations
 */
class DisabledAdapter implements IOrchestratorAdapter {
  readonly mode: OrchestratorMode = 'disabled';

  async healthCheck(): Promise<OrchestratorHealth> {
    return {
      status: 'down',
      version: 'disabled',
      activeJobs: 0,
      queueLength: 0,
      availableWorkers: 0,
    };
  }

  async dispatch(_request: DispatchRequest): Promise<DispatchResponse> {
    return {
      accepted: false,
      error: 'Orchestrator is disabled',
    };
  }

  async getJobStatus(externalJobId: string): Promise<JobStatus> {
    return {
      sessionId: externalJobId,
      externalJobId,
      status: 'error',
      progressPercent: 0,
      message: 'Orchestrator is disabled',
    };
  }

  async cancel(_externalJobId: string): Promise<{ success: boolean; message: string }> {
    return {
      success: false,
      message: 'Orchestrator is disabled',
    };
  }

  async shutdown(): Promise<void> {}
}

/**
 * Session mapping to track DevPilot session <-> external job ID relationship
 */
interface SessionMapping {
  sessionId: string;
  externalJobId: string;
  mode: OrchestratorMode;
  startedAt: Date;
  lastStatusAt?: Date;
}

/**
 * Unified orchestrator service
 */
export class OrchestratorService {
  private adapter: IOrchestratorAdapter;
  private config: OrchestratorAdapterConfig;
  private sessionMappings: Map<string, SessionMapping> = new Map();
  private eventCallbacks: Set<OrchestratorEventCallback> = new Set();

  // Optional transport override for the claude-session adapter (tests / custom
  // dispatch surfaces). When set, it is passed through to the adapter instead
  // of building an HttpSessionTransport from config.
  private sessionTransport?: SessionTransport;

  constructor(config: OrchestratorAdapterConfig, sessionTransport?: SessionTransport) {
    this.config = config;
    this.sessionTransport = sessionTransport;
    this.adapter = this.createAdapter(config);
  }

  /**
   * Create the appropriate adapter based on mode
   */
  private createAdapter(config: OrchestratorAdapterConfig): IOrchestratorAdapter {
    switch (config.mode) {
      case 'claude-session':
        return new ClaudeSessionAdapter(config, this.sessionTransport);
      case 'http':
        return new HttpAdapter(config);
      case 'ao-cli':
        return new AoCliAdapter(config);
      case 'disabled':
      default:
        return new DisabledAdapter();
    }
  }

  /**
   * Whether the active adapter receives progress via pushed callbacks. When
   * true, the StatusPoller should not track its sessions.
   */
  get isPushBased(): boolean {
    return this.adapter.pushBased ?? false;
  }

  /**
   * Get current orchestrator mode
   */
  get mode(): OrchestratorMode {
    return this.adapter.mode;
  }

  /**
   * Check if orchestrator is available
   */
  get isEnabled(): boolean {
    return this.adapter.mode !== 'disabled';
  }

  /**
   * Subscribe to orchestrator events
   */
  onEvent(callback: OrchestratorEventCallback): () => void {
    this.eventCallbacks.add(callback);
    return () => this.eventCallbacks.delete(callback);
  }

  /**
   * Emit an event to all subscribers
   */
  private emitEvent(event: OrchestratorEvent): void {
    for (const callback of this.eventCallbacks) {
      try {
        callback(event);
      } catch (error) {
        console.error('Error in orchestrator event callback:', error);
      }
    }
  }

  /**
   * Check orchestrator health
   */
  async healthCheck(): Promise<OrchestratorHealth> {
    return this.adapter.healthCheck();
  }

  /**
   * Dispatch a task to the orchestrator
   * Stores session mapping for later status queries
   */
  async dispatch(request: DispatchRequest): Promise<DispatchResponse & { mode: OrchestratorMode }> {
    const response = await this.adapter.dispatch(request);

    if (response.accepted && response.orchestratorJobId) {
      // Store mapping between DevPilot session and external job
      this.sessionMappings.set(request.sessionId, {
        sessionId: request.sessionId,
        externalJobId: response.orchestratorJobId,
        mode: this.adapter.mode,
        startedAt: new Date(),
      });

      // Emit started event
      this.emitEvent({
        type: 'job:started',
        sessionId: request.sessionId,
        externalJobId: response.orchestratorJobId,
        timestamp: new Date().toISOString(),
        data: {
          sessionId: request.sessionId,
          status: 'running',
          progressPercent: 0,
          timestamp: new Date().toISOString(),
        },
      });
    }

    return {
      ...response,
      mode: this.adapter.mode,
    };
  }

  /**
   * Get job status by DevPilot session ID
   */
  async getJobStatusBySessionId(sessionId: string): Promise<JobStatus | null> {
    const mapping = this.sessionMappings.get(sessionId);
    if (!mapping) {
      return null;
    }

    const status = await this.adapter.getJobStatus(mapping.externalJobId);

    // Update mapping
    mapping.lastStatusAt = new Date();

    // Emit progress event
    this.emitEvent({
      type: 'job:progress',
      sessionId,
      externalJobId: mapping.externalJobId,
      timestamp: new Date().toISOString(),
      data: {
        sessionId,
        status: status.status,
        progressPercent: status.progressPercent,
        currentStep: status.currentStep,
        currentFile: status.currentFile,
        message: status.message,
        filesModified: status.filesModified,
        tokensUsed: status.tokensUsed,
        timestamp: new Date().toISOString(),
      },
    });

    return status;
  }

  /**
   * Get job status by external job ID
   */
  async getJobStatus(externalJobId: string): Promise<JobStatus> {
    return this.adapter.getJobStatus(externalJobId);
  }

  /**
   * Cancel a job by DevPilot session ID
   */
  async cancelBySessionId(sessionId: string): Promise<{ success: boolean; message: string }> {
    const mapping = this.sessionMappings.get(sessionId);
    if (!mapping) {
      return {
        success: false,
        message: `No active job found for session ${sessionId}`,
      };
    }

    const result = await this.adapter.cancel(mapping.externalJobId);

    if (result.success) {
      // Emit cancelled event
      this.emitEvent({
        type: 'job:cancelled',
        sessionId,
        externalJobId: mapping.externalJobId,
        timestamp: new Date().toISOString(),
        data: { error: 'Cancelled by user' },
      });

      // Remove mapping
      this.sessionMappings.delete(sessionId);
    }

    return result;
  }

  /**
   * Cancel a job by external job ID
   */
  async cancel(externalJobId: string): Promise<{ success: boolean; message: string }> {
    return this.adapter.cancel(externalJobId);
  }

  /**
   * Send a message to an active session
   */
  async sendMessage(sessionId: string, message: string): Promise<SendMessageResult> {
    const mapping = this.sessionMappings.get(sessionId);
    if (!mapping) {
      return {
        success: false,
        error: `No active job found for session ${sessionId}`,
      };
    }

    if (!this.adapter.sendMessage) {
      return {
        success: false,
        error: `Current adapter (${this.adapter.mode}) does not support messaging`,
      };
    }

    return this.adapter.sendMessage(mapping.externalJobId, message);
  }

  /**
   * Get completion report for a finished job
   */
  async getCompletionReport(sessionId: string): Promise<CompletionReport | null> {
    const mapping = this.sessionMappings.get(sessionId);
    if (!mapping) {
      return null;
    }

    if (!this.adapter.getCompletionReport) {
      return null;
    }

    return this.adapter.getCompletionReport(mapping.externalJobId);
  }

  /**
   * Ingest a pushed status update from a session callback
   * (`/api/orchestrator/status`). For push-based adapters this replaces the
   * poll loop: the payload is cached on the adapter and re-emitted as a
   * `job:progress` event to SSE subscribers. No-op mapping if the session is
   * unknown. Safe to call for non-push adapters (falls through to event only).
   */
  ingestStatusUpdate(update: StatusUpdate): void {
    const mapping = this.sessionMappings.get(update.sessionId);
    if (mapping && isPushCapableAdapter(this.adapter)) {
      this.adapter.ingestStatus(mapping.externalJobId, update);
      mapping.lastStatusAt = new Date();
    }

    this.emitEvent({
      type: 'job:progress',
      sessionId: update.sessionId,
      externalJobId: mapping?.externalJobId ?? update.sessionId,
      timestamp: update.timestamp,
      data: update,
    });
  }

  /**
   * Ingest a pushed completion report from a session callback
   * (`/api/orchestrator/complete`). Caches it on the adapter (so
   * getCompletionReport can serve it) and finalizes the session.
   */
  ingestCompletionReport(report: CompletionReport): void {
    const mapping = this.sessionMappings.get(report.sessionId);
    if (mapping && isPushCapableAdapter(this.adapter)) {
      this.adapter.ingestCompletion(mapping.externalJobId, report);
    }
    this.markSessionComplete(report.sessionId, report);
  }

  /**
   * Mark a session as complete (for external completion notifications)
   */
  markSessionComplete(sessionId: string, report: CompletionReport): void {
    const mapping = this.sessionMappings.get(sessionId);
    if (!mapping) return;

    this.emitEvent({
      type: report.success ? 'job:complete' : 'job:error',
      sessionId,
      externalJobId: mapping.externalJobId,
      timestamp: new Date().toISOString(),
      data: report,
    });

    // Remove completed session from active mappings
    this.sessionMappings.delete(sessionId);
  }

  /**
   * Get all active session mappings
   */
  getActiveSessions(): SessionMapping[] {
    return Array.from(this.sessionMappings.values());
  }

  /**
   * Get external job ID for a session
   */
  getExternalJobId(sessionId: string): string | undefined {
    return this.sessionMappings.get(sessionId)?.externalJobId;
  }

  /**
   * Shutdown the orchestrator service
   */
  async shutdown(): Promise<void> {
    if (this.adapter.shutdown) {
      await this.adapter.shutdown();
    }
    this.sessionMappings.clear();
    this.eventCallbacks.clear();
  }
}

// Singleton instance management
//
// Held on `globalThis`, NOT in a module-level `let`.
//
// `packages/core` ships five tsup entries with `splitting: false`, so
// `dist/orchestrator/index.*` and `dist/wave-planner/index.*` each inline their
// OWN copy of this module. With a module-level variable, a service initialised
// through `@devpilot.sh/core/orchestrator` was invisible to
// `WaveDispatchCoordinator` living in `@devpilot.sh/core/wave-planner`: every
// task came back ORCHESTRATOR_UNAVAILABLE and was silently QUEUED, so wave
// dispatch reported success, changed no task status, and started no agent.
//
// That made wave dispatch unable to work through the Next app at all. It went
// unnoticed because `/api/fleet/dispatch` calls `service.dispatch()` directly
// and never crosses the bundle boundary — only the coordinator path does.
//
// globalThis is bundler-proof, which matters more than elegance here: `tsup
// splitting: true` would fix the ESM build and leave CJS duplicated, and this
// package ships both.
const globalForOrchestrator = globalThis as unknown as {
  __devpilotOrchestratorService?: OrchestratorService | null;
};

function getInstance(): OrchestratorService | null {
  return globalForOrchestrator.__devpilotOrchestratorService ?? null;
}

function setInstance(service: OrchestratorService | null): void {
  globalForOrchestrator.__devpilotOrchestratorService = service;
}

/**
 * Initialize the orchestrator service with configuration
 */
export function initOrchestratorService(
  config: OrchestratorAdapterConfig,
  sessionTransport?: SessionTransport
): OrchestratorService {
  const existing = getInstance();
  if (existing) {
    // Shutdown existing instance before creating new one
    existing.shutdown();
  }
  const service = new OrchestratorService(config, sessionTransport);
  setInstance(service);
  return service;
}

/**
 * Get the orchestrator service instance
 * Throws if not initialized
 */
export function getOrchestratorService(): OrchestratorService {
  const service = getInstance();
  if (!service) {
    throw new Error('Orchestrator service not initialized. Call initOrchestratorService first.');
  }
  return service;
}

/**
 * Check if orchestrator service is initialized
 */
export function isOrchestratorServiceInitialized(): boolean {
  return getInstance() !== null;
}

/**
 * Get orchestrator service if initialized, otherwise return null
 */
export function getOrchestratorServiceOrNull(): OrchestratorService | null {
  return getInstance();
}
