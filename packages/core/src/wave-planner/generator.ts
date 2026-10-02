import { getDatabase } from '../db/client';
import {
  wavePlans,
  waves,
  waveTasks,
  dependencyEdges as dependencyEdgesTable,
  wavePlanMetrics,
} from '../db/schema';
import type {
  ParsedWavePlan,
  PlanScore,
  CriticalPathResult,
  WaveAssignmentResult,
  OptimizationResult,
  ParsedTask,
} from './types';
import {
  PlanRefinementService,
  PlanRefinementConfig,
  resolveMinParallelizationScore,
} from './plan-refinement-service';
import { linkTracesToPlan } from './trace';
import { PromptConstructorConfig } from './prompt-constructor';
import { AIClientConfig } from './ai-client';
import { resolvePlannerMaxTokens, resolvePlannerModel } from './models';
import { computeCriticalPath } from './critical-path';
import { assignWaves, WaveAssignerConfig } from './wave-assigner';
import { scorePlan } from './plan-scorer';
import { validateDAG } from './dag-validator';
import { createFlatPlan, createFlatPlanFromDescriptions } from './fallback';
import { dependentClaimsOf, readPlanCodeGraph, type PlanCodeGraph } from './plan-code-graph';
import { eq } from 'drizzle-orm';

// ============================================================================
// Wave Plan Generator Configuration
// ============================================================================

export interface WavePlanGeneratorConfig {
  /** AI client configuration */
  aiClient: AIClientConfig;
  /** Plan refinement configuration */
  refinement?: Partial<PlanRefinementConfig>;
  /** Wave assigner configuration */
  waveAssigner?: WaveAssignerConfig;
  /** Whether to auto-persist plans to database */
  autoPersist?: boolean;
}

// ============================================================================
// Wave Plan Generation Result
// ============================================================================

export interface WavePlanGenerationResult {
  /** Generated wave plan ID (if persisted) */
  wavePlanId?: string;
  /** Parsed wave plan */
  wavePlan: ParsedWavePlan;
  /** Critical path analysis */
  criticalPath: CriticalPathResult;
  /** Wave assignment with adjustments */
  waveAssignment: WaveAssignmentResult;
  /** Plan quality score */
  score: PlanScore;
  /**
   * Whether the waves were assigned with a code graph — and when they were
   * not, why not. Always present: a plan made without the graph says so.
   */
  codeGraph: PlanCodeGraph;
  /** Generation metrics */
  metrics: {
    totalTokensUsed: number;
    refinementIterations: number;
    generationDurationMs: number;
  };
  /** Whether generation was successful */
  success: boolean;
  /** Error or warning message */
  message?: string;
}

// ============================================================================
// Wave Plan Generator
// ============================================================================

/**
 * WavePlanGenerator orchestrates the full wave plan generation pipeline:
 * 1. Construct prompt from context
 * 2. Generate plan via AI
 * 3. Parse and validate response
 * 4. Compute critical path
 * 5. Assign waves with conflict resolution
 * 6. Score the plan
 * 7. Refine if needed
 * 8. Persist to database
 */
export class WavePlanGenerator {
  private refinementService: PlanRefinementService;
  private config: WavePlanGeneratorConfig;

  constructor(config: WavePlanGeneratorConfig) {
    this.config = config;
    this.refinementService = new PlanRefinementService(
      config.aiClient,
      config.refinement
    );
  }

