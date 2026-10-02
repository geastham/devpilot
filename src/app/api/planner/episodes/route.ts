import { NextRequest, NextResponse } from 'next/server';
import { redactEpisode, summarizeCorpus } from '@devpilot.sh/core/wave-planner';
import { EPISODE_PLAN_LIMIT, loadPlannerEpisodes } from '@/lib/planner-corpus';

// Never prerendered — see the note on /api/history.
export const dynamic = 'force-dynamic';

const DEFAULT_DAYS = 90;
const MAX_DAYS = 3650;

/**
 * GET /api/planner/episodes?days=90&text=full|none
 *
 * Planning episodes: for each plan, the calls to the planning model that led
 * to it (what was asked, what was answered, what was made of the answer), what
 * a reviewer decided, and how the plan ran — tasks finished, retried, collided,
 * and how closely the files each task changed matched the files the plan said
 * it would. `summary` is the same set at a glance.
 *
 * `text=none` returns the same episodes with every prompt, plan, description,
 * constraint, error and path removed, leaving shape and figures.
 *
 * LOCAL ONLY. This reads the cockpit's own database and answers the caller. A
 * prompt holds the specification and the repository's file tree; nothing sends
 * any of it to the hosted plane. What the answer is then done with is up to
 * the person who asked for it.
 */
export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;

    const rawDays = params.get('days');
    const days = rawDays === null ? DEFAULT_DAYS : Number(rawDays);
    if (!Number.isFinite(days) || days <= 0 || days > MAX_DAYS) {
      return NextResponse.json(
        { error: 'DAYS_INVALID', detail: `days must be a number between 1 and ${MAX_DAYS}` },
        { status: 400 }
      );
    }

    const text = params.get('text') ?? 'full';
    if (text !== 'full' && text !== 'none') {
      return NextResponse.json({ error: 'TEXT_INVALID', detail: 'text must be "full" or "none"' }, { status: 400 });
    }

    const since = new Date(Date.now() - days * 86_400_000);
    const { episodes, truncated } = await loadPlannerEpisodes(since);

    return NextResponse.json({
      since: since.toISOString(),
      text,
      // Counted before anything is removed: redaction does not change a figure.
      summary: summarizeCorpus(episodes),
      truncated,
      ...(truncated ? { note: `Only the ${EPISODE_PLAN_LIMIT} most recent plans are included; ask for fewer days.` } : {}),
      episodes: text === 'none' ? episodes.map(redactEpisode) : episodes,
    });
  } catch (error) {
    console.error('Error loading planner episodes:', error);
    return NextResponse.json({ error: 'Failed to load planner episodes' }, { status: 500 });
  }
}
