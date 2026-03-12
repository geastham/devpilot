/**
 * Wave Analyzer
 *
 * Compares generated wave plans against ground-truth DAGs.
 */

import type {
  WavePlan,
  Wave,
  GroundTruth,
  GroundTruthWave,
  WaveAnalysis,
  BenchmarkId,
} from '../types';

/**
 * Score a task placement relative to ground truth.
 * - Exact match: 100%
 * - ±1 wave: 75%
 * - ±2 waves: 50%
 * - ±3 waves: 25%
 * - More: 0%
 */
function scoreTaskPlacement(
  actualWave: number,
  expectedWave: number
): number {
  const diff = Math.abs(actualWave - expectedWave);
  switch (diff) {
    case 0:
      return 1.0;
    case 1:
      return 0.75;
    case 2:
      return 0.5;
    case 3:
      return 0.25;
    default:
      return 0;
  }
}

/**
 * Analyzes wave plans against ground truth.
 */
export class WaveAnalyzer {
  /**
   * Analyze a generated wave plan against ground truth.
   */
  analyze(generated: WavePlan, groundTruth: GroundTruth): WaveAnalysis {
    // Build task-to-wave maps
    const generatedTaskWaves = this.buildTaskWaveMap(generated);
    const groundTruthTaskWaves = this.buildGroundTruthTaskWaveMap(groundTruth);

    // Calculate task placement accuracy
    let totalScore = 0;
    let taskCount = 0;
    const dependencyViolations: string[] = [];
    const missedParallelism: string[] = [];
    const unnecessarySequencing: string[] = [];

    // Check each ground truth task
    for (const [taskId, expectedWave] of groundTruthTaskWaves) {
      const actualWave = generatedTaskWaves.get(taskId);
      if (actualWave !== undefined) {
        totalScore += scoreTaskPlacement(actualWave, expectedWave);
        taskCount++;

        // Check for violations
        if (actualWave < expectedWave) {
          // Task executed earlier than expected - check for dependency violations
          const deps = this.getTaskDependencies(taskId, groundTruth);
          for (const dep of deps) {
            const depWave = generatedTaskWaves.get(dep);
            if (depWave !== undefined && depWave >= actualWave) {
              dependencyViolations.push(
                `${taskId} executed in wave ${actualWave} before dependency ${dep} (wave ${depWave})`
              );
            }
          }
        } else if (actualWave > expectedWave) {
          // Task executed later than expected
          unnecessarySequencing.push(
            `${taskId} in wave ${actualWave}, expected wave ${expectedWave}`
          );
        }
      }
    }

    // Check for missed parallelism
    for (const wave of groundTruth.waves) {
      for (const parallelTask of wave.parallel) {
        const actualWave = generatedTaskWaves.get(parallelTask);
        // Check if tasks that should be parallel are in different waves
        for (const otherTask of wave.parallel) {
          if (otherTask !== parallelTask) {
            const otherWave = generatedTaskWaves.get(otherTask);
            if (
              actualWave !== undefined &&
              otherWave !== undefined &&
              actualWave !== otherWave
            ) {
              missedParallelism.push(
                `${parallelTask} (wave ${actualWave}) and ${otherTask} (wave ${otherWave}) should be parallel`
              );
            }
          }
        }
      }
    }

    // Calculate edit distance (simplified - count mismatches)
    const editDistance = this.calculateEditDistance(
      generatedTaskWaves,
      groundTruthTaskWaves
    );

    // Calculate task placement accuracy
    const taskPlacementAccuracy = taskCount > 0 ? totalScore / taskCount : 0;

    // Calculate final score (0-25 per methodology rubric)
    const score = this.calculateFinalScore(
      taskPlacementAccuracy,
      dependencyViolations.length,
      missedParallelism.length
    );

    return {
      groundTruthWaves: groundTruth.waves.length,
      generatedWaves: generated.waves.length,
      taskPlacementAccuracy,
      dependencyViolations: [...new Set(dependencyViolations)], // Remove duplicates
      missedParallelism: [...new Set(missedParallelism)],
      unnecessarySequencing,
      editDistance,
      score,
    };
  }

  /**
   * Build a map of task ID to wave number from a WavePlan.
   */
  private buildTaskWaveMap(plan: WavePlan): Map<string, number> {
    const map = new Map<string, number>();

    for (const wave of plan.waves) {
      for (const task of wave.tasks) {
        map.set(task.id, wave.waveNumber);
      }
    }

    return map;
  }

