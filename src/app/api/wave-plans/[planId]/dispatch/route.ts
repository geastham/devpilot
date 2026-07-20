import { NextRequest, NextResponse } from 'next/server';
import {
  db,
  wavePlans,
  waves,
  waveTasks,
  eq,
  and,
} from '@/lib/db';
import type { Wave, WaveTask } from '@devpilot.sh/core/db';
import {
  WaveExecutionController,
  WaveDispatchCoordinator,
} from '@devpilot.sh/core/wave-planner';
import { getServerOrchestrator, getWaveExecutionConfig } from '@/lib/orchestrator';

interface RouteParams {
  params: Promise<{ planId: string }>;
}

type WaveWithTasks = Wave & { tasks: WaveTask[] };

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

    // Real dispatch requires a configured orchestrator (§5.5/§5.7).
    const service = getServerOrchestrator();
    if (!service.isEnabled) {
      return NextResponse.json(
        {
          error: 'ORCHESTRATOR_UNAVAILABLE',
          detail:
            'Set DEVPILOT_ORCHESTRATOR_MODE (claude-session | ao-cli | http) to enable dispatch',
        },
        { status: 503 }
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
      (w: WaveWithTasks) => w.status === 'pending' && w.waveIndex >= wavePlan.currentWaveIndex
    );

    if (!nextPendingWave) {
      // Check if all waves are completed
      const allWavesCompleted = wavePlan.waves.every(
        (w: WaveWithTasks) => w.status === 'completed' || w.status === 'failed' || w.status === 'skipped'
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
      (w: WaveWithTasks) => w.waveIndex < nextPendingWave.waveIndex
    );

    for (const prevWave of previousWaves) {
      const incompleteTasks = prevWave.tasks.filter(
        (t: WaveTask) => t.status !== 'completed' && t.status !== 'skipped' && t.status !== 'failed'
      );

      if (incompleteTasks.length > 0) {
        return NextResponse.json(
          {
            error: 'Previous wave incomplete',
            detail: `Wave ${prevWave.waveIndex} has ${incompleteTasks.length} incomplete task(s). Complete or skip them before dispatching wave ${nextPendingWave.waveIndex}.`,
            incompleteTasks: incompleteTasks.map((t: WaveTask) => ({
              taskCode: t.taskCode,
              status: t.status,
              label: t.label,
            })),
          },
          { status: 400 }
        );
      }
    }

    // Initialize execution controller and dispatch coordinator with the shared
    // execution config (limits + callbackUrl from env).
    const config = getWaveExecutionConfig();
    const dispatchCoordinator = new WaveDispatchCoordinator(config);
    const controller = new WaveExecutionController(config, dispatchCoordinator);

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
