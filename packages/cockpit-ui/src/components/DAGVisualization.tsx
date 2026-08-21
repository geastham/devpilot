'use client';

import { useMemo, useState } from 'react';
import { cn } from '../cn';
import type { WavePlan, WaveTask, DependencyEdge } from '@devpilot.sh/core/db';
import { plainText } from '../plan-text';

// ============================================================================
// Types
// ============================================================================

export interface DAGVisualizationProps {
  wavePlan: WavePlan;
  waveTasks: WaveTask[];
  dependencyEdges: DependencyEdge[];
  criticalPath: string[];
  onTaskClick?: (taskCode: string) => void;
  /**
   * What the agent on each task is doing right now, keyed by task code.
   *
   * Optional: a plan being reviewed has no agents, and a graph with no live
   * data must still render as a plan. When present it is what makes a node
   * breathe, name the file it is editing, and admit when it has gone quiet.
   */
  live?: Record<string, LiveTaskState>;
}

export interface LiveTaskState {
  sessionStatus?: string;
  progressPercent?: number;
  telemetry?: {
    toolCalls?: number;
    filesTouched?: string[];
    lastAction?: { tool: string; path?: string };
    idleMs?: number;
    costUsd?: number;
  } | null;
}

/** Three minutes of silence after work has started. Mirrors the runner. */
const STALL_MS = 180_000;

interface Position {
  x: number;
  y: number;
}

interface TaskNode {
  task: WaveTask;
  position: Position;
  isOnCriticalPath: boolean;
}

interface Edge {
  from: string;
  to: string;
  type: 'hard' | 'soft';
  fromPos: Position;
  toPos: Position;
  /** True only for consecutive pairs in the critical path — see the layout fn. */
  onCriticalPath: boolean;
}

// ============================================================================
// Constants
// ============================================================================

const NODE_WIDTH = 180;
const NODE_HEIGHT = 80;
const WAVE_VERTICAL_SPACING = 150;
const TASK_HORIZONTAL_SPACING = 200;
const PADDING = 40;

// ============================================================================
// Helper Functions
// ============================================================================

function getTaskStatusColor(status: WaveTask['status']): string {
  switch (status) {
    case 'pending':
      return 'bg-gray-700 border-gray-600';
    case 'running':
      return 'bg-blue-700 border-blue-600';
    case 'completed':
      return 'bg-green-700 border-green-600';
    case 'failed':
      return 'bg-red-700 border-red-600';
    default:
      return 'bg-gray-700 border-gray-600';
  }
}

function calculateLayout(
  waveTasks: WaveTask[],
  criticalPath: string[]
): TaskNode[] {
  const taskNodes: TaskNode[] = [];
  const criticalPathSet = new Set(criticalPath);

  // Group tasks by wave
  const waveGroups = new Map<number, WaveTask[]>();
  waveTasks.forEach((task) => {
    const wave = task.waveIndex;
    if (!waveGroups.has(wave)) {
      waveGroups.set(wave, []);
    }
    waveGroups.get(wave)!.push(task);
  });

  // Calculate positions for each wave
  const sortedWaves = Array.from(waveGroups.keys()).sort((a, b) => a - b);

  sortedWaves.forEach((waveIndex) => {
    const tasksInWave = waveGroups.get(waveIndex)!;
    const waveY = PADDING + waveIndex * WAVE_VERTICAL_SPACING;

    // Center tasks horizontally within the wave
    const totalWidth = tasksInWave.length * (NODE_WIDTH + TASK_HORIZONTAL_SPACING) - TASK_HORIZONTAL_SPACING;
    const startX = PADDING;

    tasksInWave.forEach((task, index) => {
      const x = startX + index * (NODE_WIDTH + TASK_HORIZONTAL_SPACING);
      const y = waveY;

      taskNodes.push({
        task,
        position: { x, y },
        isOnCriticalPath: criticalPathSet.has(task.taskCode),
      });
    });
  });

  return taskNodes;
}

