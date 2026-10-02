/**
 * A planning episode: what the planner was told, what it answered, what a
 * person said about it, and how the plan turned out.
 *
 * `trace.ts` writes the first three as they happen. The fourth was already
 * being recorded, task by task, by the execution side — status, attempts,
 * errors, the files each task really changed, when it merged, what its session
 * cost. This file is the join, and the handful of figures that turn a finished
 * run into something a plan can be judged by.
 *
 * It is the half that decides what counts, on plain rows: no database, no
 * clock. The loader that fills the rows is column mappings.
 *
 * ## What an outcome is, and is not
 *
 * Everything here is about how the plan RAN: did its tasks finish, first time,
 * without colliding, on the files it said they would touch. Nothing here knows
 * whether the code was right. A plan whose every task finished cleanly and
 * built the wrong thing scores perfectly, and a reader must not take these
 * figures for a measure of quality. They are the part of quality a planner is
 * directly responsible for.
 *
 * ## Local
 *
 * An episode holds a specification, a file tree, a plan and what agents said
 * they did. `redactEpisode` produces the same episode with every piece of text
 * and every path removed, leaving shape and figures.
 */

export const PLANNER_EPISODE_SCHEMA = 'devpilot.planner-episode/1';

export interface EpisodeCall {
  step: number;
  kind: string;
  at: string;
  template: string;
  templateVersion: string;
  modelRequested: string;
  model: string | null;
  prompt: string | null;
  response: string | null;
  /** `valid`, `invalid` or `error`. */
  outcome: string;
  errors: string[];
  warnings: string[];
  taskCount: number | null;
  score: number | null;
  previousScore: number | null;
  /** For a refinement: whether it scored above the plan it was given. */
  improved: boolean | null;
  /** Whether this call's answer is the plan that was persisted. */
  chosen: boolean;
  stopReason: string | null;
  tokensInput: number | null;
  tokensOutput: number | null;
  cacheReadTokens: number | null;
  cacheWriteTokens: number | null;
  durationMs: number | null;
  constraints: string[];
}

export interface EpisodeReview {
  at: string;
  action: string;
  constraints: string[];
  reason: string | null;
  score: number | null;
}

export interface EpisodeTask {
  taskCode: string;
  waveIndex: number;
  description: string | null;
  /** The files the plan said the task would touch. */
  filePaths: string[];
  dependencies: string[];
  complexity: string | null;
  recommendedModel: string | null;
  status: string;
  attempts: number;
  error: string | null;
  summary: string | null;
  /** The files the task's latest attempt changed. Null is "not recorded", not "none". */
  filesChanged: string[] | null;
  startedAt: number | null;
  completedAt: number | null;
  merged: boolean;
  /** The latest attempt's session, when it ended and reported. */
  costUsd: number | null;
  tokens: number | null;
}

export interface EpisodePlan {
  wavePlanId: string;
  status: string;
  failureReason: string | null;
  version: number;
  totalWaves: number;
  totalTasks: number;
  criticalPathLength: number;
  parallelizationScore: number;
  isolated: boolean | null;
  /** How many tasks the assigner moved, by reason. Null when it was not recorded. */
  adjustments: Record<string, number> | null;
  codeGraphUsed: boolean | null;
  createdAt: number;
  startedAt: number | null;
  completedAt: number | null;
  tasks: EpisodeTask[];
}

export interface PlanOutcome {
  /** How the run ended: `completed`, `failed`, `running`, or `not-run` (never dispatched). */
  ended: 'completed' | 'failed' | 'running' | 'not-run';
  tasks: {
    total: number;
    /** Tasks that were dispatched at least once. */
    dispatched: number;
    completed: number;
    failed: number;
    skipped: number;
    /** Needed more than one attempt, however they ended. */
    retried: number;
    /** Ended on a branch that would not merge into the run branch. */
    conflicted: number;
  };
  /**
   * Of the tasks that were dispatched and have ended, the share that completed
   * on their first attempt. Null when none has ended.
   */
  firstAttemptPassRate: number | null;
  /**
   * How well the plan predicted which files each task would touch — the
   * prediction every conflict check rests on. Over tasks whose changes were
   * recorded:
   *
   *   precision  of the files the plan named, the share that were changed
   *   recall     of the files that were changed, the share the plan named
   *
   * Null when no task recorded its changes.
   */
  files: {
    tasksMeasured: number;
    planned: number;
    changed: number;
    both: number;
    precision: number | null;
    recall: number | null;
  } | null;
  /**
   * Pairs of tasks that ran in the same wave and changed the same file — the
   * collision the wave layout exists to prevent, counted from what was
   * actually changed rather than what was planned.
   */
  sameWaveCollisions: number;
  /** First dispatch to last ending. Null until the run has both. */
  wallClockMs: number | null;
  /** Added over the tasks whose session reported one. Latest attempt only. */
  costUsd: number | null;
  tokens: number | null;
}

