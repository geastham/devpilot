'use client';

import { cn, formatTime } from '@/lib/utils';
import { useFleetStore } from '@/stores';
import { RepoBadge } from '@/components/ui/badge';
import type { ActivityEvent, EventType } from '@/types';

interface ActivityFeedProps {
  className?: string;
  maxItems?: number;
}

const eventTypeConfig: Record<
  EventType,
  { color: string; icon: string }
> = {
  session_progress: { color: 'text-text-secondary', icon: '→' },
  session_complete: { color: 'text-accent-green', icon: '✓' },
  session_needs_spec: { color: 'text-accent-amber', icon: '⚠' },
  file_unlocked: { color: 'text-text-muted', icon: '🔓' },
  plan_ready: { color: 'text-accent-purple', icon: '📋' },
  plan_approved: { color: 'text-accent-primary', icon: '✓' },
  item_dispatched: { color: 'text-accent-primary', icon: '🚀' },
  runway_update: { color: 'text-accent-amber', icon: '⏱' },
  score_update: { color: 'text-accent-purple', icon: '★' },
  wave_advance: { color: 'text-accent-primary', icon: '⚡' },
  wave_task_complete: { color: 'text-accent-green', icon: '✓' },
  wave_plan_complete: { color: 'text-accent-green', icon: '🎉' },
  wave_plan_paused: { color: 'text-accent-amber', icon: '⏸' },
  wave_plan_resumed: { color: 'text-accent-primary', icon: '▶' },
};

export function ActivityFeed({ className, maxItems = 20 }: ActivityFeedProps) {
  const events = useFleetStore((state) => state.activityEvents);
  const displayEvents = events.slice(0, maxItems);

  return (
    <div className={cn('flex flex-col bg-bg-panel h-full', className)}>
      {/* Header */}
      <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-border-default bg-bg-panel px-4 py-3">
        <span className="text-sm font-semibold text-text-primary">Activity</span>
        <span className="h-2 w-2 rounded-full bg-accent-green animate-pulse" />
        <span className="text-xs text-accent-green">LIVE</span>
      </div>

      {/* Events List */}
      <div className="flex-1 overflow-y-auto">
        {displayEvents.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center px-4">
            <p className="text-sm text-text-muted">No recent activity</p>
          </div>
        ) : (
          displayEvents.map((event, index) => (
            <ActivityEventRow
              key={event.id}
              event={event}
              isNew={index === 0}
            />
          ))
        )}
      </div>
    </div>
  );
}

interface ActivityEventRowProps {
  event: ActivityEvent;
  isNew?: boolean;
}

function ActivityEventRow({ event, isNew }: ActivityEventRowProps) {
  const config = eventTypeConfig[event.type] || {
    color: 'text-text-secondary',
    icon: '•',
  };

  const isWaveEvent = event.type.startsWith('wave_');

  return (
    <div
      className={cn(
        'flex items-start gap-2 border-b border-border-default px-4 py-2',
        'hover:bg-white/5 transition-colors',
        isNew && 'animate-slide-in-top bg-white/5',
        isWaveEvent && 'border-l-2 border-l-accent-primary'
      )}
    >
      {/* Timestamp */}
      <span className="text-xs text-text-muted font-mono min-w-[40px]">
        {formatTime(new Date(event.createdAt))}
      </span>

      {/* Repo badge (if present) */}
      {event.repo && (
        <RepoBadge repo={event.repo} className="text-[10px] px-1.5 py-0" />
      )}

      {/* Message */}
      <div className="flex-1 flex flex-col gap-1">
        <span className={cn('text-xs', config.color)}>
          {config.icon} {event.message}
        </span>

        {/* Wave event metadata */}
        {isWaveEvent && event.metadata && (
          <WaveEventMetadata type={event.type} metadata={event.metadata} />
        )}
      </div>
    </div>
  );
}

interface WaveEventMetadataProps {
  type: EventType;
  metadata: Record<string, unknown>;
}

function WaveEventMetadata({ type, metadata }: WaveEventMetadataProps) {
  if (type === 'wave_advance') {
    return (
      <div className="text-[10px] text-text-muted font-mono">
        Wave {metadata.fromWave} → {metadata.toWave} ({metadata.tasksCompleted}/{metadata.totalTasks} tasks)
      </div>
    );
  }

  if (type === 'wave_task_complete') {
    return (
      <div className="text-[10px] text-text-muted font-mono">
        {metadata.taskLabel} • {metadata.duration}m • {metadata.model}
      </div>
    );
  }

  if (type === 'wave_plan_complete') {
    return (
      <div className="text-[10px] text-text-muted font-mono">
        {metadata.totalTasks} tasks • {metadata.totalWaves} waves • {metadata.duration}m elapsed
      </div>
    );
  }

  if (type === 'wave_plan_paused' || type === 'wave_plan_resumed') {
    return (
      <div className="text-[10px] text-text-muted font-mono">
        Wave {metadata.currentWave}/{metadata.totalWaves} • {metadata.completedTasks}/{metadata.totalTasks} tasks
      </div>
    );
  }

  return null;
}
