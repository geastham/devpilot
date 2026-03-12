import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type { WavePlan, WavePlanHeartbeat } from '@/types';

// ============================================================================
// Types
// ============================================================================

interface WavePlanStoreState {
  // Data
  wavePlans: Map<string, WavePlan>;
  activeWavePlanId: string | null;
  wavePlansByHorizonItem: Map<string, string>; // horizonItemId -> wavePlanId

  // Actions
  setWavePlans: (wavePlans: WavePlan[]) => void;
  setWavePlan: (wavePlan: WavePlan) => void;
  updateWavePlan: (id: string, updates: Partial<WavePlan>) => void;
  removeWavePlan: (id: string) => void;
  setActiveWavePlanId: (id: string | null) => void;
  updateFromHeartbeat: (heartbeat: WavePlanHeartbeat) => void;

  // Selectors
  getWavePlanById: (id: string) => WavePlan | undefined;
  getWavePlanByHorizonItem: (horizonItemId: string) => WavePlan | undefined;
  getActiveWavePlans: () => WavePlan[];
  getExecutingWavePlans: () => WavePlan[];
}

// ============================================================================
// Store
// ============================================================================

export const useWavePlanStore = create<WavePlanStoreState>()(
  devtools(
    (set, get) => ({
      // Initial state
      wavePlans: new Map(),
      activeWavePlanId: null,
      wavePlansByHorizonItem: new Map(),

      // Actions
      setWavePlans: (wavePlans) => {
        const wavePlanMap = new Map<string, WavePlan>();
        const horizonItemMap = new Map<string, string>();

        wavePlans.forEach((wp) => {
          wavePlanMap.set(wp.id, wp);
          horizonItemMap.set(wp.horizonItemId, wp.id);
        });

        set({
          wavePlans: wavePlanMap,
          wavePlansByHorizonItem: horizonItemMap,
        });
      },

      setWavePlan: (wavePlan) => {
        const wavePlans = new Map(get().wavePlans);
        const horizonItemMap = new Map(get().wavePlansByHorizonItem);

        wavePlans.set(wavePlan.id, wavePlan);
        horizonItemMap.set(wavePlan.horizonItemId, wavePlan.id);

        set({
          wavePlans,
          wavePlansByHorizonItem: horizonItemMap,
        });
      },

      updateWavePlan: (id, updates) => {
        const wavePlans = new Map(get().wavePlans);
        const existing = wavePlans.get(id);

        if (existing) {
          wavePlans.set(id, { ...existing, ...updates });
          set({ wavePlans });
        }
      },

      removeWavePlan: (id) => {
        const wavePlans = new Map(get().wavePlans);
        const horizonItemMap = new Map(get().wavePlansByHorizonItem);
        const wavePlan = wavePlans.get(id);

        if (wavePlan) {
          horizonItemMap.delete(wavePlan.horizonItemId);
          wavePlans.delete(id);

          set({
            wavePlans,
            wavePlansByHorizonItem: horizonItemMap,
            activeWavePlanId: get().activeWavePlanId === id ? null : get().activeWavePlanId,
          });
        }
      },

      setActiveWavePlanId: (id) => set({ activeWavePlanId: id }),

      updateFromHeartbeat: (heartbeat) => {
        const wavePlans = new Map(get().wavePlans);
        const existing = wavePlans.get(heartbeat.id);

        if (existing) {
          wavePlans.set(heartbeat.id, {
            ...existing,
            status: heartbeat.status,
            currentWaveIndex: heartbeat.currentWaveIndex,
            completedTasks: heartbeat.completedTasks,
            totalTasks: heartbeat.totalTasks,
            updatedAt: new Date(),
          });

          set({ wavePlans });
        }
      },

      // Selectors
      getWavePlanById: (id) => get().wavePlans.get(id),

      getWavePlanByHorizonItem: (horizonItemId) => {
        const wavePlanId = get().wavePlansByHorizonItem.get(horizonItemId);
        return wavePlanId ? get().wavePlans.get(wavePlanId) : undefined;
      },

      getActiveWavePlans: () => {
        return Array.from(get().wavePlans.values()).filter(
          (wp) => wp.status === 'executing' || wp.status === 'paused' || wp.status === 're-optimizing'
        );
      },

      getExecutingWavePlans: () => {
        return Array.from(get().wavePlans.values()).filter(
          (wp) => wp.status === 'executing'
        );
      },
    }),
    { name: 'wave-plan-store' }
  )
);

// ============================================================================
// Hook to fetch wave plans
// ============================================================================

export function useWavePlanFetch() {
  const setWavePlans = useWavePlanStore((state) => state.setWavePlans);

  const fetchActiveWavePlans = async () => {
    try {
      const response = await fetch('/api/wave-plans/active');
      if (response.ok) {
        const data = await response.json();
        setWavePlans(data);
      }
    } catch (error) {
      console.error('Failed to fetch active wave plans:', error);
    }
  };

  const fetchWavePlanForItem = async (horizonItemId: string) => {
    try {
      const response = await fetch(`/api/items/${horizonItemId}/wave-plan`);
      if (response.ok) {
        const wavePlan = await response.json();
        useWavePlanStore.getState().setWavePlan(wavePlan);
        return wavePlan;
      }
    } catch (error) {
      console.error('Failed to fetch wave plan for item:', error);
    }
    return null;
  };

  return { fetchActiveWavePlans, fetchWavePlanForItem };
}
