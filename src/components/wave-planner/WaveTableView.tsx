'use client';

import { useState, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { ModelBadge, ComplexityBadge } from '@/components/ui/badge';
import type { ParsedWavePlan, ParsedTask, ParsedWave, WaveProgress } from '@devpilot.sh/core/wave-planner';

// ============================================================================
// Types
// ============================================================================

type SortField = 'wave' | 'taskCode' | 'description' | 'model' | 'complexity' | 'status';
type SortDirection = 'asc' | 'desc';
type FilterStatus = 'all' | 'pending' | 'active' | 'complete' | 'failed';

interface TableTask extends ParsedTask {
  waveIndex: number;
  waveLabel: string;
  status: 'pending' | 'active' | 'complete' | 'failed';
  isOnCriticalPath: boolean;
}

// ============================================================================
// WaveTableView
// ============================================================================

interface WaveTableViewProps {
  wavePlan: ParsedWavePlan;
  waveProgress?: Map<number, WaveProgress>;
  currentWaveIndex?: number;
  onTaskClick?: (task: TableTask) => void;
  className?: string;
}

export function WaveTableView({
  wavePlan,
  waveProgress,
  currentWaveIndex,
  onTaskClick,
  className,
}: WaveTableViewProps) {
  const [sortField, setSortField] = useState<SortField>('wave');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [filterModel, setFilterModel] = useState<'all' | 'haiku' | 'sonnet' | 'opus'>('all');

  // Convert wave plan to flat table data
  const tableData = useMemo((): TableTask[] => {
    const tasks: TableTask[] = [];
    const criticalPathSet = new Set(wavePlan.criticalPath);

    for (const wave of wavePlan.waves) {
      for (const task of wave.tasks) {
        // Determine task status
        let status: 'pending' | 'active' | 'complete' | 'failed' = 'pending';

        if (waveProgress) {
          const progress = waveProgress.get(wave.waveIndex);
          if (progress) {
            // Check if task is completed or failed based on wave progress
            if (progress.status === 'completed') {
              status = 'complete';
            } else if (progress.status === 'failed') {
              status = 'failed';
            } else if (progress.status === 'active' && progress.runningTasks > 0) {
              status = 'active';
            }
          }
        } else if (currentWaveIndex !== undefined) {
          // Fallback to currentWaveIndex
          if (wave.waveIndex < currentWaveIndex) {
            status = 'complete';
          } else if (wave.waveIndex === currentWaveIndex) {
            status = 'active';
          }
        }

        tasks.push({
          ...task,
          waveIndex: wave.waveIndex,
          waveLabel: wave.label,
          status,
          isOnCriticalPath: criticalPathSet.has(task.taskCode),
        });
      }
    }

    return tasks;
  }, [wavePlan, waveProgress, currentWaveIndex]);

  // Filter and sort
  const filteredAndSortedData = useMemo(() => {
    let filtered = tableData;

    // Apply status filter
    if (filterStatus !== 'all') {
      filtered = filtered.filter(task => task.status === filterStatus);
    }

    // Apply model filter
    if (filterModel !== 'all') {
      filtered = filtered.filter(task => task.recommendedModel === filterModel);
    }

    // Sort
    const sorted = [...filtered].sort((a, b) => {
      let aVal: string | number;
      let bVal: string | number;

      switch (sortField) {
        case 'wave':
          aVal = a.waveIndex;
          bVal = b.waveIndex;
          break;
        case 'taskCode':
          aVal = a.taskCode;
          bVal = b.taskCode;
          break;
        case 'description':
          aVal = a.description;
          bVal = b.description;
          break;
        case 'model':
          aVal = a.recommendedModel;
          bVal = b.recommendedModel;
          break;
        case 'complexity':
          const complexityOrder = { S: 0, M: 1, L: 2, XL: 3 };
          aVal = complexityOrder[a.complexity];
          bVal = complexityOrder[b.complexity];
          break;
        case 'status':
          aVal = a.status;
          bVal = b.status;
          break;
        default:
          return 0;
      }

      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    return sorted;
  }, [tableData, sortField, sortDirection, filterStatus, filterModel]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const getStatusIcon = (status: 'pending' | 'active' | 'complete' | 'failed'): string => {
    switch (status) {
      case 'pending':
        return '⏳';
      case 'active':
        return '▶';
      case 'complete':
        return '✓';
      case 'failed':
        return '✗';
    }
  };

  const getStatusColor = (status: 'pending' | 'active' | 'complete' | 'failed'): string => {
    switch (status) {
      case 'pending':
        return 'text-text-tertiary';
      case 'active':
        return 'text-accent-primary';
      case 'complete':
        return 'text-accent-green';
      case 'failed':
        return 'text-accent-red';
    }
  };

  return (
    <div className={cn('space-y-4', className)}>
      {/* Filters */}
      <div className="flex items-center gap-4">
        {/* Status Filter */}
        <div className="flex items-center gap-2">
          <label className="text-xs text-text-secondary">Status:</label>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as FilterStatus)}
            className="px-2 py-1 text-xs rounded bg-bg-panel border border-border-default text-text-primary"
          >
            <option value="all">All</option>
            <option value="pending">Pending</option>
            <option value="active">Active</option>
            <option value="complete">Complete</option>
            <option value="failed">Failed</option>
          </select>
        </div>

        {/* Model Filter */}
        <div className="flex items-center gap-2">
          <label className="text-xs text-text-secondary">Model:</label>
          <select
            value={filterModel}
            onChange={(e) => setFilterModel(e.target.value as any)}
            className="px-2 py-1 text-xs rounded bg-bg-panel border border-border-default text-text-primary"
          >
            <option value="all">All</option>
            <option value="haiku">Haiku</option>
            <option value="sonnet">Sonnet</option>
            <option value="opus">Opus</option>
          </select>
        </div>

        <div className="flex-1" />

        {/* Count */}
        <div className="text-xs text-text-secondary">
          {filteredAndSortedData.length} tasks
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto border border-border-default rounded-lg">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border-default bg-bg-panel">
              <th className="text-left px-3 py-2">
                <button
                  onClick={() => handleSort('wave')}
                  className="flex items-center gap-1 hover:text-accent-primary transition-colors"
                >
                  Wave
                  {sortField === 'wave' && (
                    <span className="text-xs">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                  )}
                </button>
              </th>
              <th className="text-left px-3 py-2">
                <button
                  onClick={() => handleSort('taskCode')}
                  className="flex items-center gap-1 hover:text-accent-primary transition-colors"
                >
                  Task ID
                  {sortField === 'taskCode' && (
                    <span className="text-xs">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                  )}
                </button>
              </th>
              <th className="text-left px-3 py-2">
                <button
                  onClick={() => handleSort('description')}
                  className="flex items-center gap-1 hover:text-accent-primary transition-colors"
                >
                  Description
                  {sortField === 'description' && (
                    <span className="text-xs">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                  )}
                </button>
              </th>
              <th className="text-left px-3 py-2">Files</th>
              <th className="text-left px-3 py-2">Dependencies</th>
              <th className="text-left px-3 py-2">
                <button
                  onClick={() => handleSort('model')}
                  className="flex items-center gap-1 hover:text-accent-primary transition-colors"
                >
                  Model
                  {sortField === 'model' && (
                    <span className="text-xs">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                  )}
                </button>
              </th>
              <th className="text-left px-3 py-2">
                <button
                  onClick={() => handleSort('complexity')}
                  className="flex items-center gap-1 hover:text-accent-primary transition-colors"
                >
                  Size
                  {sortField === 'complexity' && (
                    <span className="text-xs">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                  )}
                </button>
              </th>
              <th className="text-left px-3 py-2">
                <button
                  onClick={() => handleSort('status')}
                  className="flex items-center gap-1 hover:text-accent-primary transition-colors"
                >
                  Status
                  {sortField === 'status' && (
                    <span className="text-xs">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                  )}
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {filteredAndSortedData.map((task) => (
              <tr
                key={task.taskCode}
                onClick={() => onTaskClick?.(task)}
                className={cn(
                  'border-b border-border-default hover:bg-white/5 transition-colors',
                  onTaskClick && 'cursor-pointer',
                  task.isOnCriticalPath && 'bg-accent-primary/5'
                )}
              >
                <td className="px-3 py-2 whitespace-nowrap">
                  <div className="flex items-center gap-1.5">
                    {task.isOnCriticalPath && (
                      <span className="text-accent-amber" title="Critical Path">●</span>
                    )}
                    <span className="text-text-secondary">
                      {task.waveIndex + 1}
                    </span>
                  </div>
                </td>
                <td className="px-3 py-2 whitespace-nowrap font-mono text-xs">
                  {task.taskCode}
                </td>
                <td className="px-3 py-2">
                  <div className="max-w-md truncate" title={task.description}>
                    {task.description}
                  </div>
                </td>
                <td className="px-3 py-2">
                  <div className="text-xs text-text-secondary">
                    {task.filePaths.length} file{task.filePaths.length !== 1 ? 's' : ''}
                  </div>
                </td>
                <td className="px-3 py-2">
                  <div className="text-xs text-text-secondary">
                    {task.dependencies.length > 0 ? task.dependencies.length : '—'}
                  </div>
                </td>
                <td className="px-3 py-2 whitespace-nowrap">
                  <ModelBadge model={task.recommendedModel} />
                </td>
                <td className="px-3 py-2 whitespace-nowrap">
                  <ComplexityBadge complexity={task.complexity} />
                </td>
                <td className="px-3 py-2 whitespace-nowrap">
                  <span className={cn('text-sm', getStatusColor(task.status))}>
                    {getStatusIcon(task.status)} {task.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {filteredAndSortedData.length === 0 && (
          <div className="text-center py-8 text-text-secondary">
            No tasks match the current filters
          </div>
        )}
      </div>
    </div>
  );
}
