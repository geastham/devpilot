'use client';

import { cn } from '@/lib/utils';
import { Dropdown } from '@/components/ui/dropdown';
import type { ConductorScore } from '@/types';
// Subpath import, NOT the barrel. This is a client component, and
// `@devpilot.sh/core` pulls better-sqlite3 and node:fs into the browser bundle.
import * as scoreModel from '@devpilot.sh/core/score';

interface ConductorScorePillProps {
  score: ConductorScore;
}

/**
 * The score breakdown — DESIGN.md §8.2's "expanded card", minus the sparklines.
 *
 * The pill showed a bare `742` and its tooltip promised a breakdown that no
 * click could open, because the button had no handler.
 *
 * Dimensions and maxima now come from `SCORE_MODEL` (TRD 16) rather than the
 * local table that used to live here. That table was one of four independent
 * copies of the maxima, and rendering it is what exposed the divergence: a
 * seeded `velocityTrend` of 138 drawn against a specified cap of 100.
 *
 * No sparklines: no score history is plumbed into the fleet store, and a
 * fabricated trend line is worse than none.
 */
export function ConductorScorePill({ score }: ConductorScorePillProps) {
  const { total } = score;

  // Determine score tier for styling
  const tier = total >= 800 ? 'high' : total >= 500 ? 'medium' : 'low';

  const tierStyles = {
    high: 'bg-gradient-to-r from-purple-600 to-purple-500 shadow-glow-purple',
    medium: 'bg-purple-700',
    low: 'bg-purple-900 text-accent-amber',
  };

  return (
    <Dropdown
      align="right"
      trigger={
        <button
          className={cn(
            'flex items-center gap-2 rounded-full px-3 py-1.5 transition-all',
            'hover:scale-105',
            tierStyles[tier]
          )}
          aria-label={`Conductor score ${total} of ${scoreModel.SCORE_TOTAL}. Open breakdown.`}
        >
          <span className="text-xs text-white/80">Score:</span>
          <span className="text-sm font-bold text-white">{total}</span>
        </button>
      }
    >
      <div className="w-[300px] p-4">
        <p className="text-sm font-semibold text-text-primary">
          Conductor Score
        </p>
        <p className="mt-0.5 text-xs text-text-secondary">
          Planning throughput — whether you are staying ahead of your own fleet.
        </p>

        <div className="mt-3 flex items-baseline gap-1.5">
          <span className="text-2xl font-bold tabular-nums text-text-primary">
            {total}
          </span>
          <span className="text-xs text-text-muted">/ {scoreModel.SCORE_TOTAL}</span>
        </div>

        <div className="mt-3 space-y-2.5">
          {scoreModel.SCORE_MODEL.map(({ key, label, max, meaning }) => {
            const value =
              (score as unknown as Record<string, number | undefined>)[key] ?? 0;
            const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;

            return (
              <div key={key}>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-xs text-text-primary">{label}</span>
                  <span className="shrink-0 text-xs tabular-nums text-text-secondary">
                    {Math.round(value)}
                    <span className="text-text-muted"> / {max}</span>
                  </span>
                </div>
                <div className="mt-1 h-1 overflow-hidden rounded-full bg-white/5">
                  <div
                    className="h-full rounded-full bg-accent-purple"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <p className="mt-1 text-xs leading-snug text-text-muted">
                  {meaning}
                </p>
              </div>
            );
          })}
        </div>

        <p className="mt-3 border-t border-border-default pt-2 text-xs leading-snug text-text-muted">
          800+ means your planning is comfortably ahead of the fleet.
          {score.leaderboardRank !== null &&
            ` Ranked #${score.leaderboardRank}.`}
        </p>
      </div>
    </Dropdown>
  );
}
