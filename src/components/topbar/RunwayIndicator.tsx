'use client';

import { cn, formatHours, getRunwayStatusColor } from '@/lib/utils';
import type { RunwayStatus } from '@/types';

interface RunwayIndicatorProps {
  hours: number;
  status: RunwayStatus;
}

/**
 * Runway — how long the READY queue lasts at current fleet velocity.
 *
 * The single most important number on the screen, and it was static text. This
 * is the instrument a conductor glances at to decide whether to stop what they
 * are doing and go write a spec, so it should feel like it is running down.
 *
 * The sweep RATE is the signal: four seconds when healthy, two at amber, one
 * when critical. A conductor learns "faster means worse" without being told,
 * and it reads from across a room. Colour and the number itself carry the same
 * information, so reduced-motion loses urgency, never meaning (DESIGN.md §2.2:
 * "Amber < 4h. Red < 2h").
 */
export function RunwayIndicator({ hours, status }: RunwayIndicatorProps) {
  const colorClass = getRunwayStatusColor(status);

  const { dot, sweepColor, sweepDuration, pulse } = {
    healthy: {
      dot: 'bg-accent-green',
      sweepColor: 'rgb(52 211 153 / 0.10)',
      sweepDuration: '4.5s',
      pulse: '',
    },
    amber: {
      dot: 'bg-accent-amber',
      sweepColor: 'rgb(251 191 36 / 0.16)',
      sweepDuration: '2.2s',
      pulse: 'dp-pulse-warn',
    },
    critical: {
      dot: 'bg-accent-red',
      sweepColor: 'rgb(248 113 113 / 0.22)',
      sweepDuration: '1.1s',
      pulse: 'dp-pulse-urgent',
    },
  }[status];

  return (
    <div
      className={cn(
        // `relative` + `overflow-hidden` contain the ::after sweep; without the
        // clip it runs across the whole top bar.
        'dp-sweep relative flex items-center gap-2 overflow-hidden rounded-lg px-3 py-1.5',
        status === 'critical' && 'bg-accent-red/10',
        status === 'amber' && 'bg-accent-amber/10'
      )}
      style={
        {
          '--dp-sweep-color': sweepColor,
          '--dp-sweep-duration': sweepDuration,
        } as React.CSSProperties
      }
      // The number is announced; the animation is decoration on top of it.
      aria-label={`Runway ${formatHours(hours)}, ${status}`}
    >
      <span className="text-xs text-text-secondary">Runway:</span>
      <span className={cn('text-sm font-bold tabular-nums', colorClass)}>
        {formatHours(hours)}
      </span>
      <span className={cn('h-2 w-2 rounded-full', dot, pulse)} />
    </div>
  );
}
