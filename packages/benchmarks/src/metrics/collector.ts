/**
 * Metrics Collector
 *
 * Central aggregator for all metrics during benchmark execution.
 * Provides real-time access to metrics and calculates derived values.
 */

import type {
  SessionRecord,
  TokenUsage,
  CostEntry,
  TimelineEvent,
  ModelPricing,
} from '../types';
import { TokenTracker, createEmptyUsage, addUsage } from './token-tracker';
import { CostCalculator } from './cost-calculator';
import { TimelineRecorder } from './timeline';

/**
 * Real-time metrics snapshot.
 */
export interface MetricsSnapshot {
  /** Wall clock time since start in ms */
  wallClockMs: number;
  /** Total tokens used */
  totalTokens: number;
  /** Total input tokens */
  totalTokensInput: number;
  /** Total output tokens */
  totalTokensOutput: number;
  /** Total cost in USD */
  totalCostUsd: number;
  /** Active sessions count */
  sessionsActive: number;
  /** Completed sessions count */
  sessionsCompleted: number;
  /** Failed sessions count */
  sessionsFailed: number;
  /** Files created count */
  filesCreated: number;
  /** Files modified count */
  filesModified: number;
}

/**
 * Session metrics summary.
 */
export interface SessionMetrics {
  sessionId: string;
  model: string;
  durationMs: number;
  tokens: TokenUsage;
  costUsd: number;
  success: boolean;
}

/**
 * Scenario-level aggregated metrics.
 */
export interface ScenarioMetrics {
  /** Total wall clock time in ms */
  wallClockMs: number;
  /** Total token usage */
  tokens: TokenUsage;
  /** Total cost in USD */
  totalCostUsd: number;
  /** Cost breakdown by session */
  costBreakdown: CostEntry[];
  /** Session count */
  sessionCount: number;
  /** Success rate (0-1) */
  successRate: number;
  /** Files created */
  filesCreated: string[];
  /** Files modified */
  filesModified: string[];
  /** Rework ratio */
  reworkRatio: number;
  /** First attempt pass rate */
  firstAttemptPassRate: number;
}

/**
 * Central metrics collector that aggregates from multiple sources.
 */
export class MetricsCollector {
  private tokenTracker: TokenTracker;
  private costCalculator: CostCalculator;
  private timeline: TimelineRecorder;
  private sessions: Map<string, SessionRecord> = new Map();
  private startTime: Date;
  private filesCreated: Set<string> = new Set();
  private filesModified: Set<string> = new Set();

  constructor(
    tokenTracker?: TokenTracker,
    costCalculator?: CostCalculator,
    timeline?: TimelineRecorder
  ) {
    this.tokenTracker = tokenTracker ?? new TokenTracker();
    this.costCalculator = costCalculator ?? new CostCalculator();
    this.timeline = timeline ?? new TimelineRecorder();
    this.startTime = new Date();
  }

  // ===========================================================================
  // Initialization
  // ===========================================================================

  /**
   * Start metrics collection.
   */
  start(runId: string): void {
    this.startTime = new Date();
    this.timeline.runStart(runId);
    this.sessions.clear();
    this.filesCreated.clear();
    this.filesModified.clear();
  }

  /**
   * Stop metrics collection.
   */
  stop(results: Record<string, unknown> = {}): void {
    this.timeline.runComplete(results);
  }

  // ===========================================================================
  // Session Tracking
  // ===========================================================================

  /**
   * Register a new session.
   */
  registerSession(session: SessionRecord): void {
    this.sessions.set(session.sessionId, session);

    // Record token usage
    this.tokenTracker.recordUsage(session.sessionId, session.model, {
      inputTokens: session.tokensInput,
      outputTokens: session.tokensOutput,
      cacheReadTokens: session.cacheReadTokens,
      cacheWriteTokens: session.cacheWriteTokens,
      totalTokens: session.tokensInput + session.tokensOutput,
    });

    // Track files
    session.filesCreated.forEach((f) => this.filesCreated.add(f));
    session.filesModified.forEach((f) => this.filesModified.add(f));
  }

  /**
   * Update an existing session.
   */
  updateSession(sessionId: string, update: Partial<SessionRecord>): void {
    const existing = this.sessions.get(sessionId);
    if (existing) {
      const updated = { ...existing, ...update };
      this.sessions.set(sessionId, updated);

      // Update token tracking if tokens changed
      if (
        update.tokensInput !== undefined ||
        update.tokensOutput !== undefined
      ) {
        this.tokenTracker.recordUsage(sessionId, updated.model, {
          inputTokens: updated.tokensInput,
          outputTokens: updated.tokensOutput,
          cacheReadTokens: updated.cacheReadTokens,
          cacheWriteTokens: updated.cacheWriteTokens,
          totalTokens: updated.tokensInput + updated.tokensOutput,
        });
      }

      // Track new files
      update.filesCreated?.forEach((f) => this.filesCreated.add(f));
      update.filesModified?.forEach((f) => this.filesModified.add(f));
    }
  }

