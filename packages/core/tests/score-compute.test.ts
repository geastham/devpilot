import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  SCORE_DIMENSIONS,
  SCORE_MODEL,
  SCORE_MODEL_VERSION,
  SCORE_TOTAL,
  scoreModelIsValid,
  type ScoreDimensionKey,
} from '../src/score/model';
import {
  DEFAULT_RECENT_FRACTION,
  MIN_COMPLETIONS_FOR_TREND,
  MIN_RUNWAY_COVERED_MINUTES,
  MIN_RUNWAY_SAMPLES,
  MIN_TASKS_FOR_ACCURACY,
  MIN_TASKS_FOR_PARALLELIZATION,
  RUNWAY_SAMPLE_MAX_HOLD_MINUTES,
  RUNWAY_TARGET_HOURS,
  WORKING_BREAK_MINUTES,
  computeCostEfficiency,
  computeFleetUtilization,
  computeParallelizationQuality,
  computePlanAccuracy,
  computeRunwayHealth,
  computeScore,
  computeVelocityTrend,
  measurePlanParallelization,
  type DimensionResult,
  type ExecutedTask,
  type ScoreInput,
  type ScoreResult,
  type SessionInterval,
} from '../src/score/compute';

/**
 * TRD 16 — the six dimension methods.
 *
 * Every expected number in this file was worked out by hand and the working is
 * in the comment beside it. That is deliberate: a test that derives its
 * expectation by calling the code under test proves the code agrees with
 * itself. The score is a public number; these are its public worked examples.
 *
 * Each test states, in plain language, the property it holds.
 */

// A realistic epoch base so the arithmetic is exercised at the magnitudes it
// will actually see (≈1.8e12 ms), not at toy values near zero.
const T0 = Date.UTC(2026, 8, 1, 9, 0, 0);
const H = 3_600_000;
const MIN = 60_000;
/** `n` hours after the base, in epoch ms. */
const h = (n: number) => T0 + n * H;
/** `n` minutes after the base, in epoch ms. */
const m = (n: number) => T0 + n * MIN;
/**
 * A runway reading every ten minutes from `fromMin` to `toMin` inclusive, all
 * at `runwayHours` — what a cockpit that was running for that stretch records.
 * Ten minutes is inside the fifteen-minute hold, so the stretch is covered
 * without a gap.
 */
const readings = (fromMin: number, toMin: number, runwayHours: number) => {
  const out: { at: number; runwayHours: number }[] = [];
  for (let t = fromMin; t <= toMin; t += 10) out.push({ at: m(t), runwayHours });
  return out;
};

/**
 * The invariants every DimensionResult must hold, measured or not. Run against
 * every result in this file: this is the "NaN can never escape" guarantee.
 */
function expectWellFormed(result: DimensionResult): void {
  const { max } = SCORE_DIMENSIONS[result.key];
  expect(result.max).toBe(max);

  if (result.value === null) {
    // Unmeasured: no value, no ratio, and a reason a person can read.
    expect(result.ratio).toBeNull();
    expect(typeof result.unmeasured).toBe('string');
    expect(result.unmeasured!.length).toBeGreaterThan(10);
  } else {
    expect(result.unmeasured).toBeNull();
    expect(Number.isFinite(result.value)).toBe(true);
    expect(Number.isInteger(result.value)).toBe(true);
    expect(result.value).toBeGreaterThanOrEqual(0);
    expect(result.value).toBeLessThanOrEqual(max);
    expect(Number.isFinite(result.ratio)).toBe(true);
    expect(result.ratio!).toBeGreaterThanOrEqual(0);
    expect(result.ratio!).toBeLessThanOrEqual(1);
  }

  for (const [name, v] of Object.entries(result.basis)) {
    if (typeof v === 'number') {
      expect(Number.isFinite(v), `basis.${name} must be finite`).toBe(true);
    } else {
      expect(v === null || typeof v === 'string', `basis.${name} must be plain`).toBe(true);
    }
  }
  // Serialisable: survives a JSON round trip unchanged (NaN would become null).
  expect(JSON.parse(JSON.stringify(result))).toEqual(result);
}

/** Assert a dimension is unmeasured — null, never 0 and never full marks. */
function expectUnmeasured(result: DimensionResult): void {
  expectWellFormed(result);
  expect(result.value).toBeNull();
  expect(result.ratio).toBeNull();
  expect(result.unmeasured).not.toBeNull();
}

/** Assert a dimension is measured at a given whole-point value. */
function expectValue(result: DimensionResult, value: number): void {
  expectWellFormed(result);
  expect(result.unmeasured).toBeNull();
  expect(result.value).toBe(value);
}

// ============================================================================
// Runway health
// ============================================================================

describe('runwayHealth — time-weighted runway against the 4h amber line', () => {
  const window = { from: h(0), to: h(10) };

  /** The worked example's readings: 2h, then 8h, then 1h of runway. */
  const worked = [...readings(10, 20, 2), ...readings(30, 40, 8), ...readings(50, 70, 1)];

  it('matches the hand-worked example', () => {
    // A reading every ten minutes: 2h of runway at t=10 and 20, 8h at t=30 and
    // 40, 1h at t=50, 60 and 70. The window ends at t=90, and a reading holds
    // for at most 15 minutes.
    //   t 10→30 (20m): min(1, 2/4) = 0.50  → 0.50 × 20 = 10.00
    //   t 30→50 (20m): min(1, 8/4) = 1.00  → 1.00 × 20 = 20.00
    //   t 50→70 (20m): min(1, 1/4) = 0.25  → 0.25 × 20 =  5.00
    //   t 70→90 (20m): the last reading holds 15m    → 0.25 × 15 =  3.75   (5m unobserved)
    // Covered time = 75m (the first ten minutes have no sample).
    // ratio = 38.75 / 75 = 0.51667 → × 250 = 129.17 → 129.
    const result = computeRunwayHealth({ window: { from: m(0), to: m(90) }, samples: worked });
    expectValue(result, 129);
    expect(result.ratio).toBeCloseTo(38.75 / 75, 12);
    expect(result.basis.samples).toBe(7);
    expect(result.basis.coveredHours).toBeCloseTo(75 / 60, 9);
    // Uncapped mean, for the UI: (2×20 + 8×20 + 1×35) / 75 = 3.1333h.
    expect(result.basis.meanRunwayHours).toBeCloseTo(235 / 75, 9);
    expect(result.basis.unobservedHours).toBeCloseTo(5 / 60, 9);
    expect(result.basis.maxHoldMinutes).toBe(RUNWAY_SAMPLE_MAX_HOLD_MINUTES);
    expect(result.basis.targetHours).toBe(RUNWAY_TARGET_HOURS);
  });

  it('excludes time before the first sample instead of counting it as empty', () => {
    // Property: nobody was looking before the first sample, so that time is not
    // known to have been zero. Widening the window backwards changes nothing.
    const narrow = computeRunwayHealth({ window: { from: m(0), to: m(90) }, samples: worked });
    const wide = computeRunwayHealth({ window: { from: h(-500), to: m(90) }, samples: worked });
    expect(narrow.ratio).not.toBeNull();
    expect(wide.ratio).toBeCloseTo(narrow.ratio!, 12);
    expect(wide.value).toBe(narrow.value);
    // Had the 10 uncovered minutes counted as zero it would be 38.75 / 85 = 0.456.
    expect(narrow.ratio).not.toBeCloseTo(38.75 / 85, 3);
  });

  it('does not credit a full queue for a night nobody was measuring', () => {
    // Property: when the readings stop, the last one is not carried across the
    // gap. A full queue is read every ten minutes for an hour and the cockpit
    // is closed; nine hours into the window it is opened to an empty queue,
    // which is read every ten minutes until the window ends at ten hours.
    //   0:00 → 1:00  (60m) × 1.0
    //   1:00 → 1:15  (15m) × 1.0   the last reading's hold; then 7h45 unobserved
    //   9:00 → 10:00 (60m) × 0.0
    // ratio = 75 / 135 = 0.5556 → 138.89 → 139. Carried across the gap, the
    // full queue would be credited for nine hours of ten: 0.9 → 225.
    const result = computeRunwayHealth({
      window,
      samples: [...readings(0, 60, 4), ...readings(540, 600, 0)],
    });
    expectValue(result, 139);
    expect(result.ratio).toBeCloseTo(75 / 135, 12);
    expect(result.basis.coveredHours).toBeCloseTo(135 / 60, 9);
    expect(result.basis.unobservedHours).toBeCloseTo(465 / 60, 9);
  });

  it('is unchanged by a gap of exactly the hold, and loses only the excess of a longer one', () => {
    // Property: the limit is a cap on each hold, not a cliff. An hour of
    // readings, then one more reading `gap` minutes later, where the window ends.
    const at = (gapMinutes: number) =>
      computeRunwayHealth({
        window: { from: m(0), to: m(60 + gapMinutes) },
        samples: [...readings(0, 60, 2), { at: m(60 + gapMinutes), runwayHours: 2 }],
      });
    expect(at(RUNWAY_SAMPLE_MAX_HOLD_MINUTES).basis.unobservedHours).toBe(0);
    expect(at(RUNWAY_SAMPLE_MAX_HOLD_MINUTES + 6).basis.unobservedHours).toBeCloseTo(0.1, 9);
    expect(at(RUNWAY_SAMPLE_MAX_HOLD_MINUTES + 6).basis.coveredHours).toBeCloseTo(1.25, 9);
  });

  it('says nothing until an hour of readings has been taken', () => {
    // Property: two readings a minute apart describe a minute. Run against a
    // real cockpit for the first time, this dimension reported 94 of 250 from
    // forty-eight seconds of data.
    expect(MIN_RUNWAY_COVERED_MINUTES).toBe(60);
    const short = computeRunwayHealth({ window, samples: readings(0, 40, 6) });
    expectUnmeasured(short);
    expect(short.unmeasured).toContain('55 minutes');
    expect(short.basis.coveredHours).toBeCloseTo(55 / 60, 9);
    // Forty-five minutes of readings and the last one's fifteen-minute hold.
    expectValue(computeRunwayHealth({ window, samples: readings(0, 50, 6) }), 250);
  });

  it('gives full marks for runway held at the threshold, and no more for far above it', () => {
    // Property: clamped at the top. 40h of queue is not ten times healthier than 4h.
    const at = (runwayHours: number) =>
      computeRunwayHealth({ window, samples: readings(0, 60, runwayHours) });
    expectValue(at(4), 250);
    expectValue(at(40), 250);
    expectValue(at(1e12), 250);
    expect(at(40).ratio).toBe(1);
  });

  it('scores an empty queue as a measured zero, not as unmeasured', () => {
    // Property: clamped at the bottom, and zero is a real reading. A negative
    // runway is read as empty rather than as worse-than-empty.
    const empty = computeRunwayHealth({ window, samples: readings(0, 60, 0) });
    expectValue(empty, 0);
    const negative = computeRunwayHealth({
      window,
      samples: [...readings(0, 30, -3), ...readings(40, 60, -1e9)],
    });
    expectValue(negative, 0);
    expect(negative.basis.meanRunwayHours).toBe(0);
  });

  it('does not depend on the order the samples arrive in', () => {
    // Property: a score must not change because a query lost its ORDER BY.
    const shuffled = [worked[5], worked[0], worked[6], worked[2], worked[1], worked[4], worked[3]];
    const inOrder = computeRunwayHealth({ window, samples: worked });
    expect(inOrder.value).not.toBeNull();
    expect(computeRunwayHealth({ window, samples: shuffled })).toEqual(inOrder);
  });

  it('ignores samples outside the window, including one still "holding" from before it', () => {
    // Property: a reading taken before the window is not carried into it.
    const inside = [...readings(120, 150, 2), ...readings(160, 190, 8)];
    const withOutside = [
      { at: h(-1), runwayHours: 100 },
      ...inside,
      { at: h(11), runwayHours: 100 },
    ];
    const a = computeRunwayHealth({ window, samples: inside });
    const b = computeRunwayHealth({ window, samples: withOutside });
    expect(a.ratio).not.toBeNull();
    expect(b.ratio).toBeCloseTo(a.ratio!, 12);
    expect(b.basis.samples).toBe(8);
  });

  it('drops non-finite samples and says how many', () => {
    const result = computeRunwayHealth({
      window,
      samples: [
        ...readings(0, 60, 4),
        { at: h(3), runwayHours: NaN },
        { at: Infinity, runwayHours: 4 },
        { at: h(5), runwayHours: Infinity },
      ],
    });
    expectValue(result, 250);
    expect(result.basis.samples).toBe(7);
    expect(result.basis.droppedSamples).toBe(3);
  });

  it.each([
    ['no samples at all', []],
    ['a single sample', [{ at: h(1), runwayHours: 6 }]],
    [
      'two samples, both outside the window',
      [
        { at: h(-2), runwayHours: 6 },
        { at: h(12), runwayHours: 6 },
      ],
    ],
    [
      'two samples, only one inside the window',
      [
        { at: h(-2), runwayHours: 6 },
        { at: h(3), runwayHours: 6 },
      ],
    ],
    [
      'every sample at the very end of the window (zero covered time)',
      [
        { at: h(10), runwayHours: 6 },
        { at: h(10), runwayHours: 6 },
      ],
    ],
  ])('is unmeasured with %s', (_label, samples) => {
    // Property: a single reading says nothing about consistency. Not zero, not 250.
    expectUnmeasured(computeRunwayHealth({ window, samples }));
  });

  it.each([
    ['zero-length', { from: h(5), to: h(5) }],
    ['inverted', { from: h(5), to: h(1) }],
    ['NaN start', { from: NaN, to: h(5) }],
    ['infinite end', { from: h(0), to: Infinity }],
  ])('is unmeasured, not NaN, for a %s window', (_label, badWindow) => {
    expectUnmeasured(
      computeRunwayHealth({
        window: badWindow,
        samples: [
          { at: h(5), runwayHours: 6 },
          { at: h(5), runwayHours: 6 },
        ],
      })
    );
  });

  it('refuses a window whose length overflows, by name', () => {
    // Both bounds are finite; their difference is not.
    const result = computeRunwayHealth({
      window: { from: -1e308, to: 1e308 },
      samples: [
        { at: -1e308, runwayHours: 6 },
        { at: 0, runwayHours: 6 },
      ],
    });
    expectUnmeasured(result);
    expect(result.unmeasured).toMatch(/too long/);
  });

  it('needs exactly the documented minimum of samples', () => {
    expect(MIN_RUNWAY_SAMPLES).toBe(2);
  });
});

