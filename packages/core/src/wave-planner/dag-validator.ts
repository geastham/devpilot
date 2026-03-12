import type {
  ParsedTask,
  ParsedEdge,
  ValidationResult,
  ValidationError,
  ValidationWarning,
  ValidationErrorCode,
  ValidationWarningCode,
  ParsedWavePlan,
} from './types';
import { topologicalSort, buildDAGGraph, groupBy, extractWaveFromTaskCode } from './utils';

export interface DAGValidatorConfig {
  enableAutoCorrection?: boolean;
  strictFileOwnership?: boolean;
}

/**
 * Validates that the parsed wave plan forms a valid directed acyclic graph
 * with proper file ownership and task structure.
 *
 * @param tasks - Array of parsed tasks
 * @param edges - Array of dependency edges
 * @param config - Optional validation configuration
 * @returns ValidationResult with errors, warnings, and optional corrected plan
 */
export function validateDAG(
  tasks: ParsedTask[],
  edges: ParsedEdge[],
  config?: DAGValidatorConfig
): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  // 1. Empty plan check
  if (tasks.length === 0) {
    errors.push({
      code: 'EMPTY_PLAN',
      message: 'Wave plan contains no tasks',
      detail: 'A valid wave plan must contain at least one task',
    });

    return {
      valid: false,
      errors,
      warnings,
    };
  }

  // 2. Duplicate task code detection
  const taskCodeCounts = new Map<string, number>();
  const duplicateTaskCodes: string[] = [];

  for (const task of tasks) {
    const count = (taskCodeCounts.get(task.taskCode) || 0) + 1;
    taskCodeCounts.set(task.taskCode, count);

    if (count === 2) {
      duplicateTaskCodes.push(task.taskCode);
    }
  }

  if (duplicateTaskCodes.length > 0) {
    errors.push({
      code: 'DUPLICATE_TASK_CODE',
      message: 'Duplicate task codes detected',
      taskCodes: duplicateTaskCodes,
      detail: `Task codes must be unique. Found duplicates: ${duplicateTaskCodes.join(', ')}`,
    });
  }

  // Build a set of valid task codes for referential integrity checks
  const validTaskCodes = new Set(tasks.map(t => t.taskCode));

  // 3. Referential integrity - check all dependency IDs exist
  const danglingDependencies = new Map<string, string[]>(); // taskCode -> missing dependencies

  for (const task of tasks) {
    const missing: string[] = [];
    for (const dep of task.dependencies) {
      if (!validTaskCodes.has(dep)) {
        missing.push(dep);
      }
    }
    if (missing.length > 0) {
      danglingDependencies.set(task.taskCode, missing);
    }
  }

  // Also check edges for referential integrity
  for (const edge of edges) {
    if (!validTaskCodes.has(edge.from)) {
      const existing = danglingDependencies.get(edge.to) || [];
      if (!existing.includes(edge.from)) {
        existing.push(edge.from);
        danglingDependencies.set(edge.to, existing);
      }
    }
    if (!validTaskCodes.has(edge.to)) {
      const existing = danglingDependencies.get(edge.from) || [];
      if (!existing.includes(edge.to)) {
        existing.push(edge.to);
        danglingDependencies.set(edge.from, existing);
      }
    }
  }

  if (danglingDependencies.size > 0) {
    for (const [taskCode, missingDeps] of danglingDependencies) {
      warnings.push({
        code: 'DANGLING_DEPENDENCY',
        message: `Task ${taskCode} references non-existent dependencies`,
        taskCodes: [taskCode],
        detail: `Missing dependencies: ${missingDeps.join(', ')}`,
      });
    }
  }

  // Build the DAG graph for cycle detection
  const graph = buildDAGGraph(tasks, edges);

  // 4. Cycle detection using Kahn's algorithm
  const topoResult = topologicalSort(graph);

  if (!topoResult.valid && topoResult.cycleParticipants) {
    errors.push({
      code: 'CYCLE_DETECTED',
      message: 'Circular dependency detected in task graph',
      taskCodes: topoResult.cycleParticipants,
      detail: `The following tasks form a cycle: ${topoResult.cycleParticipants.join(' -> ')}`,
    });
  }

  // 5. Root task existence - at least one task with no dependencies
  // Use the original task.dependencies to check, not the graph (which may have filtered out invalid deps)
  const rootTasks = tasks.filter(t => t.dependencies.length === 0);

  if (rootTasks.length === 0) {
    errors.push({
      code: 'NO_ROOT_TASK',
      message: 'No root tasks found (all tasks have dependencies)',
      detail: 'At least one task must have no dependencies to serve as a starting point',
    });
  }

  // 6. File ownership overlap within waves
  const fileOverlapWarnings = checkFileOverlapInWaves(tasks);
  warnings.push(...fileOverlapWarnings);

  // Determine if the plan is valid (no errors)
  const valid = errors.length === 0;

  return {
    valid,
    errors,
    warnings,
    // TODO: Implement auto-correction if config.enableAutoCorrection is true
    correctedPlan: undefined,
  };
}

/**
 * Check for file ownership overlap within the same wave.
 * Tasks in the same wave should not modify the same files to avoid conflicts.
 *
 * @param tasks - Array of parsed tasks
 * @returns Array of validation warnings for file overlaps
 */
function checkFileOverlapInWaves(tasks: ParsedTask[]): ValidationWarning[] {
  const warnings: ValidationWarning[] = [];

  // Group tasks by wave
  const tasksByWave = groupBy(tasks, task => extractWaveFromTaskCode(task.taskCode));

  // Check each wave for file overlaps
  for (const [waveIndex, waveTasks] of tasksByWave) {
    // Build a map of file -> tasks that touch that file
    const fileToTasks = new Map<string, string[]>();

    for (const task of waveTasks) {
      for (const filePath of task.filePaths) {
        const existing = fileToTasks.get(filePath) || [];
        existing.push(task.taskCode);
        fileToTasks.set(filePath, existing);
      }
    }

    // Find files touched by multiple tasks
    for (const [filePath, taskCodes] of fileToTasks) {
      if (taskCodes.length > 1) {
        warnings.push({
          code: 'FILE_OVERLAP_SAME_WAVE',
          message: `Multiple tasks in wave ${waveIndex} modify the same file`,
          taskCodes,
          detail: `File "${filePath}" is modified by tasks: ${taskCodes.join(', ')}`,
        });
      }
    }
  }

  return warnings;
}
