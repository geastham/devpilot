import type {
  ParsedTask,
  ParsedEdge,
  WaveAssignmentResult,
  AssignedWave,
  WaveAdjustment,
  DAGNode,
} from './types';
import { buildDAGGraph, topologicalSort, generateWaveLabel } from './utils';

/**
 * Configuration for wave assignment.
 */
export interface WaveAssignerConfig {
  maxTasksPerWave?: number;
}

/**
 * Assigns tasks to waves based on dependency depths, resolving file conflicts
 * and applying capacity constraints.
 *
 * Algorithm:
 * 1. Compute wave depths via topological sort
 * 2. Group tasks by depth, which fixes the order they are placed in
 * 3. Place each task in the earliest wave that is after all of its
 *    dependencies and has no file conflict — so a conflict delays the task and,
 *    through it, everything that depends on it
 * 4. Apply fleet capacity constraints
 *
 * Every input task appears in exactly one output wave. That is checked before
 * returning, and a mismatch throws rather than returning a shorter plan.
 *
 * @param tasks - Array of parsed tasks
 * @param edges - Array of dependency edges
 * @param config - Optional configuration
 * @returns WaveAssignmentResult with assigned waves and adjustments
 */
export function assignWaves(
  tasks: ParsedTask[],
  edges: ParsedEdge[],
  config?: WaveAssignerConfig
): WaveAssignmentResult {
  // Handle edge cases
  if (tasks.length === 0) {
    return {
      waves: [],
      totalWaves: 0,
      maxParallelism: 0,
      adjustments: [],
    };
  }

  // Build DAG and compute topological order
  const graph = buildDAGGraph(tasks, edges);
  const sortResult = topologicalSort(graph);

  if (!sortResult.valid) {
    throw new Error(
      `Cannot assign waves: cycle detected in dependency graph involving tasks: ${sortResult.cycleParticipants?.join(', ')}`
    );
  }

  // Step 1: Compute wave depths
  const depths = computeWaveDepths(graph, sortResult.order);

  // Step 2: Group tasks by depth into initial waves
  const tasksByDepth = groupTasksByDepth(tasks, depths);

  // Step 3: Place tasks, resolving file conflicts within waves
  const { wavesAfterConflicts, conflictAdjustments } = resolveFileConflicts(
    tasksByDepth,
    graph
  );

  // Step 4: Apply capacity constraints
  const { finalWaves, capacityAdjustments } = applyCapacityConstraints(
    wavesAfterConflicts,
    config?.maxTasksPerWave
  );

  // Whatever the steps above did, the plan handed back must contain the work
  // that was handed in.
  assertEveryTaskAssigned(tasks, finalWaves);

  // Compute final metrics
  const totalWaves = finalWaves.length;
  const maxParallelism = Math.max(
    ...finalWaves.map(w => w.tasks.length),
    0
  );

  return {
    waves: finalWaves,
    totalWaves,
    maxParallelism,
    adjustments: [...conflictAdjustments, ...capacityAdjustments],
  };
}

/**
 * Compute wave depth for each task using topological order.
 * depth[task] = 1 + max(depth[dependency]) for all dependencies
 * Tasks with no dependencies get depth 0.
 */
function computeWaveDepths(
  graph: Map<string, DAGNode>,
  topologicalOrder: string[]
): Map<string, number> {
  const depths = new Map<string, number>();

  // Initialize all depths to 0
  for (const taskCode of topologicalOrder) {
    depths.set(taskCode, 0);
  }

  // Process in topological order
  for (const taskCode of topologicalOrder) {
    const node = graph.get(taskCode)!;
    let maxDepth = 0;

    // Find maximum depth of all dependencies
    for (const depTaskCode of node.dependencies) {
      const depDepth = depths.get(depTaskCode) || 0;
      maxDepth = Math.max(maxDepth, depDepth + 1);
    }

    depths.set(taskCode, maxDepth);
  }

  return depths;
}

/**
 * Group tasks by their computed depth.
 */
