/**
 * Timeline Recorder
 *
 * Records execution events for Gantt-style analysis and
 * duration calculations.
 */

import type { TimelineEvent, TimelineEventType, GanttDataPoint } from '../types';

/**
 * Event context for nested event hierarchy.
 */
interface EventContext {
  type: 'run' | 'benchmark' | 'scenario' | 'wave' | 'session';
  id: string;
  startTime: Date;
}

/**
 * Records and analyzes execution timeline events.
 */
export class TimelineRecorder {
  private events: TimelineEvent[] = [];
  private contextStack: EventContext[] = [];
  private startTime: Date;

  constructor() {
    this.startTime = new Date();
  }

  // ===========================================================================
  // Event Recording
  // ===========================================================================

  /**
   * Record a timeline event.
   */
  recordEvent(type: TimelineEventType, data: Record<string, unknown> = {}): void {
    const event: TimelineEvent = {
      timestamp: new Date().toISOString(),
      eventType: type,
      data,
    };

    // Add context info from current stack
    const currentContext = this.getCurrentContext();
    if (currentContext) {
      if (currentContext.type === 'session') {
        event.sessionId = currentContext.id;
      }
      if (currentContext.type === 'wave') {
        event.waveNumber = parseInt(currentContext.id, 10);
      }
    }

    this.events.push(event);
  }

  // ===========================================================================
  // Context Management
  // ===========================================================================

  /**
   * Push a new context onto the stack.
   */
  pushContext(context: EventContext): void {
    this.contextStack.push(context);
  }

  /**
   * Pop the current context from the stack.
   */
  popContext(): EventContext | undefined {
    return this.contextStack.pop();
  }

  /**
   * Get the current context.
   */
  getCurrentContext(): EventContext | undefined {
    return this.contextStack[this.contextStack.length - 1];
  }

  // ===========================================================================
  // Convenience Methods
  // ===========================================================================

  /**
   * Record run start.
   */
  runStart(runId: string): void {
    this.startTime = new Date();
    this.pushContext({ type: 'run', id: runId, startTime: this.startTime });
    this.recordEvent('run_start', { runId });
  }

  /**
   * Record run complete.
   */
  runComplete(results: Record<string, unknown> = {}): void {
    this.recordEvent('run_complete', results);
    this.popContext();
  }

  /**
   * Record scenario start.
   */
  scenarioStart(scenario: 'baseline' | 'devpilot'): void {
    this.pushContext({ type: 'scenario', id: scenario, startTime: new Date() });
    this.recordEvent('scenario_start', { scenario });
  }

  /**
   * Record scenario complete.
   */
  scenarioComplete(
    scenario: 'baseline' | 'devpilot',
    result: Record<string, unknown> = {}
  ): void {
    this.recordEvent('scenario_complete', { scenario, ...result });
    this.popContext();
  }

  /**
   * Record wave start.
   */
  waveStart(waveNumber: number, taskCount: number): void {
    this.pushContext({
      type: 'wave',
      id: String(waveNumber),
      startTime: new Date(),
    });
    this.recordEvent('wave_start', { waveNumber, taskCount });
  }

  /**
   * Record wave complete.
   */
  waveComplete(waveNumber: number, result: Record<string, unknown> = {}): void {
    this.recordEvent('wave_complete', { waveNumber, ...result });
    this.popContext();
  }

  /**
   * Record session start.
   */
  sessionStart(sessionId: string, taskId?: string): void {
    this.pushContext({ type: 'session', id: sessionId, startTime: new Date() });
    this.recordEvent('session_start', { sessionId, taskId });
  }

  /**
   * Record session progress.
   */
  sessionProgress(
    sessionId: string,
    progress: number,
    message?: string
  ): void {
    this.recordEvent('session_progress', {
      sessionId,
      progress,
      message,
    });
  }

  /**
   * Record session complete.
   */
  sessionComplete(sessionId: string, success: boolean): void {
    this.recordEvent('session_complete', { sessionId, success });
    this.popContext();
  }

  /**
   * Record session error.
   */
  sessionError(sessionId: string, error: string): void {
    this.recordEvent('session_error', { sessionId, error });
  }

  /**
   * Record acceptance test start.
   */
  acceptanceStart(): void {
    this.recordEvent('acceptance_start', {});
  }

  /**
   * Record acceptance test complete.
   */
  acceptanceComplete(result: Record<string, unknown> = {}): void {
    this.recordEvent('acceptance_complete', result);
  }

  // ===========================================================================
  // Querying
  // ===========================================================================

  /**
   * Get all events.
   */
  getEvents(): TimelineEvent[] {
    return [...this.events];
  }

  /**
   * Get events by type.
   */
  getEventsByType(type: TimelineEventType): TimelineEvent[] {
    return this.events.filter((e) => e.eventType === type);
  }

