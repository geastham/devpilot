'use client';

import { cn } from '@/lib/utils';

interface TooltipProps {
  /** One line: what this instrument measures. */
  label: string;
  /** Optional second line: thresholds, or what "good" looks like. */
  detail?: string;
  align?: 'left' | 'right' | 'center';
  children: React.ReactNode;
  className?: string;
}

/**
 * A one-line explanation attached to an instrument.
 *
 * The cockpit's headline numbers — Runway, Score — were bare values. A reader
 * who does not already know the product cannot tell what they measure or what
 * good looks like, which is the single biggest comprehension complaint about
 * this screen.
 *
 * Deliberately CSS-only (`group-hover` / `group-focus-within`) rather than a
 * stateful popover: it opens on keyboard focus as well as hover, it cannot get
 * stuck open, and it costs no render. It is a *supplement* — every instrument
 * also carries a visible caption, because a tooltip nobody hovers explains
 * nothing.
 */
export function Tooltip({
  label,
  detail,
  align = 'left',
  children,
  className,
}: TooltipProps) {
  return (
    <span className={cn('group/tip relative inline-flex', className)}>
      {children}
      <span
        role="tooltip"
        className={cn(
          'pointer-events-none absolute top-full z-[60] mt-2 w-max max-w-[260px]',
          'rounded-lg border border-border-default bg-bg-surface px-3 py-2 shadow-panel',
          'invisible opacity-0 transition-opacity duration-150',
          'group-hover/tip:visible group-hover/tip:opacity-100',
          'group-focus-within/tip:visible group-focus-within/tip:opacity-100',
          align === 'right' && 'right-0',
          align === 'left' && 'left-0',
          align === 'center' && 'left-1/2 -translate-x-1/2'
        )}
      >
        <span className="block text-xs leading-relaxed text-text-primary">
          {label}
        </span>
        {detail && (
          <span className="mt-1 block text-xs leading-relaxed text-text-secondary">
            {detail}
          </span>
        )}
      </span>
    </span>
  );
}