  /**
   * Mark a session as complete.
   */
  completeSession(
    sessionId: string,
    report: {
      success: boolean;
      tokensInput?: number;
      tokensOutput?: number;
      cacheReadTokens?: number;
      cacheWriteTokens?: number;
      costUsd?: number;
      filesCreated?: string[];
      filesModified?: string[];
      error?: string;
    }
  ): void {
    const existing = this.sessions.get(sessionId);
    if (existing) {
      const updated: SessionRecord = {
        ...existing,
        success: report.success,
        completedAt: new Date().toISOString(),
        durationMs: Date.now() - new Date(existing.startedAt).getTime(),
        tokensInput: report.tokensInput ?? existing.tokensInput,
        tokensOutput: report.tokensOutput ?? existing.tokensOutput,
        cacheReadTokens: report.cacheReadTokens ?? existing.cacheReadTokens,
        cacheWriteTokens: report.cacheWriteTokens ?? existing.cacheWriteTokens,
        costUsd: report.costUsd ?? existing.costUsd,
        filesCreated: report.filesCreated ?? existing.filesCreated,
        filesModified: report.filesModified ?? existing.filesModified,
        error: report.error,
      };

      this.sessions.set(sessionId, updated);

      // Update token tracking
      this.tokenTracker.recordUsage(sessionId, updated.model, {
        inputTokens: updated.tokensInput,
        outputTokens: updated.tokensOutput,
        cacheReadTokens: updated.cacheReadTokens,
        cacheWriteTokens: updated.cacheWriteTokens,
        totalTokens: updated.tokensInput + updated.tokensOutput,
      });

      // Track files
      updated.filesCreated.forEach((f) => this.filesCreated.add(f));
      updated.filesModified.forEach((f) => this.filesModified.add(f));
    }
  }

  // ===========================================================================
  // Real-Time Access
  // ===========================================================================

  /**
   * Get current metrics snapshot.
   */
  getSnapshot(): MetricsSnapshot {
    const sessions = Array.from(this.sessions.values());
    const tokenSnapshot = this.tokenTracker.getSnapshot();

    const activeSessions = sessions.filter(
      (s) => !s.completedAt && !s.error
    ).length;
    const completedSessions = sessions.filter((s) => s.success).length;
    const failedSessions = sessions.filter(
      (s) => s.completedAt && !s.success
    ).length;

    return {
      wallClockMs: Date.now() - this.startTime.getTime(),
      totalTokens: tokenSnapshot.total.totalTokens,
      totalTokensInput: tokenSnapshot.total.inputTokens,
      totalTokensOutput: tokenSnapshot.total.outputTokens,
      totalCostUsd: this.costCalculator.calculateTotalCost(sessions),
      sessionsActive: activeSessions,
      sessionsCompleted: completedSessions,
      sessionsFailed: failedSessions,
      filesCreated: this.filesCreated.size,
      filesModified: this.filesModified.size,
    };
  }

  /**
   * Get metrics for a specific session.
   */
  getSessionMetrics(sessionId: string): SessionMetrics | undefined {
    const session = this.sessions.get(sessionId);
    if (!session) return undefined;

    const tokens = this.tokenTracker.getSessionUsage(sessionId);
    const costEntry = this.costCalculator.calculateSessionCost(session);

    return {
      sessionId,
      model: session.model,
      durationMs: session.durationMs,
      tokens: tokens ?? createEmptyUsage(),
      costUsd: costEntry.costUsd,
      success: session.success,
    };
  }

  // ===========================================================================
  // Aggregation
  // ===========================================================================

