/**
 * Shared host wiring (spec/trd/01-TIER1-EXECUTION-LOOP.md §6.7).
 *
 * The Next app (src/lib/orchestrator.ts) and the CLI Fastify server
 * (packages/cli/src/server/index.ts) both drive the same status-poller
 * callbacks that write session progress/completion back to the database.
 * Extracting them here keeps the two hosts identical and avoids drift.
 */

import { eq } from 'drizzle-orm';
import { getDatabase, rufloSessions, activityEvents } from '../db';
import type { StatusPollerConfig } from './status-poller';

/**
 * Build the DB-updating status-poller callbacks (session-level progress /
 * completion / error), resolving the database lazily via getDatabase().
 */
export function createDbStatusPollerCallbacks(): Pick<
  StatusPollerConfig,
  'onStatusUpdate' | 'onComplete' | 'onError'
> {
  return {
    onStatusUpdate: async (sessionId, status) => {
      const db = getDatabase();
      await db
        .update(rufloSessions)
        .set({
          progressPercent: status.progressPercent,
          status:
            status.status === 'running'
              ? 'ACTIVE'
              : status.status === 'complete'
                ? 'COMPLETE'
                : status.status === 'error'
                  ? 'ERROR'
                  : 'ACTIVE',
          updatedAt: new Date(),
        })
        .where(eq(rufloSessions.id, sessionId));
    },

    onComplete: async (sessionId, report) => {
      const db = getDatabase();
      await db
        .update(rufloSessions)
        .set({
          status: report.success ? 'COMPLETE' : 'ERROR',
          progressPercent: 100,
          prUrl: report.prUrl,
          tokensUsed: report.tokensUsed,
          costUsd: Math.round(report.costUsd * 100), // store as cents
          updatedAt: new Date(),
        })
        .where(eq(rufloSessions.id, sessionId));

      await db.insert(activityEvents).values({
        type: 'SESSION_COMPLETE',
        message: report.success
          ? `Session completed: ${report.summary}`
          : `Session failed: ${report.error?.message || 'Unknown error'}`,
        metadata: { sessionId, prUrl: report.prUrl },
      });
    },

    onError: async (sessionId, error) => {
      const db = getDatabase();
      await db
        .update(rufloSessions)
        .set({
          status: 'ERROR',
          updatedAt: new Date(),
        })
        .where(eq(rufloSessions.id, sessionId));

      await db.insert(activityEvents).values({
        type: 'SESSION_COMPLETE',
        message: `Session error: ${error.message}`,
        metadata: { sessionId, error: error.message },
      });
    },
  };
}
