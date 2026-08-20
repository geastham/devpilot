'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { DAGVisualization, CriticalPathIndicator, WaveProgressBar } from '@/components/wave-planner';
import { RepoBadge } from '@/components/ui/badge';

/**
 * Wave execution view.
 *
 * The wave planner UI — DAGVisualization, CriticalPathIndicator, WaveTableView
 * — was fully built, exported from an index, and mounted NOWHERE. The engine
 * exists, the API routes exist, the components exist, and there was no way to
 * look at any of it. This route is the missing mount point.
 *
 * Client-side fetch rather than a server component: the shell is a client tree
 * already, and the same data has to refresh while a wave executes, so a server
 * render would only be correct for the first paint.
 *
 * ## Addressing a specific plan
 *
 * This route used to render `active.wavePlans[0]` — whichever active plan came
 * back first — with nothing on the page saying which item it belonged to. With
 * one plan running that looks fine; with two it silently shows you someone
 * else's work, and there was no way to ask for the one you wanted. A board of
 * cards had no route into the view that explains them.
 *
 * `?item=<horizonItemId>` now selects a plan, the header names the work it
 * belongs to, and the cards link here. The no-parameter case still falls back
 * to the first active plan, because arriving from the nav tab with nothing in
 * mind should show you something — but it says what it picked.
 */
export default function WavesPage() {
  const [state, setState] = useState<{
    loading: boolean;
    error: string | null;
    plan: any | null;
    /** The horizon item the plan belongs to, for naming the work on screen. */
    item?: any | null;
    /** True when we chose a plan for the user rather than being told which. */
    picked?: boolean;
  }>({ loading: true, error: null, plan: null });

  const searchParams = useSearchParams();
  const requestedItemId = searchParams.get('item');

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        // An explicit item wins: the user asked for this plan, so showing a
        // different one because it happens to be "active" would be wrong.
        if (requestedItemId) {
          const [full, item] = await Promise.all([
            fetch(`/api/items/${requestedItemId}/wave-plan`).then((r) =>
              r.ok ? r.json() : null
            ),
            fetch(`/api/items/${requestedItemId}`).then((r) => (r.ok ? r.json() : null)),
          ]);
          if (alive) {
            setState({
              loading: false,
              error: null,
              plan: full && full.id ? full : null,
              item,
              picked: false,
            });
          }
          return;
        }

        // Shapes taken from the routes, not guessed: /active returns
        // { count, wavePlans[] }, and the per-item endpoint returns the wave
        // plan FLAT with waves / waveTasks / dependencyEdges / criticalPath
        // hanging off it.
        const active = await fetch('/api/wave-plans/active').then((r) => r.json());
        const summary = active?.wavePlans?.[0];

        if (!summary) {
          if (alive) setState({ loading: false, error: null, plan: null });
          return;
        }

        const [full, item] = await Promise.all([
          fetch(`/api/items/${summary.horizonItemId}/wave-plan`).then((r) => r.json()),
          fetch(`/api/items/${summary.horizonItemId}`).then((r) => (r.ok ? r.json() : null)),
        ]);
        if (alive) {
          setState({
            loading: false,
            error: null,
            plan: full,
            item,
            // More than one plan is running and we picked for them — say so.
            picked: (active?.wavePlans?.length ?? 0) > 1,
          });
        }
      } catch (err) {
        if (alive) {
          setState({
            loading: false,
            error: err instanceof Error ? err.message : String(err),
            plan: null,
          });
        }
      }
    })();

    return () => {
      alive = false;
    };
  }, [requestedItemId]);

  if (state.loading) {
    return <Centered>Loading wave plan…</Centered>;
  }
  if (state.error) {
    return <Centered tone="error">Could not load wave plans: {state.error}</Centered>;
  }
  if (!state.plan) {
    // Asked for a specific item and it has no plan yet: that is a different
    // situation from "nothing is running anywhere", and saying the wrong one
    // sends the user looking for a problem that is not there.
    if (requestedItemId) {
      return (
        <Centered>
          This item has no wave plan yet. It gets one when its plan is approved in the
          cockpit.{' '}
          <Link href="/" className="text-accent-primary hover:underline">
            Back to Fleet
          </Link>
        </Centered>
      );
    }
    return (
      <Centered>
        No wave plan is executing. Dispatch a READY item, or seed one with{' '}
        <code className="text-accent-primary">node scripts/seed-wave-plan.mjs</code>.
      </Centered>
    );
  }

  const wavePlan = state.plan;
  const item = state.item;
  const { waveTasks = [], dependencyEdges = [] } = wavePlan;
  const critical: string[] = Array.isArray(wavePlan.criticalPath) ? wavePlan.criticalPath : [];

  return (
    <div className="h-full overflow-y-auto p-6">
      <header className="mb-6">
        {/* The way back. This view is reached from a card, and a plan you
            cannot navigate out of is a dead end. */}
        <Link
          href="/"
          className="text-xs text-text-muted transition-colors hover:text-text-primary"
        >
          ← Fleet
        </Link>

        <h1 className="mt-2 text-lg font-semibold text-text-primary">
          {/* Name the work. The page used to say only "Wave execution", so with
              two plans running there was nothing on screen to tell you which
              one you were looking at. */}
          {item?.title ?? 'Wave execution'}
        </h1>

        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-text-secondary">
          {item?.repo && <RepoBadge repo={item.repo} />}
          {item?.linearTicketId && (
            <span className="text-xs text-text-muted">{item.linearTicketId}</span>
          )}
          <span>
            {wavePlan?.totalWaves} waves · {wavePlan?.totalTasks} tasks · critical path{' '}
            {critical.join(' → ') || '—'}
          </span>
        </p>

        {state.picked && (
          <p className="mt-2 text-xs text-accent-amber">
            Showing the first of several running plans. Open a card from the Fleet board to
            see its own waves.
          </p>
        )}
      </header>

      <div className="mb-6">
        <WaveProgressBar wavePlan={wavePlan} currentWaveIndex={wavePlan?.currentWaveIndex} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <div className="min-w-0 rounded-lg border border-border-default bg-bg-panel p-4">
          <DAGVisualization
            wavePlan={wavePlan}
            waveTasks={waveTasks}
            dependencyEdges={dependencyEdges}
            criticalPath={critical}
          />
        </div>
        <CriticalPathIndicator wavePlan={wavePlan} />
      </div>
    </div>
  );
}

function Centered({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone?: 'error';
}) {
  return (
    <div className="flex h-full items-center justify-center p-8 text-center">
      <p className={tone === 'error' ? 'text-sm text-accent-red' : 'text-sm text-text-secondary'}>
        {children}
      </p>
    </div>
  );
}
