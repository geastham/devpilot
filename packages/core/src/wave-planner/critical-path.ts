import type { ParsedTask, ParsedEdge, CriticalPathResult, CriticalPathAnnotation } from './types';
import { buildDAGGraph, topologicalSort } from './utils';

/**
 * Computes the critical path through a DAG of tasks using topological-sort-based
 * dynamic programming.
 *
 * The critical path is the longest path through the dependency graph, representing
 * the minimum time required to complete all tasks even with unlimited parallelism.
 *
 * Algorithm:
 * 1. Build DAG graph from tasks and edges
 * 2. Run topological sort to get valid ordering
 * 3. Forward pass: Compute distanceFromRoot for each task
 * 4. Find terminal node with maximum distance (end of critical path)
 * 5. Backtrack: Build path from end to start using predecessor tracking
 * 6. Backward pass: Compute distanceToEnd for slack calculation
 * 7. Compute slack: slack = (totalLength - 1) - (distFromRoot + distToEnd)
 *
 * @param tasks - Array of parsed tasks
 * @param edges - Array of dependency edges (from -> to)
 * @returns CriticalPathResult containing path, length, and per-task annotations
 */
export function computeCriticalPath(
  tasks: ParsedTask[],
  edges: ParsedEdge[]
): CriticalPathResult {
  // Handle empty case
  if (tasks.length === 0) {
    return {
      path: [],
      length: 0,
      annotations: new Map(),
    };
  }

  // Build DAG graph
  const graph = buildDAGGraph(tasks, edges);

  // Run topological sort
  const sortResult = topologicalSort(graph);
  if (!sortResult.valid) {
    // If there's a cycle, we can't compute a valid critical path
    // Return empty result with all tasks annotated as not on critical path
    const annotations = new Map<string, CriticalPathAnnotation>();
    for (const task of tasks) {
      annotations.set(task.taskCode, {
        taskCode: task.taskCode,
        isOnCriticalPath: false,
        distanceFromRoot: 0,
        distanceToEnd: 0,
        slack: 0,
      });
    }
    return {
      path: [],
      length: 0,
      annotations,
    };
  }

  const order = sortResult.order;

  // === FORWARD PASS: Compute distanceFromRoot ===
  // distanceFromRoot[task] = max(distanceFromRoot[dep] + 1) for all dependencies
  const distanceFromRoot = new Map<string, number>();
  const predecessor = new Map<string, string | null>();

  for (const taskCode of order) {
    const node = graph.get(taskCode)!;

    if (node.dependencies.size === 0) {
      // Root node
      distanceFromRoot.set(taskCode, 0);
      predecessor.set(taskCode, null);
    } else {
      // Find max distance from any dependency
      let maxDist = -1;
      let maxPred: string | null = null;

      for (const depCode of node.dependencies) {
        const depDist = distanceFromRoot.get(depCode) ?? 0;
        if (depDist >= maxDist) {
          maxDist = depDist;
          maxPred = depCode;
        }
      }

      distanceFromRoot.set(taskCode, maxDist + 1);
      predecessor.set(taskCode, maxPred);
    }
  }

  // === Find terminal node with maximum distance (end of critical path) ===
  let maxDistance = -1;
  let terminalNode: string | null = null;

  for (const taskCode of order) {
    const dist = distanceFromRoot.get(taskCode)!;
    if (dist > maxDistance) {
      maxDistance = dist;
      terminalNode = taskCode;
    }
  }

  // === BACKTRACK: Build critical path from end to start ===
  const path: string[] = [];
  let current: string | null = terminalNode;

  while (current !== null) {
    path.unshift(current);
    current = predecessor.get(current) ?? null;
  }

  const criticalPathLength = path.length;

  // === BACKWARD PASS: Compute distanceToEnd ===
  // Process in reverse topological order
  const distanceToEnd = new Map<string, number>();

  for (let i = order.length - 1; i >= 0; i--) {
    const taskCode = order[i];
    const node = graph.get(taskCode)!;

    if (node.dependents.size === 0) {
      // Terminal node
      distanceToEnd.set(taskCode, 0);
    } else {
      // Find max distance to any dependent
      let maxDist = -1;

      for (const depCode of node.dependents) {
        const depDist = distanceToEnd.get(depCode) ?? 0;
        maxDist = Math.max(maxDist, depDist);
      }

      distanceToEnd.set(taskCode, maxDist + 1);
    }
  }

  // === COMPUTE SLACK: slack = (totalLength - 1) - (distFromRoot + distToEnd) ===
  const criticalPathSet = new Set(path);
  const annotations = new Map<string, CriticalPathAnnotation>();

  for (const task of tasks) {
    const taskCode = task.taskCode;
    const distFromRoot = distanceFromRoot.get(taskCode) ?? 0;
    const distToEnd = distanceToEnd.get(taskCode) ?? 0;
    const slack = Math.max(0, (criticalPathLength - 1) - (distFromRoot + distToEnd));

    annotations.set(taskCode, {
      taskCode,
      isOnCriticalPath: criticalPathSet.has(taskCode),
      distanceFromRoot: distFromRoot,
      distanceToEnd: distToEnd,
      slack,
    });
  }

  return {
    path,
    length: criticalPathLength,
    annotations,
  };
}
