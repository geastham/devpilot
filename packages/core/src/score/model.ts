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

export type ScoreDimensionKey =
  | 'fleetUtilization'
  | 'runwayHealth'
  | 'planAccuracy'
  | 'costEfficiency'
  | 'velocityTrend'
  | 'parallelizationQuality';

export interface ScoreDimension {
  key: ScoreDimensionKey;
  max: number;
  label: string;
  /** One line, rendered in the UI. What it measures. */
  meaning: string;
  /** How it is computed. Rendered in the public method doc (T16-AC-06). */
  method: string;
}

export const SCORE_TOTAL = 1000;

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
export const SCORE_MODEL: readonly ScoreDimension[] = [
  {
    key: 'runwayHealth',
    max: 250,
    label: 'Runway health',
    meaning: 'How consistently you kept work queued ahead of the fleet',
    method:
      'Time-weighted average runway across the session, normalised against the ' +
      '4h amber threshold. Sustained runway above 4h approaches full marks.',
  },
  {
    key: 'fleetUtilization',
    max: 200,
    label: 'Fleet utilization',
    meaning: 'How much of your agent capacity was actually working',
    method:
      'Active sessions over available capacity, averaged over the session. A ' +
      'RATIO, never a count — otherwise the score would reward buying more ' +
      'agents rather than conducting them well.',
  },
  {
    key: 'planAccuracy',
    max: 200,
    label: 'Plan accuracy',
    meaning: 'How close your plan estimates landed to what actually happened',
    method:
      'Per-task |estimated − actual| duration, aggregated and inverted. Tasks ' +
      'that never ran are excluded rather than counted as perfect.',
  },
  {
    key: 'costEfficiency',
    max: 150,
    label: 'Cost efficiency',
    meaning: 'Saving against running everything on the most expensive model',
    method:
      'Actual spend over an all-Sonnet baseline for the same task graph. ' +
      'Weighted below throughput deliberately: being slow is more expensive ' +
      'than being wasteful.',
  },
  {
    key: 'velocityTrend',
    max: 100,
    label: 'Velocity trend',
    meaning: 'Whether your throughput is rising or falling',
    method:
      'Ratio of recent completion rate to the session baseline. A tiebreak, ' +
      'not a headline — it is the noisiest dimension.',
  },
  {
    key: 'parallelizationQuality',
    max: 100,
    label: 'Parallelization quality',
    meaning: 'How well your plans exploited work that was genuinely independent',
    method:
      'Achieved parallelism against the theoretical maximum for the dependency ' +
      'graph, penalised by file contention — two tasks touching one file were ' +
      'not independent, whatever the plan said.',
  },
];

/** Fast lookup for consumers that hold a key. */
export const SCORE_DIMENSIONS: Readonly<Record<ScoreDimensionKey, ScoreDimension>> =
  Object.fromEntries(SCORE_MODEL.map((d) => [d.key, d])) as Record<
    ScoreDimensionKey,
    ScoreDimension
  >;

/**
 * Bump whenever a `max` changes. Scores earned under an earlier model are not
 * comparable to later ones and are excluded from ranking (T16-AC-05) rather
 * than rescaled, which would invent standings nobody earned.
 */
export const SCORE_MODEL_VERSION = 1;

/** The invariant that makes the model rankable. Asserted in tests. */
export function scoreModelIsValid(): boolean {
  return SCORE_MODEL.reduce((sum, d) => sum + d.max, 0) === SCORE_TOTAL;
}

/** Clamp a dimension to its declared maximum. Replaces hard-coded `Math.min`. */
export function clampDimension(key: ScoreDimensionKey, value: number): number {
  return Math.max(0, Math.min(SCORE_DIMENSIONS[key].max, value));
}

/** Sum a set of dimension values into a total, clamping each. */
export function totalFrom(values: Partial<Record<ScoreDimensionKey, number>>): number {
  return SCORE_MODEL.reduce(
    (sum, d) => sum + clampDimension(d.key, values[d.key] ?? 0),
    0
  );
}
