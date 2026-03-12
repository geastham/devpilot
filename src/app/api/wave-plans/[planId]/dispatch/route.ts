import { NextRequest, NextResponse } from 'next/server';
import {
  db,
  wavePlans,
  waves,
  waveTasks,
  eq,
  and,
} from '@/lib/db';
import { WaveExecutionController } from '@devpilot.sh/core/wave-planner/execution/controller';
import { WaveDispatchCoordinator } from '@devpilot.sh/core/wave-planner/execution/dispatch-coordinator';
import type { WaveExecutionConfig } from '@devpilot.sh/core/wave-planner/execution/types';

interface RouteParams {
  params: Promise<{ planId: string }>;
}

// Default execution config
const DEFAULT_CONFIG: WaveExecutionConfig = {
  maxConcurrentSubagents: 4,
  maxTotalActiveTasks: 8,
  subagentDispatchDelayMs: 500,
  waveAdvanceDelayMs: 2000,
  retryLimit: 1,
  failurePolicy: 'halt',
  autoAdvance: false, // Manual dispatch doesn't auto-advance
};

// POST /api/wave-plans/[planId]/dispatch - Manually dispatch the next wave
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { planId } = await params;

    // Fetch the wave plan
    const wavePlan = await db.query.wavePlans.findFirst({
      where: eq(wavePlans.id, planId),
      with: {
        waves: {
          with: {
            tasks: true,
          },
        },
      },
    });

    if (!wavePlan) {
      return NextResponse.json(
        { error: 'Wave plan not found' },
        { status: 404 }
      );
    }

    // Check wave plan status is 'approved' or 'executing'
    if (wavePlan.status !== 'approved' && wavePlan.status !== 'executing') {
      return NextResponse.json(
        {
          error: 'Invalid wave plan status',
          detail: `Wave plan must be in 'approved' or 'executing' status. Current status: ${wavePlan.status}`,
        },
        { status: 400 }
      );
    }

    // Get the next pending wave
    const nextPendingWave = wavePlan.waves.find(
      w => w.status === 'pending' && w.waveIndex >= wavePlan.currentWaveIndex
    );

    if (!nextPendingWave) {
      // Check if all waves are completed
      const allWavesCompleted = wavePlan.waves.every(
        w => w.status === 'completed' || w.status === 'failed' || w.status === 'skipped'
      );

      if (allWavesCompleted) {
        return NextResponse.json(
          {
            error: 'No pending waves',
            detail: 'All waves have been completed',
            wavePlan: {
              id: wavePlan.id,
              status: wavePlan.status,
              currentWaveIndex: wavePlan.currentWaveIndex,
              totalWaves: wavePlan.totalWaves,
            },
          },
          { status: 400 }
        );
      }

      return NextResponse.json(
        {
          error: 'No pending waves',
          detail: 'No pending waves found to dispatch',
          wavePlan: {
            id: wavePlan.id,
            status: wavePlan.status,
            currentWaveIndex: wavePlan.currentWaveIndex,
            totalWaves: wavePlan.totalWaves,
          },
        },
        { status: 400 }
      );
    }

    // Check that all tasks in previous waves are completed
    const previousWaves = wavePlan.waves.filter(
      w => w.waveIndex < nextPendingWave.waveIndex
    );

    for (const prevWave of previousWaves) {
      const incompleteTasks = prevWave.tasks.filter(
        t => t.status !== 'completed' && t.status !== 'skipped' && t.status !== 'failed'
      );

      if (incompleteTasks.length > 0) {
        return NextResponse.json(
          {
            error: 'Previous wave incomplete',
            detail: `Wave ${prevWave.waveIndex} has ${incompleteTasks.length} incomplete task(s). Complete or skip them before dispatching wave ${nextPendingWave.waveIndex}.`,
            incompleteTasks: incompleteTasks.map(t => ({
              taskCode: t.taskCode,
              status: t.status,
              label: t.label,
            })),
          },
          { status: 400 }
        );
      }
    }

    // Initialize execution controller and dispatch coordinator
    const dispatchCoordinator = new WaveDispatchCoordinator(DEFAULT_CONFIG);
    const controller = new WaveExecutionController(
      DEFAULT_CONFIG,
      dispatchCoordinator
    );

    // Dispatch the wave
    const dispatchResult = await controller.dispatchWave(
      planId,
      nextPendingWave.waveIndex
    );

    // Update current wave index
    await db.update(wavePlans)
      .set({
        currentWaveIndex: nextPendingWave.waveIndex,
        updatedAt: new Date(),
      })
      .where(eq(wavePlans.id, planId));

    // Fetch updated wave plan
    const updatedWavePlan = await db.query.wavePlans.findFirst({
      where: eq(wavePlans.id, planId),
      with: {
        waves: {
          with: {
            tasks: true,
          },
        },
      },
    });

    return NextResponse.json({
      message: 'Wave dispatched successfully',
      dispatchResult,
      wave: {
        waveIndex: nextPendingWave.waveIndex,
        label: nextPendingWave.label,
        tasksDispatched: dispatchResult.dispatched,
        tasksQueued: dispatchResult.queued,
        errors: dispatchResult.errors,
      },
      wavePlan: {
        id: updatedWavePlan?.id,
        status: updatedWavePlan?.status,
        currentWaveIndex: updatedWavePlan?.currentWaveIndex,
        totalWaves: updatedWavePlan?.totalWaves,
      },
    });
  } catch (error) {
    console.error('Failed to dispatch wave:', error);
    return NextResponse.json(
      {
        error: 'Failed to dispatch wave',
        detail: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