function calculateEdges(
  taskNodes: TaskNode[],
  dependencyEdges: DependencyEdge[],
  criticalPath: string[]
): Edge[] {
  const taskPositionMap = new Map<string, Position>();
  taskNodes.forEach((node) => {
    taskPositionMap.set(node.task.taskCode, node.position);
  });

  return dependencyEdges
    .map((edge) => {
      const fromPos = taskPositionMap.get(edge.fromTaskCode);
      const toPos = taskPositionMap.get(edge.toTaskCode);

      if (!fromPos || !toPos) return null;

      // Calculate center positions of nodes
      const fromCenter = {
        x: fromPos.x + NODE_WIDTH / 2,
        y: fromPos.y + NODE_HEIGHT / 2,
      };
      const toCenter = {
        x: toPos.x + NODE_WIDTH / 2,
        y: toPos.y + NODE_HEIGHT / 2,
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
        toPos: toCenter,
      };
    })
    .filter((edge): edge is Edge => edge !== null);
}

// ============================================================================
// Component
// ============================================================================

export function DAGVisualization({
  wavePlan,
  waveTasks,
  dependencyEdges,
  criticalPath,
  onTaskClick,
  live,
}: DAGVisualizationProps) {
  const [zoom, setZoom] = useState(1);
  const [selectedTask, setSelectedTask] = useState<string | null>(null);

  /** Task status by code, so an edge can ask about both of its endpoints. */
  const statusByCode = useMemo(
    () => new Map(waveTasks.map((t) => [t.taskCode, t.status as string])),
    [waveTasks]
  );

  const { taskNodes, edges, viewBox } = useMemo(() => {
    const nodes = calculateLayout(waveTasks, criticalPath);
    const calculatedEdges = calculateEdges(nodes, dependencyEdges, criticalPath);

    // Calculate viewBox dimensions
    const maxX = Math.max(...nodes.map((n) => n.position.x + NODE_WIDTH));
    const maxY = Math.max(...nodes.map((n) => n.position.y + NODE_HEIGHT));
    const width = maxX + PADDING;
    const height = maxY + PADDING;

    return {
      taskNodes: nodes,
      edges: calculatedEdges,
      viewBox: { width, height },
    };
  }, [waveTasks, dependencyEdges, criticalPath]);

  const handleTaskClick = (taskCode: string) => {
    setSelectedTask(taskCode);
    onTaskClick?.(taskCode);
  };

  const handleZoomIn = () => setZoom((prev) => Math.min(prev + 0.2, 2));
  const handleZoomOut = () => setZoom((prev) => Math.max(prev - 0.2, 0.5));
  const handleZoomReset = () => setZoom(1);

  return (
    <div className="relative w-full h-full bg-bg-base rounded-lg border border-border-default overflow-hidden">
      {/* Zoom Controls */}
      <div className="absolute top-4 right-4 z-10 flex gap-2 bg-bg-surface rounded-lg border border-border-default p-2 shadow-lg">
        <button
          onClick={handleZoomIn}
          className="px-3 py-1 text-sm text-text-primary hover:bg-white/5 rounded transition-colors"
          title="Zoom In"
        >
          +
        </button>
        <button
          onClick={handleZoomReset}
          className="px-3 py-1 text-sm text-text-secondary hover:text-text-primary hover:bg-white/5 rounded transition-colors"
          title="Reset Zoom"
        >
          {Math.round(zoom * 100)}%
        </button>
        <button
          onClick={handleZoomOut}
          className="px-3 py-1 text-sm text-text-primary hover:bg-white/5 rounded transition-colors"
          title="Zoom Out"
        >
          -
        </button>
      </div>

      {/* Legend */}
      {/*
        The floating status legend used to live here, pinned `absolute top-4
        left-4` over the canvas — directly on top of the first task node, which
        the layout also starts at PADDING from the top-left. Task 1.1 was
        unreadable behind it on every plan.

        It was also duplicated: `WaveProgressBar` already legends the same four
        states above the canvas. Rather than move the occluder around, the
        duplicate is gone and its one unique entry (Critical Path) moved up to
        join the real legend. Nothing floats over the graph now.
      */}

      {/* SVG Canvas */}
      <div className="w-full h-full overflow-auto">
        <svg
          width={viewBox.width * zoom}
          height={viewBox.height * zoom}
          viewBox={`0 0 ${viewBox.width} ${viewBox.height}`}
          className="min-w-full min-h-full"
        >
          {/* Define arrow markers for edges */}
          <defs>
            <marker
              id="arrowhead-critical"
              markerWidth="10"
              markerHeight="10"
              refX="9"
              refY="3"
              orient="auto"
            >
              <polygon points="0 0, 10 3, 0 6" fill="#34D399" />
            </marker>
            <marker
              id="arrowhead"
              markerWidth="10"
              markerHeight="10"
              refX="9"
              refY="3"
              orient="auto"
            >
              <polygon
                points="0 0, 10 3, 0 6"
                fill="#4B5563"
                className="transition-colors"
              />
            </marker>
          </defs>

          {/* Draw edges */}
          <g className="edges">
            {edges.map((edge, index) => {
              const isDashed = edge.type === 'soft';

              /**
               * A dependency clearing, right now.
               *
               * The upstream task is done and the task it was blocking has
               * started, so this edge is the moment the plan's structure paid
               * off. It is the one thing a wave diagram can show that a task
               * list cannot: not that work is parallel, but that it *became*
               * parallel because something finished.
               */
              const fromStatus = statusByCode.get(edge.from);
              const toStatus = statusByCode.get(edge.to);
              const unblocking =
                fromStatus === 'completed' &&
                (toStatus === 'dispatched' || toStatus === 'running');

              /*
               * THE CRITICAL PATH, MOVING.
               *
               * Every edge rendered at #4B5563 before this, so the longest
               * chain — the thing that actually determines when the work lands
               * — was invisible in a diagram built to show it.
               *
               * Flow direction encodes dependency direction, so a glance tells
               * you which way the chain runs. This is the animation the hero
               * image on the marketing site depicts; product and page now
               * rhyme. `dp-flow` is guarded by prefers-reduced-motion, and the
               * colour and width carry the same signal on their own.
               */
              if (edge.onCriticalPath) {
                return (
                  <line
                    key={`edge-${index}`}
                    x1={edge.fromPos.x}
                    y1={edge.fromPos.y}
                    x2={edge.toPos.x}
                    y2={edge.toPos.y}
                    stroke="#34D399"
                    strokeWidth="3"
                    markerEnd="url(#arrowhead-critical)"
                    className="dp-flow"
                    style={{ filter: 'drop-shadow(0 0 4px rgba(52,211,153,0.5))' }}
                  />
                );
              }

              return (
                <line
                  key={`edge-${index}`}
                  x1={edge.fromPos.x}
                  y1={edge.fromPos.y}
                  x2={edge.toPos.x}
                  y2={edge.toPos.y}
                  stroke={unblocking ? '#60A5FA' : '#4B5563'}
                  strokeWidth={unblocking ? '2.5' : '2'}
                  strokeDasharray={unblocking ? undefined : isDashed ? '5,5' : '0'}
                  markerEnd="url(#arrowhead)"
                  className={cn('transition-all', unblocking && 'dp-edge-flow')}
                />
              );
            })}
          </g>

          {/* Draw task nodes */}
          <g className="nodes">
            {taskNodes.map((node) => {
              const isSelected = selectedTask === node.task.taskCode;
              const statusColor = getTaskStatusColor(node.task.status);

              const liveState = live?.[node.task.taskCode];
              const telemetry = liveState?.telemetry;
              const working =
                node.task.status === 'dispatched' || node.task.status === 'running';
              const stalled = working && (telemetry?.idleMs ?? 0) > STALL_MS;
              const justDone = node.task.status === 'completed';

              // What this agent is touching, for the line under the label. The
              // difference between "something is running" and "1.3 is writing
              // scheduler.ts" is the whole point of the view.
              const doing = telemetry?.lastAction
                ? `${telemetry.lastAction.tool.toLowerCase()} ${
                    telemetry.lastAction.path?.split('/').slice(-1)[0] ?? ''
                  }`.trim()
                : undefined;

              return (
                <g
                  key={node.task.taskCode}
                  transform={`translate(${node.position.x}, ${node.position.y})`}
                  onClick={() => handleTaskClick(node.task.taskCode)}
                  className="cursor-pointer transition-transform hover:scale-105"
                >
                  {/* Halo behind an active node, so a working task is findable
                      in peripheral vision on a wide wave. */}
                  {working && !stalled && (
                    <rect
                      x={-4}
                      y={-4}
                      width={NODE_WIDTH + 8}
                      height={NODE_HEIGHT + 8}
                      rx="9"
                      fill="none"
                      stroke="rgba(59,130,246,0.5)"
                      strokeWidth="2"
                      className="dp-node-halo"
                    />
                  )}

                  {/* Node background */}
                  <rect
                    width={NODE_WIDTH}
                    height={NODE_HEIGHT}
                    rx="6"
                    className={cn(
                      'transition-all',
                      statusColor,
                      working && !stalled && 'dp-node-alive',
                      stalled && 'dp-node-stalled',
                      justDone && 'dp-node-settle',
                      isSelected && 'ring-2 ring-accent-primary ring-offset-2',
                      node.isOnCriticalPath && 'ring-2 ring-yellow-500'
                    )}
                  />

                  {/* Stall marker. Amber, top-right, because a quiet agent is
                      the one thing on this screen worth interrupting for. */}
                  {stalled && (
                    <circle cx={NODE_WIDTH - 10} cy={10} r="4" fill="#F59E0B" />
                  )}

                  {/* Task code */}
                  <text
                    x={NODE_WIDTH / 2}
                    y={25}
                    textAnchor="middle"
                    className="fill-white font-semibold text-sm"
                  >
                    {node.task.taskCode}
                  </text>

                  {/* Task label (truncated) */}
                  <text
                    x={NODE_WIDTH / 2}
                    y={45}
                    textAnchor="middle"
                    className="fill-gray-300 text-xs"
                  >
                    {(() => {
                      const label = plainText(node.task.label);
                      return label.length > 20 ? `${label.substring(0, 20)}...` : label;
                    })()}
                  </text>

                  {/* Status, or what the agent is actually doing.
                      "dispatched" tells you the conductor sent it; "edit
                      scheduler.ts" tells you the fleet is alive and where. When
                      there is a live answer it wins. */}
                  <text
                    x={NODE_WIDTH / 2}
                    y={65}
                    textAnchor="middle"
                    className={cn(
                      'text-xs',
                      doing ? 'fill-blue-300' : 'fill-gray-400 capitalize'
                    )}
                  >
                    {doing
                      ? doing.length > 24
                        ? `${doing.slice(0, 24)}…`
                        : doing
                      : stalled
                        ? 'quiet'
                        : node.task.status}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>
      </div>

      {/* Info Panel */}
      {selectedTask && (
        <div className="absolute bottom-4 left-4 right-4 bg-bg-surface rounded-lg border border-border-default p-4 shadow-lg z-10">
          {(() => {
            const task = waveTasks.find((t) => t.taskCode === selectedTask);
            if (!task) return null;

            return (
              <div className="space-y-2">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-text-primary">
                      {task.taskCode}: {plainText(task.label)}
                    </h3>
                    <p className="text-xs text-text-secondary mt-1">
                      {task.description ? plainText(task.description) : 'No description available'}
                    </p>
                  </div>
                  <button
                    onClick={() => setSelectedTask(null)}
                    className="text-text-secondary hover:text-text-primary transition-colors"
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-4 text-xs">
                  <div>
                    <span className="text-text-secondary">Wave:</span>{' '}
                    {/* waveIndex is 0-based internally; every other surface —
                        "Wave 1 of 2" in the header, the wave headings — counts
                        from 1. Showing the raw index here made a task in the
                        first wave read as "Wave: 0". */}
                    <span className="text-text-primary">{task.waveIndex + 1}</span>
                  </div>
                  <div>
                    <span className="text-text-secondary">Status:</span>{' '}
                    <span className="text-text-primary capitalize">{task.status}</span>
                  </div>
                  {task.complexity && (
                    <div>
                      <span className="text-text-secondary">Complexity:</span>{' '}
                      <span className="text-text-primary">{task.complexity}</span>
                    </div>
                  )}
                  {task.recommendedModel && (
                    <div>
                      <span className="text-text-secondary">Model:</span>{' '}
                      <span className="text-text-primary capitalize">{task.recommendedModel}</span>
                    </div>
                  )}
                  <div>
                    <span className="text-text-secondary">Parallel:</span>{' '}
                    <span className="text-text-primary">{task.canRunInParallel ? 'Yes' : 'No'}</span>
                  </div>
                  {task.isOnCriticalPath && (
                    <div className="col-span-2">
                      <span className="text-yellow-500 font-semibold">⭐ On Critical Path</span>
                    </div>
                  )}
                </div>

                {task.dependencies && task.dependencies.length > 0 && (
                  <div className="pt-2 border-t border-border-default">
                    <span className="text-xs text-text-secondary">Dependencies: </span>
                    <span className="text-xs text-text-primary">
                      {task.dependencies.join(', ')}
                    </span>
                  </div>
                )}

                {task.filePaths && task.filePaths.length > 0 && (
                  <div className="pt-2 border-t border-border-default">
                    <span className="text-xs text-text-secondary">Files: </span>
                    <span className="text-xs text-text-primary">
                      {task.filePaths.join(', ')}
                    </span>
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}
