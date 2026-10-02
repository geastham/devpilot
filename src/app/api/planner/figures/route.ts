import { NextRequest, NextResponse } from 'next/server';
import { planFigures } from '@devpilot.sh/core/wave-planner';
import { loadPlannerEpisodes } from '@/lib/planner-corpus';

// Never prerendered — see the note on /api/history.
export const dynamic = 'force-dynamic';

/**
 * GET /api/planner/figures?itemId=<horizon item>
 *
 * The item's most recent plan, as numbers: how many planner calls it took and
 * what they cost in tokens, what a reviewer did, and how the plan ran — tasks
 * finished, retried and collided, and how many of the files it named were the
 * files its tasks changed.
 *
 * This is what the bridge sends to the hosted plane when a run ends, and this
 * route is where to see exactly that. There is no text in it and no path: the
 * type (`PlannerFigures` in core) has no field one could be in. `figures` is
 * null when the item has no plan.
 */
export async function GET(request: NextRequest) {
  try {
    const itemId = request.nextUrl.searchParams.get('itemId')?.trim();
    if (!itemId) {
      return NextResponse.json(
        { error: 'ITEM_REQUIRED', detail: 'itemId=<horizon item id> is required' },
        { status: 400 }
      );
    }

    const { episodes } = await loadPlannerEpisodes({ itemId });
    // Newest first; the first with a plan is the item's current plan.
    const current = episodes.find((episode) => episode.plan);
    return NextResponse.json({ itemId, figures: current ? planFigures(current) : null });
  } catch (error) {
    console.error('Error loading planner figures:', error);
    return NextResponse.json({ error: 'Failed to load planner figures' }, { status: 500 });
  }
}
