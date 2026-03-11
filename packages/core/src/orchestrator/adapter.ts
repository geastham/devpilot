/**
 * Orchestrator Adapter Interface
 *
 * Defines the contract for orchestrator implementations.
 * Allows switching between HTTP-based orchestrator and ao CLI.
 */

import type {
  DispatchRequest,
  DispatchResponse,
  OrchestratorHealth,
  StatusUpdate,
  CompletionReport,
} from './types';

/**
 * Orchestrator modes supported by DevPilot
 */
export type OrchestratorMode = 'http' | 'ao-cli' | 'disabled';

/**
 * Configuration for orchestrator adapter
 */
export interface OrchestratorAdapterConfig {
  mode: OrchestratorMode;

  // HTTP mode config
  url?: string;
  apiKey?: string;
  callbackUrl?: string;
  timeout?: number;

  // ao CLI mode config
  aoProjectName?: string;
  aoPath?: string;
  workingDirectory?: string;
  pollIntervalMs?: number;
}

/**
 * Job status with additional ao-specific fields
 */
export interface JobStatus {
  sessionId: string;
  externalJobId?: string;
  status: 'queued' | 'running' | 'waiting' | 'complete' | 'error' | 'cancelled';
  progressPercent: number;
  currentStep?: string;
  currentFile?: string;
  message?: string;
  filesModified?: string[];
  tokensUsed?: number;
  costUsd?: number;
  startedAt?: string;
  updatedAt?: string;
}

/**
 * Result of sending a message to an active session
 */
export interface SendMessageResult {
  success: boolean;
  message?: string;
  error?: string;
}

/**
 * Interface that all orchestrator adapters must implement
 */
export interface IOrchestratorAdapter {
  /**
   * Get adapter mode identifier
   */
  readonly mode: OrchestratorMode;

  /**
   * Check if orchestrator is healthy and available
   */
  healthCheck(): Promise<OrchestratorHealth>;

  /**
   * Dispatch a task to the orchestrator
   * Returns immediately with job ID, actual execution is async
   */
  dispatch(request: DispatchRequest): Promise<DispatchResponse>;

  /**
   * Get the current status of a job
   */
  getJobStatus(externalJobId: string): Promise<JobStatus>;

  /**
   * Cancel a running job
   */
  cancel(externalJobId: string): Promise<{ success: boolean; message: string }>;

  /**
   * Send a message to an active session (for clarifications/guidance)
   */
  sendMessage?(externalJobId: string, message: string): Promise<SendMessageResult>;

  /**
   * Get completion report for a finished job
   */
  getCompletionReport?(externalJobId: string): Promise<CompletionReport | null>;

  /**
   * Stop polling/cleanup resources
   */
  shutdown?(): Promise<void>;
}

/**
 * Event types emitted by orchestrator adapters
 */
export type OrchestratorEventType =
  | 'job:started'
  | 'job:progress'
  | 'job:complete'
  | 'job:error'
  | 'job:cancelled';

/**
 * Event payload for orchestrator events
 */
export interface OrchestratorEvent {
  type: OrchestratorEventType;
  sessionId: string;
  externalJobId: string;
  timestamp: string;
  data: StatusUpdate | CompletionReport | { error: string };
}

/**
 * Callback for orchestrator events
 */
export type OrchestratorEventCallback = (event: OrchestratorEvent) => void;
