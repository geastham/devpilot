/**
 * The Conductor Score computation — TRD 16.
 *
 * THE ONLY PLACE A DIMENSION IS TURNED FROM EVIDENCE INTO A NUMBER.
 *
 * Before this existed, no dimension was computed by its documented method. The
 * stored score was a counter — plus fifteen for a completion, minus five for a
 * failure — three dimensions were never written, one had no column, and
 * `devpilot status` printed a hard-coded 742. `model.ts` said what each
 * dimension *meant*; nothing made the number mean it.
 *
 * Three rules hold for everything in this file. They are the design, not
 * conventions:
 *
 * 1. PLAIN DATA IN, PLAIN DATA OUT. No database, no clock, no I/O, no
 *    randomness. `now` is always an argument. The same input gives the same
 *    output on the local SQLite cockpit, the hosted plane and the benchmark
 *    harness — which is the only reason a score from one can be compared with a
 *    score from another.
 *
 * 2. UNMEASURED IS NOT ZERO AND IT IS NOT FULL MARKS. A dimension whose inputs
 *    do not exist returns `value: null` and a sentence saying why. Zero would
 *    punish a conductor for something the product failed to record; a default
 *    would award points nobody earned, which is exactly how a 742 came to be
 *    printed for a fleet that had never run. A score with a null in it is
 *    reported as "412 of 650 measured" and is not rankable.
 *
 * 3. NOTHING NON-FINITE LEAVES. Every ratio is clamped to [0, 1] before it is
 *    scaled, every division is guarded, and `measured()` refuses a NaN as a
 *    last line of defence. Bad rows are dropped and counted in `basis` rather
 *    than allowed to poison a mean.
 *
 * Each function documents its own formula, units, unmeasured conditions and the
 * known way it can be gamed or mislead. Those last paragraphs are not
 * disclaimers. A public score needs a public method, and a public method that
 * hides its weak points is still astrology.
 *
 * The `method` strings in `model.ts` say what these functions do, in prose, and
 * the public method doc is generated from them (T16-AC-06). If you change a
 * formula or a constant here, change the string there in the same commit —
 * `tests/score-compute.test.ts` checks the constants are still named.
 */

import {
  SCORE_DIMENSIONS,
  SCORE_MODEL,
  SCORE_MODEL_VERSION,
  SCORE_TOTAL,
  clampDimension,
  type ScoreDimensionKey,
} from './model';

// ============================================================================
// Constants — each one is a definitional choice, and each is named in a
// `method` string in model.ts. Changing one changes what a score means.
// ============================================================================

/**
 * Runway at or above this counts as fully healthy. It is the amber threshold
 * from `spec/DESIGN.md` §2.2 ("Amber < 4h") — the point at which the cockpit
 * starts warning that the fleet is about to outrun its conductor. Scoring
 * against the same line the UI warns at means the number and the warning
 * cannot disagree about what "enough" is.
 */
export const RUNWAY_TARGET_HOURS = 4;

/**
 * A step function needs a step. One sample is a reading, not a history: it
 * says what runway was at an instant and nothing about how consistently it was
 * kept, which is what the dimension claims to measure.
 */
export const MIN_RUNWAY_SAMPLES = 2;

/**
 * How much sampled time it takes before runway health says anything.
 *
 * Two readings a minute apart satisfy "at least two samples" and describe a
 * minute. Run against a real cockpit for the first time, this dimension
 * reported 94 of 250 from forty-eight seconds of data — a quarter of the score
 * resting on less than a minute. An hour of readings is the least that can be
 * called "how consistently": long enough for the queue to have been drawn down
 * and, if it was going to be, refilled.
 */
export const MIN_RUNWAY_COVERED_MINUTES = 60;

/**
 * How long one runway reading is taken to stand for.
 *
 * A reading holds until the next one, but not indefinitely: runway is sampled
 * while the cockpit is running, and when the readings stop it is because
 * nobody was measuring, not because runway stayed where it was. Without a
 * limit, closing the cockpit on a full queue credited a full queue until the
 * window ended — a night of perfect runway nobody observed.
 *
 * Fifteen minutes is several missed samples at the cockpit's one-minute
 * cadence, so an ordinary hiccup does not open a hole, and short enough that a
 * closed laptop does not score. Time past the limit is left out of the
 * dimension, the same way time before the first reading is: not known, so not
 * counted either way.
 */
export const RUNWAY_SAMPLE_MAX_HOLD_MINUTES = 15;

/**
 * How long the fleet can sit with nothing running before the gap stops being
 * idle capacity and becomes a break.
 *
 * Utilization asks how full the fleet was WHILE IT WAS BEING WORKED. A gap of
 * a few minutes between one task finishing and the next being dispatched is
 * exactly the idleness the dimension exists to mark down. A gap of fourteen
 * hours is somebody going home, and counting it would score the length of
 * their evening — and make the number depend on how long a window it was
 * computed over.
 *
 * Thirty minutes is the line. It is a judgement, like the four-hour runway
 * line, and it is stated so it can be argued with. A gap up to and including
 * it counts as idle in full; a longer one is left out in full, not just the
 * part past the line, so the two cases do not blur into each other.
 */
export const WORKING_BREAK_MINUTES = 30;

/**
 * One lucky task is not accuracy. With a single task the dimension is the
 * error on that task; with two, one fluke still decides half of it. Three is
 * the smallest count at which a mean starts to describe the estimator rather
 * than the estimate. It is a floor against noise, not a claim of statistical
 * significance.
 */
export const MIN_TASKS_FOR_ACCURACY = 3;

/**
 * Below this a "trend" is where one or two completions happened to fall. At
 * four completions with the default recent fraction, a single completion
 * landing either side of the boundary already moves the dimension by half its
 * range — which is why the floor exists and also why it is not higher: the
 * dimension is noisy at any count a single session will produce, and the
 * weighting (100 of 1000) is what contains that, not this constant.
 */
export const MIN_COMPLETIONS_FOR_TREND = 4;

/** The share of the window, measured back from its end, that counts as "recent". */
export const DEFAULT_RECENT_FRACTION = 0.25;

/** A plan with one task has nothing to run in parallel and nothing to learn from. */
export const MIN_TASKS_FOR_PARALLELIZATION = 2;

const MS_PER_HOUR = 3_600_000;
const MS_PER_MINUTE = 60_000;

// ============================================================================
// Result types
// ============================================================================

export interface DimensionResult {
  key: ScoreDimensionKey;
  /** 0..max in whole points, or null when the inputs to measure it do not exist. */
  value: number | null;
  max: number;
  /** The raw 0..1 quantity the value was scaled from; null when unmeasured. */
  ratio: number | null;
  /** Why it is unmeasured, in one plain sentence — null when measured. */
  unmeasured: string | null;
  /**
   * The numbers the value was computed from, for provenance and for the UI to
   * show its working. Small and serialisable: finite numbers, strings or null,
   * never NaN.
   */
  basis: Record<string, number | string | null>;
}

