import type { ParsedWavePlan, PlanScore, OptimizationResult, GenerationResult } from './types';
import { PromptConstructor, PromptConstructorConfig } from './prompt-constructor';
import { WavePlannerAIClient, AIClientConfig, PlannerTruncatedError } from './ai-client';
import { parseWavePlanResponse } from './parser';
import { validateDAG } from './dag-validator';
import { computeCriticalPath } from './critical-path';
import { assignWaves } from './wave-assigner';
import { scorePlan } from './plan-scorer';
import { createFlatPlan } from './fallback';
import { newPlannerRunId, recordPlannerTrace, type PlannerTraceRecord } from './trace';

// ============================================================================
// Plan Refinement Service Configuration
// ============================================================================

export interface PlanRefinementConfig {
  /** Minimum parallelization score to accept (0-1) */
  minParallelizationScore: number;
  /** Maximum refinement iterations */
  maxRefinementIterations: number;
  /** Whether to use simplified template on retry */
  useSimplifiedOnRetry: boolean;
  /** Maximum tasks per wave for capacity constraints */
  maxTasksPerWave?: number;
}

/**
 * The refinement gate's threshold, for every path that plans.
 *
 * There were two. The route that generates a plan directly read
 * `WAVE_PLANNER_MIN_PARALLELIZATION` and defaulted to 0.3; the conductor graph
 * — the path every ticket from the bridge takes — had its own default of 0.7
 * and read no setting at all. So the same specification was held to "the
 * critical path is at most 70% of the tasks" on one path and "at most 30%" on
 * the other, and on the stricter one a plan of ten tasks in four waves (0.6)
 * was sent back twice to be cut smaller.
 *
 * One function, read by both. 0.3 is the looser of the two and is kept as the
 * default because the gate's number is a ratio of counts, not a measurement
 * of plans that went well — see `parallelizationGateApplies`. Until there is
 * such a measurement the gate should spend as few model calls as it can.
 */
export const DEFAULT_MIN_PARALLELIZATION_SCORE = 0.3;

export function resolveMinParallelizationScore(explicit?: number, env: NodeJS.ProcessEnv = process.env): number {
  if (typeof explicit === 'number' && Number.isFinite(explicit)) return explicit;
  const fromEnv = parseFloat(env.WAVE_PLANNER_MIN_PARALLELIZATION ?? '');
  return Number.isFinite(fromEnv) && fromEnv >= 0 && fromEnv <= 1 ? fromEnv : DEFAULT_MIN_PARALLELIZATION_SCORE;
}

/**
 * Plans smaller than this are not held to the parallelization gate.
 *
 * The score is `1 - criticalPath / tasks`. For a plan of one task that is 0;
 * for two or three tasks in sequence it is 0. None of those is a bad plan — a
 * specification that is one change is one task — but each was below any
 * threshold, so each was sent back to a prompt whose advice is to break work
 * into smaller pieces, up to the iteration limit, and a refinement was kept
 * whenever it scored higher, which splitting always does. The gate was
 * manufacturing tasks out of work that did not have them.
 *
 * With fewer than four tasks there is not enough plan for the ratio to say
 * anything, so the gate is not asked.
 */
export const MIN_TASKS_FOR_PARALLELIZATION_GATE = 4;

export function parallelizationGateApplies(taskCount: number): boolean {
  return taskCount >= MIN_TASKS_FOR_PARALLELIZATION_GATE;
}

const DEFAULT_REFINEMENT_CONFIG: PlanRefinementConfig = {
  minParallelizationScore: DEFAULT_MIN_PARALLELIZATION_SCORE,
  maxRefinementIterations: 2,
  useSimplifiedOnRetry: true,
  maxTasksPerWave: undefined,
};

// ============================================================================
// Plan Refinement Result
// ============================================================================

export interface RefinementResult {
  /** Final optimized plan */
  plan: ParsedWavePlan;
  /** Quality score of the plan */
  score: PlanScore;
  /** Number of refinement iterations performed */
  iterationsPerformed: number;
  /** Total tokens used across all iterations */
  totalTokensUsed: number;
  /** Whether refinement was successful */
  success: boolean;
  /** Error message if refinement failed */
  error?: string;
}

// ============================================================================
// Plan Refinement Service
// ============================================================================

/**
 * PlanRefinementService handles iterative refinement of wave plans.
 *
 * Responsibilities:
 * - Generate initial plan via AI
 * - Validate and score the plan
 * - Iteratively refine if below quality threshold
 * - Fall back to flat plan on complete failure
 */
