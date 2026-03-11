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

const defaultScore: ConductorScore = {
  total: 0,
  fleetUtilization: 0,
  runwayHealth: 0,
  planAccuracy: 0,
  costEfficiency: 0,
  velocityTrend: 0,
  leaderboardRank: null,
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

        default:
          console.log('Unknown event type:', data.type);
      }
    };

    return eventSource;
  };

  return { connect };
}