  /**
   * Generate a complete wave plan for a horizon item.
   *
   * @param horizonItemId - ID of the horizon item
   * @param planId - ID of the associated plan
   * @param specContent - Specification content to plan
   * @param itemTitle - Title of the horizon item
   * @param repo - Repository identifier
   * @param constructorConfig - Prompt constructor configuration
   * @returns Complete generation result with persisted plan
   */
  async generate(
    horizonItemId: string,
    planId: string,
    specContent: string,
    itemTitle: string,
    repo: string,
    constructorConfig: PromptConstructorConfig
  ): Promise<WavePlanGenerationResult> {
    const startTime = Date.now();

    try {
      // Step 1: Generate and refine plan
      const refinementResult = await this.refinementService.generateAndRefine(
        specContent,
        itemTitle,
        horizonItemId,
        repo,
        constructorConfig
      );

      // Step 2: Extract all tasks and edges
      const allTasks = refinementResult.plan.waves.flatMap(w => w.tasks);
      const edges = refinementResult.plan.dependencyEdges;

      // Step 3: Compute critical path
      const criticalPath = computeCriticalPath(allTasks, edges);

      // Step 4: Assign waves with configuration.
      //
      // Asked once, for the whole plan, of whatever runs the sessions: which
      // files depend on the files these tasks change. When there is an answer
      // the assigner also keeps apart two tasks where one changes a file the
      // other's file uses. When there is not — no runner, no index, no reply
      // in time — `dependentClaims` is left off and this is the assignment it
      // always was; `codeGraph.reason` then says which of those it was.
      //
      // `refinementResult.score` is NOT recomputed from this assignment. The
      // score the refinement loop gated on is the critical path over the task
      // count, which a bump does not change, and it is deliberately computed
      // without anything that needs a network.
      const codeGraph = await readPlanCodeGraph(repo, allTasks);
      const dependentClaims = dependentClaimsOf(codeGraph);
      const waveAssignment = assignWaves(allTasks, edges, {
        ...this.config.waveAssigner,
        ...(dependentClaims ? { dependentClaims } : {}),
      });

      // Step 5: Persist to database if enabled
      let wavePlanId: string | undefined;
      if (this.config.autoPersist !== false) {
        wavePlanId = await this.persistWavePlan(
          horizonItemId,
          planId,
          refinementResult.plan,
          criticalPath,
          waveAssignment,
          refinementResult.score,
          codeGraph
        );
      }

      const generationDurationMs = Date.now() - startTime;

      return {
        wavePlanId,
        wavePlan: refinementResult.plan,
        criticalPath,
        waveAssignment,
        score: refinementResult.score,
        codeGraph,
        metrics: {
          totalTokensUsed: refinementResult.totalTokensUsed,
          refinementIterations: refinementResult.iterationsPerformed,
          generationDurationMs,
        },
        success: refinementResult.success,
        message: refinementResult.error,
      };
    } catch (error) {
      const generationDurationMs = Date.now() - startTime;

      // Try fallback plan
      const fallbackResult = await this.generateFallbackPlan(
        horizonItemId,
        planId,
        specContent
      );

      if (fallbackResult) {
        return {
          ...fallbackResult,
          metrics: {
            totalTokensUsed: 0,
            refinementIterations: 0,
            generationDurationMs,
          },
          success: false,
          message: `AI generation failed, using fallback: ${error instanceof Error ? error.message : String(error)}`,
        };
      }

      throw error;
    }
  }

  /**
   * Generate a fallback flat plan when AI generation fails.
   */
  private async generateFallbackPlan(
    horizonItemId: string,
    planId: string,
    specContent: string
  ): Promise<Omit<WavePlanGenerationResult, 'metrics'> | null> {
    try {
      // Extract task descriptions from spec
      const descriptions = this.extractTaskDescriptions(specContent);

      if (descriptions.length === 0) {
        return null;
      }

      // Create flat plan
      const wavePlan = createFlatPlanFromDescriptions(descriptions);
      const allTasks = wavePlan.waves.flatMap(w => w.tasks);

      // Compute critical path (trivial for flat plan)
      const criticalPath = computeCriticalPath(allTasks, wavePlan.dependencyEdges);

      // Create wave assignment (single wave)
      const waveAssignment: WaveAssignmentResult = {
        waves: wavePlan.waves.map((w, i) => ({
          waveIndex: i,
          label: w.label,
          tasks: w.tasks,
        })),
        totalWaves: wavePlan.waves.length,
        maxParallelism: allTasks.length,
        adjustments: [],
      };

      // Score the plan
      const score = scorePlan(
        waveAssignment,
        criticalPath.length,
        wavePlan.dependencyEdges,
        allTasks
      );

      // The fallback is one wave written by hand above; it never goes through
      // the wave assigner, so there is nothing for a code graph to inform. Its
      // tasks are bare descriptions with no files to look up in any case.
      const codeGraph: PlanCodeGraph = {
        used: false,
        reason:
          'the planner failed and this is the flat fallback plan — one wave, no files named — ' +
          'which is not passed through the wave assigner',
      };

      // Persist if enabled
      let wavePlanId: string | undefined;
      if (this.config.autoPersist !== false) {
        wavePlanId = await this.persistWavePlan(
          horizonItemId,
          planId,
          wavePlan,
          criticalPath,
          waveAssignment,
          score,
          codeGraph
        );
      }

      return {
        wavePlanId,
        wavePlan,
        criticalPath,
        waveAssignment,
        score,
        codeGraph,
        success: false,
      };
    } catch {
      return null;
    }
  }