export class PlanRefinementService {
  /**
   * Public so a host can attach a MemPalace service after construction —
   * `setMemPalaceService` is how recall reaches the planning prompt. Without an
   * accessor the service was unreachable and every memory written was write-only.
   */
  readonly promptConstructor: PromptConstructor;
  private aiClient: WavePlannerAIClient;
  private config: PlanRefinementConfig;

  /**
   * Why the most recent refinement pass was discarded, if it was.
   *
   * A discarded refinement is no longer fatal, which means it is no longer
   * loud either — without this the conductor would silently burn a model call
   * per iteration and report an unchanged score with no reason given.
   */
  lastRefinementError?: string;

  /**
   * The planning run a call belongs to, for its trace: an initial plan starts
   * one and its refinements continue it. A service built fresh after a restart
   * starts a new run for a refinement; the trace's `basedOnSha` still says
   * which plan it was refining.
   */
  private runId = newPlannerRunId();
  private step = 0;

  constructor(
    aiClientConfig: AIClientConfig,
    refinementConfig?: Partial<PlanRefinementConfig>
  ) {
    this.promptConstructor = new PromptConstructor();
    this.aiClient = new WavePlannerAIClient(aiClientConfig);
    this.config = { ...DEFAULT_REFINEMENT_CONFIG, ...refinementConfig };
  }

  /**
   * Generate and refine a wave plan until quality threshold is met.
   *
   * @param specContent - Specification content to plan
   * @param itemTitle - Title of the horizon item
   * @param itemId - ID of the horizon item
   * @param repo - Repository identifier
   * @param constructorConfig - Prompt constructor configuration
   * @returns Refinement result with final plan and metrics
   */
  async generateAndRefine(
    specContent: string,
    itemTitle: string,
    itemId: string,
    repo: string,
    constructorConfig: PromptConstructorConfig
  ): Promise<RefinementResult> {
    let currentPlan: ParsedWavePlan | null = null;
    let currentScore: PlanScore | null = null;
    let iterationsPerformed = 0;
    let totalTokensUsed = 0;

    try {
      // Step 1: Generate initial plan
      const initialResult = await this.generateInitialPlan(
        specContent,
        itemTitle,
        itemId,
        repo,
        constructorConfig
      );

      currentPlan = initialResult.plan;
      currentScore = initialResult.score;
      totalTokensUsed += initialResult.tokensUsed;
      iterationsPerformed = 1;

      // Check if initial plan meets threshold — or is too small for the
      // threshold to mean anything.
      const taskCount = currentPlan.waves.reduce((n, w) => n + w.tasks.length, 0);
      if (
        !parallelizationGateApplies(taskCount) ||
        currentScore.parallelizationScore >= this.config.minParallelizationScore
      ) {
        return {
          plan: currentPlan,
          score: currentScore,
          iterationsPerformed,
          totalTokensUsed,
          success: true,
        };
      }

      // Step 2: Iterative refinement
      for (let i = 0; i < this.config.maxRefinementIterations; i++) {
        const refinementResult = await this.refineplan(
          specContent,
          itemTitle,
          itemId,
          repo,
          constructorConfig,
          currentPlan,
          currentScore.parallelizationScore
        );

        totalTokensUsed += refinementResult.tokensUsed;
        iterationsPerformed++;

        // Check if refinement improved the plan
        if (
          refinementResult.score.parallelizationScore > currentScore.parallelizationScore
        ) {
          currentPlan = refinementResult.plan;
          currentScore = refinementResult.score;
        }

        // Check if we've reached the threshold
        if (currentScore.parallelizationScore >= this.config.minParallelizationScore) {
          return {
            plan: currentPlan,
            score: currentScore,
            iterationsPerformed,
            totalTokensUsed,
            success: true,
          };
        }
      }

      // Return best plan even if below threshold
      return {
        plan: currentPlan,
        score: currentScore,
        iterationsPerformed,
        totalTokensUsed,
        success: currentScore.parallelizationScore >= this.config.minParallelizationScore,
        error: currentScore.parallelizationScore < this.config.minParallelizationScore
          ? `Parallelization score ${(currentScore.parallelizationScore * 100).toFixed(1)}% is below threshold ${(this.config.minParallelizationScore * 100).toFixed(1)}%`
          : undefined,
      };
    } catch (error) {
      // Fall back to flat plan on complete failure
      const fallbackPlan = this.createFallbackPlan(specContent);

      if (fallbackPlan) {
        const fallbackScore = this.scorePlan(fallbackPlan);
        return {
          plan: fallbackPlan,
          score: fallbackScore,
          iterationsPerformed,
          totalTokensUsed,
          success: false,
          error: `AI generation failed, using fallback plan: ${error instanceof Error ? error.message : String(error)}`,
        };
      }

      throw error;
    }
  }

