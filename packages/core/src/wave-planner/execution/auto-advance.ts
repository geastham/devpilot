import { eq, and } from 'drizzle-orm';
import { getDatabase } from '../../db';
import { wavePlans, waves, waveTasks, wavePlanMetrics, type WaveTask } from '../../db/schema';

/**
 * What is left of the third wave-advancement path.
 *
 * This file used to hold `autoAdvanceWave`, `markWavePlanComplete` and
 * `advanceToNextWave`: a complete, exported implementation of "a wave finished,
 * start the next one" that nothing called. The live implementations were
 * `WaveExecutionController.handleWaveComplete` and the conductor graph, which
 * between them were already one driver too many; a third, waiting to be wired
 * up by whoever found it first, was removed rather than left as a trap.
 *
 * `collectFinalMetrics` is the part that was worth keeping, and it had no
 * caller either. `WaveExecutionController.completePlan` calls it now — the one
 * place a plan becomes `completed`, on both the conductor and the legacy path.
 */

/**
 * Collect final metrics for the completed wave plan.
 * Calculates performance statistics and stores them in wave_plan_metrics.
 *
 * One row per plan. A second call for the same plan changes nothing.
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

  // Calculate average task duration. `startedAt` is the start of a task's
  // FIRST attempt, so a retried task's duration includes the attempt that
  // failed — which is what it cost the plan.
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

  // Insert metrics. `wave_plan_id` is UNIQUE, and a duplicate must be a no-op
  // rather than a constraint error surfacing from a plan's completion.
  await (db as any)
    .insert(wavePlanMetrics)
    .values({
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
    })
    .onConflictDoNothing({ target: wavePlanMetrics.wavePlanId });
}
