'use client';

import { cn } from '@/lib/utils';
import { TaskRow } from './TaskRow';
import type { Workstream, Task } from '@/types';

interface WorkstreamGridProps {
  workstreams: Workstream[];
  sequentialTasks: Task[];
  itemId: string;
}

export function WorkstreamGrid({
  workstreams,
  sequentialTasks,
  itemId,
}: WorkstreamGridProps) {
  const columnCount = Math.min(workstreams.length, 2);

  return (
    <div>
      {/* Parallel Workstreams */}
      <div
        className={cn(
          'grid gap-4',
          columnCount === 1 && 'grid-cols-1',
          columnCount === 2 && 'grid-cols-2'
        )}
      >
        {workstreams.map((workstream) => (
          <WorkstreamColumn
            key={workstream.id}
            workstream={workstream}
            itemId={itemId}
          />
        ))}
      </div>

      {/* Sequential Tasks */}
      {sequentialTasks.length > 0 && (
        <div className="mt-4 pt-4 border-t border-border-default">
          <div className="text-xs text-text-muted mb-3 flex items-center gap-2">
            <span>↓</span>
            <span>Sequential (depends on all workstreams complete)</span>
          </div>
          <div className="space-y-2">
            {sequentialTasks.map((task) => (
              <TaskRow key={task.id} task={task} itemId={itemId} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Workstream Column
// ============================================================================

interface WorkstreamColumnProps {
  workstream: Workstream;
  itemId: string;
}

function WorkstreamColumn({ workstream, itemId }: WorkstreamColumnProps) {
  return (
    <div className="rounded-lg border border-border-default bg-bg-panel/50 p-3">
      {/* Header */}
      <div className="mb-3 pb-2 border-b border-border-default">
        <h4 className="text-sm font-semibold text-text-primary">
          {workstream.label}
        </h4>
        <p className="text-xs text-text-muted">
          {workstream.repo} · {workstream.workerCount} worker
          {workstream.workerCount !== 1 ? 's' : ''}
        </p>
      </div>

      {/* Tasks */}
      <div className="space-y-2">
        {workstream.tasks.map((task) => (
          <TaskRow key={task.id} task={task} itemId={itemId} />
        ))}
      </div>
    </div>
  );
}