  /**
   * Persist a wave plan to the database.
   */
  /**
   * Public so the conductor graph can persist an approved plan as its own node.
   * The graph decides *when* a plan is approved (after a human interrupt); the
   * write itself is unchanged and still versions against prior plans.
   *
   * `codeGraph` is what a code graph said when `waveAssignment` was made — or
   * that it was not used, and why. Optional for the callers that predate it;
   * left out, the plan row records that nobody asked (NULL), which is the
   * truth. The assignment's adjustments are recorded either way.
   */
  async persistWavePlan(
    horizonItemId: string,
    planId: string,
    wavePlan: ParsedWavePlan,
    criticalPath: CriticalPathResult,
    waveAssignment: WaveAssignmentResult,
    score: PlanScore,
    codeGraph?: PlanCodeGraph
  ): Promise<string> {
    const db = getDatabase();

    // Check for existing wave plan to get version
    const existingPlans = await db
      .select()
      .from(wavePlans)
      .where(eq(wavePlans.horizonItemId, horizonItemId))
      .orderBy(wavePlans.version);

    const version = existingPlans.length > 0
      ? existingPlans[existingPlans.length - 1].version + 1
      : 1;

    const previousWavePlanId = existingPlans.length > 0
      ? existingPlans[existingPlans.length - 1].id
      : null;

    // Insert wave plan
    const [insertedWavePlan] = await db
      .insert(wavePlans)
      .values({
        planId,
        horizonItemId,
        totalWaves: waveAssignment.totalWaves,
        totalTasks: wavePlan.statistics.totalTasks,
        maxParallelism: waveAssignment.maxParallelism,
        criticalPath: criticalPath.path,
        criticalPathLength: criticalPath.length,
        parallelizationScore: score.parallelizationScore,
        status: 'draft',
        currentWaveIndex: 0,
        version,
        previousWavePlanId,
        rawMarkdown: wavePlan.rawMarkdown,
        adjustments: waveAssignment.adjustments,
        codeGraph: codeGraph ?? null,
      })
      .returning();

    const wavePlanId = insertedWavePlan.id;

    // Insert waves
    for (const wave of waveAssignment.waves) {
      const [insertedWave] = await db
        .insert(waves)
        .values({
          wavePlanId,
          waveIndex: wave.waveIndex,
          label: wave.label,
          maxParallelTasks: wave.tasks.length,
          status: 'pending',
        })
        .returning();

      // Insert wave tasks
      for (const task of wave.tasks) {
        const isOnCriticalPath = criticalPath.path.includes(task.taskCode);

        await db.insert(waveTasks).values({
          waveId: insertedWave.id,
          wavePlanId,
          waveIndex: wave.waveIndex,
          taskCode: task.taskCode,
          label: task.description.slice(0, 100), // Truncate for label
          description: task.description,
          filePaths: task.filePaths,
          dependencies: task.dependencies,
          recommendedModel: task.recommendedModel.toUpperCase() as 'HAIKU' | 'SONNET' | 'OPUS',
          complexity: task.complexity,
          isOnCriticalPath,
          canRunInParallel: task.canRunInParallel,
          status: 'pending',
        });
      }
    }

    // Insert dependency edges
    for (const edge of wavePlan.dependencyEdges) {
      await db.insert(dependencyEdgesTable).values({
        wavePlanId,
        fromTaskCode: edge.from,
        toTaskCode: edge.to,
        edgeType: edge.type,
      });
    }

    // Insert initial metrics
    await db.insert(wavePlanMetrics).values({
      wavePlanId,
      wavesExecuted: 0,
      tasksCompleted: 0,
      tasksFailed: 0,
      tasksRetried: 0,
      // Shared-file bumps only, as the column's name says. A
      // DEPENDENCY_CONFLICT_BUMP is a predicted conflict, from an index that
      // can be wrong; counting it here would report a prediction as a conflict
      // avoided. Those rows are kept, with their reasons, in
      // `wave_plans.adjustments`.
      fileConflictsAvoided: waveAssignment.adjustments.filter(
        a => a.type === 'FILE_CONFLICT_BUMP'
      ).length,
      reOptimizationCount: 0,
    });

    // Every planner call and review that led to this plan now knows which
    // plan that was — which is what joins what the planner was told to how
    // the plan turned out. Never fails a persist.
    await linkTracesToPlan(horizonItemId, wavePlan.rawMarkdown, wavePlanId);

    return wavePlanId;
  }

