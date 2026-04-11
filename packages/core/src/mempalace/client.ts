import { createHash } from 'crypto';
import { and, desc, eq, inArray, isNull, like, or, sql } from 'drizzle-orm';
import { getDatabase } from '../db/client';
import {
  palaceClosets,
  palaceDrawers,
  palaceHalls,
  palaceKgTriples,
  palaceRooms,
  palaceTunnels,
  palaceWings,
} from '../db/schema/mempalace';
import type {
  AddDrawerInput,
  AddDrawerResult,
  Closet,
  KgAddInput,
  KgContradiction,
  KgInvalidateInput,
  KgQueryInput,
  KgTriple,
  MemPalaceConfig,
  RecallInput,
  RecallResult,
  Room,
  SearchHit,
  SearchInput,
  SearchResult,
  WakeUpInput,
  WakeUpResult,
  Wing,
} from './types';

// ============================================================================
// MemPalaceClient — interface
// ============================================================================

/**
 * MemPalaceClient is the abstraction over the memory backend.
 *
 * Three implementations ship with DevPilot:
 *   - LocalShimClient: SQLite-backed, self-contained, no external dependencies
 *   - McpAdapterClient: routes to a real MemPalace MCP server when present
 *   - DisabledClient: no-op, returns empty results (useful for tests)
 *
 * The service layer (MemPalaceService) selects an implementation based on
 * MemPalaceConfig.mode. Callers should not instantiate clients directly —
 * use `createMemPalaceClient()` below.
 */
export interface MemPalaceClient {
  readonly mode: 'local' | 'mcp' | 'disabled';

  /** Ensure a wing exists, creating it if necessary. */
  ensureWing(slug: string, name?: string, repo?: string): Promise<Wing>;

  /** Add a drawer (verbatim content). Deduplicated by content hash. */
  addDrawer(input: AddDrawerInput): Promise<AddDrawerResult>;

  /** Search drawers by query. */
  search(input: SearchInput): Promise<SearchResult>;

  /** L0+L1 wake-up — always-loaded context. */
  wakeUp(input: WakeUpInput): Promise<WakeUpResult>;

  /** L2 topical recall. */
  recall(input: RecallInput): Promise<RecallResult>;

  /** Add a KG triple. Auto-detects contradictions. */
  kgAdd(input: KgAddInput): Promise<{ tripleId: string; contradictions: KgContradiction[] }>;

  /** Query KG triples. */
  kgQuery(input: KgQueryInput): Promise<KgTriple[]>;

  /** Invalidate KG triples matching subject+predicate. */
  kgInvalidate(input: KgInvalidateInput): Promise<{ invalidatedCount: number }>;

  /** List wings. */
  listWings(): Promise<Wing[]>;

  /** List rooms in a wing. */
  listRooms(wingSlug: string): Promise<Room[]>;
}

// ============================================================================
// LocalShimClient — SQLite-backed implementation
// ============================================================================

/**
 * LocalShimClient is a pure-SQLite implementation of MemPalaceClient.
 * It provides MemPalace's API surface without requiring the external MCP
 * server. Retrieval is keyword-based (no embeddings), which trades recall
 * quality for zero external dependencies. When higher-quality retrieval is
 * needed, configure `mode: 'mcp'` and point at a real MemPalace instance.
 */
export class LocalShimClient implements MemPalaceClient {
  readonly mode = 'local' as const;

  async ensureWing(slug: string, name?: string, repo?: string): Promise<Wing> {
    const db = getDatabase();
    const existing = await db
      .select()
      .from(palaceWings)
      .where(eq(palaceWings.slug, slug))
      .limit(1);

    if (existing.length > 0) {
      return this.rowToWing(existing[0]);
    }

    const [row] = await db
      .insert(palaceWings)
      .values({
        slug,
        name: name ?? slug,
        wingType: 'project',
        repo,
      })
      .returning();

    return this.rowToWing(row);
  }

  async addDrawer(input: AddDrawerInput): Promise<AddDrawerResult> {
    const db = getDatabase();
    const wing = await this.ensureWing(input.wingSlug);
    const room = await this.ensureRoom(
      wing.id,
      input.roomSlug,
      input.roomName ?? input.roomSlug,
      input.roomTopic ?? input.roomSlug
    );

    const contentHash = createHash('sha256').update(input.content).digest('hex');

    const existing = await db
      .select()
      .from(palaceDrawers)
      .where(
        and(
          eq(palaceDrawers.contentHash, contentHash),
          eq(palaceDrawers.roomId, room.id)
        )
      )
      .limit(1);

    if (existing.length > 0) {
      return {
        drawerId: existing[0].id,
        created: false,
        roomId: room.id,
        wingId: wing.id,
      };
    }

    const [row] = await db
      .insert(palaceDrawers)
      .values({
        roomId: room.id,
        memoryType: input.memoryType,
        label: input.label,
        content: input.content,
        aaakContent: input.aaakContent,
        contentHash,
        sourceKind: input.source?.kind,
        sourceRef: input.source?.ref,
        tags: input.tags ?? [],
        salience: input.salience ?? 0,
      })
      .returning();

    return {
      drawerId: row.id,
      created: true,
      roomId: room.id,
      wingId: wing.id,
    };
  }

