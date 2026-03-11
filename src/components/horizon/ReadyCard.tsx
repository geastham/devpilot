'use client';

import { useState } from 'react';
import { cn, formatCurrency } from '@/lib/utils';
import { useHorizonStore } from '@/stores';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RepoBadge, ComplexityBadge } from '@/components/ui/badge';
import type { HorizonItem } from '@/types';

interface ReadyCardProps {
  item: HorizonItem;
}

export function ReadyCard({ item }: ReadyCardProps) {
  const [isDispatching, setIsDispatching] = useState(false);
  const dispatchItem = useHorizonStore((state) => state.dispatchItem);
  const setSelectedItem = useHorizonStore((state) => state.setSelectedItem);
  const selectedItemId = useHorizonStore((state) => state.selectedItemId);

  const isSelected = selectedItemId === item.id;
  const estimatedCost = item.plan?.estimatedCostUsd ?? 0;

  const handleDispatch = async () => {
    setIsDispatching(true);
    try {
      await dispatchItem(item.id);
    } finally {
      setIsDispatching(false);
    }
  };

  return (
    <Card
      variant="ready"
      interactive
      className={cn(
        'relative transition-all duration-150',
        isSelected && 'ring-2 ring-accent-primary',
        isDispatching && 'opacity-60'
      )}
      onClick={() => setSelectedItem(item.id)}
    >
      {isDispatching && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/20 rounded-lg z-10">
          <span className="text-sm font-medium text-text-primary">Dispatching...</span>
        </div>
      )}

      <CardContent className="p-4">
        {/* Header Row */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <RepoBadge repo={item.repo} />
            {item.linearTicketId && (
              <span className="text-xs text-text-muted">{item.linearTicketId}</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {item.complexity && <ComplexityBadge complexity={item.complexity} />}
            <span className="text-xs text-text-muted">
              ~{formatCurrency(estimatedCost)}
            </span>
          </div>
        </div>

        {/* Title */}
        <h3 className="font-semibold text-sm text-bg-base line-clamp-2 mb-3">
          {item.title}
        </h3>

        {/* Actions */}
        <div className="flex justify-end">
          <Button
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              handleDispatch();
            }}
            loading={isDispatching}
            disabled={isDispatching}
          >
            Dispatch →
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
