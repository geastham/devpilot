"use client";

// src/components/DAGVisualization.tsx
import { useMemo, useState } from "react";

// src/cn.ts
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
function cn(...inputs) {
  return twMerge(clsx(inputs));
}

// src/plan-text.ts
function plainText(value) {
  return value.replace(/\*\*(.+?)\*\*/g, "$1").replace(/`([^`]+)`/g, "$1").replace(/(^|\s)_([^_]+)_(?=\s|$)/g, "$1$2").trim();
}
function pluralize(count, noun, plural = `${noun}s`) {
  return `${count} ${count === 1 ? noun : plural}`;
}

// src/components/DAGVisualization.tsx
import { jsx, jsxs } from "react/jsx-runtime";
var STALL_MS = 18e4;
var NODE_WIDTH = 180;
var NODE_HEIGHT = 80;
var WAVE_VERTICAL_SPACING = 150;
var TASK_HORIZONTAL_SPACING = 200;
var PADDING = 40;
function getTaskStatusColor(status) {
  switch (status) {
    case "pending":
      return "bg-gray-700 border-gray-600";
    case "running":
      return "bg-blue-700 border-blue-600";
    case "completed":
      return "bg-green-700 border-green-600";
    case "failed":
      return "bg-red-700 border-red-600";
    default:
      return "bg-gray-700 border-gray-600";
  }
}
function calculateLayout(waveTasks, criticalPath) {
  const taskNodes = [];
  const criticalPathSet = new Set(criticalPath);
  const waveGroups = /* @__PURE__ */ new Map();
  waveTasks.forEach((task) => {
    const wave = task.waveIndex;
    if (!waveGroups.has(wave)) {
      waveGroups.set(wave, []);
    }
    waveGroups.get(wave).push(task);
  });
  const sortedWaves = Array.from(waveGroups.keys()).sort((a, b) => a - b);
  sortedWaves.forEach((waveIndex) => {
    const tasksInWave = waveGroups.get(waveIndex);
    const waveY = PADDING + waveIndex * WAVE_VERTICAL_SPACING;
    const totalWidth = tasksInWave.length * (NODE_WIDTH + TASK_HORIZONTAL_SPACING) - TASK_HORIZONTAL_SPACING;
    const startX = PADDING;
    tasksInWave.forEach((task, index) => {
      const x = startX + index * (NODE_WIDTH + TASK_HORIZONTAL_SPACING);
      const y = waveY;
      taskNodes.push({
        task,
        position: { x, y },
        isOnCriticalPath: criticalPathSet.has(task.taskCode)
      });
    });
  });
  return taskNodes;
}
function calculateEdges(taskNodes, dependencyEdges, criticalPath) {
  const taskPositionMap = /* @__PURE__ */ new Map();
  taskNodes.forEach((node) => {
    taskPositionMap.set(node.task.taskCode, node.position);
  });
  return dependencyEdges.map((edge) => {
    const fromPos = taskPositionMap.get(edge.fromTaskCode);
    const toPos = taskPositionMap.get(edge.toTaskCode);
    if (!fromPos || !toPos) return null;
    const fromCenter = {
      x: fromPos.x + NODE_WIDTH / 2,
      y: fromPos.y + NODE_HEIGHT / 2
    };
    const toCenter = {
      x: toPos.x + NODE_WIDTH / 2,
      y: toPos.y + NODE_HEIGHT / 2
    };
    return {
      from: edge.fromTaskCode,
      to: edge.toTaskCode,
      type: edge.edgeType,
      // An edge is on the critical path only when BOTH endpoints are, and
      // they are adjacent in it. Testing endpoints alone lights up every edge
      // that merely touches the path, which turns the longest chain into a
      // bush and defeats the point of showing it.
      onCriticalPath: (() => {
        const a = criticalPath.indexOf(edge.fromTaskCode);
        const b = criticalPath.indexOf(edge.toTaskCode);
        return a !== -1 && b !== -1 && b === a + 1;
      })(),
      fromPos: fromCenter,
      toPos: toCenter
    };
  }).filter((edge) => edge !== null);
}
function DAGVisualization({
  wavePlan,
  waveTasks,
  dependencyEdges,
  criticalPath,
  onTaskClick,
  live
}) {
  const [zoom, setZoom] = useState(1);
  const [selectedTask, setSelectedTask] = useState(null);
  const statusByCode = useMemo(
    () => new Map(waveTasks.map((t) => [t.taskCode, t.status])),
    [waveTasks]
  );
  const { taskNodes, edges, viewBox } = useMemo(() => {
    const nodes = calculateLayout(waveTasks, criticalPath);
    const calculatedEdges = calculateEdges(nodes, dependencyEdges, criticalPath);
    const maxX = Math.max(...nodes.map((n) => n.position.x + NODE_WIDTH));
    const maxY = Math.max(...nodes.map((n) => n.position.y + NODE_HEIGHT));
    const width = maxX + PADDING;
    const height = maxY + PADDING;
    return {
      taskNodes: nodes,
      edges: calculatedEdges,
      viewBox: { width, height }
    };
  }, [waveTasks, dependencyEdges, criticalPath]);
  const handleTaskClick = (taskCode) => {
    setSelectedTask(taskCode);
    onTaskClick?.(taskCode);
  };
  const handleZoomIn = () => setZoom((prev) => Math.min(prev + 0.2, 2));
  const handleZoomOut = () => setZoom((prev) => Math.max(prev - 0.2, 0.5));
  const handleZoomReset = () => setZoom(1);
  return /* @__PURE__ */ jsxs("div", { className: "relative w-full h-full bg-bg-base rounded-lg border border-border-default overflow-hidden", children: [
    /* @__PURE__ */ jsxs("div", { className: "absolute top-4 right-4 z-10 flex gap-2 bg-bg-surface rounded-lg border border-border-default p-2 shadow-lg", children: [
      /* @__PURE__ */ jsx(
        "button",
        {
          onClick: handleZoomIn,
          className: "px-3 py-1 text-sm text-text-primary hover:bg-white/5 rounded transition-colors",
          title: "Zoom In",
          children: "+"
        }
      ),
      /* @__PURE__ */ jsxs(
        "button",
        {
          onClick: handleZoomReset,
          className: "px-3 py-1 text-sm text-text-secondary hover:text-text-primary hover:bg-white/5 rounded transition-colors",
          title: "Reset Zoom",
          children: [
            Math.round(zoom * 100),
            "%"
          ]
        }
      ),
      /* @__PURE__ */ jsx(
        "button",
        {
          onClick: handleZoomOut,
          className: "px-3 py-1 text-sm text-text-primary hover:bg-white/5 rounded transition-colors",
          title: "Zoom Out",
          children: "-"
        }
      )
    ] }),
    /* @__PURE__ */ jsx("div", { className: "w-full h-full overflow-auto", children: /* @__PURE__ */ jsxs(
      "svg",
      {
        width: viewBox.width * zoom,
        height: viewBox.height * zoom,
        viewBox: `0 0 ${viewBox.width} ${viewBox.height}`,
        className: "min-w-full min-h-full",
        children: [
          /* @__PURE__ */ jsxs("defs", { children: [
            /* @__PURE__ */ jsx(
              "marker",
              {
                id: "arrowhead-critical",
                markerWidth: "10",
                markerHeight: "10",
                refX: "9",
                refY: "3",
                orient: "auto",
                children: /* @__PURE__ */ jsx("polygon", { points: "0 0, 10 3, 0 6", fill: "#34D399" })
              }
            ),
            /* @__PURE__ */ jsx(
              "marker",
              {
                id: "arrowhead",
                markerWidth: "10",
                markerHeight: "10",
                refX: "9",
                refY: "3",
                orient: "auto",
                children: /* @__PURE__ */ jsx(
                  "polygon",
                  {
                    points: "0 0, 10 3, 0 6",
                    fill: "#4B5563",
                    className: "transition-colors"
                  }
                )
              }
            )
          ] }),
          /* @__PURE__ */ jsx("g", { className: "edges", children: edges.map((edge, index) => {
            const isDashed = edge.type === "soft";
            const fromStatus = statusByCode.get(edge.from);
            const toStatus = statusByCode.get(edge.to);
            const unblocking = fromStatus === "completed" && (toStatus === "dispatched" || toStatus === "running");
            if (edge.onCriticalPath) {
              return /* @__PURE__ */ jsx(
                "line",
                {
                  x1: edge.fromPos.x,
                  y1: edge.fromPos.y,
                  x2: edge.toPos.x,
                  y2: edge.toPos.y,
                  stroke: "#34D399",
                  strokeWidth: "3",
                  markerEnd: "url(#arrowhead-critical)",
                  className: "dp-flow",
                  style: { filter: "drop-shadow(0 0 4px rgba(52,211,153,0.5))" }
                },
                `edge-${index}`
              );
            }
            return /* @__PURE__ */ jsx(
              "line",
              {
                x1: edge.fromPos.x,
                y1: edge.fromPos.y,
                x2: edge.toPos.x,
                y2: edge.toPos.y,
                stroke: unblocking ? "#60A5FA" : "#4B5563",
                strokeWidth: unblocking ? "2.5" : "2",
                strokeDasharray: unblocking ? void 0 : isDashed ? "5,5" : "0",
                markerEnd: "url(#arrowhead)",
                className: cn("transition-all", unblocking && "dp-edge-flow")
              },
              `edge-${index}`
            );
          }) }),
          /* @__PURE__ */ jsx("g", { className: "nodes", children: taskNodes.map((node) => {
            const isSelected = selectedTask === node.task.taskCode;
            const statusColor = getTaskStatusColor(node.task.status);
            const liveState = live?.[node.task.taskCode];
            const telemetry = liveState?.telemetry;
            const working = node.task.status === "dispatched" || node.task.status === "running";
            const stalled = working && (telemetry?.idleMs ?? 0) > STALL_MS;
            const justDone = node.task.status === "completed";
            const doing = telemetry?.lastAction ? `${telemetry.lastAction.tool.toLowerCase()} ${telemetry.lastAction.path?.split("/").slice(-1)[0] ?? ""}`.trim() : void 0;
            return /* @__PURE__ */ jsxs(
              "g",
              {
                transform: `translate(${node.position.x}, ${node.position.y})`,
                onClick: () => handleTaskClick(node.task.taskCode),
                className: "cursor-pointer transition-transform hover:scale-105",
                children: [
                  working && !stalled && /* @__PURE__ */ jsx(
                    "rect",
                    {
                      x: -4,
                      y: -4,
                      width: NODE_WIDTH + 8,
                      height: NODE_HEIGHT + 8,
                      rx: "9",
                      fill: "none",
                      stroke: "rgba(59,130,246,0.5)",
                      strokeWidth: "2",
                      className: "dp-node-halo"
                    }
                  ),
                  /* @__PURE__ */ jsx(
                    "rect",
                    {
                      width: NODE_WIDTH,
                      height: NODE_HEIGHT,
                      rx: "6",
                      className: cn(
                        "transition-all",
                        statusColor,
                        working && !stalled && "dp-node-alive",
                        stalled && "dp-node-stalled",
                        justDone && "dp-node-settle",
                        isSelected && "ring-2 ring-accent-primary ring-offset-2",
                        node.isOnCriticalPath && "ring-2 ring-yellow-500"
                      )
                    }
                  ),
                  stalled && /* @__PURE__ */ jsx("circle", { cx: NODE_WIDTH - 10, cy: 10, r: "4", fill: "#F59E0B" }),
                  /* @__PURE__ */ jsx(
                    "text",
                    {
                      x: NODE_WIDTH / 2,
                      y: 25,
                      textAnchor: "middle",
                      className: "fill-white font-semibold text-sm",
                      children: node.task.taskCode
                    }
                  ),
                  /* @__PURE__ */ jsx(
                    "text",
                    {
                      x: NODE_WIDTH / 2,
                      y: 45,
                      textAnchor: "middle",
                      className: "fill-gray-300 text-xs",
                      children: (() => {
                        const label = plainText(node.task.label);
                        return label.length > 20 ? `${label.substring(0, 20)}...` : label;
                      })()
                    }
                  ),
                  /* @__PURE__ */ jsx(
                    "text",
                    {
                      x: NODE_WIDTH / 2,
                      y: 65,
                      textAnchor: "middle",
                      className: cn(
                        "text-xs",
                        doing ? "fill-blue-300" : "fill-gray-400 capitalize"
                      ),
                      children: doing ? doing.length > 24 ? `${doing.slice(0, 24)}\u2026` : doing : stalled ? "quiet" : node.task.status
                    }
                  )
                ]
              },
              node.task.taskCode
            );
          }) })
        ]
      }
    ) }),
    selectedTask && /* @__PURE__ */ jsx("div", { className: "absolute bottom-4 left-4 right-4 bg-bg-surface rounded-lg border border-border-default p-4 shadow-lg z-10", children: (() => {
      const task = waveTasks.find((t) => t.taskCode === selectedTask);
      if (!task) return null;
      return /* @__PURE__ */ jsxs("div", { className: "space-y-2", children: [
        /* @__PURE__ */ jsxs("div", { className: "flex items-start justify-between", children: [
          /* @__PURE__ */ jsxs("div", { children: [
            /* @__PURE__ */ jsxs("h3", { className: "text-sm font-semibold text-text-primary", children: [
              task.taskCode,
              ": ",
              plainText(task.label)
            ] }),
            /* @__PURE__ */ jsx("p", { className: "text-xs text-text-secondary mt-1", children: task.description ? plainText(task.description) : "No description available" })
          ] }),
          /* @__PURE__ */ jsx(
            "button",
            {
              onClick: () => setSelectedTask(null),
              className: "text-text-secondary hover:text-text-primary transition-colors",
              children: /* @__PURE__ */ jsx("svg", { className: "w-5 h-5", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", children: /* @__PURE__ */ jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M6 18L18 6M6 6l12 12" }) })
            }
          )
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-2 gap-4 text-xs", children: [
          /* @__PURE__ */ jsxs("div", { children: [
            /* @__PURE__ */ jsx("span", { className: "text-text-secondary", children: "Wave:" }),
            " ",
            /* @__PURE__ */ jsx("span", { className: "text-text-primary", children: task.waveIndex + 1 })
          ] }),
          /* @__PURE__ */ jsxs("div", { children: [
            /* @__PURE__ */ jsx("span", { className: "text-text-secondary", children: "Status:" }),
            " ",
            /* @__PURE__ */ jsx("span", { className: "text-text-primary capitalize", children: task.status })
          ] }),
          task.complexity && /* @__PURE__ */ jsxs("div", { children: [
            /* @__PURE__ */ jsx("span", { className: "text-text-secondary", children: "Complexity:" }),
            " ",
            /* @__PURE__ */ jsx("span", { className: "text-text-primary", children: task.complexity })
          ] }),
          task.recommendedModel && /* @__PURE__ */ jsxs("div", { children: [
            /* @__PURE__ */ jsx("span", { className: "text-text-secondary", children: "Model:" }),
            " ",
            /* @__PURE__ */ jsx("span", { className: "text-text-primary capitalize", children: task.recommendedModel })
          ] }),
          /* @__PURE__ */ jsxs("div", { children: [
            /* @__PURE__ */ jsx("span", { className: "text-text-secondary", children: "Parallel:" }),
            " ",
            /* @__PURE__ */ jsx("span", { className: "text-text-primary", children: task.canRunInParallel ? "Yes" : "No" })
          ] }),
          task.isOnCriticalPath && /* @__PURE__ */ jsx("div", { className: "col-span-2", children: /* @__PURE__ */ jsx("span", { className: "text-yellow-500 font-semibold", children: "\u2B50 On Critical Path" }) })
        ] }),
        task.dependencies && task.dependencies.length > 0 && /* @__PURE__ */ jsxs("div", { className: "pt-2 border-t border-border-default", children: [
          /* @__PURE__ */ jsx("span", { className: "text-xs text-text-secondary", children: "Dependencies: " }),
          /* @__PURE__ */ jsx("span", { className: "text-xs text-text-primary", children: task.dependencies.join(", ") })
        ] }),
        task.filePaths && task.filePaths.length > 0 && /* @__PURE__ */ jsxs("div", { className: "pt-2 border-t border-border-default", children: [
          /* @__PURE__ */ jsx("span", { className: "text-xs text-text-secondary", children: "Files: " }),
          /* @__PURE__ */ jsx("span", { className: "text-xs text-text-primary", children: task.filePaths.join(", ") })
        ] })
      ] });
    })() })
  ] });
}

// src/components/CriticalPathIndicator.tsx
import { useMemo as useMemo2 } from "react";

// src/format.ts
function formatMinutes(minutes) {
  if (minutes >= 60) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
  return `${minutes}m`;
}
function getComplexityColor(complexity) {
  const colors = {
    S: "complexity-s",
    M: "complexity-m",
    L: "complexity-l",
    XL: "complexity-xl"
  };
  return colors[complexity];
}
function getModelColor(model) {
  const colors = {
    haiku: "badge-haiku",
    sonnet: "badge-sonnet",
    opus: "badge-opus"
  };
  return colors[model.toLowerCase()] ?? "badge-sonnet";
}
function modelLabel(model) {
  const lower = model.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}
function stringToColor(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return `hsl(${Math.abs(hash % 360)}, 70%, 55%)`;
}

// src/components/CriticalPathIndicator.tsx
import { jsx as jsx2, jsxs as jsxs2 } from "react/jsx-runtime";
function CriticalPathIndicator({
  wavePlan,
  criticalPath,
  waveProgress,
  currentWaveIndex,
  className
}) {
  const criticalPathTasks = useMemo2(() => {
    const pathTaskCodes = criticalPath?.path ?? wavePlan.criticalPath;
    const tasks = [];
    const taskMap = /* @__PURE__ */ new Map();
    for (const wave of wavePlan.waves) {
      for (const task of wave.tasks) {
        taskMap.set(task.taskCode, { task, waveIndex: wave.waveIndex });
      }
    }
    for (const taskCode of pathTaskCodes) {
      const entry = taskMap.get(taskCode);
      if (!entry) continue;
      const { task, waveIndex } = entry;
      let status = "pending";
      if (waveProgress) {
        const progress = waveProgress.get(waveIndex);
        if (progress) {
          if (progress.status === "completed") {
            status = "complete";
          } else if (progress.status === "active" || progress.status === "dispatching") {
            status = "active";
          }
        }
      } else if (currentWaveIndex !== void 0) {
        if (waveIndex < currentWaveIndex) {
          status = "complete";
        } else if (waveIndex === currentWaveIndex) {
          status = "active";
        }
      }
      const complexityMinutes = {
        S: 5,
        M: 15,
        L: 30,
        XL: 60
      };
      tasks.push({
        taskCode: task.taskCode,
        description: task.description,
        waveIndex,
        status,
        estimatedMinutes: complexityMinutes[task.complexity]
      });
    }
    return tasks;
  }, [wavePlan, criticalPath, waveProgress, currentWaveIndex]);
  const { completedTasks, activeTasks, totalTasks, remainingMinutes } = useMemo2(() => {
    const completed = criticalPathTasks.filter((t) => t.status === "complete").length;
    const active = criticalPathTasks.filter((t) => t.status === "active").length;
    const total = criticalPathTasks.length;
    const remaining = criticalPathTasks.filter((t) => t.status !== "complete").reduce((sum, t) => sum + t.estimatedMinutes, 0);
    return {
      completedTasks: completed,
      activeTasks: active,
      totalTasks: total,
      remainingMinutes: remaining
    };
  }, [criticalPathTasks]);
  const progressPercent = totalTasks > 0 ? completedTasks / totalTasks * 100 : 0;
  return /* @__PURE__ */ jsxs2("div", { className: cn("space-y-4", className), children: [
    /* @__PURE__ */ jsxs2("div", { className: "flex items-center justify-between", children: [
      /* @__PURE__ */ jsxs2("div", { className: "space-y-1", children: [
        /* @__PURE__ */ jsx2("h3", { className: "text-sm font-medium text-text-primary", children: "Critical Path" }),
        /* @__PURE__ */ jsxs2("p", { className: "text-xs text-text-secondary", children: [
          completedTasks,
          " of ",
          pluralize(totalTasks, "task"),
          " complete"
        ] })
      ] }),
      /* @__PURE__ */ jsxs2("div", { className: "text-right space-y-1", children: [
        /* @__PURE__ */ jsx2("div", { className: "text-sm font-medium text-accent-amber", children: formatMinutes(remainingMinutes) }),
        /* @__PURE__ */ jsx2("div", { className: "text-xs text-text-secondary", children: "remaining" })
      ] })
    ] }),
    /* @__PURE__ */ jsx2("div", { className: "h-2 rounded-full bg-bg-panel overflow-hidden", children: /* @__PURE__ */ jsx2(
      "div",
      {
        className: "h-full bg-accent-amber transition-all duration-300",
        style: { width: `${progressPercent}%` }
      }
    ) }),
    /* @__PURE__ */ jsx2("div", { className: "space-y-2", children: criticalPathTasks.map((task, index) => {
      const isLast = index === criticalPathTasks.length - 1;
      return /* @__PURE__ */ jsxs2("div", { className: "flex items-start gap-3", children: [
        /* @__PURE__ */ jsxs2("div", { className: "flex flex-col items-center pt-1", children: [
          /* @__PURE__ */ jsx2(
            "div",
            {
              className: cn(
                "w-3 h-3 rounded-full border-2 transition-all duration-300",
                task.status === "complete" && "bg-accent-green border-accent-green",
                task.status === "active" && "bg-accent-primary border-accent-primary animate-pulse",
                task.status === "pending" && "bg-transparent border-border-default"
              )
            }
          ),
          !isLast && /* @__PURE__ */ jsx2(
            "div",
            {
              className: cn(
                "w-0.5 h-full mt-1 transition-colors duration-300",
                task.status === "complete" ? "bg-accent-green" : "bg-border-default"
              ),
              style: { minHeight: "20px" }
            }
          )
        ] }),
        /* @__PURE__ */ jsx2("div", { className: "min-w-0 flex-1 pb-2", children: /* @__PURE__ */ jsxs2("div", { className: "flex items-start justify-between gap-2", children: [
          /* @__PURE__ */ jsxs2("div", { className: "flex-1 min-w-0", children: [
            /* @__PURE__ */ jsxs2("div", { className: "flex items-center gap-2", children: [
              /* @__PURE__ */ jsx2("span", { className: "text-xs font-mono text-text-tertiary", children: task.taskCode }),
              task.status === "active" && /* @__PURE__ */ jsx2("span", { className: "text-xs text-accent-primary font-medium", children: "IN PROGRESS" })
            ] }),
            /* @__PURE__ */ jsx2(
              "p",
              {
                className: cn(
                  "text-sm mt-0.5 truncate",
                  task.status === "complete" ? "text-text-secondary line-through" : "text-text-primary"
                ),
                title: plainText(task.description),
                children: plainText(task.description)
              }
            )
          ] }),
          /* @__PURE__ */ jsx2("div", { className: "text-xs text-text-tertiary whitespace-nowrap", children: formatMinutes(task.estimatedMinutes) })
        ] }) })
      ] }, task.taskCode);
    }) }),
    /* @__PURE__ */ jsx2("div", { className: "pt-2 border-t border-border-default", children: /* @__PURE__ */ jsxs2("div", { className: "flex items-center justify-between text-xs", children: [
      /* @__PURE__ */ jsxs2("span", { className: "text-text-secondary", children: [
        "Critical path length:",
        " ",
        pluralize(criticalPath?.length ?? wavePlan.criticalPath.length, "task")
      ] }),
      /* @__PURE__ */ jsx2("span", { className: "text-text-secondary", children: activeTasks > 0 && /* @__PURE__ */ jsxs2("span", { className: "text-accent-primary", children: [
        activeTasks,
        " active"
      ] }) })
    ] }) })
  ] });
}

// src/components/WaveProgressBar.tsx
import { jsx as jsx3, jsxs as jsxs3 } from "react/jsx-runtime";
function WaveProgressBar({
  wavePlan,
  waveProgress,
  currentWaveIndex,
  className
}) {
  const totalWaves = wavePlan.waves.length;
  const getWaveStatus = (wave) => {
    if (waveProgress) {
      const progress = waveProgress.get(wave.waveIndex);
      if (progress) {
        if (progress.status === "failed") return "failed";
        if (progress.status === "completed") return "complete";
        if (progress.status === "active" || progress.status === "dispatching") return "active";
      }
    }
    if (currentWaveIndex !== void 0) {
      if (wave.waveIndex < currentWaveIndex) return "complete";
      if (wave.waveIndex === currentWaveIndex) return "active";
    }
    return "pending";
  };
  const getStatusColor = (status) => {
    switch (status) {
      case "pending":
        return "bg-bg-panel";
      case "active":
        return "bg-accent-primary";
      case "complete":
        return "bg-accent-green";
      case "failed":
        return "bg-accent-red";
    }
  };
  const getStatusLabel = (status) => {
    switch (status) {
      case "pending":
        return "Pending";
      case "active":
        return "Active";
      case "complete":
        return "Complete";
      case "failed":
        return "Failed";
    }
  };
  return /* @__PURE__ */ jsxs3("div", { className: cn("space-y-3", className), children: [
    /* @__PURE__ */ jsx3("div", { className: "flex items-center gap-1", children: wavePlan.waves.map((wave, index) => {
      const status = getWaveStatus(wave);
      const isLast = index === totalWaves - 1;
      return /* @__PURE__ */ jsxs3(
        "div",
        {
          className: "flex items-center flex-1",
          children: [
            /* @__PURE__ */ jsxs3("div", { className: "relative flex-1 group", children: [
              /* @__PURE__ */ jsx3(
                "div",
                {
                  className: cn(
                    "h-3 rounded-sm transition-all duration-300",
                    getStatusColor(status),
                    status === "active" && "animate-pulse",
                    "cursor-pointer hover:opacity-80"
                  ),
                  title: `Wave ${wave.waveIndex + 1}: ${wave.label} - ${getStatusLabel(status)}`
                }
              ),
              /* @__PURE__ */ jsxs3("div", { className: "absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-bg-panel border border-border-default rounded text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10", children: [
                /* @__PURE__ */ jsxs3("div", { className: "font-medium", children: [
                  "Wave ",
                  wave.waveIndex + 1
                ] }),
                /* @__PURE__ */ jsx3("div", { className: "text-text-secondary", children: wave.label }),
                /* @__PURE__ */ jsxs3("div", { className: "text-xs text-text-tertiary", children: [
                  wave.tasks.length,
                  " tasks"
                ] })
              ] })
            ] }),
            !isLast && /* @__PURE__ */ jsx3("div", { className: "w-1 h-3 bg-border-default" })
          ]
        },
        wave.waveIndex
      );
    }) }),
    /* @__PURE__ */ jsxs3("div", { className: "flex items-center gap-4 text-xs text-text-secondary", children: [
      /* @__PURE__ */ jsxs3("div", { className: "flex items-center gap-1.5", children: [
        /* @__PURE__ */ jsx3("div", { className: "w-3 h-3 rounded-sm bg-bg-panel" }),
        /* @__PURE__ */ jsx3("span", { children: "Pending" })
      ] }),
      /* @__PURE__ */ jsxs3("div", { className: "flex items-center gap-1.5", children: [
        /* @__PURE__ */ jsx3("div", { className: "w-3 h-3 rounded-sm bg-accent-primary animate-pulse" }),
        /* @__PURE__ */ jsx3("span", { children: "Active" })
      ] }),
      /* @__PURE__ */ jsxs3("div", { className: "flex items-center gap-1.5", children: [
        /* @__PURE__ */ jsx3("div", { className: "w-3 h-3 rounded-sm bg-accent-green" }),
        /* @__PURE__ */ jsx3("span", { children: "Complete" })
      ] }),
      /* @__PURE__ */ jsxs3("div", { className: "flex items-center gap-1.5", children: [
        /* @__PURE__ */ jsx3("div", { className: "w-3 h-3 rounded-sm bg-accent-red" }),
        /* @__PURE__ */ jsx3("span", { children: "Failed" })
      ] }),
      /* @__PURE__ */ jsxs3("div", { className: "flex items-center gap-1.5", children: [
        /* @__PURE__ */ jsx3("div", { className: "w-3 h-3 rounded-sm border-2 border-yellow-500" }),
        /* @__PURE__ */ jsx3("span", { children: "Critical path" })
      ] })
    ] }),
    currentWaveIndex !== void 0 && /* @__PURE__ */ jsxs3("div", { className: "text-sm text-text-secondary", children: [
      "Wave ",
      currentWaveIndex + 1,
      " of ",
      totalWaves
    ] })
  ] });
}

// src/components/WaveTableView.tsx
import { useState as useState2, useMemo as useMemo3 } from "react";

// src/components/badges.tsx
import { jsx as jsx4 } from "react/jsx-runtime";
function ModelBadge({ model, className }) {
  const label = modelLabel(model);
  return /* @__PURE__ */ jsx4(
    "span",
    {
      className: cn(
        "inline-flex items-center rounded px-2 py-0.5 text-xs font-medium text-white",
        getModelColor(model),
        className
      ),
      children: label
    }
  );
}
function ComplexityBadge({ complexity, className }) {
  return /* @__PURE__ */ jsx4(
    "span",
    {
      className: cn(
        "inline-flex items-center justify-center rounded px-1.5 py-0.5 text-xs font-semibold min-w-[24px]",
        getComplexityColor(complexity),
        className
      ),
      children: complexity
    }
  );
}

// src/components/WaveTableView.tsx
import { jsx as jsx5, jsxs as jsxs4 } from "react/jsx-runtime";
function WaveTableView({
  wavePlan,
  waveProgress,
  currentWaveIndex,
  onTaskClick,
  className
}) {
  const [sortField, setSortField] = useState2("wave");
  const [sortDirection, setSortDirection] = useState2("asc");
  const [filterStatus, setFilterStatus] = useState2("all");
  const [filterModel, setFilterModel] = useState2("all");
  const tableData = useMemo3(() => {
    const tasks = [];
    const criticalPathSet = new Set(wavePlan.criticalPath);
    for (const wave of wavePlan.waves) {
      for (const task of wave.tasks) {
        let status = "pending";
        if (waveProgress) {
          const progress = waveProgress.get(wave.waveIndex);
          if (progress) {
            if (progress.status === "completed") {
              status = "complete";
            } else if (progress.status === "failed") {
              status = "failed";
            } else if (progress.status === "active" && progress.runningTasks > 0) {
              status = "active";
            }
          }
        } else if (currentWaveIndex !== void 0) {
          if (wave.waveIndex < currentWaveIndex) {
            status = "complete";
          } else if (wave.waveIndex === currentWaveIndex) {
            status = "active";
          }
        }
        tasks.push({
          ...task,
          waveIndex: wave.waveIndex,
          waveLabel: wave.label,
          status,
          isOnCriticalPath: criticalPathSet.has(task.taskCode)
        });
      }
    }
    return tasks;
  }, [wavePlan, waveProgress, currentWaveIndex]);
  const filteredAndSortedData = useMemo3(() => {
    let filtered = tableData;
    if (filterStatus !== "all") {
      filtered = filtered.filter((task) => task.status === filterStatus);
    }
    if (filterModel !== "all") {
      filtered = filtered.filter((task) => task.recommendedModel === filterModel);
    }
    const sorted = [...filtered].sort((a, b) => {
      let aVal;
      let bVal;
      switch (sortField) {
        case "wave":
          aVal = a.waveIndex;
          bVal = b.waveIndex;
          break;
        case "taskCode":
          aVal = a.taskCode;
          bVal = b.taskCode;
          break;
        case "description":
          aVal = a.description;
          bVal = b.description;
          break;
        case "model":
          aVal = a.recommendedModel;
          bVal = b.recommendedModel;
          break;
        case "complexity":
          const complexityOrder = { S: 0, M: 1, L: 2, XL: 3 };
          aVal = complexityOrder[a.complexity];
          bVal = complexityOrder[b.complexity];
          break;
        case "status":
          aVal = a.status;
          bVal = b.status;
          break;
        default:
          return 0;
      }
      if (aVal < bVal) return sortDirection === "asc" ? -1 : 1;
      if (aVal > bVal) return sortDirection === "asc" ? 1 : -1;
      return 0;
    });
    return sorted;
  }, [tableData, sortField, sortDirection, filterStatus, filterModel]);
  const handleSort = (field) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };
  const getStatusIcon = (status) => {
    switch (status) {
      case "pending":
        return "\u23F3";
      case "active":
        return "\u25B6";
      case "complete":
        return "\u2713";
      case "failed":
        return "\u2717";
    }
  };
  const getStatusColor = (status) => {
    switch (status) {
      case "pending":
        return "text-text-tertiary";
      case "active":
        return "text-accent-primary";
      case "complete":
        return "text-accent-green";
      case "failed":
        return "text-accent-red";
    }
  };
  return /* @__PURE__ */ jsxs4("div", { className: cn("space-y-4", className), children: [
    /* @__PURE__ */ jsxs4("div", { className: "flex items-center gap-4", children: [
      /* @__PURE__ */ jsxs4("div", { className: "flex items-center gap-2", children: [
        /* @__PURE__ */ jsx5("label", { className: "text-xs text-text-secondary", children: "Status:" }),
        /* @__PURE__ */ jsxs4(
          "select",
          {
            value: filterStatus,
            onChange: (e) => setFilterStatus(e.target.value),
            className: "px-2 py-1 text-xs rounded bg-bg-panel border border-border-default text-text-primary",
            children: [
              /* @__PURE__ */ jsx5("option", { value: "all", children: "All" }),
              /* @__PURE__ */ jsx5("option", { value: "pending", children: "Pending" }),
              /* @__PURE__ */ jsx5("option", { value: "active", children: "Active" }),
              /* @__PURE__ */ jsx5("option", { value: "complete", children: "Complete" }),
              /* @__PURE__ */ jsx5("option", { value: "failed", children: "Failed" })
            ]
          }
        )
      ] }),
      /* @__PURE__ */ jsxs4("div", { className: "flex items-center gap-2", children: [
        /* @__PURE__ */ jsx5("label", { className: "text-xs text-text-secondary", children: "Model:" }),
        /* @__PURE__ */ jsxs4(
          "select",
          {
            value: filterModel,
            onChange: (e) => setFilterModel(e.target.value),
            className: "px-2 py-1 text-xs rounded bg-bg-panel border border-border-default text-text-primary",
            children: [
              /* @__PURE__ */ jsx5("option", { value: "all", children: "All" }),
              /* @__PURE__ */ jsx5("option", { value: "haiku", children: "Haiku" }),
              /* @__PURE__ */ jsx5("option", { value: "sonnet", children: "Sonnet" }),
              /* @__PURE__ */ jsx5("option", { value: "opus", children: "Opus" })
            ]
          }
        )
      ] }),
      /* @__PURE__ */ jsx5("div", { className: "flex-1" }),
      /* @__PURE__ */ jsxs4("div", { className: "text-xs text-text-secondary", children: [
        filteredAndSortedData.length,
        " tasks"
      ] })
    ] }),
    /* @__PURE__ */ jsxs4("div", { className: "overflow-x-auto border border-border-default rounded-lg", children: [
      /* @__PURE__ */ jsxs4("table", { className: "w-full text-sm", children: [
        /* @__PURE__ */ jsx5("thead", { children: /* @__PURE__ */ jsxs4("tr", { className: "border-b border-border-default bg-bg-panel", children: [
          /* @__PURE__ */ jsx5("th", { className: "text-left px-3 py-2", children: /* @__PURE__ */ jsxs4(
            "button",
            {
              onClick: () => handleSort("wave"),
              className: "flex items-center gap-1 hover:text-accent-primary transition-colors",
              children: [
                "Wave",
                sortField === "wave" && /* @__PURE__ */ jsx5("span", { className: "text-xs", children: sortDirection === "asc" ? "\u2191" : "\u2193" })
              ]
            }
          ) }),
          /* @__PURE__ */ jsx5("th", { className: "text-left px-3 py-2", children: /* @__PURE__ */ jsxs4(
            "button",
            {
              onClick: () => handleSort("taskCode"),
              className: "flex items-center gap-1 hover:text-accent-primary transition-colors",
              children: [
                "Task ID",
                sortField === "taskCode" && /* @__PURE__ */ jsx5("span", { className: "text-xs", children: sortDirection === "asc" ? "\u2191" : "\u2193" })
              ]
            }
          ) }),
          /* @__PURE__ */ jsx5("th", { className: "text-left px-3 py-2", children: /* @__PURE__ */ jsxs4(
            "button",
            {
              onClick: () => handleSort("description"),
              className: "flex items-center gap-1 hover:text-accent-primary transition-colors",
              children: [
                "Description",
                sortField === "description" && /* @__PURE__ */ jsx5("span", { className: "text-xs", children: sortDirection === "asc" ? "\u2191" : "\u2193" })
              ]
            }
          ) }),
          /* @__PURE__ */ jsx5("th", { className: "text-left px-3 py-2", children: "Files" }),
          /* @__PURE__ */ jsx5("th", { className: "text-left px-3 py-2", children: "Dependencies" }),
          /* @__PURE__ */ jsx5("th", { className: "text-left px-3 py-2", children: /* @__PURE__ */ jsxs4(
            "button",
            {
              onClick: () => handleSort("model"),
              className: "flex items-center gap-1 hover:text-accent-primary transition-colors",
              children: [
                "Model",
                sortField === "model" && /* @__PURE__ */ jsx5("span", { className: "text-xs", children: sortDirection === "asc" ? "\u2191" : "\u2193" })
              ]
            }
          ) }),
          /* @__PURE__ */ jsx5("th", { className: "text-left px-3 py-2", children: /* @__PURE__ */ jsxs4(
            "button",
            {
              onClick: () => handleSort("complexity"),
              className: "flex items-center gap-1 hover:text-accent-primary transition-colors",
              children: [
                "Size",
                sortField === "complexity" && /* @__PURE__ */ jsx5("span", { className: "text-xs", children: sortDirection === "asc" ? "\u2191" : "\u2193" })
              ]
            }
          ) }),
          /* @__PURE__ */ jsx5("th", { className: "text-left px-3 py-2", children: /* @__PURE__ */ jsxs4(
            "button",
            {
              onClick: () => handleSort("status"),
              className: "flex items-center gap-1 hover:text-accent-primary transition-colors",
              children: [
                "Status",
                sortField === "status" && /* @__PURE__ */ jsx5("span", { className: "text-xs", children: sortDirection === "asc" ? "\u2191" : "\u2193" })
              ]
            }
          ) })
        ] }) }),
        /* @__PURE__ */ jsx5("tbody", { children: filteredAndSortedData.map((task) => /* @__PURE__ */ jsxs4(
          "tr",
          {
            onClick: () => onTaskClick?.(task),
            className: cn(
              "border-b border-border-default hover:bg-white/5 transition-colors",
              onTaskClick && "cursor-pointer",
              task.isOnCriticalPath && "bg-accent-primary/5"
            ),
            children: [
              /* @__PURE__ */ jsx5("td", { className: "px-3 py-2 whitespace-nowrap", children: /* @__PURE__ */ jsxs4("div", { className: "flex items-center gap-1.5", children: [
                task.isOnCriticalPath && /* @__PURE__ */ jsx5("span", { className: "text-accent-amber", title: "Critical Path", children: "\u25CF" }),
                /* @__PURE__ */ jsx5("span", { className: "text-text-secondary", children: task.waveIndex + 1 })
              ] }) }),
              /* @__PURE__ */ jsx5("td", { className: "px-3 py-2 whitespace-nowrap font-mono text-xs", children: task.taskCode }),
              /* @__PURE__ */ jsx5("td", { className: "px-3 py-2", children: /* @__PURE__ */ jsx5("div", { className: "max-w-md truncate", title: task.description, children: task.description }) }),
              /* @__PURE__ */ jsx5("td", { className: "px-3 py-2", children: /* @__PURE__ */ jsxs4("div", { className: "text-xs text-text-secondary", children: [
                task.filePaths.length,
                " file",
                task.filePaths.length !== 1 ? "s" : ""
              ] }) }),
              /* @__PURE__ */ jsx5("td", { className: "px-3 py-2", children: /* @__PURE__ */ jsx5("div", { className: "text-xs text-text-secondary", children: task.dependencies.length > 0 ? task.dependencies.length : "\u2014" }) }),
              /* @__PURE__ */ jsx5("td", { className: "px-3 py-2 whitespace-nowrap", children: /* @__PURE__ */ jsx5(ModelBadge, { model: task.recommendedModel }) }),
              /* @__PURE__ */ jsx5("td", { className: "px-3 py-2 whitespace-nowrap", children: /* @__PURE__ */ jsx5(ComplexityBadge, { complexity: task.complexity }) }),
              /* @__PURE__ */ jsx5("td", { className: "px-3 py-2 whitespace-nowrap", children: /* @__PURE__ */ jsxs4("span", { className: cn("text-sm", getStatusColor(task.status)), children: [
                getStatusIcon(task.status),
                " ",
                task.status
              ] }) })
            ]
          },
          task.taskCode
        )) })
      ] }),
      filteredAndSortedData.length === 0 && /* @__PURE__ */ jsx5("div", { className: "text-center py-8 text-text-secondary", children: "No tasks match the current filters" })
    ] })
  ] });
}
export {
  ComplexityBadge,
  CriticalPathIndicator,
  DAGVisualization,
  ModelBadge,
  WaveProgressBar,
  WaveTableView,
  cn,
  formatMinutes,
  getComplexityColor,
  getModelColor,
  plainText,
  pluralize,
  stringToColor
};
