'use client';

import { cn } from '@/lib/utils';
import { Dropdown } from '@/components/ui/dropdown';
import type { ConductorScore } from '@/types';

interface ConductorScorePillProps {
  score: ConductorScore;
}

/**
 * DESIGN.md §8.1 defines the score as five dimensions summing to 1000. None of
 * that reached the screen: the pill showed a bare `742` and its tooltip promised
 * a breakdown that no click could open, because the button had no handler.
 *
 * The breakdown is §8.2's "expanded card" without the sparklines — there is no
 * score history plumbed through the store yet, and a fake trend line is worse
 * than none. Each dimension states what it measures, because "Plan accuracy 162"
 * is only marginally more legible than "742".
 *
 * MAX IS 200 FOR ALL FIVE, not the 250/250/200/200/100 in §8.1. The spec's
 * weighting was never implemented: the schema defaults, `/api/score`, and the
 * clamps in the dispatch and orchestrator-complete routes all use 200 across the
 * board. Rendering the specced caps here put the seeded velocity trend at
 * `138 / 100`. §8.1 is annotated with the divergence; the flat weighting is the
 * behaviour, so it is what gets drawn.
 */
const dimensions: {
  key: keyof Pick<
    ConductorScore,
    | 'fleetUtilization'
    | 'runwayHealth'
    | 'planAccuracy'
    | 'costEfficiency'
    | 'velocityTrend'
  >;
  label: string;
  max: number;
  meaning: string;
}[] = [
  {
    key: 'fleetUtilization',
    label: 'Fleet utilization',
    max: 200,
    meaning: 'How much of your agent capacity is actually working',
  },
  {
    key: 'runwayHealth',
    label: 'Runway health',
    max: 200,
    meaning: 'Average runway you held over the session',
  },
  {
    key: 'planAccuracy',
    label: 'Plan accuracy',
    max: 200,
    meaning: 'How close plan estimates landed to actuals',
  },
  {
    key: 'costEfficiency',
    label: 'Cost efficiency',
    max: 200,
    meaning: 'Saving against an all-Sonnet baseline',
  },
  {
    key: 'velocityTrend',
    label: 'Velocity trend',
    max: 200,
    meaning: 'Whether your throughput is rising or falling',
  },
];

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
          aria-label={`Conductor score ${total} of 1000. Open breakdown.`}
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
          <span className="text-xs text-text-muted">/ 1000</span>
        </div>

        <div className="mt-3 space-y-2.5">
          {dimensions.map(({ key, label, max, meaning }) => {
            const value = score[key];
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
