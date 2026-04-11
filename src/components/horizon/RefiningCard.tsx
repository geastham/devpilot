'use client';

import { cn, formatCurrency } from '@/lib/utils';
import { useHorizonStore, useUIStore, usePlanJobStore, isTerminalStatus } from '@/stores';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RepoBadge } from '@/components/ui/badge';
import { ProgressRing } from '@/components/ui/progress';
import { PlanProgressCard } from '@/components/plan';
import type { HorizonItem } from '@/types';
import { useEffect } from 'react';

interface RefiningCardProps {
  item: HorizonItem;
}

export function RefiningCard({ item }: RefiningCardProps) {
  const setSelectedItem = useHorizonStore((state) => state.setSelectedItem);
  const selectedItemId = useHorizonStore((state) => state.selectedItemId);
  const openConfidencePanel = useUIStore((state) => state.openConfidencePanel);

  // Async plan-job state — PlanProgressCard renders the live progress, and
  // once the job reaches `ready` the card shows the Review Plan affordance.
  const job = usePlanJobStore((s) => s.jobsByItemId[item.id]);
  const startJob = usePlanJobStore((s) => s.startJob);
  const startPolling = usePlanJobStore((s) => s.startPolling);

  // If a wave-plan job was kicked off server-side (e.g. by promoteItem) but
  // we don't have one in the local store yet, we can't recover it without a
  // list endpoint. For now we only track jobs started from this client.
  // When the user hits "Generate Plan" we start a job explicitly.
  useEffect(() => {
    if (job && !isTerminalStatus(job.status)) {
      // Re-attach the poller in case the component re-mounted.
      startPolling(item.id, job.id);
    }
  }, [item.id, job?.id]);

  const isSelected = selectedItemId === item.id;
  const plan = item.plan;
  const workstreamCount = plan?.workstreams.length ?? 0;
  const taskCount =
    (plan?.workstreams.reduce((sum, ws) => sum + ws.tasks.length, 0) ?? 0) +
    (plan?.sequentialTasks.length ?? 0);
  const estimatedCost = plan?.estimatedCostUsd ?? 0;

  const specCompletion = plan ? 100 : 0;

  const handleReviewPlan = () => {
    setSelectedItem(item.id);
    openConfidencePanel(item.id);
  };

  const handleStartUltraPlan = () => {
    void startJob(item.id, { forceUltra: true });
  };

  // If there's an in-flight or ready async job, render the progress card
  // instead of the traditional plan summary. The user approves / rejects
  // directly from PlanProgressCard; on approval the horizon item promotes
  // itself to READY via the server-side approve endpoint.
  if (job && (!isTerminalStatus(job.status) || job.status === 'ready')) {
    return (
      <div onClick={() => setSelectedItem(item.id)}>
        <PlanProgressCard itemId={item.id} job={job} />
      </div>
    );
  }

  return (
    <Card
      variant="refining"
      interactive
      className={cn(
        'relative transition-all duration-150',
        isSelected && 'ring-2 ring-zone-refining'
      )}
      onClick={() => setSelectedItem(item.id)}
    >
      <CardContent className="p-4">
        {/* Header Row */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <RepoBadge repo={item.repo} />
            {item.linearTicketId && (
              <span className="text-xs text-text-muted">{item.linearTicketId}</span>
            )}
          </div>
          <ProgressRing
            value={specCompletion}
            size={32}
            strokeWidth={3}
            variant={specCompletion === 100 ? 'success' : 'default'}
          />
        </div>

        {/* Title */}
        <h3 className="font-semibold text-sm text-text-primary line-clamp-2 mb-2">
          {item.title}
        </h3>

        {/* Plan Summary */}
        {plan && (
          <p className="text-xs text-text-secondary mb-3">
            {workstreamCount} parallel workstream{workstreamCount !== 1 ? 's' : ''} ·{' '}
            {taskCount} task{taskCount !== 1 ? 's' : ''} ·{' '}
            ~{formatCurrency(estimatedCost)}
          </p>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              handleStartUltraPlan();
            }}
            title="Generate wave plan with Opus + extended thinking"
          >
            Ultra plan ⚡
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              // TODO: Open replan input
            }}
          >
            Re-plan ↺
          </Button>
          <Button
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              handleReviewPlan();
            }}
          >
            Review Plan
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