function groupTasksByDepth(
  tasks: ParsedTask[],
  depths: Map<string, number>
): Map<number, ParsedTask[]> {
  const grouped = new Map<number, ParsedTask[]>();

  for (const task of tasks) {
    const depth = depths.get(task.taskCode) || 0;
    const existing = grouped.get(depth) || [];
    existing.push(task);
    grouped.set(depth, existing);
  }

  return grouped;
}

/**
 * Place every task in a wave, resolving file conflicts as it goes.
 *
 * Tasks are placed one at a time, shallowest depth first and in input order
 * within a depth. Each goes into the earliest wave that is later than all of
 * its dependencies' waves and holds no task claiming one of the same files. So
 * of two tasks that want the same file, the one placed second is the one that
 * moves.
 *
 * A conflict is therefore an ordering constraint, not a relabelling. A task is
 * placed only after its dependencies have their final waves, so when a
 * dependency is bumped its dependents — and theirs — land after it without any
 * separate fix-up pass.
 *
 * This used to work depth by depth: a bumped task was written into the slot
 * for depth + 1, and that slot was then overwritten when depth + 1 was itself
 * processed. The task was gone from the plan — still listed as an adjustment,
 * in no wave, never dispatched. When the slot survived, the bumped task was
 * never checked against what it now sat beside, and its dependents stayed at
 * their original depth: the same wave as the work they were waiting on.
 */
function resolveFileConflicts(
  tasksByDepth: Map<number, ParsedTask[]>,
  graph: Map<string, DAGNode>
): {
  wavesAfterConflicts: Map<number, ParsedTask[]>;
  conflictAdjustments: WaveAdjustment[];
} {
  const adjustments: WaveAdjustment[] = [];
  const result = new Map<number, ParsedTask[]>();
  const claimedFilesByWave = new Map<number, Set<string>>();
  const waveByTaskCode = new Map<string, number>();

  // Get sorted depth levels
  const depths = Array.from(tasksByDepth.keys()).sort((a, b) => a - b);

  for (const depth of depths) {
    const tasksAtDepth = tasksByDepth.get(depth) || [];

    for (const task of tasksAtDepth) {
      // The earliest wave the dependencies allow. Every dependency sits at a
      // strictly smaller depth, so it has already been placed; with nothing
      // bumped upstream this is the task's own depth.
      let earliestWave = 0;
      for (const depTaskCode of graph.get(task.taskCode)!.dependencies) {
        earliestWave = Math.max(
          earliestWave,
          waveByTaskCode.get(depTaskCode)! + 1
        );
      }

      // Move later until no file this task claims is already claimed
      let wave = earliestWave;
      const conflictingFiles: string[] = [];

      for (;;) {
        const claimedFiles = claimedFilesByWave.get(wave);
        const conflictsHere = claimedFiles
          ? task.filePaths.filter(file => claimedFiles.has(file))
          : [];

        if (conflictsHere.length === 0) {
          break;
        }

        for (const file of conflictsHere) {
          if (!conflictingFiles.includes(file)) {
            conflictingFiles.push(file);
          }
        }
        wave++;
      }

      // Only a task displaced by its own conflict is recorded. A dependent
      // carried later by a bumped dependency conflicts with nothing, and the
      // plan scorer counts these rows as conflicts.
      if (wave !== earliestWave) {
        adjustments.push({
          type: 'FILE_CONFLICT_BUMP',
          taskCode: task.taskCode,
          fromWave: earliestWave,
          toWave: wave,
          reason: `File conflict detected with files: ${conflictingFiles.join(', ')}`,
        });
      }

      // Append rather than assign: the wave may already hold tasks
      const tasksInWave = result.get(wave) || [];
      tasksInWave.push(task);
      result.set(wave, tasksInWave);

      // Claim all files for this wave
      const claimedFiles = claimedFilesByWave.get(wave) || new Set<string>();
      for (const file of task.filePaths) {
        claimedFiles.add(file);
      }
      claimedFilesByWave.set(wave, claimedFiles);

      // Keep the latest wave per code. Codes are unique in a valid plan; if
      // one is repeated, dependents must wait for every row carrying it.
      waveByTaskCode.set(
        task.taskCode,
        Math.max(waveByTaskCode.get(task.taskCode) ?? 0, wave)
      );
    }
  }

  return {
    wavesAfterConflicts: result,
    conflictAdjustments: adjustments,
  };
}

