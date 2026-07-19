import { NextRequest, NextResponse } from 'next/server';
import { db, wavePlans, eq } from '@/lib/db';
import {
  WaveExecutionController,
  WaveDispatchCoordinator,
  type WaveExecutionConfig,
} from '@devpilot.sh/core/wave-planner';

interface RouteParams {
  params: Promise<{ planId: string }>;
}

// Local execution config (temporary — T1-W4-T1 switches pause/resume/dispatch
// to the shared getWaveExecutionConfig()).
const DEFAULT_CONFIG: WaveExecutionConfig = {
  maxConcurrentSubagents: 4,
  maxTotalActiveTasks: 8,
  subagentDispatchDelayMs: 500,
  waveAdvanceDelayMs: 2000,
  retryLimit: 1,
  failurePolicy: 'halt',
  autoAdvance: false,
  callbackUrl: process.env.DEVPILOT_CALLBACK_URL ?? 'http://127.0.0.1:3000/api/orchestrator',
};

// POST /api/wave-plans/[planId]/pause - Pause a wave plan (executing → paused)
export async function POST(_request: NextRequest, { params }: RouteParams) {
  try {
    const { planId } = await params;

    const wavePlan = await db.query.wavePlans.findFirst({
      where: eq(wavePlans.id, planId),
    });

    if (!wavePlan) {
      return NextResponse.json({ error: 'Wave plan not found' }, { status: 404 });
    }

    const coordinator = new WaveDispatchCoordinator(DEFAULT_CONFIG);
    const controller = new WaveExecutionController(DEFAULT_CONFIG, coordinator);

    try {
      await controller.pause(planId);
    } catch (err) {
      const detail = err instanceof Error ? err.message : 'Unknown error';
      // Controller throws "Cannot pause wave plan in status: <status>" for
      // invalid state transitions.
      if (detail.startsWith('Cannot pause')) {
        return NextResponse.json(
          { error: 'Invalid wave plan status', detail },
          { status: 409 }
        );
      }
      throw err;
    }

    const updated = await db.query.wavePlans.findFirst({
      where: eq(wavePlans.id, planId),
    });

    return NextResponse.json({
      message: 'Wave plan paused',
      wavePlan: {
        id: updated?.id,
        status: updated?.status,
        currentWaveIndex: updated?.currentWaveIndex,
        totalWaves: updated?.totalWaves,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to pause wave plan',
        detail: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
