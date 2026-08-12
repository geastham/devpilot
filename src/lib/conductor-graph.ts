/**
 * Process-wide conductor graph for the Next app.
 *
 * Mirrors the `globalThis` guard used by `src/lib/db/index.ts` and
 * `src/lib/orchestrator.ts`: Next's route isolation and hot reload would
 * otherwise build a second graph with a second checkpointer, and two savers over
 * one sqlite file is how a suspended run gets resumed twice.
 */

import { SqliteSaver } from '@langchain/langgraph-checkpoint-sqlite';
import {
  createConductorGraph,
  type ConductorGraph,
  type ConductorEvent,
  type GeneratePlanInput,
} from '@devpilot.sh/conductor-agent';
import {
  WavePlanGenerator,
  computeCriticalPath,
  assignWaves,
  type ParsedWavePlan,
  type PlanScore,
} from '@devpilot.sh/core/wave-planner';
import { db, activityEvents } from '@/lib/db';
import type { EventType } from '@devpilot.sh/core/db';
import { createDevPilotPorts } from './conductor';

const globalForConductor = globalThis as unknown as {
  devpilotConductor?: ConductorGraph;
};

/**
 * Checkpoints live in their OWN sqlite file, not `data.db`.
 *
 * `SqliteSaver` creates and migrates its own tables. Pointing it at the
 * application database would put schema it manages next to schema drizzle
 * manages, and `pnpm db:check-sync` would report permanent drift against
 * tables nobody declared.
 */
function checkpointPath(): string {
  const appDb = process.env.DEVPILOT_SQLITE_PATH || '.devpilot/data.db';
  return (
    process.env.DEVPILOT_CHECKPOINT_PATH ??
    appDb.replace(/\.db$/, '') + '.checkpoints.db'
  );
}

/** The `persistPlan` port: recompute the derived structures, then write. */
async function persistPlan(
  plan: ParsedWavePlan,
  score: PlanScore,
  input: GeneratePlanInput
): Promise<{ wavePlanId: string }> {
  const generator = new WavePlanGenerator({
    aiClient: {
      apiKey: process.env.ANTHROPIC_API_KEY ?? '',
      model: 'claude-sonnet-4-20250514',
      maxTokens: 8192,
    },
  });

  const allTasks = plan.waves.flatMap((w) => w.tasks);
  const criticalPath = computeCriticalPath(allTasks, plan.dependencyEdges);
  const assignment = assignWaves(allTasks, plan.dependencyEdges);

  // planId is the horizon item's plan row; the wave plan hangs off the item.
  const wavePlanId = await generator.persistWavePlan(
    input.itemId,
    input.itemId,
    plan,
    criticalPath,
    assignment,
    score
  );

  return { wavePlanId };
}

/**
 * Conductor events become activity feed rows, so the cockpit sees the run.
 *
 * Mapped onto the EXISTING `eventTypeValues` enum rather than new members. The
 * enum is a CHECK constraint in sqlite and postgres both; inventing a type here
 * fails the insert at runtime, which an activity row must never do.
 */
function recordEvent(event: ConductorEvent): void {
  const [type, message] = ((): [EventType, string] => {
    switch (event.type) {
      case 'plan:generated':
        return ['PLAN_GENERATED', `Plan generated (score ${Math.round(event.score)})`];
      case 'plan:refined':
        return [
          'PLAN_GENERATED',
          `Plan refined, pass ${event.iterations} (score ${Math.round(event.score)}${event.improved ? '' : ', discarded'})`,
        ];
      case 'plan:approved':
        return ['PLAN_APPROVED', 'Plan approved — staging waves'];
      case 'plan:aborted':
        return ['WAVE_PLAN_FAILED', `Plan rejected${event.reason ? `: ${event.reason}` : ''}`];
      case 'wave:dispatched':
        return [
          'WAVE_DISPATCHING',
          `Wave ${event.waveIndex + 1} dispatched (${event.dispatched} tasks${event.queued ? `, ${event.queued} queued` : ''})`,
        ];
      case 'wave:complete':
        return ['WAVE_COMPLETE', `Wave ${event.waveIndex + 1} complete`];
      case 'wave:failed':
        return ['WAVE_TASK_FAILED', `Wave ${event.waveIndex + 1} failed (${event.failures} tasks)`];
      case 'run:complete':
        return ['WAVE_PLAN_COMPLETE', `All ${event.waves} waves complete`];
      case 'run:failed':
        return ['WAVE_PLAN_FAILED', `Run failed: ${event.reason}`];
    }
  })();

  // Fire and forget: an activity row must never fail a dispatch.
  void db.insert(activityEvents).values({ type, message }).catch(() => undefined);
}


export function getConductorGraph(): ConductorGraph {
  if (globalForConductor.devpilotConductor) {
    return globalForConductor.devpilotConductor;
  }

  const graph = createConductorGraph({
    ports: createDevPilotPorts({
      apiKey: process.env.ANTHROPIC_API_KEY ?? '',
      workingDir: process.env.DEVPILOT_WORKING_DIR ?? process.cwd(),
      persist: persistPlan,
      onEvent: recordEvent,
    }),
    config: {
      requireReview: process.env.DEVPILOT_CONDUCTOR_AUTO_APPROVE === 'true' ? false : true,
    },
    checkpointer: SqliteSaver.fromConnString(checkpointPath()),
  });

  globalForConductor.devpilotConductor = graph;
  return graph;
}

/** Thread id for an item's conductor run. One live run per horizon item. */
export function threadFor(itemId: string) {
  return { configurable: { thread_id: `item:${itemId}` } };
}