/**
 * Apply capacity constraints by splitting waves that exceed maxTasksPerWave.
 */
function applyCapacityConstraints(
  tasksByDepth: Map<number, ParsedTask[]>,
  maxTasksPerWave?: number
): {
  finalWaves: AssignedWave[];
  capacityAdjustments: WaveAdjustment[];
} {
  const adjustments: WaveAdjustment[] = [];
  const waves: AssignedWave[] = [];

  // Get sorted depth levels
  const depths = Array.from(tasksByDepth.keys()).sort((a, b) => a - b);

  for (const depth of depths) {
    const tasksAtDepth = tasksByDepth.get(depth) || [];

    // If no capacity limit or tasks fit within limit, create single wave
    if (!maxTasksPerWave || tasksAtDepth.length <= maxTasksPerWave) {
      waves.push({
        waveIndex: waves.length,
        label: generateWaveLabel(depth, tasksAtDepth),
        tasks: tasksAtDepth,
      });
    } else {
      // Split into multiple sub-waves
      const subWaveCount = Math.ceil(tasksAtDepth.length / maxTasksPerWave);

      for (let subIndex = 0; subIndex < subWaveCount; subIndex++) {
        const startIdx = subIndex * maxTasksPerWave;
        const endIdx = Math.min(
          startIdx + maxTasksPerWave,
          tasksAtDepth.length
        );
        const subWaveTasks = tasksAtDepth.slice(startIdx, endIdx);

        waves.push({
          waveIndex: waves.length,
          label: generateWaveLabel(depth, subWaveTasks, subIndex),
          tasks: subWaveTasks,
        });

        // Record adjustments for tasks moved to sub-waves
        if (subIndex > 0) {
          for (const task of subWaveTasks) {
            adjustments.push({
              type: 'CAPACITY_SPLIT',
              taskCode: task.taskCode,
              fromWave: depth,
              toWave: waves.length - 1,
              reason: `Wave split due to capacity constraint (max ${maxTasksPerWave} tasks per wave)`,
            });
          }
        }
      }
    }
  }

  return {
    finalWaves: waves,
    capacityAdjustments: adjustments,
  };
}

/**
 * Throw unless the output waves hold exactly the tasks that were passed in.
 *
 * A plan that silently loses a task is the worst result this module can
 * produce: the plan still looks complete, is scored, approved and dispatched,
 * and the missing work is simply never done. Failing the whole assignment is
 * cheaper than that, so this is a hard error rather than a warning.
 */
function assertEveryTaskAssigned(
  tasks: ParsedTask[],
  waves: AssignedWave[]
): void {
  // Count by task code rather than comparing totals, so one task lost and
  // another repeated cannot cancel out.
  const outstanding = new Map<string, number>();
  for (const task of tasks) {
    outstanding.set(task.taskCode, (outstanding.get(task.taskCode) || 0) + 1);
  }

  let assignedCount = 0;
  for (const wave of waves) {
    for (const task of wave.tasks) {
      assignedCount++;
      outstanding.set(task.taskCode, (outstanding.get(task.taskCode) || 0) - 1);
    }
  }

  const missing: string[] = [];
  const unexpected: string[] = [];
  for (const [taskCode, count] of outstanding) {
    if (count > 0) missing.push(taskCode);
    if (count < 0) unexpected.push(taskCode);
  }

  if (missing.length === 0 && unexpected.length === 0) {
    return;
  }

  const details = [
    missing.length > 0 ? `missing from every wave: ${missing.join(', ')}` : null,
    unexpected.length > 0
      ? `assigned more often than supplied: ${unexpected.join(', ')}`
      : null,
  ]
    .filter(Boolean)
    .join('; ');

  throw new Error(
    `Wave assignment is inconsistent: ${tasks.length} tasks were supplied but ` +
      `${assignedCount} were assigned across ${waves.length} waves (${details}). ` +
      `Refusing to return a plan that drops or repeats work.`
  );
}
