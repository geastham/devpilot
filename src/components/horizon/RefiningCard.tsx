'use client';

import { cn, formatCurrency } from '@/lib/utils';
import { useHorizonStore, useUIStore } from '@/stores';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RepoBadge } from '@/components/ui/badge';
import type { HorizonItem } from '@/types';

interface RefiningCardProps {
  item: HorizonItem;
}

export function RefiningCard({ item }: RefiningCardProps) {
  const setSelectedItem = useHorizonStore((state) => state.setSelectedItem);
  const selectedItemId = useHorizonStore((state) => state.selectedItemId);
  const openConfidencePanel = useUIStore((state) => state.openConfidencePanel);

  const isSelected = selectedItemId === item.id;
  const plan = item.plan;
  const workstreamCount = plan?.workstreams.length ?? 0;
  const taskCount =
    (plan?.workstreams.reduce((sum, ws) => sum + ws.tasks.length, 0) ?? 0) +
    (plan?.sequentialTasks.length ?? 0);
  const estimatedCost = plan?.estimatedCostUsd ?? 0;

  /**
   * A conductor run has no `plan` row until the plan is approved — the graph
   * interrupts at the review gate and persists afterwards. Reading only `plan`
   * made a finished plan render as "still working", which is precisely backwards
   * at the moment we are asking someone to review it.
   */
  const conductor = item.conductor;
  const awaitingReview = conductor?.awaiting === 'review';

  const handleReviewPlan = () => {
    setSelectedItem(item.id);
    openConfidencePanel(item.id);
  };

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
        {/* This row used to end in a 32px progress ring fed by `plan ? 100 : 0`
            — a permanent, prominent "100%" that measured nothing. An unlabelled
            number that is always the same number is worse than no number:
            readers took it for a confidence score. DESIGN.md §6.1.1 puts the
            words "Plan Ready" on the summary line instead, which is both honest
            and where there is room for them — as a header chip it squeezed
            `NG-1032` down to `N.`. */}
        <div className="flex min-w-0 items-center gap-2 mb-2">
          <RepoBadge repo={item.repo} />
          {item.linearTicketId && (
            <span className="truncate text-xs text-text-muted">{item.linearTicketId}</span>
          )}
        </div>

        {/* Title */}
        <h3 className="font-semibold text-sm text-text-primary line-clamp-2 mb-2">
          {item.title}
        </h3>

        {/* Plan Summary */}
        <p className="text-xs text-text-secondary mb-3">
          {conductor && conductor.waveCount > 0 ? (
            <>
              <span className="font-medium text-accent-green">
                {awaitingReview ? 'Plan ready — your call' : 'Planning'}
              </span>
              {' — '}
              {conductor.waveCount} wave{conductor.waveCount !== 1 ? 's' : ''} ·{' '}
              {conductor.taskCount} task{conductor.taskCount !== 1 ? 's' : ''}
              {conductor.parallelizationScore !== null && (
                <> · {Math.round(conductor.parallelizationScore * 100)}% parallel</>
              )}
            </>
          ) : plan ? (
            <>
              <span className="font-medium text-accent-green">Plan ready</span>
              {' — '}
              {workstreamCount} parallel workstream{workstreamCount !== 1 ? 's' : ''} ·{' '}
              {taskCount} task{taskCount !== 1 ? 's' : ''} ·{' '}
              ~{formatCurrency(estimatedCost)}
            </>
          ) : (
            <span className="text-text-muted">
              Planning agent is still working on this
            </span>
          )}
        </p>

        {/* Actions */}
        <div className="flex justify-end gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              // Same surface as Review Plan — re-planning IS a review decision
              // (`{ action: 'refine', constraints }`), not a separate flow.
              handleReviewPlan();
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
