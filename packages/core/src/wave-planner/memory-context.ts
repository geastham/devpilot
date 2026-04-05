import { getDatabase } from '../db/client';
import { rufloSessions, completedTasks } from '../db/schema';
import { eq, or, desc } from 'drizzle-orm';
import type { MemoryContextBlock, MemorySignals } from './types';

// ============================================================================
// Memory Provider Interface
// ============================================================================

/**
 * MemoryProvider abstracts the storage/retrieval backend for agent memory.
 * Implementations can use SQLite (default), Memvid (.mv2), or any other store.
 */
export interface MemoryProvider {
  /**
   * Search for memory entries relevant to the given query.
   * @param query - Search text (typically spec content or task description)
   * @param repo - Repository to scope the search to
   * @param topK - Maximum number of results to return
   */
  search(query: string, repo: string, topK: number): Promise<MemoryEntry[]>;

  /**
   * Record a completed session into memory for future retrieval.
   */
  record(entry: MemoryEntry): Promise<void>;
}

export interface MemoryEntry {
  date: string;
  ticketId: string;
  repo: string;
  summary: string;
  constraintApplied?: string;
  filesTouched: string[];
  model?: string;
  durationMinutes?: number;
  status: 'COMPLETE' | 'ERROR';
  /** Relevance score assigned by the search backend (0-1) */
  relevanceScore?: number;
}

// ============================================================================
// SQLite Memory Provider (default, uses existing DB tables)
// ============================================================================

/**
 * SQLiteMemoryProvider queries rufloSessions + completedTasks to build
 * memory context from historical execution data already in the database.
 *
 * This is the baseline provider. It uses keyword overlap for relevance
 * scoring. Replace with MemvidMemoryProvider for semantic/hybrid search.
 */
export class SQLiteMemoryProvider implements MemoryProvider {
  async search(query: string, repo: string, topK: number): Promise<MemoryEntry[]> {
    const db = getDatabase();

    // Fetch completed and errored sessions for this repo
    const sessions = await db
      .select()
      .from(rufloSessions)
      .where(
        or(
          eq(rufloSessions.status, 'COMPLETE'),
          eq(rufloSessions.status, 'ERROR')
        )
      )
      .orderBy(desc(rufloSessions.updatedAt));

    // Filter to target repo
    const repoSessions = sessions.filter((s) => s.repo === repo);

    // Fetch completed tasks for each session
    const entries: MemoryEntry[] = [];
    for (const session of repoSessions) {
      const sessionTasks = await db
        .select()
        .from(completedTasks)
        .where(eq(completedTasks.sessionId, session.id));

      const taskLabels = sessionTasks.map((t) => t.label);
      const totalDuration = sessionTasks.reduce(
        (sum, t) => sum + (t.durationMinutes || 0),
        0
      );

      const summary = taskLabels.length > 0
        ? taskLabels.join('; ')
        : session.ticketTitle;

      entries.push({
        date: session.updatedAt instanceof Date
          ? session.updatedAt.toISOString()
          : String(session.updatedAt),
        ticketId: session.linearTicketId,
        repo: session.repo,
        summary,
        filesTouched: (session.inFlightFiles as string[]) || [],
        model: sessionTasks[0]?.model || undefined,
        durationMinutes: totalDuration || session.elapsedMinutes,
        status: session.status as 'COMPLETE' | 'ERROR',
        relevanceScore: computeKeywordRelevance(query, summary, taskLabels),
      });
    }

    // Sort by relevance and return top K
    return entries
      .sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0))
      .slice(0, topK);
  }

  async record(_entry: MemoryEntry): Promise<void> {
    // SQLite provider relies on existing rufloSessions/completedTasks writes.
    // No additional recording needed — data is already persisted by the
    // session lifecycle in the orchestrator.
  }
}

// ============================================================================
// Memvid Memory Provider (for .mv2 file-based semantic memory)
// ============================================================================

/**
 * MemvidMemoryProvider uses the Memvid SDK to store and retrieve memories
 * from a portable .mv2 file with hybrid BM25 + vector search.
 *
 * To activate:
 *   1. `npm install @memvid/sdk`
 *   2. Set provider to 'memvid' in MemoryContextService config
 *   3. Optionally set MEMVID_MODEL for embedding model selection
 *
 * The .mv2 file lives at `<repoRoot>/.devpilot/memory.mv2` by default.
 */