  async search(input: SearchInput): Promise<SearchResult> {
    const db = getDatabase();

    // Scope by wing if provided
    let roomIds: string[] | undefined;
    if (input.wingSlug) {
      const wing = await db
        .select()
        .from(palaceWings)
        .where(eq(palaceWings.slug, input.wingSlug))
        .limit(1);
      if (wing.length === 0) {
        return { hits: [], totalScanned: 0 };
      }
      const rooms = await db
        .select()
        .from(palaceRooms)
        .where(eq(palaceRooms.wingId, wing[0].id));
      const ids = (rooms as Array<{ id: string }>).map((r) => r.id);
      if (ids.length === 0) {
        return { hits: [], totalScanned: 0 };
      }
      roomIds = ids;
    }

    // Pull candidate drawers (full scan, scored in JS — fine for the shim
    // which isn't meant for millions of rows).
    const candidates = roomIds
      ? await db
          .select()
          .from(palaceDrawers)
          .where(inArray(palaceDrawers.roomId, roomIds))
      : await db.select().from(palaceDrawers);

    const keywords = input.query
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 2);

    const scored: { row: typeof candidates[number]; score: number }[] = [];
    for (const row of candidates) {
      if (
        input.memoryTypes &&
        !input.memoryTypes.includes(row.memoryType as SearchHit['memoryType'])
      ) {
        continue;
      }
      const haystack = `${row.label} ${row.content}`.toLowerCase();
      let score = 0;
      for (const kw of keywords) {
        if (haystack.includes(kw)) score += 1;
      }
      if (row.salience) score += row.salience * 0.25;
      if (score > 0) scored.push({ row, score });
    }

    scored.sort((a, b) => b.score - a.score);
    const limit = input.limit ?? 10;
    const top = scored.slice(0, limit);

    const roomMap = new Map<string, Room>();
    const wingMap = new Map<string, Wing>();
    for (const entry of top) {
      if (!roomMap.has(entry.row.roomId)) {
        const roomRows = await db
          .select()
          .from(palaceRooms)
          .where(eq(palaceRooms.id, entry.row.roomId))
          .limit(1);
        if (roomRows[0]) {
          const room = this.rowToRoom(roomRows[0]);
          roomMap.set(room.id, room);
          if (!wingMap.has(room.wingId)) {
            const wingRows = await db
              .select()
              .from(palaceWings)
              .where(eq(palaceWings.id, room.wingId))
              .limit(1);
            if (wingRows[0]) {
              wingMap.set(room.wingId, this.rowToWing(wingRows[0]));
            }
          }
        }
      }
    }

    const hits: SearchHit[] = top.map((entry) => {
      const room = roomMap.get(entry.row.roomId);
      const wing = room ? wingMap.get(room.wingId) : undefined;
      return {
        drawerId: entry.row.id,
        roomSlug: room?.slug ?? '',
        wingSlug: wing?.slug ?? '',
        label: entry.row.label,
        snippet: entry.row.content.slice(0, 240),
        score: entry.score,
        memoryType: entry.row.memoryType as SearchHit['memoryType'],
        source:
          entry.row.sourceKind && entry.row.sourceRef
            ? { kind: entry.row.sourceKind, ref: entry.row.sourceRef }
            : undefined,
      };
    });

