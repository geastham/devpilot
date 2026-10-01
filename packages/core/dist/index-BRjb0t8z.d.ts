/**
 * The Conductor Score model — TRD 16.
 *
 * THE ONLY PLACE DIMENSION MAXIMA ARE DECLARED.
 *
 * Before this existed, four places each hard-coded their own: the schema
 * defaults, `/api/score`, the clamps in the dispatch and orchestrator-complete
 * routes, and the breakdown UI. They drifted, and `spec/DESIGN.md` §8.1 drifted
 * from all of them — the seed shipped a `velocityTrend` of 138 against a
 * specified cap of 100, and nothing noticed for months because no surface
 * rendered the dimensions. A total of 742 concealed a component that could not
 * exist.
 *
 * Anything that needs a maximum imports it from here. `scoreModelIsValid()` is
 * asserted in tests, so a weighting that does not sum to 1000 fails on the day
 * it is written rather than the day someone builds a leaderboard.
 */
type ScoreDimensionKey = 'fleetUtilization' | 'runwayHealth' | 'planAccuracy' | 'costEfficiency' | 'velocityTrend' | 'parallelizationQuality';
interface ScoreDimension {
    key: ScoreDimensionKey;
    max: number;
    label: string;
    /** One line, rendered in the UI. What it measures. */
    meaning: string;
    /** How it is computed. Rendered in the public method doc (T16-AC-06). */
    method: string;
}
declare const SCORE_TOTAL = 1000;
/**
 * The weighting encodes a claim about what conducting well *is*, and it is meant
 * to be arguable: **keeping the fleet fed is the largest part of the job.**
 * Runway Health and Fleet Utilization together are 450 of 1000, which follows
 * `spec/DESIGN.md` §1 — the conductor must be faster than the fleet.
 *
 * A flat 5×200 was the alternative and is what the implementation had. It is
 * the weighting you write when you have not decided: an arena scored on an
 * opinion-free metric teaches nobody anything.
 *
 * TO CHANGE THE WEIGHTING, EDIT ONLY THE `max` VALUES HERE. Everything else
 * derives. Bump `SCORE_MODEL_VERSION` when you do — historical scores were
 * earned under the old model and must not be silently reinterpreted (§4.4).
 */
declare const SCORE_MODEL: readonly ScoreDimension[];
/** Fast lookup for consumers that hold a key. */
declare const SCORE_DIMENSIONS: Readonly<Record<ScoreDimensionKey, ScoreDimension>>;
/**
 * Bump whenever a `max` OR A FORMULA changes. Scores earned under an earlier
 * model are not comparable to later ones and are excluded from ranking
 * (T16-AC-05) rather than rescaled, which would invent standings nobody earned.
 *
 * - 1: the stored counters. No dimension was computed by its method; a
 *      completion added points and a failure took some away.
 * - 2: the six methods in `compute.ts`, each measured from recorded events or
 *      reported as unmeasured.
 */
declare const SCORE_MODEL_VERSION = 2;
/** The invariant that makes the model rankable. Asserted in tests. */
declare function scoreModelIsValid(): boolean;
/** Clamp a dimension to its declared maximum. Replaces hard-coded `Math.min`. */
declare function clampDimension(key: ScoreDimensionKey, value: number): number;
/** Sum a set of dimension values into a total, clamping each. */
declare function totalFrom(values: Partial<Record<ScoreDimensionKey, number>>): number;

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

/**
 * Runway at or above this counts as fully healthy. It is the amber threshold
 * from `spec/DESIGN.md` §2.2 ("Amber < 4h") — the point at which the cockpit
 * starts warning that the fleet is about to outrun its conductor. Scoring
 * against the same line the UI warns at means the number and the warning
 * cannot disagree about what "enough" is.
 */
declare const RUNWAY_TARGET_HOURS = 4;
/**
 * A step function needs a step. One sample is a reading, not a history: it
 * says what runway was at an instant and nothing about how consistently it was
 * kept, which is what the dimension claims to measure.
 */