  /**
   * Generate initial plan without refinement.
   */
  /**
   * Public because the conductor graph (`@devpilot.sh/conductor-agent`) drives
   * generation and refinement as separate nodes with its own scoring gate
   * between them. `generateAndRefine` remains the batteries-included entry point
   * for callers that just want a plan.
   */
  async generateInitialPlan(
    specContent: string,
    itemTitle: string,
    itemId: string,
    repo: string,
    constructorConfig: PromptConstructorConfig
  ): Promise<{ plan: ParsedWavePlan; score: PlanScore; tokensUsed: number }> {
    // Construct prompt
    const prompt = await this.promptConstructor.constructPrompt(
      specContent,
      itemTitle,
      itemId,
      repo,
      constructorConfig
    );

    // A new planning run. Everything below is recorded against it, whichever
    // way it ends.
    this.runId = newPlannerRunId();
    this.step = 0;
    const trace = this.traceBase(
      constructorConfig.completedWork || constructorConfig.remainingWork ? 'reoptimize' : 'initial',
      constructorConfig.template || 'default',
      itemId,
      repo,
      prompt,
      constructorConfig
    );

    // Generate plan via AI
    let response: GenerationResult;
    try {
      response = await this.aiClient.generateWithRetry(prompt);
    } catch (error) {
      await recordPlannerTrace({ ...trace, ...answeredBeforeFailing(error), outcome: 'error', errors: [messageOf(error)] });
      throw error;
    }
    const tokensUsed = response.tokensInput + response.tokensOutput;

    // Parse response
    const plan = parseWavePlanResponse(response.content);
    const tasks = plan.waves.flatMap(w => w.tasks);

    // Validate DAG
    const validation = validateDAG(tasks, plan.dependencyEdges);

    if (!validation.valid) {
      await recordPlannerTrace({
        ...trace,
        response,
        outcome: 'invalid',
        errors: validation.errors.map(e => e.message),
        warnings: validation.warnings.map(w => w.message),
        taskCount: tasks.length,
      });
      throw new Error(
        `Generated plan has validation errors: ${validation.errors.map(e => e.message).join('; ')}`
      );
    }

    // Compute score
    const score = this.scorePlan(plan);

    await recordPlannerTrace({
      ...trace,
      response,
      outcome: 'valid',
      warnings: validation.warnings.map(w => w.message),
      taskCount: tasks.length,
      score,
    });

    return { plan, score, tokensUsed };
  }

  /** What every trace of a call carries, before the call has an answer. */
  private traceBase(
    kind: PlannerTraceRecord['kind'],
    templateName: string,
    itemId: string,
    repo: string,
    prompt: string,
    constructorConfig: PromptConstructorConfig
  ): Omit<PlannerTraceRecord, 'outcome'> {
    const template = this.promptConstructor.templateInfo(templateName);
    return {
      runId: this.runId,
      step: this.step++,
      kind,
      itemId,
      repo,
      template: template.name,
      templateVersion: template.version,
      modelRequested: this.aiClient.modelRequested,
      prompt,
      constraints: constructorConfig.customConstraints,
    };
  }

