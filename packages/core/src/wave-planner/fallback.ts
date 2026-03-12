import type { ParsedWavePlan, ParsedTask, ParsedWave, ParsedStatistics } from './types';

// ============================================================================
// Fallback Plan Generation
// ============================================================================

/**
 * Creates a flat plan where all tasks are in wave 1 with no dependencies.
 * Used as fallback when Claude response parsing fails.
 *
 * @param tasks - Array of parsed tasks
 * @returns A single-wave plan with all tasks parallelizable
 */
export function createFlatPlan(tasks: ParsedTask[]): ParsedWavePlan {
  if (tasks.length === 0) {
    throw new Error('Cannot create flat plan from empty task list');
  }

  // Reassign task codes to follow "1.X" pattern
  const flatTasks: ParsedTask[] = tasks.map((task, index) => ({
    ...task,
    taskCode: `1.${index + 1}`,
    dependencies: [], // Clear all dependencies for flat plan
    canRunInParallel: true, // All tasks can run in parallel
  }));

  // Create single wave containing all tasks
  const wave: ParsedWave = {
    waveIndex: 1,
    label: 'Wave 1',
    tasks: flatTasks,
  };

  // Set critical path to first task only (arbitrary choice for flat plan)
  const criticalPath = [flatTasks[0].taskCode];

  // Calculate statistics
  const statistics: ParsedStatistics = {
    totalTasks: flatTasks.length,
    totalWaves: 1,
    maxParallelism: flatTasks.length, // All tasks can run in parallel
    criticalPathLength: 1, // Only one task on critical path
    sequentialChains: 0, // No sequential dependencies
  };

  return {
    waves: [wave],
    dependencyEdges: [], // No dependencies in flat plan
    criticalPath,
    statistics,
    rawMarkdown: '(Fallback flat plan - no markdown available)',
  };
}

/**
 * Creates a flat plan from simple task descriptions.
 * Useful when we have task descriptions but parsing failed entirely.
 *
 * @param descriptions - Array of task description strings
 * @returns A single-wave plan with basic task structures
 */
export function createFlatPlanFromDescriptions(descriptions: string[]): ParsedWavePlan {
  if (descriptions.length === 0) {
    throw new Error('Cannot create flat plan from empty descriptions list');
  }

  // Create basic tasks from descriptions
  const tasks: ParsedTask[] = descriptions.map((description, index) => ({
    taskCode: `1.${index + 1}`,
    description,
    filePaths: [], // No file paths available
    dependencies: [],
    canRunInParallel: true,
    recommendedModel: 'sonnet', // Default to balanced model
    complexity: 'M', // Default to medium complexity
  }));

  return createFlatPlan(tasks);
}
