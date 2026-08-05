'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

/**
 * Boot sequence — the compass settling.
 *
 * The cockpit previously mounted into a blank dark screen while the stores
 * hydrated and the first fetches landed. That gap is short but it is the first
 * impression, and an empty rectangle reads as broken rather than loading.
 *
 * The mark is the DevPilot compass, drawn as vector so it stays crisp: the ring
 * draws itself, then the four-point star settles into place. It is a settling,
 * not a spinner — a spinner says "waiting indefinitely", and this is an
 * instrument coming online.
 *
 * DISMISSAL IS TIME-BOXED, not tied to data. Gating on "everything loaded"
 * risks an overlay that never leaves if one fetch hangs, which turns a cosmetic
 * flourish into a hard outage. It fades on a timer and whatever is underneath
 * shows through — including an error state, which is exactly what someone
 * debugging a broken cockpit needs to see.
 */
export function BootSequence({ durationMs = 1100 }: { durationMs?: number }) {
  const [phase, setPhase] = useState<'in' | 'out' | 'gone'>('in');

  useEffect(() => {
    // Honour reduced motion by skipping straight past the sequence — a person
    // who asked for less motion should not be shown a boot animation first.
    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      setPhase('gone');
      return;
    }

    const out = setTimeout(() => setPhase('out'), durationMs);
    const gone = setTimeout(() => setPhase('gone'), durationMs + 420);
    return () => {
      clearTimeout(out);
      clearTimeout(gone);
    };
  }, [durationMs]);

  if (phase === 'gone') return null;

  return (
    <div
      className={cn(
        'fixed inset-0 z-[100] flex items-center justify-center bg-bg-base transition-opacity duration-[400ms]',
        phase === 'out' ? 'pointer-events-none opacity-0' : 'opacity-100'
      )}
      aria-hidden="true"
    >
      <div className="flex flex-col items-center gap-6">
        <svg width="72" height="72" viewBox="0 0 64 64" className="overflow-visible">
          {/* Rings draw themselves via dashoffset — the same trick the critical
              path uses, so the visual vocabulary is consistent from the first
              second of the app. */}
          <circle
            cx="32"
            cy="32"
            r="19.5"
            fill="none"
            stroke="rgba(56,189,248,0.35)"
            strokeWidth="1.5"
            strokeDasharray="123"
            strokeDashoffset="123"
            style={{ animation: 'dp-boot-draw 700ms cubic-bezier(0.215,0.61,0.355,1) forwards' }}
          />
          <circle
            cx="32"
            cy="32"
            r="13"
            fill="none"
            stroke="rgba(56,189,248,0.55)"
            strokeWidth="1.5"
            strokeDasharray="82"
            strokeDashoffset="82"
            style={{ animation: 'dp-boot-draw 700ms 120ms cubic-bezier(0.215,0.61,0.355,1) forwards' }}
          />
          <path
            d="M32 3 L36 28 L61 32 L36 36 L32 61 L28 36 L3 32 L28 28 Z"
            fill="#67E8F9"
            style={{
              transformOrigin: '32px 32px',
              animation: 'dp-boot-settle 620ms 220ms cubic-bezier(0.175,0.885,0.32,1.275) both',
            }}
          />
        </svg>

        <p
          className="text-xs uppercase tracking-[0.3em] text-text-muted"
          style={{ animation: 'dp-boot-fade 500ms 480ms ease-out both' }}
        >
          Cockpit online
        </p>
      </div>
    </div>
  );
}
