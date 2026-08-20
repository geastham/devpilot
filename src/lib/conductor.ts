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
 * controller's *orchestration*: `approve`, `onTaskComplete`,
 * `handleWaveComplete` and `onTaskFailed` decided sequencing from inside
 * callbacks, and those decisions are now edges in the graph. The controller
 * remains as the effects library underneath.
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
import { eq } from 'drizzle-orm';

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

      const result = await controller.dispatchWave(wavePlanId, waveIndex);

      // Move the plan out of `approved` the moment work actually goes out, and
      // keep the wave pointer in the row rather than only in graph state — the
      // cockpit and the hosted plane both read this table, not the checkpoint.
      await db
        .update(wavePlans)
        .set({ status: 'executing', currentWaveIndex: waveIndex })
        .where(eq(wavePlans.id, wavePlanId));
      return {
        dispatched: result.dispatched,
        queued: result.queued,
        errors: result.errors ?? [],
      };
    },

    // `waitForWave` is intentionally absent. A wave is a fleet of coding agents
    // running for minutes to hours; the graph interrupts instead, and the
    // orchestrator completion callbacks resume it. See docs/CONDUCTOR-AGENT.md.

    onEvent: options.onEvent,
  };
}