  /**
   * Refine an existing plan to improve parallelization.
   */
  /** Public for the same reason as `generateInitialPlan`. */
  async refineplan(
    specContent: string,
    itemTitle: string,
    itemId: string,
    repo: string,
    constructorConfig: PromptConstructorConfig,
    currentPlan: ParsedWavePlan,
    currentScore: number
  ): Promise<{ plan: ParsedWavePlan; score: PlanScore; tokensUsed: number }> {
    // Construct refinement prompt
    const prompt = await this.promptConstructor.constructRefinementPrompt(
      specContent,
      itemTitle,
      itemId,
      repo,
      constructorConfig,
      currentPlan.rawMarkdown,
      currentScore,
      this.config.minParallelizationScore
    );

    const trace = {
      ...this.traceBase('refine', 'refinement', itemId, repo, prompt, constructorConfig),
      basedOn: { rawMarkdown: currentPlan.rawMarkdown, score: currentScore },
    };

    // Generate refined plan via AI
    let response: GenerationResult;
    try {
      response = await this.aiClient.generateWithRetry(prompt);
    } catch (error) {
      await recordPlannerTrace({ ...trace, ...answeredBeforeFailing(error), outcome: 'error', errors: [messageOf(error)] });
      throw error;
    }
    const tokensUsed = response.tokensInput + response.tokensOutput;

    // Parse response
    const plan = parseWavePlanResponse(response.content);
    const tasks = plan.waves.flatMap(w => w.tasks);

    // Validate DAG
    const validation = validateDAG(tasks, plan.dependencyEdges);

    if (!validation.valid) {
      await recordPlannerTrace({
        ...trace,
        response,
        outcome: 'invalid',
        errors: validation.errors.map(e => e.message),
        warnings: validation.warnings.map(w => w.message),
        taskCount: tasks.length,
      });
      // Refinement is an *optimisation pass*, not a correctness gate: we already
      // hold a validated plan. Throwing here discarded that good plan and failed
      // the entire conductor run — the caller never got the chance to keep what
      // it already had. (The comment on this branch has always said "return
      // original"; the code threw instead.)
      //
      // Returning the original is safe by construction: every caller adopts a
      // refinement only when its score strictly improves, and an unchanged plan
      // scores identically, so it is declined and the loop moves on.
      this.lastRefinementError = `Refinement discarded — ${validation.errors
        .map(e => e.message)
        .join('; ')}`;
      return {
        plan: currentPlan,
        score: this.scorePlan(currentPlan),
        tokensUsed,
      };
    }

    // Compute score
    const score = this.scorePlan(plan);

    await recordPlannerTrace({
      ...trace,
      response,
      outcome: 'valid',
      warnings: validation.warnings.map(w => w.message),
      taskCount: tasks.length,
      score,
    });

    return { plan, score, tokensUsed };
  }

  /**
   * Score a parsed wave plan.
   *
   * Public alongside `generateInitialPlan` / `refineplan`: the conductor graph
   * branches on this score between its generate and refine nodes, and the
   * standalone `scorePlan()` export needs the wave assignment and critical path
   * computed first — which is exactly what this composes.
   */
  scorePlan(plan: ParsedWavePlan): PlanScore {
    const allTasks = plan.waves.flatMap(w => w.tasks);

    // Compute critical path
    const criticalPathResult = computeCriticalPath(allTasks, plan.dependencyEdges);

    // Assign waves (to get proper wave assignment with adjustments)
    const waveAssignment = assignWaves(
      allTasks,
      plan.dependencyEdges,
      { maxTasksPerWave: this.config.maxTasksPerWave }
    );

    // Compute score
    return scorePlan(
      waveAssignment,
      criticalPathResult.length,
      plan.dependencyEdges,
      allTasks
    );
  }

  /**
   * Create a fallback flat plan from specification.
   * This is a last resort when AI generation completely fails.
   */
  private createFallbackPlan(specContent: string): ParsedWavePlan | null {
    try {
      // Extract basic task descriptions from spec
      // This is a simple heuristic - look for numbered items or bullet points
      const taskDescriptions = this.extractTasksFromSpec(specContent);

      if (taskDescriptions.length === 0) {
        return null;
      }

      // Create flat plan from descriptions
      const tasks = taskDescriptions.map((description, index) => ({
        taskCode: `1.${index + 1}`,
        description,
        filePaths: [],
        dependencies: [],
        canRunInParallel: true,
        recommendedModel: 'sonnet' as const,
        complexity: 'M' as const,
      }));

      return createFlatPlan(tasks);
    } catch {
      return null;
    }
  }

  /**
   * Extract task descriptions from specification text.
   * Simple heuristic parser for numbered/bulleted lists.
   */
  private extractTasksFromSpec(specContent: string): string[] {
    const tasks: string[] = [];
    const lines = specContent.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();

      // Match numbered items like "1. Task description" or "1) Task description"
      const numberedMatch = trimmed.match(/^\d+[.)]\s+(.+)$/);
      if (numberedMatch) {
        tasks.push(numberedMatch[1]);
        continue;
      }

      // Match bullet points like "- Task description" or "* Task description"
      const bulletMatch = trimmed.match(/^[-*•]\s+(.+)$/);
      if (bulletMatch) {
        tasks.push(bulletMatch[1]);
        continue;
      }
    }

    return tasks;
  }
}

/**
 * Create a plan refinement service instance.
 */
export function createPlanRefinementService(
  aiClientConfig: AIClientConfig,
  refinementConfig?: Partial<PlanRefinementConfig>
): PlanRefinementService {
  return new PlanRefinementService(aiClientConfig, refinementConfig);
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * What the model sent before the call was counted as failed — a response cut
 * off at the token ceiling. Recorded with the failure, so the record says what
 * the attempt cost and why it ended.
 */
function answeredBeforeFailing(error: unknown): { response?: GenerationResult } {
  return error instanceof PlannerTruncatedError ? { response: error.generation } : {};
}
