'use client';

import { useCallback, useEffect, useState } from 'react';
import { X, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useUIStore, useHorizonStore } from '@/stores';

/**
 * The conductor's plan review — the human-in-the-loop `interrupt()` made
 * reachable.
 *
 * `RefiningCard`'s "Review Plan" already called `openConfidencePanel(itemId)`,
 * which set `isConfidencePanelOpen` in the UI store. **Nothing rendered it.** The
 * button had been dead: it flipped a flag no component consumed, so the single
 * most important interaction in the product (DESIGN.md §6: *"the highest-stakes
 * interaction in DevPilot"*) did nothing at all.
 *
 * This is that surface, wired to `/api/items/[id]/conductor`. The three actions
 * map exactly onto the graph's `ReviewDecision` — approve, refine with
 * constraints, abort — so what the conductor clicks is what the agent resumes
 * with, rather than a parallel database flow that happens to look similar.
 */

interface ReviewState {
  status?: string;
  awaiting?: 'review' | 'wave' | null;
  review?: {
    itemTitle?: string;
    score?: { parallelizationScore?: number };
    refinementIterations?: number;
    belowThreshold?: boolean;
    plan?: { waves?: { tasks?: unknown[] }[] };
  } | null;
  wavePlanId?: string | null;
  currentWaveIndex?: number;
  completedWaves?: number[];
  lastDispatch?: { dispatched: number; queued: number } | null;
  errors?: string[];
}

type Phase =
  | { kind: 'idle' }
  | { kind: 'working'; label: string }
  | { kind: 'error'; message: string; detail?: string };