  /**
   * Get events for a specific session.
   */
  getEventsBySession(sessionId: string): TimelineEvent[] {
    return this.events.filter((e) => e.sessionId === sessionId);
  }

  /**
   * Get events for a specific wave.
   */
  getEventsByWave(waveNumber: number): TimelineEvent[] {
    return this.events.filter((e) => e.waveNumber === waveNumber);
  }

  /**
   * Get events within a time range.
   */
  getEventRange(start: Date, end: Date): TimelineEvent[] {
    return this.events.filter((e) => {
      const time = new Date(e.timestamp);
      return time >= start && time <= end;
    });
  }

  // ===========================================================================
  // Analysis
  // ===========================================================================

  /**
   * Calculate duration between two event types.
   */
  calculateDuration(
    startEvent: TimelineEventType,
    endEvent: TimelineEventType
  ): number {
    const starts = this.getEventsByType(startEvent);
    const ends = this.getEventsByType(endEvent);

    if (starts.length === 0 || ends.length === 0) {
      return 0;
    }

    const start = new Date(starts[0].timestamp);
    const end = new Date(ends[ends.length - 1].timestamp);

    return end.getTime() - start.getTime();
  }

  /**
   * Get session durations.
   */
  getSessionDurations(): Map<string, number> {
    const durations = new Map<string, number>();

    const starts = this.getEventsByType('session_start');
    const completes = this.getEventsByType('session_complete');
    const errors = this.getEventsByType('session_error');

    for (const start of starts) {
      const sessionId = start.data.sessionId as string;

      // Find corresponding end event
      const end =
        completes.find((e) => e.sessionId === sessionId) ??
        errors.find((e) => e.sessionId === sessionId);

      if (end) {
        const duration =
          new Date(end.timestamp).getTime() -
          new Date(start.timestamp).getTime();
        durations.set(sessionId, duration);
      }
    }

    return durations;
  }

  /**
   * Get wave durations.
   */
  getWaveDurations(): Map<number, number> {
    const durations = new Map<number, number>();

    const starts = this.getEventsByType('wave_start');
    const completes = this.getEventsByType('wave_complete');

    for (const start of starts) {
      const waveNumber = start.data.waveNumber as number;

      const end = completes.find((e) => e.data.waveNumber === waveNumber);

      if (end) {
        const duration =
          new Date(end.timestamp).getTime() -
          new Date(start.timestamp).getTime();
        durations.set(waveNumber, duration);
      }
    }

    return durations;
  }

  /**
   * Get total run duration.
   */
  getTotalDuration(): number {
    return this.calculateDuration('run_start', 'run_complete');
  }

  // ===========================================================================
  // Export
  // ===========================================================================

  /**
   * Export events as JSON.
   */
  toJSON(): TimelineEvent[] {
    return this.getEvents();
  }

  /**
   * Export as Gantt chart data points.
   */
  toGanttData(): GanttDataPoint[] {
    const dataPoints: GanttDataPoint[] = [];
    const runStartTime = this.startTime.getTime();

    // Process wave data
    const waveStarts = this.getEventsByType('wave_start');
    const waveCompletes = this.getEventsByType('wave_complete');

    for (const start of waveStarts) {
      const waveNumber = start.data.waveNumber as number;
      const end = waveCompletes.find((e) => e.data.waveNumber === waveNumber);

      if (end) {
        dataPoints.push({
          id: `wave-${waveNumber}`,
          type: 'wave',
          label: `Wave ${waveNumber}`,
          startMs: new Date(start.timestamp).getTime() - runStartTime,
          endMs: new Date(end.timestamp).getTime() - runStartTime,
          color: '#3b82f6', // Blue
        });
      }
    }

    // Process session data
    const sessionStarts = this.getEventsByType('session_start');
    const sessionEnds = [
      ...this.getEventsByType('session_complete'),
      ...this.getEventsByType('session_error'),
    ];

    for (const start of sessionStarts) {
      const sessionId = start.data.sessionId as string;
      const taskId = start.data.taskId as string | undefined;
      const end = sessionEnds.find((e) => e.sessionId === sessionId);

      if (end) {
        const success = (end.data.success as boolean) ?? false;

        dataPoints.push({
          id: sessionId,
          type: 'session',
          label: taskId ?? sessionId.slice(0, 8),
          startMs: new Date(start.timestamp).getTime() - runStartTime,
          endMs: new Date(end.timestamp).getTime() - runStartTime,
          parentId: start.waveNumber ? `wave-${start.waveNumber}` : undefined,
          color: success ? '#22c55e' : '#ef4444', // Green or Red
        });
      }
    }

    return dataPoints;
  }

  /**
   * Clear all recorded events.
   */
  clear(): void {
    this.events = [];
    this.contextStack = [];
    this.startTime = new Date();
  }
}

/**
 * Create a new timeline recorder.
 */
export function createTimelineRecorder(): TimelineRecorder {
  return new TimelineRecorder();
}