    return { hits, totalScanned: candidates.length };
  }

  async wakeUp(input: WakeUpInput): Promise<WakeUpResult> {
    const db = getDatabase();
    const wing = await this.ensureWing(input.wingSlug);

    // L0: identity is derived from the wing description or a default.
    const identity =
      wing.description ??
      `You are assisting with the ${wing.name} project. Follow the project's existing patterns and constraints.`;

    // L1: critical facts come from closets tagged tier=0 or tier=1,
    // plus the highest-salience drawers as a fallback.
    const rooms = await db
      .select()
      .from(palaceRooms)
      .where(eq(palaceRooms.wingId, wing.id));
    const roomIds = (rooms as Array<{ id: string }>).map((r) => r.id);

    const criticalFacts: string[] = [];
    if (roomIds.length > 0) {
      const closetRows = await db
        .select()
        .from(palaceClosets)
        .where(inArray(palaceClosets.roomId, roomIds))
        .orderBy(palaceClosets.tier);

      for (const closet of closetRows) {
        if (closet.tier <= 1 && criticalFacts.length < 6) {
          criticalFacts.push(closet.summary);
        }
      }

      if (criticalFacts.length === 0) {
        // Fallback: pull top-salience drawers as critical facts
        const fallback = await db
          .select()
          .from(palaceDrawers)
          .where(inArray(palaceDrawers.roomId, roomIds))
          .orderBy(desc(palaceDrawers.salience))
          .limit(4);
        for (const drawer of fallback) {
          criticalFacts.push(`${drawer.label}: ${drawer.content.slice(0, 180)}`);
        }
      }
    }

    const tokenEstimate = estimateTokens(
      identity + '\n' + criticalFacts.join('\n')
    );

    return { identity, criticalFacts, tokenEstimate };
  }

  async recall(input: RecallInput): Promise<RecallResult> {
    const db = getDatabase();
    const wingRows = await db
      .select()
      .from(palaceWings)
      .where(eq(palaceWings.slug, input.wingSlug))
      .limit(1);

    if (wingRows.length === 0) {
      return { topic: input.topic, closets: [], tokenEstimate: 0 };
    }

    // Find rooms whose topic/slug/name matches the requested topic.
    const rooms = await db
      .select()
      .from(palaceRooms)
      .where(
        and(
          eq(palaceRooms.wingId, wingRows[0].id),
          or(
            like(palaceRooms.topic, `%${input.topic}%`),
            like(palaceRooms.slug, `%${input.topic}%`),
            like(palaceRooms.name, `%${input.topic}%`)
          )
        )
      );

    if (rooms.length === 0) {
      return { topic: input.topic, closets: [], tokenEstimate: 0 };
    }

    const roomIds = (rooms as Array<{ id: string }>).map((r) => r.id);
    const closetRows = await db
      .select()
      .from(palaceClosets)
      .where(
        and(
          inArray(palaceClosets.roomId, roomIds),
          eq(palaceClosets.tier, 2)
        )
      )
      .limit(input.limit ?? 5);

    const closets: Closet[] = closetRows.map(this.rowToCloset);
    const tokenEstimate = closets.reduce((sum, c) => sum + c.tokenCost, 0);

    return { topic: input.topic, closets, tokenEstimate };
  }

  async kgAdd(
    input: KgAddInput
  ): Promise<{ tripleId: string; contradictions: KgContradiction[] }> {
    const db = getDatabase();
    const wing = await this.ensureWing(input.wingSlug);

    // Detect contradictions: existing triples with same subject+predicate
    // but different object, still valid.
    const existing = await db
      .select()
      .from(palaceKgTriples)
      .where(
        and(
          eq(palaceKgTriples.wingId, wing.id),
          eq(palaceKgTriples.subject, input.subject),
          eq(palaceKgTriples.predicate, input.predicate),
          isNull(palaceKgTriples.validUntil)
        )
      );

    const contradictions: KgContradiction[] = [];
    const now = new Date();

    for (const row of existing) {
      if (row.object !== input.object) {
        // Invalidate the old triple by setting its validUntil.
        await db
          .update(palaceKgTriples)
          .set({ validUntil: now })
          .where(eq(palaceKgTriples.id, row.id));
        contradictions.push({
          subject: row.subject,
          predicate: row.predicate,
          oldObject: row.object,
          newObject: input.object,
          oldDrawerId: row.sourceDrawerId ?? undefined,
          newDrawerId: input.sourceDrawerId,
          detectedAt: now,
        });
      }
    }

    const [row] = await db
      .insert(palaceKgTriples)
      .values({
        wingId: wing.id,
        subject: input.subject,
        predicate: input.predicate,
        object: input.object,
        validFrom: input.validFrom ?? now,
        sourceDrawerId: input.sourceDrawerId,
        confidence: input.confidence ?? 100,
      })
      .returning();

    return { tripleId: row.id, contradictions };
  }

  async kgQuery(input: KgQueryInput): Promise<KgTriple[]> {
    const db = getDatabase();
    const wingRows = await db
      .select()
      .from(palaceWings)
      .where(eq(palaceWings.slug, input.wingSlug))
      .limit(1);

    if (wingRows.length === 0) return [];

    const filters = [eq(palaceKgTriples.wingId, wingRows[0].id)];
    if (input.subject) filters.push(eq(palaceKgTriples.subject, input.subject));
    if (input.predicate) filters.push(eq(palaceKgTriples.predicate, input.predicate));
    if (input.object) filters.push(eq(palaceKgTriples.object, input.object));
    if (input.currentOnly) filters.push(isNull(palaceKgTriples.validUntil));

    const rows = await db
      .select()
      .from(palaceKgTriples)
      .where(and(...filters));

    type KgRow = {
      id: string;
      wingId: string;
      subject: string;
      predicate: string;
      object: string;
      validFrom: Date;
      validUntil: Date | null;
      sourceDrawerId: string | null;
      confidence: number;
    };
    return (rows as KgRow[]).map((r) => ({
      id: r.id,
      wingId: r.wingId,
      subject: r.subject,
      predicate: r.predicate,
      object: r.object,
      validFrom: r.validFrom,
      validUntil: r.validUntil ?? undefined,
      sourceDrawerId: r.sourceDrawerId ?? undefined,
      confidence: r.confidence,
    }));
  }

  async kgInvalidate(
    input: KgInvalidateInput
  ): Promise<{ invalidatedCount: number }> {
    const db = getDatabase();
    const wingRows = await db
      .select()
      .from(palaceWings)
      .where(eq(palaceWings.slug, input.wingSlug))
      .limit(1);

    if (wingRows.length === 0) return { invalidatedCount: 0 };

    const now = new Date();
    const result = await db
      .update(palaceKgTriples)
      .set({ validUntil: now })
      .where(
        and(
          eq(palaceKgTriples.wingId, wingRows[0].id),
          eq(palaceKgTriples.subject, input.subject),
          eq(palaceKgTriples.predicate, input.predicate),
          isNull(palaceKgTriples.validUntil)
        )
      )
      .returning();

    return { invalidatedCount: result.length };
  }

  async listWings(): Promise<Wing[]> {
    const db = getDatabase();
    const rows = await db.select().from(palaceWings);
    return rows.map(this.rowToWing);
  }

  async listRooms(wingSlug: string): Promise<Room[]> {
    const db = getDatabase();
    const wingRows = await db
      .select()
      .from(palaceWings)
      .where(eq(palaceWings.slug, wingSlug))
      .limit(1);
    if (wingRows.length === 0) return [];
    const rows = await db
      .select()
      .from(palaceRooms)
      .where(eq(palaceRooms.wingId, wingRows[0].id));
    return rows.map(this.rowToRoom);
  }

  // ----- Internals -----

  private async ensureRoom(
    wingId: string,
    slug: string,
    name: string,
    topic: string
  ): Promise<Room> {
    const db = getDatabase();
    const existing = await db
      .select()
      .from(palaceRooms)
      .where(and(eq(palaceRooms.wingId, wingId), eq(palaceRooms.slug, slug)))
      .limit(1);

    if (existing.length > 0) {
      return this.rowToRoom(existing[0]);
    }

    const [row] = await db
      .insert(palaceRooms)
      .values({ wingId, slug, name, topic })
      .returning();

    return this.rowToRoom(row);
  }

  private rowToWing = (row: {
    id: string;
    slug: string;
    name: string;
    wingType: string;
    repo: string | null;
    description: string | null;
  }): Wing => ({
    id: row.id,
    slug: row.slug,
    name: row.name,
    wingType: row.wingType as Wing['wingType'],
    repo: row.repo ?? undefined,
    description: row.description ?? undefined,
  });

  private rowToRoom = (row: {
    id: string;
    wingId: string;
    slug: string;
    name: string;
    topic: string;
    description: string | null;
  }): Room => ({
    id: row.id,
    wingId: row.wingId,
    slug: row.slug,
    name: row.name,
    topic: row.topic,
    description: row.description ?? undefined,
  });

  private rowToCloset = (row: {
    id: string;
    roomId: string;
    summary: string;
    drawerIds: unknown;
    tier: number;
    tokenCost: number;
  }): Closet => ({
    id: row.id,
    roomId: row.roomId,
    summary: row.summary,
    drawerIds: (row.drawerIds as string[] | null) ?? [],
    tier: row.tier as Closet['tier'],
    tokenCost: row.tokenCost,
  });
}