// ============================================================================
// Fleet utilization
// ============================================================================

describe('fleetUtilization — a ratio over the working span, never a count', () => {
  const window = { from: h(0), to: h(10) };

  it('matches the hand-worked example', () => {
    // Capacity 2. Sessions: 1h→5h, 3h→7h, and one from 6h still running (→10h).
    // Working span: 1h → 10h = 9h. Active count by stretch:
    //   1→3  (2h): 1 active → 0.5 × 2 = 1.0
    //   3→5  (2h): 2 active → 1.0 × 2 = 2.0
    //   5→6  (1h): 1 active → 0.5 × 1 = 0.5
    //   6→7  (1h): 2 active → 1.0 × 1 = 1.0
    //   7→10 (3h): 1 active → 0.5 × 3 = 1.5
    // ratio = 6.0 / 9 = 0.6667 → × 200 = 133.33 → 133.
    const result = computeFleetUtilization({
      window,
      capacity: 2,
      sessions: [
        { start: h(1), end: h(5) },
        { start: h(3), end: h(7) },
        { start: h(6), end: null },
      ],
    });
    expectValue(result, 133);
    expect(result.ratio).toBeCloseTo(2 / 3, 12);
    expect(result.basis.workingSpanHours).toBeCloseTo(9, 9);
    // Session-hours: 4 + 4 + 4 = 12 over 9h → 1.333 running on average.
    expect(result.basis.meanActiveSessions).toBeCloseTo(12 / 9, 9);
    expect(result.basis.peakActiveSessions).toBe(2);
    expect(result.basis.sessions).toBe(3);
  });

  it('is unchanged when the fleet and the work both double', () => {
    // THE invariant (TRD 16 §3.1): it is a ratio. Twice the agents doing twice
    // the work is not better conducting, and must not score higher.
    const sessions: SessionInterval[] = [
      { start: h(1), end: h(5) },
      { start: h(3), end: h(7) },
      { start: h(6), end: null },
    ];
    for (const scale of [2, 3, 8]) {
      const scaled = Array.from({ length: scale }, () => sessions).flat();
      const base = computeFleetUtilization({ window, capacity: 2, sessions });
      const bigger = computeFleetUtilization({ window, capacity: 2 * scale, sessions: scaled });
      expect(bigger.ratio).toBeCloseTo(base.ratio!, 12);
      expect(bigger.value).toBe(base.value);
    }
  });

  it('never rises when capacity grows and the work stays the same', () => {
    // Property: unused capacity lowers the ratio. Buying agents cannot buy points.
    const sessions = [
      { start: h(1), end: h(5) },
      { start: h(3), end: h(7) },
    ];
    let previous = Infinity;
    for (const capacity of [1, 2, 3, 4, 8, 16, 64]) {
      const result = computeFleetUtilization({ window, capacity, sessions });
      expectWellFormed(result);
      expect(result.ratio!).toBeLessThanOrEqual(previous);
      previous = result.ratio!;
    }
    // Span 1→7 = 6h, 8 session-hours, never more than 2 at once.
    // capacity 16: 8 / 16 / 6 = 0.0833 → 17.
    expectValue(computeFleetUtilization({ window, capacity: 16, sessions }), 17);
  });

  it('averages over the working span, not the whole window', () => {
    // Property: nothing dispatched before the first start or after the last end
    // is not idle capacity. One busy hour in a 1000-hour window is still 100%.
    const result = computeFleetUtilization({
      window: { from: h(0), to: h(1000) },
      capacity: 1,
      sessions: [{ start: h(400), end: h(401) }],
    });
    expectValue(result, 200);
    expect(result.basis.workingSpanHours).toBeCloseTo(1, 9);
    expect(result.basis.windowHours).toBeCloseTo(1000, 9);
  });

  it('does count a short gap between sessions as idle', () => {
    // Property: the minutes between one task finishing and the next starting
    // are exactly what the dimension marks down. Twenty minutes working,
    // twenty with nothing running, twenty working: 40 / 60 → 133.33 → 133.
    const result = computeFleetUtilization({
      window,
      capacity: 1,
      sessions: [
        { start: m(0), end: m(20) },
        { start: m(40), end: m(60) },
      ],
    });
    expectValue(result, 133);
    expect(result.basis.workingSpanHours).toBeCloseTo(1, 9);
    expect(result.basis.breaksExcluded).toBe(0);
  });

  it('leaves a long gap out instead of scoring the length of somebody’s evening', () => {
    // Property: nothing running for longer than a break is not idle capacity.
    // An hour of work, eight hours away, an hour of work: the fleet was full
    // for both hours it was being worked. 2 / 2 → 200. Counted as idle, the
    // same two hours would be 2 / 10 → 40 — and would fall further the longer
    // the window the score happened to be computed over.
    const result = computeFleetUtilization({
      window,
      capacity: 1,
      sessions: [
        { start: h(0), end: h(1) },
        { start: h(9), end: h(10) },
      ],
    });
    expectValue(result, 200);
    expect(result.basis.workingSpanHours).toBeCloseTo(2, 9);
    expect(result.basis.breaksExcluded).toBe(1);
    expect(result.basis.breakHoursExcluded).toBeCloseTo(8, 9);
    expect(result.basis.breakMinutes).toBe(WORKING_BREAK_MINUTES);
  });

  it('draws the line at thirty minutes, and takes a gap whole on either side of it', () => {
    // Property: a gap at the line is idle in full; one past it is left out in
    // full, not just the part past the line.
    const withGap = (minutes: number) =>
      computeFleetUtilization({
        window,
        capacity: 1,
        sessions: [
          { start: m(0), end: m(30) },
          { start: m(30 + minutes), end: m(60 + minutes) },
        ],
      });
    // 60 working minutes over a 90-minute span: 0.6667 → 133.
    const atLine = withGap(WORKING_BREAK_MINUTES);
    expectValue(atLine, 133);
    expect(atLine.basis.breaksExcluded).toBe(0);
    // One minute more and the gap is a break: 60 over 60 → 200.
    const pastLine = withGap(WORKING_BREAK_MINUTES + 1);
    expectValue(pastLine, 200);
    expect(pastLine.basis.breaksExcluded).toBe(1);
    expect(pastLine.basis.workingSpanHours).toBeCloseTo(1, 9);
  });

  it('does not treat a quiet stretch as a break while anything is still running', () => {
    // Property: a break is nothing running at all. One session running alone
    // for five hours on four slots is a fleet three-quarters empty, not a
    // break: 1/4 → 50.
    const result = computeFleetUtilization({
      window,
      capacity: 4,
      sessions: [{ start: h(0), end: h(5) }],
    });
    expectValue(result, 50);
    expect(result.basis.breaksExcluded).toBe(0);
  });

  it('clamps at full marks when more sessions run than capacity declares', () => {
    // Property: over-subscription earns nothing extra.
    const result = computeFleetUtilization({
      window,
      capacity: 2,
      sessions: [
        { start: h(0), end: h(4) },
        { start: h(0), end: h(4) },
        { start: h(0), end: h(4) },
        { start: h(0), end: h(4) },
      ],
    });
    expectValue(result, 200);
    expect(result.ratio).toBe(1);
    expect(result.basis.peakActiveSessions).toBe(4);
  });

  it('does not let an over-subscribed stretch pay for an idle one', () => {
    // Property: the cap applies at each moment, not to the average. Capacity 2.
    // Four sessions 0→20m (twice capacity), nothing for 20m, one session 40→60m.
    //   0→20  (20m): min(1, 4/2) = 1.0 → 20
    //   20→40 (20m): nothing running   →  0
    //   40→60 (20m): min(1, 1/2) = 0.5 → 10
    // ratio = 30 / 60 = 0.5 → 100. (Uncapped, the first stretch would count 40
    // and the answer would be 50 / 60 = 0.83 → 167.)
    const result = computeFleetUtilization({
      window,
      capacity: 2,
      sessions: [
        { start: m(0), end: m(20) },
        { start: m(0), end: m(20) },
        { start: m(0), end: m(20) },
        { start: m(0), end: m(20) },
        { start: m(40), end: m(60) },
      ],
    });
    expectValue(result, 100);
    expect(result.ratio).toBeCloseTo(0.5, 12);
    // The uncapped mean is still reported, as session-time over the span:
    // (4 × 20 + 1 × 20) / 60 = 1.667 sessions.
    expect(result.basis.meanActiveSessions).toBeCloseTo(100 / 60, 12);
  });

  it('treats a still-running session as running to the end of the window', () => {
    const open = computeFleetUtilization({
      window,
      capacity: 1,
      sessions: [{ start: h(2), end: null }],
    });
    const closed = computeFleetUtilization({
      window,
      capacity: 1,
      sessions: [{ start: h(2), end: h(10) }],
    });
    expect(open).toEqual(closed);
    expect(open.basis.workingSpanHours).toBeCloseTo(8, 9);
  });

  it('clips sessions to the window', () => {
    // A session from 5h before the window to 5h in, and one that outlives it.
    // Clipped: 0→5 and 5→10, capacity 2 → one active throughout → 0.5 → 100.
    const result = computeFleetUtilization({
      window,
      capacity: 2,
      sessions: [
        { start: h(-5), end: h(5) },
        { start: h(5), end: h(50) },
      ],
    });
    expectValue(result, 100);
    expect(result.basis.workingSpanHours).toBeCloseTo(10, 9);
    // A hand-over at the same instant is not two sessions at once.
    expect(result.basis.peakActiveSessions).toBe(1);
  });

  it('excludes a session that ends before it starts, without changing the answer', () => {
    // Property: a negative duration is a recording error, not negative work.
    const good = [
      { start: h(1), end: h(5) },
      { start: h(3), end: h(7) },
    ];
    const clean = computeFleetUtilization({ window, capacity: 2, sessions: good });
    const dirty = computeFleetUtilization({
      window,
      capacity: 2,
      sessions: [
        ...good,
        { start: h(9), end: h(2) },
        { start: NaN, end: h(2) },
        { start: h(2), end: Infinity },
      ],
    });
    expect(dirty.ratio).toBeCloseTo(clean.ratio!, 12);
    expect(dirty.basis.sessions).toBe(2);
    expect(dirty.basis.excludedSessions).toBe(3);
  });

  it('does not let an instantaneous session stretch the working span', () => {
    // Property: a spawn that failed in the same millisecond did no work and
    // must not turn the hours before it into idle fleet.
    const result = computeFleetUtilization({
      window,
      capacity: 1,
      sessions: [
        { start: h(1), end: h(2) },
        { start: h(9), end: h(9) },
      ],
    });
    expectValue(result, 200);
    expect(result.basis.workingSpanHours).toBeCloseTo(1, 9);
  });

  it.each([
    ['no sessions', [] as SessionInterval[]],
    ['sessions entirely before the window', [{ start: h(-9), end: h(-1) }]],
    ['sessions entirely after the window', [{ start: h(11), end: null }]],
    ['only zero-length sessions', [{ start: h(3), end: h(3) }]],
    ['only negative-duration sessions', [{ start: h(5), end: h(3) }]],
  ])('is unmeasured with %s', (_label, sessions) => {
    expectUnmeasured(computeFleetUtilization({ window, capacity: 4, sessions }));
  });

  it.each([null, undefined, 0, -1, 0.5, 2.5, NaN, Infinity])(
    'is unmeasured, not NaN, when capacity is %s',
    (capacity) => {
      // Property: no denominator, no ratio. Division by zero never reaches the value.
      expectUnmeasured(
        computeFleetUtilization({
          window,
          capacity,
          sessions: [{ start: h(1), end: h(5) }],
        })
      );
    }
  );

  it.each([
    ['zero-length', { from: h(5), to: h(5) }],
    ['inverted', { from: h(5), to: h(1) }],
    ['NaN', { from: NaN, to: NaN }],
  ])('is unmeasured for a %s window', (_label, badWindow) => {
    expectUnmeasured(
      computeFleetUtilization({
        window: badWindow,
        capacity: 2,
        sessions: [{ start: h(1), end: h(9) }],
      })
    );
  });
});

