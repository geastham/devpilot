import type {
  WaveAssignmentResult,
  ParsedEdge,
  ParsedTask,
  PlanScore,
  ConfidenceSignalUpdate,
} from './types';

/**
 * Computes quality metrics for a wave plan assignment.
 *
 * Metrics:
 * - parallelizationScore: Ratio of parallelizable work (0-1)
 * - maxParallelism: Peak tasks in any wave
 * - waveEfficiency: Average tasks per wave
 * - dependencyDensity: How interconnected the DAG is
 * - fileConflictScore: Ratio of conflict-free file references (0-1)
 * - confidenceSignals: Quality indicators based on scores
 *
 * @param assignment - Wave assignment result
 * @param criticalPathLength - Length of critical path (number of tasks)
 * @param edges - Dependency edges
 * @param tasks - All tasks
 * @returns PlanScore with computed metrics
 */
export function scorePlan(
  assignment: WaveAssignmentResult,
  criticalPathLength: number,
  edges: ParsedEdge[],
  tasks: ParsedTask[]
): PlanScore {
  const totalTasks = tasks.length;

  // Handle edge case
  if (totalTasks === 0) {
    return {
      parallelizationScore: 0,
      maxParallelism: 0,
      waveEfficiency: 0,
      dependencyDensity: 0,
      fileConflictScore: 1,
      confidenceSignals: {
        parallelization: 'LOW',
        conflictRisk: 'LOW',
      },
    };
  }

  // 1. Parallelization Score
  // Higher score means more work can be done in parallel
  // Formula: 1 - (criticalPathLength / totalTasks)
  // If critical path = total tasks, no parallelism (score = 0)
  // If critical path = 1, perfect parallelism (score approaches 1)
  const parallelizationScore = criticalPathLength > 0
    ? 1 - criticalPathLength / totalTasks
    : 0;

  // 2. Max Parallelism (already computed in assignment)
  const maxParallelism = assignment.maxParallelism;

  // 3. Wave Efficiency
  // Average tasks per wave - higher is better (more work per wave)
  const waveEfficiency = assignment.totalWaves > 0
    ? totalTasks / assignment.totalWaves
    : 0;

  // 4. Dependency Density
  // Measures how interconnected the DAG is
  // Formula: edgeCount / (totalTasks * (totalTasks - 1) / 2)
  // This is the ratio of actual edges to maximum possible edges
  const maxPossibleEdges = (totalTasks * (totalTasks - 1)) / 2;
  const dependencyDensity = maxPossibleEdges > 0
    ? edges.length / maxPossibleEdges
    : 0;

  // 5. File Conflict Score
  // Measures how well file conflicts are avoided
  // Higher score = fewer conflicts (better)
  const fileConflictScore = computeFileConflictScore(
    assignment,
    tasks
  );

  // 6. Confidence Signals
  const confidenceSignals = computeConfidenceSignals(
    parallelizationScore,
    fileConflictScore
  );

  return {
    parallelizationScore,
    maxParallelism,
    waveEfficiency,
    dependencyDensity,
    fileConflictScore,
    confidenceSignals,
  };
}

/**
 * Compute file conflict score based on how well conflicts are avoided.
 * Returns a score from 0 to 1, where:
 * - 1.0 = no conflicts (perfect)
 * - Lower scores indicate more conflicts or adjustments needed
 */
function computeFileConflictScore(
  assignment: WaveAssignmentResult,
  tasks: ParsedTask[]
): number {
  // Count total file references
  const totalFileRefs = tasks.reduce(
    (sum, task) => sum + task.filePaths.length,
    0
  );

  if (totalFileRefs === 0) {
    return 1; // No files = no conflicts
  }

  // Count file conflict adjustments
  const fileConflictAdjustments = assignment.adjustments.filter(
    adj => adj.type === 'FILE_CONFLICT_BUMP'
  ).length;

  // Score is inversely proportional to conflicts
  // If no conflicts, score = 1
  // Each conflict reduces the score
  const conflictRatio = fileConflictAdjustments / totalFileRefs;
  const score = Math.max(0, 1 - conflictRatio);

  return score;
}

/**
 * Compute confidence signals based on scores.
 */
function computeConfidenceSignals(
  parallelizationScore: number,
  fileConflictScore: number
): ConfidenceSignalUpdate {
  // Parallelization confidence
  let parallelization: 'HIGH' | 'MEDIUM' | 'LOW';
  if (parallelizationScore > 0.7) {
    parallelization = 'HIGH';
  } else if (parallelizationScore > 0.4) {
    parallelization = 'MEDIUM';
  } else {
    parallelization = 'LOW';
  }

  // Conflict risk (inverse of file conflict score)
  // High file conflict score = low conflict risk
  let conflictRisk: 'HIGH' | 'MEDIUM' | 'LOW';
  if (fileConflictScore > 0.9) {
    conflictRisk = 'LOW';
  } else if (fileConflictScore > 0.6) {
    conflictRisk = 'MEDIUM';
  } else {
    conflictRisk = 'HIGH';
  }

  return {
    parallelization,
    conflictRisk,
  };
}
