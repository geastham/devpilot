import { NextRequest, NextResponse } from 'next/server';
import { DEFAULT_HISTORY_LIMIT, MAX_HISTORY_LIMIT } from '@devpilot.sh/core/wave-planner';
import { loadWorkHistory } from '@/lib/history';

// Never prerendered. A GET handler that touches no request API is treated by
// `next build` as static, and its build-time answer is then served for ever —
// see tests/e2e/cockpit-routes.test.ts in packages/cli.
export const dynamic = 'force-dynamic';

/** A request naming more files than this is refused rather than half-answered. */
const MAX_PATHS = 50;

/**
 * GET /api/history?repo=<owner/name>&paths=a.ts,b.ts&limit=5
 *
 * Work history for files: for each path, the most recent wave tasks that
 * changed it — which ticket and task, how it ended and when, whether it had to
 * be retried and why, what its agent said it did, and what it cost.
 *
 * This is the layer no code graph has (TRD 27 §4). A code graph is derivable
 * from the repository; "the last task to touch this file conflicted with the
 * run branch and was redone" is not, and is the kind of thing an agent about
 * to edit that file can use.
 *
 * `paths` is comma-separated, repo-relative. A task counts for a path when the
 * files it is recorded as having changed include it — or, when nothing
 * recorded what it changed, when the plan assigned it the path; each entry's
 * `matchedOn` says which. `limit` is per path (default 5, at most 20), and
 * `totals` says how many there were in all.
 *
 * LOCAL ONLY. This reads the cockpit's own database and answers the caller.
 * The summaries and errors in it are text written by agents about the user's
 * code; nothing sends them to the hosted plane, and a caller that puts them in
 * front of a model must present them as untrusted text.
 */
export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;

    const repo = params.get('repo')?.trim();
    if (!repo) {
      return NextResponse.json(
        { error: 'REPO_REQUIRED', detail: 'repo=<owner/name> is required' },
        { status: 400 }
      );
    }

    const paths = [
      ...new Set(
        (params.get('paths') ?? '')
          .split(',')
          .map((path) => path.trim())
          .filter(Boolean)
      ),
    ];
    if (paths.length === 0) {
      return NextResponse.json(
        { error: 'PATHS_REQUIRED', detail: 'paths=<a.ts,b.ts> is required: one or more repo-relative paths' },
        { status: 400 }
      );
    }
    if (paths.length > MAX_PATHS) {
      return NextResponse.json(
        { error: 'TOO_MANY_PATHS', detail: `at most ${MAX_PATHS} paths per request; got ${paths.length}` },
        { status: 400 }
      );
    }

    // Anything that is not a usable number is the default, not an error.
    const requested = Number.parseInt(params.get('limit') ?? '', 10);
    const limit = Number.isFinite(requested)
      ? Math.min(MAX_HISTORY_LIMIT, Math.max(1, requested))
      : DEFAULT_HISTORY_LIMIT;

    const history = await loadWorkHistory(repo, paths, limit);

    return NextResponse.json({ repo, limit, paths: history.byPath, totals: history.totals });
  } catch (error) {
    console.error('Failed to read work history:', error);
    return NextResponse.json(
      { error: 'HISTORY_FAILED', detail: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
