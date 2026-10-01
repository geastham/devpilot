'use client';

import { useEffect, useCallback } from 'react';
import { useFleetStore } from '@/stores';
import type { RufloSession, ConductorScore, ActivityEvent } from '@/types';

/**
 * Hook to fetch and manage fleet state from the API
 */
export function useFleetState() {
  const setSessions = useFleetStore((state) => state.setSessions);
  const setScore = useFleetStore((state) => state.setScore);
  const setRunway = useFleetStore((state) => state.setRunway);
  const setFleetCapacity = useFleetStore((state) => state.setFleetCapacity);
  const setActivityEvents = useFleetStore((state) => state.setActivityEvents);

  const fetchFleetState = useCallback(async () => {
    try {
      const response = await fetch('/api/fleet/state');
      if (!response.ok) {
        throw new Error(`Failed to fetch fleet state: ${response.statusText}`);
      }

      const state = await response.json();

      // Transform sessions
      const sessions: RufloSession[] = (state.sessions || []).map(
        (session: Record<string, unknown>) => ({
          id: session.id,
          repo: session.repo,
          linearTicketId: session.linearTicketId,
          ticketTitle: session.ticketTitle,
          currentWorkstream: session.currentWorkstream,
          progressPercent: session.progressPercent,
          elapsedMinutes: session.elapsedMinutes,
          estimatedRemainingMinutes: session.estimatedRemainingMinutes,
          status: (session.status as string).toLowerCase().replace('_', '-'),
          inFlightFiles: session.inFlightFiles || [],
          /**
           * The live instrument. This mapper lists fields explicitly, so a new
           * column reaches the API and stops here silently — the card rendered
           * a status board again while /api/fleet/state was returning tool
           * calls, files and cost the whole time.
           */
          telemetry: (session.telemetry as RufloSession['telemetry']) ?? null,
          completedTasks: ((session.completedTasks as Array<Record<string, unknown>>) || []).map(
            (task: Record<string, unknown>) => ({
              label: task.label,
              completedAt: new Date(task.completedAt as string),
              model: task.model,
              durationMinutes: task.durationMinutes,
            })
          ),
        })
      );

      setSessions(sessions);

      // Set runway
      if (state.runway) {
        setRunway(state.runway.hours);
      }

      // Null when neither the operator nor the runner has said how many agents
      // the fleet can run — in which case nothing is shown as a share of it.
      setFleetCapacity(
        typeof state.fleet?.maxSessions === 'number' ? state.fleet.maxSessions : null
      );

      // Set conductor score
      // Passed through as computed. An unmeasured dimension arrives as null
      // and must stay null: this used to `|| 0` every dimension, which is how
      // "no data" became "zero points" on its way to the screen.
      if (state.conductorScore) {
        setScore(state.conductorScore as ConductorScore);
      }

      // Set activity events
      if (state.recentEvents) {
        const events: ActivityEvent[] = state.recentEvents.map(
          (event: Record<string, unknown>) => ({
            id: event.id,
            type: (event.type as string).toLowerCase(),
            message: event.message,
            repo: event.repo,
            ticketId: event.ticketId,
            metadata: event.metadata,
            createdAt: new Date(event.createdAt as string),
          })
        );
        setActivityEvents(events);
      }
    } catch (error) {
      console.error('Failed to fetch fleet state:', error);
    }
  }, [setSessions, setScore, setRunway, setFleetCapacity, setActivityEvents]);

  // Fetch on mount
  useEffect(() => {
    fetchFleetState();
  }, [fetchFleetState]);

  return { refetch: fetchFleetState };
}
