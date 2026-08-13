/**
 * Embedded FalkorDB Lite memory — TRD 19.
 *
 * The Python-free path. `falkordblite` launches the FalkorDB engine in-process
 * from Node, so there is no database server to operate and no Python.
 *
 * IT IS NOT ZERO-INSTALL, and TRD 19 v0.1 was wrong to imply it. `falkordblite`
 * downloads the FalkorDB *module* (a `.so`) but explicitly does NOT ship or
 * download `redis-server` — its own API documents "verifies redis-server is
 * reachable (user path → bin/ → system PATH)" and "resolve redis-server path
 * (no download)". The user must already have one, **matching their
 * architecture**: an arm64 module cannot load into an x86_64 redis-server, which
 * is exactly what an Intel-Homebrew install on Apple Silicon produces.
 *
 * So this trades a Python runtime for a redis-server binary. That is a better
 * trade — one ubiquitous binary rather than an interpreter and a virtualenv —
 * but it is a trade, not an elimination, and `preflight()` exists so a user
 * learns which piece is missing instead of watching memory silently do nothing.
 *
 * WHY THIS EXISTS ALONGSIDE THE GRAPHITI CLIENT. TRD 18 adopted Graphiti and
 * that stands — it is the better framework, and it stays the recommended tier
 * for entity resolution, LLM extraction and hybrid search. What it cannot be is
 * the *floor*: Graphiti is Python, and a Python install as the price of any
 * memory at all is too high for an npm-distributed CLI. Both clients speak the
 * same port and write the same shape, so moving between them is configuration.
 *
 * The fact model is deliberately small, because our records are already
 * structured (TRD 18 §4): a subject, a predicate, an object, and a validity
 * interval. Bi-temporality is a data-modelling choice, not something only a
 * framework can provide — `validUntil` is set rather than the edge deleted, so
 * "this stopped being true" survives as history.
 */

import type {
  AddDrawerInput,
  AddDrawerResult,
  KgAddInput,
  KgContradiction,
  KgInvalidateInput,
  KgQueryInput,
  KgTriple,
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
import type { MemPalaceClient } from './client';

/** Platforms `falkordblite` ships binaries for. */
const SUPPORTED = new Set(['linux-x64', 'darwin-arm64']);

/**
 * Can this machine run the embedded engine?
 *
 * Called before construction so an unsupported platform degrades to `disabled`
 * with a message rather than throwing during install or first write. Windows
 * needs WSL2; Intel Macs and Linux arm64 have no published binary.
 */
export function falkorLitePlatformSupported(
  platform: string = process.platform,
  arch: string = process.arch
): boolean {
  const key = `${platform === 'win32' ? 'win32' : platform}-${arch}`;
  return SUPPORTED.has(key);
}

export type PreflightResult =
  | { ok: true }
  | { ok: false; reason: string; remedy: string };

/**
 * Why can this machine not run the embedded engine?
 *
 * Separate from `falkorLitePlatformSupported` because the two failures need
 * different advice: an unsupported platform cannot be fixed, a missing
 * redis-server is one `brew install redis` away, and an architecture mismatch
 * looks like neither until you read a `dlopen` error.
 */
export async function falkorLitePreflight(): Promise<PreflightResult> {
  if (!falkorLitePlatformSupported()) {
    return {
      ok: false,
      reason: `falkordblite publishes no binary for ${process.platform}-${process.arch}`,
      remedy:
        'Use DEVPILOT_MEMORY_MODE=disabled, or run the hosted memory tier. ' +
        'Windows requires WSL2.',
    };
  }

  try {
    const mod = (await import('falkordblite')) as unknown as {
      BinaryManager: { findInSystemPath(name: string): string | undefined };
    };
    const found = mod.BinaryManager?.findInSystemPath?.('redis-server');
    if (!found) {
      return {
        ok: false,
        reason: 'redis-server was not found on PATH; falkordblite does not ship one',
        remedy: 'Install it — `brew install redis` or `apt install redis-server`.',
      };
    }
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      reason: `falkordblite is not installed: ${error instanceof Error ? error.message : String(error)}`,
      remedy: 'It is an optional dependency; reinstall on a supported platform.',
    };
  }
}

export interface FalkorLiteConfig {
  /** Directory for the persisted snapshot. Omit for ephemeral (tests). */
  path?: string;
  onLog?: (line: string) => void;
}

/** Shape of the `falkordblite` surface we depend on. Kept narrow on purpose. */
interface FalkorGraph {
  query(
    q: string,
    options?: { params?: Record<string, unknown> }
  ): Promise<{ data?: unknown[] } | null>;
}
interface FalkorHandle {
  selectGraph(id: string): FalkorGraph;
  close(): Promise<void>;
}

export class FalkorLiteClient implements MemPalaceClient {
  readonly mode = 'local' as const;

