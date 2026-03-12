import type { ParsedWavePlan, ParsedWave, ParsedTask, ParsedEdge, ParsedStatistics } from './types';
import { normalizeModel, normalizeComplexity, parseDependencies, parseFilePaths } from './utils';

/**
 * Parse Claude's markdown response into structured wave plan data.
 *
 * Expected format:
 * ## Wave 1: Label (N tasks)
 * | Task ID | Description | Files | Dependencies | Parallel? | Model | Complexity |
 * |---------|-------------|-------|--------------|-----------|-------|------------|
 * | 1.1 | ... | ... | ... | Yes | Haiku | S |
 *
 * ## Critical Path
 * 1.1 -> 2.1 -> 3.1
 *
 * ## Statistics
 * | Metric | Value |
 * |--------|-------|
 * | Total Tasks | 10 |
 * | Total Waves | 3 |
 * ...
 */
export function parseWavePlanResponse(markdown: string): ParsedWavePlan {
  const waves = parseWaves(markdown);
  const allTasks = waves.flatMap(w => w.tasks);
  const dependencyEdges = extractDependencyEdges(allTasks);
  const criticalPath = parseCriticalPath(markdown);
  const statistics = parseStatistics(markdown, allTasks.length, waves.length, criticalPath.length);

  return {
    waves,
    dependencyEdges,
    criticalPath,
    statistics,
    rawMarkdown: markdown,
  };
}

/**
 * Extract all wave sections from markdown.
 */
function parseWaves(markdown: string): ParsedWave[] {
  const waves: ParsedWave[] = [];
  const waveHeaderRegex = /^##\s+Wave\s+(\d+):\s*(.+?)(?:\s*\((\d+)\s+tasks?\))?$/gim;

  const sections = splitIntoSections(markdown);

  for (const section of sections) {
    const headerMatch = waveHeaderRegex.exec(section.header);
    if (headerMatch) {
      const waveIndex = parseInt(headerMatch[1], 10);
      const label = headerMatch[2].trim();
      const tasks = parseTaskTable(section.content);

      waves.push({
        waveIndex,
        label,
        tasks,
      });
    }
    waveHeaderRegex.lastIndex = 0; // Reset regex state
  }

  return waves.sort((a, b) => a.waveIndex - b.waveIndex);
}

/**
 * Split markdown into sections based on ## headers.
 */
interface Section {
  header: string;
  content: string;
}

function splitIntoSections(markdown: string): Section[] {
  const sections: Section[] = [];
  const lines = markdown.split('\n');

  let currentHeader = '';
  let currentContent: string[] = [];

  for (const line of lines) {
    if (line.match(/^##\s+/)) {
      // Save previous section if exists
      if (currentHeader) {
        sections.push({
          header: currentHeader,
          content: currentContent.join('\n'),
        });
      }

      currentHeader = line;
      currentContent = [];
    } else {
      currentContent.push(line);
    }
  }

  // Save last section
  if (currentHeader) {
    sections.push({
      header: currentHeader,
      content: currentContent.join('\n'),
    });
  }

  return sections;
}

/**
 * Parse a markdown table into ParsedTask[].
 * Handles variations in column order and content.
 */
function parseTaskTable(tableContent: string): ParsedTask[] {
  const tasks: ParsedTask[] = [];
  const lines = tableContent.split('\n').map(l => l.trim()).filter(l => l.length > 0);

  // Find table boundaries
  let headerIndex = -1;
  let separatorIndex = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes('Task ID') || line.includes('Task Code')) {
      headerIndex = i;
    } else if (line.match(/^\|[\s\-:]+\|/)) {
      separatorIndex = i;
      break;
    }
  }

  if (headerIndex === -1 || separatorIndex === -1) {
    return tasks;
  }

  // Parse header to determine column indices
  const headerCells = parseTableRow(lines[headerIndex]);
  const columnMap = buildColumnMap(headerCells);

  // Parse data rows
  for (let i = separatorIndex + 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.startsWith('|')) break;

    const cells = parseTableRow(line);
    if (cells.length === 0) continue;

    const task = parseTaskRow(cells, columnMap);
    if (task) {
      tasks.push(task);
    }
  }

  return tasks;
}

/**
 * Parse a single table row into cells.
 */
function parseTableRow(line: string): string[] {
  return line
    .split('|')
    .slice(1, -1) // Remove leading/trailing empty strings from split
    .map(cell => cell.trim());
}

/**
 * Build a map of column names to indices.
 */
interface ColumnMap {
  taskId: number;
  description: number;
  files: number;
  dependencies: number;
  parallel: number;
  model: number;
  complexity: number;
}

function buildColumnMap(headers: string[]): ColumnMap {
  const map: ColumnMap = {
    taskId: -1,
    description: -1,
    files: -1,
    dependencies: -1,
    parallel: -1,
    model: -1,
    complexity: -1,
  };

  for (let i = 0; i < headers.length; i++) {
    const header = headers[i].toLowerCase();

    if (header.includes('task id') || header.includes('task code')) {
      map.taskId = i;
    } else if (header.includes('description')) {
      map.description = i;
    } else if (header.includes('file')) {
      map.files = i;
    } else if (header.includes('depend')) {
      map.dependencies = i;
    } else if (header.includes('parallel')) {
      map.parallel = i;
    } else if (header.includes('model')) {
      map.model = i;
    } else if (header.includes('complex')) {
      map.complexity = i;
    }
  }

  return map;
}

