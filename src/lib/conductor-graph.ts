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
  codeGraphOf,
  dependentClaimsOf,
  readPlanCodeGraph,
  type ParsedWavePlan,
  type PlanScore,
  resolvePlannerModel,
} from '@devpilot.sh/core/wave-planner';
import { db, activityEvents, plans, wavePlans } from '@/lib/db';
import { eq } from 'drizzle-orm';
import type { EventType } from '@devpilot.sh/core/db';
import { createDevPilotPorts } from './conductor';
import { getServerOrchestrator, getWaveExecutionConfig } from './orchestrator';

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
): Promise<{ wavePlanId: string; totalWaves: number }> {
  const generator = new WavePlanGenerator({
    aiClient: {
      apiKey: process.env.ANTHROPIC_API_KEY ?? '',
      model: resolvePlannerModel(),
      maxTokens: 8192,
    },
  });

  const allTasks = plan.waves.flatMap((w) => w.tasks);
  const criticalPath = computeCriticalPath(allTasks, plan.dependencyEdges);

  /**
   * The waves are assigned with whatever the code graph said about this plan.
   *
   * Normally that is already on the plan: the generate and refine ports read
   * it when the plan was produced (`withBlastRadius` in `conductor.ts`), and
   * it is used as it stands, so the layout written here is the one the
   * reviewer was shown the reasons for. A plan with no reading — a run that
   * was at review when the cockpit was upgraded — is asked about now.
   *
   * `dependentClaimsOf` is undefined when the graph was not used or had
   * nothing to claim, and the option is then left off: the assignment is the
   * one this function always made.
   */
  let codeGraph = codeGraphOf(plan);
  if (!codeGraph) {
    getServerOrchestrator();
    codeGraph = await readPlanCodeGraph(input.repo, allTasks);
  }
  const dependentClaims = dependentClaimsOf(codeGraph);
  const assignment = assignWaves(
    allTasks,
    plan.dependencyEdges,
    dependentClaims ? { dependentClaims } : undefined
  );

  // `wave_plans.plan_id` is a NOT NULL foreign key into `plans(id)` — a
  // *different* id from the horizon item's. Both arguments used to be
  // `input.itemId`, which satisfied the signature's types and then failed at
  // insert time with a bare "FOREIGN KEY constraint failed", naming neither the
  // column nor the value. The comment here already claimed to be passing "the
  // horizon item's plan row"; now it actually is.
  const planRow = await db
    .select({ id: plans.id })
    .from(plans)
    .where(eq(plans.horizonItemId, input.itemId))
    .limit(1);

  /**
   * Create the parent row when it is missing rather than refusing to persist.
   *
   * `generatePlanForItem` creates a `plans` row before planning because the
   * generator needs a planId. The conductor does not go through that function —
   * it runs its own generate node and comes straight here — so on every
   * conductor-planned item the row simply did not exist.
   *
   * This threw instead, with a message telling the user to "generate the item's
   * plan before approving a wave plan". There is no way to do that: the plan
   * *was* generated, by the conductor, which is what produced the plan being
   * approved. Every item arriving from the Linear bridge hit this, so approval
   * on that path could never succeed — observed on AVA-10, a finished two-wave
   * plan that failed at the moment of approval.
   *
   * A missing parent is not a user error here; it is a bookkeeping gap between
   * two entry points. Fill it. Cost fields stay neutral, matching
   * `generatePlanForItem`'s precedent — `projectWavePlanToPlan` computes the
   * real numbers later. The confidence signals we already have from scoring.
   */
  let planId: string;
  if (planRow.length === 0) {
    const [created] = await db
      .insert(plans)
      .values({
        horizonItemId: input.itemId,
        estimatedCostUsd: 0,
        baselineCostUsd: 0,
        acceptanceCriteria: [],
        confidenceSignals: {
          overallConfidence: score.parallelizationScore,
          parallelization: score.confidenceSignals?.parallelization,
        },
        fleetContextSnapshot: {},
        memorySessionsUsed: [],
      })
      .returning({ id: plans.id });
    planId = created.id;
  } else {
    planId = planRow[0].id;
  }

  const wavePlanId = await generator.persistWavePlan(
    input.itemId,
    planId,
    plan,
    criticalPath,
    assignment,
    score,
    codeGraph
  );

  /**
   * `persistWavePlan` inserts every plan as `draft`, and nothing moved it.
   * Rows sat at `draft` while their waves were dispatching, so the column
   * reported the plan's lifecycle stage as "not yet reviewed" for runs that
   * were already executing — verified on wave plan d2p1ljmu…, `draft` with
   * eight tasks dispatching.
   *
   * In the conductor this node is only ever reached past the review gate, so
   * `approved` is exactly what it means. `dispatchWave` advances it to
   * `executing`.
   */
  await db
    .update(wavePlans)
    .set({ status: 'approved' })
    .where(eq(wavePlans.id, wavePlanId));

  /**
   * How many waves were WRITTEN, which is not always how many the planner
   * wrote. The assigner lays the waves out again: tasks the planner put side
   * by side that claim one file — or, with a code graph, where one's file
   * depends on the other's — are moved apart, which adds waves; a planner that
   * spread tasks over more waves than their dependencies need loses some.
   *
   * The graph counted `plan.waves` regardless. With more waves persisted than
   * planned it reached `finish` after the planner's last wave and the plan was
   * marked `completed` with the moved tasks still `pending` — never
   * dispatched, and nothing said so. With fewer it asked for a wave that does
   * not exist and the run died on "Wave N not found". It sequences by this
   * number now.
   */
  return { wavePlanId, totalWaves: assignment.totalWaves };
}

