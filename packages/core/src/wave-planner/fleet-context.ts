import { getDatabase } from '../db/client';
import { rufloSessions, inFlightFiles } from '../db/schema';
import { eq, or } from 'drizzle-orm';
import type { FleetContextBlock } from './types';

/**
 * FleetContextService
 * Assembles context about the current fleet state for plan generation
 */
export class FleetContextService {
  /**
   * Assemble fleet context for a target repository
   * Queries active sessions and in-flight files to determine available capacity
   *
   * @param targetRepo - The repository to check fleet context for
   * @returns FleetContextBlock with available workers, in-flight files, and active sessions
   */
  async assembleContext(targetRepo: string): Promise<FleetContextBlock> {
    const db = getDatabase();

    // Query active sessions (status ACTIVE or NEEDS_SPEC)
    const activeSessions = await db
      .select()
      .from(rufloSessions)
      .where(
        or(
          eq(rufloSessions.status, 'ACTIVE'),
          eq(rufloSessions.status, 'NEEDS_SPEC')
        )
      );

    // Query in-flight files
    const inFlightFilesData = await db.select().from(inFlightFiles);

    // Calculate available workers per repo
    // Max 4 workers per repo minus active sessions for that repo
    const availableWorkers: Record<string, number> = {};
    const repoSessionCounts: Record<string, number> = {};

    // Count sessions per repo
    for (const session of activeSessions) {
      repoSessionCounts[session.repo] = (repoSessionCounts[session.repo] || 0) + 1;
    }

    // Calculate available workers (max 4 per repo)
    const MAX_WORKERS_PER_REPO = 4;
    const allReposArray = [targetRepo, ...activeSessions.map((s) => s.repo)];
    const uniqueRepos = Array.from(new Set(allReposArray));

    for (const repo of uniqueRepos) {
      const activeCount = repoSessionCounts[repo] || 0;
      availableWorkers[repo] = Math.max(0, MAX_WORKERS_PER_REPO - activeCount);
    }

    // Format in-flight files
    const formattedInFlightFiles = inFlightFilesData.map((file) => ({
      path: file.path,
      sessionId: file.activeSessionId,
      ticketId: file.linearTicketId,
      estimatedMinutesRemaining: file.estimatedMinutesRemaining,
    }));

    // Format active sessions
    const formattedActiveSessions = activeSessions.map((session) => ({
      repo: session.repo,
      ticketId: session.linearTicketId,
      progressPercent: session.progressPercent,
      estimatedRemainingMinutes: session.estimatedRemainingMinutes,
    }));

    return {
      availableWorkers,
      inFlightFiles: formattedInFlightFiles,
      activeSessions: formattedActiveSessions,
    };
  }

  /**
   * Extract file paths that should be avoided from fleet context
   * These files are currently being worked on by other sessions
   *
   * @param fleetContext - The fleet context block
   * @returns Array of file paths to avoid
   */
  getAvoidFiles(fleetContext: FleetContextBlock): string[] {
    return fleetContext.inFlightFiles.map((file) => file.path);
  }
}
