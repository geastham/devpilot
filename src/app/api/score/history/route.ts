import { NextRequest, NextResponse } from 'next/server';
import { score as scoreModel } from '@devpilot.sh/core';
import { scoreHistory } from '@/lib/score';

/**
 * GET /api/score/history — kept score readings, oldest first.
 *
 * `?days=N` (default 7). Readings are kept by `/api/score` as it computes, at
 * most every fifteen minutes, so this is a record of scores that were actually
 * computed rather than a series anything was written into.
 *
 * Each reading carries what it was out of. A reading of 310 of 450 measured and
 * one of 520 of 1000 are not two points on one scale, and a chart that draws
 * them as such is drawing the change in what could be measured.
 *
 * The POST that used to copy the stored counters into a history row is gone,
 * along with the counters.
 */
export async function GET(request: NextRequest) {
  try {
    const requested = parseInt(request.nextUrl.searchParams.get('days') || '7', 10);
    const days = Number.isFinite(requested) && requested > 0 && requested <= 90 ? requested : 7;

    const end = new Date();
    const start = new Date(end.getTime() - days * 24 * 3_600_000);
    const rows = (await scoreHistory(start)).filter(
      (r) => r.modelVersion === scoreModel.SCORE_MODEL_VERSION
    );

    return NextResponse.json({
      modelVersion: scoreModel.SCORE_MODEL_VERSION,
      history: rows.map((r) => ({
        at: r.at,
        total: r.total,
        measuredMax: r.measuredMax,
        complete: r.complete,
      })),
      period: { days, start: start.toISOString(), end: end.toISOString() },
    });
  } catch (error) {
    console.error('Failed to fetch score history:', error);
    return NextResponse.json({ error: 'Failed to fetch score history' }, { status: 500 });
  }
}
