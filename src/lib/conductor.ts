/**
 * DevPilot's implementation of `ConductorPorts`.
 *
 * This is the seam between the LangGraph conductor and the code that already
 * works. The graph decides *what happens next*; everything below hands it the
 * same functions the previous controller called.
 *
 * Nothing here re-implements dispatch. `dispatchWave` delegates to
 * `WaveExecutionController`, which loads the wave's tasks, checks fleet
 * capacity and drives `WaveDispatchCoordinator` — the path verified end to end
 * with two real Claude Code sessions. What the graph supersedes is the
 * controller's *orchestration*: `approve`, `onTaskComplete` and
 * `handleWaveComplete` decided sequencing from inside callbacks, and those
 * decisions are now edges in the graph. The controller remains as the effects
 * library underneath.
 *
 * For a plan this graph runs, the graph is the ONLY thing that decides a wave
 * is over, starts the next one, backfills a wave when a slot frees, or ends the
 * run. `src/lib/orchestrator.ts` tells the execution bridge so (it registers
 * the graph as the plan's `WaveDriver`); the bridge then records task state and
 * notifies, and every dispatch for the plan goes through `dispatchWave` below.
 *
 * The langchain dependency stops here, in the Next app. It is deliberately NOT
 * in `@devpilot.sh/core`, which every CLI install pulls down.
 */

import {
  PlanRefinementService,
  WaveDispatchCoordinator,
  WaveExecutionController,
  type ParsedWavePlan,
  type PlanScore,
  type PromptConstructorConfig,
  resolvePlannerModel,
} from '@devpilot.sh/core/wave-planner';
import type {
  ConductorPorts,
  DispatchWaveResult,
  GeneratePlanInput,
  GeneratePlanOutput,
  PlanScoreShape,
  WavePlanShape,
} from '@devpilot.sh/conductor-agent';
import { getWaveExecutionConfig, getServerOrchestrator } from './orchestrator';
import { mempalace } from '@devpilot.sh/core';
import { memoryConfigFromEnv, wingSlugForRepo } from './conductor-memory';
import { db, wavePlans } from '@/lib/db';
import { and, eq } from 'drizzle-orm';

export interface DevPilotPortsOptions {
  apiKey: string;
  model?: string;
  /** Repo checkout the prompt constructor reads codebase context from. */
  workingDir?: string;
  /** Persist an approved plan and return the host's wave plan id. */
  persist: (
    plan: ParsedWavePlan,
    score: PlanScore,
    input: GeneratePlanInput
  ) => Promise<{ wavePlanId: string }>;
  onEvent?: ConductorPorts['onEvent'];
}

