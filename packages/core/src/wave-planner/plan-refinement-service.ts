import type { ParsedWavePlan, PlanScore, OptimizationResult } from './types';
import { PromptConstructor, PromptConstructorConfig } from './prompt-constructor';
import {
  WavePlannerAIClient,
  AIClientConfig,
  GenerateOptions,
  GenerationProgressCallback,
} from './ai-client';
import { parseWavePlanResponse } from './parser';
import { validateDAG } from './dag-validator';
import { computeCriticalPath } from './critical-path';
import { assignWaves } from './wave-assigner';
import { scorePlan } from './plan-scorer';
import { createFlatPlan } from './fallback';

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
  /**
   * If set, the refinement service will escalate to the `ultra` tier (Opus +
   * extended thinking) after the standard tier has exhausted its refinement
   * iterations without clearing `minParallelizationScore`. The ultra tier is
   * configured out-of-band via `ultraAiClient`.
   */
  escalateOnFailure?: boolean;
  /**
   * Force the ultra tier from the start, skipping the standard tier entirely.
   * Useful when the caller already knows the item is high-complexity.
   */
  forceUltra?: boolean;
  /** AI client config for the ultra tier. Required if escalation is enabled. */
  ultraAiClient?: AIClientConfig;
}

const DEFAULT_REFINEMENT_CONFIG: PlanRefinementConfig = {
  minParallelizationScore: 0.3,
  maxRefinementIterations: 2,
  useSimplifiedOnRetry: true,
  maxTasksPerWave: undefined,
  escalateOnFailure: false,
  forceUltra: false,
  ultraAiClient: undefined,
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
  /** Extended-thinking tokens (ultra tier only, 0 otherwise) */
  thinkingTokensUsed: number;
  /** Which tier produced the winning plan */
  modelTierUsed: 'standard' | 'ultra';
  /** Model id of the last call (e.g. claude-opus-4-6) */
  modelUsed: string;
  /** Whether the standard tier was escalated to ultra mid-run */
  escalated: boolean;
  /** Reason for escalation, if any (for metrics/UI) */
  escalationReason?: string;
  /** Whether refinement was successful */
  success: boolean;
  /** Error message if refinement failed */
  error?: string;
}

/**
 * Runtime options for a single `generateAndRefine` call. Separate from the
 * static PlanRefinementConfig so per-request concerns (progress callback,
 * cancellation) don't live on the constructor.
 */
export interface RefinementRuntimeOptions {
  onProgress?: GenerationProgressCallback;
  signal?: AbortSignal;
  /**
   * Emitted when the service transitions between planner phases. Used by the
   * async job runner to update the job's `currentStep` / `status` columns.
   */
  onPhase?: (phase: RefinementPhase) => void;
}

