import { describe, it, expect } from 'vitest';
import { formatScore } from '../../src/commands/status';

/**
 * How `devpilot status` prints the Conductor Score.
 *
 * This command once printed a score of 742 and a rank of #23 to everyone, from
 * string literals. The rules below are what stop the honest version drifting
 * back toward that: a partial total is never written against 1000, and a
 * dimension with no data is named rather than given a number.
 */

const dimension = (label: string, max: number, value: number | null, unmeasured: string | null = null) => ({
  key: label,
  label,
  meaning: '',
  max,
  value,
  unmeasured,
});

const partial = {
  total: 310,
  measuredMax: 450,
  max: 1000,
  complete: false,
  windowHours: 168,
  modelVersion: 2,
  dimensions: [
    dimension('Runway health', 250, 190),
    dimension('Fleet utilization', 200, 120),
    dimension('Plan accuracy', 200, null, 'Fewer than 3 tasks had both an estimate and an actual duration.'),
    dimension('Cost efficiency', 150, null, 'No spend was recorded.'),
    dimension('Velocity trend', 100, null, 'Fewer than 4 tasks completed in the window.'),
    dimension('Parallelization quality', 100, null, 'No plan had at least 2 timed tasks.'),
  ],
};

describe('devpilot status — the score', () => {
  it('writes a partial total against what was measured, never against 1000', () => {
    const lines = formatScore(partial);
    expect(lines[0]).toBe('Conductor Score: 310 of 450 measured (last 7 days) — 2 of 6 dimensions');
    expect(lines.join('\n')).not.toContain('1000');
    expect(lines.at(-1)).toContain('not comparable');
  });

  it('names each unmeasured dimension with its reason and gives it no number', () => {
    const lines = formatScore(partial);
    const accuracy = lines.find((l) => l.includes('Plan accuracy'))!;
    expect(accuracy).toContain('not measured — Fewer than 3 tasks');
    expect(accuracy).not.toMatch(/\d+ \/ 200/);
    expect(lines.find((l) => l.includes('Runway health'))).toMatch(/190 \/ 250/);
  });

  it('writes a complete score out of the full total', () => {
    const complete = {
      ...partial,
      total: 676,
      measuredMax: 1000,
      complete: true,
      dimensions: partial.dimensions.map((d) => ({ ...d, value: d.value ?? 50, unmeasured: null })),
    };
    const lines = formatScore(complete);
    expect(lines[0]).toBe('Conductor Score: 676 of 1000 (last 7 days)');
    expect(lines.join('\n')).not.toContain('not comparable');
  });

  it('prints no total when nothing was measured', () => {
    const nothing = {
      ...partial,
      total: 0,
      measuredMax: 0,
      dimensions: partial.dimensions.map((d) => ({ ...d, value: null, unmeasured: 'No data.' })),
    };
    const lines = formatScore(nothing);
    expect(lines[0]).toBe('Conductor Score: nothing measured yet (last 7 days)');
    expect(lines[0]).not.toMatch(/\d+ of/);
  });

  /**
   * A cockpit from before the score was computed sends a stored counter. That
   * number is not this quantity, and must not appear under the same heading.
   */
  it('prints nothing for the old row of counters', () => {
    const legacy = { total: 742, storedTotal: 792, breakdown: { runwayHealth: 100 }, leaderboardRank: 23 };
    expect(formatScore(legacy)).toEqual([]);
    expect(formatScore(null)).toEqual([]);
    expect(formatScore(undefined)).toEqual([]);
  });

  it('describes a window that is not a whole number of days in hours', () => {
    expect(formatScore({ ...partial, windowHours: 36 })[0]).toContain('(last 36 hours)');
    expect(formatScore({ ...partial, windowHours: 24 })[0]).toContain('(last 24 hours)');
  });
});
