/**
 * HTTP client for communicating with the external agent-orchestrator
 */

import type {
  OrchestratorConfig,
  DispatchRequest,
  DispatchResponse,
  OrchestratorHealth,
} from './types';

export class OrchestratorClient {
  private config: OrchestratorConfig;

  constructor(config: OrchestratorConfig) {
    this.config = {
      ...config,
      timeout: config.timeout || 30000,
    };
  }

  /**
   * Check if orchestrator is healthy
   */
  async healthCheck(): Promise<OrchestratorHealth> {
    const response = await this.fetch('/health');
    return response.json() as Promise<OrchestratorHealth>;
  }

  /**
   * Dispatch a task to the orchestrator
   */
  async dispatch(request: DispatchRequest): Promise<DispatchResponse> {
    const response = await this.fetch('/dispatch', {
      method: 'POST',
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const error = await response.text();
      return {
        accepted: false,
        error: `Orchestrator rejected dispatch: ${error}`,
      };
    }

    return response.json() as Promise<DispatchResponse>;
  }

  /**
   * Cancel a running job
   */
  async cancel(sessionId: string): Promise<{ success: boolean; message: string }> {
    const response = await this.fetch(`/jobs/${sessionId}/cancel`, {
      method: 'POST',
    });

    return response.json() as Promise<{ success: boolean; message: string }>;
  }

  /**
   * Get status of a specific job
   */
  async getJobStatus(sessionId: string): Promise<{
    status: string;
    progressPercent: number;
    message?: string;
  }> {
    const response = await this.fetch(`/jobs/${sessionId}/status`);
    return response.json() as Promise<{
      status: string;
      progressPercent: number;
      message?: string;
    }>;
  }

  /**
   * Get queue information
   */
  async getQueue(): Promise<{
    length: number;
    estimatedWaitMinutes: number;
    jobs: { sessionId: string; status: string; queuePosition: number }[];
  }> {
    const response = await this.fetch('/queue');
    return response.json() as Promise<{
      length: number;
      estimatedWaitMinutes: number;
      jobs: { sessionId: string; status: string; queuePosition: number }[];
    }>;
  }

  private async fetch(path: string, options: RequestInit = {}): Promise<Response> {
    const url = `${this.config.url}${path}`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.config.apiKey) {
      headers['Authorization'] = `Bearer ${this.config.apiKey}`;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          ...headers,
          ...options.headers,
        },
        signal: controller.signal,
      });

      return response;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

// Singleton instance management
let clientInstance: OrchestratorClient | null = null;

export function initOrchestratorClient(config: OrchestratorConfig): OrchestratorClient {
  clientInstance = new OrchestratorClient(config);
  return clientInstance;
}

export function getOrchestratorClient(): OrchestratorClient {
  if (!clientInstance) {
    throw new Error('Orchestrator client not initialized. Call initOrchestratorClient first.');
  }
  return clientInstance;
}

export function isOrchestratorConfigured(): boolean {
  return clientInstance !== null;
}

/**
 * Build a dispatch request from session data
 */
export function buildDispatchRequest(params: {
  sessionId: string;
  repo: string;
  title: string;
  filePaths: string[];
  model?: 'haiku' | 'sonnet' | 'opus';
  workstream?: string;
  acceptanceCriteria?: string[];
  linearTicketId?: string;
  callbackUrl: string;
  estimatedMinutes?: number;
}): DispatchRequest {
  return {
    sessionId: params.sessionId,
    repo: params.repo,
    linearTicketId: params.linearTicketId,
    callbackUrl: params.callbackUrl,
    taskSpec: {
      prompt: `Complete the task: ${params.title}`,
      filePaths: params.filePaths,
      model: params.model || 'sonnet',
      workstream: params.workstream,
      acceptanceCriteria: params.acceptanceCriteria,
      estimatedMinutes: params.estimatedMinutes,
    },
  };
}
