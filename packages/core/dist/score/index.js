"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/score/index.ts
var score_exports = {};
__export(score_exports, {
  DEFAULT_RECENT_FRACTION: () => DEFAULT_RECENT_FRACTION,
  MIN_COMPLETIONS_FOR_TREND: () => MIN_COMPLETIONS_FOR_TREND,
  MIN_HISTORY_FOR_ESTIMATE: () => MIN_HISTORY_FOR_ESTIMATE,
  MIN_RUNWAY_COVERED_MINUTES: () => MIN_RUNWAY_COVERED_MINUTES,
  MIN_RUNWAY_SAMPLES: () => MIN_RUNWAY_SAMPLES,
  MIN_TASKS_FOR_ACCURACY: () => MIN_TASKS_FOR_ACCURACY,
  MIN_TASKS_FOR_PARALLELIZATION: () => MIN_TASKS_FOR_PARALLELIZATION,
  RUNWAY_SAMPLE_MAX_HOLD_MINUTES: () => RUNWAY_SAMPLE_MAX_HOLD_MINUTES,
  RUNWAY_TARGET_HOURS: () => RUNWAY_TARGET_HOURS,
  SCORE_DIMENSIONS: () => SCORE_DIMENSIONS,
  SCORE_MODEL: () => SCORE_MODEL,
  SCORE_MODEL_VERSION: () => SCORE_MODEL_VERSION,
  SCORE_TOTAL: () => SCORE_TOTAL,
  WORKING_BREAK_MINUTES: () => WORKING_BREAK_MINUTES,
  buildScoreInput: () => buildScoreInput,
  clampDimension: () => clampDimension,
  computeCostEfficiency: () => computeCostEfficiency,
  computeFleetUtilization: () => computeFleetUtilization,
  computeParallelizationQuality: () => computeParallelizationQuality,
  computePlanAccuracy: () => computePlanAccuracy,
  computeRunwayHealth: () => computeRunwayHealth,
  computeScore: () => computeScore,
  computeVelocityTrend: () => computeVelocityTrend,
  estimateTasks: () => estimateTasks,
  executedPlans: () => executedPlans,
  measurePlanParallelization: () => measurePlanParallelization,
  scoreModelIsValid: () => scoreModelIsValid,
  totalFrom: () => totalFrom
});
module.exports = __toCommonJS(score_exports);

// src/score/model.ts
var SCORE_TOTAL = 1e3;
var SCORE_MODEL = [
  {
    key: "runwayHealth",
    max: 250,
    label: "Runway health",
    meaning: "How consistently you kept work queued ahead of the fleet",
    method: "Time-weighted mean of min(1, runway hours \xF7 4) over the scoring window, where 4h is the amber threshold: runway held at or above 4h is full marks. Each runway sample holds until the next one, for at most 15 minutes; time before the first sample, and time when sampling had stopped, is left out rather than counted as empty or as full. Unmeasured with fewer than 2 samples or less than 60 minutes of sampled time. Runway itself is an estimate (queue length \xD7 a fixed duration per item), and this dimension inherits that."
  },
  {
    key: "fleetUtilization",
    max: 200,
    label: "Fleet utilization",
    meaning: "How much of your agent capacity was actually working",
    method: "Time-weighted mean of min(1, active sessions \xF7 capacity), taken from the first session start to the last session end inside the window, leaving out any stretch of more than 30 minutes with nothing running \u2014 so the time before the first dispatch, after the last finish, and overnight is not counted as idle, and a short gap between tasks is. A RATIO, never a count \u2014 otherwise the score would reward buying more agents rather than conducting them well. Unmeasured with no sessions or no declared capacity."
  },
  {
    key: "planAccuracy",
    max: 200,
    label: "Plan accuracy",
    meaning: "How close your plan estimates landed to what actually happened",
    method: "For each task with both an estimated and an actual duration, error = |estimated \u2212 actual| \xF7 the larger of the two; the result is 1 \u2212 the mean error. A task\u2019s estimate is the median of what tasks the plan sized the same (S, M, L, XL) had taken before it started, so it measures how consistently the plan sized its work. Tasks that never ran, or had no estimate, are excluded rather than counted as perfect. Unmeasured with fewer than 3 qualifying tasks \u2014 one lucky task is not accuracy."
  },
  {
    key: "costEfficiency",
    max: 150,
    label: "Cost efficiency",
    meaning: "Saving against running everything on the most expensive model",
    method: "1 \u2212 (actual spend \xF7 what the same tokens would have cost on the most expensive model), floored at zero. A fleet that runs everything on the most expensive model scores 0 here by construction. Weighted below throughput deliberately: being slow is more expensive than being wasteful. Unmeasured with no recorded spend."
  },
  {
    key: "velocityTrend",
    max: 100,
    label: "Velocity trend",
    meaning: "Whether your throughput is rising or falling",
    method: "Completions per hour over the last quarter of the scoring window, divided by completions per hour over the whole window; half that ratio, capped at 1. Steady throughput is half marks, doubling is full marks, stopping is zero. Unmeasured with fewer than 4 completions. A tiebreak, not a headline \u2014 it is the noisiest dimension."
  },
  {
    key: "parallelizationQuality",
    max: 100,
    label: "Parallelization quality",
    meaning: "How well your plans exploited work that was genuinely independent",
    method: "Achieved concurrency (total task time \xF7 wall-clock time) over the most the plan allowed (the smaller of fleet capacity and total task time \xF7 the longest dependency chain by actual duration), multiplied by 1 \u2212 the share of concurrently running task pairs that touched a common file \u2014 two tasks touching one file were not independent, whatever the plan said. Plans are combined weighted by their total task time. Unmeasured without a plan of at least 2 timed tasks."
  }
];
var SCORE_DIMENSIONS = Object.fromEntries(SCORE_MODEL.map((d) => [d.key, d]));
var SCORE_MODEL_VERSION = 2;
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