export interface ScoreResult {
  /** The model these values were earned under. Scores across versions do not compare. */
  modelVersion: number;
  /**
   * The span the windowed dimensions were measured over, epoch ms. Null only
   * when the caller passed a non-finite bound, in which case those dimensions
   * are unmeasured and say so.
   */
  window: { from: number | null; to: number | null };
  /** All six, keyed, in `SCORE_MODEL` order. Never missing a key. */
  dimensions: Record<ScoreDimensionKey, DimensionResult>;
  /** Sum of the measured values. NOT out of 1000 unless `complete` — see `measuredMax`. */
  total: number;
  /**
   * Sum of `max` over the measured dimensions: what `total` is out of. A score
   * of 412 with a `measuredMax` of 650 is "412 of 650 measured". Rendering it
   * as 412 / 1000 would present three unmeasured dimensions as three zeros.
   */
  measuredMax: number;
  /** The model's full total (1000), for surfaces that need to show what is missing. */
  max: number;
  /**
   * True only when all six dimensions are measured. An incomplete score is a
   * personal reading, not a standing: it must not be ranked, because two
   * incomplete scores are sums over different sets of dimensions.
   */
  complete: boolean;
  /** Keys of the unmeasured dimensions, in model order. Empty when complete. */
  unmeasured: ScoreDimensionKey[];
}

/** A span of time in epoch milliseconds, both ends included. `to` must be after `from`. */
export interface TimeWindow {
  from: number;
  to: number;
}

// ============================================================================
// Shared guards
// ============================================================================

