import { NextRequest, NextResponse } from 'next/server';
import {
  db,
  horizonItems,
  wavePlans,
  waveTasks,
  wavePlanMetrics,
  activityEvents,
  eq,
} from '@/lib/db';
import { WavePlanGenerator } from '@devpilot.sh/core/wave-planner';

interface RouteParams {
  params: Promise<{ id: string }>;
}

interface ReoptimizeRequestBody {
  wavePlanId: string;
  reason?: string;
}

// POST /api/items/[id]/wave-plan/reoptimize - Reoptimize a wave plan mid-execution
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const body: ReoptimizeRequestBody = await request.json();
    const { wavePlanId, reason = 'Manual reoptimization requested' } = body;

    if (!wavePlanId) {
      return NextResponse.json(
        { error: 'wavePlanId is required' },
        { status: 400 }
      );
    }

    // Fetch the horizon item
    const item = await db.query.horizonItems.findFirst({
      where: eq(horizonItems.id, id),
      with: {
        plan: true,
      },
    });

    if (!item) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 });
    }

    if (!item.plan) {
      return NextResponse.json(
        { error: 'No plan found for this item' },
        { status: 404 }
      );
    }

    // Fetch the existing wave plan
    const existingWavePlan = await db.query.wavePlans.findFirst({
      where: eq(wavePlans.id, wavePlanId),
      with: {
        waveTasks: true,
        metrics: true,
      },
    });

    if (!existingWavePlan) {
      return NextResponse.json(
        { error: 'Wave plan not found' },
        { status: 404 }
      );
    }

    // Verify the wave plan belongs to this item
    if (existingWavePlan.horizonItemId !== id) {
      return NextResponse.json(
        { error: 'Wave plan does not belong to this item' },
        { status: 400 }
      );
    }

    // Check if wave plan is in a reoptimizable state
    if (
      existingWavePlan.status === 'completed' ||
      existingWavePlan.status === 'failed'
    ) {
      return NextResponse.json(
        {
          error: `Cannot reoptimize wave plan with status: ${existingWavePlan.status}`,
        },
        { status: 400 }
      );
    }

    // Update wave plan status to 're-optimizing'
    await db
      .update(wavePlans)
      .set({
        status: 're-optimizing',
        updatedAt: new Date(),
      })
      .where(eq(wavePlans.id, wavePlanId));

    // Create activity event for reoptimization start
    await db.insert(activityEvents).values({
      type: 'WAVE_PLAN_REOPTIMIZING',
      message: `Reoptimizing wave plan for "${item.title}": ${reason}`,
      repo: item.repo,
      ticketId: item.linearTicketId,
      metadata: {
        wavePlanId,
        reason,
        currentWaveIndex: existingWavePlan.currentWaveIndex,
        completedTasks: existingWavePlan.waveTasks.filter(
          (t) => t.status === 'completed'
        ).length,
        remainingTasks: existingWavePlan.waveTasks.filter(
          (t) => t.status !== 'completed' && t.status !== 'skipped'
        ).length,
      },
    });

    // Get API key from environment
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY not configured');
    }

    // Initialize the wave plan generator
    const generator = new WavePlanGenerator({
      aiClient: {
        apiKey,
        model: process.env.WAVE_PLANNER_MODEL || 'claude-sonnet-4-20250514',
        maxTokens: parseInt(process.env.WAVE_PLANNER_MAX_TOKENS || '8192', 10),
      },
      refinement: {
        minParallelizationScore: parseFloat(
          process.env.WAVE_PLANNER_MIN_PARALLELIZATION || '0.3'
        ),
        maxRefinementIterations: 2,
      },
      autoPersist: true,
    });

    // Get the working directory from environment or use default
    const workingDir = process.env.WORKING_DIR || process.cwd();

    // Reoptimize the wave plan
    const result = await generator.reoptimize(
      wavePlanId,
      item.spec || item.title, // Use spec if available, otherwise title
      item.title,
      item.repo,
      {
        workingDir,
        customConstraints: [reason],
      }
    );

    // Update metrics if reoptimization succeeded
    if (result.success && result.wavePlanId) {
      const metrics = await db.query.wavePlanMetrics.findFirst({
        where: eq(wavePlanMetrics.wavePlanId, wavePlanId),
      });

      if (metrics) {
        await db
          .update(wavePlanMetrics)
          .set({
            reOptimizationCount: metrics.reOptimizationCount + 1,
          })
          .where(eq(wavePlanMetrics.wavePlanId, wavePlanId));
      }

      // Create activity event for successful reoptimization
      await db.insert(activityEvents).values({
        type: 'WAVE_PLAN_CREATED',
        message: `Wave plan reoptimized for "${item.title}" (version ${result.wavePlan.statistics.totalWaves} waves)`,
        repo: item.repo,
        ticketId: item.linearTicketId,
        metadata: {
          wavePlanId: result.wavePlanId,
          previousWavePlanId: wavePlanId,
          totalWaves: result.wavePlan.statistics.totalWaves,
          totalTasks: result.wavePlan.statistics.totalTasks,
          maxParallelism: result.waveAssignment.maxParallelism,
          parallelizationScore: result.score.parallelizationScore,
          isReoptimization: true,
        },
      });

      // Fetch the complete new wave plan
      const newWavePlan = await db.query.wavePlans.findFirst({
        where: eq(wavePlans.id, result.wavePlanId),
        with: {
          waves: {
            with: {
              tasks: true,
            },
          },
          waveTasks: true,
          dependencyEdges: true,
          metrics: true,
        },
      });

      return NextResponse.json({
        success: true,
        message: 'Wave plan reoptimized successfully',
        wavePlan: newWavePlan,
        previousWavePlanId: wavePlanId,
        metrics: result.metrics,
      });
    } else {
      // Reoptimization failed, revert status
      await db
        .update(wavePlans)
        .set({
          status: 'paused',
          updatedAt: new Date(),
        })
        .where(eq(wavePlans.id, wavePlanId));

      return NextResponse.json(
        {
          success: false,
          error: result.message || 'Reoptimization failed',
        },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('Failed to reoptimize wave plan:', error);
    return NextResponse.json(
      {
        error: 'Failed to reoptimize wave plan',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