// src/score/compute.ts
var RUNWAY_TARGET_HOURS = 4;
var MIN_RUNWAY_SAMPLES = 2;
var MIN_RUNWAY_COVERED_MINUTES = 60;
var RUNWAY_SAMPLE_MAX_HOLD_MINUTES = 15;
var WORKING_BREAK_MINUTES = 30;
var MIN_TASKS_FOR_ACCURACY = 3;
var MIN_COMPLETIONS_FOR_TREND = 4;
var DEFAULT_RECENT_FRACTION = 0.25;
var MIN_TASKS_FOR_PARALLELIZATION = 2;
var MS_PER_HOUR = 36e5;
var MS_PER_MINUTE = 6e4;
function isFiniteNumber(x) {
  return typeof x === "number" && Number.isFinite(x);
}
function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}
function finiteOrNull(x) {
  return Number.isFinite(x) ? x + 0 : null;
}
function isValidCapacity(x) {
  return isFiniteNumber(x) && Number.isInteger(x) && x >= 1;
}
function windowProblem(window) {
  if (!window || !isFiniteNumber(window.from) || !isFiniteNumber(window.to)) {
    return "The scoring window has no usable start or end time.";
  }
  if (window.to < window.from) return "The scoring window ends before it starts.";
  if (window.to === window.from) return "The scoring window has zero length.";
  if (!Number.isFinite(window.to - window.from)) {
    return "The scoring window is too long to measure.";
  }
  return null;
}
function sanitiseBasis(basis) {
  const out = {};
  for (const [k, v] of Object.entries(basis)) {
    out[k] = typeof v === "number" ? finiteOrNull(v) : v;
  }
  return out;
}
function unmeasured(key, reason, basis = {}) {
  return {
    key,
    value: null,
    max: SCORE_DIMENSIONS[key].max,
    ratio: null,
    unmeasured: reason,
    basis: sanitiseBasis(basis)
  };
}
function measured(key, rawRatio, basis) {
  if (!Number.isFinite(rawRatio)) {
    return unmeasured(key, "The inputs produced a number that is not finite.", basis);
  }
  const ratio = clamp01(rawRatio);
  const max = SCORE_DIMENSIONS[key].max;
  return {
    key,
    value: clampDimension(key, Math.round(ratio * max)),
    max,
    ratio,
    unmeasured: null,
    basis: sanitiseBasis(basis)
  };
}
function computeRunwayHealth(input) {
  const key = "runwayHealth";
  const problem = windowProblem(input.window);
  if (problem) return unmeasured(key, problem, { targetHours: RUNWAY_TARGET_HOURS });
  const { from, to } = input.window;
  let dropped = 0;
  const inWindow = [];
  for (const s of input.samples ?? []) {
    if (!s || !isFiniteNumber(s.at) || !isFiniteNumber(s.runwayHours)) {
      dropped += 1;
      continue;
    }
    if (s.at >= from && s.at <= to) inWindow.push(s);
  }
  const samples = [...inWindow].sort((a, b) => a.at - b.at);
  const baseBasis = {
    samples: samples.length,
    droppedSamples: dropped,
    targetHours: RUNWAY_TARGET_HOURS,
    windowHours: (to - from) / MS_PER_HOUR
  };
  if (samples.length < MIN_RUNWAY_SAMPLES) {
    return unmeasured(
      key,
      `Fewer than ${MIN_RUNWAY_SAMPLES} runway samples were recorded in the window, so there is no history to average.`,
      baseBasis
    );
  }
  const maxHoldMs = RUNWAY_SAMPLE_MAX_HOLD_MINUTES * MS_PER_MINUTE;
  let coveredMs = 0;
  let healthMs = 0;
  let hoursMs = 0;
  let unobservedMs = 0;
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
      "Every runway sample sits at the very end of the window, so no time is covered.",
      baseBasis
    );
  }
  if (coveredMs < MIN_RUNWAY_COVERED_MINUTES * MS_PER_MINUTE) {
    return unmeasured(
      key,
      `Runway was sampled for ${Math.floor(coveredMs / MS_PER_MINUTE)} minutes in the window; at least ${MIN_RUNWAY_COVERED_MINUTES} are needed before it says how consistently work was kept queued.`,
      { ...baseBasis, coveredHours: coveredMs / MS_PER_HOUR, minimumCoveredMinutes: MIN_RUNWAY_COVERED_MINUTES }
    );
  }
  return measured(key, healthMs / coveredMs, {
    ...baseBasis,
    coveredHours: coveredMs / MS_PER_HOUR,
    meanRunwayHours: hoursMs / coveredMs,
    unobservedHours: unobservedMs / MS_PER_HOUR,
    maxHoldMinutes: RUNWAY_SAMPLE_MAX_HOLD_MINUTES
  });
}
function computeFleetUtilization(input) {
  const key = "fleetUtilization";
  const capacity = input.capacity;
  const problem = windowProblem(input.window);
  if (problem) return unmeasured(key, problem, { capacity: isValidCapacity(capacity) ? capacity : null });
  const { from, to } = input.window;
  if (!isValidCapacity(capacity)) {
    return unmeasured(
      key,
      "Fleet capacity is not recorded as a whole number of at least 1, so there is nothing to take a ratio against.",
      { capacity: null, windowHours: (to - from) / MS_PER_HOUR }
    );
  }
  let excluded = 0;
  const clipped = [];
  for (const session of input.sessions ?? []) {
    if (!session || !isFiniteNumber(session.start)) {
      excluded += 1;
      continue;
    }
    const rawEnd = session.end === null || session.end === void 0 ? to : session.end;
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
    windowHours: (to - from) / MS_PER_HOUR
  };
  if (clipped.length === 0) {
    return unmeasured(key, "No session was running inside the window.", baseBasis);
  }
  const points = [];
  for (const { s, e } of clipped) {
    points.push({ t: s, delta: 1 }, { t: e, delta: -1 });
  }
  points.sort((a, b) => a.t - b.t || a.delta - b.delta);
  const breakMs = WORKING_BREAK_MINUTES * MS_PER_MINUTE;
  let active = 0;
  let peak = 0;
  let spanMs = 0;
  let busyMs = 0;
  let sessionMs = 0;
  let breaks = 0;
  let breakTotalMs = 0;
  let prev = points[0].t;
  for (const point of points) {
    const dt = point.t - prev;
    if (dt > 0) {
      if (active === 0 && dt > breakMs) {
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
    return unmeasured(key, "No session was running inside the window.", baseBasis);
  }
  return measured(key, busyMs / spanMs, {
    ...baseBasis,
    workingSpanHours: spanMs / MS_PER_HOUR,
    meanActiveSessions: sessionMs / spanMs,
    peakActiveSessions: peak,
    breaksExcluded: breaks,
    breakHoursExcluded: breakTotalMs / MS_PER_HOUR,
    breakMinutes: WORKING_BREAK_MINUTES
  });
}
function computePlanAccuracy(input) {
  const key = "planAccuracy";
  let qualified = 0;
  let neverRan = 0;
  let noEstimate = 0;
  let errorSum = 0;
  for (const task of input.tasks ?? []) {
    const actual = task ? task.actualMinutes : null;
    const estimate = task ? task.estimatedMinutes : null;
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
    minimumTasks: MIN_TASKS_FOR_ACCURACY
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
function computeCostEfficiency(input) {
  const key = "costEfficiency";
  let entries = 0;
  let excluded = 0;
  let cost = 0;
  let baseline = 0;
  const models = /* @__PURE__ */ new Set();
  for (const entry of input.usage ?? []) {
    if (!entry || !isFiniteNumber(entry.costUsd) || !isFiniteNumber(entry.baselineCostUsd) || entry.costUsd < 0 || entry.baselineCostUsd < 0) {
      excluded += 1;
      continue;
    }
    entries += 1;
    cost += entry.costUsd;
    baseline += entry.baselineCostUsd;
    models.add(typeof entry.model === "string" && entry.model ? entry.model : "unknown");
  }
  const baseBasis = {
    entries,
    excludedEntries: excluded,
    costUsd: cost,
    baselineCostUsd: baseline,
    referenceModel: typeof input.referenceModel === "string" ? input.referenceModel : null,
    // Sorted so the same usage in a different row order gives the same basis.
    models: entries > 0 ? [...models].sort().join(", ") : null
  };
  if (entries === 0) {
    return unmeasured(key, "No usage with a cost and a baseline cost was recorded.", baseBasis);
  }
  if (!(baseline > 0)) {
    return unmeasured(
      key,
      "The baseline cost is zero, so there is nothing to have saved against.",
      baseBasis
    );
  }
  return measured(key, 1 - cost / baseline, baseBasis);
}
function computeVelocityTrend(input) {
  const key = "velocityTrend";
  const fraction = input.recentFraction === void 0 ? DEFAULT_RECENT_FRACTION : input.recentFraction;
  const fractionOk = isFiniteNumber(fraction) && fraction > 0 && fraction < 1;
  const problem = windowProblem(input.window);
  if (problem) return unmeasured(key, problem, { recentFraction: fractionOk ? fraction : null });
  const { from, to } = input.window;
  const windowMs = to - from;
  if (!fractionOk) {
    return unmeasured(key, "The recent fraction must be strictly between 0 and 1.", {
      recentFraction: null,
      windowHours: windowMs / MS_PER_HOUR
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
    minimumCompletions: MIN_COMPLETIONS_FOR_TREND
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
  const r = recentRate / baselineRate;
  return measured(key, r / 2, {
    ...baseBasis,
    baselinePerHour: baselineRate,
    recentPerHour: recentRate,
    rateRatio: r
  });
}
function criticalPathMs(durations, deps) {
  const n = durations.length;
  const dependents = durations.map(() => []);
  const waitingOn = deps.map((d) => d.length);
  deps.forEach((ds, i) => ds.forEach((j) => dependents[j].push(i)));
  const finish = new Array(n).fill(0);
  const queue = [];
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
  return visited === n ? longest : null;
}
function emptyPlanResult(reason, tasks = 0, excludedTasks = 0) {
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
    contendedPairs: 0
  };
}
function measurePlanParallelization(plan, capacity) {
  if (!isValidCapacity(capacity)) {
    return emptyPlanResult(
      "Fleet capacity is not recorded as a whole number of at least 1, so the most the plan could have run at once is unknown."
    );
  }
  let excluded = 0;
  const tasks = [];
  for (const task of plan?.tasks ?? []) {
    if (!task || typeof task.id !== "string" || !isFiniteNumber(task.start) || !isFiniteNumber(task.end) || task.end < task.start) {
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
  const index = /* @__PURE__ */ new Map();
  for (let i = 0; i < tasks.length; i += 1) {
    if (index.has(tasks[i].id)) {
      return emptyPlanResult(
        "Two tasks in the plan share an id, so its dependency graph is ambiguous.",
        tasks.length,
        excluded
      );
    }
    index.set(tasks[i].id, i);
  }
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
  if (!Number.isFinite(workMs) || !Number.isFinite(wallClockMs)) {
    return emptyPlanResult(
      "The plan's recorded task times are out of range.",
      tasks.length,
      excluded
    );
  }
  const partial = {
    ...emptyPlanResult("", tasks.length, excluded),
    workMs,
    wallClockMs
  };
  if (!(workMs > 0) || !(wallClockMs > 0)) {
    return {
      ...partial,
      unmeasured: "Every task in the plan has zero recorded duration, so no work was measured."
    };
  }
  const deps = tasks.map((task) => {
    const seen = /* @__PURE__ */ new Set();
    for (const id of task.dependsOn ?? []) {
      const j = index.get(id);
      if (j !== void 0) seen.add(j);
    }
    return [...seen];
  });
  const critical = criticalPathMs(durations, deps);
  if (critical === null) {
    return {
      ...partial,
      unmeasured: "The plan's dependencies contain a cycle, so it has no critical path to measure against."
    };
  }
  if (!(critical > 0)) {
    return {
      ...partial,
      criticalPathMs: critical,
      unmeasured: "The plan's critical path has zero duration."
    };
  }
  const achieved = workMs / wallClockMs;
  const maxConcurrency = Math.min(capacity, workMs / critical);
  const baseRatio = clamp01(achieved / maxConcurrency);
  const fileSets = tasks.map((t) => t.files == null ? null : new Set(t.files));
  let overlappingPairs = 0;
  let contendedPairs = 0;
  let unknownPairs = 0;
  for (let i = 0; i < tasks.length; i += 1) {
    for (let j = i + 1; j < tasks.length; j += 1) {
      const overlap = Math.max(tasks[i].start, tasks[j].start) < Math.min(tasks[i].end, tasks[j].end);
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
  const working = {
    ...partial,
    criticalPathMs: critical,
    achievedConcurrency: achieved,
    maxConcurrency,
    baseRatio,
    overlappingPairs,
    contendedPairs
  };
  if (unknownPairs > 0) {
    return {
      ...working,
      unmeasured: "Some tasks that ran at the same time have no record of the files they touched, so contention cannot be assessed."
    };
  }
  const contention = overlappingPairs === 0 ? 0 : contendedPairs / overlappingPairs;
  return { ...working, unmeasured: null, ratio: clamp01(baseRatio * (1 - contention)) };
}
function computeParallelizationQuality(input) {
  const key = "parallelizationQuality";
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
  let firstSkipReason = null;
  for (const plan of plans) {
    const capacity = plan && plan.capacity !== void 0 && plan.capacity !== null ? plan.capacity : input.capacity;
    const result = measurePlanParallelization(plan, capacity);
    if (result.ratio === null || result.baseRatio === null || result.achievedConcurrency === null || result.maxConcurrency === null) {
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
    firstSkipReason
  };
  if (plans.length === 0) {
    return unmeasured(key, "No executed plan was recorded.", baseBasis);
  }
  if (measuredPlans === 0 || !(workMs > 0)) {
    return unmeasured(
      key,
      plans.length === 1 && firstSkipReason ? firstSkipReason : `None of the ${plans.length} executed plans could be measured.`,
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
    contendedPairs
  });
}
function computeScore(input, now) {
  const window = { from: input.from, to: now };
  const byKey = {
    runwayHealth: computeRunwayHealth({ samples: input.runwaySamples ?? [], window }),
    fleetUtilization: computeFleetUtilization({
      sessions: input.sessions ?? [],
      capacity: input.capacity,
      window
    }),
    planAccuracy: computePlanAccuracy({ tasks: input.tasks ?? [] }),
    costEfficiency: computeCostEfficiency({
      usage: input.usage ?? [],
      referenceModel: input.referenceModel
    }),
    velocityTrend: computeVelocityTrend({
      completions: input.completions ?? [],
      window,
      recentFraction: input.recentFraction
    }),
    parallelizationQuality: computeParallelizationQuality({
      plans: input.plans ?? [],
      capacity: input.capacity
    })
  };
  const dimensions = {};
  const unmeasuredKeys = [];
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
    unmeasured: unmeasuredKeys
  };
}

// src/score/evidence.ts
var MIN_HISTORY_FOR_ESTIMATE = 3;
function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
function isFiniteNumber2(x) {
  return typeof x === "number" && Number.isFinite(x);
}
function durationMinutes(task) {
  if (!task.completed) return null;
  if (!isFiniteNumber2(task.startedAt) || !isFiniteNumber2(task.completedAt)) return null;
  const ms = task.completedAt - task.startedAt;
  return ms > 0 ? ms / 6e4 : null;
}
function estimateTasks(tasks, from, now) {
  const history = tasks.map((task) => ({ task, minutes: durationMinutes(task) })).filter(
    (entry) => entry.minutes !== null && Boolean(entry.task.complexity)
  ).sort((a, b) => a.task.completedAt - b.task.completedAt);
  const out = [];
  for (const task of tasks) {
    const actual = durationMinutes(task);
    if (actual === null) continue;
    if (task.completedAt < from || task.completedAt > now) continue;
    let estimate = null;
    if (task.complexity) {
      const earlier = [];
      for (const prior of history) {
        if (prior.task.completedAt >= task.startedAt) break;
        if (prior.task.complexity === task.complexity) earlier.push(prior.minutes);
      }
      if (earlier.length >= MIN_HISTORY_FOR_ESTIMATE) estimate = median(earlier);
    }
    out.push({ estimatedMinutes: estimate, actualMinutes: actual });
  }
  return out;
}
function executedPlans(tasks, from, now) {
  const byPlan = /* @__PURE__ */ new Map();
  for (const task of tasks) {
    if (!isFiniteNumber2(task.startedAt) || !isFiniteNumber2(task.completedAt)) continue;
    if (task.completedAt <= task.startedAt) continue;
    const rows = byPlan.get(task.planId) ?? [];
    rows.push(task);
    byPlan.set(task.planId, rows);
  }
  const plans = [];
  for (const rows of byPlan.values()) {
    const inWindow = rows.some((t) => t.completedAt >= from && t.completedAt <= now);
    if (!inWindow) continue;
    plans.push({
      tasks: rows.map(
        (t) => ({
          id: t.taskCode,
          start: t.startedAt,
          end: t.completedAt,
          dependsOn: t.dependencies,
          files: t.filesChanged
        })
      )
    });
  }
  return plans;
}
function recordedCapacity(runway, from, now) {
  let latest = null;
  for (const row of runway) {
    if (!isFiniteNumber2(row.at) || row.at < from || row.at > now) continue;
    if (!isFiniteNumber2(row.capacity)) continue;
    if (!latest || row.at > latest.at) latest = row;
  }
  return latest?.capacity ?? null;
}
function buildScoreInput(evidence, options) {
  const { from, now } = options;
  const runwaySamples = evidence.runway.map((row) => ({
    at: row.at,
    runwayHours: row.runwayHours
  }));
  const sessions = evidence.sessions.map((s) => ({
    start: s.startedAt,
    end: s.endedAt
  }));
  const ended = evidence.sessions.filter(
    (s) => isFiniteNumber2(s.endedAt) && s.endedAt >= from && s.endedAt <= now
  );
  const usage = [];
  const references = /* @__PURE__ */ new Set();
  for (const s of ended) {
    if (!isFiniteNumber2(s.listCostUsd) || !isFiniteNumber2(s.referenceCostUsd)) continue;
    usage.push({ model: s.model, costUsd: s.listCostUsd, baselineCostUsd: s.referenceCostUsd });
    if (s.referenceModel) references.add(s.referenceModel);
  }
  return {
    from,
    capacity: options.capacity ?? recordedCapacity(evidence.runway, from, now),
    runwaySamples,
    sessions,
    tasks: estimateTasks(evidence.tasks, from, now),
    usage,
    // More than one when sessions with different token mixes were dearest on
    // different models. Named, all of them, rather than picking one.
    referenceModel: references.size > 0 ? [...references].sort().join(", ") : null,
    completions: ended.filter((s) => s.outcome === "complete").map((s) => s.endedAt),
    plans: executedPlans(evidence.tasks, from, now)
  };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  DEFAULT_RECENT_FRACTION,
  MIN_COMPLETIONS_FOR_TREND,
  MIN_HISTORY_FOR_ESTIMATE,
  MIN_RUNWAY_COVERED_MINUTES,
  MIN_RUNWAY_SAMPLES,
  MIN_TASKS_FOR_ACCURACY,
  MIN_TASKS_FOR_PARALLELIZATION,
  RUNWAY_SAMPLE_MAX_HOLD_MINUTES,
  RUNWAY_TARGET_HOURS,
  SCORE_DIMENSIONS,
  SCORE_MODEL,
  SCORE_MODEL_VERSION,
  SCORE_TOTAL,
  WORKING_BREAK_MINUTES,
  buildScoreInput,
  clampDimension,
  computeCostEfficiency,
  computeFleetUtilization,
  computeParallelizationQuality,
  computePlanAccuracy,
  computeRunwayHealth,
  computeScore,
  computeVelocityTrend,
  estimateTasks,
  executedPlans,
  measurePlanParallelization,
  scoreModelIsValid,
  totalFrom
});
//# sourceMappingURL=index.js.map