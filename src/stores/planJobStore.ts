/**
 * Plan Job Store
 * =============================================================================
 *
 * Client-side state for the async wave plan generation jobs introduced with
 * the ULTRAPLAN-inspired escalation flow.
 *
 * Shape of the world:
 *
 *   useHorizonStore  - horizon items, plans, zone transitions (existing)
 *   useWavePlanStore - persisted wave plans rendered by PlanReviewCard (existing)
 *   usePlanJobStore  - in-flight generation jobs rendered by PlanProgressCard
 *
 * A job goes through: queued -> thinking/drafting/refining/escalating -> ready,
 * then -> approved | rejected | cancelled | failed. Once it reaches `ready`,
 * the `resultWavePlanId` points at a persisted wave plan row and the UI can
 * swap PlanProgressCard for PlanReviewCard.
 */

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

export type PlanJobStatus =
  | 'queued'
  | 'thinking'
  | 'drafting'
  | 'validating'
  | 'refining'
  | 'escalating'
  | 'ready'
  | 'approved'
  | 'rejected'
  | 'failed'
  | 'cancelled';

export type PlanJobModelTier = 'standard' | 'ultra';

export interface PlanJob {
  id: string;
  horizonItemId: string;
  planId: string;
  status: PlanJobStatus;
  modelTier: PlanJobModelTier;
  currentStep: string | null;
  progressPercent: number;
  tokensInput: number;
  tokensOutput: number;
  thinkingTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  thinkingBudget: number | null;
  costUsd: number;
  iterations: number;
  bestParallelizationScore: number | null;
  lastModel: string | null;
  escalated: boolean;
  escalationReason: string | null;
  rejectionReason: string | null;
  resultWavePlanId: string | null;
  errorMessage: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

const TERMINAL_STATUSES: ReadonlySet<PlanJobStatus> = new Set([
  'ready',
  'approved',
  'rejected',
  'failed',
  'cancelled',
]);

export function isTerminalStatus(status: PlanJobStatus): boolean {
  return TERMINAL_STATUSES.has(status);
}

interface PollerHandle {
  jobId: string;
  itemId: string;
  timeoutId: ReturnType<typeof setTimeout>;
}

interface PlanJobState {
  /** The latest job per horizon item (we only track one in-flight job per item) */
  jobsByItemId: Record<string, PlanJob>;
  /** Active pollers keyed by itemId */
  pollers: Record<string, PollerHandle>;
  error: string | null;

