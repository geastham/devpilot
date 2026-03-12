'use client';

import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { formatMinutes } from '@/lib/utils';
import type { ParsedWavePlan, ParsedTask, CriticalPathResult, WaveProgress } from '@devpilot.sh/core/wave-planner';

// ============================================================================
// Types
// ============================================================================

interface CriticalPathTask {
  taskCode: string;
  description: string;
  waveIndex: number;
  status: 'complete' | 'active' | 'pending';
  estimatedMinutes: number;
}

// ============================================================================
// CriticalPathIndicator
// ============================================================================

interface CriticalPathIndicatorProps {
  wavePlan: ParsedWavePlan;
  criticalPath?: CriticalPathResult;
  waveProgress?: Map<number, WaveProgress>;
  currentWaveIndex?: number;
  className?: string;
}

export function CriticalPathIndicator({
  wavePlan,
  criticalPath,
  waveProgress,
  currentWaveIndex,
  className,
}: CriticalPathIndicatorProps) {
  // Build critical path tasks with status
  const criticalPathTasks = useMemo((): CriticalPathTask[] => {
    const pathTaskCodes = criticalPath?.path ?? wavePlan.criticalPath;
    const tasks: CriticalPathTask[] = [];

    // Create a map of task codes to tasks
    const taskMap = new Map<string, { task: ParsedTask; waveIndex: number }>();
    for (const wave of wavePlan.waves) {
      for (const task of wave.tasks) {
        taskMap.set(task.taskCode, { task, waveIndex: wave.waveIndex });
      }
    }

    // Build critical path tasks
    for (const taskCode of pathTaskCodes) {
      const entry = taskMap.get(taskCode);
      if (!entry) continue;

      const { task, waveIndex } = entry;

      // Determine status
      let status: 'complete' | 'active' | 'pending' = 'pending';

      if (waveProgress) {
        const progress = waveProgress.get(waveIndex);
        if (progress) {
          if (progress.status === 'completed') {
            status = 'complete';
          } else if (progress.status === 'active' || progress.status === 'dispatching') {
            status = 'active';
          }
        }
      } else if (currentWaveIndex !== undefined) {
        if (waveIndex < currentWaveIndex) {
          status = 'complete';
        } else if (waveIndex === currentWaveIndex) {
          status = 'active';
        }
      }

      // Estimate minutes based on complexity
      const complexityMinutes = {
        S: 5,
        M: 15,
        L: 30,
        XL: 60,
      };

      tasks.push({
        taskCode: task.taskCode,
        description: task.description,
        waveIndex,
        status,
        estimatedMinutes: complexityMinutes[task.complexity],
      });
    }

    return tasks;
  }, [wavePlan, criticalPath, waveProgress, currentWaveIndex]);

  // Calculate progress and time estimates
  const { completedTasks, activeTasks, totalTasks, remainingMinutes } = useMemo(() => {
    const completed = criticalPathTasks.filter(t => t.status === 'complete').length;
    const active = criticalPathTasks.filter(t => t.status === 'active').length;
    const total = criticalPathTasks.length;
    const remaining = criticalPathTasks
      .filter(t => t.status !== 'complete')
      .reduce((sum, t) => sum + t.estimatedMinutes, 0);

    return {
      completedTasks: completed,
      activeTasks: active,
      totalTasks: total,
      remainingMinutes: remaining,
    };
  }, [criticalPathTasks]);

  const progressPercent = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;

  return (
    <div className={cn('space-y-4', className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h3 className="text-sm font-medium text-text-primary">Critical Path</h3>
          <p className="text-xs text-text-secondary">
            {completedTasks} of {totalTasks} tasks complete
          </p>
        </div>
        <div className="text-right space-y-1">
          <div className="text-sm font-medium text-accent-amber">
            {formatMinutes(remainingMinutes)}
          </div>
          <div className="text-xs text-text-secondary">remaining</div>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="h-2 rounded-full bg-bg-panel overflow-hidden">
        <div
          className="h-full bg-accent-amber transition-all duration-300"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      {/* Critical Path Chain */}
      <div className="space-y-2">
        {criticalPathTasks.map((task, index) => {
          const isLast = index === criticalPathTasks.length - 1;

          return (
            <div key={task.taskCode} className="flex items-start gap-3">
              {/* Status Indicator */}
              <div className="flex flex-col items-center pt-1">
                <div
                  className={cn(
                    'w-3 h-3 rounded-full border-2 transition-all duration-300',
                    task.status === 'complete' && 'bg-accent-green border-accent-green',
                    task.status === 'active' && 'bg-accent-primary border-accent-primary animate-pulse',
                    task.status === 'pending' && 'bg-transparent border-border-default'
                  )}
                />
                {!isLast && (
                  <div
                    className={cn(
                      'w-0.5 h-full mt-1 transition-colors duration-300',
                      task.status === 'complete' ? 'bg-accent-green' : 'bg-border-default'
                    )}
                    style={{ minHeight: '20px' }}
                  />
                )}
              </div>

              {/* Task Info */}
              <div className="flex-1 pb-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono text-text-tertiary">
                        {task.taskCode}
                      </span>
                      {task.status === 'active' && (
                        <span className="text-xs text-accent-primary font-medium">
                          IN PROGRESS
                        </span>
                      )}
                    </div>
                    <p
                      className={cn(
                        'text-sm mt-0.5 truncate',
                        task.status === 'complete' ? 'text-text-secondary line-through' : 'text-text-primary'
                      )}
                      title={task.description}
                    >
                      {task.description}
                    </p>
                  </div>
                  <div className="text-xs text-text-tertiary whitespace-nowrap">
                    {formatMinutes(task.estimatedMinutes)}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Summary Footer */}
      <div className="pt-2 border-t border-border-default">
        <div className="flex items-center justify-between text-xs">
          <span className="text-text-secondary">
            Critical path length: {criticalPath?.length ?? wavePlan.criticalPath.length} tasks
          </span>
          <span className="text-text-secondary">
            {activeTasks > 0 && (
              <span className="text-accent-primary">{activeTasks} active</span>
            )}
          </span>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Compact Critical Path (for dashboard)
// ============================================================================

interface CompactCriticalPathProps {
  wavePlan: ParsedWavePlan;
  currentWaveIndex?: number;
  className?: string;
}

export function CompactCriticalPath({
  wavePlan,
  currentWaveIndex,
  className,
}: CompactCriticalPathProps) {
  const criticalPathTasks = wavePlan.criticalPath;
  const totalTasks = criticalPathTasks.length;

  // Estimate completed tasks based on current wave
  const completedTasks = useMemo(() => {
    if (currentWaveIndex === undefined) return 0;

    const taskMap = new Map<string, number>();
    for (const wave of wavePlan.waves) {
      for (const task of wave.tasks) {
        taskMap.set(task.taskCode, wave.waveIndex);
      }
    }

    let completed = 0;
    for (const taskCode of criticalPathTasks) {
      const waveIndex = taskMap.get(taskCode);
      if (waveIndex !== undefined && waveIndex < currentWaveIndex) {
        completed++;
      }
    }

    return completed;
  }, [wavePlan, criticalPathTasks, currentWaveIndex]);

  const progressPercent = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <span className="text-xs text-text-secondary whitespace-nowrap">Critical:</span>
      <div className="flex-1 h-1.5 rounded-full bg-bg-panel overflow-hidden">
        <div
          className="h-full bg-accent-amber transition-all duration-300"
          style={{ width: `${progressPercent}%` }}
        />
      </div>
      <span className="text-xs text-text-tertiary whitespace-nowrap">
        {completedTasks}/{totalTasks}
      </span>
    </div>
  );
}
