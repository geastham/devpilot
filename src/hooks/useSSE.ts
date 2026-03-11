'use client';

import { useEffect, useRef } from 'react';
import { useFleetStore, useHorizonStore } from '@/stores';

/**
 * Hook to manage SSE connection for real-time updates
 */
export function useSSE() {
  const eventSourceRef = useRef<EventSource | null>(null);

  const setConnected = useFleetStore((state) => state.setConnected);
  const updateSession = useFleetStore((state) => state.updateSession);
  const addActivityEvent = useFleetStore((state) => state.addActivityEvent);
  const setRunway = useFleetStore((state) => state.setRunway);

  useEffect(() => {
    const connect = () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }

      const eventSource = new EventSource('/api/events/stream');
      eventSourceRef.current = eventSource;

      eventSource.onopen = () => {
        console.log('SSE connected');
        setConnected(true);
      };

      eventSource.onerror = (error) => {
        console.error('SSE error:', error);
        setConnected(false);

        // Reconnect after 5 seconds
        eventSource.close();
        setTimeout(connect, 5000);
      };

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          switch (data.type) {
            case 'connected':
              console.log('SSE connection confirmed:', data.timestamp);
              break;

            case 'fleet_heartbeat':
              // Update session progress from heartbeat
              if (data.sessions) {
                data.sessions.forEach(
                  (session: {
                    id: string;
                    progress: number;
                    status: string;
                    eta: number;
                  }) => {
                    updateSession(session.id, {
                      progressPercent: session.progress,
                      status: session.status.toLowerCase().replace('_', '-') as
                        | 'active'
                        | 'needs-spec'
                        | 'complete'
                        | 'error',
                      estimatedRemainingMinutes: session.eta,
                    });
                  }
                );
              }
              break;

            case 'SESSION_PROGRESS':
              updateSession(data.metadata?.sessionId, {
                progressPercent: data.metadata?.progress,
              });
              addActivityEvent({
                id: data.id,
                type: 'session_progress',
                message: data.message,
                repo: data.repo,
                ticketId: data.ticketId,
                metadata: data.metadata,
                createdAt: new Date(data.createdAt),
              });
              break;

            case 'SESSION_COMPLETE':
              updateSession(data.metadata?.sessionId, { status: 'complete' });
              addActivityEvent({
                id: data.id,
                type: 'session_complete',
                message: data.message,
                repo: data.repo,
                ticketId: data.ticketId,
                metadata: data.metadata,
                createdAt: new Date(data.createdAt),
              });
              break;

            case 'PLAN_GENERATED':
              addActivityEvent({
                id: data.id,
                type: 'plan_ready',
                message: data.message,
                repo: data.repo,
                ticketId: data.ticketId,
                metadata: data.metadata,
                createdAt: new Date(data.createdAt),
              });
              break;

            case 'ITEM_DISPATCHED':
              addActivityEvent({
                id: data.id,
                type: 'item_dispatched',
                message: data.message,
                repo: data.repo,
                ticketId: data.ticketId,
                metadata: data.metadata,
                createdAt: new Date(data.createdAt),
              });
              break;

            case 'RUNWAY_UPDATE':
              if (data.metadata?.runwayHours) {
                setRunway(data.metadata.runwayHours);
              }
              addActivityEvent({
                id: data.id,
                type: 'runway_update',
                message: data.message,
                repo: data.repo,
                ticketId: data.ticketId,
                metadata: data.metadata,
                createdAt: new Date(data.createdAt),
              });
              break;

            case 'SCORE_UPDATE':
              addActivityEvent({
                id: data.id,
                type: 'score_update',
                message: data.message,
                metadata: data.metadata,
                createdAt: new Date(data.createdAt),
              });
              break;

            case 'FILE_UNLOCKED':
              addActivityEvent({
                id: data.id,
                type: 'file_unlocked',
                message: data.message,
                repo: data.repo,
                metadata: data.metadata,
                createdAt: new Date(data.createdAt),
              });
              break;

            case 'error':
              console.warn('SSE poll error:', data.message);
              break;

            default:
              // Handle any other event types that come with data.id
              if (data.id) {
                addActivityEvent({
                  id: data.id,
                  type: data.type.toLowerCase(),
                  message: data.message,
                  repo: data.repo,
                  ticketId: data.ticketId,
                  metadata: data.metadata,
                  createdAt: new Date(data.createdAt),
                });
              }
          }
        } catch (error) {
          console.error('Failed to parse SSE message:', error);
        }
      };
    };

    connect();

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, [setConnected, updateSession, addActivityEvent, setRunway]);
}