export function createDevPilotPorts(options: DevPilotPortsOptions): ConductorPorts {
  /**
   * APPLY-BACK. The Synaptic Wiki work names its own failure mode plainly:
   * *"Synaptic Wiki is learned but never applied back into the brief."*
   *
   * DevPilot was one line away from the identical bug. `PromptConstructor` has
   * accepted a `MemPalaceService` for releases, and nothing ever passed one — so
   * every drawer written was write-only. Recall is wired here, in the same
   * change that starts writing records, because memory that is never read is a
   * database, not a memory.
   */
  const memoryConfig = memoryConfigFromEnv();
  const memory =
    memoryConfig.mode === 'disabled' ? undefined : new mempalace.MemPalaceService(memoryConfig);

  const refinementService = new PlanRefinementService(
    {
      apiKey: options.apiKey,
      model: resolvePlannerModel(options.model),
      maxTokens: 8192,
    },
    {}
  );

  // Attach recall to the very constructor the planner will use.
  if (memory) refinementService.promptConstructor.setMemPalaceService(memory);

  const executionConfig = getWaveExecutionConfig();
  const controller = new WaveExecutionController(
    executionConfig,
    new WaveDispatchCoordinator(executionConfig)
  );

  /**
   * Conductor constraints ride `customConstraints`, the field the prompt
   * templates already render — not appended to the spec text. Splicing them into
   * the spec would have put human instructions where the model expects a
   * requirements document, and made them indistinguishable from the spec on the
   * next refinement pass.
   */
  function constructorConfig(input: GeneratePlanInput): PromptConstructorConfig {
    return {
      workingDir: options.workingDir ?? process.cwd(),
      customConstraints: input.constraints,
      // One wing per repo: recall is scoped to the codebase being planned, so a
      // lesson from another repo cannot silently steer this plan.
      memPalaceWingSlug: wingSlugForRepo(input.repo),
      // Topic hints drive L2 recall. The title is what makes a past run
      // comparable to this one.
      memPalaceTopicHints: [input.itemTitle, input.repo],
      // Bounded on purpose. Memory competes with the spec for the context
      // window, and a plan is better served by its own requirements than by
      // pages of history.
      memPalaceMaxTokens: Number(process.env.DEVPILOT_MEMORY_MAX_TOKENS ?? 2000),
    };
  }

  async function generate(input: GeneratePlanInput): Promise<GeneratePlanOutput> {
    const result = await refinementService.generateInitialPlan(
      input.specContent,
      input.itemTitle,
      input.itemId,
      input.repo,
      constructorConfig(input)
    );
    return {
      plan: result.plan as unknown as WavePlanShape,
      tokensUsed: result.tokensUsed,
    };
  }

  async function refine(input: GeneratePlanInput): Promise<GeneratePlanOutput> {
    // No previous plan means the graph routed here before generation ran —
    // treat it as a first pass rather than throwing mid-run.
    if (!input.previousPlan) return generate(input);

    const result = await refinementService.refineplan(
      input.specContent,
      input.itemTitle,
      input.itemId,
      input.repo,
      constructorConfig(input),
      input.previousPlan as unknown as ParsedWavePlan,
      input.previousScore?.parallelizationScore ?? 0
    );
    return {
      plan: result.plan as unknown as WavePlanShape,
      tokensUsed: result.tokensUsed,
    };
  }

  return {
    generatePlan: generate,
    refinePlan: refine,

    // Deterministic, and it stays that way — this is the gate the refinement
    // loop branches on, so an LLM here would make the loop unfalsifiable.
    scorePlan: (plan) =>
      refinementService.scorePlan(
        plan as unknown as ParsedWavePlan
      ) as unknown as PlanScoreShape,

    persistPlan: (plan, score, input) =>
      options.persist(
        plan as unknown as ParsedWavePlan,
        score as unknown as PlanScore,
        input
      ),

    async dispatchWave(wavePlanId, waveIndex): Promise<DispatchWaveResult> {
      // MUST come first. `WaveDispatchCoordinator` resolves the orchestrator
      // through core's lazily-initialised singleton, and `getServerOrchestrator`
      // is what initialises it. Routes that dispatch happened to call it on the
      // way in; this one does not, so without this line every task came back
      // ORCHESTRATOR_UNAVAILABLE and was silently *queued* — a dispatch that
      // reports success, changes no task status, and starts no agent.
      getServerOrchestrator();

      // Adopting a plan that was generated outside the conductor: handing it to
      // the graph is the approval. Only from `draft` — this used to write
      // `executing` unconditionally after every dispatch, which is how a plan
      // that had just been FAILED was put back to `executing` by the wave retry
      // that followed, and the run then waited forever on a wave with nothing
      // left to dispatch.
      await db
        .update(wavePlans)
        .set({ status: 'approved' })
        .where(and(eq(wavePlans.id, wavePlanId), eq(wavePlans.status, 'draft')));

      // `driveWave` moves the plan to `executing` on its first dispatch, keeps
      // the wave pointer in the row rather than only in graph state — the
      // cockpit and the hosted plane both read this table, not the checkpoint —
      // and reports `settled` when the wave is already over, so the graph does
      // not suspend on a wave nothing will ever report on.
      //
      // "Already over" is asked through the controller's wave gate. For a plan
      // whose tasks each have their own branch, a wave found finished here —
      // a run re-entered after a restart — is merged into the run branch
      // before `settled` says so, and so before the graph moves to the next.
      const result = await controller.driveWave(wavePlanId, waveIndex);
      return {
        dispatched: result.dispatched,
        queued: result.queued,
        errors: result.errors ?? [],
        ...(result.settled ? { settled: result.settled } : {}),
      };
    },

    /**
     * Write the run's ending where everything else reads it.
     *
     * The execution bridge used to mark a plan `completed` when its last wave
     * finished. It no longer does for a plan the graph runs — that was the
     * second driver — so this is now the only thing that will.
     *
     * A failed run has normally been failed already, by the task that ended it
     * (`failPlan` keeps that first, more specific reason and returns false
     * here). This covers the cases where the graph decided: a wave reported
     * failed under a configuration the controller did not halt on.
     */
    async endRun(wavePlanId, result) {
      if (result.status === 'failed') {
        await controller.failPlan(wavePlanId, result.reason);
        return;
      }

      if (!(await controller.completePlan(wavePlanId))) {
        // The graph says complete and the row would not move — it was failed,
        // or completed already. Say so; do not overwrite it.
        const plan = await db.query.wavePlans.findFirst({ where: eq(wavePlans.id, wavePlanId) });
        if (plan?.status !== 'completed') {
          console.error(
            `Conductor run finished, but wave plan ${wavePlanId} is '${plan?.status ?? 'missing'}' and was left as it is.`
          );
        }
      }
    },

    // `waitForWave` is intentionally absent. A wave is a fleet of coding agents
    // running for minutes to hours; the graph interrupts instead, and the
    // execution bridge resumes it (`conductor-resume.ts`) as tasks report. See
    // docs/CONDUCTOR-AGENT.md.

    onEvent: options.onEvent,
  };
}
