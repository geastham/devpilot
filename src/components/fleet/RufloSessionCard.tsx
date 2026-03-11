'use client';

import { useState } from 'react';
import { cn, formatMinutes, formatTime } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { RepoBadge, StatusBadge } from '@/components/ui/badge';
import { ProgressBar } from '@/components/ui/progress';
import type { RufloSession } from '@/types';

interface RufloSessionCardProps {
  session: RufloSession;
}

export function RufloSessionCard({ session }: RufloSessionCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const statusVariant =
    session.progressPercent >= 90
      ? 'idle-imminent'
      : session.progressPercent >= 70
      ? 'needs-spec'
      : session.status;

  const progressVariant =
    statusVariant === 'idle-imminent'
      ? 'danger'
      : statusVariant === 'needs-spec'
      ? 'warning'
      : session.status === 'complete'
      ? 'success'
      : 'default';

  const hasPulse =
    statusVariant === 'idle-imminent' || statusVariant === 'needs-spec';
  const pulseClass =
    statusVariant === 'idle-imminent'
      ? 'pulse-red'
      : statusVariant === 'needs-spec'
      ? 'pulse-amber'
      : '';

  return (
    <Card
      className={cn(
        'transition-all duration-200',
        hasPulse && pulseClass,
        session.status === 'complete' && 'opacity-60',
        session.status === 'error' && 'border-accent-red'
      )}
    >
      <CardContent
        className="p-3 cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <RepoBadge repo={session.repo} />
            <span className="text-xs text-text-muted">{session.linearTicketId}</span>
          </div>
        </div>

        {/* Title */}
        <h4 className="text-sm font-medium text-text-primary truncate mb-1">
          {session.ticketTitle}
        </h4>

        {/* Workstream */}
        <p className="text-xs text-text-secondary font-mono mb-2 truncate">
          {session.currentWorkstream}
        </p>

        {/* Progress */}
        <div className="flex items-center gap-3 mb-2">
          <ProgressBar
            value={session.progressPercent}
            variant={progressVariant}
            className="flex-1"
          />
          <span className="text-xs text-text-secondary min-w-[36px]">
            {session.progressPercent}%
          </span>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-text-muted">
            Elapsed: {formatMinutes(session.elapsedMinutes)}
          </span>
          <StatusBadge status={statusVariant} />
        </div>

        {/* Expanded: Completed Tasks */}
        {isExpanded && session.completedTasks.length > 0 && (
          <div className="mt-3 pt-3 border-t border-border-default">
            <p className="text-xs text-text-muted mb-2">Recent completions:</p>
            <div className="space-y-1">
              {session.completedTasks.slice(0, 3).map((task, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 text-xs font-mono text-text-secondary"
                >
                  <span className="text-text-muted">
                    {formatTime(new Date(task.completedAt))}
                  </span>
                  <span className="text-accent-green">✓</span>
                  <span className="truncate">{task.label}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
