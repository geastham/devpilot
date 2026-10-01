/**
 * Work history for a set of files: the loader.
 *
 * What counts as history, in what order, and what is said about each task is
 * decided in core (`workHistoryForPaths`), on plain rows, where it is tested.
 * This file is the other half and nothing more: it reads the rows — wave
 * tasks, the plans and items they belong to, the sessions that ran them — and
 * maps columns. It is the same split `src/lib/score.ts` makes.
 *
 * LOCAL. It reads this cockpit's own database and returns to whoever asked
 * this cockpit. Nothing here, and nothing that calls it, sends a completion
 * summary, an error or a path to the hosted plane.
 */

import {
  workHistoryForPaths,
  type WorkHistoryResult,
  type WorkHistoryRow,
} from '@devpilot.sh/core/wave-planner';
import { db, horizonItems, wavePlans, waveTasks, rufloSessions, eq, inArray } from '@/lib/db';

/** SQLite's bound-parameter limit was 999 for a long time; stay well under it. */
const IN_CHUNK = 400;

const toMs = (value: Date | null | undefined): number | null => (value ? value.getTime() : null);

const finite = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

/**
 * The most recent tasks that changed each path, for one repository.
 *
 * Every wave task of the repository is read and filtered in memory. The paths
 * live in JSON columns, so matching them in SQL would mean `json_each` over
 * two columns with a fallback between them — the rule this exists to get right
 * — and the table is small: one row per task DevPilot has ever dispatched on
 * one person's machine. `loadScoreEvidence` reads the same table whole on
 * every score.
 *
 * `repo` is matched exactly against the item's repository (`owner/name`), so
 * one cockpit holding several repositories does not answer for a file with the
 * history of a file of the same path somewhere else.
 */
export async function loadWorkHistory(
  repo: string,
  paths: string[],
  limit?: number
): Promise<WorkHistoryResult> {
  const items = await db
    .select({ id: horizonItems.id, title: horizonItems.title, ticketId: horizonItems.linearTicketId })
    .from(horizonItems)
    .where(eq(horizonItems.repo, repo));

  if (items.length === 0) {
    return workHistoryForPaths([], paths, { limit });
  }
  const itemById = new Map(items.map((item) => [item.id, item]));

  const plans: { id: string; horizonItemId: string }[] = [];
  for (const chunk of chunked([...itemById.keys()])) {
    plans.push(
      ...(await db
        .select({ id: wavePlans.id, horizonItemId: wavePlans.horizonItemId })
        .from(wavePlans)
        .where(inArray(wavePlans.horizonItemId, chunk)))
    );
  }
  const planById = new Map(plans.map((plan) => [plan.id, plan]));

  const tasks: (typeof waveTasks.$inferSelect)[] = [];
  for (const chunk of chunked([...planById.keys()])) {
    tasks.push(...(await db.select().from(waveTasks).where(inArray(waveTasks.wavePlanId, chunk))));
  }

  // The session of each task's latest attempt. A task row names only that one;
  // earlier attempts of a retried task are not costed here, and the entry says
  // the task was retried.
  const sessionIds = [...new Set(tasks.map((t) => t.assignedSessionId).filter((id): id is string => Boolean(id)))];
  const sessions: (typeof rufloSessions.$inferSelect)[] = [];
  for (const chunk of chunked(sessionIds)) {
    sessions.push(...(await db.select().from(rufloSessions).where(inArray(rufloSessions.id, chunk))));
  }
  const sessionById = new Map(sessions.map((session) => [session.id, session]));

  const rows: WorkHistoryRow[] = tasks.map((task) => {
    const item = itemById.get(planById.get(task.wavePlanId)!.horizonItemId)!;
    const session = task.assignedSessionId ? sessionById.get(task.assignedSessionId) : undefined;

    return {
      taskCode: task.taskCode,
      label: task.label,
      status: task.status,
      filePaths: task.filePaths ?? [],
      // Null stays null: "not recorded" is not "changed nothing".
      filesChanged: Array.isArray(task.filesChanged) ? task.filesChanged : null,
      startedAt: toMs(task.startedAt),
      lastAttemptAt: toMs(task.lastAttemptAt),
      completedAt: toMs(task.completedAt),
      retryCount: task.retryCount,
      errorMessage: task.errorMessage,
      completionSummary: task.completionSummary,
      wavePlanId: task.wavePlanId,
      itemTitle: item.title,
      ticketId: item.ticketId,
      session: session
        ? {
            terminal: session.status === 'COMPLETE' || session.status === 'ERROR',
            reportedCostCents: finite(session.costUsd),
            telemetryCostUsd: finite(session.telemetry?.costUsd),
          }
        : null,
    };
  });

  return workHistoryForPaths(rows, paths, { limit });
}

function chunked<T>(values: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < values.length; i += IN_CHUNK) out.push(values.slice(i, i + IN_CHUNK));
  return out;
}
