import { NextRequest, NextResponse } from 'next/server';
import {
  db,
  wavePlans,
  waves,
  waveTasks,
  eq,
} from '@/lib/db';

interface ActiveWavePlanSummary {
  id: string;
  horizonItemId: string;
  status: string;
  currentWaveIndex: number;
  totalWaves: number;
  totalTasks: number;
  maxParallelism: number;
  criticalPathLength: number;
  parallelizationScore: number;
  startedAt: Date | null;
  tasksCompleted: number;
  tasksRunning: number;
  tasksPending: number;
  tasksFailed: number;
  completionPercentage: number;
  currentWave: {
    waveIndex: number;
    label: string;
    status: string;
    totalTasks: number;
    completedTasks: number;
    runningTasks: number;
  } | null;
}

// GET /api/wave-plans/active - List all active wave plans
export async function GET(request: NextRequest) {
  try {
    // Fetch all wave plans with status = 'executing'
    const activeWavePlans = await db.query.wavePlans.findMany({
      where: eq(wavePlans.status, 'executing'),
      with: {
        waves: {
          with: {
            tasks: true,
          },
        },
        horizonItem: true,
      },
    });

    // Build summary for each active wave plan
    const summaries: ActiveWavePlanSummary[] = activeWavePlans.map(plan => {
      // Calculate task statistics
      const allTasks = plan.waves.flatMap(w => w.tasks);
      const completedTasks = allTasks.filter(t => t.status === 'completed').length;
      const runningTasks = allTasks.filter(
        t => t.status === 'running' || t.status === 'dispatched'
      ).length;
      const pendingTasks = allTasks.filter(t => t.status === 'pending').length;
      const failedTasks = allTasks.filter(t => t.status === 'failed').length;
      const skippedTasks = allTasks.filter(t => t.status === 'skipped').length;

      // Calculate completion percentage
      const completionPercentage =
        allTasks.length > 0
          ? Math.round(
              ((completedTasks + skippedTasks) / allTasks.length) * 100
            )
          : 0;

      // Get current wave info
      const currentWave = plan.waves.find(
        w => w.waveIndex === plan.currentWaveIndex
      );

      let currentWaveInfo: ActiveWavePlanSummary['currentWave'] = null;
      if (currentWave) {
        const waveTasks = currentWave.tasks;
        currentWaveInfo = {
          waveIndex: currentWave.waveIndex,
          label: currentWave.label,
          status: currentWave.status,
          totalTasks: waveTasks.length,
          completedTasks: waveTasks.filter(t => t.status === 'completed').length,
          runningTasks: waveTasks.filter(
            t => t.status === 'running' || t.status === 'dispatched'
          ).length,
        };
      }

      return {
        id: plan.id,
        horizonItemId: plan.horizonItemId,
        status: plan.status,
        currentWaveIndex: plan.currentWaveIndex,
        totalWaves: plan.totalWaves,
        totalTasks: plan.totalTasks,
        maxParallelism: plan.maxParallelism,
        criticalPathLength: plan.criticalPathLength,
        parallelizationScore: plan.parallelizationScore,
        startedAt: plan.startedAt,
        tasksCompleted: completedTasks,
        tasksRunning: runningTasks,
        tasksPending: pendingTasks,
        tasksFailed: failedTasks,
        completionPercentage,
        currentWave: currentWaveInfo,
      };
    });

    // Sort by startedAt (most recent first)
    summaries.sort((a, b) => {
      if (!a.startedAt) return 1;
      if (!b.startedAt) return -1;
      return b.startedAt.getTime() - a.startedAt.getTime();
    });

    return NextResponse.json({
      count: summaries.length,
      wavePlans: summaries,
    });
  } catch (error) {
    console.error('Failed to fetch active wave plans:', error);
    return NextResponse.json(
      { error: 'Failed to fetch active wave plans' },
      { status: 500 }
    );
  }
}
