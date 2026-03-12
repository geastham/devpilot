import { NextRequest, NextResponse } from 'next/server';
import {
  db,
  wavePlans,
  waves,
  waveTasks,
  wavePlanMetrics,
  eq,
} from '@/lib/db';

interface RouteParams {
  params: Promise<{ planId: string }>;
}

interface WaveStatistics {
  waveIndex: number;
  label: string;
  status: string;
  totalTasks: number;
  completedTasks: number;
  runningTasks: number;
  failedTasks: number;
  pendingTasks: number;
  skippedTasks: number;
  retriedTasks: number;
  startedAt: Date | null;
  completedAt: Date | null;
  durationMs: number | null;
  avgTaskDurationMs: number | null;
}

// GET /api/wave-plans/[planId]/metrics - Get execution metrics for a wave plan
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { planId } = await params;

    // Fetch the wave plan with all related data
    const wavePlan = await db.query.wavePlans.findFirst({
      where: eq(wavePlans.id, planId),
      with: {
        waves: {
          with: {
            tasks: true,
          },
        },
        metrics: true,
      },
    });

    if (!wavePlan) {
      return NextResponse.json(
        { error: 'Wave plan not found' },
        { status: 404 }
      );
    }

    // Calculate per-wave statistics
    const waveStatistics: WaveStatistics[] = wavePlan.waves.map(wave => {
      const tasks = wave.tasks;

      const completedTasks = tasks.filter(t => t.status === 'completed');
      const runningTasks = tasks.filter(
        t => t.status === 'running' || t.status === 'dispatched'
      );
      const failedTasks = tasks.filter(t => t.status === 'failed');
      const pendingTasks = tasks.filter(t => t.status === 'pending');
      const skippedTasks = tasks.filter(t => t.status === 'skipped');
      const retriedTasks = tasks.filter(t => t.retryCount > 0);

      // Calculate wave duration
      let durationMs: number | null = null;
      if (wave.startedAt && wave.completedAt) {
        durationMs =
          wave.completedAt.getTime() - wave.startedAt.getTime();
      } else if (wave.startedAt) {
        // Wave is still running
        durationMs = Date.now() - wave.startedAt.getTime();
      }

      // Calculate average task duration for completed tasks
      let avgTaskDurationMs: number | null = null;
      if (completedTasks.length > 0) {
        const taskDurations = completedTasks
          .filter(t => t.startedAt && t.completedAt)
          .map(t => {
            const started = t.startedAt as Date;
            const completed = t.completedAt as Date;
            return completed.getTime() - started.getTime();
          });

        if (taskDurations.length > 0) {
          avgTaskDurationMs =
            taskDurations.reduce((sum, d) => sum + d, 0) /
            taskDurations.length;
        }
      }

      return {
        waveIndex: wave.waveIndex,
        label: wave.label,
        status: wave.status,
        totalTasks: tasks.length,
        completedTasks: completedTasks.length,
        runningTasks: runningTasks.length,
        failedTasks: failedTasks.length,
        pendingTasks: pendingTasks.length,
        skippedTasks: skippedTasks.length,
        retriedTasks: retriedTasks.length,
        startedAt: wave.startedAt,
        completedAt: wave.completedAt,
        durationMs,
        avgTaskDurationMs,
      };
    });

    // Calculate overall statistics
    const allTasks = wavePlan.waves.flatMap(w => w.tasks);
    const totalTasks = allTasks.length;
    const completedTasks = allTasks.filter(t => t.status === 'completed').length;
    const failedTasks = allTasks.filter(t => t.status === 'failed').length;
    const runningTasks = allTasks.filter(
      t => t.status === 'running' || t.status === 'dispatched'
    ).length;
    const pendingTasks = allTasks.filter(t => t.status === 'pending').length;
    const skippedTasks = allTasks.filter(t => t.status === 'skipped').length;
    const retriedTasks = allTasks.filter(t => t.retryCount > 0).length;

    // Calculate overall duration
    let totalWallClockMs: number | null = null;
    if (wavePlan.startedAt && wavePlan.completedAt) {
      totalWallClockMs =
        wavePlan.completedAt.getTime() - wavePlan.startedAt.getTime();
    } else if (wavePlan.startedAt) {
      // Wave plan is still executing
      totalWallClockMs = Date.now() - wavePlan.startedAt.getTime();
    }

    // Calculate completion percentage
    const completionPercentage =
      totalTasks > 0
        ? Math.round(
            ((completedTasks + skippedTasks) / totalTasks) * 100
          )
        : 0;

    // Calculate waves completed
    const wavesCompleted = wavePlan.waves.filter(
      w => w.status === 'completed'
    ).length;

    // Get stored metrics if available
    const storedMetrics = wavePlan.metrics;

    return NextResponse.json({
      wavePlan: {
        id: wavePlan.id,
        status: wavePlan.status,
        currentWaveIndex: wavePlan.currentWaveIndex,
        totalWaves: wavePlan.totalWaves,
        startedAt: wavePlan.startedAt,
        completedAt: wavePlan.completedAt,
        criticalPathLength: wavePlan.criticalPathLength,
        maxParallelism: wavePlan.maxParallelism,
        parallelizationScore: wavePlan.parallelizationScore,
      },
      overallStatistics: {
        totalTasks,
        completedTasks,
        failedTasks,
        runningTasks,
        pendingTasks,
        skippedTasks,
        retriedTasks,
        completionPercentage,
        wavesCompleted,
        totalWaves: wavePlan.totalWaves,
        totalWallClockMs,
      },
      waveStatistics,
      storedMetrics: storedMetrics
        ? {
            totalWallClockMs: storedMetrics.totalWallClockMs,
            theoreticalMinMs: storedMetrics.theoreticalMinMs,
            parallelizationEfficiency: storedMetrics.parallelizationEfficiency,
            wavesExecuted: storedMetrics.wavesExecuted,
            tasksCompleted: storedMetrics.tasksCompleted,
            tasksFailed: storedMetrics.tasksFailed,
            tasksRetried: storedMetrics.tasksRetried,
            avgTaskDurationMs: storedMetrics.avgTaskDurationMs,
            maxWaveWaitMs: storedMetrics.maxWaveWaitMs,
            fileConflictsAvoided: storedMetrics.fileConflictsAvoided,
            reOptimizationCount: storedMetrics.reOptimizationCount,
            recordedAt: storedMetrics.recordedAt,
          }
        : null,
    });
  } catch (error) {
    console.error('Failed to fetch wave plan metrics:', error);
    return NextResponse.json(
      { error: 'Failed to fetch wave plan metrics' },
      { status: 500 }
    );
  }
}