/**
 * Conductor events become activity feed rows, so the cockpit sees the run.
 *
 * Mapped onto the EXISTING `eventTypeValues` enum rather than new members. The
 * enum is a CHECK constraint in sqlite and postgres both; inventing a type here
 * fails the insert at runtime, which an activity row must never do.
 */
function recordEvent(event: ConductorEvent): void {
  // A backfill pass that started nothing is not news. The graph re-enters
  // `dispatch` every time a slot frees or the reconciler checks in, and most of
  // those passes find the cap still full; a feed row for each would bury the
  // ones that say an agent actually started.
  if (event.type === 'wave:dispatched' && event.backfill && event.dispatched === 0) return;

  // The score is a ratio in [0,1]. `Math.round` on it gave "score 0" or
  // "score 1" for every plan ever generated; a percentage is what the bridge's
  // Linear message already shows for the same number.
  const percent = (score: number) => `${Math.round(score * 100)}%`;

  const [type, message] = ((): [EventType, string] => {
    switch (event.type) {
      case 'plan:generated':
        return ['PLAN_GENERATED', `Plan generated (score ${percent(event.score)})`];
      case 'plan:refined':
        return [
          'PLAN_GENERATED',
          `Plan refined, pass ${event.iterations} (score ${percent(event.score)}${event.improved ? '' : ', discarded'})`,
        ];
      case 'plan:approved':
        return ['PLAN_APPROVED', 'Plan approved — staging waves'];
      case 'plan:aborted':
        return ['WAVE_PLAN_FAILED', `Plan rejected${event.reason ? `: ${event.reason}` : ''}`];
      case 'wave:dispatched':
        return [
          'WAVE_DISPATCHING',
          `Wave ${event.waveIndex + 1} ${event.backfill ? 'backfilled' : 'dispatched'} (${event.dispatched} tasks${event.queued ? `, ${event.queued} queued` : ''})`,
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
      /**
       * No wave-level retry, and the same failure policy the controller uses.
       *
       * DevPilot retries a failed TASK, once (`DEVPILOT_WAVE_RETRY_LIMIT`), in
       * `WaveExecutionController.onTaskFailed`. By the time a wave is reported
       * failed here every task in it is terminal, so the graph's own wave retry
       * (default 1) had nothing to re-dispatch — and that is the retry that
       * hung every run in which a task failed twice. Zero makes the first
       * failed wave apply the policy directly.
       *
       * The policy is read from the one place it is configured. The graph used
       * to take its default (`halt`) regardless, so with
       * `DEVPILOT_WAVE_FAILURE_POLICY=continue` the controller carried on and
       * the graph halted.
       */
      waveRetryLimit: 0,
      failurePolicy: getWaveExecutionConfig().failurePolicy,
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
