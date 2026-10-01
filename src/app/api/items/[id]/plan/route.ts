import { NextRequest, NextResponse } from 'next/server';
import { db, horizonItems, eq } from '@/lib/db';

// Never prerendered. A GET handler that touches no request API is treated by
// `next build` as static, and its build-time answer is then served for ever —
// see tests/e2e/cockpit-routes.test.ts in packages/cli.
export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/items/[id]/plan - Get the plan for a horizon item
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    const item = await db.query.horizonItems.findFirst({
      where: eq(horizonItems.id, id),
      with: {
        plan: {
          with: {
            workstreams: {
              with: {
                tasks: true,
              },
            },
            sequentialTasks: true,
            filesTouched: true,
            previousPlan: true,
          },
        },
      },
    });

    if (!item) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 });
    }

    if (!item.plan) {
      return NextResponse.json({ error: 'No plan exists for this item' }, { status: 404 });
    }

    return NextResponse.json(item.plan);
  } catch (error) {
    console.error('Failed to fetch plan:', error);
    return NextResponse.json(
      { error: 'Failed to fetch plan' },
      { status: 500 }
    );
  }
}
