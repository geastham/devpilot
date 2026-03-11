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

      // Set conductor score
      if (state.conductorScore) {
        const score: ConductorScore = {
          total: state.conductorScore.total,
          fleetUtilization: state.conductorScore.breakdown?.fleetUtilization || 0,
          runwayHealth: state.conductorScore.breakdown?.runwayHealth || 0,
          planAccuracy: state.conductorScore.breakdown?.planAccuracy || 0,
          costEfficiency: state.conductorScore.breakdown?.costEfficiency || 0,
          velocityTrend: state.conductorScore.breakdown?.velocityTrend || 0,
          leaderboardRank: state.conductorScore.leaderboardRank,
        };
        setScore(score);
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
  }, [setSessions, setScore, setRunway, setActivityEvents]);

  // Fetch on mount
  useEffect(() => {
    fetchFleetState();
  }, [fetchFleetState]);

  return { refetch: fetchFleetState };
}
