// src/score/model.ts
var SCORE_TOTAL = 1e3;
var SCORE_MODEL = [
  {
    key: "runwayHealth",
    max: 250,
    label: "Runway health",
    meaning: "How consistently you kept work queued ahead of the fleet",
    method: "Time-weighted average runway across the session, normalised against the 4h amber threshold. Sustained runway above 4h approaches full marks."
  },
  {
    key: "fleetUtilization",
    max: 200,
    label: "Fleet utilization",
    meaning: "How much of your agent capacity was actually working",
    method: "Active sessions over available capacity, averaged over the session. A RATIO, never a count \u2014 otherwise the score would reward buying more agents rather than conducting them well."
  },
  {
    key: "planAccuracy",
    max: 200,
    label: "Plan accuracy",
    meaning: "How close your plan estimates landed to what actually happened",
    method: "Per-task |estimated \u2212 actual| duration, aggregated and inverted. Tasks that never ran are excluded rather than counted as perfect."
  },
  {
    key: "costEfficiency",
    max: 150,
    label: "Cost efficiency",
    meaning: "Saving against running everything on the most expensive model",
    method: "Actual spend over an all-Sonnet baseline for the same task graph. Weighted below throughput deliberately: being slow is more expensive than being wasteful."
  },
  {
    key: "velocityTrend",
    max: 100,
    label: "Velocity trend",
    meaning: "Whether your throughput is rising or falling",
    method: "Ratio of recent completion rate to the session baseline. A tiebreak, not a headline \u2014 it is the noisiest dimension."
  },
  {
    key: "parallelizationQuality",
    max: 100,
    label: "Parallelization quality",
    meaning: "How well your plans exploited work that was genuinely independent",
    method: "Achieved parallelism against the theoretical maximum for the dependency graph, penalised by file contention \u2014 two tasks touching one file were not independent, whatever the plan said."
  }
];
var SCORE_DIMENSIONS = Object.fromEntries(SCORE_MODEL.map((d) => [d.key, d]));
var SCORE_MODEL_VERSION = 1;
function scoreModelIsValid() {
  return SCORE_MODEL.reduce((sum, d) => sum + d.max, 0) === SCORE_TOTAL;
}
function clampDimension(key, value) {
  return Math.max(0, Math.min(SCORE_DIMENSIONS[key].max, value));
}
function totalFrom(values) {
  return SCORE_MODEL.reduce(
    (sum, d) => sum + clampDimension(d.key, values[d.key] ?? 0),
    0
  );
}
export {
  SCORE_DIMENSIONS,
  SCORE_MODEL,
  SCORE_MODEL_VERSION,
  SCORE_TOTAL,
  clampDimension,
  scoreModelIsValid,
  totalFrom
};
//# sourceMappingURL=index.mjs.map