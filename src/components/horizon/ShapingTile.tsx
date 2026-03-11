'use client';

import { cn } from '@/lib/utils';
import { useHorizonStore } from '@/stores';
import { Card, CardContent } from '@/components/ui/card';
import { RepoBadge } from '@/components/ui/badge';
import type { HorizonItem } from '@/types';

interface ShapingTileProps {
  item: HorizonItem;
}

export function ShapingTile({ item }: ShapingTileProps) {
  const setSelectedItem = useHorizonStore((state) => state.setSelectedItem);
  const selectedItemId = useHorizonStore((state) => state.selectedItemId);

  const isSelected = selectedItemId === item.id;
  const hasConflict = item.conflictingFiles.length > 0;

  return (
    <Card
      variant="shaping"
      interactive
      className={cn(
        'relative transition-all duration-150',
        isSelected && 'ring-2 ring-zone-shaping'
      )}
      onClick={() => setSelectedItem(item.id)}
    >
      <CardContent className="p-3">
        {/* Header Row */}
        <div className="flex items-center justify-between mb-2">
          <RepoBadge repo={item.repo} />
          {hasConflict && (
            <span className="flex items-center gap-1 text-xs text-accent-amber">
              <span className="h-2 w-2 rounded-full bg-accent-amber" />
              Conflict
            </span>
          )}
        </div>

        {/* Title */}
        <h3 className="font-medium text-sm text-text-primary line-clamp-2 mb-2">
          {item.title}
        </h3>

        {/* Status */}
        <p className="text-xs text-text-muted">
          Planning agent ready to invoke
        </p>
      </CardContent>
    </Card>
  );
}
