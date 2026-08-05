'use client';

import { useId } from 'react';
import { cn } from '@/lib/utils';

/**
 * Ambient backdrop for the cockpit shell.
 *
 * ATMOSPHERE, and the only thing in the motion language that is. Everything
 * else — the runway sweep, the idle pulses, the critical-path flow — encodes
 * fleet state. This encodes nothing, which is why it is confined to a layer
 * behind data and never over it, and why it moves on an 18-second cycle rather
 * than anything a peripheral eye would catch.
 *
 * The radar sweep is not arbitrary decoration either: the work horizon IS a
 * radar metaphor — near work on one side, fuzzy intent on the other — so a slow
 * sweep behind it is the metaphor made visible.
 *
 * Structure borrowed from NeuralBackdrop in the Neurograph admin: pure SVG with
 * no animation library, `pointer-events-none` so it can never eat a click, and
 * `useId()` for the gradient ids so two instances cannot collide. Reduced
 * motion is handled by the .dp-* guards in motion.css.
 */
export function CockpitBackdrop({
  className,
  withRadar = true,
}: {
  className?: string;
  /** The sweep belongs behind the horizon; other surfaces take the glow only. */
  withRadar?: boolean;
}) {
  const uid = useId().replace(/:/g, '');
  const glow = `dpGlow-${uid}`;
  const sweep = `dpSweep-${uid}`;
  const grid = `dpGrid-${uid}`;

  return (
    <div
      className={cn('pointer-events-none absolute inset-0 overflow-hidden', className)}
      aria-hidden="true"
    >
      {/* Two slow drifting pools of light. Offset phases so they never pulse in
          unison, which is what makes a gradient look like a loading state. */}
      <div
        className="dp-ambient absolute -left-[10%] -top-[20%] h-[45rem] w-[45rem] rounded-full blur-[140px]"
        style={{ background: 'radial-gradient(circle, rgba(56,189,248,0.10), transparent 70%)' }}
      />
      <div
        className="dp-ambient absolute -bottom-[25%] right-[-5%] h-[38rem] w-[38rem] rounded-full blur-[130px]"
        style={{
          background: 'radial-gradient(circle, rgba(52,211,153,0.07), transparent 70%)',
          animationDelay: '-9s',
        }}
      />

      <svg className="h-full w-full opacity-[0.5]" preserveAspectRatio="xMidYMid slice">
        <defs>
          <radialGradient id={glow}>
            <stop offset="0%" stopColor="#38BDF8" stopOpacity="0.16" />
            <stop offset="100%" stopColor="#38BDF8" stopOpacity="0" />
          </radialGradient>

          {/* The sweep arc: opaque at its leading edge, fading behind it, so it
              reads as something passing rather than a wedge spinning. */}
          <linearGradient id={sweep} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#38BDF8" stopOpacity="0" />
            <stop offset="100%" stopColor="#38BDF8" stopOpacity="0.20" />
          </linearGradient>

          <pattern id={grid} width="48" height="48" patternUnits="userSpaceOnUse">
            <path
              d="M 48 0 L 0 0 0 48"
              fill="none"
              stroke="rgba(148,163,184,0.05)"
              strokeWidth="1"
            />
          </pattern>
        </defs>

        <rect width="100%" height="100%" fill={`url(#${grid})`} />

        {withRadar && (
          <g className="dp-radar" style={{ transformOrigin: '50% 50%' }}>
            <path
              d="M 50% 50% L 50% 0% A 50% 50% 0 0 1 100% 50% Z"
              fill={`url(#${sweep})`}
              transform="translate(0,0)"
            />
          </g>
        )}

        <circle cx="50%" cy="50%" r="38%" fill="none" stroke="rgba(56,189,248,0.06)" strokeWidth="1" />
        <circle cx="50%" cy="50%" r="24%" fill="none" stroke="rgba(56,189,248,0.05)" strokeWidth="1" />
      </svg>
    </div>
  );
}