  private db: FalkorHandle | null = null;
  private opening: Promise<FalkorHandle | null> | null = null;

  constructor(private readonly config: FalkorLiteConfig = {}) {}

  private log(line: string) {
    this.config.onLog?.(`[falkor-lite] ${line}`);
  }

  /**
   * Open lazily and once.
   *
   * `falkordblite` is an OPTIONAL dependency, so the import is dynamic — a
   * platform without a published binary must not break `npm i -g`, and must not
   * break a conductor who never turns memory on.
   */
  private async handle(): Promise<FalkorHandle | null> {
    if (this.db) return this.db;
    if (this.opening) return this.opening;

    this.opening = (async () => {
      const pre = await falkorLitePreflight();
      if (!pre.ok) {
        // Say which piece is missing and how to fix it. A silent degrade here
        // is indistinguishable from "memory is on and has nothing to say".
        this.log(`unavailable — ${pre.reason}. ${pre.remedy}`);
        return null;
      }
      try {
        const mod = (await import('falkordblite')) as unknown as {
          FalkorDB: { open(o?: { path?: string }): Promise<FalkorHandle> };
        };
        this.db = await mod.FalkorDB.open({ path: this.config.path });
        return this.db;
      } catch (error) {
        this.log(`open failed: ${error instanceof Error ? error.message : String(error)}`);
        return null;
      }
    })();

    return this.opening;
  }