// ============================================================================
// Plan accuracy
// ============================================================================

describe('planAccuracy — symmetric error over tasks that actually ran', () => {
  it('matches the hand-worked example', () => {
    //   est 30, act 30 → |0|  / 30 = 0
    //   est 20, act 40 → |20| / 40 = 0.5
    //   est 60, act 45 → |15| / 60 = 0.25
    // mean error = 0.75 / 3 = 0.25 → ratio 0.75 → × 200 = 150.
    const result = computePlanAccuracy({
      tasks: [
        { estimatedMinutes: 30, actualMinutes: 30 },
        { estimatedMinutes: 20, actualMinutes: 40 },
        { estimatedMinutes: 60, actualMinutes: 45 },
      ],
    });
    expectValue(result, 150);
    expect(result.ratio).toBeCloseTo(0.75, 12);
    expect(result.basis.meanError).toBeCloseTo(0.25, 12);
    expect(result.basis.qualifyingTasks).toBe(3);
    expect(result.basis.excludedTasks).toBe(0);
  });

  it('charges over- and under-estimating the same', () => {
    // Property: symmetric. 10-for-20 costs what 20-for-10 costs, so the
    // dimension does not teach padding.
    const under = computePlanAccuracy({
      tasks: [
        { estimatedMinutes: 10, actualMinutes: 20 },
        { estimatedMinutes: 10, actualMinutes: 20 },
        { estimatedMinutes: 10, actualMinutes: 20 },
      ],
    });
    const over = computePlanAccuracy({
      tasks: [
        { estimatedMinutes: 20, actualMinutes: 10 },
        { estimatedMinutes: 20, actualMinutes: 10 },
        { estimatedMinutes: 20, actualMinutes: 10 },
      ],
    });
    expectValue(under, 100);
    expectValue(over, 100);
  });

  it('excludes tasks that never ran instead of counting them as perfect', () => {
    // THE invariant. Three perfect tasks and five that never ran is three
    // tasks' worth of evidence — and the five are reported, not hidden.
    const result = computePlanAccuracy({
      tasks: [
        { estimatedMinutes: 30, actualMinutes: 30 },
        { estimatedMinutes: 20, actualMinutes: 40 },
        { estimatedMinutes: 60, actualMinutes: 45 },
        { estimatedMinutes: 30, actualMinutes: null },
        { estimatedMinutes: 30, actualMinutes: null },
        { estimatedMinutes: 30, actualMinutes: null },
        { estimatedMinutes: 30, actualMinutes: null },
        { estimatedMinutes: 30, actualMinutes: null },
      ],
    });
    // Same 150 as the worked example. Had the five counted as perfect the mean
    // error would be 0.75 / 8 and the value 181.
    expectValue(result, 150);
    expect(result.basis.qualifyingTasks).toBe(3);
    expect(result.basis.excludedTasks).toBe(5);
    expect(result.basis.excludedNeverRan).toBe(5);
  });

  it('is unmeasured — not 200 — for a plan where almost nothing ran', () => {
    // Property: a plan nobody executed has no accuracy. This is the case that
    // would score full marks if never-ran tasks were treated as zero error.
    const result = computePlanAccuracy({
      tasks: [
        { estimatedMinutes: 30, actualMinutes: 30 },
        { estimatedMinutes: 30, actualMinutes: 30 },
        ...Array.from({ length: 10 }, () => ({ estimatedMinutes: 30, actualMinutes: null })),
      ],
    });
    expectUnmeasured(result);
    expect(result.basis.qualifyingTasks).toBe(2);
    expect(result.basis.excludedTasks).toBe(10);
  });

  it('excludes tasks with no estimate, and unusable numbers on either side', () => {
    // Property: zero, negative and non-finite durations are missing
    // measurements, not fast tasks or perfect guesses.
    const result = computePlanAccuracy({
      tasks: [
        { estimatedMinutes: 30, actualMinutes: 30 },
        { estimatedMinutes: 30, actualMinutes: 30 },
        { estimatedMinutes: 30, actualMinutes: 30 },
        { estimatedMinutes: null, actualMinutes: 30 },
        { estimatedMinutes: 0, actualMinutes: 30 },
        { estimatedMinutes: -5, actualMinutes: 30 },
        { estimatedMinutes: NaN, actualMinutes: 30 },
        { estimatedMinutes: Infinity, actualMinutes: 30 },
        { estimatedMinutes: 30, actualMinutes: 0 },
        { estimatedMinutes: 30, actualMinutes: -1 },
        { estimatedMinutes: 30, actualMinutes: NaN },
        { estimatedMinutes: null, actualMinutes: null },
      ],
    });
    expectValue(result, 200);
    expect(result.basis.qualifyingTasks).toBe(3);
    expect(result.basis.excludedNoEstimate).toBe(5);
    // Three with a bad actual, plus the one with neither number.
    expect(result.basis.excludedNeverRan).toBe(4);
    expect(result.basis.excludedTasks).toBe(9);
  });

  it('applies the floor exactly at the documented minimum', () => {
    // Property: one lucky task is not accuracy; neither are two.
    expect(MIN_TASKS_FOR_ACCURACY).toBe(3);
    const perfect = { estimatedMinutes: 15, actualMinutes: 15 };
    expectUnmeasured(computePlanAccuracy({ tasks: [] }));
    expectUnmeasured(computePlanAccuracy({ tasks: [perfect] }));
    expectUnmeasured(computePlanAccuracy({ tasks: [perfect, perfect] }));
    expectValue(computePlanAccuracy({ tasks: [perfect, perfect, perfect] }), 200);
  });

  it('approaches zero for wildly wrong estimates but never goes below it', () => {
    // Property: the error is bounded in [0, 1), so one catastrophic miss cannot
    // push the dimension negative.
    const result = computePlanAccuracy({
      tasks: [
        { estimatedMinutes: 1, actualMinutes: 1e12 },
        { estimatedMinutes: 1e12, actualMinutes: 1 },
        { estimatedMinutes: Number.MIN_VALUE, actualMinutes: Number.MAX_VALUE },
      ],
    });
    expectValue(result, 0);
    expect(result.ratio!).toBeGreaterThanOrEqual(0);
    expect(result.ratio!).toBeLessThan(1e-9);
  });
});