function isFiniteNumber(x: unknown): x is number {
  return typeof x === 'number' && Number.isFinite(x);
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

/**
 * Basis values must serialise. A NaN in provenance is as bad as one in the
 * score. `+ 0` turns a negative zero into zero: JSON writes −0 as 0, and a
 * result that changes when it is stored and read back is not the same result.
 */
function finiteOrNull(x: number): number | null {
  return Number.isFinite(x) ? x + 0 : null;
}

/** Capacity is a count of concurrent slots. Half a slot is not a thing. */
function isValidCapacity(x: unknown): x is number {
  return isFiniteNumber(x) && Number.isInteger(x) && x >= 1;
}

/** Returns a sentence when the window cannot be measured over, else null. */
function windowProblem(window: TimeWindow | null | undefined): string | null {
  if (!window || !isFiniteNumber(window.from) || !isFiniteNumber(window.to)) {
    return 'The scoring window has no usable start or end time.';
  }
  if (window.to < window.from) return 'The scoring window ends before it starts.';
  if (window.to === window.from) return 'The scoring window has zero length.';
  // Two finite bounds can still be further apart than a double can hold. Every
  // duration inside a window whose length is finite is itself finite.
  if (!Number.isFinite(window.to - window.from)) {
    return 'The scoring window is too long to measure.';
  }
  return null;
}

function sanitiseBasis(
  basis: Record<string, number | string | null>
): Record<string, number | string | null> {
  const out: Record<string, number | string | null> = {};
  for (const [k, v] of Object.entries(basis)) {
    out[k] = typeof v === 'number' ? finiteOrNull(v) : v;
  }
  return out;
}

function unmeasured(
  key: ScoreDimensionKey,
  reason: string,
  basis: Record<string, number | string | null> = {}
): DimensionResult {
  return {
    key,
    value: null,
    max: SCORE_DIMENSIONS[key].max,
    ratio: null,
    unmeasured: reason,
    basis: sanitiseBasis(basis),
  };
}

/**
 * Scale a 0..1 ratio into a dimension's points.
 *
 * The value is rounded to a whole point. Fractional points would make the
 * total a fraction, and then every surface rounds the parts and the total
 * separately and they stop adding up — the pill has disagreed with its own
 * breakdown once already. `ratio` keeps the unrounded quantity for anyone who
 * needs it.
 *
 * A non-finite ratio cannot reach here from the functions below; if one ever
 * does, it becomes "unmeasured" rather than a NaN in someone's standing.
 */
function measured(
  key: ScoreDimensionKey,
  rawRatio: number,
  basis: Record<string, number | string | null>
): DimensionResult {
  if (!Number.isFinite(rawRatio)) {
    return unmeasured(key, 'The inputs produced a number that is not finite.', basis);
  }
  const ratio = clamp01(rawRatio);
  const max = SCORE_DIMENSIONS[key].max;
  return {
    key,
    value: clampDimension(key, Math.round(ratio * max)),
    max,
    ratio,
    unmeasured: null,
    basis: sanitiseBasis(basis),
  };
}

// ============================================================================
// Runway health — max 250
// ============================================================================

export interface RunwaySample {
  /** When the reading was taken, epoch ms. */
  at: number;
  /** Hours of queued work ahead of the fleet at that instant. */
  runwayHours: number;
}

export interface RunwayHealthInput {
  samples: readonly RunwaySample[];
  window: TimeWindow;
}

/**
 * "How consistently you kept work queued ahead of the fleet."
 *
 * FORMULA
 *   health(t) = min(1, runwayHours(t) / RUNWAY_TARGET_HOURS)
 *   ratio     = time-weighted mean of health(t) over the covered time
 *
 * `runwayHours(t)` is a step function: each sample holds until the next one or
 * the end of the window, but for no longer than
 * `RUNWAY_SAMPLE_MAX_HOLD_MINUTES`. The covered time is the time some sample
 * is holding.
 *
 * UNITS  `at`, `window.from`, `window.to`: epoch milliseconds.
 *        `runwayHours`: hours.
 *
 * WHAT IS LEFT OUT, AND WHY
 * - Time before the first sample in the window is excluded from the
 *   denominator. It is not counted as zero runway, because it is not known to
 *   have been zero — nobody was looking.
 * - A sample taken before `from` is not carried into the window, even though
 *   under a step-function reading it would still be holding. Carrying it in
 *   would let one old reading stand for an arbitrary stretch of a window it was
 *   never taken in.
 * - Samples with a non-finite time or value are dropped and counted. A negative
 *   runway is read as an empty queue (0), not as a penalty beyond empty.
 * - The cap at 1 is deliberate: forty hours of queued work is not ten times
 *   healthier than four. Past the threshold the conductor is ahead; how far
 *   ahead is not rewarded, or the dimension would pay for hoarding stale plans.
 *
 * - Time past a sample's hold is excluded too, for the same reason: when the
 *   readings stop, nobody was measuring. See `RUNWAY_SAMPLE_MAX_HOLD_MINUTES`.
 *
 * UNMEASURED when fewer than `MIN_RUNWAY_SAMPLES` samples fall in the window,
 * when the covered time is under `MIN_RUNWAY_COVERED_MINUTES` (which includes
 * zero: every sample at the window's end), or when the window itself is
 * unusable.
 *
 * KNOWN LIMITS
 * - Runway is itself an estimate today: queue length multiplied by a fixed
 *   duration per item, plus remaining-time guesses for live sessions. This
 *   dimension inherits that. It measures how consistently the *estimate* stayed
 *   above four hours, and it can be raised by queueing many trivial items.
 * - It only sees the time runway was being sampled. Hours when the cockpit was
 *   not running are neither credited nor held against the score;
 *   `basis.unobservedHours` says how many there were. A window that was
 *   sampled for one good hour scores on that hour.
 */
export function computeRunwayHealth(input: RunwayHealthInput): DimensionResult {
  const key: ScoreDimensionKey = 'runwayHealth';
  const problem = windowProblem(input.window);
  if (problem) return unmeasured(key, problem, { targetHours: RUNWAY_TARGET_HOURS });
  const { from, to } = input.window;

  let dropped = 0;
  const inWindow: RunwaySample[] = [];
  for (const s of input.samples ?? []) {
    if (!s || !isFiniteNumber(s.at) || !isFiniteNumber(s.runwayHours)) {
      dropped += 1;
      continue;
    }
    if (s.at >= from && s.at <= to) inWindow.push(s);
  }
  // The input is documented as time-ordered, but a score that silently depends
  // on row order is a score that changes when a query loses its ORDER BY.
  // Array.prototype.sort is stable, so equal timestamps keep their input order.
  const samples = [...inWindow].sort((a, b) => a.at - b.at);

  const baseBasis = {
    samples: samples.length,
    droppedSamples: dropped,
    targetHours: RUNWAY_TARGET_HOURS,
    windowHours: (to - from) / MS_PER_HOUR,
  };

  if (samples.length < MIN_RUNWAY_SAMPLES) {
    return unmeasured(
      key,
      `Fewer than ${MIN_RUNWAY_SAMPLES} runway samples were recorded in the window, so there is no history to average.`,
      baseBasis
    );
  }

  const maxHoldMs = RUNWAY_SAMPLE_MAX_HOLD_MINUTES * MS_PER_MINUTE;

  let coveredMs = 0; // time some reading is taken to stand for
  let healthMs = 0; // ∫ health(t) dt over the covered time
  let hoursMs = 0; // ∫ runwayHours(t) dt, uncapped, for the basis only
  let unobservedMs = 0; // time past a reading's hold, left out
  for (let i = 0; i < samples.length; i += 1) {
    const until = i + 1 < samples.length ? samples[i + 1].at : to;
    const gap = until - samples[i].at;
    if (!(gap > 0)) continue;
    const dt = Math.min(gap, maxHoldMs);
    const hours = Math.max(0, samples[i].runwayHours);
    coveredMs += dt;
    healthMs += Math.min(1, hours / RUNWAY_TARGET_HOURS) * dt;
    hoursMs += hours * dt;
    unobservedMs += gap - dt;
  }

  if (!(coveredMs > 0)) {
    return unmeasured(
      key,
      'Every runway sample sits at the very end of the window, so no time is covered.',
      baseBasis
    );
  }

  if (coveredMs < MIN_RUNWAY_COVERED_MINUTES * MS_PER_MINUTE) {
    return unmeasured(
      key,
      `Runway was sampled for ${Math.floor(coveredMs / MS_PER_MINUTE)} minutes in the window; ` +
        `at least ${MIN_RUNWAY_COVERED_MINUTES} are needed before it says how consistently work was kept queued.`,
      { ...baseBasis, coveredHours: coveredMs / MS_PER_HOUR, minimumCoveredMinutes: MIN_RUNWAY_COVERED_MINUTES }
    );
  }

  return measured(key, healthMs / coveredMs, {
    ...baseBasis,
    coveredHours: coveredMs / MS_PER_HOUR,
    meanRunwayHours: hoursMs / coveredMs,
    unobservedHours: unobservedMs / MS_PER_HOUR,
    maxHoldMinutes: RUNWAY_SAMPLE_MAX_HOLD_MINUTES,
  });
}

// ============================================================================
// Fleet utilization — max 200
// ============================================================================

export interface SessionInterval {
  /** When the session started working, epoch ms. */
  start: number;
  /** When it stopped, epoch ms. Null means still running: treated as `window.to`. */
  end: number | null;
}

export interface FleetUtilizationInput {
  sessions: readonly SessionInterval[];
  /** Concurrent agent slots available. A whole number, at least 1. */
  capacity: number | null | undefined;
  window: TimeWindow;
}

/**
 * "How much of your agent capacity was actually working."
 *
 * FORMULA
 *   busy(t) = min(1, activeSessions(t) / capacity)
 *   ratio   = time-weighted mean of busy(t) over the WORKING SPAN
 *
 * The working span runs from the earliest session start to the latest session
 * end, after every session has been clipped to the window, LESS any stretch of
 * more than `WORKING_BREAK_MINUTES` in which nothing ran. It is NOT the whole
 * window. A conductor who works nine to five is not idle for the other sixteen
 * hours; averaging over the window would score the length of their evening,
 * and so would counting the night between two working days.
 *
 * UNITS  `start`, `end`, window: epoch milliseconds. `capacity`: a count of
 *        concurrent slots.
 *
 * IT IS A RATIO, NEVER A COUNT — TRD 16 §3.1. Doubling the fleet and doubling
 * the work leaves it unchanged, and adding capacity that sits unused lowers
 * it. Otherwise the score would reward buying more agents rather than
 * conducting them well, and a leaderboard built on it would rank budgets.
 * `busy(t)` is capped at 1 so running more sessions than the declared capacity
 * earns nothing extra.
 *
 * It is computed by a sweep over interval endpoints, exactly, rather than by
 * sampling: a sampled mean changes with the sampling interval, and a score
 * that moves when you change a polling constant is not a measurement.
 *
 * WHAT IS LEFT OUT
 * - Sessions with a non-finite start, or an end before their start, are
 *   invalid and excluded. So are sessions with no extent inside the window —
 *   a session that started and ended in the same millisecond did no work, and
 *   letting it stretch the working span would count a failed spawn as hours of
 *   idle fleet.
 *
 * UNMEASURED when no session has any extent inside the window, when capacity
 * is missing, below 1 or not a whole number (rounding it would pick a
 * denominator nobody declared), or when the window is unusable.
 *
 * KNOWN LIMITS
 * - "Active" is whatever the caller says it is. A session that is open but
 *   blocked on a human counts as working unless the caller cuts the interval
 *   where the work stopped. Leaving sessions open raises this dimension.
 * - The break line is a cliff. A gap of 30 minutes is idle in full and one of
 *   31 is not counted at all, so a conductor who waits out the line pays
 *   nothing for it. It marks down the short gaps between tasks, which is the
 *   idleness that says something about conducting, and cannot tell a long
 *   lunch from a fleet left waiting.
 * - A single ten-minute session on a one-slot fleet scores full marks: the
 *   span is the session. The dimension says how full the fleet was while it
 *   ran, not how much it ran.
 * - Locally, capacity is self-declared, and declaring less raises the ratio.
 *   Ranked scores come from the benchmark substrate, where the harness fixes
 *   fleet size.
 */
export function computeFleetUtilization(input: FleetUtilizationInput): DimensionResult {
  const key: ScoreDimensionKey = 'fleetUtilization';
  const capacity = input.capacity;
  const problem = windowProblem(input.window);
  if (problem) return unmeasured(key, problem, { capacity: isValidCapacity(capacity) ? capacity : null });
  const { from, to } = input.window;

  if (!isValidCapacity(capacity)) {
    return unmeasured(
      key,
      'Fleet capacity is not recorded as a whole number of at least 1, so there is nothing to take a ratio against.',
      { capacity: null, windowHours: (to - from) / MS_PER_HOUR }
    );
  }

  // Clip every session to the window and keep the ones with real extent.
  let excluded = 0;
  const clipped: { s: number; e: number }[] = [];
  for (const session of input.sessions ?? []) {
    if (!session || !isFiniteNumber(session.start)) {
      excluded += 1;
      continue;
    }
    const rawEnd = session.end === null || session.end === undefined ? to : session.end;
    if (!isFiniteNumber(rawEnd) || rawEnd < session.start) {
      excluded += 1;
      continue;
    }
    const s = Math.max(session.start, from);
    const e = Math.min(rawEnd, to);
    if (e > s) clipped.push({ s, e });
    else excluded += 1;
  }

  const baseBasis = {
    sessions: clipped.length,
    excludedSessions: excluded,
    capacity,
    windowHours: (to - from) / MS_PER_HOUR,
  };

  if (clipped.length === 0) {
    return unmeasured(key, 'No session was running inside the window.', baseBasis);
  }

  // Sweep. Ends sort before starts at the same instant, so a session that
  // hands over to the next at exactly the same millisecond is not counted as
  // two running at once. (It makes no difference to the integral — the
  // interval between them has zero length — only to the reported peak.)
  const points: { t: number; delta: number }[] = [];
  for (const { s, e } of clipped) {
    points.push({ t: s, delta: 1 }, { t: e, delta: -1 });
  }
  points.sort((a, b) => a.t - b.t || a.delta - b.delta);

  const breakMs = WORKING_BREAK_MINUTES * MS_PER_MINUTE;

  let active = 0;
  let peak = 0;
  let spanMs = 0; // the working span: everything except breaks
  let busyMs = 0; // ∫ min(1, active / capacity) dt
  let sessionMs = 0; // ∫ active dt, uncapped, for the basis only
  let breaks = 0;
  let breakTotalMs = 0;
  let prev = points[0].t;
  for (const point of points) {
    const dt = point.t - prev;
    if (dt > 0) {
      if (active === 0 && dt > breakMs) {
        // Nothing ran for longer than a break: the fleet was not being worked,
        // so this is not capacity that went unused. Left out whole.
        breaks += 1;
        breakTotalMs += dt;
      } else {
        spanMs += dt;
        busyMs += Math.min(1, active / capacity) * dt;
        sessionMs += active * dt;
      }
    }
    active += point.delta;
    if (active > peak) peak = active;
    prev = point.t;
  }

  if (!(spanMs > 0)) {
    return unmeasured(key, 'No session was running inside the window.', baseBasis);
  }

  return measured(key, busyMs / spanMs, {
    ...baseBasis,
    workingSpanHours: spanMs / MS_PER_HOUR,
    meanActiveSessions: sessionMs / spanMs,
    peakActiveSessions: peak,
    breaksExcluded: breaks,
    breakHoursExcluded: breakTotalMs / MS_PER_HOUR,
    breakMinutes: WORKING_BREAK_MINUTES,
  });
}

// ============================================================================
// Plan accuracy — max 200
// ============================================================================

export interface EstimatedTask {
  /** What the plan said the task would take, in minutes. Null when there was no estimate. */
  estimatedMinutes: number | null;
  /** What it actually took, in minutes. Null when the task never ran to an end. */
  actualMinutes: number | null;
}

export interface PlanAccuracyInput {
  tasks: readonly EstimatedTask[];
}

/**
 * "How close your plan estimates landed to what actually happened."
 *
 * FORMULA  for each task with both a positive estimate and a positive actual:
 *   error = |estimated − actual| / max(estimated, actual)
 *   ratio = 1 − mean(error)
 *
 * UNITS  minutes for both. The error is a ratio, so any unit works as long as
 *        both sides of one task use the same one.
 *
 * The error is symmetric and bounded: it lies in [0, 1), so an estimate of 10
 * against an actual of 20 costs the same as 20 against 10 (0.5 each), and one
 * catastrophic miss cannot push the mean below zero. Dividing by the estimate
 * instead — the usual "percent over" — is unbounded above and would make
 * under-estimating far more expensive than over-estimating, which teaches
 * padding rather than accuracy.
 *
 * TASKS THAT NEVER RAN ARE EXCLUDED, NEVER COUNTED AS PERFECT. So are tasks
 * with no estimate. A task with nothing to compare has an undefined error, not
 * a zero one; counting it as zero is how a plan nobody executed would score
 * 200 of 200. Zero, negative and non-finite durations are treated the same
 * way — a zero-minute task is a missing measurement, not a fast one.
 *
 * UNMEASURED when fewer than `MIN_TASKS_FOR_ACCURACY` tasks qualify. One lucky
 * task is not accuracy.
 *
 * KNOWN LIMITS
 * - Survivorship. The tasks that fail or get abandoned are often the ones that
 *   were estimated worst, and they are exactly the ones excluded. A plan where
 *   half the tasks never finished can still score well on the half that did.
 *   `basis.excludedTasks` is there so that is visible beside the number.
 * - It is an unweighted mean: a five-minute task counts as much as a five-hour
 *   one.
 * - It says nothing about whether the estimate existed before the work did. An
 *   estimate written or revised after the fact scores perfectly. The caller
 *   must supply the estimate as it stood at dispatch.
 */
export function computePlanAccuracy(input: PlanAccuracyInput): DimensionResult {
  const key: ScoreDimensionKey = 'planAccuracy';

  let qualified = 0;
  let neverRan = 0;
  let noEstimate = 0;
  let errorSum = 0;
  for (const task of input.tasks ?? []) {
    const actual = task ? task.actualMinutes : null;
    const estimate = task ? task.estimatedMinutes : null;
    // Never-ran is checked first: a task with neither number is reported as
    // never having run, which is the more useful thing to know about it.
    if (!isFiniteNumber(actual) || actual <= 0) {
      neverRan += 1;
      continue;
    }
    if (!isFiniteNumber(estimate) || estimate <= 0) {
      noEstimate += 1;
      continue;
    }
    errorSum += Math.abs(estimate - actual) / Math.max(estimate, actual);
    qualified += 1;
  }

  const baseBasis = {
    qualifyingTasks: qualified,
    excludedTasks: neverRan + noEstimate,
    excludedNeverRan: neverRan,
    excludedNoEstimate: noEstimate,
    minimumTasks: MIN_TASKS_FOR_ACCURACY,
  };

  if (qualified < MIN_TASKS_FOR_ACCURACY) {
    return unmeasured(
      key,
      `Fewer than ${MIN_TASKS_FOR_ACCURACY} tasks have both an estimate and an actual duration; one lucky task is not accuracy.`,
      baseBasis
    );
  }

  const meanError = errorSum / qualified;
  return measured(key, 1 - meanError, { ...baseBasis, meanError });
}

// ============================================================================
// Cost efficiency — max 150
// ============================================================================

export interface UsageEntry {
  /** The model the work actually ran on. Carried for provenance; not used in the maths. */
  model: string | null;
  /** What it actually cost, US dollars. */
  costUsd: number;
  /**
   * What THE SAME TOKENS would have cost on the reference (most expensive)
   * model, US dollars. The caller computes this — this module does not know
   * anyone's price list and must not pretend to.
   */
  baselineCostUsd: number;
}

export interface CostEfficiencyInput {
  usage: readonly UsageEntry[];
  /**
   * Which model the baseline was priced at. Echoed into `basis` so a saving is
   * never reported without saying what it is a saving against. Optional
   * because it changes no arithmetic.
   */
  referenceModel?: string | null;
}

/**
 * "Saving against running everything on the most expensive model."
 *
 * FORMULA
 *   ratio = clamp(1 − Σ costUsd / Σ baselineCostUsd, 0, 1)
 *
 * UNITS  US dollars on both sides. One entry per task or per session — the
 *        granularity does not matter because only the sums are used.
 *
 * It is a ratio of sums, not a mean of per-entry ratios, so each dollar counts
 * once: a ninety-percent saving on a one-cent task does not offset paying full
 * price on a ninety-dollar one.
 *
 * A FLEET THAT RUNS EVERYTHING ON THE REFERENCE MODEL SCORES 0, BY
 * CONSTRUCTION. That is not a bug and not a penalty — it is what the dimension
 * means. There is no saving against the most expensive option when you chose
 * the most expensive option. It is also why this is weighted lowest of the big
 * four (150): sending hard work to the strongest model is frequently the right
 * call, and being slow costs more than being wasteful.
 *
 * Entries with a negative or non-finite cost or baseline are excluded and
 * counted. Spending more than the baseline (possible when the caller's baseline
 * omits something the actual bill includes) floors at 0 rather than going
 * negative.
 *
 * UNMEASURED when there are no usable entries or the baseline sums to zero or
 * less — with no tokens priced there is nothing to have saved against.
 *
 * KNOWN LIMITS
 * - THE BASELINE FLATTERS CHEAP MODELS THAT USE MORE TOKENS. The baseline is
 *   the tokens that were actually used, repriced. A cheaper model that needs
 *   three attempts and twice the tokens to finish a task inflates its own
 *   baseline and so shows a larger "saving" than a model that got it right
 *   once. The honest baseline — what the reference model would have spent on
 *   the same task — is a counterfactual nobody ran. This dimension does not
 *   measure it and should not be read as if it did.
 * - It rewards cheapness, not value. Work that failed cheaply scores well.
 * - Which model is "the most expensive" is the caller's choice and moves with
 *   price lists. Two scores are comparable on this dimension only if they were
 *   priced against the same reference; `basis.referenceModel` records it.
 */
export function computeCostEfficiency(input: CostEfficiencyInput): DimensionResult {
  const key: ScoreDimensionKey = 'costEfficiency';

  let entries = 0;
  let excluded = 0;
  let cost = 0;
  let baseline = 0;
  const models = new Set<string>();
  for (const entry of input.usage ?? []) {
    if (
      !entry ||
      !isFiniteNumber(entry.costUsd) ||
      !isFiniteNumber(entry.baselineCostUsd) ||
      entry.costUsd < 0 ||
      entry.baselineCostUsd < 0
    ) {
      excluded += 1;
      continue;
    }
    entries += 1;
    cost += entry.costUsd;
    baseline += entry.baselineCostUsd;
    models.add(typeof entry.model === 'string' && entry.model ? entry.model : 'unknown');
  }

  const baseBasis = {
    entries,
    excludedEntries: excluded,
    costUsd: cost,
    baselineCostUsd: baseline,
    referenceModel: typeof input.referenceModel === 'string' ? input.referenceModel : null,
    // Sorted so the same usage in a different row order gives the same basis.
    models: entries > 0 ? [...models].sort().join(', ') : null,
  };

  if (entries === 0) {
    return unmeasured(key, 'No usage with a cost and a baseline cost was recorded.', baseBasis);
  }
  if (!(baseline > 0)) {
    return unmeasured(
      key,
      'The baseline cost is zero, so there is nothing to have saved against.',
      baseBasis
    );
  }

  return measured(key, 1 - cost / baseline, baseBasis);
}

// ============================================================================
// Velocity trend — max 100
// ============================================================================

export interface VelocityTrendInput {
  /** When each task completed, epoch ms. Order does not matter. */
  completions: readonly number[];
  window: TimeWindow;
  /** Share of the window, from its end, that counts as recent. Strictly between 0 and 1. */
  recentFraction?: number;
}

/**
 * "Whether your throughput is rising or falling."
 *
 * FORMULA
 *   baselineRate = completions in the window        / window hours
 *   recentRate   = completions in the recent slice  / recent slice hours
 *   r            = recentRate / baselineRate
 *   ratio        = clamp(r / 2, 0, 1)
 *
 * The recent slice is the last `recentFraction` of the window (a quarter by
 * default), boundary included. The baseline is the whole window, recent slice
 * and all.
 *
 * UNITS  epoch milliseconds in; rates are completions per hour.
 *
 * WHY r / 2. Steady throughput (r = 1) is HALF marks, doubling is full marks,
 * stopping is zero. A trend dimension that paid full marks for merely holding
 * steady would be a participation prize, and one that paid nothing for it would
 * punish the sustainable case. Halfway is the neutral point.
 *
 * UNMEASURED when fewer than `MIN_COMPLETIONS_FOR_TREND` completions fall in
 * the window, when the window has zero length or is unusable, or when
 * `recentFraction` is not strictly between 0 and 1 (at 1 the recent slice is
 * the baseline and r is always exactly 1; a caller who asks for that is asking
 * for a constant). An invalid fraction is not silently replaced with the
 * default — that would report a number computed some other way than asked.
 *
 * KNOWN LIMITS — THIS IS THE NOISIEST DIMENSION, AND THAT IS WHY IT IS CAPPED
 * AT 100.
 * - It is a ratio of two small counts. At the minimum of four completions, one
 *   completion landing a minute either side of the recent boundary moves the
 *   dimension by fifty points. More data narrows that; a single session rarely
 *   has enough.
 * - It counts completions, not their size. Ten one-line tasks finishing late
 *   outscore one large migration finishing early.
 * - It is trivially steered by timing: hold finished work back and release it
 *   in the last quarter, or pick the window. On identical benchmark tasks under
 *   a fixed harness there is far less room for that, which is one more reason
 *   ranked scores come from there.
 * - Because the baseline includes the recent slice, r cannot exceed
 *   1 / recentFraction. At the default that is 4, comfortably above the 2 that
 *   earns full marks, so the cap is the formula's and not an artefact.
 */
export function computeVelocityTrend(input: VelocityTrendInput): DimensionResult {
  const key: ScoreDimensionKey = 'velocityTrend';
  const fraction =
    input.recentFraction === undefined ? DEFAULT_RECENT_FRACTION : input.recentFraction;
  const fractionOk = isFiniteNumber(fraction) && fraction > 0 && fraction < 1;

  const problem = windowProblem(input.window);
  if (problem) return unmeasured(key, problem, { recentFraction: fractionOk ? fraction : null });
  const { from, to } = input.window;
  const windowMs = to - from;

  if (!fractionOk) {
    return unmeasured(key, 'The recent fraction must be strictly between 0 and 1.', {
      recentFraction: null,
      windowHours: windowMs / MS_PER_HOUR,
    });
  }

  const recentStart = to - fraction * windowMs;
  let total = 0;
  let recent = 0;
  for (const at of input.completions ?? []) {
    if (!isFiniteNumber(at) || at < from || at > to) continue;
    total += 1;
    if (at >= recentStart) recent += 1;
  }

  const baseBasis = {
    completions: total,
    recentCompletions: recent,
    recentFraction: fraction,
    windowHours: windowMs / MS_PER_HOUR,
    minimumCompletions: MIN_COMPLETIONS_FOR_TREND,
  };

  if (total < MIN_COMPLETIONS_FOR_TREND) {
    return unmeasured(
      key,
      `Fewer than ${MIN_COMPLETIONS_FOR_TREND} tasks completed in the window, which is too few to call a trend.`,
      baseBasis
    );
  }

  const windowHours = windowMs / MS_PER_HOUR;
  const baselineRate = total / windowHours;
  const recentRate = recent / (fraction * windowHours);
  // baselineRate > 0 here: total >= MIN_COMPLETIONS_FOR_TREND and the window is finite.
  const r = recentRate / baselineRate;

  return measured(key, r / 2, {
    ...baseBasis,
    baselinePerHour: baselineRate,
    recentPerHour: recentRate,
    rateRatio: r,
  });
}

// ============================================================================
// Parallelization quality — max 100
// ============================================================================

export interface ExecutedTask {
  id: string;
  /** When the task actually started, epoch ms. */
  start: number;
  /** When it actually ended, epoch ms. */
  end: number;
  /** Ids of tasks in the same plan this one had to wait for. Unknown ids are ignored. */
  dependsOn: readonly string[];
  /**
   * Files the task ACTUALLY touched — not the files the plan predicted. An
   * empty array means "touched nothing". Null means "not recorded", which is a
   * different thing: contention between two concurrent tasks cannot be assessed
   * if nobody wrote down what either of them changed, and passing `[]` there
   * would award a clean bill of health nobody checked.
   */
  files: readonly string[] | null;
}

export interface ExecutedPlan {
  tasks: readonly ExecutedTask[];
  /** Concurrent slots available while THIS plan ran. Falls back to the input's `capacity`. */
  capacity?: number | null;
}

export interface ParallelizationInput {
  plans: readonly ExecutedPlan[];
  /** Concurrent slots available, for any plan that does not carry its own. */
  capacity: number | null | undefined;
}

/** One plan's working, exposed so a per-plan view can show it. */
export interface PlanParallelization {
  /** 0..1, or null when this plan cannot be measured. */
  ratio: number | null;
  /** Why this plan cannot be measured — null when it can. */
  unmeasured: string | null;
  /** Tasks with a valid interval. */
  tasks: number;
  /** Tasks dropped for a non-finite or negative interval. */
  excludedTasks: number;
  /** W: summed task durations, ms. */
  workMs: number;
  /** T: first start to last end, ms. */
  wallClockMs: number;
  /** C: the longest dependency chain by actual duration, ms. Null when the graph has a cycle. */
  criticalPathMs: number | null;
  /** A = W / T. */
  achievedConcurrency: number | null;
  /** M = min(capacity, W / C). */
  maxConcurrency: number | null;
  /** clamp(A / M, 0, 1), before the contention penalty. */
  baseRatio: number | null;
  /** Pairs of tasks whose intervals overlapped in time. */
  overlappingPairs: number;
  /** Of those, pairs that touched at least one common file. */
  contendedPairs: number;
}

/**
 * Longest path through the dependency graph, weighted by each task's actual
 * duration. Returns null when the graph has a cycle.
 *
 * Kahn's algorithm with a longest-finish relaxation. `deps[i]` holds indices
 * into `durations`; edges to ids outside the plan were already dropped by the
 * caller. Iteration order follows input order, so the result does not depend
 * on anything but the input.
 */
function criticalPathMs(durations: readonly number[], deps: readonly number[][]): number | null {
  const n = durations.length;
  const dependents: number[][] = durations.map(() => []);
  const waitingOn: number[] = deps.map((d) => d.length);
  deps.forEach((ds, i) => ds.forEach((j) => dependents[j].push(i)));

  const finish: number[] = new Array<number>(n).fill(0);
  const queue: number[] = [];
  for (let i = 0; i < n; i += 1) if (waitingOn[i] === 0) queue.push(i);

  let longest = 0;
  let visited = 0;
  for (let head = 0; head < queue.length; head += 1) {
    const i = queue[head];
    visited += 1;
    let earliest = 0;
    for (const j of deps[i]) if (finish[j] > earliest) earliest = finish[j];
    finish[i] = earliest + durations[i];
    if (finish[i] > longest) longest = finish[i];
    for (const k of dependents[i]) {
      waitingOn[k] -= 1;
      if (waitingOn[k] === 0) queue.push(k);
    }
  }
  // Anything left unvisited is on, or downstream of, a cycle.
  return visited === n ? longest : null;
}

function emptyPlanResult(reason: string, tasks = 0, excludedTasks = 0): PlanParallelization {
  return {
    ratio: null,
    unmeasured: reason,
    tasks,
    excludedTasks,
    workMs: 0,
    wallClockMs: 0,
    criticalPathMs: null,
    achievedConcurrency: null,
    maxConcurrency: null,
    baseRatio: null,
    overlappingPairs: 0,
    contendedPairs: 0,
  };
}

/**
 * Parallelization quality for one executed plan. See
 * `computeParallelizationQuality` for the definition; this is steps (a)–(e).
 */
export function measurePlanParallelization(
  plan: ExecutedPlan,
  capacity: number | null | undefined
): PlanParallelization {
  if (!isValidCapacity(capacity)) {
    return emptyPlanResult(
      'Fleet capacity is not recorded as a whole number of at least 1, so the most the plan could have run at once is unknown.'
    );
  }

  // Keep tasks with a real interval. A negative duration is a recording error,
  // not a very fast task, and is excluded; its edges go with it.
  let excluded = 0;
  const tasks: ExecutedTask[] = [];
  for (const task of plan?.tasks ?? []) {
    if (
      !task ||
      typeof task.id !== 'string' ||
      !isFiniteNumber(task.start) ||
      !isFiniteNumber(task.end) ||
      task.end < task.start
    ) {
      excluded += 1;
      continue;
    }
    tasks.push(task);
  }

  if (tasks.length < MIN_TASKS_FOR_PARALLELIZATION) {
    return emptyPlanResult(
      `The plan has fewer than ${MIN_TASKS_FOR_PARALLELIZATION} tasks with a recorded start and end, so there was nothing to run in parallel.`,
      tasks.length,
      excluded
    );
  }

  const index = new Map<string, number>();
  for (let i = 0; i < tasks.length; i += 1) {
    if (index.has(tasks[i].id)) {
      // Two tasks answering to one id make every edge that names it ambiguous.
      // Guessing which was meant would be inventing the dependency graph.
      return emptyPlanResult(
        'Two tasks in the plan share an id, so its dependency graph is ambiguous.',
        tasks.length,
        excluded
      );
    }
    index.set(tasks[i].id, i);
  }

  // (a) total work and (b) wall-clock.
  const durations = tasks.map((t) => t.end - t.start);
  let workMs = 0;
  let firstStart = Infinity;
  let lastEnd = -Infinity;
  for (let i = 0; i < tasks.length; i += 1) {
    workMs += durations[i];
    if (tasks[i].start < firstStart) firstStart = tasks[i].start;
    if (tasks[i].end > lastEnd) lastEnd = tasks[i].end;
  }
  const wallClockMs = lastEnd - firstStart;

  // Finite timestamps far enough apart overflow when subtracted or summed.
  // That is a recording error on a scale no real plan reaches; refuse it here
  // so that no Infinity gets as far as a division.
  if (!Number.isFinite(workMs) || !Number.isFinite(wallClockMs)) {
    return emptyPlanResult(
      "The plan's recorded task times are out of range.",
      tasks.length,
      excluded
    );
  }

  const partial: PlanParallelization = {
    ...emptyPlanResult('', tasks.length, excluded),
    workMs,
    wallClockMs,
  };

  if (!(workMs > 0) || !(wallClockMs > 0)) {
    return {
      ...partial,
      unmeasured: 'Every task in the plan has zero recorded duration, so no work was measured.',
    };
  }

  // (c) duration-weighted critical path. Edges to ids not in the plan —
  // including tasks excluded above — are ignored; duplicates are collapsed.
  const deps: number[][] = tasks.map((task) => {
    const seen = new Set<number>();
    for (const id of task.dependsOn ?? []) {
      const j = index.get(id);
      if (j !== undefined) seen.add(j);
    }
    return [...seen];
  });
  const critical = criticalPathMs(durations, deps);
  if (critical === null) {
    return {
      ...partial,
      unmeasured:
        "The plan's dependencies contain a cycle, so it has no critical path to measure against.",
    };
  }
  if (!(critical > 0)) {
    return {
      ...partial,
      criticalPathMs: critical,
      unmeasured: "The plan's critical path has zero duration.",
    };
  }

  const achieved = workMs / wallClockMs;
  const maxConcurrency = Math.min(capacity, workMs / critical);
  // maxConcurrency >= 1: capacity >= 1, and the critical path is a subset of
  // the tasks so workMs >= critical.
  const baseRatio = clamp01(achieved / maxConcurrency);

  // (e) contention. O(n²) pairs on purpose: plans are tens of tasks, and an
  // interval tree here would be more code to get wrong than time to save.
  // Two tasks overlap only if they shared an instant of positive length —
  // one ending exactly when the next begins is a hand-over, not concurrency.
  const fileSets = tasks.map((t) => (t.files == null ? null : new Set(t.files)));
  let overlappingPairs = 0;
  let contendedPairs = 0;
  let unknownPairs = 0;
  for (let i = 0; i < tasks.length; i += 1) {
    for (let j = i + 1; j < tasks.length; j += 1) {
      const overlap =
        Math.max(tasks[i].start, tasks[j].start) < Math.min(tasks[i].end, tasks[j].end);
      if (!overlap) continue;
      overlappingPairs += 1;
      const a = fileSets[i];
      const b = fileSets[j];
      if (a === null || b === null) {
        unknownPairs += 1;
        continue;
      }
      const [small, large] = a.size <= b.size ? [a, b] : [b, a];
      let shared = false;
      for (const file of small) {
        if (large.has(file)) {
          shared = true;
          break;
        }
      }
      if (shared) contendedPairs += 1;
    }
  }

  const working: PlanParallelization = {
    ...partial,
    criticalPathMs: critical,
    achievedConcurrency: achieved,
    maxConcurrency,
    baseRatio,
    overlappingPairs,
    contendedPairs,
  };

  if (unknownPairs > 0) {
    return {
      ...working,
      unmeasured:
        'Some tasks that ran at the same time have no record of the files they touched, so contention cannot be assessed.',
    };
  }

  const contention = overlappingPairs === 0 ? 0 : contendedPairs / overlappingPairs;
  return { ...working, unmeasured: null, ratio: clamp01(baseRatio * (1 - contention)) };
}

/**
 * "How well your plans exploited work that was genuinely independent."
 *
 * FORMULA, per plan
 *   (a) W = Σ (end − start)                    total work
 *   (b) T = max(end) − min(start)              wall-clock
 *       A = W / T                              achieved concurrency
 *   (c) C = longest dependency chain, by actual task duration
 *       M = min(capacity, W / C)               most the plan allowed
 *   (d) base = clamp(A / M, 0, 1)
 *   (e) p = contended overlapping pairs / overlapping pairs   (0 if none overlap)
 *       ratio = base × (1 − p)
 * Across plans: the mean of the per-plan ratios, weighted by each plan's W.
 *
 * UNITS  `start`, `end`: epoch milliseconds. `capacity`: concurrent slots.
 *        `files`: paths, compared as exact strings — the caller normalises.
 *
 * WHAT THIS REWARDS. The denominator is what the dependency graph *permitted*,
 * not a fixed ideal. A plan that is a single chain — every task waiting on the
 * one before — has W / C = 1: there was nothing to parallelise, and running it
 * one task at a time scores full marks. The same number of *independent* tasks
 * run one at a time scores 1 / min(capacity, n). The dimension punishes
 * leaving real independence on the table, and does not punish work that was
 * serial by nature.
 *
 * THE CONTENTION PENALTY. Two tasks that ran at the same time and touched the
 * same file were not independent, whatever the plan said. `p` is the share of
 * concurrently-running pairs that did so. Tasks that share a file but ran one
 * after the other are not penalised — that is the correct way to schedule
 * them.
 *
 * WHAT IS LEFT OUT
 * - Tasks with a non-finite or negative interval are excluded, and their edges
 *   with them. Zero-duration tasks are kept (they carry dependencies) but add
 *   no work.
 * - Edges to ids not in the plan are ignored.
 * - A plan that cannot be measured is skipped, not scored as zero.
 *
 * A PLAN IS UNMEASURED when it has fewer than two tasks with valid intervals;
 * when W, T or C is zero; when its dependencies contain a cycle (there is no
 * longest path through a loop, and a plan with one was never executable as
 * written); when two of its tasks share an id; when capacity is missing or
 * below 1; or when two tasks that overlapped have no record of the files they
 * touched (`files: null`). THE DIMENSION IS UNMEASURED when no plan is
 * measurable.
 *
 * KNOWN LIMITS
 * - T is wall-clock, so waiting counts. A plan that paused overnight for a
 *   human to approve the next wave scores as badly parallelised. That is a
 *   property of the session, not of the plan's shape.
 * - M is an upper bound, not always reachable. With capacity limits and
 *   awkward task lengths the best possible schedule can fall short of
 *   min(capacity, W / C), so a perfectly scheduled plan can score below full
 *   marks.
 * - C uses durations as they turned out, so a task that ran long also
 *   lengthens the critical path and lowers the bar it is judged against.
 * - The dependency edges are the plan's own declaration. Declaring
 *   dependencies that do not exist makes any plan look optimally serial.
 * - `p` is a share of pairs, so it is coarse on small plans: when only one
 *   pair overlapped and it shared a file, the plan scores zero.
 * - The penalty sees files, not conflicts. Two tasks appending to one
 *   changelog are penalised the same as two rewriting one function, and two
 *   tasks that broke each other through different files are not seen at all.
 */
export function computeParallelizationQuality(input: ParallelizationInput): DimensionResult {
  const key: ScoreDimensionKey = 'parallelizationQuality';
  const plans = input.plans ?? [];

  let measuredPlans = 0;
  let tasks = 0;
  let workMs = 0;
  let weightedRatio = 0;
  let weightedBase = 0;
  let weightedAchieved = 0;
  let weightedMax = 0;
  let overlappingPairs = 0;
  let contendedPairs = 0;
  let firstSkipReason: string | null = null;

  for (const plan of plans) {
    const capacity =
      plan && plan.capacity !== undefined && plan.capacity !== null ? plan.capacity : input.capacity;
    const result = measurePlanParallelization(plan, capacity);
    if (
      result.ratio === null ||
      result.baseRatio === null ||
      result.achievedConcurrency === null ||
      result.maxConcurrency === null
    ) {
      if (firstSkipReason === null) firstSkipReason = result.unmeasured;
      continue;
    }
    measuredPlans += 1;
    tasks += result.tasks;
    workMs += result.workMs;
    weightedRatio += result.ratio * result.workMs;
    weightedBase += result.baseRatio * result.workMs;
    weightedAchieved += result.achievedConcurrency * result.workMs;
    weightedMax += result.maxConcurrency * result.workMs;
    overlappingPairs += result.overlappingPairs;
    contendedPairs += result.contendedPairs;
  }

  const baseBasis = {
    plansMeasured: measuredPlans,
    plansSkipped: plans.length - measuredPlans,
    firstSkipReason,
  };

  if (plans.length === 0) {
    return unmeasured(key, 'No executed plan was recorded.', baseBasis);
  }
  if (measuredPlans === 0 || !(workMs > 0)) {
    return unmeasured(
      key,
      plans.length === 1 && firstSkipReason
        ? firstSkipReason
        : `None of the ${plans.length} executed plans could be measured.`,
      baseBasis
    );
  }

  return measured(key, weightedRatio / workMs, {
    ...baseBasis,
    tasks,
    workHours: workMs / MS_PER_HOUR,
    // Work-weighted across plans, like the ratio itself.
    achievedConcurrency: weightedAchieved / workMs,
    maxConcurrency: weightedMax / workMs,
    baseRatio: weightedBase / workMs,
    overlappingPairs,
    contendedPairs,
  });
}

// ============================================================================
// The whole score
// ============================================================================

/**
 * Everything the six dimensions need, as plain data. Every field but `from` is
 * optional: what is not supplied is unmeasured, never assumed.
 *
 * Three of the dimensions are windowed (runway, utilization, velocity) and are
 * measured over `[from, now]`. The other three take whatever the caller hands
 * them — tasks, usage and plans carry no single timestamp this module could
 * filter on without guessing — so THE CALLER decides which of those belong to
 * the window. Feeding a week of tasks and an hour of sessions produces a
 * number that is internally consistent and describes nothing.
 */
export interface ScoreInput {
  /** Start of the scoring window, epoch ms. The window ends at `now`. */
  from: number;
  /** → runwayHealth */
  runwaySamples?: readonly RunwaySample[] | null;
  /** → fleetUtilization */
  sessions?: readonly SessionInterval[] | null;
  /** Concurrent agent slots. → fleetUtilization, and parallelizationQuality for plans without their own. */
  capacity?: number | null;
  /** → planAccuracy */
  tasks?: readonly EstimatedTask[] | null;
  /** → costEfficiency */
  usage?: readonly UsageEntry[] | null;
  /** The model `usage[].baselineCostUsd` was priced at. Provenance only. */
  referenceModel?: string | null;
  /** → velocityTrend */
  completions?: readonly number[] | null;
  /** → velocityTrend. Defaults to `DEFAULT_RECENT_FRACTION`. */
  recentFraction?: number;
  /** → parallelizationQuality */
  plans?: readonly ExecutedPlan[] | null;
}

/**
 * Compute all six dimensions and total them.
 *
 * `now` is the instant the score is taken *as of*: the right-hand edge of the
 * window. It is an argument, not `Date.now()`, so that a score can be
 * recomputed later and come out the same — which is what makes provenance and
 * rescoring (TRD 16 §4.3) possible at all. For a finished benchmark run, pass
 * the run's end. A session still running is counted up to `now`; the last
 * runway sample holds until `now`; "recent" velocity is the last quarter
 * before `now`.
 *
 * `total` is the sum of the MEASURED dimensions and is out of `measuredMax`,
 * not out of 1000, unless `complete` is true. An incomplete score must be
 * shown as "412 of 650 measured" and must not be ranked.
 *
 * This function does not throw on bad input. An unusable window or a missing
 * array makes the affected dimensions unmeasured, each with its reason.
 */
export function computeScore(input: ScoreInput, now: number): ScoreResult {
  const window: TimeWindow = { from: input.from, to: now };

  const byKey: Record<ScoreDimensionKey, DimensionResult> = {
    runwayHealth: computeRunwayHealth({ samples: input.runwaySamples ?? [], window }),
    fleetUtilization: computeFleetUtilization({
      sessions: input.sessions ?? [],
      capacity: input.capacity,
      window,
    }),
    planAccuracy: computePlanAccuracy({ tasks: input.tasks ?? [] }),
    costEfficiency: computeCostEfficiency({
      usage: input.usage ?? [],
      referenceModel: input.referenceModel,
    }),
    velocityTrend: computeVelocityTrend({
      completions: input.completions ?? [],
      window,
      recentFraction: input.recentFraction,
    }),
    parallelizationQuality: computeParallelizationQuality({
      plans: input.plans ?? [],
      capacity: input.capacity,
    }),
  };

  // Rebuilt in SCORE_MODEL order so the output's key order follows the model,
  // not the order of the literal above.
  const dimensions = {} as Record<ScoreDimensionKey, DimensionResult>;
  const unmeasuredKeys: ScoreDimensionKey[] = [];
  let total = 0;
  let measuredMax = 0;
  for (const { key, max } of SCORE_MODEL) {
    const result = byKey[key];
    dimensions[key] = result;
    if (result.value === null) {
      unmeasuredKeys.push(key);
      continue;
    }
    total += clampDimension(key, result.value);
    measuredMax += max;
  }

  return {
    modelVersion: SCORE_MODEL_VERSION,
    window: { from: finiteOrNull(input.from), to: finiteOrNull(now) },
    dimensions,
    total,
    measuredMax,
    max: SCORE_TOTAL,
    complete: unmeasuredKeys.length === 0,
    unmeasured: unmeasuredKeys,
  };
}