  /**
   * Run one Cypher statement. Never throws — memory improves a plan, it must
   * never gate one, so a failure degrades to `null` exactly as the Graphiti
   * client does.
   */
  private async run(
    wingSlug: string,
    cypher: string,
    params: Record<string, unknown> = {}
  ): Promise<unknown[] | null> {
    const db = await this.handle();
    if (!db) return null;
    try {
      // One graph per wing. Physical separation rather than a property filter —
      // the same reasoning as one asset per org in TRD 19 §3.1: a scoping clause
      // is something a future query can forget.
      const graph = db.selectGraph(`wing_${wingSlug.replace(/[^a-zA-Z0-9_]/g, '_')}`);
      const res = await graph.query(cypher, { params });
      return (res?.data as unknown[]) ?? [];
    } catch (error) {
      this.log(`query failed: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }

  async close(): Promise<void> {
    if (this.db) {
      await this.db.close().catch(() => undefined);
      this.db = null;
      this.opening = null;
    }
  }

  async ensureWing(slug: string, name?: string, repo?: string): Promise<Wing> {
    // Graphs are created on first write; nothing to provision.
    return { id: slug, slug, name: name ?? slug, wingType: 'project', repo };
  }

  async addDrawer(input: AddDrawerInput): Promise<AddDrawerResult> {
    const now = new Date().toISOString();
    const rows = await this.run(
      input.wingSlug,
      `MERGE (r:Room {slug: $room})
       CREATE (r)-[f:FACT {
         label: $label, content: $content, memoryType: $type,
         salience: $salience, validFrom: $now, validUntil: null
       }]->(d:Record {label: $label})
       RETURN id(f) AS fid`,
      {
        room: input.roomSlug,
        label: input.label,
        content: input.content,
        type: input.memoryType,
        salience: input.salience ?? 0.5,
        now,
      }
    );

    return {
      drawerId: rows && rows.length > 0 ? String(readCell(rows[0], 0) ?? input.label) : input.label,
      created: rows !== null,
      roomId: input.roomSlug,
      wingId: input.wingSlug,
    };
  }

  async search(input: SearchInput): Promise<SearchResult> {
    const wing = input.wingSlug ?? 'devpilot';
    const rows = await this.run(
      wing,
      // Superseded facts are excluded from recall but remain on disk — that is
      // the point of setting validUntil rather than deleting.
      `MATCH (r:Room)-[f:FACT]->(d:Record)
       WHERE f.validUntil IS NULL
         AND (toLower(f.content) CONTAINS toLower($q) OR toLower(f.label) CONTAINS toLower($q))
       RETURN f.label, f.content, r.slug, f.memoryType, f.salience
       ORDER BY f.salience DESC
       LIMIT $limit`,
      { q: input.query, limit: input.limit ?? 10 }
    );

    if (!rows) return { hits: [], totalScanned: 0 };

    return {
      hits: rows.map<SearchHit>((row, i) => ({
        drawerId: `${wing}:${i}`,
        roomSlug: String(readCell(row, 2) ?? 'main'),
        wingSlug: wing,
        label: String(readCell(row, 0) ?? ''),
        snippet: String(readCell(row, 1) ?? ''),
        score: 1 - i * 0.01,
        memoryType: (readCell(row, 3) as SearchHit['memoryType']) ?? 'fact',
      })),
      totalScanned: rows.length,
    };
  }

  async wakeUp(input: WakeUpInput): Promise<WakeUpResult> {
    const rows = await this.run(
      input.wingSlug,
      `MATCH ()-[f:FACT]->()
       WHERE f.validUntil IS NULL
       RETURN f.content ORDER BY f.salience DESC LIMIT 5`
    );

    const criticalFacts = (rows ?? [])
      .map((r) => String(readCell(r, 0) ?? ''))
      .filter(Boolean);

    return {
      identity: `Memory for ${input.wingSlug}`,
      criticalFacts,
      tokenEstimate: Math.ceil(criticalFacts.join(' ').length / 4),
    };
  }

  /** L2 recall. One synthesised closet, same contract as the Graphiti client. */
  async recall(input: RecallInput): Promise<RecallResult> {
    const found = await this.search({
      query: input.topic,
      wingSlug: input.wingSlug,
      limit: input.limit ?? 3,
    } as SearchInput);

    if (found.hits.length === 0) {
      return { topic: input.topic, closets: [], tokenEstimate: 0 };
    }

    const summary = found.hits.map((h) => h.snippet).join('\n');
    const tokenCost = Math.ceil(summary.length / 4);

    return {
      topic: input.topic,
      closets: [
        {
          id: `falkor:${input.topic}`,
          roomId: input.wingSlug ?? 'main',
          summary,
          drawerIds: found.hits.map((h) => h.drawerId),
          tier: 2,
          tokenCost,
        },
      ],
      tokenEstimate: tokenCost,
    };
  }

  async kgAdd(
    input: KgAddInput
  ): Promise<{ tripleId: string; contradictions: KgContradiction[] }> {
    const now = new Date().toISOString();
    const rows = await this.run(
      input.wingSlug,
      `MERGE (s:Entity {name: $subject})
       MERGE (o:Entity {name: $object})
       CREATE (s)-[t:TRIPLE {predicate: $predicate, validFrom: $now, validUntil: null}]->(o)
       RETURN id(t)`,
      { subject: input.subject, object: input.object, predicate: input.predicate, now }
    );
    return {
      tripleId: rows && rows.length > 0 ? String(readCell(rows[0], 0) ?? '') : '',
      contradictions: [],
    };
  }

  async kgQuery(input: KgQueryInput): Promise<KgTriple[]> {
    const rows = await this.run(
      input.wingSlug,
      `MATCH (s:Entity)-[t:TRIPLE]->(o:Entity)
       WHERE ($subject IS NULL OR s.name = $subject)
         AND ($predicate IS NULL OR t.predicate = $predicate)
         AND ($currentOnly = false OR t.validUntil IS NULL)
       RETURN s.name, t.predicate, o.name, t.validFrom, t.validUntil`,
      {
        subject: input.subject ?? null,
        predicate: input.predicate ?? null,
        currentOnly: input.currentOnly ?? false,
      }
    );

    return (rows ?? []).map(
      (r) =>
        ({
          id: '',
          wingId: input.wingSlug,
          subject: String(readCell(r, 0) ?? ''),
          predicate: String(readCell(r, 1) ?? ''),
          object: String(readCell(r, 2) ?? ''),
          confidence: 1,
          validFrom: readCell(r, 3) ? new Date(String(readCell(r, 3))) : new Date(),
          validUntil: readCell(r, 4) ? new Date(String(readCell(r, 4))) : null,
        }) as unknown as KgTriple
    );
  }

  /**
   * Supersede rather than delete — the capability the port declared and the
   * SQLite shim never provided. A fact that stopped being true is still a fact
   * about what we used to believe.
   */
  async kgInvalidate(input: KgInvalidateInput): Promise<{ invalidatedCount: number }> {
    const now = new Date().toISOString();
    const rows = await this.run(
      input.wingSlug,
      `MATCH (s:Entity)-[t:TRIPLE]->()
       WHERE s.name = $subject AND t.predicate = $predicate AND t.validUntil IS NULL
       SET t.validUntil = $now
       RETURN count(t)`,
      { subject: input.subject, predicate: input.predicate, now }
    );
    const count = rows && rows.length > 0 ? Number(readCell(rows[0], 0) ?? 0) : 0;
    return { invalidatedCount: count };
  }

  async listWings(): Promise<Wing[]> {
    return [];
  }

  async listRooms(_wingSlug: string): Promise<Room[]> {
    return [];
  }
}

/**
 * Read column `i` of a result row.
 *
 * falkordb-ts has returned rows as arrays and, in places, as objects keyed by
 * the RETURN expression. Accepting both keeps a driver upgrade from silently
 * emptying recall, which would read as "memory stopped working".
 */
function readCell(row: unknown, index: number): unknown {
  if (Array.isArray(row)) return row[index];
  if (row && typeof row === 'object') {
    const values = Object.values(row as Record<string, unknown>);
    return values[index];
  }
  return undefined;
}