export class MemvidMemoryProvider implements MemoryProvider {
  private basePath: string;

  constructor(basePath: string = '.devpilot') {
    this.basePath = basePath;
  }

  async search(query: string, repo: string, topK: number): Promise<MemoryEntry[]> {
    // Dynamic import to avoid hard dependency on @memvid/sdk
    let Memvid: any;
    try {
      Memvid = (await import('@memvid/sdk')).Memvid;
    } catch {
      console.warn(
        '[MemvidMemoryProvider] @memvid/sdk not installed. ' +
        'Install with: npm install @memvid/sdk'
      );
      return [];
    }

    const mvPath = `${this.basePath}/memory.mv2`;

    try {
      const mem = Memvid.open(mvPath);
      const results = await mem.search({
        query,
        topK,
        snippetChars: 500,
        filter: { repo },
      });

      return results.hits.map((hit: any) => ({
        date: hit.metadata?.date || '',
        ticketId: hit.metadata?.ticketId || '',
        repo: hit.metadata?.repo || repo,
        summary: hit.snippet || hit.content || '',
        constraintApplied: hit.metadata?.constraintApplied,
        filesTouched: hit.metadata?.filesTouched || [],
        model: hit.metadata?.model,
        durationMinutes: hit.metadata?.durationMinutes,
        status: hit.metadata?.status || 'COMPLETE',
        relevanceScore: hit.score || 0,
      }));
    } catch (err) {
      // File doesn't exist yet or other error — return empty
      console.warn(`[MemvidMemoryProvider] Search failed: ${err}`);
      return [];
    }
  }

  async record(entry: MemoryEntry): Promise<void> {
    let Memvid: any;
    try {
      Memvid = (await import('@memvid/sdk')).Memvid;
    } catch {
      console.warn(
        '[MemvidMemoryProvider] @memvid/sdk not installed. Skipping record.'
      );
      return;
    }

    const mvPath = `${this.basePath}/memory.mv2`;

    try {
      const mem = Memvid.open(mvPath);
      mem.put(JSON.stringify(entry), {
        title: `${entry.ticketId}: ${entry.summary.slice(0, 100)}`,
        tags: {
          repo: entry.repo,
          ticketId: entry.ticketId,
          status: entry.status,
          model: entry.model || 'unknown',
        },
      });
      mem.commit();
    } catch (err) {
      console.warn(`[MemvidMemoryProvider] Record failed: ${err}`);
    }
  }
}

// ============================================================================
// Memory Context Service
// ============================================================================

export interface MemoryContextServiceConfig {
  /** Which provider to use: 'sqlite' (default) or 'memvid' */
  provider?: 'sqlite' | 'memvid';
  /** Maximum number of past sessions to include in context */
  maxSessions?: number;
  /** Base path for memvid .mv2 files (default: '.devpilot') */
  memvidBasePath?: string;
}

/**
 * MemoryContextService assembles memory context for plan generation
 * by querying historical session data through a configurable provider.
 *
 * Follows the same pattern as FleetContextService and CodebaseContextService.
 */
export class MemoryContextService {
  private provider: MemoryProvider;
  private maxSessions: number;

  constructor(config: MemoryContextServiceConfig = {}) {
    this.maxSessions = config.maxSessions ?? 10;

    switch (config.provider) {
      case 'memvid':
        this.provider = new MemvidMemoryProvider(config.memvidBasePath);
        break;
      case 'sqlite':
      default:
        this.provider = new SQLiteMemoryProvider();
        break;
    }
  }