// ============================================================================
// Cost efficiency
// ============================================================================

describe('costEfficiency — saving against the most expensive model', () => {
  it('matches the hand-worked example', () => {
    // Spent $1 + $2 = $3. The same tokens on the reference model: $5 + $5 = $10.
    // ratio = 1 − 3/10 = 0.7 → × 150 = 105.
    const result = computeCostEfficiency({
      referenceModel: 'OPUS',
      usage: [
        { model: 'HAIKU', costUsd: 1, baselineCostUsd: 5 },
        { model: 'SONNET', costUsd: 2, baselineCostUsd: 5 },
      ],
    });
    expectValue(result, 105);
    expect(result.ratio).toBeCloseTo(0.7, 12);
    expect(result.basis.costUsd).toBe(3);
    expect(result.basis.baselineCostUsd).toBe(10);
    expect(result.basis.entries).toBe(2);
    expect(result.basis.referenceModel).toBe('OPUS');
    expect(result.basis.models).toBe('HAIKU, SONNET');
  });

  it('scores a fleet that ran everything on the reference model at zero — measured', () => {
    // THE invariant: by construction, there is no saving against the most
    // expensive option when you chose it. This is a real 0, not "unmeasured".
    const result = computeCostEfficiency({
      referenceModel: 'OPUS',
      usage: [
        { model: 'OPUS', costUsd: 4.2, baselineCostUsd: 4.2 },
        { model: 'OPUS', costUsd: 11.75, baselineCostUsd: 11.75 },
      ],
    });
    expectValue(result, 0);
    expect(result.ratio).toBe(0);
  });

  it('floors at zero when spend exceeds the baseline', () => {
    // Property: clamped at the bottom; a negative saving is not a negative score.
    const result = computeCostEfficiency({
      usage: [{ model: null, costUsd: 30, baselineCostUsd: 10 }],
    });
    expectValue(result, 0);
    expect(result.basis.models).toBe('unknown');
  });

  it('gives full marks when the work cost nothing, and never more', () => {
    // Property: clamped at the top.
    expectValue(
      computeCostEfficiency({ usage: [{ model: 'local', costUsd: 0, baselineCostUsd: 12 }] }),
      150
    );
  });

  it('is a ratio of sums, so every dollar counts once', () => {
    // An 80% saving on a $10 task does not offset paying full price on $90.
    //   Σcost = 2 + 90 = 92, Σbaseline = 10 + 90 = 100 → 1 − 0.92 = 0.08 → 12.
    // (A mean of per-task ratios would have said (0.8 + 0) / 2 = 0.4 → 60.)
    const result = computeCostEfficiency({
      usage: [
        { model: 'HAIKU', costUsd: 2, baselineCostUsd: 10 },
        { model: 'OPUS', costUsd: 90, baselineCostUsd: 90 },
      ],
    });
    expectValue(result, 12);
    expect(result.ratio).toBeCloseTo(0.08, 12);
  });

  it('excludes negative and non-finite entries, and counts them', () => {
    const result = computeCostEfficiency({
      usage: [
        { model: 'HAIKU', costUsd: 1, baselineCostUsd: 5 },
        { model: 'SONNET', costUsd: 2, baselineCostUsd: 5 },
        { model: 'HAIKU', costUsd: -1, baselineCostUsd: 5 },
        { model: 'HAIKU', costUsd: 1, baselineCostUsd: -5 },
        { model: 'HAIKU', costUsd: NaN, baselineCostUsd: 5 },
        { model: 'HAIKU', costUsd: 1, baselineCostUsd: Infinity },
      ],
    });
    expectValue(result, 105);
    expect(result.basis.entries).toBe(2);
    expect(result.basis.excludedEntries).toBe(4);
  });

  it('does not depend on the order of the entries', () => {
    const a = { model: 'SONNET', costUsd: 2, baselineCostUsd: 5 };
    const b = { model: 'HAIKU', costUsd: 1, baselineCostUsd: 5 };
    expect(computeCostEfficiency({ usage: [a, b] })).toEqual(
      computeCostEfficiency({ usage: [b, a] })
    );
  });

  it.each([
    ['no entries', []],
    ['a zero baseline (no tokens priced)', [{ model: 'HAIKU', costUsd: 0, baselineCostUsd: 0 }]],
    [
      'spend against a zero baseline (would divide by zero)',
      [{ model: 'HAIKU', costUsd: 3, baselineCostUsd: 0 }],
    ],
    ['only invalid entries', [{ model: 'HAIKU', costUsd: NaN, baselineCostUsd: NaN }]],
  ])('is unmeasured, not NaN, with %s', (_label, usage) => {
    // Property: nothing to save against is not a saving of 100% or of 0%.
    expectUnmeasured(computeCostEfficiency({ usage }));
  });

  it('says it is the baseline that is missing when the baseline is zero', () => {
    // The division by zero is refused by name, not left for a later guard to catch.
    for (const costUsd of [0, 3]) {
      const result = computeCostEfficiency({
        usage: [{ model: 'HAIKU', costUsd, baselineCostUsd: 0 }],
      });
      expectUnmeasured(result);
      expect(result.unmeasured).toMatch(/baseline cost is zero/);
    }
  });

  it('is unmeasured when the sums overflow', () => {
    // Two finite costs whose sum is not: Infinity / Infinity must not become a score.
    expectUnmeasured(
      computeCostEfficiency({
        usage: [
          { model: 'HAIKU', costUsd: 1e308, baselineCostUsd: 1e308 },
          { model: 'HAIKU', costUsd: 1e308, baselineCostUsd: 1e308 },
        ],
      })
    );
  });
});

// ============================================================================
// Velocity trend
// ============================================================================

