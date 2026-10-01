/**
 * Runway: how long the work already queued will keep the fleet busy.
 *
 * AN ESTIMATE, and a coarse one. It is the number of items in the READY zone
 * at a fixed forty-five minutes each, plus the minutes live sessions say they
 * have left, plus half that fixed duration for each item still being refined.
 * No rate is measured. Every surface that shows it says "estimates", and the
 * score dimension built on it says it inherits this.
 *
 * It lived inline in `/api/fleet/state`, which meant it could only be computed
 * by asking for the fleet panel. It is here so the runway sampler can take a
 * reading on its own schedule, from the same arithmetic the panel shows.
 *
 * Server only: this imports the database.
 */

import { db, rufloSessions, horizonItems, eq, or } from '@/lib/db';
import * as scoreModel from '@devpilot.sh/core/score';

/** The fixed duration assumed for a queued item. Not measured. */
export const ASSUMED_MINUTES_PER_ITEM = 45;

export interface Runway {
  totalMinutes: number;
  hours: number;
  status: 'HEALTHY' | 'WARNING' | 'CRITICAL';
  readyItems: number;
  refiningItems: number;
}

/**
 * The amber line is the score model's. spec/DESIGN.md §2.2 puts amber at four
 * hours and the Conductor Score measures runway against four hours; this used
 * to warn below eight. A cockpit that shows amber while the score gives full
 * marks is two instruments disagreeing about what "enough" is.
 */
export function runwayStatus(hours: number): Runway['status'] {
  if (hours < 2) return 'CRITICAL';
  if (hours < scoreModel.RUNWAY_TARGET_HOURS) return 'WARNING';
  return 'HEALTHY';
}

export async function readRunway(): Promise<Runway> {
  // Runway is about work still to come, so terminal sessions are excluded —
  // a finished session's `estimatedRemainingMinutes` is stale and would
  // inflate runway with time nobody is going to spend.
  const [live, ready, refining] = await Promise.all([
    db.query.rufloSessions.findMany({
      where: or(eq(rufloSessions.status, 'ACTIVE'), eq(rufloSessions.status, 'NEEDS_SPEC')),
      columns: { estimatedRemainingMinutes: true },
    }),
    db.query.horizonItems.findMany({ where: eq(horizonItems.zone, 'READY'), columns: { id: true } }),
    db.query.horizonItems.findMany({ where: eq(horizonItems.zone, 'REFINING'), columns: { id: true } }),
  ]);

  const remaining = live.reduce((sum, s) => sum + s.estimatedRemainingMinutes, 0);
  const totalMinutes =
    ready.length * ASSUMED_MINUTES_PER_ITEM +
    remaining +
    refining.length * ASSUMED_MINUTES_PER_ITEM * 0.5;
  const hours = totalMinutes / 60;

  return {
    totalMinutes,
    hours,
    status: runwayStatus(hours),
    readyItems: ready.length,
    refiningItems: refining.length,
  };
}
