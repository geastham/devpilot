"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/wave-planner/index.ts
var wave_planner_exports = {};
__export(wave_planner_exports, {
  CodebaseContextService: () => CodebaseContextService,
  CompletionListener: () => CompletionListener,
  ConcurrencyManager: () => ConcurrencyManager,
  DEFAULT_PLANNER_MODEL: () => DEFAULT_PLANNER_MODEL,
  DEFAULT_WIKI_MODEL: () => DEFAULT_WIKI_MODEL,
  ExecutionBridge: () => ExecutionBridge,
  FleetContextService: () => FleetContextService,
  PlanRefinementService: () => PlanRefinementService,
  PromptConstructor: () => PromptConstructor,
  WaveDispatchCoordinator: () => WaveDispatchCoordinator,
  WaveExecutionController: () => WaveExecutionController,
  WavePlanGenerator: () => WavePlanGenerator,
  WavePlannerAIClient: () => WavePlannerAIClient,
  advanceToNextWave: () => advanceToNextWave,
  assignWaves: () => assignWaves,
  autoAdvanceWave: () => autoAdvanceWave,
  buildDAGGraph: () => buildDAGGraph,
  buildSpecContentForItem: () => buildSpecContentForItem,
  collectFinalMetrics: () => collectFinalMetrics,
  computeCriticalPath: () => computeCriticalPath,
  createFlatPlan: () => createFlatPlan,
  createFlatPlanFromDescriptions: () => createFlatPlanFromDescriptions,
  createPlanRefinementService: () => createPlanRefinementService,
  createPromptConstructor: () => createPromptConstructor,
  createWavePlanGenerator: () => createWavePlanGenerator,
  defaultTemplate: () => defaultTemplate,
  extractAllTaskCodes: () => extractAllTaskCodes,
  extractWaveFromTaskCode: () => extractWaveFromTaskCode,
  findCommonTheme: () => findCommonTheme,
  findTaskByCode: () => findTaskByCode,
  generatePlanForItem: () => generatePlanForItem,
  generateWaveLabel: () => generateWaveLabel,
  generateWavePlan: () => generateWavePlan,
  getExecutionBridgeOrNull: () => getExecutionBridgeOrNull,
  getTasksInWave: () => getTasksInWave,
  groupBy: () => groupBy,
  initExecutionBridge: () => initExecutionBridge,
  markWavePlanComplete: () => markWavePlanComplete,
  normalizeComplexity: () => normalizeComplexity,
  normalizeModel: () => normalizeModel,
  parseDependencies: () => parseDependencies,
  parseFilePaths: () => parseFilePaths,
  parseWavePlanResponse: () => parseWavePlanResponse,
  projectWavePlanToPlan: () => projectWavePlanToPlan,
  refinementTemplate: () => refinementTemplate,
  resolvePlannerModel: () => resolvePlannerModel,
  resolveWikiModel: () => resolveWikiModel,
  scorePlan: () => scorePlan,
  simplifiedTemplate: () => simplifiedTemplate,
  sleep: () => sleep,
  toActivityEventType: () => toActivityEventType,
  topologicalSort: () => topologicalSort,
  validateDAG: () => validateDAG
});
module.exports = __toCommonJS(wave_planner_exports);