declare const MIN_RUNWAY_SAMPLES = 2;
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
declare const MIN_RUNWAY_COVERED_MINUTES = 60;
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
declare const RUNWAY_SAMPLE_MAX_HOLD_MINUTES = 15;
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
declare const WORKING_BREAK_MINUTES = 30;
/**
 * One lucky task is not accuracy. With a single task the dimension is the
 * error on that task; with two, one fluke still decides half of it. Three is
 * the smallest count at which a mean starts to describe the estimator rather
 * than the estimate. It is a floor against noise, not a claim of statistical
 * significance.
 */
declare const MIN_TASKS_FOR_ACCURACY = 3;
/**
 * Below this a "trend" is where one or two completions happened to fall. At
 * four completions with the default recent fraction, a single completion
 * landing either side of the boundary already moves the dimension by half its
 * range — which is why the floor exists and also why it is not higher: the
 * dimension is noisy at any count a single session will produce, and the
 * weighting (100 of 1000) is what contains that, not this constant.
 */
declare const MIN_COMPLETIONS_FOR_TREND = 4;
/** The share of the window, measured back from its end, that counts as "recent". */
declare const DEFAULT_RECENT_FRACTION = 0.25;
/** A plan with one task has nothing to run in parallel and nothing to learn from. */
declare const MIN_TASKS_FOR_PARALLELIZATION = 2;
interface DimensionResult {
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
interface ScoreResult {
    /** The model these values were earned under. Scores across versions do not compare. */
    modelVersion: number;
    /**
     * The span the windowed dimensions were measured over, epoch ms. Null only
     * when the caller passed a non-finite bound, in which case those dimensions
     * are unmeasured and say so.
     */
    window: {
        from: number | null;
        to: number | null;
    };
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
interface TimeWindow {
    from: number;
    to: number;
}
interface RunwaySample {
    /** When the reading was taken, epoch ms. */
    at: number;
    /** Hours of queued work ahead of the fleet at that instant. */
    runwayHours: number;
}
interface RunwayHealthInput {
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
declare function computeRunwayHealth(input: RunwayHealthInput): DimensionResult;
interface SessionInterval {
    /** When the session started working, epoch ms. */
    start: number;
    /** When it stopped, epoch ms. Null means still running: treated as `window.to`. */
    end: number | null;
}
interface FleetUtilizationInput {
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
declare function computeFleetUtilization(input: FleetUtilizationInput): DimensionResult;
interface EstimatedTask {
    /** What the plan said the task would take, in minutes. Null when there was no estimate. */
    estimatedMinutes: number | null;
    /** What it actually took, in minutes. Null when the task never ran to an end. */
    actualMinutes: number | null;
}
interface PlanAccuracyInput {
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
declare function computePlanAccuracy(input: PlanAccuracyInput): DimensionResult;
interface UsageEntry {
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
interface CostEfficiencyInput {
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
declare function computeCostEfficiency(input: CostEfficiencyInput): DimensionResult;
interface VelocityTrendInput {
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
declare function computeVelocityTrend(input: VelocityTrendInput): DimensionResult;
interface ExecutedTask {
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
interface ExecutedPlan {
    tasks: readonly ExecutedTask[];
    /** Concurrent slots available while THIS plan ran. Falls back to the input's `capacity`. */
    capacity?: number | null;
}
interface ParallelizationInput {
    plans: readonly ExecutedPlan[];
    /** Concurrent slots available, for any plan that does not carry its own. */
    capacity: number | null | undefined;
}
/** One plan's working, exposed so a per-plan view can show it. */
interface PlanParallelization {
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
 * Parallelization quality for one executed plan. See
 * `computeParallelizationQuality` for the definition; this is steps (a)–(e).
 */
declare function measurePlanParallelization(plan: ExecutedPlan, capacity: number | null | undefined): PlanParallelization;
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
declare function computeParallelizationQuality(input: ParallelizationInput): DimensionResult;
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
interface ScoreInput {
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
declare function computeScore(input: ScoreInput, now: number): ScoreResult;

/**
 * From recorded events to the six dimensions' inputs.
 *
 * `compute.ts` is the arithmetic and knows nothing about where its numbers
 * come from. This is the other half: given what a cockpit actually recorded —
 * its sessions, its wave tasks, its runway readings — decide which of those
 * rows are evidence for which dimension, and for what window.
 *
 * It is separate from the database on purpose. Every decision about what
 * counts is made here, on plain rows, where it can be tested without one; the
 * loader that fills these rows is a set of column mappings and nothing else.
 *
 * Pure: no db, no clock, no I/O. `now` is an argument, so a score can be taken
 * again later over the same rows and come out the same.
 */

/** One agent session DevPilot dispatched. */
interface ScoreSessionRow {
    id: string;
    /** When it was dispatched, epoch ms. */
    startedAt: number;
    /** When it reached a terminal state, epoch ms. Null while it is still running. */
    endedAt: number | null;
    /** `failed` covers everything terminal that is not a completion. */
    outcome: 'running' | 'complete' | 'failed';
    /**
     * The session's tokens at their own models' list prices, and the same tokens
     * at the reference model's, both from the runner's final reading. Null when
     * the runner that ran it did not report them.
     */
    listCostUsd: number | null;
    referenceCostUsd: number | null;
    referenceModel: string | null;
    /** The model that did most of the work. Provenance only. */
    model: string | null;
}
/** One task of a wave plan, as it was executed. */
interface ScoreTaskRow {
    planId: string;
    taskCode: string;
    /** The plan's sizing of the task: S, M, L or XL. Null when the plan gave none. */
    complexity: string | null;
    /** Task codes, in the same plan, this one waited for. */
    dependencies: string[];
    /** When its first attempt started, epoch ms. Null if it never ran. */
    startedAt: number | null;
    /** When it ended, epoch ms. Null if it has not. */
    completedAt: number | null;
    /** True only for a task that finished its work. */
    completed: boolean;
    /**
     * The files the task actually changed, from git or the runner's reading.
     * Null means nobody recorded them — which is not the same as none.
     */
    filesChanged: string[] | null;
}
/** One reading of runway, with the fleet's capacity at the time if it was known. */
interface ScoreRunwayRow {
    at: number;
    runwayHours: number;
    capacity: number | null;
}
interface ScoreEvidence {
    sessions: readonly ScoreSessionRow[];
    tasks: readonly ScoreTaskRow[];
    runway: readonly ScoreRunwayRow[];
}
interface ScoreWindowOptions {
    /** Start of the window, epoch ms. */
    from: number;
    /** The instant the score is taken as of, epoch ms. */
    now: number;
    /**
     * Concurrent agent slots. When absent, the most recent capacity recorded
     * with a runway reading inside the window is used; when there is none of
     * those either, capacity is unknown and the dimensions that need it say so.
     */
    capacity?: number | null;
}
/**
 * How many earlier tasks of the same size it takes before their durations
 * count as an estimate for the next one.
 *
 * Matches `MIN_TASKS_FOR_ACCURACY` in spirit: fewer than three and the
 * "estimate" is one or two tasks that happened to run first.
 */
declare const MIN_HISTORY_FOR_ESTIMATE = 3;
/**
 * What the plan estimated each task would take, and what it took.
 *
 * WHERE THE ESTIMATE COMES FROM. A plan does not write down minutes. It sizes
 * each task — S, M, L, XL — and that sizing is its estimate: a claim that this
 * task is about as much work as the others of its size. To compare a size with
 * a duration it has to become minutes, and the conversion is not a table of
 * constants somebody chose. It is this machine's own record: a task's
 * estimate is the MEDIAN of what tasks of the same size took, counting only
 * those that had finished before this one started.
 *
 * Three things follow, and they are the point:
 *
 * - No number here was invented. An S is "about what S tasks have taken".
 * - It cannot be adjusted after the fact. The estimate for a task is fixed by
 *   what had already finished when it began.
 * - It measures the plan's consistency. Sizing a two-minute task and a
 *   forty-minute task both as M is what costs points, in whichever order they
 *   ran.
 *
 * A task with no size, or with fewer than `MIN_HISTORY_FOR_ESTIMATE` earlier
 * tasks of its size, has no estimate and is left out of the dimension — the
 * same way a task that never ran is. So plan accuracy stays unmeasured on a new
 * install until the fleet has some history, and that is correct: there is
 * nothing yet to have been accurate about.
 *
 * The history is everything recorded, not just the window: what tasks of a
 * size take is known from before the window began. Only tasks that COMPLETED
 * inside the window are scored.
 */
declare function estimateTasks(tasks: readonly ScoreTaskRow[], from: number, now: number): EstimatedTask[];
/**
 * The plans that executed in the window, as intervals with their dependencies.
 *
 * A plan is included when any of its tasks ENDED inside the window, and then
 * with all of its timed tasks, including ones that ended before the window
 * began: a plan's concurrency is a property of the whole plan, and scoring the
 * half of it that fell inside an arbitrary window would call a well-run plan
 * serial.
 *
 * A task counts if it has a start and an end, whether or not it succeeded —
 * a task that ran for ten minutes and failed still occupied a slot for ten
 * minutes. One that never started is simply not there.
 */
declare function executedPlans(tasks: readonly ScoreTaskRow[], from: number, now: number): ExecutedPlan[];
/**
 * Turn what was recorded into the input `computeScore` takes.
 *
 * Which rows count for which dimension:
 *
 * - runway health: every runway reading. (`compute` keeps the ones in the
 *   window.)
 * - fleet utilization: every session, as an interval. A session still running
 *   has no end, and is counted up to `now`.
 * - plan accuracy: tasks that completed in the window — see `estimateTasks`.
 * - cost efficiency: sessions that ENDED in the window and carry both prices.
 *   A session still running is left out: its reading is partial, and half a
 *   session's spend against half a session's baseline is a ratio that will
 *   change by the time it finishes.
 * - velocity trend: the moment each session completed its work, in the window.
 *   Sessions, not wave tasks, so a one-off dispatch counts the same as a task
 *   of a plan — each is one piece of work an agent finished.
 * - parallelization quality: plans with a task that ended in the window — see
 *   `executedPlans`.
 */
declare function buildScoreInput(evidence: ScoreEvidence, options: ScoreWindowOptions): ScoreInput;

type index_CostEfficiencyInput = CostEfficiencyInput;
declare const index_DEFAULT_RECENT_FRACTION: typeof DEFAULT_RECENT_FRACTION;
type index_DimensionResult = DimensionResult;
type index_EstimatedTask = EstimatedTask;
type index_ExecutedPlan = ExecutedPlan;
type index_ExecutedTask = ExecutedTask;
type index_FleetUtilizationInput = FleetUtilizationInput;
declare const index_MIN_COMPLETIONS_FOR_TREND: typeof MIN_COMPLETIONS_FOR_TREND;
declare const index_MIN_HISTORY_FOR_ESTIMATE: typeof MIN_HISTORY_FOR_ESTIMATE;
declare const index_MIN_RUNWAY_COVERED_MINUTES: typeof MIN_RUNWAY_COVERED_MINUTES;
declare const index_MIN_RUNWAY_SAMPLES: typeof MIN_RUNWAY_SAMPLES;
declare const index_MIN_TASKS_FOR_ACCURACY: typeof MIN_TASKS_FOR_ACCURACY;
declare const index_MIN_TASKS_FOR_PARALLELIZATION: typeof MIN_TASKS_FOR_PARALLELIZATION;
type index_ParallelizationInput = ParallelizationInput;
type index_PlanAccuracyInput = PlanAccuracyInput;
type index_PlanParallelization = PlanParallelization;
declare const index_RUNWAY_SAMPLE_MAX_HOLD_MINUTES: typeof RUNWAY_SAMPLE_MAX_HOLD_MINUTES;
declare const index_RUNWAY_TARGET_HOURS: typeof RUNWAY_TARGET_HOURS;
type index_RunwayHealthInput = RunwayHealthInput;
type index_RunwaySample = RunwaySample;
declare const index_SCORE_DIMENSIONS: typeof SCORE_DIMENSIONS;
declare const index_SCORE_MODEL: typeof SCORE_MODEL;
declare const index_SCORE_MODEL_VERSION: typeof SCORE_MODEL_VERSION;
declare const index_SCORE_TOTAL: typeof SCORE_TOTAL;
type index_ScoreDimension = ScoreDimension;
type index_ScoreDimensionKey = ScoreDimensionKey;
type index_ScoreEvidence = ScoreEvidence;
type index_ScoreInput = ScoreInput;
type index_ScoreResult = ScoreResult;
type index_ScoreRunwayRow = ScoreRunwayRow;
type index_ScoreSessionRow = ScoreSessionRow;
type index_ScoreTaskRow = ScoreTaskRow;
type index_ScoreWindowOptions = ScoreWindowOptions;
type index_SessionInterval = SessionInterval;
type index_TimeWindow = TimeWindow;
type index_UsageEntry = UsageEntry;
type index_VelocityTrendInput = VelocityTrendInput;
declare const index_WORKING_BREAK_MINUTES: typeof WORKING_BREAK_MINUTES;
declare const index_buildScoreInput: typeof buildScoreInput;
declare const index_clampDimension: typeof clampDimension;
declare const index_computeCostEfficiency: typeof computeCostEfficiency;
declare const index_computeFleetUtilization: typeof computeFleetUtilization;
declare const index_computeParallelizationQuality: typeof computeParallelizationQuality;
declare const index_computePlanAccuracy: typeof computePlanAccuracy;
declare const index_computeRunwayHealth: typeof computeRunwayHealth;
declare const index_computeScore: typeof computeScore;
declare const index_computeVelocityTrend: typeof computeVelocityTrend;
declare const index_estimateTasks: typeof estimateTasks;
declare const index_executedPlans: typeof executedPlans;
declare const index_measurePlanParallelization: typeof measurePlanParallelization;
declare const index_scoreModelIsValid: typeof scoreModelIsValid;
declare const index_totalFrom: typeof totalFrom;
declare namespace index {
  export { type index_CostEfficiencyInput as CostEfficiencyInput, index_DEFAULT_RECENT_FRACTION as DEFAULT_RECENT_FRACTION, type index_DimensionResult as DimensionResult, type index_EstimatedTask as EstimatedTask, type index_ExecutedPlan as ExecutedPlan, type index_ExecutedTask as ExecutedTask, type index_FleetUtilizationInput as FleetUtilizationInput, index_MIN_COMPLETIONS_FOR_TREND as MIN_COMPLETIONS_FOR_TREND, index_MIN_HISTORY_FOR_ESTIMATE as MIN_HISTORY_FOR_ESTIMATE, index_MIN_RUNWAY_COVERED_MINUTES as MIN_RUNWAY_COVERED_MINUTES, index_MIN_RUNWAY_SAMPLES as MIN_RUNWAY_SAMPLES, index_MIN_TASKS_FOR_ACCURACY as MIN_TASKS_FOR_ACCURACY, index_MIN_TASKS_FOR_PARALLELIZATION as MIN_TASKS_FOR_PARALLELIZATION, type index_ParallelizationInput as ParallelizationInput, type index_PlanAccuracyInput as PlanAccuracyInput, type index_PlanParallelization as PlanParallelization, index_RUNWAY_SAMPLE_MAX_HOLD_MINUTES as RUNWAY_SAMPLE_MAX_HOLD_MINUTES, index_RUNWAY_TARGET_HOURS as RUNWAY_TARGET_HOURS, type index_RunwayHealthInput as RunwayHealthInput, type index_RunwaySample as RunwaySample, index_SCORE_DIMENSIONS as SCORE_DIMENSIONS, index_SCORE_MODEL as SCORE_MODEL, index_SCORE_MODEL_VERSION as SCORE_MODEL_VERSION, index_SCORE_TOTAL as SCORE_TOTAL, type index_ScoreDimension as ScoreDimension, type index_ScoreDimensionKey as ScoreDimensionKey, type index_ScoreEvidence as ScoreEvidence, type index_ScoreInput as ScoreInput, type index_ScoreResult as ScoreResult, type index_ScoreRunwayRow as ScoreRunwayRow, type index_ScoreSessionRow as ScoreSessionRow, type index_ScoreTaskRow as ScoreTaskRow, type index_ScoreWindowOptions as ScoreWindowOptions, type index_SessionInterval as SessionInterval, type index_TimeWindow as TimeWindow, type index_UsageEntry as UsageEntry, type index_VelocityTrendInput as VelocityTrendInput, index_WORKING_BREAK_MINUTES as WORKING_BREAK_MINUTES, index_buildScoreInput as buildScoreInput, index_clampDimension as clampDimension, index_computeCostEfficiency as computeCostEfficiency, index_computeFleetUtilization as computeFleetUtilization, index_computeParallelizationQuality as computeParallelizationQuality, index_computePlanAccuracy as computePlanAccuracy, index_computeRunwayHealth as computeRunwayHealth, index_computeScore as computeScore, index_computeVelocityTrend as computeVelocityTrend, index_estimateTasks as estimateTasks, index_executedPlans as executedPlans, index_measurePlanParallelization as measurePlanParallelization, index_scoreModelIsValid as scoreModelIsValid, index_totalFrom as totalFrom };
}

export { type SessionInterval as A, buildScoreInput as B, type CostEfficiencyInput as C, DEFAULT_RECENT_FRACTION as D, type EstimatedTask as E, type FleetUtilizationInput as F, clampDimension as G, computeCostEfficiency as H, computeFleetUtilization as I, computeParallelizationQuality as J, computePlanAccuracy as K, computeRunwayHealth as L, MIN_COMPLETIONS_FOR_TREND as M, computeScore as N, computeVelocityTrend as O, type ParallelizationInput as P, estimateTasks as Q, RUNWAY_SAMPLE_MAX_HOLD_MINUTES as R, SCORE_DIMENSIONS as S, type TimeWindow as T, type UsageEntry as U, type VelocityTrendInput as V, WORKING_BREAK_MINUTES as W, executedPlans as X, measurePlanParallelization as Y, scoreModelIsValid as Z, totalFrom as _, type DimensionResult as a, type ExecutedPlan as b, type ExecutedTask as c, MIN_HISTORY_FOR_ESTIMATE as d, MIN_RUNWAY_COVERED_MINUTES as e, MIN_RUNWAY_SAMPLES as f, MIN_TASKS_FOR_ACCURACY as g, MIN_TASKS_FOR_PARALLELIZATION as h, index as i, type PlanAccuracyInput as j, type PlanParallelization as k, RUNWAY_TARGET_HOURS as l, type RunwayHealthInput as m, type RunwaySample as n, SCORE_MODEL as o, SCORE_MODEL_VERSION as p, SCORE_TOTAL as q, type ScoreDimension as r, type ScoreDimensionKey as s, type ScoreEvidence as t, type ScoreInput as u, type ScoreResult as v, type ScoreRunwayRow as w, type ScoreSessionRow as x, type ScoreTaskRow as y, type ScoreWindowOptions as z };
