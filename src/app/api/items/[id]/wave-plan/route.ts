import { NextRequest, NextResponse } from 'next/server';
import { db, horizonItems, wavePlans, eq, desc } from '@/lib/db';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/items/[id]/wave-plan - Get the current wave plan for a horizon item
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

    // Fetch the most recent wave plan with all relations
    const wavePlan = await db.query.wavePlans.findFirst({
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
        horizonItem: true,
        previousWavePlan: true,
      },
    });

    if (!wavePlan) {
      return NextResponse.json(
        { error: 'No wave plan exists for this item' },
        { status: 404 }
      );
    }

    return NextResponse.json(wavePlan);
  } catch (error) {
    console.error('Failed to fetch wave plan:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch wave plan',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
