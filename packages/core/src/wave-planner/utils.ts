import type { DAGNode, TopologicalSortResult, ParsedTask } from './types';

/**
 * Topological sort using Kahn's algorithm.
 * Returns the sorted order if the graph is a valid DAG, or indicates cycle detection.
 */
export function topologicalSort(graph: Map<string, DAGNode>): TopologicalSortResult {
  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, Set<string>>();

  // Initialize structures
  for (const [taskCode, node] of graph) {
    inDegree.set(taskCode, node.dependencies.size);
    adjacency.set(taskCode, node.dependents);
  }

  // Find all root nodes (in-degree = 0)
  const queue: string[] = [];
  for (const [taskCode, degree] of inDegree) {
    if (degree === 0) {
      queue.push(taskCode);
    }
  }

  const order: string[] = [];

  while (queue.length > 0) {
    const current = queue.shift()!;
    order.push(current);

    for (const dependent of adjacency.get(current) || []) {
      const newDegree = (inDegree.get(dependent) || 0) - 1;
      inDegree.set(dependent, newDegree);
      if (newDegree === 0) {
        queue.push(dependent);
      }
    }
  }

  const valid = order.length === graph.size;

  if (!valid) {
    // Find tasks that are part of cycles (still have in-degree > 0)
    const cycleParticipants = [...inDegree.entries()]
      .filter(([_, degree]) => degree > 0)
      .map(([taskCode]) => taskCode);

    return { order, valid: false, cycleParticipants };
  }

  return { order, valid: true };
}

/**
 * Build a DAG graph from parsed tasks and edges.
 */
export function buildDAGGraph(
  tasks: ParsedTask[],
  edges: { from: string; to: string }[]
): Map<string, DAGNode> {
  const graph = new Map<string, DAGNode>();

  // Initialize all nodes
  for (const task of tasks) {
    graph.set(task.taskCode, {
      taskCode: task.taskCode,
      inDegree: 0,
      outDegree: 0,
      dependencies: new Set(),
      dependents: new Set(),
      filePaths: new Set(task.filePaths),
    });
  }

  // Add edges
  for (const edge of edges) {
    const fromNode = graph.get(edge.from);
    const toNode = graph.get(edge.to);

    if (fromNode && toNode) {
      fromNode.dependents.add(edge.to);
      fromNode.outDegree++;
      toNode.dependencies.add(edge.from);
      toNode.inDegree++;
    }
  }

  return graph;
}

/**
 * Group items by a key function.
 */
export function groupBy<T, K>(items: T[], keyFn: (item: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>();

  for (const item of items) {
    const key = keyFn(item);
    const existing = map.get(key) || [];
    existing.push(item);
    map.set(key, existing);
  }

  return map;
}

/**
 * Extract wave number from task code (e.g., "2.3" -> 2, "1.1" -> 1)
 */
export function extractWaveFromTaskCode(taskCode: string): number {
  const match = taskCode.match(/^(\d+)\./);
  return match ? parseInt(match[1], 10) : 0;
}

/**
 * Normalize model name to lowercase enum value.
 */
export function normalizeModel(raw: string | undefined | null): 'haiku' | 'sonnet' | 'opus' {
  const normalized = raw?.toLowerCase().trim();

  if (normalized === 'haiku') return 'haiku';
  if (normalized === 'opus') return 'opus';
  return 'sonnet'; // Default
}

/**
 * Normalize complexity to uppercase enum value.
 */
export function normalizeComplexity(raw: string | undefined | null): 'S' | 'M' | 'L' | 'XL' {
  const normalized = raw?.toUpperCase().trim();

  if (normalized === 'S' || normalized === 'SMALL') return 'S';
  if (normalized === 'M' || normalized === 'MEDIUM') return 'M';
  if (normalized === 'L' || normalized === 'LARGE') return 'L';
  if (normalized === 'XL' || normalized === 'EXTRA LARGE' || normalized === 'EXTRA-LARGE') return 'XL';
  return 'M'; // Default
}

/**
 * Parse a dependency string into an array of task codes.
 * Handles formats: "None", "1.1", "1.1, 2.1", "1.1; 2.1"
 */
export function parseDependencies(raw: string | undefined | null): string[] {
  if (!raw || raw.toLowerCase() === 'none' || raw.trim() === '' || raw.trim() === '-') {
    return [];
  }

  // Split by comma, semicolon, or newline
  return raw
    .split(/[,;\n]/)
    .map(s => s.trim())
    .filter(s => s.length > 0 && /^\d+\.\d+$/.test(s));
}

/**
 * Parse file paths from a string.
 * Handles formats: "file1.ts", "file1.ts, file2.ts", "file1.ts; file2.ts", newline-separated
 */
export function parseFilePaths(raw: string | undefined | null): string[] {
  if (!raw || raw.toLowerCase() === 'none' || raw.trim() === '' || raw.trim() === '-') {
    return [];
  }

  // Split by comma, semicolon, or newline
  return raw
    .split(/[,;\n]/)
    .map(s => s.trim())
    .filter(s => s.length > 0);
}

/**
 * Find common theme/words in task descriptions for wave labeling.
 */
export function findCommonTheme(descriptions: string[]): string | null {
  if (descriptions.length === 0) return null;

  // Common prefixes/themes to look for
  const themes = [
    'setup', 'initialize', 'bootstrap',
    'foundation', 'core', 'base',
    'api', 'endpoint', 'route',
    'component', 'ui', 'view',
    'test', 'testing', 'unit test',
    'integration', 'wire', 'connect',
    'refactor', 'cleanup', 'optimize',
    'database', 'schema', 'migration',
  ];

  const descLower = descriptions.map(d => d.toLowerCase());

  for (const theme of themes) {
    if (descLower.every(d => d.includes(theme))) {
      return theme.charAt(0).toUpperCase() + theme.slice(1);
    }
  }

  // If no common theme, check for most common word
  const wordCounts = new Map<string, number>();
  for (const desc of descLower) {
    const words = desc.split(/\s+/).filter(w => w.length > 3);
    for (const word of words) {
      wordCounts.set(word, (wordCounts.get(word) || 0) + 1);
    }
  }

  let maxWord: string | null = null;
  let maxCount = 0;
  for (const [word, count] of wordCounts) {
    if (count > maxCount && count >= descriptions.length * 0.5) {
      maxCount = count;
      maxWord = word;
    }
  }

  if (maxWord) {
    return maxWord.charAt(0).toUpperCase() + maxWord.slice(1);
  }

  return null;
}

/**
 * Generate a wave label from index and tasks.
 */
export function generateWaveLabel(
  originalIndex: number,
  tasks: ParsedTask[],
  subIndex?: number
): string {
  const subSuffix = subIndex !== undefined ? ` (Part ${subIndex + 1})` : '';

  // Try to infer a meaningful label from task descriptions
  const commonTheme = findCommonTheme(tasks.map(t => t.description));

  if (commonTheme) {
    return `Wave ${originalIndex + 1}: ${commonTheme}${subSuffix}`;
  }

  return `Wave ${originalIndex + 1}${subSuffix}`;
}

/**
 * Sleep utility for delays.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