  // Actions
  startJob: (itemId: string, options?: { forceUltra?: boolean }) => Promise<PlanJob | null>;
  pollJob: (itemId: string, jobId: string) => Promise<void>;
  startPolling: (itemId: string, jobId: string) => void;
  stopPolling: (itemId: string) => void;
  approveJob: (itemId: string, jobId: string) => Promise<void>;
  rejectJob: (
    itemId: string,
    jobId: string,
    reason: string,
    options?: { replan?: boolean; forceUltra?: boolean }
  ) => Promise<void>;
  cancelJob: (itemId: string, jobId: string) => Promise<void>;
  getJobForItem: (itemId: string) => PlanJob | undefined;
  clearJobForItem: (itemId: string) => void;
}

const POLL_INTERVAL_MS = 1200;

export const usePlanJobStore = create<PlanJobState>()(
  devtools(
    (set, get) => ({
      jobsByItemId: {},
      pollers: {},
      error: null,

      startJob: async (itemId, options) => {
        // If we're already tracking an in-flight job for this item, reuse it
        // rather than enqueueing a duplicate.
        const existing = get().jobsByItemId[itemId];
        if (existing && !isTerminalStatus(existing.status)) {
          return existing;
        }

        try {
          const response = await fetch(`/api/items/${itemId}/wave-plan/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ forceUltra: Boolean(options?.forceUltra) }),
          });
          if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.error || 'Failed to start plan job');
          }
          const { jobId } = await response.json();

          // Seed an optimistic queued job row so the UI can render immediately.
          const seed: PlanJob = {
            id: jobId,
            horizonItemId: itemId,
            planId: '',
            status: 'queued',
            modelTier: options?.forceUltra ? 'ultra' : 'standard',
            currentStep: 'Queued',
            progressPercent: 0,
            tokensInput: 0,
            tokensOutput: 0,
            thinkingTokens: 0,
            cacheReadTokens: 0,
            cacheWriteTokens: 0,
            thinkingBudget: null,
            costUsd: 0,
            iterations: 0,
            bestParallelizationScore: null,
            lastModel: null,
            escalated: false,
            escalationReason: null,
            rejectionReason: null,
            resultWavePlanId: null,
            errorMessage: null,
            startedAt: new Date().toISOString(),
            completedAt: null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
          set((state) => ({
            jobsByItemId: { ...state.jobsByItemId, [itemId]: seed },
            error: null,
          }));

          // Begin polling.
          get().startPolling(itemId, jobId);

          return seed;
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : 'Failed to start plan job',
          });
          return null;
        }
      },

      pollJob: async (itemId, jobId) => {
        try {
          const response = await fetch(
            `/api/items/${itemId}/wave-plan/jobs/${jobId}`,
            { cache: 'no-store' }
          );
          if (!response.ok) {
            if (response.status === 404) {
              get().stopPolling(itemId);
              return;
            }
            throw new Error(`Poll failed with status ${response.status}`);
          }
          const { job } = await response.json();
          set((state) => ({
            jobsByItemId: { ...state.jobsByItemId, [itemId]: job },
          }));

          if (isTerminalStatus(job.status)) {
            get().stopPolling(itemId);
          }
        } catch (error) {
          // Don't nuke the poll loop on transient network errors — the next
          // tick will retry. Surface the error to state for debugging.
          set({
            error: error instanceof Error ? error.message : 'Poll failed',
          });
        }
      },

      startPolling: (itemId, jobId) => {
        get().stopPolling(itemId);

        const tick = async () => {
          await get().pollJob(itemId, jobId);
          const current = get().jobsByItemId[itemId];
          if (current && !isTerminalStatus(current.status)) {
            const timeoutId = setTimeout(tick, POLL_INTERVAL_MS);
            set((state) => ({
              pollers: {
                ...state.pollers,
                [itemId]: { jobId, itemId, timeoutId },
              },
            }));
          } else {
            // Clear the poller entry once we've reached a terminal state.
            set((state) => {
              const { [itemId]: _, ...rest } = state.pollers;
              return { pollers: rest };
            });
          }
        };

        // Kick off immediately, not after the first interval.
        void tick();
      },

      stopPolling: (itemId) => {
        const poller = get().pollers[itemId];
        if (poller) {
          clearTimeout(poller.timeoutId);
          set((state) => {
            const { [itemId]: _, ...rest } = state.pollers;
            return { pollers: rest };
          });
        }
      },

      approveJob: async (itemId, jobId) => {
        try {
          const response = await fetch(
            `/api/items/${itemId}/wave-plan/jobs/${jobId}/approve`,
            { method: 'POST' }
          );
          if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.error || 'Failed to approve plan job');
          }
          const { job } = await response.json();
          set((state) => ({
            jobsByItemId: { ...state.jobsByItemId, [itemId]: job },
          }));
          get().stopPolling(itemId);
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : 'Failed to approve plan',
          });
        }
      },

      rejectJob: async (itemId, jobId, reason, options) => {
        try {
          const response = await fetch(
            `/api/items/${itemId}/wave-plan/jobs/${jobId}/reject`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                reason,
                replan: Boolean(options?.replan),
                forceUltra: Boolean(options?.forceUltra),
              }),
            }
          );
          if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.error || 'Failed to reject plan job');
          }
          const { job, replanJobId } = await response.json();
          set((state) => ({
            jobsByItemId: { ...state.jobsByItemId, [itemId]: job },
          }));
          get().stopPolling(itemId);

          // If a replan was kicked off, seed and start polling the new job.
          if (replanJobId) {
            get().startPolling(itemId, replanJobId);
          }
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : 'Failed to reject plan',
          });
        }
      },

      cancelJob: async (itemId, jobId) => {
        try {
          const response = await fetch(
            `/api/items/${itemId}/wave-plan/jobs/${jobId}/cancel`,
            { method: 'POST' }
          );
          if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.error || 'Failed to cancel plan job');
          }
          const { job } = await response.json();
          set((state) => ({
            jobsByItemId: { ...state.jobsByItemId, [itemId]: job },
          }));
          get().stopPolling(itemId);
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : 'Failed to cancel plan',
          });
        }
      },

      getJobForItem: (itemId) => get().jobsByItemId[itemId],

      clearJobForItem: (itemId) => {
        get().stopPolling(itemId);
        set((state) => {
          const { [itemId]: _, ...rest } = state.jobsByItemId;
          return { jobsByItemId: rest };
        });
      },
    }),
    { name: 'plan-job-store' }
  )
);