  /**
   * Assemble memory context for a given spec and repository.
   *
   * @param specContent - The specification content to find relevant memories for
   * @param repo - Repository to scope memory search to
   * @returns MemoryContextBlock ready for prompt injection
   */
  async assembleContext(
    specContent: string,
    repo: string
  ): Promise<MemoryContextBlock> {
    const entries = await this.provider.search(
      specContent,
      repo,
      this.maxSessions
    );

    // Build relevant sessions
    const relevantSessions = entries.map((entry) => ({
      date: entry.date,
      ticketId: entry.ticketId,
      summary: entry.summary,
      constraintApplied: entry.constraintApplied,
      relevanceScore: entry.relevanceScore,
      filesTouched: entry.filesTouched,
      executionMeta: {
        model: entry.model,
        durationMinutes: entry.durationMinutes,
        status: entry.status,
      },
    }));

    // Compute memory-derived confidence signals
    const memorySignals = this.computeSignals(entries);

    return {
      relevantSessions,
      memorySignals,
    };
  }

  /**
   * Record a completed session into the memory provider.
   * Call this when a ruflo session finishes to build the memory corpus.
   */
  async recordSession(entry: MemoryEntry): Promise<void> {
    await this.provider.record(entry);
  }

  /**
   * Compute confidence signals from memory search results.
   */
  private computeSignals(entries: MemoryEntry[]): MemorySignals {
    if (entries.length === 0) {
      return {
        hasMemory: false,
        similarTasksCompleted: 0,
        historicalSuccessRate: 0,
        averageDurationMinutes: 0,
        overallConfidence: 0.5, // Neutral confidence with no memory
        highConflictFiles: [],
      };
    }

    const completedEntries = entries.filter((e) => e.status === 'COMPLETE');
    const successRate = completedEntries.length / entries.length;

    const durations = entries
      .map((e) => e.durationMinutes)
      .filter((d): d is number => d != null && d > 0);
    const avgDuration = durations.length > 0
      ? durations.reduce((a, b) => a + b, 0) / durations.length
      : 0;

    // Find files that appear in multiple sessions (high conflict potential)
    const fileCounts = new Map<string, number>();
    for (const entry of entries) {
      for (const file of entry.filesTouched) {
        fileCounts.set(file, (fileCounts.get(file) || 0) + 1);
      }
    }
    const highConflictFiles = Array.from(fileCounts.entries())
      .filter(([, count]) => count >= 2)
      .sort((a, b) => b[1] - a[1])
      .map(([file]) => file);

    // Overall confidence: weighted blend of memory availability, success rate, and relevance
    const avgRelevance = entries.reduce(
      (sum, e) => sum + (e.relevanceScore || 0), 0
    ) / entries.length;
    const overallConfidence = Math.min(
      1,
      0.3 + // Base confidence for having memory
      0.3 * successRate +
      0.2 * Math.min(entries.length / 5, 1) + // More history = more confidence (caps at 5)
      0.2 * avgRelevance
    );

    return {
      hasMemory: true,
      similarTasksCompleted: completedEntries.length,
      historicalSuccessRate: Math.round(successRate * 100) / 100,
      averageDurationMinutes: Math.round(avgDuration),
      overallConfidence: Math.round(overallConfidence * 100) / 100,
      highConflictFiles,
    };
  }
}

// ============================================================================
// Keyword Relevance Scoring (for SQLite provider)
// ============================================================================

/**
 * Simple keyword overlap scoring between a query and session data.
 * Returns a score between 0 and 1.
 */
function computeKeywordRelevance(
  query: string,
  summary: string,
  taskLabels: string[]
): number {
  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) return 0;

  const targetText = [summary, ...taskLabels].join(' ');
  const targetTokens = new Set(tokenize(targetText));

  let matches = 0;
  for (const token of queryTokens) {
    if (targetTokens.has(token)) {
      matches++;
    }
  }

  return matches / queryTokens.length;
}

/**
 * Tokenize text into lowercase words, removing common stop words.
 */
function tokenize(text: string): string[] {
  const STOP_WORDS = new Set([
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'shall', 'can', 'to', 'of', 'in', 'for',
    'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through', 'during',
    'before', 'after', 'and', 'but', 'or', 'nor', 'not', 'so', 'yet',
    'both', 'either', 'neither', 'each', 'every', 'all', 'any', 'few',
    'more', 'most', 'other', 'some', 'such', 'no', 'only', 'own', 'same',
    'than', 'too', 'very', 'just', 'because', 'if', 'when', 'while',
    'that', 'this', 'these', 'those', 'it', 'its',
  ]);

  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOP_WORDS.has(w));
}