describe('velocityTrend — recent rate against the whole-window rate', () => {
  const window = { from: h(0), to: h(8) };
  // With the default fraction the recent slice is the last 2h: t in [6h, 8h].

  it('scores steady throughput at exactly half marks', () => {
    // THE invariant. One completion an hour, on the half hour: 8 in the window,
    // 2 of them (6.5h, 7.5h) in the recent slice.
    //   baseline = 8 / 8h = 1/h; recent = 2 / 2h = 1/h; r = 1 → 0.5 → 50.
    const completions = [0.5, 1.5, 2.5, 3.5, 4.5, 5.5, 6.5, 7.5].map(h);
    const result = computeVelocityTrend({ window, completions });
    expectValue(result, 50);
    expect(result.ratio).toBe(0.5);
    expect(result.basis.rateRatio).toBeCloseTo(1, 12);
    expect(result.basis.baselinePerHour).toBeCloseTo(1, 12);
    expect(result.basis.recentPerHour).toBeCloseTo(1, 12);
    expect(result.basis.recentFraction).toBe(DEFAULT_RECENT_FRACTION);
  });

  it('matches the hand-worked example of a rising trend', () => {
    // 8 completions, 3 in the recent slice.
    //   baseline = 8 / 8h = 1/h; recent = 3 / 2h = 1.5/h; r = 1.5 → 0.75 → 75.
    const completions = [1, 2, 3, 4, 5, 6.25, 7, 7.75].map(h);
    const result = computeVelocityTrend({ window, completions });
    expectValue(result, 75);
    expect(result.basis.completions).toBe(8);
    expect(result.basis.recentCompletions).toBe(3);
    expect(result.basis.rateRatio).toBeCloseTo(1.5, 12);
  });

  it('gives full marks for doubling, and no more for more than doubling', () => {
    // Property: clamped at the top.
    // Doubling: 4 of 8 in the recent slice → recent 2/h vs baseline 1/h → r = 2 → 100.
    const doubled = computeVelocityTrend({
      window,
      completions: [1, 2, 3, 4, 6.5, 7, 7.5, 7.9].map(h),
    });
    expectValue(doubled, 100);
    expect(doubled.basis.rateRatio).toBeCloseTo(2, 12);
    // Everything in the recent slice: r = 4, still 100.
    const burst = computeVelocityTrend({
      window,
      completions: [6.1, 6.5, 7, 7.5, 7.9].map(h),
    });
    expectValue(burst, 100);
    expect(burst.basis.rateRatio).toBeCloseTo(4, 12);
    expect(burst.ratio).toBe(1);
  });

  it('scores a fleet that stopped at a measured zero', () => {
    // Property: clamped at the bottom, and stopping is a real zero.
    const result = computeVelocityTrend({ window, completions: [1, 2, 3, 4, 5].map(h) });
    expectValue(result, 0);
    expect(result.basis.recentCompletions).toBe(0);
  });

  it('honours a caller-supplied recent fraction', () => {
    // Fraction 0.5 → recent slice is t in [4h, 8h]. 4 completions, 2 in each half.
    //   baseline = 4/8h; recent = 2/4h; r = 1 → 50.
    const result = computeVelocityTrend({
      window,
      completions: [1, 3, 5, 7].map(h),
      recentFraction: 0.5,
    });
    expectValue(result, 50);
    expect(result.basis.recentFraction).toBe(0.5);
  });

  it('counts a completion exactly on the recent boundary as recent', () => {
    // 4 completions; one sits exactly at 6h. r = (1/4) / 0.25 = 1 → 50.
    expectValue(computeVelocityTrend({ window, completions: [1, 2, 3, 6].map(h) }), 50);
  });

  it('ignores completions outside the window and non-finite timestamps', () => {
    const inside = [0.5, 1.5, 2.5, 3.5, 4.5, 5.5, 6.5, 7.5].map(h);
    const result = computeVelocityTrend({
      window,
      completions: [h(-3), ...inside, h(9), NaN, Infinity, -Infinity],
    });
    expectValue(result, 50);
    expect(result.basis.completions).toBe(8);
  });

  it('applies the floor exactly at the documented minimum', () => {
    // Property: three completions are where they happened to fall, not a trend.
    expect(MIN_COMPLETIONS_FOR_TREND).toBe(4);
    expectUnmeasured(computeVelocityTrend({ window, completions: [] }));
    expectUnmeasured(computeVelocityTrend({ window, completions: [1, 4, 7].map(h) }));
    expectWellFormed(computeVelocityTrend({ window, completions: [1, 3, 5, 7].map(h) }));
    expect(computeVelocityTrend({ window, completions: [1, 3, 5, 7].map(h) }).value).not.toBeNull();
  });

  it('is unmeasured when enough completions exist but not inside the window', () => {
    expectUnmeasured(
      computeVelocityTrend({ window, completions: [9, 10, 11, 12, 13, 14].map(h) })
    );
  });

  it.each([
    ['zero-length', { from: h(5), to: h(5) }],
    ['inverted', { from: h(8), to: h(0) }],
    ['NaN', { from: NaN, to: h(8) }],
  ])('is unmeasured, not NaN, for a %s window', (_label, badWindow) => {
    // A zero-length window would otherwise be 0 completions per 0 hours.
    expectUnmeasured(
      computeVelocityTrend({ window: badWindow, completions: [5, 5, 5, 5, 5].map(h) })
    );
  });

  it.each([0, 1, -0.25, 1.5, NaN, Infinity])(
    'is unmeasured rather than silently defaulted when recentFraction is %s',
    (recentFraction) => {
      // Property: an invalid fraction is not swapped for the default — that
      // would report a number computed some other way than was asked.
      expectUnmeasured(
        computeVelocityTrend({
          window,
          completions: [0.5, 1.5, 2.5, 3.5, 4.5, 5.5, 6.5, 7.5].map(h),
          recentFraction,
        })
      );
    }
  );
});

// ============================================================================
// Parallelization quality
// ============================================================================

/** Shorthand: a task from minute `start` to minute `end` after the base. */
function task(
  id: string,
  start: number,
  end: number,
  dependsOn: string[] = [],
  files: string[] | null = []
): ExecutedTask {
  return { id, start: m(start), end: m(end), dependsOn, files };
}

