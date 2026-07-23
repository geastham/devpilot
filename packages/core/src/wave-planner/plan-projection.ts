// Plan Projection
// Deterministic projection of a persisted wave plan into the legacy
// plans / workstreams / tasks / touchedFiles rows (no AI). Also hosts the
// spec-content builder and the "generate a plan for an item that has none yet"
// helper. See TRD-01 §6.6.

import { eq } from 'drizzle-orm';
import {
  getDatabase,
  horizonItems,
  plans,
  workstreams,
  tasks,
  touchedFiles,
} from '../db';
import type { Model, Complexity, FileStatus } from '../db';
import { generateWavePlan } from './generator';
import type { WavePlanGenerationResult } from './generator';

export interface ProjectedPlanIds {
  planId: string;
  workstreamIds: string[];
  taskIds: string[];
}

// ============================================================================
// Static cost table (TRD-01 §6.6 projection rules)
// ============================================================================

/** Base per-task cost by model. */
const MODEL_BASE_COST_USD: Record<Model, number> = {
  HAIKU: 0.01,
  SONNET: 0.05,
  OPUS: 0.15,
};

/** Complexity multiplier: S ×1, M ×2, L ×3, XL ×4. */
const COMPLEXITY_MULTIPLIER: Record<Complexity, number> = {
  S: 1,
  M: 2,
  L: 3,
  XL: 4,
};

/** Deterministic estimated cost for a single task. */
function estimateTaskCostUsd(model: Model, complexity: Complexity): number {
  return MODEL_BASE_COST_USD[model] * COMPLEXITY_MULTIPLIER[complexity];
}

// ============================================================================
// Spec content builder
// ============================================================================

/**
 * Build spec markdown from an item + optional existing plan.
 * Ported from the Next route's buildSpecContent() (typed, no `any`).
 */
export function buildSpecContentForItem(item: {
  title: string;
  plan?: {
    acceptanceCriteria?: string[];
    workstreams?: { label: string; tasks: { label: string; filePaths?: string[] }[] }[];
  } | null;
}): string {
  const lines: string[] = [];

  lines.push(`# ${item.title}`);
  lines.push('');

  const acceptanceCriteria = item.plan?.acceptanceCriteria;
  if (acceptanceCriteria && acceptanceCriteria.length > 0) {
    lines.push('## Acceptance Criteria');
    for (const criterion of acceptanceCriteria) {
      lines.push(`- ${criterion}`);
    }
    lines.push('');
  }

  const planWorkstreams = item.plan?.workstreams;
  if (planWorkstreams && planWorkstreams.length > 0) {
    lines.push('## Implementation Plan');
    for (const workstream of planWorkstreams) {
      lines.push(`### ${workstream.label}`);
      if (workstream.tasks && workstream.tasks.length > 0) {
        for (const task of workstream.tasks) {
          lines.push(`- ${task.label}`);
          if (task.filePaths && task.filePaths.length > 0) {
            lines.push(`  Files: ${task.filePaths.join(', ')}`);
          }
        }
      }
      lines.push('');
    }
  }

  return lines.join('\n');
}

// ============================================================================
// Generate a plan for an item that has no plan yet
// ============================================================================

/**
 * Run the wave planner for a horizon item that has no plan yet: creates the
 * plans row first (the generator requires a planId), then generates + persists
 * the wave plan.
 */
export async function generatePlanForItem(params: {
  horizonItemId: string;
  title: string;
  repo: string;
  workingDir: string;
  apiKey: string;
}): Promise<{ generation: WavePlanGenerationResult; planId: string }> {
  const { horizonItemId, title, repo, workingDir, apiKey } = params;
  const db = getDatabase();

  // No plan yet → spec content is derived from the title alone.
  const specContent = buildSpecContentForItem({ title });

  // Create the plans row FIRST — the generator needs a planId to attach the
  // wave plan to. Cost / confidence fields are filled in later by
  // projectWavePlanToPlan(); seed them with neutral placeholders for now.
  const [plan] = await db
    .insert(plans)
    .values({
      horizonItemId,
      estimatedCostUsd: 0,
      baselineCostUsd: 0,
      acceptanceCriteria: [],
      confidenceSignals: {},
      fleetContextSnapshot: {},
      memorySessionsUsed: [],
    })
    .returning();

  const planId = plan.id;

  const generation = await generateWavePlan(
    horizonItemId,
    planId,
    specContent,
    title,
    repo,
    workingDir,
    apiKey
  );

  return { generation, planId };
}

// ============================================================================
// Deterministic projection (no AI)
// ============================================================================

