/**
 * Resume a suspended conductor run when its current wave settles.
 *
 * The graph `interrupt()`s after dispatching a wave rather than holding a
 * promise open for the hour a fleet of agents might take. Something has to wake
 * it, and that something is the orchestrator completion callback — this module
 * is the bridge between the two.
 *
 * It is deliberately conservative: it resumes only when EVERY task in the wave
 * is terminal, and it never throws into the callback path. A completion report
 * that fails to advance a graph must still record the session, release its file
 * locks and return 200; the alternative is an agent that finished successfully
 * being reported as a failed callback and retried for ten minutes.
 */

import { Command } from '@devpilot.sh/conductor-agent';
import { db, wavePlans, waveTasks, eq, and } from '@/lib/db';
import { getConductorGraph, threadFor } from './conductor-graph';
import { recordRun } from './conductor-memory';

/** Statuses that mean a task will not change again. */
const TERMINAL = new Set(['completed', 'failed', 'cancelled']);

export interface WaveSettlement {
  resumed: boolean;
  reason?: string;
}

/**
 * Given a wave task that just reached a terminal state, resume the owning run if
 * its whole wave is now settled.
 */
export async function resumeConductorForTask(
  wavePlanId: string,
  waveIndex: number
): Promise<WaveSettlement> {
  try {
    const plan = await db.query.wavePlans.findFirst({
      where: eq(wavePlans.id, wavePlanId),
    });
    if (!plan?.horizonItemId) {
      return { resumed: false, reason: 'no owning horizon item' };
    }

    const tasks = await db.query.waveTasks.findMany({
      where: and(
        eq(waveTasks.wavePlanId, wavePlanId),
        eq(waveTasks.waveIndex, waveIndex)
      ),
    });

    if (tasks.length === 0) {
      return { resumed: false, reason: 'no tasks in wave' };
    }

    const unsettled = tasks.filter((t) => !TERMINAL.has(t.status));
    if (unsettled.length > 0) {
      return { resumed: false, reason: `${unsettled.length} tasks still running` };
    }

    const graph = getConductorGraph();
    const thread = threadFor(plan.horizonItemId);

    // Only resume a run that is actually suspended waiting for THIS wave.
    // Without this check a late duplicate callback would push a second resume
    // into a graph that had already advanced, and re-dispatch the next wave.
    const snapshot = await graph.getState(thread);
    const pending = snapshot.tasks.flatMap((t) => t.interrupts ?? []);
    const waitingFor = pending
      .map((i) => (i.value as { waveIndex?: number } | undefined)?.waveIndex)
      .find((v) => v !== undefined);

    if (waitingFor !== waveIndex) {
      return {
        resumed: false,
        reason:
          waitingFor === undefined
            ? 'run is not waiting on a wave'
            : `run is waiting on wave ${waitingFor}, not ${waveIndex}`,
      };
    }

    const failures = tasks
      .filter((t) => t.status !== 'completed')
      .map((t) => ({ taskCode: t.taskCode, error: t.errorMessage ?? t.status }));

    const result = (await graph.invoke(
      new Command({
        resume:
          failures.length > 0
            ? { state: 'failed' as const, failures }
            : { state: 'complete' as const },
      }),
      thread
    )) as Record<string, unknown>;

    // The last wave's completion callback is what finishes most runs, so this is
    // the path that actually writes most run records.
    if (result.status === 'complete' || result.status === 'failed') {
      void recordRun(wavePlanId);
    }

    return { resumed: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Conductor resume failed:', message);
    return { resumed: false, reason: message };
  }
}

/** Resolve a DevPilot session id to the wave task it was dispatched for. */
export async function waveForSession(
  sessionId: string
): Promise<{ wavePlanId: string; waveIndex: number } | null> {
  const task = await db.query.waveTasks.findFirst({
    where: eq(waveTasks.assignedSessionId, sessionId),
  });
  if (!task) return null;
  return { wavePlanId: task.wavePlanId, waveIndex: task.waveIndex };
}
