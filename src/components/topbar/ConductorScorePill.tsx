'use client';

import { cn } from '@/lib/utils';
import { Dropdown } from '@/components/ui/dropdown';
import type { ConductorScore } from '@/types';

interface ConductorScorePillProps {
  score: ConductorScore;
}

const METHOD_URL =
  'https://github.com/devpilot-sh/devpilot-core/blob/main/docs/CONDUCTOR-SCORE.md';

function windowLabel(hours: number): string {
  if (hours <= 0) return '';
  if (hours % 24 === 0) {
    const days = hours / 24;
    return days === 1 ? 'the last 24 hours' : `the last ${days} days`;
  }
  return `the last ${hours} hours`;
}

/**
 * The score, and its working.
 *
 * WHAT THIS USED TO SHOW. A bare `742 / 1000` and five bars, read from a row of
 * counters that started every install on 500 points and added fifteen for each
 * completed task. No dimension was computed by its method, and a dimension
 * with no data behind it was drawn as a bar like any other.
 *
 * WHAT IT SHOWS NOW. The six dimensions as `/api/fleet/state` computed them
 * from recorded events, and for each one either its points or the sentence
 * saying why it could not be measured. Two rules it must not break:
 *
 * - The total is out of `measuredMax`, never out of 1000 unless every
 *   dimension was measured. "140 / 1000" would present four unmeasured
 *   dimensions as four zeros.
 * - An unmeasured dimension has no bar. An empty bar is a drawing of zero.
 *
 * No tier colours either. The pill used to glow at 800 and turn amber below
 * 500; a threshold on a partial total would colour the amount of data, and the
 * footer's "800+ means your planning is comfortably ahead" was not something
 * anybody had measured.
 */
export function ConductorScorePill({ score }: ConductorScorePillProps) {
  const { total, measuredMax, max, complete, dimensions } = score;
  const measured = dimensions.filter((d) => d.value !== null).length;
  const hasScore = measuredMax > 0;
  const period = windowLabel(score.windowHours);

  return (
    <Dropdown
      align="right"
      trigger={
        <button
          className={cn(
            'flex items-center gap-2 rounded-full px-3 py-1.5 transition-all',
            'hover:scale-105',
            hasScore ? 'bg-purple-700' : 'bg-white/5'
          )}
          aria-label={
            hasScore
              ? `Conductor score ${total} of ${measuredMax}${complete ? '' : ' measured'}. Open breakdown.`
              : 'Conductor score: nothing measured yet. Open breakdown.'
          }
        >
          <span className="text-xs text-white/80">Score:</span>
          {hasScore ? (
            <span className="text-sm font-bold tabular-nums text-white">
              {total}
              <span className="font-normal text-white/60"> / {measuredMax}</span>
            </span>
          ) : (
            <span className="text-sm font-bold text-white/60">—</span>
          )}
        </button>
      }
    >
      <div className="w-[320px] p-4">
        <p className="text-sm font-semibold text-text-primary">Conductor Score</p>
        <p className="mt-0.5 text-xs text-text-secondary">
          How the fleet was run{period ? ` over ${period}` : ''}, from what this
          cockpit recorded.
        </p>

        <div className="mt-3 flex items-baseline gap-1.5">
          <span className="text-2xl font-bold tabular-nums text-text-primary">
            {hasScore ? total : '—'}
          </span>
          {hasScore && (
            <span className="text-xs text-text-muted">
              of {measuredMax}
              {complete ? '' : ' measured'}
            </span>
          )}
        </div>
        <p className="mt-1 text-xs leading-snug text-text-muted">
          {dimensions.length === 0
            ? 'Not computed yet.'
            : complete
              ? `All ${dimensions.length} dimensions measured.`
              : `${measured} of ${dimensions.length} dimensions measured. The rest have no data yet and count for nothing — not for zero.`}
        </p>

        <div className="mt-3 space-y-2.5">
          {dimensions.map(({ key, label, max: dimensionMax, meaning, value, unmeasured }) => (
            <div key={key}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-xs text-text-primary">{label}</span>
                <span className="shrink-0 text-xs tabular-nums text-text-secondary">
                  {value === null ? (
                    <span className="text-text-muted">not measured</span>
                  ) : (
                    <>
                      {value}
                      <span className="text-text-muted"> / {dimensionMax}</span>
                    </>
                  )}
                </span>
              </div>
              {value !== null && (
                <div className="mt-1 h-1 overflow-hidden rounded-full bg-white/5">
                  <div
                    className="h-full rounded-full bg-accent-purple"
                    style={{ width: `${dimensionMax > 0 ? Math.min(100, (value / dimensionMax) * 100) : 0}%` }}
                  />
                </div>
              )}
              <p className="mt-1 text-xs leading-snug text-text-muted">
                {value === null ? (unmeasured ?? meaning) : meaning}
              </p>
            </div>
          ))}
        </div>

        <p className="mt-3 border-t border-border-default pt-2 text-xs leading-snug text-text-muted">
          {complete
            ? `Out of ${max}. `
            : 'A partial score is a personal reading; only one with every dimension measured can be compared with another. '}
          <a
            href={METHOD_URL}
            target="_blank"
            rel="noreferrer"
            className="underline hover:text-text-secondary"
          >
            How each dimension is computed
          </a>
          .
        </p>
      </div>
    </Dropdown>
  );
}
