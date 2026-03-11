'use client';

import { cn, formatHours, getRunwayStatusColor } from '@/lib/utils';
import type { RunwayStatus } from '@/types';

interface RunwayIndicatorProps {
  hours: number;
  status: RunwayStatus;
}

export function RunwayIndicator({ hours, status }: RunwayIndicatorProps) {
  const colorClass = getRunwayStatusColor(status);
  const dotColor = {
    healthy: 'bg-accent-green',
    amber: 'bg-accent-amber animate-pulse-dot',
    critical: 'bg-accent-red animate-pulse-dot',
  }[status];

  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-lg px-3 py-1.5',
        status === 'critical' && 'bg-accent-red/10',
        status === 'amber' && 'bg-accent-amber/10'
      )}
    >
      <span className="text-xs text-text-secondary">Runway:</span>
      <span className={cn('text-sm font-bold', colorClass)}>
        {formatHours(hours)}
      </span>
      <span className={cn('h-2 w-2 rounded-full', dotColor)} />
    </div>
  );
}
