/**
 * Planning episodes: the loader.
 *
 * What an episode is, how its outcome is worked out and what is removed when
 * it is redacted are decided in core (`planner-corpus.ts`), on plain rows,
 * where they are tested. This file reads the rows — planner calls, reviews,
 * plans, their tasks and the sessions that ran them — and maps columns. The
 * same split as `src/lib/history.ts`.
 *
 * LOCAL. It reads this cockpit's own database and answers whoever asked this
 * cockpit. Nothing here, and nothing that calls it, sends a prompt, a plan, a
 * review or an outcome to the hosted plane.
 */

import {
  buildEpisodes,
  type EpisodeCall,
  type EpisodePlan,
  type EpisodeReview,
  type PlannerEpisode,
} from '@devpilot.sh/core/wave-planner';
import {
  db,
  horizonItems,
  plannerReviews,
  plannerTraces,
  rufloSessions,
  wavePlans,
  waveTasks,
  desc,
  gte,
  inArray,
} from '@/lib/db';

/** SQLite's bound-parameter limit was 999 for a long time; stay well under it. */
const IN_CHUNK = 400;

/** Plans read in one answer. The caller is told when there were more. */
export const EPISODE_PLAN_LIMIT = 500;

const toMs = (value: Date | null | undefined): number | null => (value ? value.getTime() : null);
const finite = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

function chunked<T>(values: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < values.length; i += IN_CHUNK) out.push(values.slice(i, i + IN_CHUNK));
  return out;
}

/**
 * Every planning episode since `since`, newest first.
 *
 * A plan made before calls were recorded is still an episode, with no calls:
 * its outcome is real, and outcomes are what a planner is calibrated against.
 */
export async function loadPlannerEpisodes(
  since: Date
): Promise<{ episodes: PlannerEpisode[]; truncated: boolean }> {
  const planRows = await db
    .select()
    .from(wavePlans)
    .where(gte(wavePlans.createdAt, since))
    .orderBy(desc(wavePlans.createdAt))
    .limit(EPISODE_PLAN_LIMIT + 1);
  const truncated = planRows.length > EPISODE_PLAN_LIMIT;
  const keptPlans = planRows.slice(0, EPISODE_PLAN_LIMIT);

  const [callRows, reviewRows] = await Promise.all([
    db.select().from(plannerTraces).where(gte(plannerTraces.createdAt, since)),
    db.select().from(plannerReviews).where(gte(plannerReviews.createdAt, since)),
  ]);

  const tasks: (typeof waveTasks.$inferSelect)[] = [];
  for (const chunk of chunked(keptPlans.map((p) => p.id))) {
    tasks.push(...(await db.select().from(waveTasks).where(inArray(waveTasks.wavePlanId, chunk))));
  }

  // The session of each task's latest attempt — the only one a task names.
  const sessionIds = [...new Set(tasks.map((t) => t.assignedSessionId).filter((id): id is string => Boolean(id)))];
  const sessions: (typeof rufloSessions.$inferSelect)[] = [];
  for (const chunk of chunked(sessionIds)) {
    sessions.push(...(await db.select().from(rufloSessions).where(inArray(rufloSessions.id, chunk))));
  }
  const sessionById = new Map(sessions.map((s) => [s.id, s]));

  const itemIds = [...new Set(keptPlans.map((p) => p.horizonItemId))];
  const items: { id: string; repo: string }[] = [];
  for (const chunk of chunked(itemIds)) {
    items.push(
      ...(await db
        .select({ id: horizonItems.id, repo: horizonItems.repo })
        .from(horizonItems)
        .where(inArray(horizonItems.id, chunk)))
    );
  }
  const repoByItem = new Map(items.map((i) => [i.id, i.repo]));

  const plans: (EpisodePlan & { itemId: string; repo: string | null })[] = keptPlans.map((plan) => {
    const adjustments = Array.isArray(plan.adjustments)
      ? plan.adjustments.reduce<Record<string, number>>((counts, a) => {
          counts[a.type] = (counts[a.type] ?? 0) + 1;
          return counts;
        }, {})
      : null;

    return {
      itemId: plan.horizonItemId,
      repo: repoByItem.get(plan.horizonItemId) ?? null,
      wavePlanId: plan.id,
      status: plan.status,
      failureReason: plan.failureReason,
      version: plan.version,
      totalWaves: plan.totalWaves,
      totalTasks: plan.totalTasks,
      criticalPathLength: plan.criticalPathLength,
      parallelizationScore: plan.parallelizationScore,
      isolated: plan.isolated,
      adjustments,
      codeGraphUsed: plan.codeGraph ? plan.codeGraph.used : null,
      createdAt: plan.createdAt.getTime(),
      startedAt: toMs(plan.startedAt),
      completedAt: toMs(plan.completedAt),
      tasks: tasks
        .filter((t) => t.wavePlanId === plan.id)
        .sort((a, b) => a.waveIndex - b.waveIndex || (a.taskCode < b.taskCode ? -1 : 1))
        .map((task) => {
          const session = task.assignedSessionId ? sessionById.get(task.assignedSessionId) : undefined;
          const ended = session ? session.status === 'COMPLETE' || session.status === 'ERROR' : false;
          const cents = ended ? finite(session!.costUsd) : null;
          return {
            taskCode: task.taskCode,
            waveIndex: task.waveIndex,
            description: task.description,
            filePaths: task.filePaths ?? [],
            dependencies: task.dependencies ?? [],
            complexity: task.complexity,
            recommendedModel: task.recommendedModel,
            status: task.status,
            attempts: task.retryCount + 1,
            error: task.errorMessage,
            summary: task.completionSummary,
            // Null stays null: "not recorded" is not "changed nothing".
            filesChanged: Array.isArray(task.filesChanged) ? task.filesChanged : null,
            startedAt: toMs(task.startedAt),
            completedAt: toMs(task.completedAt),
            merged: task.mergedAt != null,
            // The session's cost column is whole cents, written when it ended.
            costUsd: cents === null ? null : cents / 100,
            tokens: ended ? finite(session!.tokensUsed) : null,
          };
        }),
    };
  });

  const calls: (EpisodeCall & { itemId: string; repo: string; wavePlanId: string | null })[] = callRows.map(
    (row) => ({
      itemId: row.itemId,
      repo: row.repo,
      wavePlanId: row.wavePlanId,
      step: row.step,
      kind: row.kind,
      at: row.createdAt.toISOString(),
      template: row.template,
      templateVersion: row.templateVersion,
      modelRequested: row.modelRequested,
      model: row.model,
      prompt: row.prompt,
      response: row.response,
      outcome: row.outcome,
      errors: row.errors ?? [],
      warnings: row.warnings ?? [],
      taskCount: row.taskCount,
      score: row.score,
      previousScore: row.previousScore,
      improved: row.improved,
      chosen: row.chosen,
      stopReason: row.stopReason,
      tokensInput: row.tokensInput,
      tokensOutput: row.tokensOutput,
      cacheReadTokens: row.cacheReadTokens,
      cacheWriteTokens: row.cacheWriteTokens,
      durationMs: row.durationMs,
      constraints: row.constraints ?? [],
    })
  );

  const reviews: (EpisodeReview & { itemId: string; wavePlanId: string | null })[] = reviewRows.map((row) => ({
    itemId: row.itemId,
    wavePlanId: row.wavePlanId,
    at: row.createdAt.toISOString(),
    action: row.action,
    constraints: row.constraints ?? [],
    reason: row.reason,
    score: row.score,
  }));

  return { episodes: buildEpisodes({ calls, reviews, plans }), truncated };
}
