import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type {
  HorizonItem,
  Zone,
  Complexity,
  Model,
  Plan,
} from '@/types';

// ============================================================================
// Types
// ============================================================================

interface HorizonState {
  // Data
  items: HorizonItem[];
  selectedItemId: string | null;
  isLoading: boolean;
  error: string | null;

  // Actions
  setItems: (items: HorizonItem[]) => void;
  addItem: (title: string, zone: Zone, repo: string) => Promise<void>;
  updateItem: (id: string, updates: Partial<HorizonItem>) => Promise<void>;
  deleteItem: (id: string) => Promise<void>;
  promoteItem: (id: string, targetZone: Zone) => Promise<void>;
  generatePlan: (id: string) => Promise<void>;
  dispatchItem: (id: string) => Promise<void>;
  approvePlan: (id: string) => Promise<void>;
  requestReplan: (id: string, constraint: string) => Promise<void>;
  updateTaskModel: (itemId: string, taskId: string, model: Model) => Promise<void>;
  updateTaskComplexity: (itemId: string, taskId: string, complexity: Complexity) => Promise<void>;
  reorderItems: (zone: Zone, fromIndex: number, toIndex: number) => void;
  setSelectedItem: (id: string | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;

  // Selectors
  getItemsByZone: (zone: Zone) => HorizonItem[];
  getItemById: (id: string) => HorizonItem | undefined;
}

// ============================================================================
// Store
// ============================================================================

export const useHorizonStore = create<HorizonState>()(
  devtools(
    (set, get) => ({
      // Initial state
      items: [],
      selectedItemId: null,
      isLoading: false,
      error: null,

      // Actions
      setItems: (items) => set({ items }),

      addItem: async (title, zone, repo) => {
        set({ isLoading: true, error: null });
        try {
          const response = await fetch('/api/items', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title, zone, repo }),
          });

          if (!response.ok) {
            throw new Error('Failed to create item');
          }

          const newItem = await response.json();
          const transformedItem: HorizonItem = {
            ...newItem,
            createdAt: new Date(newItem.createdAt),
            updatedAt: new Date(newItem.updatedAt),
          };

          set((state) => ({
            items: [...state.items, transformedItem],
            isLoading: false,
          }));
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : 'Failed to add item',
            isLoading: false,
          });
        }
      },

      updateItem: async (id, updates) => {
        set({ isLoading: true, error: null });
        try {
          const response = await fetch(`/api/items/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updates),
          });

          if (!response.ok) {
            throw new Error('Failed to update item');
          }

          const updatedItem = await response.json();
          set((state) => ({
            items: state.items.map((item) =>
              item.id === id
                ? {
                    ...updatedItem,
                    createdAt: new Date(updatedItem.createdAt),
                    updatedAt: new Date(updatedItem.updatedAt),
                  }
                : item
            ),
            isLoading: false,
          }));
        } catch (error) {
          // Fallback to optimistic update on error
          set((state) => ({
            items: state.items.map((item) =>
              item.id === id ? { ...item, ...updates, updatedAt: new Date() } : item
            ),
            error: error instanceof Error ? error.message : 'Failed to update item',
            isLoading: false,
          }));
        }
      },

      deleteItem: async (id) => {
        set({ isLoading: true, error: null });
        try {
          const response = await fetch(`/api/items/${id}`, {
            method: 'DELETE',
          });

          if (!response.ok) {
            throw new Error('Failed to delete item');
          }

          set((state) => ({
            items: state.items.filter((item) => item.id !== id),
            selectedItemId: state.selectedItemId === id ? null : state.selectedItemId,
            isLoading: false,
          }));
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : 'Failed to delete item',
            isLoading: false,
          });
        }
      },

      promoteItem: async (id, targetZone) => {
        set({ isLoading: true, error: null });
        try {
          const response = await fetch(`/api/items/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ zone: targetZone }),
          });

          if (!response.ok) {
            throw new Error('Failed to promote item');
          }

          const updatedItem = await response.json();
          set((state) => ({
            items: state.items.map((item) =>
              item.id === id
                ? {
                    ...updatedItem,
                    createdAt: new Date(updatedItem.createdAt),
                    updatedAt: new Date(updatedItem.updatedAt),
                  }
                : item
            ),
            isLoading: false,
          }));

          // If promoting to REFINING, trigger plan generation
          if (targetZone === 'REFINING') {
            get().generatePlan(id);
          }
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : 'Failed to promote item',
            isLoading: false,
          });
        }
      },

      generatePlan: async (id) => {
        set({ isLoading: true, error: null });
        try {
          const response = await fetch(`/api/items/${id}/plan/generate`, {
            method: 'POST',
          });

          if (!response.ok) {
            throw new Error('Failed to generate plan');
          }

          const plan = await response.json();

          // Update the item with the new plan
          set((state) => ({
            items: state.items.map((item) =>
              item.id === id ? { ...item, plan, updatedAt: new Date() } : item
            ),
            isLoading: false,
          }));
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : 'Failed to generate plan',
            isLoading: false,
          });
        }
      },

      dispatchItem: async (id) => {
        set({ isLoading: true, error: null });
        try {
          const response = await fetch(`/api/fleet/dispatch/${id}`, {
            method: 'POST',
          });

          if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to dispatch');
          }

          // Remove from horizon (it's now in the fleet)
          set((state) => ({
            items: state.items.filter((item) => item.id !== id),
            selectedItemId: state.selectedItemId === id ? null : state.selectedItemId,
            isLoading: false,
          }));
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : 'Failed to dispatch',
            isLoading: false,
          });
        }
      },

      approvePlan: async (id) => {
        set({ isLoading: true, error: null });
        try {
          // Move to READY zone via API
          const response = await fetch(`/api/items/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ zone: 'READY' }),
          });

          if (!response.ok) {
            throw new Error('Failed to approve plan');
          }

          const updatedItem = await response.json();
          set((state) => ({
            items: state.items.map((item) =>
              item.id === id
                ? {
                    ...updatedItem,
                    createdAt: new Date(updatedItem.createdAt),
                    updatedAt: new Date(updatedItem.updatedAt),
                  }
                : item
            ),
            isLoading: false,
          }));
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : 'Failed to approve plan',
            isLoading: false,
          });
        }
      },

      requestReplan: async (id, constraint) => {
        set({ isLoading: true, error: null });
        try {
          const response = await fetch(`/api/items/${id}/plan/replan`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ constraint }),
          });

          if (!response.ok) {
            throw new Error('Failed to replan');
          }

          const plan = await response.json();

          // Update the item with the new plan
          set((state) => ({
            items: state.items.map((item) =>
              item.id === id ? { ...item, plan, updatedAt: new Date() } : item
            ),
            isLoading: false,
          }));
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : 'Failed to replan',
            isLoading: false,
          });
        }
      },

      updateTaskModel: async (itemId, taskId, model) => {
        set({ isLoading: true, error: null });
        try {
          const response = await fetch(`/api/items/${itemId}/plan/tasks/${taskId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ modelOverride: model }),
          });

          if (!response.ok) {
            throw new Error('Failed to update task model');
          }

          // Optimistic update
          set((state) => ({
            items: state.items.map((item) => {
              if (item.id !== itemId || !item.plan) return item;

              const updateTasks = (tasks: typeof item.plan.workstreams[0]['tasks']) =>
                tasks.map((task) =>
                  task.id === taskId ? { ...task, modelOverride: model } : task
                );

              return {
                ...item,
                plan: {
                  ...item.plan,
                  workstreams: item.plan.workstreams.map((ws) => ({
                    ...ws,
                    tasks: updateTasks(ws.tasks),
                  })),
                  sequentialTasks: updateTasks(item.plan.sequentialTasks),
                },
                updatedAt: new Date(),
              };
            }),
            isLoading: false,
          }));
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : 'Failed to update task model',
            isLoading: false,
          });
        }
      },

      updateTaskComplexity: async (itemId, taskId, complexity) => {
        set({ isLoading: true, error: null });
        try {
          const response = await fetch(`/api/items/${itemId}/plan/tasks/${taskId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ complexity }),
          });

          if (!response.ok) {
            throw new Error('Failed to update task complexity');
          }

          // Optimistic update
          set((state) => ({
            items: state.items.map((item) => {
              if (item.id !== itemId || !item.plan) return item;

              const updateTasks = (tasks: typeof item.plan.workstreams[0]['tasks']) =>
                tasks.map((task) =>
                  task.id === taskId ? { ...task, complexity } : task
                );

              return {
                ...item,
                plan: {
                  ...item.plan,
                  workstreams: item.plan.workstreams.map((ws) => ({
                    ...ws,
                    tasks: updateTasks(ws.tasks),
                  })),
                  sequentialTasks: updateTasks(item.plan.sequentialTasks),
                },
                updatedAt: new Date(),
              };
            }),
            isLoading: false,
          }));
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : 'Failed to update task complexity',
            isLoading: false,
          });
        }
      },

      reorderItems: (zone, fromIndex, toIndex) =>
        set((state) => {
          const zoneItems = state.items.filter((item) => item.zone === zone);
          const [movedItem] = zoneItems.splice(fromIndex, 1);
          zoneItems.splice(toIndex, 0, movedItem);

          // Update priorities
          const updatedZoneItems = zoneItems.map((item, index) => ({
            ...item,
            priority: index,
          }));

          // Merge back with other zones
          const otherItems = state.items.filter((item) => item.zone !== zone);

          return {
            items: [...otherItems, ...updatedZoneItems],
          };
        }),

      setSelectedItem: (id) => set({ selectedItemId: id }),

      setLoading: (isLoading) => set({ isLoading }),

      setError: (error) => set({ error }),

      // Selectors
      getItemsByZone: (zone) => get().items.filter((item) => item.zone === zone),

      getItemById: (id) => get().items.find((item) => item.id === id),
    }),
    { name: 'horizon-store' }
  )
);