export interface PlannerEpisode {
  schema: typeof PLANNER_EPISODE_SCHEMA;
  itemId: string;
  repo: string | null;
  calls: EpisodeCall[];
  reviews: EpisodeReview[];
  /** Null when no plan was persisted: the run was abandoned at review, or every call failed. */
  plan: EpisodePlan | null;
  outcome: PlanOutcome | null;
}

const normalizePath = (path: string) => path.trim().replace(/\\/g, '/').replace(/^(\.\/)+/, '');

const ENDED = new Set(['completed', 'failed', 'skipped']);

/** The figures a finished — or unfinished — run is judged by. */
export function planOutcome(plan: EpisodePlan): PlanOutcome {
  const tasks = plan.tasks;
  const dispatched = tasks.filter((t) => t.startedAt !== null);
  const completed = tasks.filter((t) => t.status === 'completed');
  const failed = tasks.filter((t) => t.status === 'failed');
  const conflicted = tasks.filter((t) => t.error?.startsWith('merge conflict') ?? false);

  const settled = dispatched.filter((t) => ENDED.has(t.status));
  const firstTime = settled.filter((t) => t.status === 'completed' && t.attempts === 1);

  // Planned against changed, added up over tasks so a task with twenty files
  // counts for more than a task with one.
  let planned = 0;
  let changed = 0;
  let both = 0;
  let tasksMeasured = 0;
  for (const task of tasks) {
    if (task.filesChanged === null) continue;
    tasksMeasured += 1;
    const plannedSet = new Set(task.filePaths.map(normalizePath));
    const changedSet = new Set(task.filesChanged.map(normalizePath));
    planned += plannedSet.size;
    changed += changedSet.size;
    for (const file of changedSet) if (plannedSet.has(file)) both += 1;
  }

  // Same wave, same file, both actually changed it.
  let sameWaveCollisions = 0;
  const byWave = new Map<number, EpisodeTask[]>();
  for (const task of tasks) {
    if (task.filesChanged === null || task.filesChanged.length === 0) continue;
    const list = byWave.get(task.waveIndex) ?? [];
    list.push(task);
    byWave.set(task.waveIndex, list);
  }
  for (const wave of byWave.values()) {
    for (let i = 0; i < wave.length; i++) {
      const mine = new Set(wave[i].filesChanged!.map(normalizePath));
      for (let j = i + 1; j < wave.length; j++) {
        if (wave[j].filesChanged!.some((file) => mine.has(normalizePath(file)))) sameWaveCollisions += 1;
      }
    }
  }

  const starts = dispatched.map((t) => t.startedAt!).filter((n) => Number.isFinite(n));
  const ends = tasks.map((t) => t.completedAt).filter((n): n is number => n !== null);
  const over = plan.status === 'completed' || plan.status === 'failed';
  const wallClockMs =
    over && starts.length > 0 && ends.length > 0 ? Math.max(0, Math.max(...ends) - Math.min(...starts)) : null;

  const costs = tasks.map((t) => t.costUsd).filter((n): n is number => n !== null);
  const tokens = tasks.map((t) => t.tokens).filter((n): n is number => n !== null);

  return {
    ended:
      plan.status === 'completed'
        ? 'completed'
        : plan.status === 'failed'
          ? 'failed'
          : dispatched.length === 0
            ? 'not-run'
            : 'running',
    tasks: {
      total: tasks.length,
      dispatched: dispatched.length,
      completed: completed.length,
      failed: failed.length,
      skipped: tasks.filter((t) => t.status === 'skipped').length,
      retried: tasks.filter((t) => t.attempts > 1).length,
      conflicted: conflicted.length,
    },
    firstAttemptPassRate: settled.length > 0 ? firstTime.length / settled.length : null,
    files:
      tasksMeasured > 0
        ? {
            tasksMeasured,
            planned,
            changed,
            both,
            precision: planned > 0 ? both / planned : null,
            recall: changed > 0 ? both / changed : null,
          }
        : null,
    sameWaveCollisions,
    wallClockMs,
    costUsd: costs.length > 0 ? costs.reduce((a, b) => a + b, 0) : null,
    tokens: tokens.length > 0 ? tokens.reduce((a, b) => a + b, 0) : null,
  };
}