  /**
   * Aggregate metrics for a scenario.
   */
  aggregateScenarioMetrics(
    sessions: SessionRecord[],
    firstAttemptPassRate: number = 0
  ): ScenarioMetrics {
    // Aggregate tokens
    let totalTokens = createEmptyUsage();
    for (const session of sessions) {
      totalTokens = addUsage(totalTokens, {
        inputTokens: session.tokensInput,
        outputTokens: session.tokensOutput,
        cacheReadTokens: session.cacheReadTokens,
        cacheWriteTokens: session.cacheWriteTokens,
        totalTokens: session.tokensInput + session.tokensOutput,
      });
    }

    // Calculate cost breakdown
    const costBreakdown = this.costCalculator.getCostBreakdown(sessions);
    const totalCost = costBreakdown.reduce((sum, c) => sum + c.costUsd, 0);

    // Aggregate files
    const filesCreated = new Set<string>();
    const filesModified = new Set<string>();
    for (const session of sessions) {
      session.filesCreated.forEach((f) => filesCreated.add(f));
      session.filesModified.forEach((f) => filesModified.add(f));
    }

    // Calculate wall clock time
    const startTimes = sessions.map((s) => new Date(s.startedAt).getTime());
    const endTimes = sessions
      .filter((s) => s.completedAt)
      .map((s) => new Date(s.completedAt!).getTime());

    const wallClockMs =
      endTimes.length > 0
        ? Math.max(...endTimes) - Math.min(...startTimes)
        : Date.now() - Math.min(...startTimes);

    // Calculate success rate
    const successCount = sessions.filter((s) => s.success).length;
    const successRate =
      sessions.length > 0 ? successCount / sessions.length : 0;

    return {
      wallClockMs,
      tokens: totalTokens,
      totalCostUsd: totalCost,
      costBreakdown,
      sessionCount: sessions.length,
      successRate,
      filesCreated: Array.from(filesCreated),
      filesModified: Array.from(filesModified),
      reworkRatio: this.calculateReworkRatio(sessions),
      firstAttemptPassRate,
    };
  }

  /**
   * Calculate rework ratio.
   *
   * Rework Ratio = Total file edits / Minimum required file creates
   * Where:
   * - "File edit" = any modification to an already-created file
   * - "Minimum required file creates" = count of unique files created
   *
   * Lower is better. 1.0 = perfect (no rework).
   */
  calculateReworkRatio(sessions: SessionRecord[]): number {
    const uniqueFilesCreated = new Set<string>();
    let totalEdits = 0;

    for (const session of sessions) {
      // Count file creates
      for (const file of session.filesCreated) {
        uniqueFilesCreated.add(file);
        totalEdits++;
      }

      // Count file modifications
      totalEdits += session.filesModified.length;
    }

    const minRequired = uniqueFilesCreated.size;
    return minRequired > 0 ? totalEdits / minRequired : 1.0;
  }

  /**
   * Calculate parallelism efficiency.
   *
   * Efficiency = Total session-seconds / (Wall-clock seconds × max concurrent slots)
   *
   * 1.0 = every slot utilized the entire run.
   */
  calculateParallelismEfficiency(
    sessions: SessionRecord[],
    maxSlots: number,
    wallClockMs: number
  ): number {
    if (wallClockMs === 0 || maxSlots === 0) return 0;

    // Sum up all session durations
    const totalSessionMs = sessions.reduce((sum, s) => sum + s.durationMs, 0);

    // Maximum possible utilization
    const maxCapacityMs = maxSlots * wallClockMs;

    return totalSessionMs / maxCapacityMs;
  }

  // ===========================================================================
  // Export
  // ===========================================================================

  /**
   * Export timeline events.
   */
  exportTimeline(): TimelineEvent[] {
    return this.timeline.toJSON();
  }

  /**
   * Export session log.
   */
  exportSessionLog(): SessionRecord[] {
    return Array.from(this.sessions.values());
  }

  /**
   * Get the underlying components.
   */
  getComponents(): {
    tokenTracker: TokenTracker;
    costCalculator: CostCalculator;
    timeline: TimelineRecorder;
  } {
    return {
      tokenTracker: this.tokenTracker,
      costCalculator: this.costCalculator,
      timeline: this.timeline,
    };
  }

  /**
   * Get pricing snapshot for storing in results.
   */
  getPricingSnapshot(): ModelPricing[] {
    return this.costCalculator.getPricingSnapshot();
  }

  /**
   * Clear all collected data.
   */
  clear(): void {
    this.tokenTracker.clear();
    this.timeline.clear();
    this.sessions.clear();
    this.filesCreated.clear();
    this.filesModified.clear();
    this.startTime = new Date();
  }
}

/**
 * Create a new metrics collector.
 */
export function createMetricsCollector(
  pricing?: ModelPricing[]
): MetricsCollector {
  const tokenTracker = new TokenTracker();
  const costCalculator = new CostCalculator(pricing);
  const timeline = new TimelineRecorder();

  return new MetricsCollector(tokenTracker, costCalculator, timeline);
}
