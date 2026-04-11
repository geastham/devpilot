'use client';

/**
 * PlanProgressCard
 * =============================================================================
 *
 * Renders the live state of an async wave plan generation job. Mirrors the
 * ULTRAPLAN browser UI: the user watches the planner think, sees tier and
 * escalation state, and can cancel mid-run.
 *
 * Lifecycle:
 *   - PlanProgressCard appears as soon as `usePlanJobStore.startJob` is
 *     called (e.g. when an item is promoted to REFINING).
 *   - It polls via the store's internal setInterval and updates as the job
 *     transitions thinking -> drafting -> refining -> escalating -> ready.
 *   - Once `status === 'ready'`, RefiningCard swaps this out for
 *     PlanReviewCard which renders the actual draft plan.
 */

import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { usePlanJobStore, isTerminalStatus, type PlanJob } from '@/stores';
import { useState } from 'react';

interface PlanProgressCardProps {
  itemId: string;
  job: PlanJob;
}

export function PlanProgressCard({ itemId, job }: PlanProgressCardProps) {
  const cancelJob = usePlanJobStore((s) => s.cancelJob);
  const rejectJob = usePlanJobStore((s) => s.rejectJob);
  const approveJob = usePlanJobStore((s) => s.approveJob);
  const [rejectDraft, setRejectDraft] = useState('');
  const [showReject, setShowReject] = useState(false);

  const phaseLabel = describePhase(job);
  const tierBadge = job.modelTier === 'ultra' ? 'ULTRA · Opus' : 'STANDARD · Sonnet';

  const totalTokens = job.tokensInput + job.tokensOutput + job.thinkingTokens;

  const isReady = job.status === 'ready';
  const isTerminalFailure =
    job.status === 'failed' || job.status === 'cancelled';
  const isInFlight = !isTerminalStatus(job.status);

  return (
    <Card className="bg-bg-surface border border-border-default">
      <CardContent className="p-4">
        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span
                className={cn(
                  'text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded',
                  job.modelTier === 'ultra'
                    ? 'bg-accent-primary/20 text-accent-primary'
                    : 'bg-bg-panel text-text-muted'
                )}
              >
                {tierBadge}
              </span>
              {job.escalated && (
                <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-accent-amber/20 text-accent-amber">
                  Escalated
                </span>
              )}
            </div>
            <div className="text-sm font-semibold text-text-primary">
              {phaseLabel}
            </div>
            {job.currentStep && (
              <div className="text-xs text-text-secondary mt-0.5">
                {job.currentStep}
              </div>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2">
            {isInFlight && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => cancelJob(itemId, job.id)}
              >
                Cancel
              </Button>
            )}
            {isReady && (
              <>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setShowReject(true)}
                >
                  Reject
                </Button>
                <Button
                  size="sm"
                  onClick={() => approveJob(itemId, job.id)}
                >
                  Approve →
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Progress bar */}
        {!isTerminalFailure && (
          <div className="w-full h-1.5 bg-bg-panel rounded-full overflow-hidden mb-3">
            <div
              className={cn(
                'h-full transition-all duration-500',
                isReady ? 'bg-accent-green' : 'bg-accent-primary',
                isInFlight && 'animate-pulse'
              )}
              style={{ width: `${Math.min(100, Math.max(0, job.progressPercent))}%` }}
            />
          </div>
        )}

        {/* Stats grid */}
        <div className="grid grid-cols-4 gap-2 text-xs">
          <Stat label="Tokens">
            {formatTokens(totalTokens)}
          </Stat>
          {job.modelTier === 'ultra' && (
            <Stat label="Thinking">
              {formatTokens(job.thinkingTokens)}
            </Stat>
          )}
          <Stat label="Iterations">
            {job.iterations || 0}
          </Stat>
          <Stat label="Best score">
            {job.bestParallelizationScore !== null
              ? `${(job.bestParallelizationScore * 100).toFixed(0)}%`
              : '—'}
          </Stat>
        </div>

        {/* Escalation note */}
        {job.escalationReason && (
          <div className="mt-3 text-xs text-text-secondary border-l-2 border-accent-amber pl-2">
            {job.escalationReason}
          </div>
        )}

        {/* Terminal failure */}
        {isTerminalFailure && (
          <div className="mt-3 text-xs text-accent-red">
            {job.status === 'cancelled'
              ? 'Cancelled by user.'
              : job.errorMessage || 'Plan generation failed.'}
          </div>
        )}

        {/* Reject drawer */}
        {showReject && isReady && (
          <div className="mt-4 pt-3 border-t border-border-default">
            <label className="text-xs text-text-secondary block mb-1">
              Reason for rejection (used to guide replan)
            </label>
            <textarea
              value={rejectDraft}
              onChange={(e) => setRejectDraft(e.target.value)}
              className="w-full text-xs bg-bg-panel border border-border-default rounded px-2 py-1.5 text-text-primary"
              rows={3}
              placeholder="e.g. Missing test coverage for the auth layer; over-parallelized the migration step."
            />
            <div className="flex justify-end gap-2 mt-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setShowReject(false);
                  setRejectDraft('');
                }}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={!rejectDraft.trim()}
                onClick={() =>
                  rejectJob(itemId, job.id, rejectDraft.trim(), { replan: true })
                }
              >
                Reject & replan (standard)
              </Button>
              <Button
                size="sm"
                disabled={!rejectDraft.trim()}
                onClick={() =>
                  rejectJob(itemId, job.id, rejectDraft.trim(), {
                    replan: true,
                    forceUltra: true,
                  })
                }
              >
                Reject & replan (ultra)
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase text-text-muted tracking-wider">
        {label}
      </div>
      <div className="text-text-primary font-mono">{children}</div>
    </div>
  );
}

function describePhase(job: PlanJob): string {
  switch (job.status) {
    case 'queued':
      return 'Queued';
    case 'thinking':
      return 'Thinking';
    case 'drafting':
      return 'Drafting plan';
    case 'validating':
      return 'Validating DAG';
    case 'refining':
      return 'Refining';
    case 'escalating':
      return 'Escalating to ultra tier';
    case 'ready':
      return 'Ready to review';
    case 'approved':
      return 'Approved';
    case 'rejected':
      return 'Rejected';
    case 'failed':
      return 'Failed';
    case 'cancelled':
      return 'Cancelled';
    default:
      return job.status;
  }
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}
