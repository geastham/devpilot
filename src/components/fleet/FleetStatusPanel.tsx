'use client';

import { cn } from '@/lib/utils';
import { useFleetStore } from '@/stores';
import { RufloSessionCard } from './RufloSessionCard';

interface FleetStatusPanelProps {
  className?: string;
}

export function FleetStatusPanel({ className }: FleetStatusPanelProps) {
  const sessions = useFleetStore((state) => state.sessions);
  const avgVelocityTasksPerHour = useFleetStore((state) => state.avgVelocityTasksPerHour);

  const activeSessions = sessions.filter((s) => s.status === 'active');
  const completedSessions = sessions.filter((s) => s.status === 'complete');
  const totalWorkers = sessions.reduce((sum, s) => sum + 1, 0); // Simplified

  return (
    <div
      className={cn(
        'flex flex-col bg-bg-panel border-r border-border-default h-full',
        className
      )}
    >
      {/* Header */}
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border-default bg-bg-panel px-4 py-3">
        <span className="text-sm font-semibold text-text-primary">Fleet Status</span>
        <span className="text-xs text-text-muted">
          {sessions.length} session{sessions.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Sessions List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {sessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="mb-3 text-3xl opacity-50">🚀</div>
            <p className="text-sm font-medium text-text-secondary">No active sessions</p>
            <p className="mt-1 text-xs text-text-muted">
              Dispatch an item to start a Ruflo hive
            </p>
          </div>
        ) : (
          sessions
            .sort((a, b) => {
              // Sort by status priority: active > needs-spec > complete > error
              const statusOrder = { 'needs-spec': 0, active: 1, complete: 2, error: 3 };
              const statusA = a.progressPercent >= 70 && a.status === 'active' ? 'needs-spec' : a.status;
              const statusB = b.progressPercent >= 70 && b.status === 'active' ? 'needs-spec' : b.status;
              return (statusOrder[statusA] ?? 4) - (statusOrder[statusB] ?? 4);
            })
            .map((session) => (
              <RufloSessionCard key={session.id} session={session} />
            ))
        )}
      </div>

      {/* Footer Stats */}
      <div className="border-t border-border-default bg-bg-panel px-4 py-3">
        <div className="text-xs text-text-muted space-y-1">
          <p>Total workers: {totalWorkers}</p>
          <p>Avg velocity: {avgVelocityTasksPerHour.toFixed(1)} tasks/h</p>
          <p>
            Fleet utilization:{' '}
            {sessions.length > 0
              ? Math.round((activeSessions.length / sessions.length) * 100)
              : 0}
            %
          </p>
        </div>
      </div>
    </div>
  );
}
