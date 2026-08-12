'use client';

import { cn, formatHours, getRunwayStatusColor } from '@/lib/utils';
import { Tooltip } from '@/components/ui/tooltip';
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
 *
 * The value alone was not enough. "Runway: 3h 12m" tells a first-time reader
 * neither what is running down nor whether three hours is good, so the pill now
 * finishes the sentence — "before the fleet idles" — and the tooltip carries the
 * thresholds. The trailing clause is the fix; the tooltip is the footnote.
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
    <Tooltip
      label="Runway — how long the READY queue lasts at the fleet's current velocity."
      detail="Amber under 4h, red under 2h. Below that the fleet finishes work faster than you can spec it."
    >
      {/* Two lines rather than one long row. Spelling the meaning out inline —
          "Runway: 3h 12m ● before the fleet idles" — pushed the pill past 240px
          and clipped the first fleet pill off the centre of the top bar. Stacked
          under the value the same words cost about 140px, and the caption reads
          as a unit label instead of a trailing aside. */}
      <div
        className={cn(
          // `relative` + `overflow-hidden` contain the ::after sweep; without the
          // clip it runs across the whole top bar.
          'dp-sweep relative flex flex-col justify-center overflow-hidden rounded-lg px-3 py-0.5',
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
        aria-label={`Runway ${formatHours(hours)} before the fleet idles, ${status}`}
        tabIndex={0}
      >
        <span className="flex items-center gap-2 leading-tight">
          <span className="text-xs text-text-secondary">Runway</span>
          <span className={cn('text-sm font-bold tabular-nums', colorClass)}>
            {formatHours(hours)}
          </span>
          <span className={cn('h-2 w-2 rounded-full', dot, pulse)} />
        </span>
        <span className="text-xs leading-tight text-text-muted">
          before the fleet idles
        </span>
      </div>
    </Tooltip>
  );
}
