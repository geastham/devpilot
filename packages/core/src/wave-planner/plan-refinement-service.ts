import type { ParsedWavePlan, PlanScore, OptimizationResult } from './types';
import { PromptConstructor, PromptConstructorConfig } from './prompt-constructor';
import { WavePlannerAIClient, AIClientConfig } from './ai-client';
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
}

const DEFAULT_REFINEMENT_CONFIG: PlanRefinementConfig = {
  minParallelizationScore: 0.3,
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
  private promptConstructor: PromptConstructor;
  private aiClient: WavePlannerAIClient;
  private config: PlanRefinementConfig;

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

      // Check if initial plan meets threshold
      if (currentScore.parallelizationScore >= this.config.minParallelizationScore) {
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
  private async generateInitialPlan(
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

    // Generate plan via AI
    const response = await this.aiClient.generateWithRetry(prompt);
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

    return { plan, score, tokensUsed };
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
      currentScore
    );

    // Generate refined plan via AI
    const response = await this.aiClient.generateWithRetry(prompt);
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

    return { plan, score, tokensUsed };
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
