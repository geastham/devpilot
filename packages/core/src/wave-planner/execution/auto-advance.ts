import { eq, and, sql } from 'drizzle-orm';
import { getDatabase } from '../../db';
import { wavePlans, waves, waveTasks, wavePlanMetrics, activityEvents, type WaveTask, type WavePlan } from '../../db/schema';
import { sleep } from '../utils';
import type { WaveExecutionConfig, WaveSSEEvent } from './types';

/**
 * Auto-advance to the next wave after completing the current wave.
 * Handles final metrics collection if this is the last wave.
 */
export async function autoAdvanceWave(
  wavePlanId: string,
  completedWaveIndex: number,
  config: WaveExecutionConfig
): Promise<void> {
  const db = getDatabase();

  // Get the wave plan to check if this was the last wave
  const wavePlan = await db.query.wavePlans.findFirst({
    where: eq(wavePlans.id, wavePlanId),
  });

  if (!wavePlan) {
    throw new Error(`Wave plan ${wavePlanId} not found`);
  }

  const isLastWave = completedWaveIndex >= wavePlan.totalWaves - 1;

  if (isLastWave) {
    // This was the last wave - mark plan complete and collect metrics
    await markWavePlanComplete(wavePlanId);
    await collectFinalMetrics(wavePlanId);
  } else {
    // Wait before advancing to next wave
    await sleep(config.waveAdvanceDelayMs);

    // Advance to next wave
    const nextWaveIndex = completedWaveIndex + 1;
    await advanceToNextWave(wavePlanId, nextWaveIndex);
  }
}

/**
 * Mark the wave plan as completed.
 * Updates status and sets completion timestamp.
 */
export async function markWavePlanComplete(wavePlanId: string): Promise<void> {
  const db = getDatabase();

  await (db as any)
    .update(wavePlans)
    .set({
      status: 'completed',
      completedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(wavePlans.id, wavePlanId));

  // Emit completion event
  await emitEvent({
    type: 'wave_plan_complete',
    wavePlanId,
    metrics: {},
  });
}

/**
 * Collect final metrics for the completed wave plan.
 * Calculates performance statistics and stores them in wave_plan_metrics.
 */
export async function collectFinalMetrics(wavePlanId: string): Promise<void> {
  const db = getDatabase();

  // Get the wave plan
  const wavePlan = await db.query.wavePlans.findFirst({
    where: eq(wavePlans.id, wavePlanId),
  });

  if (!wavePlan) {
    throw new Error(`Wave plan ${wavePlanId} not found`);
  }

  // Get all tasks for the plan
  const tasks = await db.query.waveTasks.findMany({
    where: eq(waveTasks.wavePlanId, wavePlanId),
  });

  // Calculate metrics
  const tasksCompleted = tasks.filter((t: WaveTask) => t.status === 'completed').length;
  const tasksFailed = tasks.filter((t: WaveTask) => t.status === 'failed').length;
  const tasksRetried = tasks.filter((t: WaveTask) => t.retryCount > 0).length;

  // Calculate total wall clock time
  const totalWallClockMs = wavePlan.completedAt && wavePlan.startedAt
    ? wavePlan.completedAt.getTime() - wavePlan.startedAt.getTime()
    : null;

  // Calculate average task duration
  const completedTasks = tasks.filter(
    (t: WaveTask) => t.status === 'completed' && t.startedAt && t.completedAt
  );

  let avgTaskDurationMs: number | null = null;
  if (completedTasks.length > 0) {
    const totalDuration = completedTasks.reduce((sum, task: WaveTask) => {
      if (task.startedAt && task.completedAt) {
        return sum + (task.completedAt.getTime() - task.startedAt.getTime());
      }
      return sum;
    }, 0);
    avgTaskDurationMs = Math.round(totalDuration / completedTasks.length);
  }

  // Calculate theoretical minimum time (critical path)
  // Assuming each task on critical path takes avgTaskDurationMs
  const theoreticalMinMs = avgTaskDurationMs
    ? avgTaskDurationMs * wavePlan.criticalPathLength
    : null;

  // Calculate parallelization efficiency
  let parallelizationEfficiency: number | null = null;
  if (theoreticalMinMs && totalWallClockMs) {
    parallelizationEfficiency = theoreticalMinMs / totalWallClockMs;
  }

  // Get waves executed - count completed waves
  const completedWaves = await db.query.waves.findMany({
    where: and(
      eq(waves.wavePlanId, wavePlanId),
      eq(waves.status, 'completed')
    ),
  });

  const wavesExecutedCount = completedWaves.length;

  // Insert metrics
  await (db as any).insert(wavePlanMetrics).values({
    wavePlanId,
    totalWallClockMs,
    theoreticalMinMs,
    parallelizationEfficiency,
    wavesExecuted: wavesExecutedCount,
    tasksCompleted,
    tasksFailed,
    tasksRetried,
    avgTaskDurationMs,
    maxWaveWaitMs: null, // TODO: Calculate from wave timings
    fileConflictsAvoided: 0, // TODO: Track during execution
    reOptimizationCount: wavePlan.version - 1,
  });
}

/**
 * Advance to the next wave.
 * Updates the wave plan's current wave index and marks the next wave as pending.
 */
export async function advanceToNextWave(
  wavePlanId: string,
  nextWaveIndex: number
): Promise<void> {
  const db = getDatabase();

  // Update wave plan to point to next wave
  await (db as any)
    .update(wavePlans)
    .set({
      currentWaveIndex: nextWaveIndex,
      updatedAt: new Date(),
    })
    .where(eq(wavePlans.id, wavePlanId));

  // Update the next wave status to pending (ready to be dispatched)
  await (db as any)
    .update(waves)
    .set({
      status: 'pending',
    })
    .where(
      and(
        eq(waves.wavePlanId, wavePlanId),
        eq(waves.waveIndex, nextWaveIndex)
      )
    );

  // Emit advance event
  await emitEvent({
    type: 'wave_advance',
    wavePlanId,
    fromWave: nextWaveIndex - 1,
    toWave: nextWaveIndex,
  });
}

/**
 * Emit a wave execution event to the activity_events table.
 */
async function emitEvent(event: WaveSSEEvent): Promise<void> {
  const db = getDatabase();

  let message = '';
  switch (event.type) {
    case 'wave_plan_complete':
      message = `Wave plan ${event.wavePlanId} completed`;
      break;
    case 'wave_advance':
      message = `Advanced from wave ${event.fromWave} to wave ${event.toWave}`;
      break;
    default:
      message = `Wave event: ${event.type}`;
  }

  await (db as any).insert(activityEvents).values({
    type: event.type,
    message,
    metadata: event as unknown as Record<string, unknown>,
  });
}