// ============================================================================
// McpAdapterClient — routes to an external MemPalace MCP server
// ============================================================================

/**
 * McpAdapterClient forwards calls to a MemPalace MCP server running as a
 * sidecar. The actual MCP transport is injected by the host application
 * (Claude Code, a devpilot CLI, etc.) so this module stays pure.
 *
 * The transport is just a function that takes a tool name and arguments
 * and returns the parsed JSON response. Wire it up at startup:
 *
 *   const client = new McpAdapterClient({
 *     endpoint: '...',
 *     transport: async (tool, args) => mcpCall('mempalace', tool, args)
 *   });
 */
export interface McpTransport {
  (toolName: string, args: Record<string, unknown>): Promise<unknown>;
}

export class McpAdapterClient implements MemPalaceClient {
  readonly mode = 'mcp' as const;
  private transport: McpTransport;

  constructor(transport: McpTransport) {
    this.transport = transport;
  }

  async ensureWing(slug: string, name?: string, repo?: string): Promise<Wing> {
    const res = (await this.transport('ensure_wing', {
      slug,
      name,
      repo,
    })) as Wing;
    return res;
  }

  async addDrawer(input: AddDrawerInput): Promise<AddDrawerResult> {
    return (await this.transport('add_drawer', input as unknown as Record<string, unknown>)) as AddDrawerResult;
  }