describe('parallelizationQuality — achieved concurrency against what the graph allowed', () => {
  it('scores a chain forced serial by its dependencies HIGH — there was nothing to parallelise', () => {
    // a → b → c, ten minutes each, run back to back.
    //   W = 30, T = 30, A = 1. C = 30 (the whole chain). M = min(4, 30/30) = 1.
    //   base = 1/1 = 1; no pair overlaps → p = 0 → ratio 1 → 100.
    const result = computeParallelizationQuality({
      capacity: 4,
      plans: [{ tasks: [task('a', 0, 10), task('b', 10, 20, ['a']), task('c', 20, 30, ['b'])] }],
    });
    expectValue(result, 100);
    expect(result.basis.achievedConcurrency).toBeCloseTo(1, 12);
    expect(result.basis.maxConcurrency).toBeCloseTo(1, 12);
    expect(result.basis.overlappingPairs).toBe(0);
  });

  it('scores the same work, independent but run one at a time, LOW', () => {
    // Four independent ten-minute tasks run serially on a fleet of four.
    //   W = 40, T = 40, A = 1. C = 10 (longest single task). M = min(4, 40/10) = 4.
    //   base = 1/4 = 0.25 → 25.
    const result = computeParallelizationQuality({
      capacity: 4,
      plans: [
        { tasks: [task('a', 0, 10), task('b', 10, 20), task('c', 20, 30), task('d', 30, 40)] },
      ],
    });
    expectValue(result, 25);
    expect(result.basis.maxConcurrency).toBeCloseTo(4, 12);
  });

  it('scores independent work run all at once at full marks', () => {
    //   W = 40, T = 10, A = 4. C = 10. M = min(4, 4) = 4. base = 1.
    //   Six pairs overlap, none share a file → p = 0 → 100.
    const result = computeParallelizationQuality({
      capacity: 4,
      plans: [
        {
          tasks: [
            task('a', 0, 10, [], ['a.ts']),
            task('b', 0, 10, [], ['b.ts']),
            task('c', 0, 10, [], ['c.ts']),
            task('d', 0, 10, [], ['d.ts']),
          ],
        },
      ],
    });
    expectValue(result, 100);
    expect(result.basis.overlappingPairs).toBe(6);
    expect(result.basis.contendedPairs).toBe(0);
  });

  it('judges against capacity when the fleet is smaller than the graph is wide', () => {
    // Four independent tasks, two slots, run two at a time.
    //   W = 40, T = 20, A = 2. W/C = 4, but M = min(2, 4) = 2. base = 1 → 100.
    // Property: you are not marked down for parallelism you had no agents for.
    const result = computeParallelizationQuality({
      capacity: 2,
      plans: [
        { tasks: [task('a', 0, 10), task('b', 0, 10), task('c', 10, 20), task('d', 10, 20)] },
      ],
    });
    expectValue(result, 100);
    expect(result.basis.maxConcurrency).toBeCloseTo(2, 12);
  });

  it('uses the duration-weighted critical path, not the hop count', () => {
    // One 50-minute task alongside a three-step chain of 5-minute tasks.
    // By hops the chain is longest (3). By duration the lone task is (50 vs 15).
    //   Schedule: x 0→50; p 0→5, q 5→10, r 10→15.
    //   W = 65, T = 50, A = 1.3. C = 50. M = min(8, 65/50) = 1.3. base = 1.
    const plan = {
      tasks: [
        task('x', 0, 50, [], ['x.ts']),
        task('p', 0, 5, [], ['p.ts']),
        task('q', 5, 10, ['p'], ['q.ts']),
        task('r', 10, 15, ['q'], ['r.ts']),
      ],
    };
    const detail = measurePlanParallelization(plan, 8);
    expect(detail.criticalPathMs).toBe(50 * MIN);
    expect(detail.workMs).toBe(65 * MIN);
    expect(detail.wallClockMs).toBe(50 * MIN);
    expect(detail.achievedConcurrency).toBeCloseTo(1.3, 12);
    expect(detail.maxConcurrency).toBeCloseTo(1.3, 12);
    expect(detail.ratio).toBeCloseTo(1, 12);
    expectValue(computeParallelizationQuality({ capacity: 8, plans: [plan] }), 100);
  });

  it('matches the hand-worked diamond', () => {
    //        ┌─ b (30) ─┐
    //  a(10) ┤          ├─ d (10)
    //        └─ c (10) ─┘
    // Schedule as run: a 0→10; b 10→40; c 20→30 (started ten minutes late); d 45→55.
    //   W = 10 + 30 + 10 + 10 = 60. T = 55. A = 60/55 = 1.0909.
    //   C = a + b + d = 50. M = min(3, 60/50) = 1.2.
    //   base = 1.0909 / 1.2 = 0.90909. One pair overlaps (b, c), no shared file.
    //   ratio = 0.90909 → 90.9 → 91.
    const result = computeParallelizationQuality({
      capacity: 3,
      plans: [
        {
          tasks: [
            task('a', 0, 10, [], ['a.ts']),
            task('b', 10, 40, ['a'], ['b.ts']),
            task('c', 20, 30, ['a'], ['c.ts']),
            task('d', 45, 55, ['b', 'c'], ['d.ts']),
          ],
        },
      ],
    });
    expectValue(result, 91);
    expect(result.ratio).toBeCloseTo(60 / 55 / 1.2, 12);
    expect(result.basis.overlappingPairs).toBe(1);
  });

  it('penalises tasks that ran at the same time and touched the same file', () => {
    // Three independent tasks, all 0→10, capacity 3 → base = 1.
    // Three overlapping pairs; one of them (a, b) shares shared.ts → p = 1/3.
    //   ratio = 1 × (1 − 1/3) = 0.6667 → 67.
    const result = computeParallelizationQuality({
      capacity: 3,
      plans: [
        {
          tasks: [
            task('a', 0, 10, [], ['shared.ts', 'a.ts']),
            task('b', 0, 10, [], ['b.ts', 'shared.ts']),
            task('c', 0, 10, [], ['c.ts']),
          ],
        },
      ],
    });
    expectValue(result, 67);
    expect(result.basis.baseRatio).toBeCloseTo(1, 12);
    expect(result.basis.overlappingPairs).toBe(3);
    expect(result.basis.contendedPairs).toBe(1);
  });

  it('does not penalise tasks that share a file but ran one after the other', () => {
    // Property: sequencing work on a shared file is the right call, and scores as one.
    // A dependency chain on one file, back to back (ends touch, never overlap).
    const result = computeParallelizationQuality({
      capacity: 3,
      plans: [
        {
          tasks: [
            task('a', 0, 10, [], ['shared.ts']),
            task('b', 10, 20, ['a'], ['shared.ts']),
            task('c', 20, 30, ['b'], ['shared.ts']),
          ],
        },
      ],
    });
    expectValue(result, 100);
    expect(result.basis.overlappingPairs).toBe(0);
    expect(result.basis.contendedPairs).toBe(0);
  });

  it('scores zero when everything that ran together collided', () => {
    // Property: the penalty can take the whole dimension. Two independent tasks,
    // run together, on the same file: base 1, p = 1/1 → 0. A measured zero.
    const result = computeParallelizationQuality({
      capacity: 2,
      plans: [{ tasks: [task('a', 0, 10, [], ['x.ts']), task('b', 0, 10, [], ['x.ts'])] }],
    });
    expectValue(result, 0);
  });

  it('is unmeasured when concurrent tasks have no record of the files they touched', () => {
    // Property: "not recorded" (null) is not "touched nothing" ([]). Without the
    // files, the contention penalty is unknown and the number would be unearned.
    const unknown = computeParallelizationQuality({
      capacity: 2,
      plans: [{ tasks: [task('a', 0, 10, [], null), task('b', 0, 10, [], ['b.ts'])] }],
    });
    expectUnmeasured(unknown);
    // …but if the unrecorded tasks never overlapped anything, nothing is unknown.
    const serial = computeParallelizationQuality({
      capacity: 2,
      plans: [{ tasks: [task('a', 0, 10, [], null), task('b', 10, 20, ['a'], null)] }],
    });
    expectValue(serial, 100);
  });

  it('clamps at full marks when a run finished faster than its declared dependencies allow', () => {
    // b is declared to wait for a, but ran alongside it: T (10) < C (20).
    //   A = 20/10 = 2; M = min(4, 20/20) = 1; A/M = 2 → clamped to 1.
    const detail = measurePlanParallelization(
      { tasks: [task('a', 0, 10, [], ['a.ts']), task('b', 0, 10, ['a'], ['b.ts'])] },
      4
    );
    expect(detail.baseRatio).toBe(1);
    expect(detail.ratio).toBe(1);
  });

  it('ignores dependency edges to ids that are not in the plan', () => {
    const withGhost = measurePlanParallelization(
      { tasks: [task('a', 0, 10, ['ghost']), task('b', 0, 10, ['also-missing', 'ghost'])] },
      2
    );
    const without = measurePlanParallelization(
      { tasks: [task('a', 0, 10), task('b', 0, 10)] },
      2
    );
    expect(withGhost).toEqual(without);
    expect(withGhost.ratio).toBe(1);
  });

  it('treats a repeated dependency as one edge', () => {
    const detail = measurePlanParallelization(
      { tasks: [task('a', 0, 10), task('b', 10, 20, ['a', 'a', 'a'])] },
      2
    );
    expect(detail.criticalPathMs).toBe(20 * MIN);
    expect(detail.ratio).toBe(1);
  });

  it('excludes a task that ends before it starts, and measures the rest', () => {
    // Property: a negative duration is invalid, not negative work.
    const result = computeParallelizationQuality({
      capacity: 4,
      plans: [
        {
          tasks: [
            task('a', 0, 10),
            task('b', 10, 20),
            task('c', 20, 30),
            task('d', 30, 40),
            task('broken', 50, 5),
            { id: 'nan', start: NaN, end: m(5), dependsOn: [], files: [] },
          ],
        },
      ],
    });
    // Identical to the four-task serial case above: 25.
    expectValue(result, 25);
    expect(result.basis.tasks).toBe(4);
  });

  it('combines several plans as a work-weighted mean', () => {
    // Plan 1: four independent tasks run serially → W = 40 min, ratio 0.25.
    // Plan 2: a three-step forced chain          → W = 30 min, ratio 1.00.
    //   (0.25 × 40 + 1.00 × 30) / 70 = 40/70 = 0.5714 → 57.
    // (An unweighted mean would be 0.625 → 63.)
    const result = computeParallelizationQuality({
      capacity: 4,
      plans: [
        { tasks: [task('a', 0, 10), task('b', 10, 20), task('c', 20, 30), task('d', 30, 40)] },
        { tasks: [task('a', 0, 10), task('b', 10, 20, ['a']), task('c', 20, 30, ['b'])] },
      ],
    });
    expectValue(result, 57);
    expect(result.ratio).toBeCloseTo(40 / 70, 12);
    expect(result.basis.plansMeasured).toBe(2);
    expect(result.basis.workHours).toBeCloseTo(70 / 60, 9);
  });

  it('lets a plan carry its own capacity', () => {
    // Same serial-independent plan; with its own capacity of 2, M = min(2, 4) = 2 → 0.5.
    const result = computeParallelizationQuality({
      capacity: 4,
      plans: [
        {
          capacity: 2,
          tasks: [task('a', 0, 10), task('b', 10, 20), task('c', 20, 30), task('d', 30, 40)],
        },
      ],
    });
    expectValue(result, 50);
  });

  it('skips an unmeasurable plan rather than scoring it as zero', () => {
    // Property: a plan that cannot be measured does not drag the others down.
    const chain = { tasks: [task('a', 0, 10), task('b', 10, 20, ['a'])] };
    const cyclic = { tasks: [task('a', 0, 10, ['b']), task('b', 10, 20, ['a'])] };
    const single = { tasks: [task('only', 0, 500)] };
    const result = computeParallelizationQuality({ capacity: 2, plans: [cyclic, chain, single] });
    expectValue(result, 100);
    expect(result.basis.plansMeasured).toBe(1);
    expect(result.basis.plansSkipped).toBe(2);
    expect(result.basis.firstSkipReason).toMatch(/cycle/);
  });

  it.each([
    ['no plans', []],
    ['a plan with no tasks', [{ tasks: [] }]],
    ['a plan with a single task', [{ tasks: [task('a', 0, 10)] }]],
    [
      'a plan whose tasks all have zero duration (W = 0)',
      [{ tasks: [task('a', 5, 5), task('b', 5, 5)] }],
    ],
    [
      'a plan left with one valid task after negative durations are excluded',
      [{ tasks: [task('a', 0, 10), task('b', 30, 20)] }],
    ],
    [
      'a dependency cycle',
      [{ tasks: [task('a', 0, 10, ['c']), task('b', 10, 20, ['a']), task('c', 20, 30, ['b'])] }],
    ],
    ['a task that depends on itself', [{ tasks: [task('a', 0, 10, ['a']), task('b', 0, 10)] }]],
    ['two tasks sharing an id', [{ tasks: [task('a', 0, 10), task('a', 10, 20)] }]],
  ])('is unmeasured, not NaN, with %s', (_label, plans) => {
    expectUnmeasured(computeParallelizationQuality({ capacity: 4, plans }));
  });

  it.each([null, undefined, 0, -2, 1.5, NaN])(
    'is unmeasured when capacity is %s',
    (capacity) => {
      expectUnmeasured(
        computeParallelizationQuality({
          capacity,
          plans: [{ tasks: [task('a', 0, 10), task('b', 0, 10)] }],
        })
      );
    }
  );

  it('keeps a zero-duration task for its edges without letting it add work', () => {
    // a → gate (instant) → b. The gate carries the dependency; W is still 20.
    const detail = measurePlanParallelization(
      { tasks: [task('a', 0, 10), task('gate', 10, 10, ['a']), task('b', 10, 20, ['gate'])] },
      4
    );
    expect(detail.workMs).toBe(20 * MIN);
    expect(detail.criticalPathMs).toBe(20 * MIN);
    expect(detail.ratio).toBe(1);
  });

  it('is unmeasured when recorded times are too large to add up', () => {
    // One plan whose own durations overflow is refused on its own…
    const absurd = { tasks: [task('a', 0, 10), task('b', 0, 10)] };
    absurd.tasks[0] = { ...absurd.tasks[0], start: -1e308, end: 1e308 };
    const detail = measurePlanParallelization(absurd, 2);
    expect(detail.ratio).toBeNull();
    expect(detail.unmeasured).toMatch(/out of range/);
    expect(Number.isFinite(detail.workMs)).toBe(true);
    // …and two plans that are each just representable, but whose combined work
    // is not, reach the last guard: Infinity / Infinity never becomes a value.
    const huge = {
      tasks: [
        { id: 'a', start: 0, end: 6e307, dependsOn: [], files: ['a.ts'] },
        { id: 'b', start: 0, end: 6e307, dependsOn: [], files: ['b.ts'] },
      ],
    };
    expect(measurePlanParallelization(huge, 2).ratio).toBe(1);
    expectUnmeasured(computeParallelizationQuality({ capacity: 2, plans: [huge, huge] }));
  });

  it('needs exactly the documented minimum of tasks', () => {
    expect(MIN_TASKS_FOR_PARALLELIZATION).toBe(2);
  });
});

