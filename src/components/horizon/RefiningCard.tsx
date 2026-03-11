'use client';

import { cn, formatCurrency } from '@/lib/utils';
import { useHorizonStore, useUIStore } from '@/stores';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RepoBadge } from '@/components/ui/badge';
import { ProgressRing } from '@/components/ui/progress';
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

  // Simulate spec completion progress (in real app, would track plan generation progress)
  const specCompletion = plan ? 100 : 0;

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