  /**
   * Build a map of task ID to wave number from ground truth.
   */
  private buildGroundTruthTaskWaveMap(
    groundTruth: GroundTruth
  ): Map<string, number> {
    const map = new Map<string, number>();

    for (const wave of groundTruth.waves) {
      for (const taskId of wave.tasks) {
        map.set(taskId, wave.wave);
      }
    }

    return map;
  }

  /**
   * Get dependencies for a task from ground truth.
   */
  private getTaskDependencies(
    taskId: string,
    groundTruth: GroundTruth
  ): string[] {
    const deps: string[] = [];

    // Find the wave containing this task
    const taskWave = groundTruth.waves.find((w) => w.tasks.includes(taskId));
    if (!taskWave || !taskWave.dependsOn) return deps;

    // Get all tasks from dependent waves
    for (const depWaveNum of taskWave.dependsOn) {
      const depWave = groundTruth.waves.find((w) => w.wave === depWaveNum);
      if (depWave) {
        deps.push(...depWave.tasks);
      }
    }

    return deps;
  }

  /**
   * Calculate edit distance between two task-wave maps.
   */
  private calculateEditDistance(
    generated: Map<string, number>,
    groundTruth: Map<string, number>
  ): number {
    let distance = 0;

    // Count tasks in wrong waves
    for (const [taskId, expectedWave] of groundTruth) {
      const actualWave = generated.get(taskId);
      if (actualWave === undefined) {
        distance++; // Task missing
      } else if (actualWave !== expectedWave) {
        distance++; // Task in wrong wave
      }
    }

    // Count extra tasks in generated plan
    for (const taskId of generated.keys()) {
      if (!groundTruth.has(taskId)) {
        distance++; // Extra task
      }
    }

    return distance;
  }

  /**
   * Calculate final wave plan score (0-25).
   */
  private calculateFinalScore(
    taskPlacementAccuracy: number,
    dependencyViolations: number,
    missedParallelism: number
  ): number {
    // Base score from task placement (0-20 points)
    let score = taskPlacementAccuracy * 20;

    // Penalty for dependency violations (-2 points each, max -10)
    const violationPenalty = Math.min(dependencyViolations * 2, 10);
    score -= violationPenalty;

    // Penalty for missed parallelism (-1 point each, max -5)
    const parallelismPenalty = Math.min(missedParallelism * 1, 5);
    score -= parallelismPenalty;

    // Bonus for perfect placement (+5 points)
    if (taskPlacementAccuracy === 1.0 && dependencyViolations === 0) {
      score += 5;
    }

    // Clamp to 0-25
    return Math.max(0, Math.min(25, Math.round(score * 100) / 100));
  }

  /**
   * Get a human-readable summary of the analysis.
   */
  static summarize(analysis: WaveAnalysis): string {
    const lines: string[] = [];

    lines.push(`Wave Plan Analysis: ${analysis.score}/25 points`);
    lines.push(`  Waves: ${analysis.generatedWaves} generated vs ${analysis.groundTruthWaves} expected`);
    lines.push(`  Task Placement Accuracy: ${(analysis.taskPlacementAccuracy * 100).toFixed(1)}%`);
    lines.push(`  Edit Distance: ${analysis.editDistance}`);

    if (analysis.dependencyViolations.length > 0) {
      lines.push(`  Dependency Violations (${analysis.dependencyViolations.length}):`);
      for (const v of analysis.dependencyViolations.slice(0, 3)) {
        lines.push(`    - ${v}`);
      }
      if (analysis.dependencyViolations.length > 3) {
        lines.push(`    ... and ${analysis.dependencyViolations.length - 3} more`);
      }
    }

    if (analysis.missedParallelism.length > 0) {
      lines.push(`  Missed Parallelism (${analysis.missedParallelism.length}):`);
      for (const m of analysis.missedParallelism.slice(0, 3)) {
        lines.push(`    - ${m}`);
      }
      if (analysis.missedParallelism.length > 3) {
        lines.push(`    ... and ${analysis.missedParallelism.length - 3} more`);
      }
    }

    return lines.join('\n');
  }
}

/**
 * Create a wave analyzer.
 */
export function createWaveAnalyzer(): WaveAnalyzer {
  return new WaveAnalyzer();
}

/**
 * Quick helper to analyze without instantiating.
 */
export function analyzeWavePlan(
  generated: WavePlan,
  groundTruth: GroundTruth
): WaveAnalysis {
  const analyzer = new WaveAnalyzer();
  return analyzer.analyze(generated, groundTruth);
}
