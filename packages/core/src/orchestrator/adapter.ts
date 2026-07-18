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
 *
 * - `claude-session`: session-native dispatch. Spawns/resumes a managed Claude
 *   Code session and receives progress via pushed callbacks (no polling). This
 *   is the forward-looking default; `ao-cli` is retained as a legacy fallback.
 * - `ao-cli`: legacy. Shells out to the `ao` CLI and scrapes `ao status` on a
 *   poll loop. Superseded by `claude-session`; kept for backward compatibility.
 * - `http`: dispatch to a remote orchestrator over HTTP.
 * - `disabled`: no orchestrator.
 */
export type OrchestratorMode = 'claude-session' | 'http' | 'ao-cli' | 'disabled';

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

  // ao CLI mode config (legacy)
  aoProjectName?: string;
  aoPath?: string;
  workingDirectory?: string;
  pollIntervalMs?: number;

  // claude-session mode config
  // Base URL of the session dispatcher (hosted DevPilot bridge / Claude Code
  // remote-session API) that creates and manages sessions.
  sessionApiUrl?: string;
  // Managed environment the session should run in, if applicable.
  sessionEnvironmentId?: string;
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
   * Whether this adapter receives progress via pushed callbacks rather than
   * being polled. Push-based adapters (e.g. `claude-session`) should NOT be
   * tracked by the StatusPoller. Undefined/false preserves the legacy
   * poll-based behavior used by `ao-cli` and `http`.
   */
  readonly pushBased?: boolean;

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

/**
 * Capability mixin for push-based adapters.
 *
 * Session-native adapters don't poll for status — instead the running session
 * POSTs progress and completion to DevPilot's callback endpoints
 * (`/api/orchestrator/status`, `/api/orchestrator/complete`). Those endpoints
 * (or the OrchestratorService) forward the payloads here so the adapter can
 * cache last-known state to answer `getJobStatus`/`getCompletionReport`.
 */
export interface IPushCapableAdapter {
  ingestStatus(externalJobId: string, update: StatusUpdate): void;
  ingestCompletion(externalJobId: string, report: CompletionReport): void;
}

/**
 * Type guard for adapters that accept pushed status/completion updates.
 */
export function isPushCapableAdapter(
  adapter: IOrchestratorAdapter
): adapter is IOrchestratorAdapter & IPushCapableAdapter {
  return (
    typeof (adapter as Partial<IPushCapableAdapter>).ingestStatus === 'function' &&
    typeof (adapter as Partial<IPushCapableAdapter>).ingestCompletion === 'function'
  );
}
