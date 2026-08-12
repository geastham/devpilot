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
 * Bump whenever a `max` changes. Scores earned under an earlier model are not
 * comparable to later ones and are excluded from ranking (T16-AC-05) rather
 * than rescaled, which would invent standings nobody earned.
 */
declare const SCORE_MODEL_VERSION = 1;
/** The invariant that makes the model rankable. Asserted in tests. */
declare function scoreModelIsValid(): boolean;
/** Clamp a dimension to its declared maximum. Replaces hard-coded `Math.min`. */
declare function clampDimension(key: ScoreDimensionKey, value: number): number;
/** Sum a set of dimension values into a total, clamping each. */
declare function totalFrom(values: Partial<Record<ScoreDimensionKey, number>>): number;

declare const index_SCORE_DIMENSIONS: typeof SCORE_DIMENSIONS;
declare const index_SCORE_MODEL: typeof SCORE_MODEL;
declare const index_SCORE_MODEL_VERSION: typeof SCORE_MODEL_VERSION;
declare const index_SCORE_TOTAL: typeof SCORE_TOTAL;
type index_ScoreDimension = ScoreDimension;
type index_ScoreDimensionKey = ScoreDimensionKey;
declare const index_clampDimension: typeof clampDimension;
declare const index_scoreModelIsValid: typeof scoreModelIsValid;
declare const index_totalFrom: typeof totalFrom;
declare namespace index {
  export { index_SCORE_DIMENSIONS as SCORE_DIMENSIONS, index_SCORE_MODEL as SCORE_MODEL, index_SCORE_MODEL_VERSION as SCORE_MODEL_VERSION, index_SCORE_TOTAL as SCORE_TOTAL, type index_ScoreDimension as ScoreDimension, type index_ScoreDimensionKey as ScoreDimensionKey, index_clampDimension as clampDimension, index_scoreModelIsValid as scoreModelIsValid, index_totalFrom as totalFrom };
}

export { SCORE_DIMENSIONS as S, SCORE_MODEL as a, SCORE_MODEL_VERSION as b, SCORE_TOTAL as c, type ScoreDimension as d, type ScoreDimensionKey as e, clampDimension as f, index as i, scoreModelIsValid as s, totalFrom as t };
