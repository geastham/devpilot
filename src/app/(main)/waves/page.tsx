'use client';

import { useEffect, useState } from 'react';
import { DAGVisualization, CriticalPathIndicator, WaveProgressBar } from '@/components/wave-planner';

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
 */
export default function WavesPage() {
  const [state, setState] = useState<{
    loading: boolean;
    error: string | null;
    plan: any | null;
  }>({ loading: true, error: null, plan: null });

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
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

        const full = await fetch(`/api/items/${summary.horizonItemId}/wave-plan`).then((r) =>
          r.json()
        );
        if (alive) setState({ loading: false, error: null, plan: full });
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
  }, []);

  if (state.loading) {
    return <Centered>Loading wave plan…</Centered>;
  }
  if (state.error) {
    return <Centered tone="error">Could not load wave plans: {state.error}</Centered>;
  }
  if (!state.plan) {
    return (
      <Centered>
        No wave plan is executing. Dispatch a READY item, or seed one with{' '}
        <code className="text-accent-primary">node scripts/seed-wave-plan.mjs</code>.
      </Centered>
    );
  }

  const wavePlan = state.plan;
  const { waveTasks = [], dependencyEdges = [] } = wavePlan;
  const critical: string[] = Array.isArray(wavePlan.criticalPath) ? wavePlan.criticalPath : [];

  return (
    <div className="h-full overflow-y-auto p-6">
      <header className="mb-6">
        <h1 className="text-lg font-semibold text-text-primary">Wave execution</h1>
        <p className="mt-1 text-sm text-text-secondary">
          {wavePlan?.totalWaves} waves · {wavePlan?.totalTasks} tasks · critical path{' '}
          {critical.join(' → ') || '—'}
        </p>
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
