'use client';

import { useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import type { WavePlan, WaveTask, DependencyEdge } from '@devpilot.sh/core/db/schema';

// ============================================================================
// Types
// ============================================================================

export interface DAGVisualizationProps {
  wavePlan: WavePlan;
  waveTasks: WaveTask[];
  dependencyEdges: DependencyEdge[];
  criticalPath: string[];
  onTaskClick?: (taskCode: string) => void;
}

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
    case 'blocked':
      return 'bg-yellow-700 border-yellow-600';
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
  dependencyEdges: DependencyEdge[]
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
}: DAGVisualizationProps) {
  const [zoom, setZoom] = useState(1);
  const [selectedTask, setSelectedTask] = useState<string | null>(null);

  const { taskNodes, edges, viewBox } = useMemo(() => {
    const nodes = calculateLayout(waveTasks, criticalPath);
    const calculatedEdges = calculateEdges(nodes, dependencyEdges);

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
      <div className="absolute top-4 left-4 z-10 bg-bg-surface rounded-lg border border-border-default p-3 shadow-lg">
        <div className="text-xs text-text-secondary space-y-2">
          <div className="font-semibold text-text-primary mb-2">Status</div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-gray-700 border border-gray-600 rounded"></div>
            <span>Pending</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-blue-700 border border-blue-600 rounded"></div>
            <span>Running</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-green-700 border border-green-600 rounded"></div>
            <span>Complete</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-red-700 border border-red-600 rounded"></div>
            <span>Failed</span>
          </div>
          <div className="border-t border-border-default pt-2 mt-2">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 border-2 border-yellow-500 rounded"></div>
              <span>Critical Path</span>
            </div>
          </div>
        </div>
      </div>

      {/* SVG Canvas */}
      <div className="w-full h-full overflow-auto">
        <svg
          width={viewBox.width * zoom}
          height={viewBox.height * zoom}
          viewBox={`0 0 ${viewBox.width} ${viewBox.height}`}
          className="min-w-full min-h-full"
        >
          {/* Define arrow marker for edges */}
          <defs>
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
              return (
                <line
                  key={`edge-${index}`}
                  x1={edge.fromPos.x}
                  y1={edge.fromPos.y}
                  x2={edge.toPos.x}
                  y2={edge.toPos.y}
                  stroke="#4B5563"
                  strokeWidth="2"
                  strokeDasharray={isDashed ? '5,5' : '0'}
                  markerEnd="url(#arrowhead)"
                  className="transition-all"
                />
              );
            })}
          </g>

          {/* Draw task nodes */}
          <g className="nodes">
            {taskNodes.map((node) => {
              const isSelected = selectedTask === node.task.taskCode;
              const statusColor = getTaskStatusColor(node.task.status);

              return (
                <g
                  key={node.task.taskCode}
                  transform={`translate(${node.position.x}, ${node.position.y})`}
                  onClick={() => handleTaskClick(node.task.taskCode)}
                  className="cursor-pointer transition-transform hover:scale-105"
                >
                  {/* Node background */}
                  <rect
                    width={NODE_WIDTH}
                    height={NODE_HEIGHT}
                    rx="6"
                    className={cn(
                      'transition-all',
                      statusColor,
                      isSelected && 'ring-2 ring-accent-primary ring-offset-2',
                      node.isOnCriticalPath && 'ring-2 ring-yellow-500'
                    )}
                  />

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
                    {node.task.label.length > 20
                      ? `${node.task.label.substring(0, 20)}...`
                      : node.task.label}
                  </text>

                  {/* Status indicator */}
                  <text
                    x={NODE_WIDTH / 2}
                    y={65}
                    textAnchor="middle"
                    className="fill-gray-400 text-xs capitalize"
                  >
                    {node.task.status}
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
                      {task.taskCode}: {task.label}
                    </h3>
                    <p className="text-xs text-text-secondary mt-1">
                      {task.description || 'No description available'}
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
                    <span className="text-text-primary">{task.waveIndex}</span>
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