/**
 * Group calls, reviews and plans into episodes.
 *
 * One episode per persisted plan, holding the calls and reviews that carry its
 * id. Calls and reviews that never led to a plan — a run abandoned at review,
 * or one where every call failed — are one episode per item, with no plan. A
 * plan with no recorded calls (made before calls were recorded) is still an
 * episode: its outcome is real, and it is what calibration is drawn from.
 *
 * Newest first, by the plan's creation or the first call.
 */
export function buildEpisodes(input: {
  calls: (EpisodeCall & { itemId: string; repo: string; wavePlanId: string | null })[];
  reviews: (EpisodeReview & { itemId: string; wavePlanId: string | null })[];
  plans: (EpisodePlan & { itemId: string; repo: string | null })[];
}): PlannerEpisode[] {
  const byAt = <T extends { at: string }>(a: T, b: T) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0);
  const strip = <T extends object, K extends keyof T>(row: T, ...keys: K[]): Omit<T, K> => {
    const copy = { ...row };
    for (const key of keys) delete copy[key];
    return copy;
  };

  const episodes: (PlannerEpisode & { sortAt: number })[] = [];

  for (const plan of input.plans) {
    const calls = input.calls.filter((c) => c.wavePlanId === plan.wavePlanId).sort(byAt);
    const reviews = input.reviews.filter((r) => r.wavePlanId === plan.wavePlanId).sort(byAt);
    const body = strip(plan, 'itemId', 'repo') as EpisodePlan;
    episodes.push({
      schema: PLANNER_EPISODE_SCHEMA,
      itemId: plan.itemId,
      repo: plan.repo ?? calls[0]?.repo ?? null,
      calls: calls.map((c) => strip(c, 'itemId', 'repo', 'wavePlanId') as EpisodeCall),
      reviews: reviews.map((r) => strip(r, 'itemId', 'wavePlanId') as EpisodeReview),
      plan: body,
      outcome: planOutcome(body),
      sortAt: plan.createdAt,
    });
  }

  const known = new Set(input.plans.map((p) => p.wavePlanId));
  const loose = new Map<string, { calls: typeof input.calls; reviews: typeof input.reviews }>();
  const bucket = (itemId: string) => {
    let b = loose.get(itemId);
    if (!b) loose.set(itemId, (b = { calls: [], reviews: [] }));
    return b;
  };
  // Unlinked, or linked to a plan outside what was loaded: without the plan
  // there is no outcome to join, and they are reported as what they are.
  for (const call of input.calls) if (!call.wavePlanId || !known.has(call.wavePlanId)) bucket(call.itemId).calls.push(call);
  for (const review of input.reviews)
    if (!review.wavePlanId || !known.has(review.wavePlanId)) bucket(review.itemId).reviews.push(review);

  for (const [itemId, rows] of loose) {
    const calls = rows.calls.sort(byAt);
    const reviews = rows.reviews.sort(byAt);
    const first = calls[0]?.at ?? reviews[0]?.at;
    episodes.push({
      schema: PLANNER_EPISODE_SCHEMA,
      itemId,
      repo: calls[0]?.repo ?? null,
      calls: calls.map((c) => strip(c, 'itemId', 'repo', 'wavePlanId') as EpisodeCall),
      reviews: reviews.map((r) => strip(r, 'itemId', 'wavePlanId') as EpisodeReview),
      plan: null,
      outcome: null,
      sortAt: first ? Date.parse(first) : 0,
    });
  }

  return episodes
    .sort((a, b) => b.sortAt - a.sortAt || (a.itemId < b.itemId ? -1 : 1))
    .map((episode) => strip(episode, 'sortAt') as PlannerEpisode);
}

/**
 * The same episode with every piece of text and every path taken out.
 *
 * What is left is shape and figures: how many calls, which template and model,
 * token counts, scores, whether each call was valid, what the reviewer chose
 * (not what they wrote), each task's wave, complexity, attempts and ending,
 * how many files it named and changed, and the outcome. It is what could be
 * compared across workspaces without any of them showing another its code.
 *
 * Counts replace lists. Nothing is hashed: a hash of a file path is a path to
 * anyone who can guess the path.
 */
