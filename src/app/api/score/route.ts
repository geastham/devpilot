import { NextRequest, NextResponse } from 'next/server';
import { score as scoreModel } from '@devpilot.sh/core';
import { currentScore, scoreHistory, DEFAULT_SCORE_WINDOW_HOURS } from '@/lib/score';

/**
 * GET /api/score — the Conductor Score, computed now.
 *
 * `?hours=N` looks back N hours instead of the default week.
 *
 * This route used to read a row of counters, create one holding 500 points if
 * none existed, and serve it. It now computes the six dimensions from recorded
 * events on every request and stores nothing it could later be wrong about.
 *
 * What a consumer must not do with the answer: render `total` as "out of 1000".
 * It is out of `measuredMax` — the points of the dimensions that could be
 * measured — and only `complete` scores are comparable with each other.
 */
export async function GET(request: NextRequest) {
  try {
    const requested = Number(request.nextUrl.searchParams.get('hours'));
    const windowHours =
      Number.isFinite(requested) && requested > 0 && requested <= 24 * 90
        ? requested
        : DEFAULT_SCORE_WINDOW_HOURS;

    const now = new Date();
    const score = await currentScore(windowHours, now);
    const history = await scoreHistory(new Date(now.getTime() - 30 * 24 * 3_600_000));

    // Each dimension with the words that explain it, in model order, so a
    // surface can render the breakdown without importing the model.
    const breakdown = scoreModel.SCORE_MODEL.map((dimension) => {
      const result = score.dimensions[dimension.key];
      return {
        key: dimension.key,
        label: dimension.label,
        meaning: dimension.meaning,
        method: dimension.method,
        max: dimension.max,
        value: result.value,
        ratio: result.ratio,
        unmeasured: result.unmeasured,
        basis: result.basis,
      };
    });

    return NextResponse.json({
      modelVersion: score.modelVersion,
      total: score.total,
      measuredMax: score.measuredMax,
      max: score.max,
      complete: score.complete,
      measuredDimensions: breakdown.length - score.unmeasured.length,
      dimensions: breakdown.length,
      unmeasured: score.unmeasured,
      windowHours: score.windowHours,
      window: score.window,
      capacitySource: score.capacitySource,
      breakdown,
      // Only readings taken under this model: an earlier model's totals are not
      // the same quantity, and drawing them on one line would say they were.
      history: history
        .filter((h) => h.modelVersion === score.modelVersion)
        .map((h) => ({ at: h.at, total: h.total, measuredMax: h.measuredMax, complete: h.complete })),
      computedAt: now.toISOString(),
    });
  } catch (error) {
    console.error('Failed to compute score:', error);
    return NextResponse.json({ error: 'Failed to compute score' }, { status: 500 });
  }
}