  async search(input: SearchInput): Promise<SearchResult> {
    return (await this.transport('search', input as unknown as Record<string, unknown>)) as SearchResult;
  }

  async wakeUp(input: WakeUpInput): Promise<WakeUpResult> {
    return (await this.transport('wake_up', input as unknown as Record<string, unknown>)) as WakeUpResult;
  }

  async recall(input: RecallInput): Promise<RecallResult> {
    return (await this.transport('traverse', input as unknown as Record<string, unknown>)) as RecallResult;
  }

  async kgAdd(
    input: KgAddInput
  ): Promise<{ tripleId: string; contradictions: KgContradiction[] }> {
    return (await this.transport('kg_add', input as unknown as Record<string, unknown>)) as {
      tripleId: string;
      contradictions: KgContradiction[];
    };
  }

  async kgQuery(input: KgQueryInput): Promise<KgTriple[]> {
    return (await this.transport('kg_query', input as unknown as Record<string, unknown>)) as KgTriple[];
  }

  async kgInvalidate(
    input: KgInvalidateInput
  ): Promise<{ invalidatedCount: number }> {
    return (await this.transport('kg_invalidate', input as unknown as Record<string, unknown>)) as {
      invalidatedCount: number;
    };
  }

  async listWings(): Promise<Wing[]> {
    return (await this.transport('list_wings', {})) as Wing[];
  }

  async listRooms(wingSlug: string): Promise<Room[]> {
    return (await this.transport('list_rooms', { wingSlug })) as Room[];
  }
}

// ============================================================================
// DisabledClient — no-op for tests and opt-out configurations
// ============================================================================

export class DisabledClient implements MemPalaceClient {
  readonly mode = 'disabled' as const;

  async ensureWing(slug: string, name?: string): Promise<Wing> {
    return {
      id: 'disabled',
      slug,
      name: name ?? slug,
      wingType: 'project',
    };
  }
  async addDrawer(input: AddDrawerInput): Promise<AddDrawerResult> {
    return { drawerId: '', created: false, roomId: '', wingId: '' };
  }
  async search(): Promise<SearchResult> {
    return { hits: [], totalScanned: 0 };
  }
  async wakeUp(input: WakeUpInput): Promise<WakeUpResult> {
    return { identity: '', criticalFacts: [], tokenEstimate: 0 };
  }
  async recall(input: RecallInput): Promise<RecallResult> {
    return { topic: input.topic, closets: [], tokenEstimate: 0 };
  }
  async kgAdd(): Promise<{ tripleId: string; contradictions: KgContradiction[] }> {
    return { tripleId: '', contradictions: [] };
  }
  async kgQuery(): Promise<KgTriple[]> {
    return [];
  }
  async kgInvalidate(): Promise<{ invalidatedCount: number }> {
    return { invalidatedCount: 0 };
  }
  async listWings(): Promise<Wing[]> {
    return [];
  }
  async listRooms(): Promise<Room[]> {
    return [];
  }
}

// ============================================================================
// Factory
// ============================================================================

export function createMemPalaceClient(
  config: MemPalaceConfig,
  mcpTransport?: McpTransport
): MemPalaceClient {
  switch (config.mode) {
    case 'local':
      return new LocalShimClient();
    case 'mcp':
      if (!mcpTransport) {
        throw new Error(
          'MemPalace mode=mcp requires an MCP transport to be provided.'
        );
      }
      return new McpAdapterClient(mcpTransport);
    case 'disabled':
      return new DisabledClient();
    default:
      return new DisabledClient();
  }
}

// ============================================================================
// Utilities
// ============================================================================

/** Rough token estimate — 4 chars ≈ 1 token. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