export type RefinementPhase =
  | { type: 'generating'; tier: 'standard' | 'ultra'; iteration: number }
  | { type: 'validating'; tier: 'standard' | 'ultra' }
  | { type: 'refining'; tier: 'standard' | 'ultra'; iteration: number; currentScore: number }
  | { type: 'escalating'; reason: string }
  | { type: 'done'; tier: 'standard' | 'ultra'; score: number };

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
  private promptConstructor: PromptConstructor;
  private standardClient: WavePlannerAIClient;
  private ultraClient: WavePlannerAIClient | null;
  private config: PlanRefinementConfig;

  constructor(
    aiClientConfig: AIClientConfig,
    refinementConfig?: Partial<PlanRefinementConfig>
  ) {
    this.promptConstructor = new PromptConstructor();
    this.standardClient = new WavePlannerAIClient(aiClientConfig);
    this.config = { ...DEFAULT_REFINEMENT_CONFIG, ...refinementConfig };
    this.ultraClient = this.config.ultraAiClient
      ? new WavePlannerAIClient(this.config.ultraAiClient)
      : null;
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
    constructorConfig: PromptConstructorConfig,
    runtime?: RefinementRuntimeOptions
  ): Promise<RefinementResult> {
    let currentPlan: ParsedWavePlan | null = null;
    let currentScore: PlanScore | null = null;
    let iterationsPerformed = 0;
    let totalTokensUsed = 0;
    let thinkingTokensUsed = 0;
    let modelUsed = this.standardClient.getModel();
    let escalated = false;
    let escalationReason: string | undefined;
    let tier: 'standard' | 'ultra' = this.config.forceUltra && this.ultraClient
      ? 'ultra'
      : 'standard';

    const threshold = this.config.minParallelizationScore;
    const thresholdPct = (threshold * 100).toFixed(1);

    try {
      // ---------------------------------------------------------------------
      // Phase 1: initial generation (on whichever tier we start with)
      // ---------------------------------------------------------------------
      runtime?.onPhase?.({ type: 'generating', tier, iteration: 1 });

      const initialResult = await this.generateInitialPlan(
        specContent,
        itemTitle,
        itemId,
        repo,
        // When starting on the ultra tier, swap the template accordingly.
        tier === 'ultra' ? { ...constructorConfig, template: 'ultra' } : constructorConfig,
        tier,
        runtime
      );

      currentPlan = initialResult.plan;
      currentScore = initialResult.score;
      totalTokensUsed += initialResult.tokensUsed;
      thinkingTokensUsed += initialResult.thinkingTokens;
      modelUsed = initialResult.model;
      iterationsPerformed = 1;

      runtime?.onPhase?.({ type: 'validating', tier });

      if (currentScore.parallelizationScore >= threshold) {
        runtime?.onPhase?.({ type: 'done', tier, score: currentScore.parallelizationScore });
        return this.buildResult({
          plan: currentPlan,
          score: currentScore,
          iterationsPerformed,
          totalTokensUsed,
          thinkingTokensUsed,
          tier,
          modelUsed,
          escalated,
          escalationReason,
          success: true,
        });
      }

      // ---------------------------------------------------------------------
      // Phase 2: iterative refinement on the current tier
      // ---------------------------------------------------------------------
      for (let i = 0; i < this.config.maxRefinementIterations; i++) {
        this.throwIfAborted(runtime?.signal);
        runtime?.onPhase?.({
          type: 'refining',
          tier,
          iteration: i + 2,
          currentScore: currentScore.parallelizationScore,
        });

        const refinementResult = await this.refineplan(
          specContent,
          itemTitle,
          itemId,
          repo,
          constructorConfig,
          currentPlan,
          currentScore.parallelizationScore,
          tier,
          runtime
        );

        totalTokensUsed += refinementResult.tokensUsed;
        thinkingTokensUsed += refinementResult.thinkingTokens;
        iterationsPerformed++;

        if (
          refinementResult.score.parallelizationScore > currentScore.parallelizationScore
        ) {
          currentPlan = refinementResult.plan;
          currentScore = refinementResult.score;
          modelUsed = refinementResult.model;
        }

        if (currentScore.parallelizationScore >= threshold) {
          runtime?.onPhase?.({ type: 'done', tier, score: currentScore.parallelizationScore });
          return this.buildResult({
            plan: currentPlan,
            score: currentScore,
            iterationsPerformed,
            totalTokensUsed,
            thinkingTokensUsed,
            tier,
            modelUsed,
            escalated,
            escalationReason,
            success: true,
          });
        }
      }

      // ---------------------------------------------------------------------
      // Phase 3: escalation to ultra tier (if enabled and not already on it)
      // ---------------------------------------------------------------------
      if (
        tier === 'standard' &&
        this.config.escalateOnFailure &&
        this.ultraClient
      ) {
        escalated = true;
        escalationReason =
          `Standard tier (${modelUsed}) stalled at ${(currentScore.parallelizationScore * 100).toFixed(1)}% ` +
          `after ${iterationsPerformed} attempt(s); below ${thresholdPct}% threshold.`;
        tier = 'ultra';
        runtime?.onPhase?.({ type: 'escalating', reason: escalationReason });

        // Feed the standard tier's best attempt into the ultra prompt as a
        // "prior attempt" constraint so the Opus pass can diagnose and
        // improve rather than start from scratch.
        const priorPlanConstraint = `PRIOR_PLAN_MARKDOWN:${currentPlan.rawMarkdown}`;
        const ultraConstructorConfig: PromptConstructorConfig = {
          ...constructorConfig,
          template: 'ultra',
          customConstraints: [
            ...(constructorConfig.customConstraints || []),
            priorPlanConstraint,
            `The prior attempt scored ${(currentScore.parallelizationScore * 100).toFixed(1)}%. ` +
              `Target is at least ${thresholdPct}%.`,
          ],
        };

        runtime?.onPhase?.({ type: 'generating', tier: 'ultra', iteration: iterationsPerformed + 1 });
        const ultraInitial = await this.generateInitialPlan(
          specContent,
          itemTitle,
          itemId,
          repo,
          ultraConstructorConfig,
          'ultra',
          runtime
        );

        totalTokensUsed += ultraInitial.tokensUsed;
        thinkingTokensUsed += ultraInitial.thinkingTokens;
        iterationsPerformed++;

        if (
          ultraInitial.score.parallelizationScore > currentScore.parallelizationScore
        ) {
          currentPlan = ultraInitial.plan;
          currentScore = ultraInitial.score;
          modelUsed = ultraInitial.model;
        }
      }

      // Return the best plan we have, even if it's still below threshold.
      runtime?.onPhase?.({ type: 'done', tier, score: currentScore.parallelizationScore });
      return this.buildResult({
        plan: currentPlan,
        score: currentScore,
        iterationsPerformed,
        totalTokensUsed,
        thinkingTokensUsed,
        tier,
        modelUsed,
        escalated,
        escalationReason,
        success: currentScore.parallelizationScore >= threshold,
        error:
          currentScore.parallelizationScore < threshold
            ? `Parallelization score ${(currentScore.parallelizationScore * 100).toFixed(1)}% is below threshold ${thresholdPct}%`
            : undefined,
      });
    } catch (error) {
      // If the caller cancelled, don't silently fall back — propagate.
      if (runtime?.signal?.aborted) {
        throw error;
      }

      // Fall back to flat plan on complete failure
      const fallbackPlan = this.createFallbackPlan(specContent);

      if (fallbackPlan) {
        const fallbackScore = this.scorePlan(fallbackPlan);
        return this.buildResult({
          plan: fallbackPlan,
          score: fallbackScore,
          iterationsPerformed,
          totalTokensUsed,
          thinkingTokensUsed,
          tier,
          modelUsed,
          escalated,
          escalationReason,
          success: false,
          error: `AI generation failed, using fallback plan: ${error instanceof Error ? error.message : String(error)}`,
        });
      }

      throw error;
    }
  }

  private buildResult(input: {
    plan: ParsedWavePlan;
    score: PlanScore;
    iterationsPerformed: number;
    totalTokensUsed: number;
    thinkingTokensUsed: number;
    tier: 'standard' | 'ultra';
    modelUsed: string;
    escalated: boolean;
    escalationReason?: string;
    success: boolean;
    error?: string;
  }): RefinementResult {
    return {
      plan: input.plan,
      score: input.score,
      iterationsPerformed: input.iterationsPerformed,
      totalTokensUsed: input.totalTokensUsed,
      thinkingTokensUsed: input.thinkingTokensUsed,
      modelTierUsed: input.tier,
      modelUsed: input.modelUsed,
      escalated: input.escalated,
      escalationReason: input.escalationReason,
      success: input.success,
      error: input.error,
    };
  }

  private throwIfAborted(signal?: AbortSignal): void {
    if (signal?.aborted) {
      throw new Error('Plan generation cancelled');
    }
  }

  private clientFor(tier: 'standard' | 'ultra'): WavePlannerAIClient {
    if (tier === 'ultra') {
      if (!this.ultraClient) {
        throw new Error(
          'Ultra tier requested but no ultraAiClient configured on PlanRefinementService'
        );
      }
      return this.ultraClient;
    }
    return this.standardClient;
  }

  /**
   * Generate initial plan without refinement.
   */
  private async generateInitialPlan(
    specContent: string,
    itemTitle: string,
    itemId: string,
    repo: string,
    constructorConfig: PromptConstructorConfig,
    tier: 'standard' | 'ultra',
    runtime?: RefinementRuntimeOptions
  ): Promise<{
    plan: ParsedWavePlan;
    score: PlanScore;
    tokensUsed: number;
    thinkingTokens: number;
    model: string;
  }> {
    this.throwIfAborted(runtime?.signal);

    // Construct prompt
    const prompt = await this.promptConstructor.constructPrompt(
      specContent,
      itemTitle,
      itemId,
      repo,
      constructorConfig
    );

    const client = this.clientFor(tier);
    const response = await client.generateWithRetry(prompt, 3, {
      onProgress: runtime?.onProgress,
      signal: runtime?.signal,
    });
    const tokensUsed = response.tokensInput + response.tokensOutput;

    // Parse response
    const plan = parseWavePlanResponse(response.content);

    // Validate DAG
    const validation = validateDAG(
      plan.waves.flatMap(w => w.tasks),
      plan.dependencyEdges
    );

    if (!validation.valid) {
      throw new Error(
        `Generated plan has validation errors: ${validation.errors.map(e => e.message).join('; ')}`
      );
    }

    // Compute score
    const score = this.scorePlan(plan);

    return {
      plan,
      score,
      tokensUsed,
      thinkingTokens: response.thinkingTokens,
      model: response.model,
    };
  }

  /**
   * Refine an existing plan to improve parallelization.
   */
  private async refineplan(
    specContent: string,
    itemTitle: string,
    itemId: string,
    repo: string,
    constructorConfig: PromptConstructorConfig,
    currentPlan: ParsedWavePlan,
    currentScore: number,
    tier: 'standard' | 'ultra',
    runtime?: RefinementRuntimeOptions
  ): Promise<{
    plan: ParsedWavePlan;
    score: PlanScore;
    tokensUsed: number;
    thinkingTokens: number;
    model: string;
  }> {
    this.throwIfAborted(runtime?.signal);

    // Construct refinement prompt
    const prompt = await this.promptConstructor.constructRefinementPrompt(
      specContent,
      itemTitle,
      itemId,
      repo,
      constructorConfig,
      currentPlan.rawMarkdown,
      currentScore
    );

    const client = this.clientFor(tier);
    const response = await client.generateWithRetry(prompt, 3, {
      onProgress: runtime?.onProgress,
      signal: runtime?.signal,
    });
    const tokensUsed = response.tokensInput + response.tokensOutput;

    // Parse response
    const plan = parseWavePlanResponse(response.content);

    // Validate DAG
    const validation = validateDAG(
      plan.waves.flatMap(w => w.tasks),
      plan.dependencyEdges
    );

    if (!validation.valid) {
      // If refinement produces invalid plan, return original
      throw new Error(
        `Refined plan has validation errors: ${validation.errors.map(e => e.message).join('; ')}`
      );
    }

    // Compute score
    const score = this.scorePlan(plan);

    return {
      plan,
      score,
      tokensUsed,
      thinkingTokens: response.thinkingTokens,
      model: response.model,
    };
  }

  /**
   * Score a parsed wave plan.
   */
  private scorePlan(plan: ParsedWavePlan): PlanScore {
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
