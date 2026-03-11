/**
 * Orchestrator bridge type definitions
 * Defines the contract between DevPilot and the external agent-orchestrator
 */

export interface OrchestratorConfig {
  url: string;
  apiKey?: string;
  callbackUrl: string;
  timeout?: number;
}

/**
 * Request sent to orchestrator when dispatching work
 */
export interface DispatchRequest {
  sessionId: string;
  repo: string;
  taskSpec: TaskSpec;
  linearTicketId?: string;
  callbackUrl: string;
  metadata?: Record<string, unknown>;
}

export interface TaskSpec {
  prompt: string;
  filePaths: string[];
  model: 'haiku' | 'sonnet' | 'opus';
  workstream?: string;
  acceptanceCriteria?: string[];
  constraints?: string[];
  estimatedMinutes?: number;
}

/**
 * Status update received from orchestrator during execution
 */
export interface StatusUpdate {
  sessionId: string;
  status: 'queued' | 'running' | 'waiting' | 'complete' | 'error' | 'cancelled';
  progressPercent: number;
  currentStep?: string;
  currentFile?: string;
  message?: string;
  filesModified?: string[];
  tokensUsed?: number;
  timestamp: string;
}

/**
 * Completion report received when orchestrator finishes a task
 */
export interface CompletionReport {
  sessionId: string;
  success: boolean;
  prUrl?: string;
  commitSha?: string;
  filesModified: string[];
  filesCreated: string[];
  filesDeleted: string[];
  summary: string;
  tokensUsed: number;
  costUsd: number;
  durationMinutes: number;
  error?: {
    code: string;
    message: string;
    recoverable: boolean;
  };
  metadata?: Record<string, unknown>;
}

/**
 * Response from orchestrator when dispatch is accepted
 */
export interface DispatchResponse {
  accepted: boolean;
  orchestratorJobId?: string;
  estimatedStartTime?: string;
  queuePosition?: number;
  error?: string;
}

/**
 * Health check response from orchestrator
 */
export interface OrchestratorHealth {
  status: 'healthy' | 'degraded' | 'down';
  version: string;
  activeJobs: number;
  queueLength: number;
  availableWorkers: number;
}