export function redactEpisode(episode: PlannerEpisode): PlannerEpisode {
  return {
    ...episode,
    repo: null,
    calls: episode.calls.map((call) => ({
      ...call,
      prompt: null,
      response: null,
      errors: call.errors.map(() => '[removed]'),
      warnings: call.warnings.map(() => '[removed]'),
      constraints: call.constraints.map(() => '[removed]'),
    })),
    reviews: episode.reviews.map((review) => ({
      ...review,
      constraints: review.constraints.map(() => '[removed]'),
      reason: review.reason ? '[removed]' : null,
    })),
    plan: episode.plan
      ? {
          ...episode.plan,
          failureReason: episode.plan.failureReason ? '[removed]' : null,
          tasks: episode.plan.tasks.map((task) => ({
            ...task,
            description: null,
            filePaths: task.filePaths.map((_, i) => `file-${i + 1}`),
            error: task.error ? (task.error.startsWith('merge conflict') ? 'merge conflict' : '[removed]') : null,
            summary: null,
            filesChanged: task.filesChanged ? task.filesChanged.map((_, i) => `changed-${i + 1}`) : null,
          })),
        }
      : null,
  };
}

export interface CorpusSummary {
  episodes: number;
  withPlan: number;
  /** Plans whose run has ended, one way or the other. */
  ended: number;
  calls: number;
  /** Calls by how they ended. */
  callOutcomes: Record<string, number>;
  /** Refinement calls, and how many scored above the plan they were given. */
  refinements: number;
  refinementsImproved: number;
  /** Calls that stopped at the token ceiling. */
  truncated: number;
  reviews: Record<string, number>;
  tokensInput: number;
  tokensOutput: number;
  /** Over ended runs. */
  firstAttemptPassRate: number | null;
  filePrecision: number | null;
  fileRecall: number | null;
  sameWaveCollisions: number;
}

/** A corpus at a glance: how the planner is doing, on this machine's own runs. */
export function summarizeCorpus(episodes: readonly PlannerEpisode[]): CorpusSummary {
  const calls = episodes.flatMap((e) => e.calls);
  const callOutcomes: Record<string, number> = {};
  for (const call of calls) callOutcomes[call.outcome] = (callOutcomes[call.outcome] ?? 0) + 1;

  const reviews: Record<string, number> = {};
  for (const review of episodes.flatMap((e) => e.reviews)) reviews[review.action] = (reviews[review.action] ?? 0) + 1;

  const ended = episodes.filter((e) => e.outcome && (e.outcome.ended === 'completed' || e.outcome.ended === 'failed'));

  // Pooled over runs, not averaged across them: a run of thirty tasks says
  // more than a run of two.
  let settled = 0;
  let firstTime = 0;
  let planned = 0;
  let changed = 0;
  let both = 0;
  let collisions = 0;
  for (const episode of ended) {
    const plan = episode.plan!;
    const done = plan.tasks.filter((t) => t.startedAt !== null && ENDED.has(t.status));
    settled += done.length;
    firstTime += done.filter((t) => t.status === 'completed' && t.attempts === 1).length;
    planned += episode.outcome!.files?.planned ?? 0;
    changed += episode.outcome!.files?.changed ?? 0;
    both += episode.outcome!.files?.both ?? 0;
    collisions += episode.outcome!.sameWaveCollisions;
  }

  const refinements = calls.filter((c) => c.kind === 'refine');

  return {
    episodes: episodes.length,
    withPlan: episodes.filter((e) => e.plan).length,
    ended: ended.length,
    calls: calls.length,
    callOutcomes,
    refinements: refinements.length,
    refinementsImproved: refinements.filter((c) => c.improved === true).length,
    truncated: calls.filter((c) => c.stopReason === 'max_tokens').length,
    reviews,
    tokensInput: calls.reduce((sum, c) => sum + (c.tokensInput ?? 0), 0),
    tokensOutput: calls.reduce((sum, c) => sum + (c.tokensOutput ?? 0), 0),
    firstAttemptPassRate: settled > 0 ? firstTime / settled : null,
    filePrecision: planned > 0 ? both / planned : null,
    fileRecall: changed > 0 ? both / changed : null,
    sameWaveCollisions: collisions,
  };
}
