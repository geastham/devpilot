import { NextRequest, NextResponse } from 'next/server';
import { db, horizonItems, wavePlans, eq, desc } from '@/lib/db';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/items/[id]/wave-plan/history - Get all wave plan versions for a horizon item
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    // Verify the horizon item exists
    const item = await db.query.horizonItems.findFirst({
      where: eq(horizonItems.id, id),
    });

    if (!item) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 });
    }

    // Fetch all wave plans for this item, ordered by version (newest first)
    const wavePlanHistory = await db.query.wavePlans.findMany({
      where: eq(wavePlans.horizonItemId, id),
      orderBy: [desc(wavePlans.version)],
      with: {
        waves: {
          with: {
            tasks: true,
          },
        },
        waveTasks: true,
        dependencyEdges: true,
        metrics: true,
        plan: true,
        previousWavePlan: {
          columns: {
            id: true,
            version: true,
            status: true,
            createdAt: true,
          },
        },
      },
    });

    // Build a summary of changes between versions
    const historyWithDiffs = wavePlanHistory.map((wavePlan, index) => {
      let diff = null;

      if (index < wavePlanHistory.length - 1) {
        const previousVersion = wavePlanHistory[index + 1];
        diff = {
          tasksAdded: wavePlan.totalTasks - previousVersion.totalTasks,
          wavesChanged: wavePlan.totalWaves - previousVersion.totalWaves,
          parallelismChanged:
            wavePlan.maxParallelism - previousVersion.maxParallelism,
          statusChanged: wavePlan.status !== previousVersion.status,
        };
      }

      return {
        ...wavePlan,
        diff,
      };
    });

    return NextResponse.json({
      totalVersions: wavePlanHistory.length,
      versions: historyWithDiffs,
    });
  } catch (error) {
    console.error('Failed to fetch wave plan history:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch wave plan history',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
