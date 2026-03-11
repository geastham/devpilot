/**
 * Status Poller
 *
 * Polls orchestrator for status updates on active sessions.
 * Updates rufloSessions table and syncs progress to Linear.
 */

import type { OrchestratorService } from './service';
import type { JobStatus, OrchestratorEvent } from './adapter';
import type { CompletionReport, StatusUpdate } from './types';

/**
 * Configuration for status poller
 */
export interface StatusPollerConfig {
  pollIntervalMs: number;
  maxRetries: number;
  onStatusUpdate?: (sessionId: string, status: JobStatus) => Promise<void>;
  onComplete?: (sessionId: string, report: CompletionReport) => Promise<void>;
  onError?: (sessionId: string, error: Error) => Promise<void>;
}

const DEFAULT_CONFIG: StatusPollerConfig = {
  pollIntervalMs: 5000, // 5 seconds
  maxRetries: 3,
};

/**
 * Tracked session state
 */
interface TrackedSession {
  sessionId: string;
  externalJobId: string;
  lastStatus?: JobStatus;
  retryCount: number;
  startedAt: Date;
  lastPollAt?: Date;
}

/**
 * Status poller for orchestrator sessions
 */
export class StatusPoller {
  private orchestrator: OrchestratorService;
  private config: StatusPollerConfig;
  private trackedSessions: Map<string, TrackedSession> = new Map();
  private pollInterval: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;
  private unsubscribe?: () => void;

  constructor(orchestrator: OrchestratorService, config: Partial<StatusPollerConfig> = {}) {
    this.orchestrator = orchestrator;
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Subscribe to orchestrator events
    this.unsubscribe = orchestrator.onEvent(this.handleOrchestratorEvent.bind(this));
  }

  /**
   * Handle events from orchestrator service
   */
  private handleOrchestratorEvent(event: OrchestratorEvent): void {
    switch (event.type) {
      case 'job:started':
        this.trackSession(event.sessionId, event.externalJobId);
        break;
      case 'job:complete':
      case 'job:error':
      case 'job:cancelled':
        this.untrackSession(event.sessionId);
        break;
    }
  }

  /**
   * Start tracking a session for polling
   */
  trackSession(sessionId: string, externalJobId: string): void {
    if (this.trackedSessions.has(sessionId)) return;

    this.trackedSessions.set(sessionId, {
      sessionId,
      externalJobId,
      retryCount: 0,
      startedAt: new Date(),
    });

    // Auto-start polling if we have sessions to track
    if (!this.isRunning && this.trackedSessions.size > 0) {
      this.start();
    }
  }

  /**
   * Stop tracking a session
   */
  untrackSession(sessionId: string): void {
    this.trackedSessions.delete(sessionId);

    // Auto-stop polling if no more sessions
    if (this.trackedSessions.size === 0) {
      this.stop();
    }
  }

  /**
   * Start the polling loop
   */
  start(): void {
    if (this.isRunning) return;

    this.isRunning = true;
    this.pollInterval = setInterval(
      () => this.poll(),
      this.config.pollIntervalMs
    );

    // Do an immediate poll
    this.poll();
  }

  /**
   * Stop the polling loop
   */
  stop(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    this.isRunning = false;
  }

  /**
   * Poll all tracked sessions for status
   */
  private async poll(): Promise<void> {
    const sessions = Array.from(this.trackedSessions.values());
    if (sessions.length === 0) return;

    // Poll all sessions concurrently
    await Promise.all(
      sessions.map(session => this.pollSession(session))
    );
  }

  /**
   * Poll a single session for status
   */
  private async pollSession(session: TrackedSession): Promise<void> {
    try {
      const status = await this.orchestrator.getJobStatus(session.externalJobId);
      session.lastPollAt = new Date();
      session.retryCount = 0; // Reset retry count on success

      // Check if status changed
      const statusChanged = !session.lastStatus ||
        session.lastStatus.status !== status.status ||
        session.lastStatus.progressPercent !== status.progressPercent ||
        session.lastStatus.currentStep !== status.currentStep;

      if (statusChanged) {
        session.lastStatus = status;

        // Notify status update callback
        if (this.config.onStatusUpdate) {
          await this.config.onStatusUpdate(session.sessionId, status);
        }
      }

      // Handle terminal states
      if (status.status === 'complete' || status.status === 'error' || status.status === 'cancelled') {
        await this.handleCompletion(session, status);
      }
    } catch (error) {
      session.retryCount++;

      if (session.retryCount >= this.config.maxRetries) {
        // Max retries exceeded, report error and stop tracking
        if (this.config.onError) {
          await this.config.onError(
            session.sessionId,
            error instanceof Error ? error : new Error(String(error))
          );
        }
        this.untrackSession(session.sessionId);
      }
    }
  }

  /**
   * Handle session completion
   */
  private async handleCompletion(session: TrackedSession, status: JobStatus): Promise<void> {
    // Try to get completion report
    const report = await this.orchestrator.getCompletionReport(session.sessionId);

    if (report && this.config.onComplete) {
      await this.config.onComplete(session.sessionId, report);
    } else if (status.status === 'error' && this.config.onError) {
      await this.config.onError(
        session.sessionId,
        new Error(status.message || 'Job failed')
      );
    }

    // Mark session complete in orchestrator
    if (report) {
      this.orchestrator.markSessionComplete(session.sessionId, report);
    }

    // Stop tracking
    this.untrackSession(session.sessionId);
  }

  /**
   * Get all currently tracked sessions
   */
  getTrackedSessions(): TrackedSession[] {
    return Array.from(this.trackedSessions.values());
  }

  /**
   * Get polling statistics
   */
  getStats(): {
    isRunning: boolean;
    trackedCount: number;
    pollIntervalMs: number;
  } {
    return {
      isRunning: this.isRunning,
      trackedCount: this.trackedSessions.size,
      pollIntervalMs: this.config.pollIntervalMs,
    };
  }

  /**
   * Shutdown the poller
   */
  shutdown(): void {
    this.stop();
    if (this.unsubscribe) {
      this.unsubscribe();
    }
    this.trackedSessions.clear();
  }
}

// Singleton instance management
let pollerInstance: StatusPoller | null = null;

/**
 * Initialize the status poller
 */
export function initStatusPoller(
  orchestrator: OrchestratorService,
  config?: Partial<StatusPollerConfig>
): StatusPoller {
  if (pollerInstance) {
    pollerInstance.shutdown();
  }
  pollerInstance = new StatusPoller(orchestrator, config);
  return pollerInstance;
}

/**
 * Get the status poller instance
 */
export function getStatusPoller(): StatusPoller {
  if (!pollerInstance) {
    throw new Error('Status poller not initialized. Call initStatusPoller first.');
  }
  return pollerInstance;
}

/**
 * Check if status poller is initialized
 */
export function isStatusPollerInitialized(): boolean {
  return pollerInstance !== null;
}

/**
 * Get status poller if initialized, otherwise return null
 */
export function getStatusPollerOrNull(): StatusPoller | null {
  return pollerInstance;
}
