import { NextRequest, NextResponse } from 'next/server';
import { db, wavePlans, eq } from '@/lib/db';
import {
  WaveExecutionController,
  WaveDispatchCoordinator,
} from '@devpilot.sh/core/wave-planner';
import { getWaveExecutionConfig } from '@/lib/orchestrator';

interface RouteParams {
  params: Promise<{ planId: string }>;
}

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

    const config = getWaveExecutionConfig();
    const coordinator = new WaveDispatchCoordinator(config);
    const controller = new WaveExecutionController(config, coordinator);

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
