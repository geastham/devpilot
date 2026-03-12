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
 * 2. Group tasks by depth into initial waves
 * 3. Resolve file conflicts within waves
 * 4. Apply fleet capacity constraints
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

  // Step 3: Resolve file conflicts within waves
  const { wavesAfterConflicts, conflictAdjustments } = resolveFileConflicts(
    tasksByDepth
  );

  // Step 4: Apply capacity constraints
  const { finalWaves, capacityAdjustments } = applyCapacityConstraints(
    wavesAfterConflicts,
    config?.maxTasksPerWave
  );

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
 * Resolve file conflicts within waves.
 * If two tasks in the same wave touch the same file, bump one to the next wave.
 */
function resolveFileConflicts(
  tasksByDepth: Map<number, ParsedTask[]>
): {
  wavesAfterConflicts: Map<number, ParsedTask[]>;
  conflictAdjustments: WaveAdjustment[];
} {
  const adjustments: WaveAdjustment[] = [];
  const result = new Map<number, ParsedTask[]>();

  // Get sorted depth levels
  const depths = Array.from(tasksByDepth.keys()).sort((a, b) => a - b);

  for (const depth of depths) {
    const tasksAtDepth = tasksByDepth.get(depth) || [];
    const remainingTasks: ParsedTask[] = [];
    const bumpedTasks: ParsedTask[] = [];
    const claimedFiles = new Set<string>();

    for (const task of tasksAtDepth) {
      // Check if any of this task's files conflict with already-claimed files
      const hasConflict = task.filePaths.some(file => claimedFiles.has(file));

      if (hasConflict) {
        // Bump to next wave
        bumpedTasks.push(task);
        const conflictingFiles = task.filePaths.filter(file =>
          claimedFiles.has(file)
        );
        adjustments.push({
          type: 'FILE_CONFLICT_BUMP',
          taskCode: task.taskCode,
          fromWave: depth,
          toWave: depth + 1,
          reason: `File conflict detected with files: ${conflictingFiles.join(', ')}`,
        });
      } else {
        // No conflict, keep in current wave
        remainingTasks.push(task);
        // Claim all files for this wave
        for (const file of task.filePaths) {
          claimedFiles.add(file);
        }
      }
    }

    // Store remaining tasks at current depth
    if (remainingTasks.length > 0) {
      result.set(depth, remainingTasks);
    }

    // Add bumped tasks to next depth
    if (bumpedTasks.length > 0) {
      const nextDepth = depth + 1;
      const existingAtNext = result.get(nextDepth) || [];
      result.set(nextDepth, [...existingAtNext, ...bumpedTasks]);
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