  /**
   * Extract task descriptions from specification text.
   */
  private extractTaskDescriptions(specContent: string): string[] {
    const tasks: string[] = [];
    const lines = specContent.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();

      // Match numbered items
      const numberedMatch = trimmed.match(/^\d+[.)]\s+(.+)$/);
      if (numberedMatch) {
        tasks.push(numberedMatch[1]);
        continue;
      }

      // Match bullet points
      const bulletMatch = trimmed.match(/^[-*•]\s+(.+)$/);
      if (bulletMatch) {
        tasks.push(bulletMatch[1]);
        continue;
      }
    }

    return tasks;
  }

  /**
   * Reoptimize an existing wave plan mid-execution.
   *
   * @param wavePlanId - ID of the wave plan to reoptimize
   * @param specContent - Original specification content
   * @param itemTitle - Title of the horizon item
   * @param repo - Repository identifier
   * @param constructorConfig - Prompt constructor configuration
   * @returns New wave plan generation result
   */
  async reoptimize(
    wavePlanId: string,
    specContent: string,
    itemTitle: string,
    repo: string,
    constructorConfig: PromptConstructorConfig
  ): Promise<WavePlanGenerationResult> {
    const db = getDatabase();

    // Fetch existing wave plan with tasks
    const existingPlan = await db
      .select()
      .from(wavePlans)
      .where(eq(wavePlans.id, wavePlanId))
      .limit(1);

    if (existingPlan.length === 0) {
      throw new Error(`Wave plan not found: ${wavePlanId}`);
    }

    const wavePlan = existingPlan[0];

    // Fetch all tasks
    const existingTasks = await db
      .select()
      .from(waveTasks)
      .where(eq(waveTasks.wavePlanId, wavePlanId));

    // Separate completed and remaining tasks — with what actually happened.
    //
    // The files a completed task CHANGED, when its report said (`filesChanged`),
    // rather than the files the plan had guessed it would; and the agent's own
    // account of what it did, rather than a sentence made from the task's label.
    // Both were already recorded on the row and neither was read.
    const completedTasks = existingTasks
      .filter(t => t.status === 'completed')
      .map(t => ({
        taskCode: t.taskCode,
        description: t.description,
        filesModified: t.filesChanged ?? t.filePaths ?? [],
        completionSummary:
          t.completionSummary?.trim().slice(0, COMPLETION_SUMMARY_MAX) || `Completed task: ${t.label}`,
      }));

    const remainingTasks = existingTasks
      .filter(t => t.status !== 'completed' && t.status !== 'skipped')
      .map(t => ({
        taskCode: t.taskCode,
        description: t.description,
        originalDependencies: t.dependencies || [],
        originalFiles: t.filePaths || [],
        ...(t.errorMessage?.trim() ? { lastError: t.errorMessage.trim() } : {}),
      }));

    // Generate new plan for remaining work.
    //
    // The two lists go to the prompt as lists. They used to be built here and
    // dropped: the prompt was given the two counts, as sentences, and the model
    // re-planned the whole specification with no idea which half was done.
    return this.generate(
      wavePlan.horizonItemId,
      wavePlan.planId,
      specContent,
      itemTitle,
      repo,
      {
        ...constructorConfig,
        completedWork: { tasks: completedTasks },
        remainingWork: { tasks: remainingTasks },
        customConstraints: [
          ...(constructorConfig.customConstraints || []),
          `This is a reoptimization. ${completedTasks.length} tasks are already complete.`,
          `Focus only on the ${remainingTasks.length} remaining tasks.`,
        ],
      }
    );
  }
}

/** How much of an agent's completion summary a re-plan is shown, per task. */
const COMPLETION_SUMMARY_MAX = 400;

/**
 * Create a wave plan generator instance.
 */
export function createWavePlanGenerator(
  config: WavePlanGeneratorConfig
): WavePlanGenerator {
  return new WavePlanGenerator(config);
}

/**
 * Generate a wave plan with default configuration.
 * Convenience function for simple use cases.
 */
export async function generateWavePlan(
  horizonItemId: string,
  planId: string,
  specContent: string,
  itemTitle: string,
  repo: string,
  workingDir: string,
  apiKey: string
): Promise<WavePlanGenerationResult> {
  const generator = createWavePlanGenerator({
    aiClient: {
      apiKey,
      model: resolvePlannerModel(),
      maxTokens: resolvePlannerMaxTokens(),
    },
    refinement: {
      minParallelizationScore: resolveMinParallelizationScore(),
      maxRefinementIterations: 2,
    },
    autoPersist: true,
  });

  return generator.generate(
    horizonItemId,
    planId,
    specContent,
    itemTitle,
    repo,
    { workingDir }
  );
}
