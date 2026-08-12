'use client';

import { ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * The Work Horizon is a queue that runs RIGHT TO LEFT — a thought captured at
 * the far right acquires structure until it is dispatchable at the far left
 * (DESIGN.md §2.1). Nothing on the screen said so. Four columns of jargon sat
 * side by side with no indication that they were one pipeline rather than four
 * unrelated lists, and the one direction cue that did exist — READY being the
 * widest column — reads as importance, not as flow.
 *
 * This is the missing sentence, and it is deliberately a sentence rather than
 * another animation: the direction has to be legible in a screenshot.
 */
export function HorizonFlowRail({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'flex shrink-0 items-center gap-3 border-b border-border-default bg-bg-panel/60 px-4 py-1.5',
        className
      )}
    >
      {/* Left end: where work leaves the horizon. The arrow points at the Fleet
          Status panel, which is what READY actually feeds. */}
      <span className="flex shrink-0 items-center gap-1.5 text-xs font-medium text-text-secondary">
        <ArrowLeft className="h-3 w-3" strokeWidth={2} aria-hidden />
        dispatched to the fleet
      </span>

      {/* The track brightens toward the left — the direction of travel. */}
      <span
        className="h-px flex-1 bg-gradient-to-l from-white/5 to-white/20"
        aria-hidden
      />

      <span className="hidden shrink-0 text-xs text-text-muted xl:inline">
        work moves left as it gets more specced
      </span>

      <span
        className="hidden h-px flex-1 bg-gradient-to-l from-transparent to-white/5 xl:inline-block"
        aria-hidden
      />

      <span className="shrink-0 text-xs text-text-secondary">
        new ideas enter here
      </span>
    </div>
  );
}