// src/wave-planner/utils.ts
function topologicalSort(graph) {
  const inDegree = /* @__PURE__ */ new Map();
  const adjacency = /* @__PURE__ */ new Map();
  for (const [taskCode, node] of graph) {
    inDegree.set(taskCode, node.dependencies.size);
    adjacency.set(taskCode, node.dependents);
  }
  const queue = [];
  for (const [taskCode, degree] of inDegree) {
    if (degree === 0) {
      queue.push(taskCode);
    }
  }
  const order = [];
  while (queue.length > 0) {
    const current = queue.shift();
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
    const cycleParticipants = [...inDegree.entries()].filter(([_, degree]) => degree > 0).map(([taskCode]) => taskCode);
    return { order, valid: false, cycleParticipants };
  }
  return { order, valid: true };
}
function buildDAGGraph(tasks2, edges) {
  const graph = /* @__PURE__ */ new Map();
  for (const task of tasks2) {
    graph.set(task.taskCode, {
      taskCode: task.taskCode,
      inDegree: 0,
      outDegree: 0,
      dependencies: /* @__PURE__ */ new Set(),
      dependents: /* @__PURE__ */ new Set(),
      filePaths: new Set(task.filePaths)
    });
  }
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
function groupBy(items, keyFn) {
  const map = /* @__PURE__ */ new Map();
  for (const item of items) {
    const key = keyFn(item);
    const existing = map.get(key) || [];
    existing.push(item);
    map.set(key, existing);
  }
  return map;
}
function extractWaveFromTaskCode(taskCode) {
  const match = taskCode.match(/^(\d+)\./);
  return match ? parseInt(match[1], 10) : 0;
}
function normalizeModel(raw) {
  const normalized = raw?.toLowerCase().trim();
  if (normalized === "haiku") return "haiku";
  if (normalized === "opus") return "opus";
  return "sonnet";
}
function normalizeComplexity(raw) {
  const normalized = raw?.toUpperCase().trim();
  if (normalized === "S" || normalized === "SMALL") return "S";
  if (normalized === "M" || normalized === "MEDIUM") return "M";
  if (normalized === "L" || normalized === "LARGE") return "L";
  if (normalized === "XL" || normalized === "EXTRA LARGE" || normalized === "EXTRA-LARGE") return "XL";
  return "M";
}
function parseDependencies(raw) {
  if (!raw || raw.toLowerCase() === "none" || raw.trim() === "" || raw.trim() === "-") {
    return [];
  }
  return raw.split(/[,;\n]/).map((s) => s.trim()).filter((s) => s.length > 0 && /^\d+\.\d+$/.test(s));
}
function parseFilePaths(raw) {
  if (!raw || raw.toLowerCase() === "none" || raw.trim() === "" || raw.trim() === "-") {
    return [];
  }
  return raw.split(/[,;\n]/).map((s) => s.trim()).filter((s) => s.length > 0);
}
function findCommonTheme(descriptions) {
  if (descriptions.length === 0) return null;
  const themes = [
    "setup",
    "initialize",
    "bootstrap",
    "foundation",
    "core",
    "base",
    "api",
    "endpoint",
    "route",
    "component",
    "ui",
    "view",
    "test",
    "testing",
    "unit test",
    "integration",
    "wire",
    "connect",
    "refactor",
    "cleanup",
    "optimize",
    "database",
    "schema",
    "migration"
  ];
  const descLower = descriptions.map((d) => d.toLowerCase());
  for (const theme of themes) {
    if (descLower.every((d) => d.includes(theme))) {
      return theme.charAt(0).toUpperCase() + theme.slice(1);
    }
  }
  const wordCounts = /* @__PURE__ */ new Map();
  for (const desc of descLower) {
    const words = desc.split(/\s+/).filter((w) => w.length > 3);
    for (const word of words) {
      wordCounts.set(word, (wordCounts.get(word) || 0) + 1);
    }
  }
  let maxWord = null;
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
function generateWaveLabel(originalIndex, tasks2, subIndex) {
  const subSuffix = subIndex !== void 0 ? ` (Part ${subIndex + 1})` : "";
  const commonTheme = findCommonTheme(tasks2.map((t) => t.description));
  if (commonTheme) {
    return `Wave ${originalIndex + 1}: ${commonTheme}${subSuffix}`;
  }
  return `Wave ${originalIndex + 1}${subSuffix}`;
}
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// src/wave-planner/parser.ts
function parseWavePlanResponse(markdown) {
  const waves2 = parseWaves(markdown);
  const allTasks = waves2.flatMap((w) => w.tasks);
  const dependencyEdges2 = extractDependencyEdges(allTasks);
  const criticalPath = parseCriticalPath(markdown);
  const statistics = parseStatistics(markdown, allTasks.length, waves2.length, criticalPath.length);
  return {
    waves: waves2,
    dependencyEdges: dependencyEdges2,
    criticalPath,
    statistics,
    rawMarkdown: markdown
  };
}
function parseWaves(markdown) {
  const waves2 = [];
  const waveHeaderRegex = /^##\s+Wave\s+(\d+):\s*(.+?)(?:\s*\((\d+)\s+tasks?\))?$/gim;
  const sections = splitIntoSections(markdown);
  for (const section of sections) {
    const headerMatch = waveHeaderRegex.exec(section.header);
    if (headerMatch) {
      const waveIndex = parseInt(headerMatch[1], 10);
      const label = headerMatch[2].trim();
      const tasks2 = parseTaskTable(section.content);
      waves2.push({
        waveIndex,
        label,
        tasks: tasks2
      });
    }
    waveHeaderRegex.lastIndex = 0;
  }
  return waves2.sort((a, b) => a.waveIndex - b.waveIndex);
}
function splitIntoSections(markdown) {
  const sections = [];
  const lines = markdown.split("\n");
  let currentHeader = "";
  let currentContent = [];
  for (const line of lines) {
    if (line.match(/^##\s+/)) {
      if (currentHeader) {
        sections.push({
          header: currentHeader,
          content: currentContent.join("\n")
        });
      }
      currentHeader = line;
      currentContent = [];
    } else {
      currentContent.push(line);
    }
  }
  if (currentHeader) {
    sections.push({
      header: currentHeader,
      content: currentContent.join("\n")
    });
  }
  return sections;
}
function parseTaskTable(tableContent) {
  const tasks2 = [];
  const lines = tableContent.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
  let headerIndex = -1;
  let separatorIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes("Task ID") || line.includes("Task Code")) {
      headerIndex = i;
    } else if (line.match(/^\|[\s\-:]+\|/)) {
      separatorIndex = i;
      break;
    }
  }
  if (headerIndex === -1 || separatorIndex === -1) {
    return tasks2;
  }
  const headerCells = parseTableRow(lines[headerIndex]);
  const columnMap = buildColumnMap(headerCells);
  for (let i = separatorIndex + 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.startsWith("|")) break;
    const cells = parseTableRow(line);
    if (cells.length === 0) continue;
    if (cells.length < headerCells.length) {
      continue;
    }
    const task = parseTaskRow(cells, columnMap);
    if (task && task.description.trim().length > 0) {
      tasks2.push(task);
    }
  }
  return tasks2;
}
function parseTableRow(line) {
  const cells = [];
  let current = "";
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === "\\" && line[i + 1] === "|") {
      current += "|";
      i++;
      continue;
    }
    if (char === "|") {
      cells.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  cells.push(current);
  return cells.slice(1, -1).map((cell) => cell.trim());
}
function buildColumnMap(headers) {
  const map = {
    taskId: -1,
    description: -1,
    files: -1,
    dependencies: -1,
    parallel: -1,
    model: -1,
    complexity: -1
  };
  for (let i = 0; i < headers.length; i++) {
    const header = headers[i].toLowerCase();
    if (header.includes("task id") || header.includes("task code")) {
      map.taskId = i;
    } else if (header.includes("description")) {
      map.description = i;
    } else if (header.includes("file")) {
      map.files = i;
    } else if (header.includes("depend")) {
      map.dependencies = i;
    } else if (header.includes("parallel")) {
      map.parallel = i;
    } else if (header.includes("model")) {
      map.model = i;
    } else if (header.includes("complex")) {
      map.complexity = i;
    }
  }
  return map;
}
function parseTaskRow(cells, columnMap) {
  if (columnMap.taskId === -1 || !cells[columnMap.taskId]) {
    return null;
  }
  const taskCode = cells[columnMap.taskId].trim();
  if (!taskCode.match(/^\d+\.\d+$/)) {
    return null;
  }
  const description = columnMap.description !== -1 ? cells[columnMap.description]?.trim() || "" : "";
  const filePaths = columnMap.files !== -1 ? parseFilePaths(cells[columnMap.files]) : [];
  const dependencies = columnMap.dependencies !== -1 ? parseDependencies(cells[columnMap.dependencies]) : [];
  const canRunInParallel = columnMap.parallel !== -1 ? parseBoolean(cells[columnMap.parallel]) : false;
  const recommendedModel = columnMap.model !== -1 ? normalizeModel(cells[columnMap.model]) : "sonnet";
  const complexity = columnMap.complexity !== -1 ? normalizeComplexity(cells[columnMap.complexity]) : "M";
  return {
    taskCode,
    description,
    filePaths,
    dependencies,
    canRunInParallel,
    recommendedModel,
    complexity
  };
}
function parseBoolean(value) {
  if (!value) return false;
  const normalized = value.toLowerCase().trim();
  return normalized === "yes" || normalized === "true" || normalized === "y" || normalized === "1" || normalized === "parallel";
}
function extractDependencyEdges(tasks2) {
  const edges = [];
  for (const task of tasks2) {
    for (const dep of task.dependencies) {
      edges.push({
        from: dep,
        to: task.taskCode,
        type: "hard"
      });
    }
  }
  return edges;
}
function parseCriticalPath(markdown) {
  const sections = splitIntoSections(markdown);
  for (const section of sections) {
    if (section.header.match(/^##\s+Critical\s+Path/i)) {
      const content = section.content.trim();
      if (content.includes("->")) {
        return content.split("->").map((s) => s.trim()).filter((s) => s.match(/^\d+\.\d+$/));
      }
      const lines = content.split("\n");
      const path = [];
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
function parseStatistics(markdown, totalTasksCalculated, totalWavesCalculated, criticalPathLengthCalculated) {
  const sections = splitIntoSections(markdown);
  let totalTasks = totalTasksCalculated;
  let totalWaves = totalWavesCalculated;
  let maxParallelism = 0;
  let criticalPathLength = criticalPathLengthCalculated;
  let sequentialChains = 0;
  for (const section of sections) {
    if (section.header.match(/^##\s+Statistics/i)) {
      const lines = section.content.split("\n");
      for (const line of lines) {
        const cells = parseTableRow(line);
        if (cells.length < 2) continue;
        const metric = cells[0].toLowerCase();
        const value = cells[1];
        if (metric.includes("total tasks")) {
          totalTasks = parseInt(value, 10) || totalTasks;
        } else if (metric.includes("total waves")) {
          totalWaves = parseInt(value, 10) || totalWaves;
        } else if (metric.includes("max parallelism")) {
          maxParallelism = parseInt(value, 10) || maxParallelism;
        } else if (metric.includes("critical path")) {
          criticalPathLength = parseInt(value, 10) || criticalPathLength;
        } else if (metric.includes("sequential chains")) {
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
    sequentialChains
  };
}
function extractAllTaskCodes(plan) {
  return plan.waves.flatMap((w) => w.tasks.map((t) => t.taskCode));
}
function findTaskByCode(plan, taskCode) {
  for (const wave of plan.waves) {
    const task = wave.tasks.find((t) => t.taskCode === taskCode);
    if (task) return task;
  }
  return void 0;
}
function getTasksInWave(plan, waveIndex) {
  const wave = plan.waves.find((w) => w.waveIndex === waveIndex);
  return wave?.tasks || [];
}

// src/wave-planner/dag-validator.ts
function validateDAG(tasks2, edges, config) {
  const errors = [];
  const warnings = [];
  if (tasks2.length === 0) {
    errors.push({
      code: "EMPTY_PLAN",
      message: "Wave plan contains no tasks",
      detail: "A valid wave plan must contain at least one task"
    });
    return {
      valid: false,
      errors,
      warnings
    };
  }
  const taskCodeCounts = /* @__PURE__ */ new Map();
  const duplicateTaskCodes = [];
  for (const task of tasks2) {
    const count = (taskCodeCounts.get(task.taskCode) || 0) + 1;
    taskCodeCounts.set(task.taskCode, count);
    if (count === 2) {
      duplicateTaskCodes.push(task.taskCode);
    }
  }
  if (duplicateTaskCodes.length > 0) {
    errors.push({
      code: "DUPLICATE_TASK_CODE",
      message: "Duplicate task codes detected",
      taskCodes: duplicateTaskCodes,
      detail: `Task codes must be unique. Found duplicates: ${duplicateTaskCodes.join(", ")}`
    });
  }
  const validTaskCodes = new Set(tasks2.map((t) => t.taskCode));
  const danglingDependencies = /* @__PURE__ */ new Map();
  for (const task of tasks2) {
    const missing = [];
    for (const dep of task.dependencies) {
      if (!validTaskCodes.has(dep)) {
        missing.push(dep);
      }
    }
    if (missing.length > 0) {
      danglingDependencies.set(task.taskCode, missing);
    }
  }
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
        code: "DANGLING_DEPENDENCY",
        message: `Task ${taskCode} references non-existent dependencies`,
        taskCodes: [taskCode],
        detail: `Missing dependencies: ${missingDeps.join(", ")}`
      });
    }
  }
  const graph = buildDAGGraph(tasks2, edges);
  const topoResult = topologicalSort(graph);
  if (!topoResult.valid && topoResult.cycleParticipants) {
    errors.push({
      code: "CYCLE_DETECTED",
      message: "Circular dependency detected in task graph",
      taskCodes: topoResult.cycleParticipants,
      detail: `The following tasks form a cycle: ${topoResult.cycleParticipants.join(" -> ")}`
    });
  }
  const rootTasks = tasks2.filter((t) => t.dependencies.length === 0);
  if (rootTasks.length === 0) {
    errors.push({
      code: "NO_ROOT_TASK",
      message: "No root tasks found (all tasks have dependencies)",
      detail: "At least one task must have no dependencies to serve as a starting point"
    });
  }
  const fileOverlapWarnings = checkFileOverlapInWaves(tasks2);
  warnings.push(...fileOverlapWarnings);
  const valid = errors.length === 0;
  return {
    valid,
    errors,
    warnings,
    // TODO: Implement auto-correction if config.enableAutoCorrection is true
    correctedPlan: void 0
  };
}
function checkFileOverlapInWaves(tasks2) {
  const warnings = [];
  const tasksByWave = groupBy(tasks2, (task) => extractWaveFromTaskCode(task.taskCode));
  for (const [waveIndex, waveTasks2] of tasksByWave) {
    const fileToTasks = /* @__PURE__ */ new Map();
    for (const task of waveTasks2) {
      for (const filePath of task.filePaths) {
        const existing = fileToTasks.get(filePath) || [];
        existing.push(task.taskCode);
        fileToTasks.set(filePath, existing);
      }
    }
    for (const [filePath, taskCodes] of fileToTasks) {
      if (taskCodes.length > 1) {
        warnings.push({
          code: "FILE_OVERLAP_SAME_WAVE",
          message: `Multiple tasks in wave ${waveIndex} modify the same file`,
          taskCodes,
          detail: `File "${filePath}" is modified by tasks: ${taskCodes.join(", ")}`
        });
      }
    }
  }
  return warnings;
}

// src/wave-planner/critical-path.ts
function computeCriticalPath(tasks2, edges) {
  if (tasks2.length === 0) {
    return {
      path: [],
      length: 0,
      annotations: /* @__PURE__ */ new Map()
    };
  }
  const graph = buildDAGGraph(tasks2, edges);
  const sortResult = topologicalSort(graph);
  if (!sortResult.valid) {
    const annotations2 = /* @__PURE__ */ new Map();
    for (const task of tasks2) {
      annotations2.set(task.taskCode, {
        taskCode: task.taskCode,
        isOnCriticalPath: false,
        distanceFromRoot: 0,
        distanceToEnd: 0,
        slack: 0
      });
    }
    return {
      path: [],
      length: 0,
      annotations: annotations2
    };
  }
  const order = sortResult.order;
  const distanceFromRoot = /* @__PURE__ */ new Map();
  const predecessor = /* @__PURE__ */ new Map();
  for (const taskCode of order) {
    const node = graph.get(taskCode);
    if (node.dependencies.size === 0) {
      distanceFromRoot.set(taskCode, 0);
      predecessor.set(taskCode, null);
    } else {
      let maxDist = -1;
      let maxPred = null;
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
  let maxDistance = -1;
  let terminalNode = null;
  for (const taskCode of order) {
    const dist = distanceFromRoot.get(taskCode);
    if (dist > maxDistance) {
      maxDistance = dist;
      terminalNode = taskCode;
    }
  }
  const path = [];
  let current = terminalNode;
  while (current !== null) {
    path.unshift(current);
    current = predecessor.get(current) ?? null;
  }
  const criticalPathLength = path.length;
  const distanceToEnd = /* @__PURE__ */ new Map();
  for (let i = order.length - 1; i >= 0; i--) {
    const taskCode = order[i];
    const node = graph.get(taskCode);
    if (node.dependents.size === 0) {
      distanceToEnd.set(taskCode, 0);
    } else {
      let maxDist = -1;
      for (const depCode of node.dependents) {
        const depDist = distanceToEnd.get(depCode) ?? 0;
        maxDist = Math.max(maxDist, depDist);
      }
      distanceToEnd.set(taskCode, maxDist + 1);
    }
  }
  const criticalPathSet = new Set(path);
  const annotations = /* @__PURE__ */ new Map();
  for (const task of tasks2) {
    const taskCode = task.taskCode;
    const distFromRoot = distanceFromRoot.get(taskCode) ?? 0;
    const distToEnd = distanceToEnd.get(taskCode) ?? 0;
    const slack = Math.max(0, criticalPathLength - 1 - (distFromRoot + distToEnd));
    annotations.set(taskCode, {
      taskCode,
      isOnCriticalPath: criticalPathSet.has(taskCode),
      distanceFromRoot: distFromRoot,
      distanceToEnd: distToEnd,
      slack
    });
  }
  return {
    path,
    length: criticalPathLength,
    annotations
  };
}

// src/wave-planner/wave-assigner.ts
function assignWaves(tasks2, edges, config) {
  if (tasks2.length === 0) {
    return {
      waves: [],
      totalWaves: 0,
      maxParallelism: 0,
      adjustments: []
    };
  }
  const graph = buildDAGGraph(tasks2, edges);
  const sortResult = topologicalSort(graph);
  if (!sortResult.valid) {
    throw new Error(
      `Cannot assign waves: cycle detected in dependency graph involving tasks: ${sortResult.cycleParticipants?.join(", ")}`
    );
  }
  const depths = computeWaveDepths(graph, sortResult.order);
  const tasksByDepth = groupTasksByDepth(tasks2, depths);
  const { wavesAfterConflicts, conflictAdjustments } = resolveFileConflicts(
    tasksByDepth
  );
  const { finalWaves, capacityAdjustments } = applyCapacityConstraints(
    wavesAfterConflicts,
    config?.maxTasksPerWave
  );
  const totalWaves = finalWaves.length;
  const maxParallelism = Math.max(
    ...finalWaves.map((w) => w.tasks.length),
    0
  );
  return {
    waves: finalWaves,
    totalWaves,
    maxParallelism,
    adjustments: [...conflictAdjustments, ...capacityAdjustments]
  };
}
function computeWaveDepths(graph, topologicalOrder) {
  const depths = /* @__PURE__ */ new Map();
  for (const taskCode of topologicalOrder) {
    depths.set(taskCode, 0);
  }
  for (const taskCode of topologicalOrder) {
    const node = graph.get(taskCode);
    let maxDepth = 0;
    for (const depTaskCode of node.dependencies) {
      const depDepth = depths.get(depTaskCode) || 0;
      maxDepth = Math.max(maxDepth, depDepth + 1);
    }
    depths.set(taskCode, maxDepth);
  }
  return depths;
}
function groupTasksByDepth(tasks2, depths) {
  const grouped = /* @__PURE__ */ new Map();
  for (const task of tasks2) {
    const depth = depths.get(task.taskCode) || 0;
    const existing = grouped.get(depth) || [];
    existing.push(task);
    grouped.set(depth, existing);
  }
  return grouped;
}
function resolveFileConflicts(tasksByDepth) {
  const adjustments = [];
  const result = /* @__PURE__ */ new Map();
  const depths = Array.from(tasksByDepth.keys()).sort((a, b) => a - b);
  for (const depth of depths) {
    const tasksAtDepth = tasksByDepth.get(depth) || [];
    const remainingTasks = [];
    const bumpedTasks = [];
    const claimedFiles = /* @__PURE__ */ new Set();
    for (const task of tasksAtDepth) {
      const hasConflict = task.filePaths.some((file) => claimedFiles.has(file));
      if (hasConflict) {
        bumpedTasks.push(task);
        const conflictingFiles2 = task.filePaths.filter(
          (file) => claimedFiles.has(file)
        );
        adjustments.push({
          type: "FILE_CONFLICT_BUMP",
          taskCode: task.taskCode,
          fromWave: depth,
          toWave: depth + 1,
          reason: `File conflict detected with files: ${conflictingFiles2.join(", ")}`
        });
      } else {
        remainingTasks.push(task);
        for (const file of task.filePaths) {
          claimedFiles.add(file);
        }
      }
    }
    if (remainingTasks.length > 0) {
      result.set(depth, remainingTasks);
    }
    if (bumpedTasks.length > 0) {
      const nextDepth = depth + 1;
      const existingAtNext = result.get(nextDepth) || [];
      result.set(nextDepth, [...existingAtNext, ...bumpedTasks]);
    }
  }
  return {
    wavesAfterConflicts: result,
    conflictAdjustments: adjustments
  };
}
function applyCapacityConstraints(tasksByDepth, maxTasksPerWave) {
  const adjustments = [];
  const waves2 = [];
  const depths = Array.from(tasksByDepth.keys()).sort((a, b) => a - b);
  for (const depth of depths) {
    const tasksAtDepth = tasksByDepth.get(depth) || [];
    if (!maxTasksPerWave || tasksAtDepth.length <= maxTasksPerWave) {
      waves2.push({
        waveIndex: waves2.length,
        label: generateWaveLabel(depth, tasksAtDepth),
        tasks: tasksAtDepth
      });
    } else {
      const subWaveCount = Math.ceil(tasksAtDepth.length / maxTasksPerWave);
      for (let subIndex = 0; subIndex < subWaveCount; subIndex++) {
        const startIdx = subIndex * maxTasksPerWave;
        const endIdx = Math.min(
          startIdx + maxTasksPerWave,
          tasksAtDepth.length
        );
        const subWaveTasks = tasksAtDepth.slice(startIdx, endIdx);
        waves2.push({
          waveIndex: waves2.length,
          label: generateWaveLabel(depth, subWaveTasks, subIndex),
          tasks: subWaveTasks
        });
        if (subIndex > 0) {
          for (const task of subWaveTasks) {
            adjustments.push({
              type: "CAPACITY_SPLIT",
              taskCode: task.taskCode,
              fromWave: depth,
              toWave: waves2.length - 1,
              reason: `Wave split due to capacity constraint (max ${maxTasksPerWave} tasks per wave)`
            });
          }
        }
      }
    }
  }
  return {
    finalWaves: waves2,
    capacityAdjustments: adjustments
  };
}

// src/wave-planner/plan-scorer.ts
function scorePlan(assignment, criticalPathLength, edges, tasks2) {
  const totalTasks = tasks2.length;
  if (totalTasks === 0) {
    return {
      parallelizationScore: 0,
      maxParallelism: 0,
      waveEfficiency: 0,
      dependencyDensity: 0,
      fileConflictScore: 1,
      confidenceSignals: {
        parallelization: "LOW",
        conflictRisk: "LOW"
      }
    };
  }
  const parallelizationScore = criticalPathLength > 0 ? 1 - criticalPathLength / totalTasks : 0;
  const maxParallelism = assignment.maxParallelism;
  const waveEfficiency = assignment.totalWaves > 0 ? totalTasks / assignment.totalWaves : 0;
  const maxPossibleEdges = totalTasks * (totalTasks - 1) / 2;
  const dependencyDensity = maxPossibleEdges > 0 ? edges.length / maxPossibleEdges : 0;
  const fileConflictScore = computeFileConflictScore(
    assignment,
    tasks2
  );
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
    confidenceSignals
  };
}
function computeFileConflictScore(assignment, tasks2) {
  const totalFileRefs = tasks2.reduce(
    (sum, task) => sum + task.filePaths.length,
    0
  );
  if (totalFileRefs === 0) {
    return 1;
  }
  const fileConflictAdjustments = assignment.adjustments.filter(
    (adj) => adj.type === "FILE_CONFLICT_BUMP"
  ).length;
  const conflictRatio = fileConflictAdjustments / totalFileRefs;
  const score = Math.max(0, 1 - conflictRatio);
  return score;
}
function computeConfidenceSignals(parallelizationScore, fileConflictScore) {
  let parallelization;
  if (parallelizationScore > 0.7) {
    parallelization = "HIGH";
  } else if (parallelizationScore > 0.4) {
    parallelization = "MEDIUM";
  } else {
    parallelization = "LOW";
  }
  let conflictRisk;
  if (fileConflictScore > 0.9) {
    conflictRisk = "LOW";
  } else if (fileConflictScore > 0.6) {
    conflictRisk = "MEDIUM";
  } else {
    conflictRisk = "HIGH";
  }
  return {
    parallelization,
    conflictRisk
  };
}

// src/wave-planner/models.ts
var DEFAULT_PLANNER_MODEL = "claude-opus-5";
var DEFAULT_WIKI_MODEL = "claude-sonnet-5";
function resolvePlannerModel(explicit) {
  return explicit || process.env.WAVE_PLANNER_MODEL || DEFAULT_PLANNER_MODEL;
}
function resolveWikiModel(explicit) {
  return explicit || process.env.WIKI_MODEL || DEFAULT_WIKI_MODEL;
}

// src/wave-planner/ai-client.ts
var import_sdk = __toESM(require("@anthropic-ai/sdk"));
var NON_RETRYABLE_STATUS = /* @__PURE__ */ new Set([400, 401, 403, 404, 405, 422]);
function dumpRawResponse(text8, model) {
  const dir = process.env.DEVPILOT_PLANNER_DUMP_DIR;
  if (!dir) return;
  try {
    const fs2 = require("fs");
    fs2.mkdirSync(dir, { recursive: true });
    const stamp = (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-");
    fs2.writeFileSync(
      `${dir}/planner-${stamp}.md`,
      `<!-- model: ${model} -->
${text8}`,
      { mode: 384 }
    );
  } catch {
  }
}
function isRetryable(error) {
  const status = error?.status;
  if (typeof status !== "number") return true;
  return !NON_RETRYABLE_STATUS.has(status);
}
var WavePlannerAIClient = class {
  constructor(config) {
    this.config = config;
    this.client = new import_sdk.default({
      apiKey: config.apiKey,
      timeout: config.timeout
    });
  }
  /**
   * Generate a wave plan by calling Claude API
   * @param prompt - The constructed prompt for wave planning
   * @returns Generation result with content and metadata
   */
  async generatePlan(prompt) {
    const startTime = Date.now();
    try {
      const response = await this.client.messages.create({
        model: this.config.model,
        max_tokens: this.config.maxTokens,
        messages: [
          {
            role: "user",
            content: prompt
          }
        ]
      });
      const durationMs = Date.now() - startTime;
      const textContent = response.content.filter((block) => block.type === "text").map((block) => "text" in block ? block.text : "").join("\n");
      dumpRawResponse(textContent, response.model);
      if (response.stop_reason === "max_tokens") {
        throw new Error(
          `Planner response hit the ${this.config.maxTokens}-token ceiling and was truncated mid-plan. Raise WAVE_PLANNER_MAX_TOKENS, or narrow the spec.`
        );
      }
      return {
        content: textContent,
        tokensInput: response.usage.input_tokens,
        tokensOutput: response.usage.output_tokens,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        durationMs,
        model: response.model
      };
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const wrapped = new Error(
        `Claude API call failed after ${durationMs}ms: ${error instanceof Error ? error.message : String(error)}`
      );
      const status = error?.status;
      if (typeof status === "number") {
        wrapped.status = status;
      }
      throw wrapped;
    }
  }
  /**
   * Generate a wave plan with retry logic and exponential backoff
   * @param prompt - The constructed prompt for wave planning
   * @param maxRetries - Maximum number of retry attempts (default: 3)
   * @returns Generation result with content and metadata
   */
  async generateWithRetry(prompt, maxRetries = 3) {
    let lastError;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await this.generatePlan(prompt);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (!isRetryable(error)) {
          throw lastError;
        }
        if (attempt === maxRetries) {
          break;
        }
        const delayMs = Math.pow(2, attempt) * 1e3;
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
    throw new Error(
      `Failed to generate plan after ${maxRetries + 1} attempts: ${lastError?.message || "Unknown error"}`
    );
  }
};

// src/wave-planner/fallback.ts
function createFlatPlan(tasks2) {
  if (tasks2.length === 0) {
    throw new Error("Cannot create flat plan from empty task list");
  }
  const flatTasks = tasks2.map((task, index2) => ({
    ...task,
    taskCode: `1.${index2 + 1}`,
    dependencies: [],
    // Clear all dependencies for flat plan
    canRunInParallel: true
    // All tasks can run in parallel
  }));
  const wave = {
    waveIndex: 1,
    label: "Wave 1",
    tasks: flatTasks
  };
  const criticalPath = [flatTasks[0].taskCode];
  const statistics = {
    totalTasks: flatTasks.length,
    totalWaves: 1,
    maxParallelism: flatTasks.length,
    // All tasks can run in parallel
    criticalPathLength: 1,
    // Only one task on critical path
    sequentialChains: 0
    // No sequential dependencies
  };
  return {
    waves: [wave],
    dependencyEdges: [],
    // No dependencies in flat plan
    criticalPath,
    statistics,
    rawMarkdown: "(Fallback flat plan - no markdown available)"
  };
}
function createFlatPlanFromDescriptions(descriptions) {
  if (descriptions.length === 0) {
    throw new Error("Cannot create flat plan from empty descriptions list");
  }
  const tasks2 = descriptions.map((description, index2) => ({
    taskCode: `1.${index2 + 1}`,
    description,
    filePaths: [],
    // No file paths available
    dependencies: [],
    canRunInParallel: true,
    recommendedModel: "sonnet",
    // Default to balanced model
    complexity: "M"
    // Default to medium complexity
  }));
  return createFlatPlan(tasks2);
}

// src/db/config.ts
var import_zod = require("zod");
var databaseConfigSchema = import_zod.z.object({
  type: import_zod.z.enum(["sqlite", "postgres"]).default("sqlite"),
  // SQLite options
  sqlitePath: import_zod.z.string().optional(),
  // Postgres options
  postgresUrl: import_zod.z.string().optional()
});
function getDatabaseConfig() {
  const type = process.env.DEVPILOT_DB_TYPE || "sqlite";
  return {
    type,
    sqlitePath: process.env.DEVPILOT_SQLITE_PATH || ".devpilot/data.db",
    postgresUrl: process.env.DATABASE_URL
  };
}

// src/db/adapters/sqlite.ts
var import_better_sqlite3 = __toESM(require("better-sqlite3"));
var import_better_sqlite32 = require("drizzle-orm/better-sqlite3");

// src/db/schema/index.ts
var schema_exports = {};
__export(schema_exports, {
  activityEvents: () => activityEvents,
  completedTasks: () => completedTasks,
  completedTasksRelations: () => completedTasksRelations,
  complexityValues: () => complexityValues,
  conductorScores: () => conductorScores,
  conductorScoresRelations: () => conductorScoresRelations,
  conflictingFiles: () => conflictingFiles,
  conflictingFilesRelations: () => conflictingFilesRelations,
  dependencyEdgeTypeValues: () => dependencyEdgeTypeValues,
  dependencyEdges: () => dependencyEdges,
  dependencyEdgesRelations: () => dependencyEdgesRelations,
  eventTypeValues: () => eventTypeValues,
  fileStatusValues: () => fileStatusValues,
  horizonItems: () => horizonItems,
  horizonItemsRelations: () => horizonItemsRelations,
  inFlightFiles: () => inFlightFiles,
  inFlightFilesRelations: () => inFlightFilesRelations,
  modelValues: () => modelValues,
  orchestratorModeValues: () => orchestratorModeValues,
  palaceClosets: () => palaceClosets,
  palaceClosetsRelations: () => palaceClosetsRelations,
  palaceDiary: () => palaceDiary,
  palaceDrawers: () => palaceDrawers,
  palaceDrawersRelations: () => palaceDrawersRelations,
  palaceHalls: () => palaceHalls,
  palaceKgTriples: () => palaceKgTriples,
  palaceRooms: () => palaceRooms,
  palaceRoomsRelations: () => palaceRoomsRelations,
  palaceTunnels: () => palaceTunnels,
  palaceWings: () => palaceWings,
  palaceWingsRelations: () => palaceWingsRelations,
  plans: () => plans,
  plansRelations: () => plansRelations,
  rufloSessions: () => rufloSessions,
  rufloSessionsRelations: () => rufloSessionsRelations,
  scoreHistory: () => scoreHistory,
  scoreHistoryRelations: () => scoreHistoryRelations,
  sessionStatusValues: () => sessionStatusValues,
  tasks: () => tasks,
  tasksRelations: () => tasksRelations,
  touchedFiles: () => touchedFiles,
  touchedFilesRelations: () => touchedFilesRelations,
  wavePlanMetrics: () => wavePlanMetrics,
  wavePlanMetricsRelations: () => wavePlanMetricsRelations,
  wavePlanStatusValues: () => wavePlanStatusValues,
  wavePlans: () => wavePlans,
  wavePlansRelations: () => wavePlansRelations,
  waveStatusValues: () => waveStatusValues,
  waveTaskStatusValues: () => waveTaskStatusValues,
  waveTasks: () => waveTasks,
  waveTasksRelations: () => waveTasksRelations,
  waves: () => waves,
  wavesRelations: () => wavesRelations,
  wikiArticleStatusValues: () => wikiArticleStatusValues,
  wikiArticles: () => wikiArticles,
  wikiArticlesRelations: () => wikiArticlesRelations,
  wikiLog: () => wikiLog,
  wikiLogActionValues: () => wikiLogActionValues,
  wikiLogRelations: () => wikiLogRelations,
  wikiSourceTypeValues: () => wikiSourceTypeValues,
  wikiSources: () => wikiSources,
  wikiSourcesRelations: () => wikiSourcesRelations,
  workstreams: () => workstreams,
  workstreamsRelations: () => workstreamsRelations,
  zoneValues: () => zoneValues
});

// src/db/schema/enums.ts
var zoneValues = ["READY", "REFINING", "SHAPING", "DIRECTIONAL"];
var complexityValues = ["S", "M", "L", "XL"];
var modelValues = ["HAIKU", "SONNET", "OPUS"];
var sessionStatusValues = ["ACTIVE", "NEEDS_SPEC", "COMPLETE", "ERROR"];
var fileStatusValues = ["AVAILABLE", "IN_FLIGHT", "RECENTLY_MODIFIED"];
var eventTypeValues = [
  "SESSION_PROGRESS",
  "SESSION_COMPLETE",
  "PLAN_GENERATED",
  "PLAN_APPROVED",
  "ITEM_CREATED",
  "ITEM_DISPATCHED",
  "RUNWAY_UPDATE",
  "FILE_UNLOCKED",
  "SCORE_UPDATE",
  // Wave Planner events
  "WAVE_PLAN_CREATED",
  "WAVE_DISPATCHING",
  "WAVE_TASK_DISPATCHED",
  "WAVE_TASK_COMPLETE",
  "WAVE_TASK_FAILED",
  "WAVE_COMPLETE",
  "WAVE_ADVANCE",
  "WAVE_PLAN_COMPLETE",
  "WAVE_PLAN_FAILED",
  "WAVE_PLAN_REOPTIMIZING"
];
var orchestratorModeValues = ["claude-session", "http", "ao-cli", "manual", "disabled"];
var wavePlanStatusValues = [
  "draft",
  "approved",
  "executing",
  "paused",
  "completed",
  "failed",
  "re-optimizing"
];
var waveStatusValues = [
  "pending",
  "dispatching",
  "active",
  "completed",
  "failed",
  "skipped"
];
var waveTaskStatusValues = [
  "pending",
  "dispatched",
  "running",
  "completed",
  "failed",
  "retrying",
  "skipped"
];
var dependencyEdgeTypeValues = ["hard", "soft"];
var wikiSourceTypeValues = [
  "session_log",
  "commit",
  "spec",
  "decision",
  "manual"
];
var wikiArticleStatusValues = ["active", "stale", "archived"];
var wikiLogActionValues = [
  "ingest",
  "compile",
  "query",
  "lint",
  "update"
];

// src/db/schema/horizon.ts
var import_sqlite_core = require("drizzle-orm/sqlite-core");
var import_drizzle_orm = require("drizzle-orm");
var import_cuid2 = require("@paralleldrive/cuid2");
var horizonItems = (0, import_sqlite_core.sqliteTable)("horizon_items", {
  /**
   * When this item was swept off the board.
   *
   * A timestamp rather than an ARCHIVED zone: `zone` is a CHECK constraint in
   * both sqlite and postgres, so widening it needs a coordinated migration —
   * and archiving is orthogonal to which column something sits in. An archived
   * item keeps its zone, which is what you want if you ever un-archive it.
   *
   * Null means live. Nothing auto-sets this; sweeping is something a person
   * does, because a board that quietly removes work is worse than a cluttered
   * one.
   */
  archivedAt: (0, import_sqlite_core.integer)("archived_at", { mode: "timestamp" }),
  id: (0, import_sqlite_core.text)("id").primaryKey().$defaultFn(() => (0, import_cuid2.createId)()),
  title: (0, import_sqlite_core.text)("title").notNull(),
  zone: (0, import_sqlite_core.text)("zone", { enum: zoneValues }).notNull().default("DIRECTIONAL"),
  repo: (0, import_sqlite_core.text)("repo").notNull(),
  complexity: (0, import_sqlite_core.text)("complexity", { enum: complexityValues }),
  priority: (0, import_sqlite_core.integer)("priority").notNull().default(0),
  linearTicketId: (0, import_sqlite_core.text)("linear_ticket_id"),
  createdAt: (0, import_sqlite_core.integer)("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => /* @__PURE__ */ new Date()),
  updatedAt: (0, import_sqlite_core.integer)("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => /* @__PURE__ */ new Date())
});
var horizonItemsRelations = (0, import_drizzle_orm.relations)(horizonItems, ({ one, many }) => ({
  plan: one(plans, {
    fields: [horizonItems.id],
    references: [plans.horizonItemId]
  }),
  conflictingFiles: many(inFlightFiles)
}));
var plans = (0, import_sqlite_core.sqliteTable)("plans", {
  id: (0, import_sqlite_core.text)("id").primaryKey().$defaultFn(() => (0, import_cuid2.createId)()),
  version: (0, import_sqlite_core.integer)("version").notNull().default(1),
  horizonItemId: (0, import_sqlite_core.text)("horizon_item_id").notNull().unique(),
  estimatedCostUsd: (0, import_sqlite_core.real)("estimated_cost_usd").notNull(),
  baselineCostUsd: (0, import_sqlite_core.real)("baseline_cost_usd").notNull(),
  acceptanceCriteria: (0, import_sqlite_core.text)("acceptance_criteria", { mode: "json" }).$type().notNull(),
  confidenceSignals: (0, import_sqlite_core.text)("confidence_signals", { mode: "json" }).$type().notNull(),
  fleetContextSnapshot: (0, import_sqlite_core.text)("fleet_context_snapshot", { mode: "json" }).$type().notNull(),
  memorySessionsUsed: (0, import_sqlite_core.text)("memory_sessions_used", { mode: "json" }).$type().default([]),
  previousPlanId: (0, import_sqlite_core.text)("previous_plan_id"),
  generatedAt: (0, import_sqlite_core.integer)("generated_at", { mode: "timestamp" }).notNull().$defaultFn(() => /* @__PURE__ */ new Date())
});
var plansRelations = (0, import_drizzle_orm.relations)(plans, ({ one, many }) => ({
  horizonItem: one(horizonItems, {
    fields: [plans.horizonItemId],
    references: [horizonItems.id]
  }),
  workstreams: many(workstreams),
  sequentialTasks: many(tasks, { relationName: "sequentialTasks" }),
  filesTouched: many(touchedFiles),
  previousPlan: one(plans, {
    fields: [plans.previousPlanId],
    references: [plans.id],
    relationName: "planHistory"
  })
}));
var workstreams = (0, import_sqlite_core.sqliteTable)("workstreams", {
  id: (0, import_sqlite_core.text)("id").primaryKey().$defaultFn(() => (0, import_cuid2.createId)()),
  planId: (0, import_sqlite_core.text)("plan_id").notNull(),
  label: (0, import_sqlite_core.text)("label").notNull(),
  repo: (0, import_sqlite_core.text)("repo").notNull(),
  workerCount: (0, import_sqlite_core.integer)("worker_count").notNull().default(1),
  orderIndex: (0, import_sqlite_core.integer)("order_index").notNull().default(0)
});
var workstreamsRelations = (0, import_drizzle_orm.relations)(workstreams, ({ one, many }) => ({
  plan: one(plans, {
    fields: [workstreams.planId],
    references: [plans.id]
  }),
  tasks: many(tasks)
}));
var tasks = (0, import_sqlite_core.sqliteTable)("tasks", {
  id: (0, import_sqlite_core.text)("id").primaryKey().$defaultFn(() => (0, import_cuid2.createId)()),
  label: (0, import_sqlite_core.text)("label").notNull(),
  model: (0, import_sqlite_core.text)("model", { enum: modelValues }).notNull().default("SONNET"),
  modelOverride: (0, import_sqlite_core.text)("model_override", { enum: modelValues }),
  complexity: (0, import_sqlite_core.text)("complexity", { enum: complexityValues }).notNull(),
  estimatedCostUsd: (0, import_sqlite_core.real)("estimated_cost_usd").notNull(),
  filePaths: (0, import_sqlite_core.text)("file_paths", { mode: "json" }).$type().notNull(),
  conflictWarning: (0, import_sqlite_core.text)("conflict_warning"),
  dependsOn: (0, import_sqlite_core.text)("depends_on", { mode: "json" }).$type().default([]),
  orderIndex: (0, import_sqlite_core.integer)("order_index").notNull().default(0),
  // Either belongs to a workstream OR is a sequential task on a plan
  workstreamId: (0, import_sqlite_core.text)("workstream_id"),
  planId: (0, import_sqlite_core.text)("plan_id")
});
var tasksRelations = (0, import_drizzle_orm.relations)(tasks, ({ one }) => ({
  workstream: one(workstreams, {
    fields: [tasks.workstreamId],
    references: [workstreams.id]
  }),
  plan: one(plans, {
    fields: [tasks.planId],
    references: [plans.id],
    relationName: "sequentialTasks"
  })
}));
var touchedFiles = (0, import_sqlite_core.sqliteTable)("touched_files", {
  id: (0, import_sqlite_core.text)("id").primaryKey().$defaultFn(() => (0, import_cuid2.createId)()),
  planId: (0, import_sqlite_core.text)("plan_id").notNull(),
  path: (0, import_sqlite_core.text)("path").notNull(),
  status: (0, import_sqlite_core.text)("status", { enum: fileStatusValues }).notNull().default("AVAILABLE"),
  inFlightVia: (0, import_sqlite_core.text)("in_flight_via")
});
var touchedFilesRelations = (0, import_drizzle_orm.relations)(touchedFiles, ({ one }) => ({
  plan: one(plans, {
    fields: [touchedFiles.planId],
    references: [plans.id]
  })
}));
var inFlightFiles = (0, import_sqlite_core.sqliteTable)("in_flight_files", {
  id: (0, import_sqlite_core.text)("id").primaryKey().$defaultFn(() => (0, import_cuid2.createId)()),
  path: (0, import_sqlite_core.text)("path").notNull(),
  activeSessionId: (0, import_sqlite_core.text)("active_session_id").notNull(),
  linearTicketId: (0, import_sqlite_core.text)("linear_ticket_id").notNull(),
  estimatedMinutesRemaining: (0, import_sqlite_core.integer)("estimated_minutes_remaining").notNull().default(30),
  horizonItemId: (0, import_sqlite_core.text)("horizon_item_id"),
  lockedAt: (0, import_sqlite_core.integer)("locked_at", { mode: "timestamp" }).notNull().$defaultFn(() => /* @__PURE__ */ new Date())
});
var inFlightFilesRelations = (0, import_drizzle_orm.relations)(inFlightFiles, ({ one }) => ({
  horizonItem: one(horizonItems, {
    fields: [inFlightFiles.horizonItemId],
    references: [horizonItems.id]
  })
}));
var conflictingFiles = (0, import_sqlite_core.sqliteTable)("conflicting_files", {
  id: (0, import_sqlite_core.text)("id").primaryKey().$defaultFn(() => (0, import_cuid2.createId)()),
  horizonItemId: (0, import_sqlite_core.text)("horizon_item_id").notNull(),
  path: (0, import_sqlite_core.text)("path").notNull(),
  blockedBySessionId: (0, import_sqlite_core.text)("blocked_by_session_id"),
  blockedByTicketId: (0, import_sqlite_core.text)("blocked_by_ticket_id"),
  estimatedUnlockMinutes: (0, import_sqlite_core.integer)("estimated_unlock_minutes")
});
var conflictingFilesRelations = (0, import_drizzle_orm.relations)(conflictingFiles, ({ one }) => ({
  horizonItem: one(horizonItems, {
    fields: [conflictingFiles.horizonItemId],
    references: [horizonItems.id]
  })
}));

// src/db/schema/fleet.ts
var import_sqlite_core2 = require("drizzle-orm/sqlite-core");
var import_drizzle_orm2 = require("drizzle-orm");
var import_cuid22 = require("@paralleldrive/cuid2");
var rufloSessions = (0, import_sqlite_core2.sqliteTable)("ruflo_sessions", {
  id: (0, import_sqlite_core2.text)("id").primaryKey().$defaultFn(() => (0, import_cuid22.createId)()),
  repo: (0, import_sqlite_core2.text)("repo").notNull(),
  linearTicketId: (0, import_sqlite_core2.text)("linear_ticket_id").notNull(),
  ticketTitle: (0, import_sqlite_core2.text)("ticket_title").notNull(),
  currentWorkstream: (0, import_sqlite_core2.text)("current_workstream").notNull().default("Main"),
  progressPercent: (0, import_sqlite_core2.integer)("progress_percent").notNull().default(0),
  elapsedMinutes: (0, import_sqlite_core2.integer)("elapsed_minutes").notNull().default(0),
  estimatedRemainingMinutes: (0, import_sqlite_core2.integer)("estimated_remaining_minutes").notNull().default(30),
  status: (0, import_sqlite_core2.text)("status", { enum: sessionStatusValues }).notNull().default("ACTIVE"),
  inFlightFiles: (0, import_sqlite_core2.text)("in_flight_files", { mode: "json" }).$type().default([]),
  prUrl: (0, import_sqlite_core2.text)("pr_url"),
  // External orchestrator tracking
  externalSessionId: (0, import_sqlite_core2.text)("external_session_id"),
  orchestratorMode: (0, import_sqlite_core2.text)("orchestrator_mode", { enum: orchestratorModeValues }),
  tokensUsed: (0, import_sqlite_core2.integer)("tokens_used"),
  costUsd: (0, import_sqlite_core2.integer)("cost_usd"),
  /**
   * What the agent is doing right now, as reported by the session runner.
   *
   * The fleet used to know only that a session existed and a percentage that
   * was a timer in disguise. This carries the live picture — tool calls, files
   * touched, cost so far, idle time — so the cockpit can show an instrument
   * instead of a placebo. JSON because the shape belongs to the runner and the
   * cockpit only renders it.
   */
  telemetry: (0, import_sqlite_core2.text)("telemetry", { mode: "json" }).$type(),
  createdAt: (0, import_sqlite_core2.integer)("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => /* @__PURE__ */ new Date()),
  updatedAt: (0, import_sqlite_core2.integer)("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => /* @__PURE__ */ new Date())
});
var rufloSessionsRelations = (0, import_drizzle_orm2.relations)(rufloSessions, ({ many }) => ({
  completedTasks: many(completedTasks)
}));
var completedTasks = (0, import_sqlite_core2.sqliteTable)("completed_tasks", {
  id: (0, import_sqlite_core2.text)("id").primaryKey().$defaultFn(() => (0, import_cuid22.createId)()),
  sessionId: (0, import_sqlite_core2.text)("session_id").notNull(),
  label: (0, import_sqlite_core2.text)("label").notNull(),
  model: (0, import_sqlite_core2.text)("model", { enum: modelValues }),
  durationMinutes: (0, import_sqlite_core2.integer)("duration_minutes"),
  completedAt: (0, import_sqlite_core2.integer)("completed_at", { mode: "timestamp" }).notNull().$defaultFn(() => /* @__PURE__ */ new Date())
});
var completedTasksRelations = (0, import_drizzle_orm2.relations)(completedTasks, ({ one }) => ({
  session: one(rufloSessions, {
    fields: [completedTasks.sessionId],
    references: [rufloSessions.id]
  })
}));

// src/db/schema/score.ts
var import_sqlite_core3 = require("drizzle-orm/sqlite-core");
var import_drizzle_orm3 = require("drizzle-orm");
var import_cuid23 = require("@paralleldrive/cuid2");
var conductorScores = (0, import_sqlite_core3.sqliteTable)("conductor_scores", {
  id: (0, import_sqlite_core3.text)("id").primaryKey().$defaultFn(() => (0, import_cuid23.createId)()),
  userId: (0, import_sqlite_core3.text)("user_id").notNull().unique(),
  total: (0, import_sqlite_core3.integer)("total").notNull().default(500),
  fleetUtilization: (0, import_sqlite_core3.integer)("fleet_utilization").notNull().default(100),
  runwayHealth: (0, import_sqlite_core3.integer)("runway_health").notNull().default(100),
  planAccuracy: (0, import_sqlite_core3.integer)("plan_accuracy").notNull().default(100),
  costEfficiency: (0, import_sqlite_core3.integer)("cost_efficiency").notNull().default(100),
  velocityTrend: (0, import_sqlite_core3.integer)("velocity_trend").notNull().default(100),
  leaderboardRank: (0, import_sqlite_core3.integer)("leaderboard_rank"),
  createdAt: (0, import_sqlite_core3.integer)("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => /* @__PURE__ */ new Date()),
  updatedAt: (0, import_sqlite_core3.integer)("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => /* @__PURE__ */ new Date())
});
var conductorScoresRelations = (0, import_drizzle_orm3.relations)(conductorScores, ({ many }) => ({
  history: many(scoreHistory)
}));
var scoreHistory = (0, import_sqlite_core3.sqliteTable)("score_history", {
  id: (0, import_sqlite_core3.text)("id").primaryKey().$defaultFn(() => (0, import_cuid23.createId)()),
  scoreId: (0, import_sqlite_core3.text)("score_id").notNull(),
  total: (0, import_sqlite_core3.integer)("total").notNull(),
  fleetUtilization: (0, import_sqlite_core3.integer)("fleet_utilization").notNull(),
  runwayHealth: (0, import_sqlite_core3.integer)("runway_health").notNull(),
  planAccuracy: (0, import_sqlite_core3.integer)("plan_accuracy").notNull(),
  costEfficiency: (0, import_sqlite_core3.integer)("cost_efficiency").notNull(),
  velocityTrend: (0, import_sqlite_core3.integer)("velocity_trend").notNull(),
  recordedAt: (0, import_sqlite_core3.integer)("recorded_at", { mode: "timestamp" }).notNull().$defaultFn(() => /* @__PURE__ */ new Date())
});
var scoreHistoryRelations = (0, import_drizzle_orm3.relations)(scoreHistory, ({ one }) => ({
  score: one(conductorScores, {
    fields: [scoreHistory.scoreId],
    references: [conductorScores.id]
  })
}));

// src/db/schema/events.ts
var import_sqlite_core4 = require("drizzle-orm/sqlite-core");
var import_cuid24 = require("@paralleldrive/cuid2");
var activityEvents = (0, import_sqlite_core4.sqliteTable)("activity_events", {
  id: (0, import_sqlite_core4.text)("id").primaryKey().$defaultFn(() => (0, import_cuid24.createId)()),
  type: (0, import_sqlite_core4.text)("type", { enum: eventTypeValues }).notNull(),
  message: (0, import_sqlite_core4.text)("message").notNull(),
  repo: (0, import_sqlite_core4.text)("repo"),
  ticketId: (0, import_sqlite_core4.text)("ticket_id"),
  metadata: (0, import_sqlite_core4.text)("metadata", { mode: "json" }).$type(),
  createdAt: (0, import_sqlite_core4.integer)("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => /* @__PURE__ */ new Date())
});

// src/db/schema/wave-planner.ts
var import_sqlite_core5 = require("drizzle-orm/sqlite-core");
var import_drizzle_orm4 = require("drizzle-orm");
var import_cuid25 = require("@paralleldrive/cuid2");
var wavePlans = (0, import_sqlite_core5.sqliteTable)("wave_plans", {
  id: (0, import_sqlite_core5.text)("id").primaryKey().$defaultFn(() => (0, import_cuid25.createId)()),
  planId: (0, import_sqlite_core5.text)("plan_id").notNull(),
  horizonItemId: (0, import_sqlite_core5.text)("horizon_item_id").notNull(),
  totalWaves: (0, import_sqlite_core5.integer)("total_waves").notNull(),
  totalTasks: (0, import_sqlite_core5.integer)("total_tasks").notNull(),
  maxParallelism: (0, import_sqlite_core5.integer)("max_parallelism").notNull(),
  criticalPath: (0, import_sqlite_core5.text)("critical_path", { mode: "json" }).$type().notNull(),
  criticalPathLength: (0, import_sqlite_core5.integer)("critical_path_length").notNull(),
  parallelizationScore: (0, import_sqlite_core5.real)("parallelization_score").notNull(),
  status: (0, import_sqlite_core5.text)("status", { enum: wavePlanStatusValues }).notNull().default("draft"),
  currentWaveIndex: (0, import_sqlite_core5.integer)("current_wave_index").notNull().default(0),
  version: (0, import_sqlite_core5.integer)("version").notNull().default(1),
  previousWavePlanId: (0, import_sqlite_core5.text)("previous_wave_plan_id"),
  rawMarkdown: (0, import_sqlite_core5.text)("raw_markdown"),
  startedAt: (0, import_sqlite_core5.integer)("started_at", { mode: "timestamp" }),
  completedAt: (0, import_sqlite_core5.integer)("completed_at", { mode: "timestamp" }),
  createdAt: (0, import_sqlite_core5.integer)("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => /* @__PURE__ */ new Date()),
  updatedAt: (0, import_sqlite_core5.integer)("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => /* @__PURE__ */ new Date())
});
var wavePlansRelations = (0, import_drizzle_orm4.relations)(wavePlans, ({ one, many }) => ({
  plan: one(plans, {
    fields: [wavePlans.planId],
    references: [plans.id]
  }),
  horizonItem: one(horizonItems, {
    fields: [wavePlans.horizonItemId],
    references: [horizonItems.id]
  }),
  previousWavePlan: one(wavePlans, {
    fields: [wavePlans.previousWavePlanId],
    references: [wavePlans.id],
    relationName: "wavePlanHistory"
  }),
  waves: many(waves),
  waveTasks: many(waveTasks),
  dependencyEdges: many(dependencyEdges),
  metrics: one(wavePlanMetrics, {
    fields: [wavePlans.id],
    references: [wavePlanMetrics.wavePlanId]
  })
}));
var waves = (0, import_sqlite_core5.sqliteTable)("waves", {
  id: (0, import_sqlite_core5.text)("id").primaryKey().$defaultFn(() => (0, import_cuid25.createId)()),
  wavePlanId: (0, import_sqlite_core5.text)("wave_plan_id").notNull(),
  waveIndex: (0, import_sqlite_core5.integer)("wave_index").notNull(),
  label: (0, import_sqlite_core5.text)("label").notNull(),
  maxParallelTasks: (0, import_sqlite_core5.integer)("max_parallel_tasks").notNull(),
  status: (0, import_sqlite_core5.text)("status", { enum: waveStatusValues }).notNull().default("pending"),
  startedAt: (0, import_sqlite_core5.integer)("started_at", { mode: "timestamp" }),
  completedAt: (0, import_sqlite_core5.integer)("completed_at", { mode: "timestamp" })
});
var wavesRelations = (0, import_drizzle_orm4.relations)(waves, ({ one, many }) => ({
  wavePlan: one(wavePlans, {
    fields: [waves.wavePlanId],
    references: [wavePlans.id]
  }),
  tasks: many(waveTasks)
}));
var waveTasks = (0, import_sqlite_core5.sqliteTable)("wave_tasks", {
  id: (0, import_sqlite_core5.text)("id").primaryKey().$defaultFn(() => (0, import_cuid25.createId)()),
  waveId: (0, import_sqlite_core5.text)("wave_id").notNull(),
  wavePlanId: (0, import_sqlite_core5.text)("wave_plan_id").notNull(),
  taskId: (0, import_sqlite_core5.text)("task_id"),
  // FK to existing tasks table (nullable)
  waveIndex: (0, import_sqlite_core5.integer)("wave_index").notNull(),
  taskCode: (0, import_sqlite_core5.text)("task_code").notNull(),
  // e.g., "1.1", "4.3"
  label: (0, import_sqlite_core5.text)("label").notNull(),
  description: (0, import_sqlite_core5.text)("description").notNull().default(""),
  filePaths: (0, import_sqlite_core5.text)("file_paths", { mode: "json" }).$type().notNull().default([]),
  dependencies: (0, import_sqlite_core5.text)("dependencies", { mode: "json" }).$type().notNull().default([]),
  recommendedModel: (0, import_sqlite_core5.text)("recommended_model", { enum: modelValues }),
  complexity: (0, import_sqlite_core5.text)("complexity", { enum: complexityValues }),
  isOnCriticalPath: (0, import_sqlite_core5.integer)("is_on_critical_path", { mode: "boolean" }).notNull().default(false),
  canRunInParallel: (0, import_sqlite_core5.integer)("can_run_in_parallel", { mode: "boolean" }).notNull().default(true),
  status: (0, import_sqlite_core5.text)("status", { enum: waveTaskStatusValues }).notNull().default("pending"),
  assignedSessionId: (0, import_sqlite_core5.text)("assigned_session_id"),
  startedAt: (0, import_sqlite_core5.integer)("started_at", { mode: "timestamp" }),
  completedAt: (0, import_sqlite_core5.integer)("completed_at", { mode: "timestamp" }),
  errorMessage: (0, import_sqlite_core5.text)("error_message"),
  completionSummary: (0, import_sqlite_core5.text)("completion_summary"),
  retryCount: (0, import_sqlite_core5.integer)("retry_count").notNull().default(0)
});
var waveTasksRelations = (0, import_drizzle_orm4.relations)(waveTasks, ({ one }) => ({
  wave: one(waves, {
    fields: [waveTasks.waveId],
    references: [waves.id]
  }),
  wavePlan: one(wavePlans, {
    fields: [waveTasks.wavePlanId],
    references: [wavePlans.id]
  }),
  task: one(tasks, {
    fields: [waveTasks.taskId],
    references: [tasks.id]
  })
}));
var dependencyEdges = (0, import_sqlite_core5.sqliteTable)("dependency_edges", {
  id: (0, import_sqlite_core5.text)("id").primaryKey().$defaultFn(() => (0, import_cuid25.createId)()),
  wavePlanId: (0, import_sqlite_core5.text)("wave_plan_id").notNull(),
  fromTaskCode: (0, import_sqlite_core5.text)("from_task_code").notNull(),
  toTaskCode: (0, import_sqlite_core5.text)("to_task_code").notNull(),
  edgeType: (0, import_sqlite_core5.text)("edge_type", { enum: dependencyEdgeTypeValues }).notNull().default("hard")
});
var dependencyEdgesRelations = (0, import_drizzle_orm4.relations)(dependencyEdges, ({ one }) => ({
  wavePlan: one(wavePlans, {
    fields: [dependencyEdges.wavePlanId],
    references: [wavePlans.id]
  })
}));
var wavePlanMetrics = (0, import_sqlite_core5.sqliteTable)("wave_plan_metrics", {
  id: (0, import_sqlite_core5.text)("id").primaryKey().$defaultFn(() => (0, import_cuid25.createId)()),
  wavePlanId: (0, import_sqlite_core5.text)("wave_plan_id").notNull().unique(),
  totalWallClockMs: (0, import_sqlite_core5.integer)("total_wall_clock_ms"),
  theoreticalMinMs: (0, import_sqlite_core5.integer)("theoretical_min_ms"),
  parallelizationEfficiency: (0, import_sqlite_core5.real)("parallelization_efficiency"),
  wavesExecuted: (0, import_sqlite_core5.integer)("waves_executed").notNull().default(0),
  tasksCompleted: (0, import_sqlite_core5.integer)("tasks_completed").notNull().default(0),
  tasksFailed: (0, import_sqlite_core5.integer)("tasks_failed").notNull().default(0),
  tasksRetried: (0, import_sqlite_core5.integer)("tasks_retried").notNull().default(0),
  avgTaskDurationMs: (0, import_sqlite_core5.integer)("avg_task_duration_ms"),
  maxWaveWaitMs: (0, import_sqlite_core5.integer)("max_wave_wait_ms"),
  fileConflictsAvoided: (0, import_sqlite_core5.integer)("file_conflicts_avoided").notNull().default(0),
  reOptimizationCount: (0, import_sqlite_core5.integer)("re_optimization_count").notNull().default(0),
  recordedAt: (0, import_sqlite_core5.integer)("recorded_at", { mode: "timestamp" }).notNull().$defaultFn(() => /* @__PURE__ */ new Date())
});
var wavePlanMetricsRelations = (0, import_drizzle_orm4.relations)(wavePlanMetrics, ({ one }) => ({
  wavePlan: one(wavePlans, {
    fields: [wavePlanMetrics.wavePlanId],
    references: [wavePlans.id]
  })
}));

// src/db/schema/wiki.ts
var import_sqlite_core6 = require("drizzle-orm/sqlite-core");
var import_drizzle_orm5 = require("drizzle-orm");
var import_cuid26 = require("@paralleldrive/cuid2");
var wikiSources = (0, import_sqlite_core6.sqliteTable)("wiki_sources", {
  id: (0, import_sqlite_core6.text)("id").primaryKey().$defaultFn(() => (0, import_cuid26.createId)()),
  /** Source type: session_log, commit, spec, decision, manual */
  sourceType: (0, import_sqlite_core6.text)("source_type", { enum: wikiSourceTypeValues }).notNull(),
  /** Human-readable title */
  title: (0, import_sqlite_core6.text)("title").notNull(),
  /** Raw content of the source material */
  content: (0, import_sqlite_core6.text)("content").notNull(),
  /** Origin identifier (e.g. session ID, commit SHA, file path) */
  origin: (0, import_sqlite_core6.text)("origin"),
  /** Repository this source belongs to */
  repo: (0, import_sqlite_core6.text)("repo"),
  /** Hash of content for deduplication */
  contentHash: (0, import_sqlite_core6.text)("content_hash").notNull(),
  createdAt: (0, import_sqlite_core6.integer)("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => /* @__PURE__ */ new Date())
});
var wikiArticles = (0, import_sqlite_core6.sqliteTable)("wiki_articles", {
  id: (0, import_sqlite_core6.text)("id").primaryKey().$defaultFn(() => (0, import_cuid26.createId)()),
  /** URL-safe slug for the article (e.g. "authentication-flow") */
  slug: (0, import_sqlite_core6.text)("slug").notNull().unique(),
  /** Article title */
  title: (0, import_sqlite_core6.text)("title").notNull(),
  /** Category for organization (e.g. "architecture", "patterns", "decisions") */
  category: (0, import_sqlite_core6.text)("category").notNull(),
  /** Compiled markdown content with backlinks */
  content: (0, import_sqlite_core6.text)("content").notNull(),
  /** Status: active, stale, archived */
  status: (0, import_sqlite_core6.text)("status", { enum: wikiArticleStatusValues }).notNull().default("active"),
  /** Backlinks — slugs of related articles */
  backlinks: (0, import_sqlite_core6.text)("backlinks", { mode: "json" }).$type().default([]),
  /** Source IDs that contributed to this article */
  sourceIds: (0, import_sqlite_core6.text)("source_ids", { mode: "json" }).$type().default([]),
  /** Repository this article belongs to */
  repo: (0, import_sqlite_core6.text)("repo"),
  /** Version counter — incremented on each recompile */
  version: (0, import_sqlite_core6.integer)("version").notNull().default(1),
  createdAt: (0, import_sqlite_core6.integer)("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => /* @__PURE__ */ new Date()),
  updatedAt: (0, import_sqlite_core6.integer)("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => /* @__PURE__ */ new Date())
});
var wikiLog = (0, import_sqlite_core6.sqliteTable)("wiki_log", {
  id: (0, import_sqlite_core6.text)("id").primaryKey().$defaultFn(() => (0, import_cuid26.createId)()),
  /** Action type: ingest, compile, query, lint, update */
  action: (0, import_sqlite_core6.text)("action", { enum: wikiLogActionValues }).notNull(),
  /** Summary of what happened */
  summary: (0, import_sqlite_core6.text)("summary").notNull(),
  /** IDs of articles affected */
  articleIds: (0, import_sqlite_core6.text)("article_ids", { mode: "json" }).$type().default([]),
  /** IDs of sources involved */
  sourceIds: (0, import_sqlite_core6.text)("source_ids", { mode: "json" }).$type().default([]),
  /** Repository context */
  repo: (0, import_sqlite_core6.text)("repo"),
  /** Token usage for this operation */
  tokensUsed: (0, import_sqlite_core6.integer)("tokens_used"),
  createdAt: (0, import_sqlite_core6.integer)("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => /* @__PURE__ */ new Date())
});
var wikiSourcesRelations = (0, import_drizzle_orm5.relations)(wikiSources, ({ many }) => ({}));
var wikiArticlesRelations = (0, import_drizzle_orm5.relations)(wikiArticles, ({ many }) => ({}));
var wikiLogRelations = (0, import_drizzle_orm5.relations)(wikiLog, ({ many }) => ({}));

// src/db/schema/mempalace.ts
var import_sqlite_core7 = require("drizzle-orm/sqlite-core");
var import_drizzle_orm6 = require("drizzle-orm");
var import_cuid27 = require("@paralleldrive/cuid2");
var palaceWings = (0, import_sqlite_core7.sqliteTable)("palace_wings", {
  id: (0, import_sqlite_core7.text)("id").primaryKey().$defaultFn(() => (0, import_cuid27.createId)()),
  /** Wing slug, e.g. "devpilot-core" or "persona-architect" */
  slug: (0, import_sqlite_core7.text)("slug").notNull().unique(),
  /** Human-readable wing name */
  name: (0, import_sqlite_core7.text)("name").notNull(),
  /** Wing type: project | persona | scratch */
  wingType: (0, import_sqlite_core7.text)("wing_type").notNull().default("project"),
  /** Repository this wing is bound to, if any */
  repo: (0, import_sqlite_core7.text)("repo"),
  /** Free-form description */
  description: (0, import_sqlite_core7.text)("description"),
  createdAt: (0, import_sqlite_core7.integer)("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => /* @__PURE__ */ new Date()),
  updatedAt: (0, import_sqlite_core7.integer)("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => /* @__PURE__ */ new Date())
});
var palaceRooms = (0, import_sqlite_core7.sqliteTable)(
  "palace_rooms",
  {
    id: (0, import_sqlite_core7.text)("id").primaryKey().$defaultFn(() => (0, import_cuid27.createId)()),
    wingId: (0, import_sqlite_core7.text)("wing_id").notNull().references(() => palaceWings.id, { onDelete: "cascade" }),
    /** Room slug, unique within a wing, e.g. "auth-flow" */
    slug: (0, import_sqlite_core7.text)("slug").notNull(),
    /** Human-readable room name */
    name: (0, import_sqlite_core7.text)("name").notNull(),
    /** Topic label for routing retrieval */
    topic: (0, import_sqlite_core7.text)("topic").notNull(),
    /** Free-form description of what belongs in this room */
    description: (0, import_sqlite_core7.text)("description"),
    createdAt: (0, import_sqlite_core7.integer)("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => /* @__PURE__ */ new Date()),
    updatedAt: (0, import_sqlite_core7.integer)("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => /* @__PURE__ */ new Date())
  },
  (table) => ({
    wingSlugIdx: (0, import_sqlite_core7.index)("palace_rooms_wing_slug_idx").on(table.wingId, table.slug)
  })
);
var palaceDrawers = (0, import_sqlite_core7.sqliteTable)(
  "palace_drawers",
  {
    id: (0, import_sqlite_core7.text)("id").primaryKey().$defaultFn(() => (0, import_cuid27.createId)()),
    roomId: (0, import_sqlite_core7.text)("room_id").notNull().references(() => palaceRooms.id, { onDelete: "cascade" }),
    /** Memory type: fact | event | discovery | preference | advice | decision */
    memoryType: (0, import_sqlite_core7.text)("memory_type").notNull().default("fact"),
    /** Short label for the drawer */
    label: (0, import_sqlite_core7.text)("label").notNull(),
    /** Verbatim content — never summarized */
    content: (0, import_sqlite_core7.text)("content").notNull(),
    /** Optional AAAK-compressed form (populated when the MCP server is used) */
    aaakContent: (0, import_sqlite_core7.text)("aaak_content"),
    /** SHA256 of content for deduplication */
    contentHash: (0, import_sqlite_core7.text)("content_hash").notNull(),
    /** Source provenance — e.g. wiki article slug, session id, commit sha */
    sourceKind: (0, import_sqlite_core7.text)("source_kind"),
    sourceRef: (0, import_sqlite_core7.text)("source_ref"),
    /** Free-form tags for filtering */
    tags: (0, import_sqlite_core7.text)("tags", { mode: "json" }).$type().default([]),
    /** Rough salience score 0-1 controlling L0/L1 eligibility */
    salience: (0, import_sqlite_core7.integer)("salience").notNull().default(0),
    createdAt: (0, import_sqlite_core7.integer)("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => /* @__PURE__ */ new Date())
  },
  (table) => ({
    hashIdx: (0, import_sqlite_core7.index)("palace_drawers_hash_idx").on(table.contentHash),
    roomIdx: (0, import_sqlite_core7.index)("palace_drawers_room_idx").on(table.roomId)
  })
);
var palaceClosets = (0, import_sqlite_core7.sqliteTable)(
  "palace_closets",
  {
    id: (0, import_sqlite_core7.text)("id").primaryKey().$defaultFn(() => (0, import_cuid27.createId)()),
    roomId: (0, import_sqlite_core7.text)("room_id").notNull().references(() => palaceRooms.id, { onDelete: "cascade" }),
    /** Compressed summary (AAAK-dialect or plain) */
    summary: (0, import_sqlite_core7.text)("summary").notNull(),
    /** Which drawers this closet summarizes */
    drawerIds: (0, import_sqlite_core7.text)("drawer_ids", { mode: "json" }).$type().default([]),
    /** Tier — 0 (identity), 1 (critical), 2 (room), 3 (deep) */
    tier: (0, import_sqlite_core7.integer)("tier").notNull().default(2),
    /** Approximate token cost when injected */
    tokenCost: (0, import_sqlite_core7.integer)("token_cost").notNull().default(0),
    createdAt: (0, import_sqlite_core7.integer)("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => /* @__PURE__ */ new Date()),
    updatedAt: (0, import_sqlite_core7.integer)("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => /* @__PURE__ */ new Date())
  },
  (table) => ({
    tierIdx: (0, import_sqlite_core7.index)("palace_closets_tier_idx").on(table.tier)
  })
);
var palaceHalls = (0, import_sqlite_core7.sqliteTable)("palace_halls", {
  id: (0, import_sqlite_core7.text)("id").primaryKey().$defaultFn(() => (0, import_cuid27.createId)()),
  wingId: (0, import_sqlite_core7.text)("wing_id").notNull().references(() => palaceWings.id, { onDelete: "cascade" }),
  fromRoomId: (0, import_sqlite_core7.text)("from_room_id").notNull().references(() => palaceRooms.id, { onDelete: "cascade" }),
  toRoomId: (0, import_sqlite_core7.text)("to_room_id").notNull().references(() => palaceRooms.id, { onDelete: "cascade" }),
  /** Relationship type: depends_on | related_to | supersedes | contradicts */
  relation: (0, import_sqlite_core7.text)("relation").notNull().default("related_to"),
  weight: (0, import_sqlite_core7.integer)("weight").notNull().default(1),
  createdAt: (0, import_sqlite_core7.integer)("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => /* @__PURE__ */ new Date())
});
var palaceTunnels = (0, import_sqlite_core7.sqliteTable)("palace_tunnels", {
  id: (0, import_sqlite_core7.text)("id").primaryKey().$defaultFn(() => (0, import_cuid27.createId)()),
  fromRoomId: (0, import_sqlite_core7.text)("from_room_id").notNull().references(() => palaceRooms.id, { onDelete: "cascade" }),
  toRoomId: (0, import_sqlite_core7.text)("to_room_id").notNull().references(() => palaceRooms.id, { onDelete: "cascade" }),
  reason: (0, import_sqlite_core7.text)("reason"),
  createdAt: (0, import_sqlite_core7.integer)("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => /* @__PURE__ */ new Date())
});
var palaceKgTriples = (0, import_sqlite_core7.sqliteTable)(
  "palace_kg_triples",
  {
    id: (0, import_sqlite_core7.text)("id").primaryKey().$defaultFn(() => (0, import_cuid27.createId)()),
    wingId: (0, import_sqlite_core7.text)("wing_id").notNull().references(() => palaceWings.id, { onDelete: "cascade" }),
    subject: (0, import_sqlite_core7.text)("subject").notNull(),
    predicate: (0, import_sqlite_core7.text)("predicate").notNull(),
    object: (0, import_sqlite_core7.text)("object").notNull(),
    /** Validity window start — when this fact became true */
    validFrom: (0, import_sqlite_core7.integer)("valid_from", { mode: "timestamp" }).notNull().$defaultFn(() => /* @__PURE__ */ new Date()),
    /** Validity window end — null if still valid */
    validUntil: (0, import_sqlite_core7.integer)("valid_until", { mode: "timestamp" }),
    /** Source drawer that asserted this fact */
    sourceDrawerId: (0, import_sqlite_core7.text)("source_drawer_id"),
    /** Confidence 0-100 */
    confidence: (0, import_sqlite_core7.integer)("confidence").notNull().default(100),
    createdAt: (0, import_sqlite_core7.integer)("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => /* @__PURE__ */ new Date())
  },
  (table) => ({
    spIdx: (0, import_sqlite_core7.index)("palace_kg_sp_idx").on(table.subject, table.predicate),
    wingIdx: (0, import_sqlite_core7.index)("palace_kg_wing_idx").on(table.wingId)
  })
);
var palaceDiary = (0, import_sqlite_core7.sqliteTable)("palace_diary", {
  id: (0, import_sqlite_core7.text)("id").primaryKey().$defaultFn(() => (0, import_cuid27.createId)()),
  wingId: (0, import_sqlite_core7.text)("wing_id").notNull().references(() => palaceWings.id, { onDelete: "cascade" }),
  agentId: (0, import_sqlite_core7.text)("agent_id").notNull(),
  entry: (0, import_sqlite_core7.text)("entry").notNull(),
  createdAt: (0, import_sqlite_core7.integer)("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => /* @__PURE__ */ new Date())
});
var palaceWingsRelations = (0, import_drizzle_orm6.relations)(palaceWings, ({ many }) => ({
  rooms: many(palaceRooms),
  halls: many(palaceHalls),
  kgTriples: many(palaceKgTriples)
}));
var palaceRoomsRelations = (0, import_drizzle_orm6.relations)(palaceRooms, ({ one, many }) => ({
  wing: one(palaceWings, {
    fields: [palaceRooms.wingId],
    references: [palaceWings.id]
  }),
  drawers: many(palaceDrawers),
  closets: many(palaceClosets)
}));
var palaceDrawersRelations = (0, import_drizzle_orm6.relations)(palaceDrawers, ({ one }) => ({
  room: one(palaceRooms, {
    fields: [palaceDrawers.roomId],
    references: [palaceRooms.id]
  })
}));
var palaceClosetsRelations = (0, import_drizzle_orm6.relations)(palaceClosets, ({ one }) => ({
  room: one(palaceRooms, {
    fields: [palaceClosets.roomId],
    references: [palaceRooms.id]
  })
}));

// src/db/adapters/sqlite.ts
var import_fs = require("fs");
var import_path = require("path");
var sqliteDb = null;
var sqliteConnection = null;
function ensureColumn(connection, table, column, ddl) {
  const cols = connection.prepare(`PRAGMA table_info(${table})`).all();
  if (!cols.some((c) => c.name === column)) {
    connection.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
  }
}
var createTableStatements = `
-- Horizon Items
CREATE TABLE IF NOT EXISTS horizon_items (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  zone TEXT NOT NULL CHECK(zone IN ('READY', 'REFINING', 'SHAPING', 'DIRECTIONAL')),
  repo TEXT NOT NULL,
  complexity TEXT CHECK(complexity IN ('S', 'M', 'L', 'XL')),
  priority INTEGER NOT NULL DEFAULT 0,
  linear_ticket_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Plans
CREATE TABLE IF NOT EXISTS plans (
  id TEXT PRIMARY KEY,
  horizon_item_id TEXT NOT NULL UNIQUE REFERENCES horizon_items(id) ON DELETE CASCADE,
  version INTEGER NOT NULL DEFAULT 1,
  estimated_cost_usd REAL NOT NULL,
  baseline_cost_usd REAL NOT NULL,
  acceptance_criteria TEXT NOT NULL,
  confidence_signals TEXT NOT NULL,
  fleet_context_snapshot TEXT NOT NULL,
  memory_sessions_used TEXT DEFAULT '[]',
  previous_plan_id TEXT,
  generated_at INTEGER NOT NULL
);

-- Workstreams
CREATE TABLE IF NOT EXISTS workstreams (
  id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  repo TEXT NOT NULL,
  worker_count INTEGER NOT NULL DEFAULT 1,
  order_index INTEGER NOT NULL DEFAULT 0
);

-- Tasks
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  plan_id TEXT REFERENCES plans(id) ON DELETE CASCADE,
  workstream_id TEXT REFERENCES workstreams(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  model TEXT NOT NULL CHECK(model IN ('HAIKU', 'SONNET', 'OPUS')),
  model_override TEXT CHECK(model_override IN ('HAIKU', 'SONNET', 'OPUS')),
  complexity TEXT NOT NULL CHECK(complexity IN ('S', 'M', 'L', 'XL')),
  estimated_cost_usd REAL NOT NULL,
  file_paths TEXT NOT NULL,
  conflict_warning TEXT,
  depends_on TEXT NOT NULL DEFAULT '[]',
  order_index INTEGER NOT NULL DEFAULT 0
);

-- Touched Files
CREATE TABLE IF NOT EXISTS touched_files (
  id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  path TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'AVAILABLE' CHECK(status IN ('AVAILABLE', 'IN_FLIGHT', 'RECENTLY_MODIFIED')),
  in_flight_via TEXT
);

-- Conflicting Files
CREATE TABLE IF NOT EXISTS conflicting_files (
  id TEXT PRIMARY KEY,
  horizon_item_id TEXT NOT NULL REFERENCES horizon_items(id) ON DELETE CASCADE,
  path TEXT NOT NULL,
  blocked_by_session_id TEXT,
  blocked_by_ticket_id TEXT,
  estimated_unlock_minutes INTEGER
);

-- Fleet Sessions
CREATE TABLE IF NOT EXISTS ruflo_sessions (
  id TEXT PRIMARY KEY,
  repo TEXT NOT NULL,
  linear_ticket_id TEXT NOT NULL,
  ticket_title TEXT NOT NULL,
  current_workstream TEXT NOT NULL DEFAULT 'Main',
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE', 'NEEDS_SPEC', 'COMPLETE', 'ERROR')),
  progress_percent INTEGER NOT NULL DEFAULT 0,
  elapsed_minutes INTEGER NOT NULL DEFAULT 0,
  estimated_remaining_minutes INTEGER NOT NULL DEFAULT 30,
  in_flight_files TEXT NOT NULL DEFAULT '[]',
  pr_url TEXT,
  external_session_id TEXT,
  orchestrator_mode TEXT CHECK(orchestrator_mode IN ('claude-session', 'http', 'ao-cli', 'manual', 'disabled')),
  tokens_used INTEGER,
  cost_usd INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Completed Tasks
CREATE TABLE IF NOT EXISTS completed_tasks (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES ruflo_sessions(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  model TEXT CHECK(model IN ('HAIKU', 'SONNET', 'OPUS')),
  duration_minutes INTEGER,
  completed_at INTEGER NOT NULL
);

-- In-Flight Files
CREATE TABLE IF NOT EXISTS in_flight_files (
  id TEXT PRIMARY KEY,
  path TEXT NOT NULL,
  active_session_id TEXT NOT NULL,
  linear_ticket_id TEXT NOT NULL,
  horizon_item_id TEXT,
  estimated_minutes_remaining INTEGER NOT NULL DEFAULT 30,
  locked_at INTEGER NOT NULL
);

-- Conductor Scores
CREATE TABLE IF NOT EXISTS conductor_scores (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  total INTEGER NOT NULL DEFAULT 500,
  fleet_utilization INTEGER NOT NULL DEFAULT 100,
  runway_health INTEGER NOT NULL DEFAULT 100,
  plan_accuracy INTEGER NOT NULL DEFAULT 100,
  cost_efficiency INTEGER NOT NULL DEFAULT 100,
  velocity_trend INTEGER NOT NULL DEFAULT 100,
  leaderboard_rank INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Score History
CREATE TABLE IF NOT EXISTS score_history (
  id TEXT PRIMARY KEY,
  score_id TEXT NOT NULL REFERENCES conductor_scores(id) ON DELETE CASCADE,
  total INTEGER NOT NULL,
  fleet_utilization INTEGER NOT NULL,
  runway_health INTEGER NOT NULL,
  plan_accuracy INTEGER NOT NULL,
  cost_efficiency INTEGER NOT NULL,
  velocity_trend INTEGER NOT NULL,
  recorded_at INTEGER NOT NULL
);

-- Activity Events
CREATE TABLE IF NOT EXISTS activity_events (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK(type IN ('SESSION_PROGRESS', 'SESSION_COMPLETE', 'PLAN_GENERATED', 'PLAN_APPROVED', 'ITEM_CREATED', 'ITEM_DISPATCHED', 'RUNWAY_UPDATE', 'FILE_UNLOCKED', 'SCORE_UPDATE', 'WAVE_PLAN_CREATED', 'WAVE_DISPATCHING', 'WAVE_TASK_DISPATCHED', 'WAVE_TASK_COMPLETE', 'WAVE_TASK_FAILED', 'WAVE_COMPLETE', 'WAVE_ADVANCE', 'WAVE_PLAN_COMPLETE', 'WAVE_PLAN_FAILED', 'WAVE_PLAN_REOPTIMIZING')),
  message TEXT NOT NULL,
  repo TEXT,
  ticket_id TEXT,
  metadata TEXT,
  created_at INTEGER NOT NULL
);

-- Wave Plans
CREATE TABLE IF NOT EXISTS wave_plans (
  id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  horizon_item_id TEXT NOT NULL REFERENCES horizon_items(id) ON DELETE CASCADE,
  total_waves INTEGER NOT NULL,
  total_tasks INTEGER NOT NULL,
  max_parallelism INTEGER NOT NULL,
  critical_path TEXT NOT NULL,
  critical_path_length INTEGER NOT NULL,
  parallelization_score REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft', 'approved', 'executing', 'paused', 'completed', 'failed', 're-optimizing')),
  current_wave_index INTEGER NOT NULL DEFAULT 0,
  version INTEGER NOT NULL DEFAULT 1,
  previous_wave_plan_id TEXT REFERENCES wave_plans(id),
  raw_markdown TEXT,
  started_at INTEGER,
  completed_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Waves
CREATE TABLE IF NOT EXISTS waves (
  id TEXT PRIMARY KEY,
  wave_plan_id TEXT NOT NULL REFERENCES wave_plans(id) ON DELETE CASCADE,
  wave_index INTEGER NOT NULL,
  label TEXT NOT NULL,
  max_parallel_tasks INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'dispatching', 'active', 'completed', 'failed', 'skipped')),
  started_at INTEGER,
  completed_at INTEGER
);

-- Wave Tasks
CREATE TABLE IF NOT EXISTS wave_tasks (
  id TEXT PRIMARY KEY,
  wave_id TEXT NOT NULL REFERENCES waves(id) ON DELETE CASCADE,
  wave_plan_id TEXT NOT NULL REFERENCES wave_plans(id) ON DELETE CASCADE,
  task_id TEXT REFERENCES tasks(id),
  wave_index INTEGER NOT NULL,
  task_code TEXT NOT NULL,
  label TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  file_paths TEXT NOT NULL DEFAULT '[]',
  dependencies TEXT NOT NULL DEFAULT '[]',
  recommended_model TEXT CHECK(recommended_model IN ('HAIKU', 'SONNET', 'OPUS')),
  complexity TEXT CHECK(complexity IN ('S', 'M', 'L', 'XL')),
  is_on_critical_path INTEGER NOT NULL DEFAULT 0,
  can_run_in_parallel INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'dispatched', 'running', 'completed', 'failed', 'retrying', 'skipped')),
  assigned_session_id TEXT,
  started_at INTEGER,
  completed_at INTEGER,
  error_message TEXT,
  completion_summary TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0
);

-- Dependency Edges
CREATE TABLE IF NOT EXISTS dependency_edges (
  id TEXT PRIMARY KEY,
  wave_plan_id TEXT NOT NULL REFERENCES wave_plans(id) ON DELETE CASCADE,
  from_task_code TEXT NOT NULL,
  to_task_code TEXT NOT NULL,
  edge_type TEXT NOT NULL DEFAULT 'hard' CHECK(edge_type IN ('hard', 'soft'))
);

-- Wave Plan Metrics
CREATE TABLE IF NOT EXISTS wave_plan_metrics (
  id TEXT PRIMARY KEY,
  wave_plan_id TEXT NOT NULL UNIQUE REFERENCES wave_plans(id) ON DELETE CASCADE,
  total_wall_clock_ms INTEGER,
  theoretical_min_ms INTEGER,
  parallelization_efficiency REAL,
  waves_executed INTEGER NOT NULL DEFAULT 0,
  tasks_completed INTEGER NOT NULL DEFAULT 0,
  tasks_failed INTEGER NOT NULL DEFAULT 0,
  tasks_retried INTEGER NOT NULL DEFAULT 0,
  avg_task_duration_ms INTEGER,
  max_wave_wait_ms INTEGER,
  file_conflicts_avoided INTEGER NOT NULL DEFAULT 0,
  re_optimization_count INTEGER NOT NULL DEFAULT 0,
  recorded_at INTEGER NOT NULL
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_horizon_items_zone ON horizon_items(zone);
CREATE INDEX IF NOT EXISTS idx_horizon_items_repo ON horizon_items(repo);
CREATE INDEX IF NOT EXISTS idx_ruflo_sessions_status ON ruflo_sessions(status);
CREATE INDEX IF NOT EXISTS idx_ruflo_sessions_repo ON ruflo_sessions(repo);
CREATE INDEX IF NOT EXISTS idx_activity_events_type ON activity_events(type);
CREATE INDEX IF NOT EXISTS idx_activity_events_created_at ON activity_events(created_at);
CREATE INDEX IF NOT EXISTS idx_wave_plans_plan_id ON wave_plans(plan_id);
CREATE INDEX IF NOT EXISTS idx_wave_plans_horizon_item_id ON wave_plans(horizon_item_id);
CREATE INDEX IF NOT EXISTS idx_wave_plans_status ON wave_plans(status);
CREATE INDEX IF NOT EXISTS idx_waves_wave_plan_id ON waves(wave_plan_id);
CREATE INDEX IF NOT EXISTS idx_waves_status ON waves(status);
CREATE INDEX IF NOT EXISTS idx_wave_tasks_wave_id ON wave_tasks(wave_id);
CREATE INDEX IF NOT EXISTS idx_wave_tasks_wave_plan_id ON wave_tasks(wave_plan_id);
CREATE INDEX IF NOT EXISTS idx_wave_tasks_status ON wave_tasks(status);
CREATE INDEX IF NOT EXISTS idx_wave_tasks_task_code ON wave_tasks(task_code);
CREATE INDEX IF NOT EXISTS idx_dependency_edges_wave_plan_id ON dependency_edges(wave_plan_id);
`;
function createSQLiteAdapter(path) {
  if (sqliteDb) {
    return sqliteDb;
  }
  const dir = (0, import_path.dirname)(path);
  if (!(0, import_fs.existsSync)(dir)) {
    (0, import_fs.mkdirSync)(dir, { recursive: true });
  }
  sqliteConnection = new import_better_sqlite3.default(path);
  sqliteConnection.pragma("busy_timeout = 5000");
  sqliteConnection.pragma("journal_mode = WAL");
  sqliteConnection.exec(createTableStatements);
  ensureColumn(sqliteConnection, "wave_tasks", "completion_summary", "completion_summary TEXT");
  ensureColumn(sqliteConnection, "ruflo_sessions", "external_session_id", "external_session_id TEXT");
  ensureColumn(
    sqliteConnection,
    "ruflo_sessions",
    "orchestrator_mode",
    "orchestrator_mode TEXT CHECK(orchestrator_mode IN ('claude-session', 'http', 'ao-cli', 'manual', 'disabled'))"
  );
  ensureColumn(sqliteConnection, "ruflo_sessions", "tokens_used", "tokens_used INTEGER");
  ensureColumn(sqliteConnection, "ruflo_sessions", "cost_usd", "cost_usd INTEGER");
  sqliteDb = (0, import_better_sqlite32.drizzle)(sqliteConnection, { schema: schema_exports });
  return sqliteDb;
}

// src/db/adapters/postgres.ts
var import_postgres_js = require("drizzle-orm/postgres-js");
var import_postgres = __toESM(require("postgres"));
var pgDb = null;
var pgConnection = null;
function createPostgresAdapter(connectionString) {
  if (pgDb) {
    return pgDb;
  }
  pgConnection = (0, import_postgres.default)(connectionString, {
    max: 10,
    // Connection pool size
    idle_timeout: 20,
    connect_timeout: 10
  });
  pgDb = (0, import_postgres_js.drizzle)(pgConnection, { schema: schema_exports });
  return pgDb;
}

// src/db/adapters/index.ts
function createDatabase(config) {
  switch (config.type) {
    case "sqlite":
      if (!config.sqlitePath) {
        throw new Error("SQLite path is required for SQLite database");
      }
      return createSQLiteAdapter(config.sqlitePath);
    case "postgres":
      if (!config.postgresUrl) {
        throw new Error("Postgres connection URL is required for Postgres database");
      }
      return createPostgresAdapter(config.postgresUrl);
    default:
      throw new Error(`Unsupported database type: ${config.type}`);
  }
}

// src/db/client.ts
var db = null;
function getDatabase() {
  if (!db) {
    const config = getDatabaseConfig();
    db = createDatabase(config);
  }
  return db;
}

// src/wave-planner/fleet-context.ts
var import_drizzle_orm7 = require("drizzle-orm");
var FleetContextService = class {
  /**
   * Assemble fleet context for a target repository
   * Queries active sessions and in-flight files to determine available capacity
   *
   * @param targetRepo - The repository to check fleet context for
   * @returns FleetContextBlock with available workers, in-flight files, and active sessions
   */
  async assembleContext(targetRepo) {
    const db2 = getDatabase();
    const activeSessions = await db2.select().from(rufloSessions).where(
      (0, import_drizzle_orm7.or)(
        (0, import_drizzle_orm7.eq)(rufloSessions.status, "ACTIVE"),
        (0, import_drizzle_orm7.eq)(rufloSessions.status, "NEEDS_SPEC")
      )
    );
    const inFlightFilesData = await db2.select().from(inFlightFiles);
    const availableWorkers = {};
    const repoSessionCounts = {};
    for (const session of activeSessions) {
      repoSessionCounts[session.repo] = (repoSessionCounts[session.repo] || 0) + 1;
    }
    const MAX_WORKERS_PER_REPO = 4;
    const allReposArray = [targetRepo, ...activeSessions.map((s) => s.repo)];
    const uniqueRepos = Array.from(new Set(allReposArray));
    for (const repo of uniqueRepos) {
      const activeCount = repoSessionCounts[repo] || 0;
      availableWorkers[repo] = Math.max(0, MAX_WORKERS_PER_REPO - activeCount);
    }
    const formattedInFlightFiles = inFlightFilesData.map((file) => ({
      path: file.path,
      sessionId: file.activeSessionId,
      ticketId: file.linearTicketId,
      estimatedMinutesRemaining: file.estimatedMinutesRemaining
    }));
    const formattedActiveSessions = activeSessions.map((session) => ({
      repo: session.repo,
      ticketId: session.linearTicketId,
      progressPercent: session.progressPercent,
      estimatedRemainingMinutes: session.estimatedRemainingMinutes
    }));
    return {
      availableWorkers,
      inFlightFiles: formattedInFlightFiles,
      activeSessions: formattedActiveSessions
    };
  }
  /**
   * Extract file paths that should be avoided from fleet context
   * These files are currently being worked on by other sessions
   *
   * @param fleetContext - The fleet context block
   * @returns Array of file paths to avoid
   */
  getAvoidFiles(fleetContext) {
    return fleetContext.inFlightFiles.map((file) => file.path);
  }
};

// src/wave-planner/codebase-context.ts
var import_fs2 = require("fs");
var import_path2 = require("path");
var import_child_process = require("child_process");
var import_util = require("util");
var execAsync = (0, import_util.promisify)(import_child_process.exec);
var CodebaseContextService = class {
  /**
   * Assemble codebase context for a repository
   * Generates file tree and identifies recently modified files
   *
   * @param repo - The repository identifier
   * @param workingDir - The working directory path for the repository
   * @returns CodebaseContextBlock with file tree and recently modified files
   */
  async assembleContext(repo, workingDir) {
    const fileTree = await this.generateFileTree(workingDir, 3);
    const recentlyModifiedFiles = await this.getRecentlyModifiedFiles(workingDir, 20);
    return {
      fileTree,
      recentlyModifiedFiles
    };
  }
  /**
   * Generate an ASCII file tree representation of the directory
   * Excludes common build artifacts and dependencies
   *
   * @param dir - The directory to generate the tree for
   * @param maxDepth - Maximum depth to traverse (default: 3)
   * @returns ASCII file tree string
   */
  async generateFileTree(dir, maxDepth = 3) {
    const excludeDirs = /* @__PURE__ */ new Set(["node_modules", ".git", "dist", "build", "coverage", ".next", "out", ".cache"]);
    const tree = [];
    const traverse = async (currentPath, depth, prefix = "") => {
      if (depth > maxDepth) return;
      try {
        const entries = await import_fs2.promises.readdir(currentPath, { withFileTypes: true });
        const sortedEntries = entries.sort((a, b) => {
          if (a.isDirectory() && !b.isDirectory()) return -1;
          if (!a.isDirectory() && b.isDirectory()) return 1;
          return a.name.localeCompare(b.name);
        });
        for (let i = 0; i < sortedEntries.length; i++) {
          const entry = sortedEntries[i];
          const isLast = i === sortedEntries.length - 1;
          if (excludeDirs.has(entry.name)) continue;
          if (entry.name.startsWith(".") && !["..env.example", ".gitignore"].includes(entry.name)) {
            continue;
          }
          const connector = isLast ? "\u2514\u2500\u2500 " : "\u251C\u2500\u2500 ";
          const newPrefix = isLast ? "    " : "\u2502   ";
          if (entry.isDirectory()) {
            tree.push(`${prefix}${connector}${entry.name}/`);
            await traverse((0, import_path2.join)(currentPath, entry.name), depth + 1, prefix + newPrefix);
          } else {
            tree.push(`${prefix}${connector}${entry.name}`);
          }
        }
      } catch (error) {
        console.error(`Error reading directory ${currentPath}:`, error);
      }
    };
    try {
      const dirName = dir.split("/").pop() || "root";
      tree.push(`${dirName}/`);
      await traverse(dir, 0);
    } catch (error) {
      tree.push(`Error generating file tree: ${error}`);
    }
    return tree.join("\n");
  }
  /**
   * Get recently modified files using git or file system stats
   * Prefers git for better accuracy
   *
   * @param dir - The directory to check
   * @param limit - Maximum number of files to return (default: 20)
   * @returns Array of file paths (relative to the working directory)
   */
  async getRecentlyModifiedFiles(dir, limit = 20) {
    try {
      const { stdout } = await execAsync(
        `git -C "${dir}" log --pretty=format: --name-only --since="1 week ago" | sort | uniq`,
        { maxBuffer: 1024 * 1024 }
      );
      const files = stdout.split("\n").filter((line) => line.trim().length > 0).filter((file) => {
        const lowerFile = file.toLowerCase();
        return !lowerFile.includes("node_modules") && !lowerFile.includes(".git") && !lowerFile.includes("dist/") && !lowerFile.includes("build/") && !lowerFile.includes("coverage/") && !lowerFile.endsWith(".lock") && !lowerFile.endsWith(".log");
      }).slice(0, limit);
      if (files.length > 0) {
        return files;
      }
    } catch (error) {
      console.warn("Git not available, falling back to file stats");
    }
    return this.getRecentlyModifiedFilesByStats(dir, limit);
  }
  /**
   * Fallback method to get recently modified files using file system stats
   *
   * @param dir - The directory to check
   * @param limit - Maximum number of files to return
   * @returns Array of file paths (relative to the working directory)
   */
  async getRecentlyModifiedFilesByStats(dir, limit) {
    const excludeDirs = /* @__PURE__ */ new Set(["node_modules", ".git", "dist", "build", "coverage", ".next", "out"]);
    const files = [];
    const traverse = async (currentPath, depth = 0) => {
      if (depth > 5) return;
      try {
        const entries = await import_fs2.promises.readdir(currentPath, { withFileTypes: true });
        for (const entry of entries) {
          if (excludeDirs.has(entry.name)) continue;
          if (entry.name.startsWith(".")) continue;
          const fullPath = (0, import_path2.join)(currentPath, entry.name);
          if (entry.isDirectory()) {
            await traverse(fullPath, depth + 1);
          } else {
            const stats = await import_fs2.promises.stat(fullPath);
            const relativePath = (0, import_path2.relative)(dir, fullPath);
            files.push({ path: relativePath, mtime: stats.mtime });
          }
        }
      } catch (error) {
      }
    };
    await traverse(dir);
    return files.sort((a, b) => b.mtime.getTime() - a.mtime.getTime()).slice(0, limit).map((f) => f.path);
  }
};

// src/wave-planner/prompt-templates/default.ts
var defaultTemplate = {
  name: "default",
  version: "1.0.0",
  render(context) {
    return `# Wave-Decomposed Execution Plan Generator

You are an expert software architect generating a wave-decomposed execution plan. Your goal is to break down the specification into parallel-executable tasks organized into waves.

## Specification
\`\`\`
${context.specContent}
\`\`\`

## Context

### Item Metadata
- **Title**: ${context.itemTitle}
- **Item ID**: ${context.itemId}
- **Repository**: ${context.repo}

${renderFleetContext(context)}

${renderCodebaseContext(context)}

${renderConstraints(context)}

${renderMemoryContext(context)}

${renderWorkContext(context)}

## Wave Planning Rules

### Wave Structure
1. **Waves are execution phases**: All tasks within a wave can run in parallel
2. **Dependencies define wave boundaries**: A task cannot start until all its dependencies complete
3. **File conflicts prevent parallelism**: Tasks touching the same file MUST be in different waves
4. **Maximize parallelization**: Break work into the smallest independent units possible
5. **Minimize critical path**: Reduce the longest chain of dependent tasks

### Task Granularity
- **Small tasks (S)**: Single function/component changes, 5-15 minutes
- **Medium tasks (M)**: Multiple related files, 15-30 minutes
- **Large tasks (L)**: Cross-cutting changes, 30-60 minutes
- **Extra Large (XL)**: Major refactors or migrations, 60+ minutes

### Model Selection
- **Haiku**: Simple changes, clear specifications, low complexity (S-M tasks)
- **Sonnet**: Moderate complexity, requires reasoning, most tasks (M-L tasks)
- **Opus**: Complex architecture changes, ambiguous requirements (L-XL tasks)

### Dependency Types
- **Hard dependencies**: Task B requires outputs from Task A (code, types, interfaces)
- **Soft dependencies**: Task B benefits from Task A context but can technically run independently
- Use hard dependencies sparingly; prefer file-based sequencing

## Output Format

Generate your plan using the following structure:

### Wave Tables

For each wave, create a markdown table with these columns:

| Task ID | Description | Files | Dependencies | Parallel? | Model | Complexity |
|---------|-------------|-------|--------------|-----------|-------|------------|

**Column specifications:**
- **Task ID**: Format as \`W.T\` (e.g., 1.1, 1.2, 2.1) where W=wave number, T=task number
- **Description**: Clear, actionable task description (1-2 sentences)
- **Files**: Comma-separated list of files this task will modify/create
- **Dependencies**: Comma-separated list of Task IDs this task depends on (empty if none)
- **Parallel?**: "Yes" if can run with other tasks in wave, "No" if sequential
- **Model**: "haiku", "sonnet", or "opus"
- **Complexity**: "S", "M", "L", or "XL"

**Example:**
\`\`\`markdown
## Wave 1: Foundation

| Task ID | Description | Files | Dependencies | Parallel? | Model | Complexity |
|---------|-------------|-------|--------------|-----------|-------|------------|
| 1.1 | Create base type definitions | src/types.ts | - | Yes | haiku | S |
| 1.2 | Set up database schema | src/db/schema.ts | - | Yes | sonnet | M |
| 1.3 | Initialize config module | src/config.ts | - | Yes | haiku | S |

## Wave 2: Core Implementation

| Task ID | Description | Files | Dependencies | Parallel? | Model | Complexity |
|---------|-------------|-------|--------------|-----------|-------|------------|
| 2.1 | Implement user service | src/services/user.ts | 1.1, 1.2 | Yes | sonnet | M |
| 2.2 | Implement auth service | src/services/auth.ts | 1.1, 1.2 | Yes | sonnet | M |
\`\`\`

### Dependency Graph

After all wave tables, include a dependency graph section:

\`\`\`markdown
## Dependency Graph

\`\`\`mermaid
graph TD
  1.1[Task 1.1: Base types]
  1.2[Task 1.2: Database schema]
  1.3[Task 1.3: Config]
  2.1[Task 2.1: User service]
  2.2[Task 2.2: Auth service]

  1.1 --> 2.1
  1.2 --> 2.1
  1.1 --> 2.2
  1.2 --> 2.2
\`\`\`
\`\`\`

### Critical Path

Identify the longest chain of dependent tasks:

\`\`\`markdown
## Critical Path

**Path**: 1.1 \u2192 2.1 \u2192 3.1 \u2192 4.1
**Length**: 4 tasks
**Description**: This represents the minimum time to completion if all parallel work executes optimally.
\`\`\`

### Statistics

Provide high-level metrics:

\`\`\`markdown
## Statistics

- **Total Tasks**: 12
- **Total Waves**: 4
- **Max Parallelism**: 5 tasks (Wave 2)
- **Critical Path Length**: 4 tasks
- **Sequential Chains**: 2
- **Parallelization Ratio**: 67% (8 parallel tasks / 12 total)
\`\`\`

## Planning Strategy

1. **Identify foundations**: What types, schemas, or configs must exist first?
2. **Find natural boundaries**: Group related work that shares context
3. **Detect conflicts**: Ensure no two tasks in the same wave touch the same file
4. **Minimize dependencies**: Only add dependencies when truly required
5. **Balance waves**: Aim for similar amounts of work per wave
6. **Verify critical path**: Ensure the longest chain is as short as possible

## Important Notes

- If the specification is unclear, make reasonable assumptions and note them in task descriptions
- Prefer creating new files over modifying existing files when possible (less conflict)
- Break large tasks into smaller subtasks across multiple waves
- Consider test files as separate tasks that depend on implementation tasks
- Documentation tasks can often run in parallel with implementation

Generate the complete wave-decomposed plan now.`;
  }
};
function renderFleetContext(context) {
  const { fleetContext } = context;
  let output = "### Fleet Context\n\n";
  const workers = Object.entries(fleetContext.availableWorkers).map(([model, count]) => `- **${model}**: ${count} worker${count !== 1 ? "s" : ""}`).join("\n");
  output += "**Available Workers:**\n" + (workers || "- No workers available");
  output += "\n\n";
  if (fleetContext.inFlightFiles.length > 0) {
    output += "**Files Currently Being Modified:**\n";
    fleetContext.inFlightFiles.forEach((file) => {
      output += `- \`${file.path}\` (${file.ticketId}, ~${file.estimatedMinutesRemaining}min remaining)
`;
    });
    output += "\n**Important**: Do not schedule tasks that modify these files until they complete.\n\n";
  }
  if (fleetContext.activeSessions.length > 0) {
    output += "**Active Sessions:**\n";
    fleetContext.activeSessions.forEach((session) => {
      output += `- ${session.ticketId} (${session.progressPercent}% complete, ~${session.estimatedRemainingMinutes}min remaining)
`;
    });
    output += "\n";
  }
  return output;
}
function renderCodebaseContext(context) {
  const { codebaseContext } = context;
  let output = "### Codebase Context\n\n";
  if (codebaseContext.fileTree) {
    output += "**Project Structure:**\n```\n";
    output += codebaseContext.fileTree;
    output += "\n```\n\n";
  }
  if (codebaseContext.recentlyModifiedFiles.length > 0) {
    output += "**Recently Modified Files:**\n";
    codebaseContext.recentlyModifiedFiles.forEach((file) => {
      output += `- \`${file}\`
`;
    });
    output += "\nConsider these files when planning changes to maintain consistency.\n\n";
  }
  if (codebaseContext.moduleStructure) {
    output += "**Module Structure:**\n```\n";
    output += codebaseContext.moduleStructure;
    output += "\n```\n\n";
  }
  return output;
}
function renderConstraints(context) {
  const { constraints } = context;
  let output = "### Constraints\n\n";
  if (constraints.avoidFiles.length > 0) {
    output += "**Files to Avoid:**\n";
    constraints.avoidFiles.forEach((file) => {
      output += `- \`${file}\`
`;
    });
    output += "\nDo not schedule tasks that modify these files.\n\n";
  }
  if (constraints.preferModel) {
    output += `**Preferred Model**: ${constraints.preferModel}
`;
    output += "Use this model for tasks when appropriate.\n\n";
  }
  if (constraints.maxCost) {
    output += `**Maximum Cost**: $${constraints.maxCost}
`;
    output += "Optimize for cost by preferring smaller models when possible.\n\n";
  }
  if (constraints.maxConcurrency) {
    output += `**Maximum Concurrency**: ${constraints.maxConcurrency} tasks
`;
    output += "Ensure no wave exceeds this parallelism limit.\n\n";
  }
  if (constraints.customConstraints.length > 0) {
    output += "**Additional Constraints:**\n";
    constraints.customConstraints.forEach((constraint) => {
      output += `- ${constraint}
`;
    });
    output += "\n";
  }
  return output;
}
function renderMemoryContext(context) {
  if (!context.memoryContext) return "";
  const { relevantSessions, palace } = context.memoryContext;
  const hasSessions = relevantSessions && relevantSessions.length > 0;
  const hasPalace = palace && (palace.identity || palace.criticalFacts.length > 0 || palace.topicalClosets.length > 0);
  if (!hasSessions && !hasPalace) return "";
  let output = "### Memory Context\n\n";
  if (hasPalace && palace) {
    if (palace.identity) {
      output += "**Identity (L0):**\n";
      output += palace.identity + "\n\n";
    }
    if (palace.criticalFacts.length > 0) {
      output += "**Critical Facts (L1):**\n";
      palace.criticalFacts.forEach((fact) => {
        output += `- ${fact}
`;
      });
      output += "\n";
    }
    if (palace.topicalClosets.length > 0) {
      output += "**Topical Recall (L2):**\n";
      palace.topicalClosets.forEach((closet) => {
        output += `- *[${closet.topic}]* ${closet.summary}
`;
      });
      output += "\n";
    }
    output += `_Palace context: ~${palace.tokenEstimate} tokens \xB7 wing \`${palace.wingSlug}\`_

`;
  }
  if (hasSessions) {
    output += "**Relevant Past Sessions:**\n";
    relevantSessions.forEach((session) => {
      output += `- **${session.date}** (${session.ticketId}): ${session.summary}
`;
      if (session.constraintApplied) {
        output += `  *Constraint*: ${session.constraintApplied}
`;
      }
    });
    output += "\n";
  }
  output += "Use these insights to inform your planning decisions.\n\n";
  return output;
}
function renderWorkContext(context) {
  let output = "";
  if (context.completedWork && context.completedWork.tasks.length > 0) {
    output += "### Completed Work\n\n";
    output += "The following tasks have already been completed:\n\n";
    context.completedWork.tasks.forEach((task) => {
      output += `**${task.taskCode}**: ${task.description}
`;
      output += `- Files modified: ${task.filesModified.join(", ")}
`;
      output += `- Summary: ${task.completionSummary}

`;
    });
  }
  if (context.remainingWork && context.remainingWork.tasks.length > 0) {
    output += "### Remaining Work\n\n";
    output += "Focus your plan on these remaining tasks:\n\n";
    context.remainingWork.tasks.forEach((task) => {
      output += `**${task.taskCode}**: ${task.description}
`;
      output += `- Original dependencies: ${task.originalDependencies.join(", ") || "None"}
`;
      output += `- Original files: ${task.originalFiles.join(", ")}

`;
    });
    output += "Adjust dependencies based on completed work and current codebase state.\n\n";
  }
  return output;
}

// src/wave-planner/prompt-templates/simplified.ts
var simplifiedTemplate = {
  name: "simplified",
  version: "1.0.0",
  render(context) {
    return `# Generate Wave Execution Plan

Break down this specification into tasks organized into waves.

## Specification
\`\`\`
${context.specContent}
\`\`\`

## Repository
${context.repo}

${renderSimplifiedConstraints(context)}

## Instructions

1. **Create waves**: Group tasks that can run in parallel
2. **No file conflicts**: Tasks in the same wave cannot modify the same file
3. **Add dependencies**: Only when task B needs outputs from task A
4. **Keep it simple**: Focus on clear task breakdown

## Output Format

Use this exact format:

\`\`\`markdown
## Wave 1: [Wave Name]

| Task ID | Description | Files | Dependencies | Parallel? | Model | Complexity |
|---------|-------------|-------|--------------|-----------|-------|------------|
| 1.1 | [Task description] | [file1.ts, file2.ts] | - | Yes | sonnet | M |
| 1.2 | [Task description] | [file3.ts] | - | Yes | haiku | S |

## Wave 2: [Wave Name]

| Task ID | Description | Files | Dependencies | Parallel? | Model | Complexity |
|---------|-------------|-------|--------------|-----------|-------|------------|
| 2.1 | [Task description] | [file4.ts] | 1.1 | Yes | sonnet | M |

## Critical Path

**Path**: 1.1 \u2192 2.1 \u2192 3.1
**Length**: 3 tasks

## Statistics

- **Total Tasks**: 6
- **Total Waves**: 3
- **Max Parallelism**: 3
- **Critical Path Length**: 3
- **Sequential Chains**: 1
\`\`\`

### Field Values

- **Task ID**: Format as \`wave.task\` (e.g., 1.1, 2.3)
- **Description**: 1-2 sentences
- **Files**: Comma-separated file paths
- **Dependencies**: Task IDs (e.g., "1.1, 1.2") or "-" for none
- **Parallel?**: "Yes" or "No"
- **Model**: "haiku", "sonnet", or "opus"
- **Complexity**: "S", "M", "L", or "XL"

## Guidelines

- **Complexity**: S=5-15min, M=15-30min, L=30-60min, XL=60+min
- **Model**: haiku=simple, sonnet=moderate, opus=complex
- **Wave boundaries**: Determined by dependencies and file conflicts
- **Maximize parallelism**: More tasks per wave = faster completion

Generate the plan now. Use the exact format shown above.`;
  }
};
function renderSimplifiedConstraints(context) {
  const { constraints, fleetContext } = context;
  let output = "";
  const criticalConstraints = [];
  if (constraints.avoidFiles.length > 0) {
    criticalConstraints.push(`Do not modify: ${constraints.avoidFiles.join(", ")}`);
  }
  if (fleetContext.inFlightFiles.length > 0) {
    const inFlightPaths = fleetContext.inFlightFiles.map((f) => f.path);
    criticalConstraints.push(`Currently being modified: ${inFlightPaths.join(", ")}`);
  }
  if (constraints.maxConcurrency) {
    criticalConstraints.push(`Maximum ${constraints.maxConcurrency} tasks per wave`);
  }
  if (constraints.preferModel) {
    criticalConstraints.push(`Prefer ${constraints.preferModel} model when appropriate`);
  }
  if (criticalConstraints.length > 0) {
    output += "## Constraints\n\n";
    criticalConstraints.forEach((constraint) => {
      output += `- ${constraint}
`;
    });
    output += "\n";
  }
  return output;
}

// src/wave-planner/prompt-templates/refinement.ts
var refinementTemplate = {
  name: "refinement",
  version: "1.0.0",
  render(context) {
    return `# Optimize Wave Execution Plan

Analyze this specification and generate a highly parallelized wave execution plan.

## Specification
\`\`\`
${context.specContent}
\`\`\`

## Optimization Goals

1. **Maximize parallelization**: Break work into the smallest independent units
2. **Minimize critical path**: Reduce the longest chain of dependent tasks
3. **Reduce dependencies**: Only add dependencies when truly required
4. **Balance waves**: Distribute work evenly across waves

Generate an optimized wave plan following the standard format.`;
  },
  renderRefinement(context, currentPlan, currentScore) {
    return `# Improve Wave Execution Plan

You are refining an existing wave execution plan to increase parallelization and reduce execution time.

## Original Specification
\`\`\`
${context.specContent}
\`\`\`

## Current Plan
\`\`\`markdown
${currentPlan}
\`\`\`

## Current Quality Metrics

**Overall Score**: ${(currentScore * 100).toFixed(1)}% (Target: 80%+)

The current plan has optimization opportunities. Your goal is to improve parallelization while maintaining correctness.

## Refinement Strategies

### 1. Break Large Tasks into Smaller Subtasks

**Bad** (sequential bottleneck):
\`\`\`
Wave 1:
- 1.1: Implement entire user module [XL] (src/user/*.ts)
  Dependencies: -

Wave 2:
- 2.1: Implement entire auth module [XL] (src/auth/*.ts)
  Dependencies: 1.1
\`\`\`

**Good** (parallel subtasks):
\`\`\`
Wave 1:
- 1.1: Create user types [S] (src/user/types.ts)
  Dependencies: -
- 1.2: Create auth types [S] (src/auth/types.ts)
  Dependencies: -

Wave 2:
- 2.1: Implement user service [M] (src/user/service.ts)
  Dependencies: 1.1
- 2.2: Implement auth service [M] (src/auth/service.ts)
  Dependencies: 1.2
- 2.3: Implement user repository [M] (src/user/repository.ts)
  Dependencies: 1.1
\`\`\`

### 2. Reduce Unnecessary Dependencies

**Bad** (false dependency):
\`\`\`
Wave 1:
- 1.1: Create user types [S]
  Dependencies: -

Wave 2:
- 2.1: Create auth types [S]
  Dependencies: 1.1  \u2190 Unnecessary!
\`\`\`

**Good** (independent):
\`\`\`
Wave 1:
- 1.1: Create user types [S]
  Dependencies: -
- 1.2: Create auth types [S]
  Dependencies: -  \u2190 Can run in parallel
\`\`\`

### 3. Identify Tasks That Can Start Earlier

**Bad** (late start):
\`\`\`
Wave 1:
- 1.1: Create shared types [S]

Wave 2:
- 2.1: Implement feature A [M]
  Dependencies: 1.1

Wave 3:
- 3.1: Write tests for feature A [M]
  Dependencies: 2.1
- 3.2: Write documentation [S]
  Dependencies: 2.1  \u2190 Could have started earlier!
\`\`\`

**Good** (early documentation):
\`\`\`
Wave 1:
- 1.1: Create shared types [S]
- 1.2: Write documentation structure [S]
  Dependencies: -  \u2190 Can start immediately

Wave 2:
- 2.1: Implement feature A [M]
  Dependencies: 1.1
- 2.2: Update documentation content [S]
  Dependencies: 1.2

Wave 3:
- 3.1: Write tests for feature A [M]
  Dependencies: 2.1
\`\`\`

### 4. Split Cross-Cutting Changes

**Bad** (monolithic task):
\`\`\`
Wave 1:
- 1.1: Update all API endpoints [XL]
  Files: api/users.ts, api/auth.ts, api/products.ts, api/orders.ts
  Dependencies: -
\`\`\`

**Good** (split by module):
\`\`\`
Wave 1:
- 1.1: Update user API endpoints [M] (api/users.ts)
  Dependencies: -
- 1.2: Update auth API endpoints [M] (api/auth.ts)
  Dependencies: -
- 1.3: Update product API endpoints [M] (api/products.ts)
  Dependencies: -
- 1.4: Update order API endpoints [M] (api/orders.ts)
  Dependencies: -
\`\`\`

### 5. Parallelize Independent Features

**Bad** (sequential features):
\`\`\`
Wave 1:
- 1.1: Implement feature A [L]

Wave 2:
- 2.1: Implement feature B [L]
  Dependencies: 1.1  \u2190 Why?
\`\`\`

**Good** (parallel features):
\`\`\`
Wave 1:
- 1.1: Implement feature A [L]
  Dependencies: -
- 1.2: Implement feature B [L]
  Dependencies: -  \u2190 Independent features run in parallel
\`\`\`

## Refinement Checklist

Before generating the improved plan, verify:

- [ ] All XL tasks are broken into M or smaller subtasks
- [ ] Dependencies exist only when task B needs outputs from task A
- [ ] No artificial sequencing (tasks waiting unnecessarily)
- [ ] Independent features run in parallel
- [ ] Each wave has multiple tasks when possible
- [ ] Critical path is as short as possible
- [ ] File conflicts are properly handled (no same-file tasks in one wave)

## Important Constraints

${renderRefinementConstraints(context)}

## Output Format

Generate the complete improved plan using the standard wave plan format:

- Wave tables with all columns (Task ID, Description, Files, Dependencies, Parallel?, Model, Complexity)
- Dependency graph (mermaid)
- Critical path identification
- Statistics section

Focus on maximizing parallelization while maintaining correctness and respecting all constraints.

Generate the improved plan now.`;
  }
};
function renderRefinementConstraints(context) {
  const { constraints, fleetContext } = context;
  const constraintsList = [];
  if (fleetContext.inFlightFiles.length > 0) {
    const inFlightPaths = fleetContext.inFlightFiles.map((f) => `\`${f.path}\``).join(", ");
    constraintsList.push(`Files currently locked: ${inFlightPaths}`);
  }
  if (constraints.avoidFiles.length > 0) {
    const avoidPaths = constraints.avoidFiles.map((f) => `\`${f}\``).join(", ");
    constraintsList.push(`Files to avoid: ${avoidPaths}`);
  }
  if (constraints.maxConcurrency) {
    constraintsList.push(`Maximum tasks per wave: ${constraints.maxConcurrency}`);
  }
  const totalWorkers = Object.values(fleetContext.availableWorkers).reduce((a, b) => a + b, 0);
  if (totalWorkers > 0) {
    constraintsList.push(`Available workers: ${totalWorkers} total`);
  }
  if (constraints.preferModel) {
    constraintsList.push(`Preferred model: ${constraints.preferModel}`);
  }
  if (constraints.maxCost) {
    constraintsList.push(`Maximum cost: $${constraints.maxCost} (prefer smaller models)`);
  }
  if (constraints.customConstraints.length > 0) {
    constraintsList.push(...constraints.customConstraints);
  }
  if (constraintsList.length === 0) {
    return "- No specific constraints\n";
  }
  return constraintsList.map((c) => `- ${c}`).join("\n") + "\n";
}

// src/wave-planner/prompt-constructor.ts
var PromptConstructor = class {
  constructor(options) {
    this.fleetContextService = new FleetContextService();
    this.codebaseContextService = new CodebaseContextService();
    this.memPalaceService = options?.memPalaceService;
    this.templates = /* @__PURE__ */ new Map([
      ["default", defaultTemplate],
      ["simplified", simplifiedTemplate],
      ["refinement", refinementTemplate]
    ]);
  }
  /**
   * Attach (or replace) the MemPalace service after construction.
   * Useful for wiring in dependency-injection-style contexts.
   */
  setMemPalaceService(service) {
    this.memPalaceService = service;
  }
  /**
   * Assemble full prompt context from services and configuration.
   *
   * @param specContent - The specification content to plan
   * @param itemTitle - Title of the horizon item
   * @param itemId - ID of the horizon item
   * @param repo - Repository identifier
   * @param config - Constructor configuration
   * @returns Complete PromptContext ready for template rendering
   */
  async assembleContext(specContent, itemTitle, itemId, repo, config) {
    const fleetContext = await this.fleetContextService.assembleContext(repo);
    const codebaseContext = await this.codebaseContextService.assembleContext(
      repo,
      config.workingDir
    );
    const constraints = this.assembleConstraints(config, fleetContext);
    const memoryContext = await this.assembleMemoryContext(
      specContent,
      itemTitle,
      repo,
      config
    );
    return {
      specContent,
      itemTitle,
      itemId,
      repo,
      fleetContext,
      codebaseContext,
      constraints,
      memoryContext
    };
  }
  /**
   * Assemble MemoryContextBlock. Currently produces only the palace
   * portion; the legacy `relevantSessions` list is left empty for
   * callers that don't supply one (the wave planner then only renders
   * the palace block).
   */
  async assembleMemoryContext(specContent, itemTitle, repo, config) {
    if (!this.memPalaceService || !this.memPalaceService.enabled) {
      return void 0;
    }
    const topicHints = config.memPalaceTopicHints ?? deriveTopicHints(itemTitle, specContent);
    const block = await this.memPalaceService.assemblePromptContext({
      wingSlug: config.memPalaceWingSlug ?? repo,
      topicHints,
      maxTokens: config.memPalaceMaxTokens
    });
    if (!block) return void 0;
    return {
      relevantSessions: [],
      palace: {
        identity: block.identity,
        criticalFacts: block.criticalFacts,
        topicalClosets: block.topicalClosets,
        tokenEstimate: block.tokenEstimate,
        wingSlug: block.wingSlug
      }
    };
  }
  /**
   * Assemble constraints from configuration and fleet context.
   */
  assembleConstraints(config, fleetContext) {
    const avoidFiles = this.fleetContextService.getAvoidFiles(fleetContext);
    return {
      avoidFiles,
      preferModel: config.preferModel,
      maxCost: config.maxCost,
      maxConcurrency: config.maxConcurrency,
      customConstraints: config.customConstraints || []
    };
  }
  /**
   * Construct a full prompt for wave plan generation.
   *
   * @param specContent - The specification content to plan
   * @param itemTitle - Title of the horizon item
   * @param itemId - ID of the horizon item
   * @param repo - Repository identifier
   * @param config - Constructor configuration
   * @returns Rendered prompt string ready for Claude API
   */
  async constructPrompt(specContent, itemTitle, itemId, repo, config) {
    const context = await this.assembleContext(
      specContent,
      itemTitle,
      itemId,
      repo,
      config
    );
    const templateName = config.template || "default";
    const template = this.templates.get(templateName);
    if (!template) {
      throw new Error(`Unknown template: ${templateName}`);
    }
    return template.render(context);
  }
  /**
   * Construct a refinement prompt for improving an existing plan.
   *
   * @param specContent - The specification content
   * @param itemTitle - Title of the horizon item
   * @param itemId - ID of the horizon item
   * @param repo - Repository identifier
   * @param config - Constructor configuration
   * @param currentPlan - Current plan markdown to refine
   * @param currentScore - Current parallelization score (0-1)
   * @returns Rendered refinement prompt
   */
  async constructRefinementPrompt(specContent, itemTitle, itemId, repo, config, currentPlan, currentScore) {
    const context = await this.assembleContext(
      specContent,
      itemTitle,
      itemId,
      repo,
      config
    );
    const template = refinementTemplate;
    return template.renderRefinement(context, currentPlan, currentScore);
  }
  /**
   * Construct a reoptimization prompt for mid-execution replanning.
   *
   * @param specContent - The specification content
   * @param itemTitle - Title of the horizon item
   * @param itemId - ID of the horizon item
   * @param repo - Repository identifier
   * @param config - Constructor configuration
   * @param completedTasks - Summary of completed tasks
   * @param remainingTasks - Remaining tasks to replan
   * @returns Rendered reoptimization prompt
   */
  async constructReoptimizePrompt(specContent, itemTitle, itemId, repo, config, completedTasks2, remainingTasks) {
    const context = await this.assembleContext(
      specContent,
      itemTitle,
      itemId,
      repo,
      config
    );
    const fullContext = {
      ...context,
      completedWork: { tasks: completedTasks2 },
      remainingWork: { tasks: remainingTasks }
    };
    return defaultTemplate.render(fullContext);
  }
  /**
   * Get available template names.
   */
  getAvailableTemplates() {
    return Array.from(this.templates.keys());
  }
  /**
   * Register a custom template.
   */
  registerTemplate(name, template) {
    this.templates.set(name, template);
  }
};
function createPromptConstructor(options) {
  return new PromptConstructor(options);
}
function deriveTopicHints(itemTitle, specContent) {
  const text8 = `${itemTitle}
${specContent}`.toLowerCase();
  const candidates = /* @__PURE__ */ new Set();
  for (const match of itemTitle.matchAll(/\b([A-Z][a-z]{3,})/g)) {
    candidates.add(match[1].toLowerCase());
  }
  const domainKeywords = [
    "auth",
    "authentication",
    "authorization",
    "billing",
    "payments",
    "api",
    "database",
    "schema",
    "migration",
    "frontend",
    "backend",
    "deploy",
    "deployment",
    "test",
    "testing",
    "architecture",
    "refactor",
    "performance",
    "security",
    "cache"
  ];
  for (const kw of domainKeywords) {
    if (text8.includes(kw)) candidates.add(kw);
  }
  return Array.from(candidates).slice(0, 5);
}

// src/wave-planner/plan-refinement-service.ts
var DEFAULT_REFINEMENT_CONFIG = {
  minParallelizationScore: 0.3,
  maxRefinementIterations: 2,
  useSimplifiedOnRetry: true,
  maxTasksPerWave: void 0
};
var PlanRefinementService = class {
  constructor(aiClientConfig, refinementConfig) {
    this.promptConstructor = new PromptConstructor();
    this.aiClient = new WavePlannerAIClient(aiClientConfig);
    this.config = { ...DEFAULT_REFINEMENT_CONFIG, ...refinementConfig };
  }
  /**
   * Generate and refine a wave plan until quality threshold is met.
   *
   * @param specContent - Specification content to plan
   * @param itemTitle - Title of the horizon item
   * @param itemId - ID of the horizon item
   * @param repo - Repository identifier
   * @param constructorConfig - Prompt constructor configuration
   * @returns Refinement result with final plan and metrics
   */
  async generateAndRefine(specContent, itemTitle, itemId, repo, constructorConfig) {
    let currentPlan = null;
    let currentScore = null;
    let iterationsPerformed = 0;
    let totalTokensUsed = 0;
    try {
      const initialResult = await this.generateInitialPlan(
        specContent,
        itemTitle,
        itemId,
        repo,
        constructorConfig
      );
      currentPlan = initialResult.plan;
      currentScore = initialResult.score;
      totalTokensUsed += initialResult.tokensUsed;
      iterationsPerformed = 1;
      if (currentScore.parallelizationScore >= this.config.minParallelizationScore) {
        return {
          plan: currentPlan,
          score: currentScore,
          iterationsPerformed,
          totalTokensUsed,
          success: true
        };
      }
      for (let i = 0; i < this.config.maxRefinementIterations; i++) {
        const refinementResult = await this.refineplan(
          specContent,
          itemTitle,
          itemId,
          repo,
          constructorConfig,
          currentPlan,
          currentScore.parallelizationScore
        );
        totalTokensUsed += refinementResult.tokensUsed;
        iterationsPerformed++;
        if (refinementResult.score.parallelizationScore > currentScore.parallelizationScore) {
          currentPlan = refinementResult.plan;
          currentScore = refinementResult.score;
        }
        if (currentScore.parallelizationScore >= this.config.minParallelizationScore) {
          return {
            plan: currentPlan,
            score: currentScore,
            iterationsPerformed,
            totalTokensUsed,
            success: true
          };
        }
      }
      return {
        plan: currentPlan,
        score: currentScore,
        iterationsPerformed,
        totalTokensUsed,
        success: currentScore.parallelizationScore >= this.config.minParallelizationScore,
        error: currentScore.parallelizationScore < this.config.minParallelizationScore ? `Parallelization score ${(currentScore.parallelizationScore * 100).toFixed(1)}% is below threshold ${(this.config.minParallelizationScore * 100).toFixed(1)}%` : void 0
      };
    } catch (error) {
      const fallbackPlan = this.createFallbackPlan(specContent);
      if (fallbackPlan) {
        const fallbackScore = this.scorePlan(fallbackPlan);
        return {
          plan: fallbackPlan,
          score: fallbackScore,
          iterationsPerformed,
          totalTokensUsed,
          success: false,
          error: `AI generation failed, using fallback plan: ${error instanceof Error ? error.message : String(error)}`
        };
      }
      throw error;
    }
  }
  /**
   * Generate initial plan without refinement.
   */
  /**
   * Public because the conductor graph (`@devpilot.sh/conductor-agent`) drives
   * generation and refinement as separate nodes with its own scoring gate
   * between them. `generateAndRefine` remains the batteries-included entry point
   * for callers that just want a plan.
   */
  async generateInitialPlan(specContent, itemTitle, itemId, repo, constructorConfig) {
    const prompt = await this.promptConstructor.constructPrompt(
      specContent,
      itemTitle,
      itemId,
      repo,
      constructorConfig
    );
    const response = await this.aiClient.generateWithRetry(prompt);
    const tokensUsed = response.tokensInput + response.tokensOutput;
    const plan = parseWavePlanResponse(response.content);
    const validation = validateDAG(
      plan.waves.flatMap((w) => w.tasks),
      plan.dependencyEdges
    );
    if (!validation.valid) {
      throw new Error(
        `Generated plan has validation errors: ${validation.errors.map((e) => e.message).join("; ")}`
      );
    }
    const score = this.scorePlan(plan);
    return { plan, score, tokensUsed };
  }
  /**
   * Refine an existing plan to improve parallelization.
   */
  /** Public for the same reason as `generateInitialPlan`. */
  async refineplan(specContent, itemTitle, itemId, repo, constructorConfig, currentPlan, currentScore) {
    const prompt = await this.promptConstructor.constructRefinementPrompt(
      specContent,
      itemTitle,
      itemId,
      repo,
      constructorConfig,
      currentPlan.rawMarkdown,
      currentScore
    );
    const response = await this.aiClient.generateWithRetry(prompt);
    const tokensUsed = response.tokensInput + response.tokensOutput;
    const plan = parseWavePlanResponse(response.content);
    const validation = validateDAG(
      plan.waves.flatMap((w) => w.tasks),
      plan.dependencyEdges
    );
    if (!validation.valid) {
      this.lastRefinementError = `Refinement discarded \u2014 ${validation.errors.map((e) => e.message).join("; ")}`;
      return {
        plan: currentPlan,
        score: this.scorePlan(currentPlan),
        tokensUsed
      };
    }
    const score = this.scorePlan(plan);
    return { plan, score, tokensUsed };
  }
  /**
   * Score a parsed wave plan.
   *
   * Public alongside `generateInitialPlan` / `refineplan`: the conductor graph
   * branches on this score between its generate and refine nodes, and the
   * standalone `scorePlan()` export needs the wave assignment and critical path
   * computed first — which is exactly what this composes.
   */
  scorePlan(plan) {
    const allTasks = plan.waves.flatMap((w) => w.tasks);
    const criticalPathResult = computeCriticalPath(allTasks, plan.dependencyEdges);
    const waveAssignment = assignWaves(
      allTasks,
      plan.dependencyEdges,
      { maxTasksPerWave: this.config.maxTasksPerWave }
    );
    return scorePlan(
      waveAssignment,
      criticalPathResult.length,
      plan.dependencyEdges,
      allTasks
    );
  }
  /**
   * Create a fallback flat plan from specification.
   * This is a last resort when AI generation completely fails.
   */
  createFallbackPlan(specContent) {
    try {
      const taskDescriptions = this.extractTasksFromSpec(specContent);
      if (taskDescriptions.length === 0) {
        return null;
      }
      const tasks2 = taskDescriptions.map((description, index2) => ({
        taskCode: `1.${index2 + 1}`,
        description,
        filePaths: [],
        dependencies: [],
        canRunInParallel: true,
        recommendedModel: "sonnet",
        complexity: "M"
      }));
      return createFlatPlan(tasks2);
    } catch {
      return null;
    }
  }
  /**
   * Extract task descriptions from specification text.
   * Simple heuristic parser for numbered/bulleted lists.
   */
  extractTasksFromSpec(specContent) {
    const tasks2 = [];
    const lines = specContent.split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      const numberedMatch = trimmed.match(/^\d+[.)]\s+(.+)$/);
      if (numberedMatch) {
        tasks2.push(numberedMatch[1]);
        continue;
      }
      const bulletMatch = trimmed.match(/^[-*•]\s+(.+)$/);
      if (bulletMatch) {
        tasks2.push(bulletMatch[1]);
        continue;
      }
    }
    return tasks2;
  }
};
function createPlanRefinementService(aiClientConfig, refinementConfig) {
  return new PlanRefinementService(aiClientConfig, refinementConfig);
}

// src/wave-planner/generator.ts
var import_drizzle_orm8 = require("drizzle-orm");
var WavePlanGenerator = class {
  constructor(config) {
    this.config = config;
    this.refinementService = new PlanRefinementService(
      config.aiClient,
      config.refinement
    );
  }
  /**
   * Generate a complete wave plan for a horizon item.
   *
   * @param horizonItemId - ID of the horizon item
   * @param planId - ID of the associated plan
   * @param specContent - Specification content to plan
   * @param itemTitle - Title of the horizon item
   * @param repo - Repository identifier
   * @param constructorConfig - Prompt constructor configuration
   * @returns Complete generation result with persisted plan
   */
  async generate(horizonItemId, planId, specContent, itemTitle, repo, constructorConfig) {
    const startTime = Date.now();
    try {
      const refinementResult = await this.refinementService.generateAndRefine(
        specContent,
        itemTitle,
        horizonItemId,
        repo,
        constructorConfig
      );
      const allTasks = refinementResult.plan.waves.flatMap((w) => w.tasks);
      const edges = refinementResult.plan.dependencyEdges;
      const criticalPath = computeCriticalPath(allTasks, edges);
      const waveAssignment = assignWaves(allTasks, edges, this.config.waveAssigner);
      let wavePlanId;
      if (this.config.autoPersist !== false) {
        wavePlanId = await this.persistWavePlan(
          horizonItemId,
          planId,
          refinementResult.plan,
          criticalPath,
          waveAssignment,
          refinementResult.score
        );
      }
      const generationDurationMs = Date.now() - startTime;
      return {
        wavePlanId,
        wavePlan: refinementResult.plan,
        criticalPath,
        waveAssignment,
        score: refinementResult.score,
        metrics: {
          totalTokensUsed: refinementResult.totalTokensUsed,
          refinementIterations: refinementResult.iterationsPerformed,
          generationDurationMs
        },
        success: refinementResult.success,
        message: refinementResult.error
      };
    } catch (error) {
      const generationDurationMs = Date.now() - startTime;
      const fallbackResult = await this.generateFallbackPlan(
        horizonItemId,
        planId,
        specContent
      );
      if (fallbackResult) {
        return {
          ...fallbackResult,
          metrics: {
            totalTokensUsed: 0,
            refinementIterations: 0,
            generationDurationMs
          },
          success: false,
          message: `AI generation failed, using fallback: ${error instanceof Error ? error.message : String(error)}`
        };
      }
      throw error;
    }
  }
  /**
   * Generate a fallback flat plan when AI generation fails.
   */
  async generateFallbackPlan(horizonItemId, planId, specContent) {
    try {
      const descriptions = this.extractTaskDescriptions(specContent);
      if (descriptions.length === 0) {
        return null;
      }
      const wavePlan = createFlatPlanFromDescriptions(descriptions);
      const allTasks = wavePlan.waves.flatMap((w) => w.tasks);
      const criticalPath = computeCriticalPath(allTasks, wavePlan.dependencyEdges);
      const waveAssignment = {
        waves: wavePlan.waves.map((w, i) => ({
          waveIndex: i,
          label: w.label,
          tasks: w.tasks
        })),
        totalWaves: wavePlan.waves.length,
        maxParallelism: allTasks.length,
        adjustments: []
      };
      const score = scorePlan(
        waveAssignment,
        criticalPath.length,
        wavePlan.dependencyEdges,
        allTasks
      );
      let wavePlanId;
      if (this.config.autoPersist !== false) {
        wavePlanId = await this.persistWavePlan(
          horizonItemId,
          planId,
          wavePlan,
          criticalPath,
          waveAssignment,
          score
        );
      }
      return {
        wavePlanId,
        wavePlan,
        criticalPath,
        waveAssignment,
        score,
        success: false
      };
    } catch {
      return null;
    }
  }
  /**
   * Persist a wave plan to the database.
   */
  /**
   * Public so the conductor graph can persist an approved plan as its own node.
   * The graph decides *when* a plan is approved (after a human interrupt); the
   * write itself is unchanged and still versions against prior plans.
   */
  async persistWavePlan(horizonItemId, planId, wavePlan, criticalPath, waveAssignment, score) {
    const db2 = getDatabase();
    const existingPlans = await db2.select().from(wavePlans).where((0, import_drizzle_orm8.eq)(wavePlans.horizonItemId, horizonItemId)).orderBy(wavePlans.version);
    const version = existingPlans.length > 0 ? existingPlans[existingPlans.length - 1].version + 1 : 1;
    const previousWavePlanId = existingPlans.length > 0 ? existingPlans[existingPlans.length - 1].id : null;
    const [insertedWavePlan] = await db2.insert(wavePlans).values({
      planId,
      horizonItemId,
      totalWaves: waveAssignment.totalWaves,
      totalTasks: wavePlan.statistics.totalTasks,
      maxParallelism: waveAssignment.maxParallelism,
      criticalPath: criticalPath.path,
      criticalPathLength: criticalPath.length,
      parallelizationScore: score.parallelizationScore,
      status: "draft",
      currentWaveIndex: 0,
      version,
      previousWavePlanId,
      rawMarkdown: wavePlan.rawMarkdown
    }).returning();
    const wavePlanId = insertedWavePlan.id;
    for (const wave of waveAssignment.waves) {
      const [insertedWave] = await db2.insert(waves).values({
        wavePlanId,
        waveIndex: wave.waveIndex,
        label: wave.label,
        maxParallelTasks: wave.tasks.length,
        status: "pending"
      }).returning();
      for (const task of wave.tasks) {
        const isOnCriticalPath = criticalPath.path.includes(task.taskCode);
        await db2.insert(waveTasks).values({
          waveId: insertedWave.id,
          wavePlanId,
          waveIndex: wave.waveIndex,
          taskCode: task.taskCode,
          label: task.description.slice(0, 100),
          // Truncate for label
          description: task.description,
          filePaths: task.filePaths,
          dependencies: task.dependencies,
          recommendedModel: task.recommendedModel.toUpperCase(),
          complexity: task.complexity,
          isOnCriticalPath,
          canRunInParallel: task.canRunInParallel,
          status: "pending"
        });
      }
    }
    for (const edge of wavePlan.dependencyEdges) {
      await db2.insert(dependencyEdges).values({
        wavePlanId,
        fromTaskCode: edge.from,
        toTaskCode: edge.to,
        edgeType: edge.type
      });
    }
    await db2.insert(wavePlanMetrics).values({
      wavePlanId,
      wavesExecuted: 0,
      tasksCompleted: 0,
      tasksFailed: 0,
      tasksRetried: 0,
      fileConflictsAvoided: waveAssignment.adjustments.filter(
        (a) => a.type === "FILE_CONFLICT_BUMP"
      ).length,
      reOptimizationCount: 0
    });
    return wavePlanId;
  }
  /**
   * Extract task descriptions from specification text.
   */
  extractTaskDescriptions(specContent) {
    const tasks2 = [];
    const lines = specContent.split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      const numberedMatch = trimmed.match(/^\d+[.)]\s+(.+)$/);
      if (numberedMatch) {
        tasks2.push(numberedMatch[1]);
        continue;
      }
      const bulletMatch = trimmed.match(/^[-*•]\s+(.+)$/);
      if (bulletMatch) {
        tasks2.push(bulletMatch[1]);
        continue;
      }
    }
    return tasks2;
  }
  /**
   * Reoptimize an existing wave plan mid-execution.
   *
   * @param wavePlanId - ID of the wave plan to reoptimize
   * @param specContent - Original specification content
   * @param itemTitle - Title of the horizon item
   * @param repo - Repository identifier
   * @param constructorConfig - Prompt constructor configuration
   * @returns New wave plan generation result
   */
  async reoptimize(wavePlanId, specContent, itemTitle, repo, constructorConfig) {
    const db2 = getDatabase();
    const existingPlan = await db2.select().from(wavePlans).where((0, import_drizzle_orm8.eq)(wavePlans.id, wavePlanId)).limit(1);
    if (existingPlan.length === 0) {
      throw new Error(`Wave plan not found: ${wavePlanId}`);
    }
    const wavePlan = existingPlan[0];
    const existingTasks = await db2.select().from(waveTasks).where((0, import_drizzle_orm8.eq)(waveTasks.wavePlanId, wavePlanId));
    const completedTasks2 = existingTasks.filter((t) => t.status === "completed").map((t) => ({
      taskCode: t.taskCode,
      description: t.description,
      filesModified: t.filePaths || [],
      completionSummary: `Completed task: ${t.label}`
    }));
    const remainingTasks = existingTasks.filter((t) => t.status !== "completed" && t.status !== "skipped").map((t) => ({
      taskCode: t.taskCode,
      description: t.description,
      originalDependencies: t.dependencies || [],
      originalFiles: t.filePaths || []
    }));
    return this.generate(
      wavePlan.horizonItemId,
      wavePlan.planId,
      specContent,
      itemTitle,
      repo,
      {
        ...constructorConfig,
        customConstraints: [
          ...constructorConfig.customConstraints || [],
          `This is a reoptimization. ${completedTasks2.length} tasks are already complete.`,
          `Focus only on the ${remainingTasks.length} remaining tasks.`
        ]
      }
    );
  }
};
function createWavePlanGenerator(config) {
  return new WavePlanGenerator(config);
}
async function generateWavePlan(horizonItemId, planId, specContent, itemTitle, repo, workingDir, apiKey) {
  const generator = createWavePlanGenerator({
    aiClient: {
      apiKey,
      model: resolvePlannerModel(),
      maxTokens: parseInt(process.env.WAVE_PLANNER_MAX_TOKENS || "8192", 10)
    },
    refinement: {
      minParallelizationScore: parseFloat(
        process.env.WAVE_PLANNER_MIN_PARALLELIZATION || "0.3"
      ),
      maxRefinementIterations: 2
    },
    autoPersist: true
  });
  return generator.generate(
    horizonItemId,
    planId,
    specContent,
    itemTitle,
    repo,
    { workingDir }
  );
}

// src/wave-planner/plan-projection.ts
var import_drizzle_orm9 = require("drizzle-orm");
var MODEL_BASE_COST_USD = {
  HAIKU: 0.01,
  SONNET: 0.05,
  OPUS: 0.15
};
var COMPLEXITY_MULTIPLIER = {
  S: 1,
  M: 2,
  L: 3,
  XL: 4
};
function estimateTaskCostUsd(model, complexity) {
  return MODEL_BASE_COST_USD[model] * COMPLEXITY_MULTIPLIER[complexity];
}
function buildSpecContentForItem(item) {
  const lines = [];
  lines.push(`# ${item.title}`);
  lines.push("");
  const acceptanceCriteria = item.plan?.acceptanceCriteria;
  if (acceptanceCriteria && acceptanceCriteria.length > 0) {
    lines.push("## Acceptance Criteria");
    for (const criterion of acceptanceCriteria) {
      lines.push(`- ${criterion}`);
    }
    lines.push("");
  }
  const planWorkstreams = item.plan?.workstreams;
  if (planWorkstreams && planWorkstreams.length > 0) {
    lines.push("## Implementation Plan");
    for (const workstream of planWorkstreams) {
      lines.push(`### ${workstream.label}`);
      if (workstream.tasks && workstream.tasks.length > 0) {
        for (const task of workstream.tasks) {
          lines.push(`- ${task.label}`);
          if (task.filePaths && task.filePaths.length > 0) {
            lines.push(`  Files: ${task.filePaths.join(", ")}`);
          }
        }
      }
      lines.push("");
    }
  }
  return lines.join("\n");
}
async function generatePlanForItem(params) {
  const { horizonItemId, title, repo, workingDir, apiKey } = params;
  const db2 = getDatabase();
  const specContent = buildSpecContentForItem({ title });
  const [plan] = await db2.insert(plans).values({
    horizonItemId,
    estimatedCostUsd: 0,
    baselineCostUsd: 0,
    acceptanceCriteria: [],
    confidenceSignals: {},
    fleetContextSnapshot: {},
    memorySessionsUsed: []
  }).returning();
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
async function projectWavePlanToPlan(params) {
  const { planId, generation, inFlightPaths } = params;
  const db2 = getDatabase();
  const [planRow] = await db2.select({ horizonItemId: plans.horizonItemId }).from(plans).where((0, import_drizzle_orm9.eq)(plans.id, planId)).limit(1);
  if (!planRow) {
    throw new Error(`Plan not found: ${planId}`);
  }
  const [itemRow] = await db2.select({ repo: horizonItems.repo }).from(horizonItems).where((0, import_drizzle_orm9.eq)(horizonItems.id, planRow.horizonItemId)).limit(1);
  const repo = itemRow?.repo ?? "";
  const maxParallelism = generation.waveAssignment.maxParallelism;
  const projectionWaves = generation.waveAssignment.waves;
  const workstreamIds = [];
  const taskIds = [];
  let totalCostUsd = 0;
  let totalTasks = 0;
  for (const wave of projectionWaves) {
    const [workstream] = await db2.insert(workstreams).values({
      planId,
      label: wave.label,
      repo,
      workerCount: Math.min(wave.tasks.length, maxParallelism),
      orderIndex: wave.waveIndex
    }).returning();
    workstreamIds.push(workstream.id);
    for (let taskIdx = 0; taskIdx < wave.tasks.length; taskIdx++) {
      const task = wave.tasks[taskIdx];
      const model = task.recommendedModel.toUpperCase();
      const complexity = task.complexity;
      const estimatedCostUsd = estimateTaskCostUsd(model, complexity);
      totalCostUsd += estimatedCostUsd;
      totalTasks += 1;
      const filePaths = task.filePaths;
      const conflictWarning = inFlightPaths.some(
        (cp) => filePaths.some((fp) => fp.includes(cp) || cp.includes(fp))
      ) ? "File may be modified by in-flight session" : null;
      const [insertedTask] = await db2.insert(tasks).values({
        workstreamId: workstream.id,
        label: task.description.slice(0, 100),
        model,
        complexity,
        estimatedCostUsd,
        filePaths,
        conflictWarning,
        dependsOn: task.dependencies,
        orderIndex: taskIdx
      }).returning();
      taskIds.push(insertedTask.id);
    }
  }
  const uniqueFilePaths = projectionWaves.flatMap((wave) => wave.tasks.flatMap((t) => t.filePaths)).filter((v, i, a) => a.indexOf(v) === i);
  for (const path of uniqueFilePaths) {
    const inFlight = inFlightPaths.includes(path);
    await db2.insert(touchedFiles).values({
      planId,
      path,
      status: inFlight ? "IN_FLIGHT" : "AVAILABLE",
      inFlightVia: null
    });
  }
  const criticalPathLength = generation.criticalPath.length;
  const baselineMultiplier = Math.min(totalTasks / Math.max(criticalPathLength, 1), 2);
  const confidenceSignals = {
    overallConfidence: generation.score.parallelizationScore,
    parallelizationScore: generation.score.parallelizationScore,
    refinementIterations: generation.metrics.refinementIterations,
    generatedByAI: generation.success
  };
  await db2.update(plans).set({
    estimatedCostUsd: totalCostUsd,
    baselineCostUsd: totalCostUsd * baselineMultiplier,
    confidenceSignals
  }).where((0, import_drizzle_orm9.eq)(plans.id, planId));
  return { planId, workstreamIds, taskIds };
}

// src/wave-planner/execution/types.ts
var WAVE_SSE_TO_EVENT_TYPE = {
  wave_plan_created: "WAVE_PLAN_CREATED",
  wave_dispatching: "WAVE_DISPATCHING",
  wave_task_dispatched: "WAVE_TASK_DISPATCHED",
  wave_task_complete: "WAVE_TASK_COMPLETE",
  wave_task_failed: "WAVE_TASK_FAILED",
  wave_complete: "WAVE_COMPLETE",
  wave_advance: "WAVE_ADVANCE",
  wave_plan_complete: "WAVE_PLAN_COMPLETE",
  wave_plan_failed: "WAVE_PLAN_FAILED",
  wave_plan_reoptimizing: "WAVE_PLAN_REOPTIMIZING"
};
function toActivityEventType(t) {
  return WAVE_SSE_TO_EVENT_TYPE[t];
}

// src/wave-planner/execution/concurrency-manager.ts
var ConcurrencyManager = class {
  constructor(config) {
    this.activeTasks = /* @__PURE__ */ new Map();
    this.config = config;
  }
  /**
   * Check if we can dispatch additional tasks globally
   * @param count - Number of tasks to dispatch (default: 1)
   * @returns true if dispatch is allowed
   */
  canDispatch(count = 1) {
    return this.activeTasks.size + count <= this.config.maxTotalActiveTasks;
  }
  /**
   * Check if a specific wave plan can accept more dispatches
   * @param wavePlanId - The wave plan to check
   * @returns true if the plan can accept more tasks
   */
  canDispatchToWave(wavePlanId) {
    const activeForPlan = this.getActiveTasksForPlan(wavePlanId);
    return activeForPlan.length < this.config.maxConcurrentSubagents;
  }
  /**
   * Register a new active task
   * @param taskCode - Unique task identifier
   * @param wavePlanId - Parent wave plan ID
   * @param sessionId - Execution session ID
   */
  registerTask(taskCode, wavePlanId, sessionId) {
    this.activeTasks.set(taskCode, {
      taskCode,
      wavePlanId,
      sessionId,
      startedAt: /* @__PURE__ */ new Date()
    });
  }
  /**
   * Unregister a completed or failed task
   * @param taskCode - Task identifier to remove
   */
  unregisterTask(taskCode) {
    this.activeTasks.delete(taskCode);
  }
  /**
   * Get total number of active tasks across all plans
   * @returns Count of active tasks
   */
  getActiveTasks() {
    return this.activeTasks.size;
  }
  /**
   * Get all active task codes for a specific wave plan
   * @param wavePlanId - Wave plan to query
   * @returns Array of task codes
   */
  getActiveTasksForPlan(wavePlanId) {
    const result = [];
    this.activeTasks.forEach((info, taskCode) => {
      if (info.wavePlanId === wavePlanId) {
        result.push(taskCode);
      }
    });
    return result;
  }
  /**
   * Get detailed info for a specific active task
   * @param taskCode - Task to query
   * @returns Task info or undefined if not active
   */
  getActiveTaskInfo(taskCode) {
    return this.activeTasks.get(taskCode);
  }
  /**
   * Get all active tasks (for debugging/monitoring)
   * @returns Map of all active tasks
   */
  getAllActiveTasks() {
    return new Map(this.activeTasks);
  }
  /**
   * Reset the manager (useful for testing)
   */
  reset() {
    this.activeTasks.clear();
  }
};

// src/wave-planner/execution/completion-listener.ts
var import_drizzle_orm10 = require("drizzle-orm");
var TERMINAL_TASK_STATUSES = /* @__PURE__ */ new Set(["completed", "failed", "skipped"]);
var CompletionListener = class {
  constructor(onWaveComplete, options) {
    this.onWaveComplete = onWaveComplete;
    this.db = getDatabase();
    this.retryLimit = options?.retryLimit ?? 1;
    this.onCapacityFreed = options?.onCapacityFreed;
  }
  /**
   * A task reached a terminal state: either the wave is done, or a slot just
   * freed and the remaining pending tasks deserve a dispatch attempt.
   *
   * Centralised so completion and failure share it — a wave whose tasks *fail*
   * frees capacity exactly as one whose tasks succeed, and handling only the
   * success path would leave the same deadlock behind a different door.
   */
  async settleWave(wavePlanId, waveIndex) {
    if (await this.checkWaveCompletion(wavePlanId, waveIndex)) {
      await this.onWaveComplete(wavePlanId, waveIndex);
      return;
    }
    if (this.onCapacityFreed) {
      try {
        await this.onCapacityFreed(wavePlanId, waveIndex);
      } catch {
      }
    }
  }
  /**
   * Handle task started event.
   * Idempotently marks the wave task 'running'; a task already in a terminal
   * state is not resurrected (a late job:started after completion is ignored).
   */
  async handleTaskStarted(wavePlanId, taskCode, sessionId) {
    const task = await this.db.query.waveTasks.findFirst({
      where: (0, import_drizzle_orm10.and)(
        (0, import_drizzle_orm10.eq)(waveTasks.wavePlanId, wavePlanId),
        (0, import_drizzle_orm10.eq)(waveTasks.taskCode, taskCode)
      )
    });
    if (!task || TERMINAL_TASK_STATUSES.has(task.status)) {
      return;
    }
    await this.db.update(waveTasks).set({
      status: "running",
      assignedSessionId: sessionId,
      startedAt: /* @__PURE__ */ new Date()
    }).where(
      (0, import_drizzle_orm10.and)(
        (0, import_drizzle_orm10.eq)(waveTasks.wavePlanId, wavePlanId),
        (0, import_drizzle_orm10.eq)(waveTasks.taskCode, taskCode)
      )
    );
    await this.emitEvent({
      type: "wave_task_dispatched",
      wavePlanId,
      taskCode,
      sessionId
    });
  }
  /**
   * Handle task completion event.
   * Updates task status, stores completion summary, and checks if wave is complete.
   */
  async handleTaskComplete(wavePlanId, taskCode, completionSummary) {
    const task = await this.db.query.waveTasks.findFirst({
      where: (0, import_drizzle_orm10.and)(
        (0, import_drizzle_orm10.eq)(waveTasks.wavePlanId, wavePlanId),
        (0, import_drizzle_orm10.eq)(waveTasks.taskCode, taskCode)
      )
    });
    if (!task) {
      throw new Error(`Task ${taskCode} not found in wave plan ${wavePlanId}`);
    }
    if (task.status === "completed") {
      return;
    }
    await this.db.update(waveTasks).set({
      status: "completed",
      completedAt: /* @__PURE__ */ new Date(),
      completionSummary: completionSummary ?? null
    }).where(
      (0, import_drizzle_orm10.and)(
        (0, import_drizzle_orm10.eq)(waveTasks.wavePlanId, wavePlanId),
        (0, import_drizzle_orm10.eq)(waveTasks.taskCode, taskCode)
      )
    );
    await this.emitEvent({
      type: "wave_task_complete",
      wavePlanId,
      taskCode,
      waveIndex: task.waveIndex
    });
    await this.settleWave(wavePlanId, task.waveIndex);
  }
  /**
   * Handle task failure event.
   * Updates task status based on retry count and emits failure event.
   */
  async handleTaskFailed(wavePlanId, taskCode, error, retryCount) {
    const status = retryCount < this.retryLimit ? "retrying" : "failed";
    await this.db.update(waveTasks).set({
      status,
      errorMessage: error,
      retryCount
    }).where(
      (0, import_drizzle_orm10.and)(
        (0, import_drizzle_orm10.eq)(waveTasks.wavePlanId, wavePlanId),
        (0, import_drizzle_orm10.eq)(waveTasks.taskCode, taskCode)
      )
    );
    await this.emitEvent({
      type: "wave_task_failed",
      wavePlanId,
      taskCode,
      error
    });
    const failed = await this.db.query.waveTasks.findFirst({
      where: (0, import_drizzle_orm10.and)(
        (0, import_drizzle_orm10.eq)(waveTasks.wavePlanId, wavePlanId),
        (0, import_drizzle_orm10.eq)(waveTasks.taskCode, taskCode)
      )
    });
    if (failed) {
      await this.settleWave(wavePlanId, failed.waveIndex);
    }
  }
  /**
   * Check if all tasks in a wave are complete.
   * Returns true if all tasks are in a terminal state (completed, failed, or skipped).
   */
  async checkWaveCompletion(wavePlanId, waveIndex) {
    const tasks2 = await this.db.query.waveTasks.findMany({
      where: (0, import_drizzle_orm10.and)(
        (0, import_drizzle_orm10.eq)(waveTasks.wavePlanId, wavePlanId),
        (0, import_drizzle_orm10.eq)(waveTasks.waveIndex, waveIndex)
      )
    });
    return tasks2.every(
      (task) => task.status === "completed" || task.status === "failed" || task.status === "skipped"
    );
  }
  /**
   * Emit a wave execution event to the activity_events table.
   */
  async emitEvent(event) {
    let message = "";
    switch (event.type) {
      case "wave_task_dispatched":
        message = `Task ${event.taskCode} dispatched with session ${event.sessionId}`;
        break;
      case "wave_task_complete":
        message = `Task ${event.taskCode} completed in wave ${event.waveIndex}`;
        break;
      case "wave_task_failed":
        message = `Task ${event.taskCode} failed: ${event.error}`;
        break;
      default:
        message = `Wave event: ${event.type}`;
    }
    await this.db.insert(activityEvents).values({
      // Map the lowercase SSE type to the uppercase activity_events enum value
      // (the CHECK constraint only accepts uppercase members).
      type: toActivityEventType(event.type),
      message,
      metadata: event
    });
  }
};

// src/wave-planner/execution/auto-advance.ts
var import_drizzle_orm11 = require("drizzle-orm");
async function autoAdvanceWave(wavePlanId, completedWaveIndex, config) {
  const db2 = getDatabase();
  const wavePlan = await db2.query.wavePlans.findFirst({
    where: (0, import_drizzle_orm11.eq)(wavePlans.id, wavePlanId)
  });
  if (!wavePlan) {
    throw new Error(`Wave plan ${wavePlanId} not found`);
  }
  const isLastWave = completedWaveIndex >= wavePlan.totalWaves - 1;
  if (isLastWave) {
    await markWavePlanComplete(wavePlanId);
    await collectFinalMetrics(wavePlanId);
  } else {
    await sleep(config.waveAdvanceDelayMs);
    const nextWaveIndex = completedWaveIndex + 1;
    await advanceToNextWave(wavePlanId, nextWaveIndex);
  }
}
async function markWavePlanComplete(wavePlanId) {
  const db2 = getDatabase();
  await db2.update(wavePlans).set({
    status: "completed",
    completedAt: /* @__PURE__ */ new Date(),
    updatedAt: /* @__PURE__ */ new Date()
  }).where((0, import_drizzle_orm11.eq)(wavePlans.id, wavePlanId));
  await emitEvent({
    type: "wave_plan_complete",
    wavePlanId,
    metrics: {}
  });
}
async function collectFinalMetrics(wavePlanId) {
  const db2 = getDatabase();
  const wavePlan = await db2.query.wavePlans.findFirst({
    where: (0, import_drizzle_orm11.eq)(wavePlans.id, wavePlanId)
  });
  if (!wavePlan) {
    throw new Error(`Wave plan ${wavePlanId} not found`);
  }
  const tasks2 = await db2.query.waveTasks.findMany({
    where: (0, import_drizzle_orm11.eq)(waveTasks.wavePlanId, wavePlanId)
  });
  const tasksCompleted = tasks2.filter((t) => t.status === "completed").length;
  const tasksFailed = tasks2.filter((t) => t.status === "failed").length;
  const tasksRetried = tasks2.filter((t) => t.retryCount > 0).length;
  const totalWallClockMs = wavePlan.completedAt && wavePlan.startedAt ? wavePlan.completedAt.getTime() - wavePlan.startedAt.getTime() : null;
  const completedTasks2 = tasks2.filter(
    (t) => t.status === "completed" && t.startedAt && t.completedAt
  );
  let avgTaskDurationMs = null;
  if (completedTasks2.length > 0) {
    const totalDuration = completedTasks2.reduce((sum, task) => {
      if (task.startedAt && task.completedAt) {
        return sum + (task.completedAt.getTime() - task.startedAt.getTime());
      }
      return sum;
    }, 0);
    avgTaskDurationMs = Math.round(totalDuration / completedTasks2.length);
  }
  const theoreticalMinMs = avgTaskDurationMs ? avgTaskDurationMs * wavePlan.criticalPathLength : null;
  let parallelizationEfficiency = null;
  if (theoreticalMinMs && totalWallClockMs) {
    parallelizationEfficiency = theoreticalMinMs / totalWallClockMs;
  }
  const completedWaves = await db2.query.waves.findMany({
    where: (0, import_drizzle_orm11.and)(
      (0, import_drizzle_orm11.eq)(waves.wavePlanId, wavePlanId),
      (0, import_drizzle_orm11.eq)(waves.status, "completed")
    )
  });
  const wavesExecutedCount = completedWaves.length;
  await db2.insert(wavePlanMetrics).values({
    wavePlanId,
    totalWallClockMs,
    theoreticalMinMs,
    parallelizationEfficiency,
    wavesExecuted: wavesExecutedCount,
    tasksCompleted,
    tasksFailed,
    tasksRetried,
    avgTaskDurationMs,
    maxWaveWaitMs: null,
    // TODO: Calculate from wave timings
    fileConflictsAvoided: 0,
    // TODO: Track during execution
    reOptimizationCount: wavePlan.version - 1
  });
}
async function advanceToNextWave(wavePlanId, nextWaveIndex) {
  const db2 = getDatabase();
  await db2.update(wavePlans).set({
    currentWaveIndex: nextWaveIndex,
    updatedAt: /* @__PURE__ */ new Date()
  }).where((0, import_drizzle_orm11.eq)(wavePlans.id, wavePlanId));
  await db2.update(waves).set({
    status: "pending"
  }).where(
    (0, import_drizzle_orm11.and)(
      (0, import_drizzle_orm11.eq)(waves.wavePlanId, wavePlanId),
      (0, import_drizzle_orm11.eq)(waves.waveIndex, nextWaveIndex)
    )
  );
  await emitEvent({
    type: "wave_advance",
    wavePlanId,
    fromWave: nextWaveIndex - 1,
    toWave: nextWaveIndex
  });
}
async function emitEvent(event) {
  const db2 = getDatabase();
  let message = "";
  switch (event.type) {
    case "wave_plan_complete":
      message = `Wave plan ${event.wavePlanId} completed`;
      break;
    case "wave_advance":
      message = `Advanced from wave ${event.fromWave} to wave ${event.toWave}`;
      break;
    default:
      message = `Wave event: ${event.type}`;
  }
  await db2.insert(activityEvents).values({
    // Uppercase enum value required by the activity_events CHECK constraint.
    type: toActivityEventType(event.type),
    message,
    metadata: event
  });
}

// src/wave-planner/execution/controller.ts
var import_drizzle_orm12 = require("drizzle-orm");
var WaveExecutionController = class {
  constructor(config, dispatchCoordinator) {
    this.db = getDatabase();
    this.config = config;
    this.dispatchCoordinator = dispatchCoordinator;
  }
  /**
   * Approve a wave plan and dispatch wave 0
   * Transitions: draft → approved → executing
   */
  async approve(wavePlanId) {
    const wavePlan = await this.db.query.wavePlans.findFirst({
      where: (0, import_drizzle_orm12.eq)(wavePlans.id, wavePlanId)
    });
    if (!wavePlan) {
      throw new Error(`Wave plan ${wavePlanId} not found`);
    }
    if (wavePlan.status !== "draft") {
      throw new Error(`Cannot approve wave plan in status: ${wavePlan.status}`);
    }
    await this.db.update(wavePlans).set({
      status: "approved",
      updatedAt: /* @__PURE__ */ new Date()
    }).where((0, import_drizzle_orm12.eq)(wavePlans.id, wavePlanId));
    await this.dispatchWave(wavePlanId, 0);
  }
  /**
   * Pause execution of a wave plan
   * Transitions: executing → paused
   * Does not cancel running tasks, just stops new dispatches
   */
  async pause(wavePlanId) {
    const wavePlan = await this.db.query.wavePlans.findFirst({
      where: (0, import_drizzle_orm12.eq)(wavePlans.id, wavePlanId)
    });
    if (!wavePlan) {
      throw new Error(`Wave plan ${wavePlanId} not found`);
    }
    if (wavePlan.status !== "executing") {
      throw new Error(`Cannot pause wave plan in status: ${wavePlan.status}`);
    }
    await this.db.update(wavePlans).set({
      status: "paused",
      updatedAt: /* @__PURE__ */ new Date()
    }).where((0, import_drizzle_orm12.eq)(wavePlans.id, wavePlanId));
  }
  /**
   * Resume execution of a paused wave plan
   * Transitions: paused → executing
   * Dispatches current wave if not complete.
   * @returns the DispatchResult of the re-dispatched current wave, or null if
   *          the current wave was already complete (nothing re-dispatched).
   */
  async resume(wavePlanId) {
    const wavePlan = await this.db.query.wavePlans.findFirst({
      where: (0, import_drizzle_orm12.eq)(wavePlans.id, wavePlanId),
      with: {
        waves: {
          with: {
            tasks: true
          }
        }
      }
    });
    if (!wavePlan) {
      throw new Error(`Wave plan ${wavePlanId} not found`);
    }
    if (wavePlan.status !== "paused") {
      throw new Error(`Cannot resume wave plan in status: ${wavePlan.status}`);
    }
    await this.db.update(wavePlans).set({
      status: "executing",
      updatedAt: /* @__PURE__ */ new Date()
    }).where((0, import_drizzle_orm12.eq)(wavePlans.id, wavePlanId));
    const currentWave = wavePlan.waves.find((w) => w.waveIndex === wavePlan.currentWaveIndex);
    if (currentWave && currentWave.status !== "completed") {
      return this.dispatchWave(wavePlanId, wavePlan.currentWaveIndex);
    }
    return null;
  }
  /**
   * Abort a wave plan execution
   * Transitions: any → failed
   * Marks pending tasks as 'skipped'
   */
  async abort(wavePlanId) {
    const wavePlan = await this.db.query.wavePlans.findFirst({
      where: (0, import_drizzle_orm12.eq)(wavePlans.id, wavePlanId)
    });
    if (!wavePlan) {
      throw new Error(`Wave plan ${wavePlanId} not found`);
    }
    await this.db.update(wavePlans).set({
      status: "failed",
      completedAt: /* @__PURE__ */ new Date(),
      updatedAt: /* @__PURE__ */ new Date()
    }).where((0, import_drizzle_orm12.eq)(wavePlans.id, wavePlanId));
    await this.db.update(waveTasks).set({
      status: "skipped"
    }).where(
      (0, import_drizzle_orm12.and)(
        (0, import_drizzle_orm12.eq)(waveTasks.wavePlanId, wavePlanId),
        (0, import_drizzle_orm12.eq)(waveTasks.status, "pending")
      )
    );
  }
  /**
   * Dispatch a wave
   * Gets wave tasks and uses dispatch coordinator to dispatch batch
   * Updates wave status: pending → dispatching → active
   */
  async dispatchWave(wavePlanId, waveIndex) {
    const wavePlan = await this.db.query.wavePlans.findFirst({
      where: (0, import_drizzle_orm12.eq)(wavePlans.id, wavePlanId),
      with: {
        waves: {
          with: {
            tasks: true
          }
        }
      }
    });
    if (!wavePlan) {
      throw new Error(`Wave plan ${wavePlanId} not found`);
    }
    const wave = wavePlan.waves.find((w) => w.waveIndex === waveIndex);
    if (!wave) {
      throw new Error(`Wave ${waveIndex} not found in plan ${wavePlanId}`);
    }
    if (wavePlan.status === "approved") {
      await this.db.update(wavePlans).set({
        status: "executing",
        startedAt: /* @__PURE__ */ new Date(),
        updatedAt: /* @__PURE__ */ new Date()
      }).where((0, import_drizzle_orm12.eq)(wavePlans.id, wavePlanId));
    }
    await this.db.update(waves).set({
      status: "dispatching",
      startedAt: /* @__PURE__ */ new Date()
    }).where((0, import_drizzle_orm12.eq)(waves.id, wave.id));
    const result = await this.dispatchCoordinator.dispatchWave(
      wavePlanId,
      waveIndex,
      wave.tasks
    );
    await this.db.update(waves).set({
      status: "active"
    }).where((0, import_drizzle_orm12.eq)(waves.id, wave.id));
    return result;
  }
  /**
   * Handle task completion
   * Updates task status, checks if wave is complete, and advances if autoAdvance is enabled
   */
  async onTaskComplete(wavePlanId, taskCode) {
    await this.db.update(waveTasks).set({
      status: "completed",
      completedAt: /* @__PURE__ */ new Date()
    }).where(
      (0, import_drizzle_orm12.and)(
        (0, import_drizzle_orm12.eq)(waveTasks.wavePlanId, wavePlanId),
        (0, import_drizzle_orm12.eq)(waveTasks.taskCode, taskCode)
      )
    );
    const task = await this.db.query.waveTasks.findFirst({
      where: (0, import_drizzle_orm12.and)(
        (0, import_drizzle_orm12.eq)(waveTasks.wavePlanId, wavePlanId),
        (0, import_drizzle_orm12.eq)(waveTasks.taskCode, taskCode)
      )
    });
    if (!task) {
      return;
    }
    const waveIndex = task.waveIndex;
    const isWaveComplete = await this.checkWaveComplete(wavePlanId, waveIndex);
    if (isWaveComplete) {
      await this.handleWaveComplete(wavePlanId, waveIndex);
    }
  }
  /**
   * Handle wave completion: mark the wave complete, then either finish the plan
   * (last wave) or auto-advance to the next wave. Invoked by the
   * ExecutionBridge's CompletionListener callback (§6.5) and by onTaskComplete.
   */
  async handleWaveComplete(wavePlanId, waveIndex) {
    await this.db.update(waves).set({ status: "completed", completedAt: /* @__PURE__ */ new Date() }).where(
      (0, import_drizzle_orm12.and)((0, import_drizzle_orm12.eq)(waves.wavePlanId, wavePlanId), (0, import_drizzle_orm12.eq)(waves.waveIndex, waveIndex))
    );
    const wavePlan = await this.db.query.wavePlans.findFirst({
      where: (0, import_drizzle_orm12.eq)(wavePlans.id, wavePlanId)
    });
    if (!wavePlan) {
      return;
    }
    const isLastWave = waveIndex === wavePlan.totalWaves - 1;
    if (isLastWave) {
      await this.db.update(wavePlans).set({ status: "completed", completedAt: /* @__PURE__ */ new Date(), updatedAt: /* @__PURE__ */ new Date() }).where((0, import_drizzle_orm12.eq)(wavePlans.id, wavePlanId));
      return;
    }
    if (this.config.autoAdvance) {
      if (wavePlan.status !== "executing") {
        return;
      }
      const nextWaveIndex = waveIndex + 1;
      await this.db.update(wavePlans).set({ currentWaveIndex: nextWaveIndex, updatedAt: /* @__PURE__ */ new Date() }).where((0, import_drizzle_orm12.eq)(wavePlans.id, wavePlanId));
      await this.delay(this.config.waveAdvanceDelayMs);
      await this.dispatchWave(wavePlanId, nextWaveIndex);
    }
  }
  /**
   * Handle task failure. Within the retry limit, mark the task 'retrying' and
   * re-dispatch it immediately if the plan is still executing (a paused plan
   * re-dispatches the task on resume). Beyond the limit, fail terminally per
   * policy. This is where the former re-dispatch placeholder was resolved.
   */
  async onTaskFailed(wavePlanId, taskCode, error) {
    const task = await this.db.query.waveTasks.findFirst({
      where: (0, import_drizzle_orm12.and)(
        (0, import_drizzle_orm12.eq)(waveTasks.wavePlanId, wavePlanId),
        (0, import_drizzle_orm12.eq)(waveTasks.taskCode, taskCode)
      )
    });
    if (!task) {
      throw new Error(`Task ${taskCode} not found in plan ${wavePlanId}`);
    }
    if (task.retryCount < this.config.retryLimit) {
      await this.db.update(waveTasks).set({
        status: "retrying",
        retryCount: task.retryCount + 1,
        errorMessage: error
      }).where(
        (0, import_drizzle_orm12.and)(
          (0, import_drizzle_orm12.eq)(waveTasks.wavePlanId, wavePlanId),
          (0, import_drizzle_orm12.eq)(waveTasks.taskCode, taskCode)
        )
      );
      const plan = await this.db.query.wavePlans.findFirst({
        where: (0, import_drizzle_orm12.eq)(wavePlans.id, wavePlanId)
      });
      if (plan?.status === "executing") {
        const result = await this.dispatchCoordinator.redispatchTask(wavePlanId, taskCode);
        if (result.errors.length > 0) {
          await this.failTask(wavePlanId, taskCode, result.errors[0].error);
        }
      }
      return;
    }
    await this.failTask(wavePlanId, taskCode, error);
  }
  /**
   * Terminally fail a task with no retry — used by the ExecutionBridge for
   * cancellations (job:cancelled is terminal). Applies the failure policy.
   */
  async cancelTask(wavePlanId, taskCode, reason) {
    await this.failTask(wavePlanId, taskCode, reason);
  }
  /**
   * Terminally fail a task and apply the failure policy: 'halt' fails the plan
   * and skips remaining pending tasks; 'continue' leaves other tasks running.
   */
  async failTask(wavePlanId, taskCode, error) {
    const task = await this.db.query.waveTasks.findFirst({
      where: (0, import_drizzle_orm12.and)(
        (0, import_drizzle_orm12.eq)(waveTasks.wavePlanId, wavePlanId),
        (0, import_drizzle_orm12.eq)(waveTasks.taskCode, taskCode)
      )
    });
    if (!task) {
      throw new Error(`Task ${taskCode} not found in plan ${wavePlanId}`);
    }
    await this.db.update(waveTasks).set({ status: "failed", completedAt: /* @__PURE__ */ new Date(), errorMessage: error }).where(
      (0, import_drizzle_orm12.and)(
        (0, import_drizzle_orm12.eq)(waveTasks.wavePlanId, wavePlanId),
        (0, import_drizzle_orm12.eq)(waveTasks.taskCode, taskCode)
      )
    );
    if (this.config.failurePolicy === "halt") {
      await this.db.update(wavePlans).set({ status: "failed", completedAt: /* @__PURE__ */ new Date(), updatedAt: /* @__PURE__ */ new Date() }).where((0, import_drizzle_orm12.eq)(wavePlans.id, wavePlanId));
      await this.db.update(waves).set({ status: "failed", completedAt: /* @__PURE__ */ new Date() }).where(
        (0, import_drizzle_orm12.and)(
          (0, import_drizzle_orm12.eq)(waves.wavePlanId, wavePlanId),
          (0, import_drizzle_orm12.eq)(waves.waveIndex, task.waveIndex)
        )
      );
      await this.db.update(waveTasks).set({ status: "skipped" }).where(
        (0, import_drizzle_orm12.and)(
          (0, import_drizzle_orm12.eq)(waveTasks.wavePlanId, wavePlanId),
          (0, import_drizzle_orm12.eq)(waveTasks.status, "pending")
        )
      );
    }
  }
  /**
   * Check if all tasks in a wave are complete
   */
  async checkWaveComplete(wavePlanId, waveIndex) {
    const tasks2 = await this.db.query.waveTasks.findMany({
      where: (0, import_drizzle_orm12.and)(
        (0, import_drizzle_orm12.eq)(waveTasks.wavePlanId, wavePlanId),
        (0, import_drizzle_orm12.eq)(waveTasks.waveIndex, waveIndex)
      )
    });
    return tasks2.every(
      (task) => task.status === "completed" || task.status === "skipped" || task.status === "failed"
    );
  }
  /**
   * Delay helper for wave advancement
   */
  delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
};

// src/wave-planner/execution/dispatch-coordinator.ts
var import_drizzle_orm14 = require("drizzle-orm");

// src/orchestrator/ao-cli-adapter.ts
var import_child_process2 = require("child_process");
var import_util2 = require("util");
var execAsync2 = (0, import_util2.promisify)(import_child_process2.exec);

// src/orchestrator/session-prompt.ts
function buildSessionPrompt(input) {
  const {
    taskDescription,
    repo,
    fileScope,
    predecessorContext,
    acceptanceCriteria,
    constraints,
    callbackUrl,
    sessionId
  } = input;
  const sections = [];
  sections.push(`# Task

${taskDescription}

**Repository:** \`${repo}\``);
  if (fileScope.length > 0) {
    sections.push(
      `# File Scope

You hold an **exclusive lock** on the following files for the duration of this task. Do not modify files outside this set \u2014 other agents are working in parallel and edits outside your scope will conflict:

` + fileScope.map((f) => `- \`${f}\``).join("\n")
    );
  }
  if (predecessorContext.length > 0) {
    const blocks = predecessorContext.map((p) => {
      const files = p.filesModified.length > 0 ? p.filesModified.map((f) => `\`${f}\``).join(", ") : "(none recorded)";
      const summary = p.completionSummary?.trim() || "(no summary provided)";
      return `## ${p.taskCode} \u2014 ${p.description}

- Files modified: ${files}
- Summary: ${summary}`;
    }).join("\n\n");
    sections.push(
      `# Context From Predecessors

These upstream tasks completed before yours; build on their work:

${blocks}`
    );
  }
  if (acceptanceCriteria && acceptanceCriteria.length > 0) {
    sections.push(
      `# Acceptance Criteria

` + acceptanceCriteria.map((c) => `- ${c}`).join("\n")
    );
  }
  if (constraints && constraints.length > 0) {
    sections.push(
      `# Constraints

` + constraints.map((c) => `- ${c}`).join("\n")
    );
  }
  const statusUrl = `${callbackUrl}/status`;
  const completeUrl = `${callbackUrl}/complete`;
  sections.push(
    `# Reporting Protocol

You MUST report progress back to DevPilot so it can track this task. Your DevPilot session id is \`${sessionId}\` \u2014 use it as \`sessionId\` in every callback body.

**On each meaningful milestone** (and at least every 2 minutes while working), POST a status update:

\`\`\`bash
curl -sS -X POST '${statusUrl}' \\
  -H 'Content-Type: application/json' \\
  -H 'X-DevPilot-Callback-Token: <callback-token>' \\
  -d '{
    "sessionId": "${sessionId}",
    "status": "running",
    "progressPercent": 40,
    "currentStep": "implementing X",
    "message": "\u2026",
    "filesModified": ["src/lib/foo.ts"],
    "timestamp": "'"$(date -u +%Y-%m-%dT%H:%M:%SZ)"'"
  }'
\`\`\`

**Exactly once, when the task is done** (success or failure), POST the final completion report:

\`\`\`bash
curl -sS -X POST '${completeUrl}' \\
  -H 'Content-Type: application/json' \\
  -H 'X-DevPilot-Callback-Token: <callback-token>' \\
  -d '{
    "sessionId": "${sessionId}",
    "success": true,
    "filesModified": ["src/lib/foo.ts"],
    "filesCreated": [],
    "filesDeleted": [],
    "summary": "One-paragraph summary of what you did.",
    "tokensUsed": 0,
    "costUsd": 0,
    "durationMinutes": 0,
    "timestamp": "'"$(date -u +%Y-%m-%dT%H:%M:%SZ)"'"
  }'
\`\`\`

Replace \`<callback-token>\` with the token provided by your runner. Send the completion callback even if the task failed \u2014 set \`"success": false\` and include an \`"error"\` field describing what went wrong.`
  );
  return sections.join("\n\n");
}

// src/orchestrator/service.ts
var globalForOrchestrator = globalThis;
function getInstance() {
  return globalForOrchestrator.__devpilotOrchestratorService ?? null;
}
function getOrchestratorServiceOrNull() {
  return getInstance();
}

// src/orchestrator/host-wiring.ts
var import_drizzle_orm13 = require("drizzle-orm");

// src/wave-planner/execution/dispatch-coordinator.ts
var WaveDispatchCoordinator = class {
  constructor(config) {
    this.db = getDatabase();
    this.config = config;
  }
  /**
   * Dispatch a wave of tasks.
   * Checks fleet capacity, builds dispatch requests, dispatches in batches with
   * staggering. Tasks that can't reach an orchestrator (unconfigured/disabled)
   * are left pending and counted as queued — never burned as failures (§9.1).
   */
  async dispatchWave(wavePlanId, _waveIndex, tasks2) {
    const result = {
      dispatched: 0,
      queued: 0,
      errors: []
    };
    const pendingTasks = tasks2.filter(
      (t) => t.status === "pending" || t.status === "retrying"
    );
    if (pendingTasks.length === 0) {
      return result;
    }
    const capacity = await this.checkFleetCapacity();
    if (!capacity.canDispatch) {
      result.queued = pendingTasks.length;
      return result;
    }
    const maxDispatch = Math.min(
      pendingTasks.length,
      capacity.availableWorkers,
      this.config.maxConcurrentSubagents
    );
    const ctx = await this.loadDispatchContext(wavePlanId);
    for (let i = 0; i < maxDispatch; i++) {
      const task = pendingTasks[i];
      try {
        const predecessorContext = await this.getPredecessorContext(wavePlanId, task.taskCode);
        const dispatchRequest = this.buildDispatchRequest(task, predecessorContext);
        const outcome = await this.dispatchToOrchestrator(task, dispatchRequest, ctx);
        await this.db.update(waveTasks).set({
          status: "dispatched",
          startedAt: /* @__PURE__ */ new Date(),
          assignedSessionId: outcome.sessionId
        }).where((0, import_drizzle_orm14.eq)(waveTasks.id, task.id));
        result.dispatched++;
        if (i < maxDispatch - 1) {
          await this.delay(this.config.subagentDispatchDelayMs);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        if (errorMessage === "ORCHESTRATOR_UNAVAILABLE" || errorMessage === "CAPACITY" || /\b429\b/.test(errorMessage)) {
          result.queued++;
          continue;
        }
        result.errors.push({ taskCode: task.taskCode, error: errorMessage });
        await this.db.update(waveTasks).set({
          status: "failed",
          errorMessage,
          completedAt: /* @__PURE__ */ new Date()
        }).where((0, import_drizzle_orm14.eq)(waveTasks.id, task.id));
      }
    }
    result.queued += pendingTasks.length - maxDispatch;
    return result;
  }
  /**
   * Re-dispatch a single task previously marked 'retrying' (controller retry
   * path). Honours the pause guard: if the plan is no longer executing, the
   * task stays 'retrying' and is counted as queued.
   */
  async redispatchTask(wavePlanId, taskCode) {
    const result = { dispatched: 0, queued: 0, errors: [] };
    const task = await this.db.query.waveTasks.findFirst({
      where: (0, import_drizzle_orm14.and)((0, import_drizzle_orm14.eq)(waveTasks.wavePlanId, wavePlanId), (0, import_drizzle_orm14.eq)(waveTasks.taskCode, taskCode))
    });
    if (!task) {
      result.errors.push({ taskCode, error: "NOT_FOUND" });
      return result;
    }
    if (task.status !== "retrying") {
      result.errors.push({ taskCode, error: "NOT_RETRYING" });
      return result;
    }
    const plan = await this.db.query.wavePlans.findFirst({
      where: (0, import_drizzle_orm14.eq)(wavePlans.id, wavePlanId)
    });
    if (plan?.status !== "executing") {
      result.queued++;
      return result;
    }
    const ctx = await this.loadDispatchContext(wavePlanId);
    try {
      const predecessorContext = await this.getPredecessorContext(wavePlanId, taskCode);
      const request = this.buildDispatchRequest(task, predecessorContext);
      const outcome = await this.dispatchToOrchestrator(task, request, ctx);
      await this.db.update(waveTasks).set({
        status: "dispatched",
        startedAt: /* @__PURE__ */ new Date(),
        assignedSessionId: outcome.sessionId
      }).where((0, import_drizzle_orm14.eq)(waveTasks.id, task.id));
      result.dispatched++;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      if (errorMessage === "ORCHESTRATOR_UNAVAILABLE") {
        result.queued++;
        return result;
      }
      await this.db.update(waveTasks).set({ status: "failed", errorMessage, completedAt: /* @__PURE__ */ new Date() }).where((0, import_drizzle_orm14.eq)(waveTasks.id, task.id));
      result.errors.push({ taskCode, error: errorMessage });
    }
    return result;
  }
  /**
   * Build a dispatch request for a task
   * Includes task details, file scope, model, predecessor context, and constraints
   */
  buildDispatchRequest(task, predecessorContext) {
    const filePaths = task.filePaths || [];
    return {
      wavePlanId: task.wavePlanId,
      waveIndex: task.waveIndex,
      taskCode: task.taskCode,
      taskDescription: task.description,
      fileScope: filePaths,
      model: this.mapModelToDispatchModel(task.recommendedModel),
      predecessorContext,
      // File-scope guard rails so the session doesn't touch out-of-scope files.
      constraints: filePaths.length > 0 ? [`Only modify files within: ${filePaths.join(", ")}`] : []
    };
  }
  /**
   * Get predecessor context for a task
   * Fetches completion summaries for task's completed dependencies.
   */
  async getPredecessorContext(wavePlanId, taskCode) {
    const task = await this.db.query.waveTasks.findFirst({
      where: (0, import_drizzle_orm14.and)(
        (0, import_drizzle_orm14.eq)(waveTasks.wavePlanId, wavePlanId),
        (0, import_drizzle_orm14.eq)(waveTasks.taskCode, taskCode)
      )
    });
    if (!task || !task.dependencies || task.dependencies.length === 0) {
      return [];
    }
    const predecessorSummaries = [];
    for (const depTaskCode of task.dependencies) {
      const depTask = await this.db.query.waveTasks.findFirst({
        where: (0, import_drizzle_orm14.and)(
          (0, import_drizzle_orm14.eq)(waveTasks.wavePlanId, wavePlanId),
          (0, import_drizzle_orm14.eq)(waveTasks.taskCode, depTaskCode),
          (0, import_drizzle_orm14.eq)(waveTasks.status, "completed")
        )
      });
      if (depTask) {
        predecessorSummaries.push({
          taskCode: depTask.taskCode,
          description: depTask.description,
          filesModified: depTask.filePaths || [],
          completionSummary: depTask.completionSummary ?? ""
        });
      }
    }
    return predecessorSummaries;
  }
  /**
   * Load repo / item title / linear ticket for a wave plan (wavePlans →
   * horizonItems). Cached per dispatchWave call by the caller.
   */
  async loadDispatchContext(wavePlanId) {
    const wavePlan = await this.db.query.wavePlans.findFirst({
      where: (0, import_drizzle_orm14.eq)(wavePlans.id, wavePlanId)
    });
    if (!wavePlan) {
      throw new Error(`Wave plan ${wavePlanId} not found`);
    }
    const item = await this.db.query.horizonItems.findFirst({
      where: (0, import_drizzle_orm14.eq)(horizonItems.id, wavePlan.horizonItemId)
    });
    if (!item) {
      throw new Error(`Horizon item ${wavePlan.horizonItemId} not found`);
    }
    return {
      repo: item.repo,
      itemTitle: item.title,
      linearTicketId: item.linearTicketId
    };
  }
  /**
   * Check fleet capacity
   * Returns available workers and whether new tasks can be dispatched
   */
  async checkFleetCapacity() {
    const runningTasks = await this.db.query.waveTasks.findMany({
      where: (0, import_drizzle_orm14.eq)(waveTasks.status, "running")
    });
    const activeWorkers = runningTasks.length;
    const totalWorkers = this.config.maxTotalActiveTasks;
    const availableWorkers = Math.max(0, totalWorkers - activeWorkers);
    const canDispatch = availableWorkers > 0;
    return {
      totalWorkers,
      activeWorkers,
      availableWorkers,
      canDispatch
    };
  }
  /**
   * Dispatch a single task to the orchestrator service.
   *
   * Creates a rufloSessions row, builds the session prompt + DispatchRequest,
   * dispatches through the active adapter, and records the session ↔ task
   * correlation on success. Throws 'ORCHESTRATOR_UNAVAILABLE' when no
   * orchestrator is configured (caller queues rather than fails the task).
   */
  async dispatchToOrchestrator(task, request, ctx) {
    const service = getOrchestratorServiceOrNull();
    if (!service || !service.isEnabled) {
      throw new Error("ORCHESTRATOR_UNAVAILABLE");
    }
    const [session] = await this.db.insert(rufloSessions).values({
      repo: ctx.repo,
      linearTicketId: ctx.linearTicketId ?? `DP-${task.taskCode}-${Date.now()}`,
      ticketTitle: `${ctx.itemTitle} \u2014 ${task.taskCode} ${task.label}`,
      // +1: waveIndex is 0-based internally, and every surface a person
      // reads counts from 1 — the board says "wave 1 of 2" while these cards
      // said "Wave 0" for the same work.
      currentWorkstream: `Wave ${task.waveIndex + 1} \xB7 ${task.taskCode}`,
      status: "ACTIVE",
      progressPercent: 0,
      inFlightFiles: task.filePaths ?? []
    }).returning();
    const prompt = buildSessionPrompt({
      taskDescription: request.taskDescription,
      repo: ctx.repo,
      fileScope: request.fileScope,
      predecessorContext: request.predecessorContext.map((p) => ({
        taskCode: p.taskCode,
        description: p.description,
        filesModified: p.filesModified,
        completionSummary: p.completionSummary
      })),
      constraints: request.constraints,
      callbackUrl: this.config.callbackUrl,
      sessionId: session.id
    });
    const dispatchReq = {
      sessionId: session.id,
      repo: ctx.repo,
      callbackUrl: this.config.callbackUrl,
      taskSpec: {
        prompt,
        filePaths: request.fileScope,
        model: request.model,
        workstream: `wave-${request.waveIndex}`,
        constraints: request.constraints
      },
      linearTicketId: ctx.linearTicketId ?? void 0,
      metadata: {
        wavePlanId: request.wavePlanId,
        waveIndex: request.waveIndex,
        taskCode: request.taskCode
      }
    };
    const response = await service.dispatch(dispatchReq);
    if (!response.accepted) {
      await this.db.delete(rufloSessions).where((0, import_drizzle_orm14.eq)(rufloSessions.id, session.id));
      throw new Error(response.error ?? "DISPATCH_REJECTED");
    }
    await this.db.update(rufloSessions).set({
      externalSessionId: response.orchestratorJobId ?? null,
      orchestratorMode: service.mode,
      updatedAt: /* @__PURE__ */ new Date()
    }).where((0, import_drizzle_orm14.eq)(rufloSessions.id, session.id));
    return {
      sessionId: session.id,
      externalJobId: response.orchestratorJobId ?? "",
      mode: service.mode
    };
  }
  /**
   * Map database model enum to dispatch model format
   */
  mapModelToDispatchModel(model) {
    if (!model) {
      return "sonnet";
    }
    const modelLower = model.toLowerCase();
    if (modelLower === "haiku") return "haiku";
    if (modelLower === "opus") return "opus";
    return "sonnet";
  }
  /**
   * Delay helper for staggering dispatches
   */
  delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
};

// src/wave-planner/execution/execution-bridge.ts
var import_drizzle_orm15 = require("drizzle-orm");
var bridgeInstance = null;
var ExecutionBridge = class {
  constructor(orchestrator, options) {
    this.orchestrator = orchestrator;
    this.unsubscribe = null;
    this.db = getDatabase();
    this.coordinator = new WaveDispatchCoordinator(options.execution);
    this.controller = new WaveExecutionController(options.execution, this.coordinator);
    this.listener = new CompletionListener(
      (wavePlanId, waveIndex) => this.controller.handleWaveComplete(wavePlanId, waveIndex),
      {
        retryLimit: options.execution.retryLimit,
        // Re-run the wave's dispatcher whenever a slot frees. `dispatchWave`
        // re-selects pending/retrying tasks and respects the concurrency cap, so
        // calling it again is safe and is what drains a wave larger than the cap.
        onCapacityFreed: (wavePlanId, waveIndex) => this.controller.dispatchWave(wavePlanId, waveIndex).then(() => void 0)
      }
    );
  }
  /** Subscribe to orchestrator events. Idempotent. */
  start() {
    if (this.unsubscribe) return;
    this.unsubscribe = this.orchestrator.onEvent((event) => {
      void this.handleEvent(event);
    });
  }
  /** Unsubscribe. */
  stop() {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
  }
  /** Resolve a DevPilot sessionId to its owning wave task, if any. */
  async resolveTask(sessionId) {
    const task = await this.db.query.waveTasks.findFirst({
      where: (0, import_drizzle_orm15.eq)(waveTasks.assignedSessionId, sessionId)
    });
    if (!task) return null;
    return { wavePlanId: task.wavePlanId, taskCode: task.taskCode };
  }
  async handleEvent(event) {
    try {
      if (event.type === "job:progress") return;
      const found = await this.resolveTask(event.sessionId);
      if (!found) return;
      const { wavePlanId, taskCode } = found;
      switch (event.type) {
        case "job:started":
          await this.listener.handleTaskStarted(wavePlanId, taskCode, event.sessionId);
          break;
        case "job:complete": {
          const report = event.data;
          await this.listener.handleTaskComplete(wavePlanId, taskCode, report.summary);
          break;
        }
        case "job:error":
          await this.controller.onTaskFailed(wavePlanId, taskCode, this.errorMessage(event.data));
          break;
        case "job:cancelled":
          await this.controller.cancelTask(wavePlanId, taskCode, "cancelled");
          break;
      }
    } catch (err) {
      try {
        await this.db.insert(activityEvents).values({
          type: "WAVE_TASK_FAILED",
          message: `ExecutionBridge handler error for session ${event.sessionId}: ${err instanceof Error ? err.message : String(err)}`,
          metadata: { sessionId: event.sessionId, eventType: event.type }
        });
      } catch {
      }
    }
  }
  /** Extract a human-readable error from a job:error payload. */
  errorMessage(data) {
    if (data && typeof data === "object") {
      const d = data;
      if (typeof d.error === "string") return d.error;
      if (d.error && typeof d.error === "object" && "message" in d.error) {
        return String(d.error.message);
      }
      if (typeof d.summary === "string") return d.summary;
      if (typeof d.message === "string") return d.message;
    }
    return "error";
  }
};
function initExecutionBridge(orchestrator, options) {
  if (bridgeInstance) {
    bridgeInstance.stop();
  }
  bridgeInstance = new ExecutionBridge(orchestrator, options);
  return bridgeInstance;
}
function getExecutionBridgeOrNull() {
  return bridgeInstance;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  CodebaseContextService,
  CompletionListener,
  ConcurrencyManager,
  DEFAULT_PLANNER_MODEL,
  DEFAULT_WIKI_MODEL,
  ExecutionBridge,
  FleetContextService,
  PlanRefinementService,
  PromptConstructor,
  WaveDispatchCoordinator,
  WaveExecutionController,
  WavePlanGenerator,
  WavePlannerAIClient,
  advanceToNextWave,
  assignWaves,
  autoAdvanceWave,
  buildDAGGraph,
  buildSpecContentForItem,
  collectFinalMetrics,
  computeCriticalPath,
  createFlatPlan,
  createFlatPlanFromDescriptions,
  createPlanRefinementService,
  createPromptConstructor,
  createWavePlanGenerator,
  defaultTemplate,
  extractAllTaskCodes,
  extractWaveFromTaskCode,
  findCommonTheme,
  findTaskByCode,
  generatePlanForItem,
  generateWaveLabel,
  generateWavePlan,
  getExecutionBridgeOrNull,
  getTasksInWave,
  groupBy,
  initExecutionBridge,
  markWavePlanComplete,
  normalizeComplexity,
  normalizeModel,
  parseDependencies,
  parseFilePaths,
  parseWavePlanResponse,
  projectWavePlanToPlan,
  refinementTemplate,
  resolvePlannerModel,
  resolveWikiModel,
  scorePlan,
  simplifiedTemplate,
  sleep,
  toActivityEventType,
  topologicalSort,
  validateDAG
});
//# sourceMappingURL=index.js.map