// ============================================================================
// computeScore
// ============================================================================

/**
 * A fully measured input whose six values are the worked examples above:
 *   runwayHealth 129, fleetUtilization 133, planAccuracy 150,
 *   costEfficiency 105, velocityTrend 75, parallelizationQuality 67 → 659.
 * The window is [0h, 10h], so "recent" for velocity is t ≥ 7.5h.
 *
 * Runway is the worked example's seven readings, taken in the first seventy
 * minutes of the window. The last one is followed by more than fifteen minutes
 * of nothing, so it holds for fifteen — the same 38.75 / 75 as above.
 */
function fullInput(): ScoreInput {
  return {
    from: h(0),
    capacity: 2,
    runwaySamples: [...readings(10, 20, 2), ...readings(30, 40, 8), ...readings(50, 70, 1)],
    sessions: [
      { start: h(1), end: h(5) },
      { start: h(3), end: h(7) },
      { start: h(6), end: null },
    ],
    tasks: [
      { estimatedMinutes: 30, actualMinutes: 30 },
      { estimatedMinutes: 20, actualMinutes: 40 },
      { estimatedMinutes: 60, actualMinutes: 45 },
    ],
    usage: [
      { model: 'HAIKU', costUsd: 1, baselineCostUsd: 5 },
      { model: 'SONNET', costUsd: 2, baselineCostUsd: 5 },
    ],
    referenceModel: 'OPUS',
    // 8 completions in 10h, 3 of them at or after 7.5h:
    //   baseline 0.8/h, recent 3 / 2.5h = 1.2/h, r = 1.5 → 0.75 → 75.
    completions: [1, 2, 3, 4, 5, 8, 9, 9.5].map(h),
    plans: [
      {
        capacity: 3,
        tasks: [
          task('a', 0, 10, [], ['shared.ts', 'a.ts']),
          task('b', 0, 10, [], ['b.ts', 'shared.ts']),
          task('c', 0, 10, [], ['c.ts']),
        ],
      },
    ],
  };
}

const NOW = h(10);

function expectScoreWellFormed(score: ScoreResult): void {
  expect(Object.keys(score.dimensions)).toEqual(SCORE_MODEL.map((d) => d.key));
  let total = 0;
  let measuredMax = 0;
  const missing: ScoreDimensionKey[] = [];
  for (const { key, max } of SCORE_MODEL) {
    const result = score.dimensions[key];
    expect(result.key).toBe(key);
    expectWellFormed(result);
    if (result.value === null) {
      missing.push(key);
    } else {
      total += result.value;
      measuredMax += max;
    }
  }
  expect(score.total).toBe(total);
  expect(score.measuredMax).toBe(measuredMax);
  expect(score.unmeasured).toEqual(missing);
  expect(score.complete).toBe(missing.length === 0);
  expect(score.total).toBeLessThanOrEqual(score.measuredMax);
  expect(score.measuredMax).toBeLessThanOrEqual(SCORE_TOTAL);
  expect(score.max).toBe(SCORE_TOTAL);
  expect(Number.isFinite(score.total)).toBe(true);
  expect(JSON.parse(JSON.stringify(score))).toEqual(score);
}