/**
 * Parse a task row into a ParsedTask.
 */
function parseTaskRow(cells: string[], columnMap: ColumnMap): ParsedTask | null {
  // Task ID is required
  if (columnMap.taskId === -1 || !cells[columnMap.taskId]) {
    return null;
  }

  const taskCode = cells[columnMap.taskId].trim();
  if (!taskCode.match(/^\d+\.\d+$/)) {
    return null;
  }

  const description = columnMap.description !== -1
    ? cells[columnMap.description]?.trim() || ''
    : '';

  const filePaths = columnMap.files !== -1
    ? parseFilePaths(cells[columnMap.files])
    : [];

  const dependencies = columnMap.dependencies !== -1
    ? parseDependencies(cells[columnMap.dependencies])
    : [];

  const canRunInParallel = columnMap.parallel !== -1
    ? parseBoolean(cells[columnMap.parallel])
    : false;

  const recommendedModel = columnMap.model !== -1
    ? normalizeModel(cells[columnMap.model])
    : 'sonnet';

  const complexity = columnMap.complexity !== -1
    ? normalizeComplexity(cells[columnMap.complexity])
    : 'M';

  return {
    taskCode,
    description,
    filePaths,
    dependencies,
    canRunInParallel,
    recommendedModel,
    complexity,
  };
}

/**
 * Parse a boolean value from various formats.
 */
function parseBoolean(value: string | undefined): boolean {
  if (!value) return false;

  const normalized = value.toLowerCase().trim();
  return normalized === 'yes' ||
         normalized === 'true' ||
         normalized === 'y' ||
         normalized === '1' ||
         normalized === 'parallel';
}

/**
 * Extract dependency edges from tasks.
 * Each task's dependencies create edges from dependency -> task.
 * All edges are marked as 'hard' dependencies.
 */
function extractDependencyEdges(tasks: ParsedTask[]): ParsedEdge[] {
  const edges: ParsedEdge[] = [];

  for (const task of tasks) {
    for (const dep of task.dependencies) {
      edges.push({
        from: dep,
        to: task.taskCode,
        type: 'hard',
      });
    }
  }

  return edges;
}

/**
 * Parse the Critical Path section.
 * Expected format: "1.1 -> 2.1 -> 3.1" or bullet list.
 */
function parseCriticalPath(markdown: string): string[] {
  const sections = splitIntoSections(markdown);

  for (const section of sections) {
    if (section.header.match(/^##\s+Critical\s+Path/i)) {
      const content = section.content.trim();

      // Try arrow-separated format
      if (content.includes('->')) {
        return content
          .split('->')
          .map(s => s.trim())
          .filter(s => s.match(/^\d+\.\d+$/));
      }

      // Try bullet list format
      const lines = content.split('\n');
      const path: string[] = [];
      for (const line of lines) {
        const match = line.match(/\b(\d+\.\d+)\b/);
        if (match) {
          path.push(match[1]);
        }
      }

      if (path.length > 0) {
        return path;
      }
    }
  }

  return [];
}

/**
 * Parse the Statistics section.
 * Falls back to calculated values if parsing fails.
 */
function parseStatistics(
  markdown: string,
  totalTasksCalculated: number,
  totalWavesCalculated: number,
  criticalPathLengthCalculated: number
): ParsedStatistics {
  const sections = splitIntoSections(markdown);

  let totalTasks = totalTasksCalculated;
  let totalWaves = totalWavesCalculated;
  let maxParallelism = 0;
  let criticalPathLength = criticalPathLengthCalculated;
  let sequentialChains = 0;

  for (const section of sections) {
    if (section.header.match(/^##\s+Statistics/i)) {
      const lines = section.content.split('\n');

      for (const line of lines) {
        const cells = parseTableRow(line);
        if (cells.length < 2) continue;

        const metric = cells[0].toLowerCase();
        const value = cells[1];

        if (metric.includes('total tasks')) {
          totalTasks = parseInt(value, 10) || totalTasks;
        } else if (metric.includes('total waves')) {
          totalWaves = parseInt(value, 10) || totalWaves;
        } else if (metric.includes('max parallelism')) {
          maxParallelism = parseInt(value, 10) || maxParallelism;
        } else if (metric.includes('critical path')) {
          criticalPathLength = parseInt(value, 10) || criticalPathLength;
        } else if (metric.includes('sequential chains')) {
          sequentialChains = parseInt(value, 10) || sequentialChains;
        }
      }
    }
  }

  return {
    totalTasks,
    totalWaves,
    maxParallelism,
    criticalPathLength,
    sequentialChains,
  };
}

/**
 * Helper to extract task codes from a wave plan for validation.
 */
export function extractAllTaskCodes(plan: ParsedWavePlan): string[] {
  return plan.waves.flatMap(w => w.tasks.map(t => t.taskCode));
}

/**
 * Helper to find a task by its code.
 */
export function findTaskByCode(plan: ParsedWavePlan, taskCode: string): ParsedTask | undefined {
  for (const wave of plan.waves) {
    const task = wave.tasks.find(t => t.taskCode === taskCode);
    if (task) return task;
  }
  return undefined;
}

/**
 * Helper to get all tasks in a specific wave.
 */
export function getTasksInWave(plan: ParsedWavePlan, waveIndex: number): ParsedTask[] {
  const wave = plan.waves.find(w => w.waveIndex === waveIndex);
  return wave?.tasks || [];
}
