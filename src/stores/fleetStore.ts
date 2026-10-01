import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type {
  RufloSession,
  FleetState,
  ConductorScore,
  ActivityEvent,
  RunwayStatus,
} from '@/types';
import { getRunwayStatusFromHours } from '@/lib/utils';

// ============================================================================
// Types
// ============================================================================

interface FleetStoreState {
  // Data
  sessions: RufloSession[];
  runwayHours: number;
  runwayStatus: RunwayStatus;
  /** Concurrent agent slots, from the operator or the runner. Null when unknown. */
  fleetCapacity: number | null;
  conductorScore: ConductorScore;
  avgVelocityTasksPerHour: number;
  planningVelocityPerHour: number;
  velocityRatio: number;
  activityEvents: ActivityEvent[];
  isConnected: boolean;

  // Actions
  setSessions: (sessions: RufloSession[]) => void;
  updateSession: (sessionId: string, updates: Partial<RufloSession>) => void;
  addSession: (session: RufloSession) => void;
  removeSession: (sessionId: string) => void;
  setRunway: (hours: number) => void;
  setFleetCapacity: (capacity: number | null) => void;
  setScore: (score: ConductorScore) => void;
  addActivityEvent: (event: ActivityEvent) => void;
  setActivityEvents: (events: ActivityEvent[]) => void;
  setConnected: (connected: boolean) => void;

  // Selectors
  getSessionById: (id: string) => RufloSession | undefined;
  getActiveSessionsCount: () => number;
  getSessionsByRepo: (repo: string) => RufloSession[];
  getSessionsNeedingSpec: () => RufloSession[];
  getIdleImminentSessions: () => RufloSession[];
}

// ============================================================================
// Default values
// ============================================================================

/**
 * Before the first fetch there is no score, and saying so is different from
 * saying it is zero: nothing measured, out of nothing.
 */
const defaultScore: ConductorScore = {
  total: 0,
  measuredMax: 0,
  max: 1000,
  complete: false,
  dimensions: [],
  windowHours: 0,
  modelVersion: 0,
};

// ============================================================================
// Store
// ============================================================================

export const useFleetStore = create<FleetStoreState>()(
  devtools(
    (set, get) => ({
      // Initial state
      sessions: [],
      runwayHours: 0,
      runwayStatus: 'healthy',
      fleetCapacity: null,
      conductorScore: defaultScore,
      avgVelocityTasksPerHour: 0,
      planningVelocityPerHour: 0,
      velocityRatio: 0,
      activityEvents: [],
      isConnected: false,

      // Actions
      setSessions: (sessions) => set({ sessions }),

      updateSession: (sessionId, updates) =>
        set((state) => ({
          sessions: state.sessions.map((session) =>
            session.id === sessionId ? { ...session, ...updates } : session
          ),
        })),

      addSession: (session) =>
        set((state) => ({
          sessions: [...state.sessions, session],
        })),

      removeSession: (sessionId) =>
        set((state) => ({
          sessions: state.sessions.filter((s) => s.id !== sessionId),
        })),

      setRunway: (hours) =>
        set({
          runwayHours: hours,
          runwayStatus: getRunwayStatusFromHours(hours),
        }),

      setFleetCapacity: (capacity) => set({ fleetCapacity: capacity }),

      setScore: (score) => set({ conductorScore: score }),

      addActivityEvent: (event) =>
        set((state) => ({
          activityEvents: [event, ...state.activityEvents].slice(0, 100), // Keep last 100
        })),

      setActivityEvents: (events) => set({ activityEvents: events }),

      setConnected: (connected) => set({ isConnected: connected }),

      // Selectors
      getSessionById: (id) => get().sessions.find((s) => s.id === id),

      getActiveSessionsCount: () =>
        get().sessions.filter((s) => s.status === 'active').length,

      getSessionsByRepo: (repo) =>
        get().sessions.filter((s) => s.repo === repo),

      getSessionsNeedingSpec: () =>
        get().sessions.filter(
          (s) => s.status === 'active' && s.progressPercent >= 70
        ),

      getIdleImminentSessions: () =>
        get().sessions.filter(
          (s) => s.status === 'active' && s.progressPercent >= 90
        ),
    }),
    { name: 'fleet-store' }
  )
);

// ============================================================================
// SSE Connection Hook
// ============================================================================

export function useFleetSSE() {
  const {
    setConnected,
    updateSession,
    addActivityEvent,
    setRunway,
    addSession,
    removeSession,
  } = useFleetStore();

  const connect = () => {
    const eventSource = new EventSource('/api/events/stream');

    eventSource.onopen = () => {
      setConnected(true);
    };

    eventSource.onerror = () => {
      setConnected(false);
      // Reconnect after 5 seconds
      setTimeout(connect, 5000);
    };

    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);

      switch (data.type) {
        case 'session_progress':
          updateSession(data.sessionId, { progressPercent: data.progress });
          break;

        case 'session_complete':
          updateSession(data.sessionId, { status: 'complete' });
          break;

        case 'session_needs_spec':
          updateSession(data.sessionId, { status: 'needs-spec' });
          break;

        case 'runway_update':
          setRunway(data.runwayHours);
          break;

        case 'activity':
          addActivityEvent(data.event);
          break;

        case 'wave_plan_heartbeat':
          // Update wave plan store with heartbeat data
          if (data.wavePlans && Array.isArray(data.wavePlans)) {
            const { useWavePlanStore } = require('./wavePlanStore');
            data.wavePlans.forEach((wp: any) => {
              useWavePlanStore.getState().updateFromHeartbeat(wp);
            });
          }
          break;

        case 'fleet_heartbeat':
          // Handle fleet heartbeat if needed
          break;

        default:
          console.log('Unknown event type:', data.type);
      }
    };

    return eventSource;
  };

  return { connect };
}