describe('computeScore — six dimensions, honestly totalled', () => {
  it('still sits on a valid model', () => {
    expect(scoreModelIsValid()).toBe(true);
  });

  it('totals a fully measured score as the sum of its six values', () => {
    const score = computeScore(fullInput(), NOW);
    expectScoreWellFormed(score);
    expect(score.dimensions.runwayHealth.value).toBe(129);
    expect(score.dimensions.fleetUtilization.value).toBe(133);
    expect(score.dimensions.planAccuracy.value).toBe(150);
    expect(score.dimensions.costEfficiency.value).toBe(105);
    expect(score.dimensions.velocityTrend.value).toBe(75);
    expect(score.dimensions.parallelizationQuality.value).toBe(67);
    expect(score.total).toBe(129 + 133 + 150 + 105 + 75 + 67);
    expect(score.total).toBe(659);
    expect(score.measuredMax).toBe(1000);
    expect(score.complete).toBe(true);
    expect(score.unmeasured).toEqual([]);
    expect(score.modelVersion).toBe(SCORE_MODEL_VERSION);
    expect(score.window).toEqual({ from: h(0), to: NOW });
  });

  it('reports a partial score as "of measuredMax", and marks it not rankable', () => {
    // Property: unmeasured is not zero. Drop runway, velocity and
    // parallelization; what is left is 133 + 150 + 105 = 388 of 200 + 200 + 150 = 550.
    const input = fullInput();
    delete input.runwaySamples;
    input.completions = null;
    input.plans = [];
    const score = computeScore(input, NOW);
    expectScoreWellFormed(score);
    expect(score.total).toBe(388);
    expect(score.measuredMax).toBe(550);
    expect(score.complete).toBe(false);
    expect(score.unmeasured).toEqual(['runwayHealth', 'velocityTrend', 'parallelizationQuality']);
    expect(score.dimensions.runwayHealth.value).toBeNull();
    expect(score.dimensions.velocityTrend.value).toBeNull();
    expect(score.dimensions.parallelizationQuality.value).toBeNull();
    // The measured ones are untouched by what is missing beside them.
    expect(score.dimensions.planAccuracy.value).toBe(150);
  });

  it('is incomplete if even one dimension is unmeasured', () => {
    for (const drop of [
      'runwaySamples',
      'sessions',
      'tasks',
      'usage',
      'completions',
      'plans',
    ] as const) {
      const input = fullInput();
      delete input[drop];
      const score = computeScore(input, NOW);
      expectScoreWellFormed(score);
      expect(score.complete, `dropping ${drop}`).toBe(false);
      expect(score.unmeasured).toHaveLength(1);
      expect(score.measuredMax).toBe(1000 - score.dimensions[score.unmeasured[0]].max);
    }
  });

  it('reports nothing measured as nothing — six nulls, not six zeros and not 742', () => {
    // The case that started this: a fleet that has never run.
    const score = computeScore({ from: h(0) }, NOW);
    expectScoreWellFormed(score);
    expect(score.total).toBe(0);
    expect(score.measuredMax).toBe(0);
    expect(score.complete).toBe(false);
    expect(score.unmeasured).toHaveLength(6);
    for (const { key } of SCORE_MODEL) {
      expect(score.dimensions[key].value).toBeNull();
      expect(score.dimensions[key].unmeasured).toEqual(expect.any(String));
    }
  });

  it('uses capacity for both utilization and parallelization, and loses both without it', () => {
    const input = fullInput();
    input.capacity = null;
    input.plans = [{ tasks: input.plans![0].tasks }]; // no per-plan capacity either
    const score = computeScore(input, NOW);
    expectScoreWellFormed(score);
    expect(score.unmeasured).toEqual(['fleetUtilization', 'parallelizationQuality']);
    expect(score.measuredMax).toBe(700);
  });

  it('is identical for identical input', () => {
    // Property: determinism. No clock, no randomness, no hidden state.
    const a = computeScore(fullInput(), NOW);
    const b = computeScore(fullInput(), NOW);
    const input = fullInput();
    const c = computeScore(input, NOW);
    const d = computeScore(input, NOW);
    expect(b).toEqual(a);
    expect(d).toEqual(c);
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
    expect(JSON.stringify(d)).toBe(JSON.stringify(a));
  });

  it('does not mutate its input', () => {
    const deepFreeze = <T>(value: T): T => {
      if (value && typeof value === 'object') {
        Object.values(value as object).forEach(deepFreeze);
        Object.freeze(value);
      }
      return value;
    };
    const input = deepFreeze(fullInput());
    const before = JSON.stringify(input);
    // A write to a frozen object throws in strict mode (ES modules are strict).
    expect(() => computeScore(input, NOW)).not.toThrow();
    expect(JSON.stringify(input)).toBe(before);
  });

  it('takes "now" as the end of the window', () => {
    // A session still running is counted up to `now`, so a later `now` is a
    // different (and still deterministic) score.
    const input: ScoreInput = { from: h(0), capacity: 2, sessions: [{ start: h(0), end: null }] };
    const early = computeScore(input, h(4));
    const late = computeScore(input, h(9));
    expect(early.dimensions.fleetUtilization.basis.workingSpanHours).toBeCloseTo(4, 9);
    expect(late.dimensions.fleetUtilization.basis.workingSpanHours).toBeCloseTo(9, 9);
    expect(early.window).toEqual({ from: h(0), to: h(4) });
    // Events after `now` have not happened yet as far as the score is concerned.
    const future = computeScore(
      { from: h(0), completions: [1, 2, 3, 20, 21, 22, 23, 24].map(h) },
      h(10)
    );
    expectUnmeasured(future.dimensions.velocityTrend);
    expect(future.dimensions.velocityTrend.basis.completions).toBe(3);
  });

  it.each([
    ['now before from', h(5), h(1)],
    ['now equal to from', h(5), h(5)],
    ['NaN now', h(0), NaN],
    ['infinite now', h(0), Infinity],
    ['NaN from', NaN, h(10)],
  ])('does not throw or leak a NaN with %s', (_label, from, now) => {
    // The windowed dimensions go unmeasured; the others still stand.
    const score = computeScore({ ...fullInput(), from }, now);
    expectScoreWellFormed(score);
    expect(score.complete).toBe(false);
    expect(score.unmeasured).toEqual(['runwayHealth', 'fleetUtilization', 'velocityTrend']);
    expect(score.dimensions.planAccuracy.value).toBe(150);
  });

  it('keeps every value within its max at both extremes', () => {
    // Best case on every dimension: exactly 1000, and never more.
    const best = computeScore(
      {
        from: h(0),
        capacity: 2,
        runwaySamples: readings(0, 60, 999),
        sessions: Array.from({ length: 9 }, () => ({ start: h(0), end: h(10) })),
        tasks: Array.from({ length: 5 }, () => ({ estimatedMinutes: 30, actualMinutes: 30 })),
        usage: [{ model: 'local', costUsd: 0, baselineCostUsd: 100 }],
        completions: [9, 9.2, 9.4, 9.6, 9.8].map(h),
        plans: [{ tasks: [task('a', 0, 10, [], ['a.ts']), task('b', 0, 10, [], ['b.ts'])] }],
      },
      NOW
    );
    expectScoreWellFormed(best);
    expect(best.total).toBe(SCORE_TOTAL);
    expect(best.complete).toBe(true);
    for (const { key, max } of SCORE_MODEL) expect(best.dimensions[key].value).toBe(max);

    // Worst case on every dimension: a complete, measured, rankable zero.
    const worst = computeScore(
      {
        from: h(0),
        capacity: 2,
        runwaySamples: readings(0, 60, 0),
        // An idle fleet is a very low ratio rather than literally 0: two
        // 3.6-second sessions half an hour apart on two slots is
        // 0.5 × 0.002h / 0.501h = 0.002 → 0.4 points → 0. (Further apart than
        // a break and the gap would be left out, not counted as idle.)
        sessions: [
          { start: h(0), end: h(0.001) },
          { start: h(0.5), end: h(0.501) },
        ],
        tasks: Array.from({ length: 3 }, () => ({ estimatedMinutes: 1, actualMinutes: 1e12 })),
        usage: [{ model: 'OPUS', costUsd: 100, baselineCostUsd: 100 }],
        completions: [1, 2, 3, 4].map(h),
        plans: [{ tasks: [task('a', 0, 10, [], ['x.ts']), task('b', 0, 10, [], ['x.ts'])] }],
      },
      NOW
    );
    expectScoreWellFormed(worst);
    expect(worst.complete).toBe(true);
    expect(worst.total).toBe(0);
    expect(worst.measuredMax).toBe(SCORE_TOTAL);
    for (const { key } of SCORE_MODEL) expect(worst.dimensions[key].value).toBe(0);
  });

  it('never emits a non-finite number, whatever it is fed', () => {
    // A seeded generator (so this test is itself deterministic) producing the
    // values that break arithmetic: NaN, ±Infinity, zero, negatives, huge and
    // tiny magnitudes, and ordinary numbers in between.
    let seed = 0x2f6e2b1;
    const next = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 0x100000000;
    };
    const nasty = [NaN, Infinity, -Infinity, 0, -0, -1, 1e-320, 1e308, -1e308, 0.5, 1, 4, 1e15];
    const anyNumber = (): number => {
      const roll = next();
      if (roll < 0.35) return nasty[Math.floor(next() * nasty.length)];
      if (roll < 0.7) return h(Math.floor(next() * 12) - 1);
      return next() * 100 - 10;
    };
    const many = <T>(make: () => T): T[] =>
      Array.from({ length: Math.floor(next() * 7) }, make);
    const ids = ['a', 'b', 'c', 'd', 'ghost'];
    const pickId = () => ids[Math.floor(next() * ids.length)];
    const maybeNull = <T>(value: T): T | null => (next() < 0.2 ? null : value);
    const timesMeasured = Object.fromEntries(SCORE_MODEL.map((d) => [d.key, 0]));

    for (let i = 0; i < 2000; i += 1) {
      const input: ScoreInput = {
        from: next() < 0.8 ? h(0) : anyNumber(),
        capacity: maybeNull(next() < 0.7 ? Math.floor(next() * 5) : anyNumber()),
        runwaySamples: many(() => ({ at: anyNumber(), runwayHours: anyNumber() })),
        sessions: many(() => ({ start: anyNumber(), end: maybeNull(anyNumber()) })),
        tasks: many(() => ({
          estimatedMinutes: maybeNull(anyNumber()),
          actualMinutes: maybeNull(anyNumber()),
        })),
        usage: many(() => ({
          model: maybeNull('HAIKU'),
          costUsd: anyNumber(),
          baselineCostUsd: anyNumber(),
        })),
        completions: many(anyNumber),
        recentFraction: next() < 0.7 ? undefined : anyNumber(),
        plans: many(() => ({
          capacity: maybeNull(next() < 0.7 ? Math.floor(next() * 5) : anyNumber()),
          tasks: many(() => ({
            id: pickId(),
            start: anyNumber(),
            end: anyNumber(),
            dependsOn: many(pickId),
            files: maybeNull(many(() => (next() < 0.5 ? 'x.ts' : 'y.ts'))),
          })),
        })),
      };
      const now = next() < 0.8 ? h(10) : anyNumber();
      const score = computeScore(input, now);
      expectScoreWellFormed(score);
      for (const { key } of SCORE_MODEL) {
        if (score.dimensions[key].value !== null) timesMeasured[key] += 1;
      }
      // And again: same input, same answer.
      expect(computeScore(input, now)).toEqual(score);
      // The per-plan working is exported too, and holds to the same rule.
      for (const plan of input.plans ?? []) {
        const detail = measurePlanParallelization(plan, plan.capacity ?? input.capacity);
        for (const [name, v] of Object.entries(detail)) {
          if (typeof v === 'number') {
            expect(Number.isFinite(v), `plan ${name} must be finite`).toBe(true);
          }
        }
        if (detail.ratio !== null) {
          expect(detail.ratio).toBeGreaterThanOrEqual(0);
          expect(detail.ratio).toBeLessThanOrEqual(1);
          expect(detail.unmeasured).toBeNull();
        } else {
          expect(detail.unmeasured).toEqual(expect.any(String));
        }
      }
    }
    // The generator must not be so hostile that everything is unmeasured, or
    // this test would only ever exercise the early returns.
    for (const { key } of SCORE_MODEL) {
      expect(timesMeasured[key], `${key} was measured in some runs`).toBeGreaterThan(10);
    }
  });
});

// ============================================================================
// The method text must say what the code does (T16-AC-06)
// ============================================================================

describe('the public method text agrees with the code', () => {
  it('names every constant the computation uses', () => {
    // If a constant changes and the sentence describing it does not, this
    // fails. The method doc is generated from these strings; it must not drift.
    const method = (key: ScoreDimensionKey) => SCORE_DIMENSIONS[key].method;
    expect(method('runwayHealth')).toContain(`÷ ${RUNWAY_TARGET_HOURS})`);
    expect(method('runwayHealth')).toContain(`${RUNWAY_TARGET_HOURS}h`);
    expect(method('runwayHealth')).toContain(`fewer than ${MIN_RUNWAY_SAMPLES} samples`);
    expect(method('planAccuracy')).toContain(`fewer than ${MIN_TASKS_FOR_ACCURACY} `);
    expect(method('velocityTrend')).toContain(`fewer than ${MIN_COMPLETIONS_FOR_TREND} completions`);
    expect(method('parallelizationQuality')).toContain(
      `at least ${MIN_TASKS_FOR_PARALLELIZATION} timed tasks`
    );
    // "The last quarter" is DEFAULT_RECENT_FRACTION in words.
    expect(DEFAULT_RECENT_FRACTION).toBe(0.25);
    expect(method('velocityTrend')).toContain('last quarter');
  });

  it('no longer describes cost efficiency against a Sonnet baseline', () => {
    // The meaning says "most expensive model"; the method used to say
    // "all-Sonnet". They now say the same thing, and the code does it.
    const { meaning, method } = SCORE_DIMENSIONS.costEfficiency;
    expect(meaning).toMatch(/most expensive model/);
    expect(method).toMatch(/most expensive model/);
    expect(method).not.toMatch(/sonnet/i);
  });

  it('states for every dimension what makes it unmeasured', () => {
    for (const { key, method } of SCORE_MODEL) {
      expect(method, key).toMatch(/Unmeasured/);
    }
  });

  // The public method document quotes each `method` string verbatim. In a
  // checkout that does not carry the repo's docs (the published package), there
  // is nothing to compare against and the check is skipped rather than faked.
  const docPath = fileURLToPath(new URL('../../../docs/CONDUCTOR-SCORE.md', import.meta.url));
  it.skipIf(!existsSync(docPath))(
    'is quoted verbatim, with the right weight, in docs/CONDUCTOR-SCORE.md',
    () => {
      const doc = readFileSync(docPath, 'utf8');
      for (const { label, max, meaning, method } of SCORE_MODEL) {
        expect(doc, `${label}: method`).toContain(method);
        expect(doc, `${label}: meaning`).toContain(meaning);
        expect(doc, `${label}: heading with weight`).toContain(`${label} — ${max}`);
      }
      expect(doc).toContain(`model version ${SCORE_MODEL_VERSION}`);
    }
  );
});
