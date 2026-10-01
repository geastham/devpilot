'use client';

import { Rocket } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useFleetStore } from '@/stores';
import { RufloSessionCard } from './RufloSessionCard';

interface FleetStatusPanelProps {
  className?: string;
}

export function FleetStatusPanel({ className }: FleetStatusPanelProps) {
  const sessions = useFleetStore((state) => state.sessions);
  const fleetCapacity = useFleetStore((state) => state.fleetCapacity);

  const activeSessions = sessions.filter((s) => s.status === 'active');
  const completedSessions = sessions.filter((s) => s.status === 'complete');

  return (
    <div
      className={cn(
        'flex flex-col bg-bg-panel border-r border-border-default h-full',
        className
      )}
    >
      {/* Header */}
      {/* The panel sits at the left end of the horizon — the end work flows
          toward — but nothing connected the two. The subtitle is the link: what
          you are looking at is READY items that were dispatched. */}
      <div className="sticky top-0 z-10 border-b border-border-default bg-bg-panel px-4 py-2.5">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-text-primary">
            Fleet Status
          </span>
          <span className="text-xs text-text-muted">
            {sessions.length} session{sessions.length !== 1 ? 's' : ''}
          </span>
        </div>
        <p className="mt-0.5 truncate text-xs text-text-muted">
          Running what READY dispatched
        </p>
      </div>

      {/* Sessions List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {sessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            {/* Line icon, not an emoji — same reason as the horizon's empty
                states: emoji render at a different weight per platform. */}
            <Rocket
              className="mb-3 h-5 w-5 text-text-muted/60"
              strokeWidth={1.5}
            />
            <p className="text-sm font-medium text-text-secondary">No active sessions</p>
            <p className="mt-1 text-xs text-text-muted">
              Dispatch a ready item and its agents appear here
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
      {/*
        Three lines stood here and none was a measurement. "Total workers"
        counted the cards above it. "Avg velocity" printed a store field nothing
        ever set, so it read 0.0 tasks/h for everyone, always. "Fleet
        utilization" divided running sessions by listed sessions, so one
        running agent and nothing else read 100%.

        What is known is how many agents are running, and — when the operator
        or the session runner has said — how many the fleet can run at once.
      */}
      <div className="border-t border-border-default bg-bg-panel px-4 py-3">
        <div className="text-xs text-text-muted space-y-1">
          <p>
            Agents running: {activeSessions.length}
            {fleetCapacity !== null && ` of ${fleetCapacity}`}
          </p>
          {fleetCapacity === null && (
            <p>
              Fleet capacity is not known. Set DEVPILOT_FLEET_CAPACITY, or
              connect a session runner, to see how full the fleet is.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
