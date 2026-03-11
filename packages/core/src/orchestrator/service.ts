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
import type {
  DispatchRequest,
  DispatchResponse,
  OrchestratorHealth,
  CompletionReport,
} from './types';
import { OrchestratorClient } from './client';
import { AoCliAdapter } from './ao-cli-adapter';

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

  constructor(config: OrchestratorAdapterConfig) {
    this.config = config;
    this.adapter = this.createAdapter(config);
  }

  /**
   * Create the appropriate adapter based on mode
   */
  private createAdapter(config: OrchestratorAdapterConfig): IOrchestratorAdapter {
    switch (config.mode) {
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
let serviceInstance: OrchestratorService | null = null;

/**
 * Initialize the orchestrator service with configuration
 */
export function initOrchestratorService(config: OrchestratorAdapterConfig): OrchestratorService {
  if (serviceInstance) {
    // Shutdown existing instance before creating new one
    serviceInstance.shutdown();
  }
  serviceInstance = new OrchestratorService(config);
  return serviceInstance;
}

/**
 * Get the orchestrator service instance
 * Throws if not initialized
 */
export function getOrchestratorService(): OrchestratorService {
  if (!serviceInstance) {
    throw new Error('Orchestrator service not initialized. Call initOrchestratorService first.');
  }
  return serviceInstance;
}

/**
 * Check if orchestrator service is initialized
 */
export function isOrchestratorServiceInitialized(): boolean {
  return serviceInstance !== null;
}

/**
 * Get orchestrator service if initialized, otherwise return null
 */
export function getOrchestratorServiceOrNull(): OrchestratorService | null {
  return serviceInstance;
}