/**
 * Project a persisted wave plan into legacy plans/workstreams/tasks/touchedFiles
 * rows. Deterministic — derives everything from the generation result and the
 * static cost table; no AI calls.
 */
export async function projectWavePlanToPlan(params: {
  planId: string;
  generation: WavePlanGenerationResult;
  inFlightPaths: string[]; // for conflictWarning computation
}): Promise<ProjectedPlanIds> {
  const { planId, generation, inFlightPaths } = params;
  const db = getDatabase();

  // Resolve the repo from the item behind this plan (projection rule: workstream
  // repo comes from the item). The params only carry a planId, so we walk
  // plan → horizonItemId → horizonItems.repo.
  const [planRow] = await db
    .select({ horizonItemId: plans.horizonItemId })
    .from(plans)
    .where(eq(plans.id, planId))
    .limit(1);

  if (!planRow) {
    throw new Error(`Plan not found: ${planId}`);
  }

  const [itemRow] = await db
    .select({ repo: horizonItems.repo })
    .from(horizonItems)
    .where(eq(horizonItems.id, planRow.horizonItemId))
    .limit(1);

  const repo = itemRow?.repo ?? '';

  const maxParallelism = generation.waveAssignment.maxParallelism;
  const projectionWaves = generation.waveAssignment.waves;

  const workstreamIds: string[] = [];
  const taskIds: string[] = [];
  let totalCostUsd = 0;
  let totalTasks = 0;

  // One workstream per wave; one task per wave task.
  for (const wave of projectionWaves) {
    const [workstream] = await db
      .insert(workstreams)
      .values({
        planId,
        label: wave.label,
        repo,
        workerCount: Math.min(wave.tasks.length, maxParallelism),
        orderIndex: wave.waveIndex,
      })
      .returning();

    workstreamIds.push(workstream.id);

    for (let taskIdx = 0; taskIdx < wave.tasks.length; taskIdx++) {
      const task = wave.tasks[taskIdx];
      const model = task.recommendedModel.toUpperCase() as Model;
      const complexity = task.complexity as Complexity;
      const estimatedCostUsd = estimateTaskCostUsd(model, complexity);

      totalCostUsd += estimatedCostUsd;
      totalTasks += 1;

      const filePaths = task.filePaths;
      const conflictWarning = inFlightPaths.some((cp) =>
        filePaths.some((fp) => fp.includes(cp) || cp.includes(fp))
      )
        ? 'File may be modified by in-flight session'
        : null;

      const [insertedTask] = await db
        .insert(tasks)
        .values({
          workstreamId: workstream.id,
          label: task.description.slice(0, 100),
          model,
          complexity,
          estimatedCostUsd,
          filePaths,
          conflictWarning,
          dependsOn: task.dependencies,
          orderIndex: taskIdx,
        })
        .returning();

      taskIds.push(insertedTask.id);
    }
  }

  // touchedFiles: one row per unique path, status/inFlightVia against inFlightPaths.
  const uniqueFilePaths = projectionWaves
    .flatMap((wave) => wave.tasks.flatMap((t) => t.filePaths))
    .filter((v, i, a) => a.indexOf(v) === i);

  for (const path of uniqueFilePaths) {
    const inFlight = inFlightPaths.includes(path);
    await db.insert(touchedFiles).values({
      planId,
      path,
      status: (inFlight ? 'IN_FLIGHT' : 'AVAILABLE') as FileStatus,
      inFlightVia: null,
    });
  }

  // Plan-level aggregates. baselineCostUsd models honest serial execution:
  // sum × (totalTasks / max(criticalPathLength, 1)), capped at ×2.
  const criticalPathLength = generation.criticalPath.length;
  const baselineMultiplier = Math.min(totalTasks / Math.max(criticalPathLength, 1), 2);

  // Spec §6.6 asks for { parallelizationScore, refinementIterations, generatedByAI }.
  // The plans.confidenceSignals JSON $type declares none of those names (all its
  // fields are optional, so weak-type detection rejects an object with zero shared
  // keys). We reconcile by also setting the declared `overallConfidence` to the
  // real parallelization score — which replaces the old hardcoded 0.85 — while
  // still carrying the spec-named fields through as structural extras.
  const confidenceSignals = {
    overallConfidence: generation.score.parallelizationScore,
    parallelizationScore: generation.score.parallelizationScore,
    refinementIterations: generation.metrics.refinementIterations,
    generatedByAI: generation.success,
  };

  await db
    .update(plans)
    .set({
      estimatedCostUsd: totalCostUsd,
      baselineCostUsd: totalCostUsd * baselineMultiplier,
      confidenceSignals,
    })
    .where(eq(plans.id, planId));

  return { planId, workstreamIds, taskIds };
}