export function ConductorReviewPanel() {
  const isOpen = useUIStore((s) => s.isConfidencePanelOpen);
  const itemId = useUIStore((s) => s.confidencePanelItemId);
  const close = useUIStore((s) => s.closeConfidencePanel);
  const items = useHorizonStore((s) => s.items);

  const [state, setState] = useState<ReviewState | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [constraints, setConstraints] = useState('');

  const item = items.find((i) => i.id === itemId);

  const post = useCallback(
    async (body: Record<string, unknown>, label: string) => {
      if (!itemId) return;
      setPhase({ kind: 'working', label });
      try {
        const res = await fetch(`/api/items/${itemId}/conductor`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const json = await res.json();

        if (!res.ok) {
          // A missing API key is the common case and deserves to be named
          // rather than shown as a generic failure — it is configuration, not a
          // bug, and the conductor can fix it.
          setPhase({
            kind: 'error',
            message:
              json.error === 'PLAN_AI_UNAVAILABLE'
                ? 'Planning is unavailable — no ANTHROPIC_API_KEY is configured.'
                : (json.error ?? 'The conductor run failed.'),
            detail: json.detail,
          });
          return;
        }

        setState(json);
        setPhase({ kind: 'idle' });
        setConstraints('');
      } catch (error) {
        setPhase({
          kind: 'error',
          message: error instanceof Error ? error.message : 'Request failed.',
        });
      }
    },
    [itemId]
  );

  // Read existing state on open; only start a run when none exists. Opening the
  // panel must never silently kick off a paid planning run.
  useEffect(() => {
    if (!isOpen || !itemId) return;
    setState(null);
    setPhase({ kind: 'working', label: 'Loading' });
    fetch(`/api/items/${itemId}/conductor`)
      .then(async (res) => (res.ok ? res.json() : null))
      .then((json) => {
        setState(json);
        setPhase({ kind: 'idle' });
      })
      .catch(() => setPhase({ kind: 'idle' }));
  }, [isOpen, itemId]);

  if (!isOpen || !itemId) return null;

  const review = state?.review;
  const awaitingReview = state?.awaiting === 'review' && review;
  const busy = phase.kind === 'working';
  const taskCount =
    review?.plan?.waves?.reduce((n, w) => n + (w.tasks?.length ?? 0), 0) ?? 0;

  return (
    <div className="fixed inset-0 z-[80] flex justify-end bg-black/40" onClick={close}>
      <aside
        className="dp-enter flex h-full w-full max-w-md flex-col border-l border-border-default bg-bg-panel shadow-panel"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Plan review"
      >
        <header className="flex items-start justify-between border-b border-border-default px-4 py-3">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-text-primary">Plan review</h2>
            <p className="mt-0.5 truncate text-xs text-text-muted">
              {item?.title ?? review?.itemTitle ?? itemId}
            </p>
          </div>
          <button
            onClick={close}
            aria-label="Close plan review"
            className="rounded p-1 text-text-secondary hover:bg-white/5 hover:text-text-primary"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          {phase.kind === 'error' && (
            <div className="rounded-lg border border-accent-red/40 bg-accent-red/10 p-3">
              <p className="flex items-start gap-2 text-xs text-text-primary">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent-red" />
                <span>{phase.message}</span>
              </p>
              {phase.detail && (
                <p className="mt-1 pl-5 text-xs text-text-muted">{phase.detail}</p>
              )}
            </div>
          )}

          {/* No run yet. Starting one costs a model call, so it is an explicit
              action rather than a side effect of opening the panel. */}
          {!state?.status && phase.kind !== 'working' && (
            <div className="space-y-3">
              <p className="text-xs leading-relaxed text-text-secondary">
                No conductor run for this item yet. Generating a plan calls the
                planning model and costs tokens.
              </p>
              <Button className="w-full" onClick={() => post({}, 'Planning')} disabled={busy}>
                Generate a plan
              </Button>
            </div>
          )}

          {awaitingReview && (
            <>
              <div className="rounded-lg border border-border-default bg-bg-surface p-3">
                <div className="flex items-baseline justify-between">
                  <span className="text-xs text-text-secondary">Parallelization</span>
                  <span className="text-sm font-bold tabular-nums text-text-primary">
                    {Math.round(review.score?.parallelizationScore ?? 0)}
                  </span>
                </div>
                <p className="mt-1 text-xs text-text-muted">
                  {review.plan?.waves?.length ?? 0} wave
                  {(review.plan?.waves?.length ?? 0) === 1 ? '' : 's'} · {taskCount} task
                  {taskCount === 1 ? '' : 's'} · refined ×{review.refinementIterations ?? 0}
                </p>
              </div>

              {review.belowThreshold && (
                <p className="rounded-lg border border-accent-amber/40 bg-accent-amber/10 p-3 text-xs leading-relaxed text-text-primary">
                  Refinement stopped below the parallelization threshold. The
                  planner could not improve it further — your call.
                </p>
              )}

              <div className="space-y-2">
                <label
                  htmlFor="constraints"
                  className="block text-xs font-medium text-text-secondary"
                >
                  Constraints for a re-plan
                </label>
                <textarea
                  id="constraints"
                  rows={3}
                  value={constraints}
                  onChange={(e) => setConstraints(e.target.value)}
                  placeholder="One per line, e.g. do not touch src/db"
                  className="w-full rounded-lg border border-border-default bg-bg-base px-3 py-2 text-xs text-text-primary outline-none placeholder:text-text-muted focus:border-accent-primary"
                />
              </div>
            </>
          )}

          {state?.awaiting === 'wave' && (
            <div className="rounded-lg border border-border-default bg-bg-surface p-3">
              <p className="text-xs text-text-primary">
                Wave {(state.currentWaveIndex ?? 0) + 1} is running.
              </p>
              <p className="mt-1 text-xs text-text-muted">
                {state.lastDispatch?.dispatched ?? 0} dispatched
                {state.lastDispatch?.queued ? `, ${state.lastDispatch.queued} queued` : ''}.
                The run resumes itself when the wave completes.
              </p>
            </div>
          )}

          {(state?.status === 'complete' || state?.status === 'failed') && (
            <div
              className={cn(
                'rounded-lg border p-3 text-xs',
                state.status === 'complete'
                  ? 'border-accent-green/40 bg-accent-green/10 text-text-primary'
                  : 'border-accent-red/40 bg-accent-red/10 text-text-primary'
              )}
            >
              {state.status === 'complete'
                ? `All ${state.completedWaves?.length ?? 0} waves complete.`
                : `Run failed. ${state.errors?.[state.errors.length - 1] ?? ''}`}
            </div>
          )}
        </div>

        {awaitingReview && (
          <footer className="space-y-2 border-t border-border-default p-4">
            <Button
              className="w-full"
              disabled={busy}
              onClick={() => post({ decision: { action: 'approve' } }, 'Dispatching')}
            >
              {busy ? phase.label + '…' : 'Approve and dispatch'}
            </Button>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                className="flex-1"
                disabled={busy || constraints.trim().length === 0}
                title={
                  constraints.trim().length === 0
                    ? 'Add a constraint to re-plan against'
                    : undefined
                }
                onClick={() =>
                  post(
                    {
                      decision: {
                        action: 'refine',
                        constraints: constraints
                          .split('\n')
                          .map((c) => c.trim())
                          .filter(Boolean),
                      },
                    },
                    'Re-planning'
                  )
                }
              >
                Re-plan
              </Button>
              <Button
                variant="ghost"
                className="flex-1"
                disabled={busy}
                onClick={() =>
                  post(
                    { decision: { action: 'abort', reason: 'Rejected at review' } },
                    'Rejecting'
                  )
                }
              >
                Reject
              </Button>
            </div>
          </footer>
        )}
      </aside>
    </div>
  );
}
