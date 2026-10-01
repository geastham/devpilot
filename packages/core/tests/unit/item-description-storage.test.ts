import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import {
  createSQLiteAdapter,
  closeSQLiteConnection,
  getSQLiteConnection,
} from '../../src/db/adapters/sqlite';
import { horizonItems, rufloSessions } from '../../src/db/schema';

/**
 * `horizon_items.description` is new, and the databases it has to work against
 * are not: every existing `.devpilot/data.db` was created without it, and
 * `CREATE TABLE IF NOT EXISTS` never alters a table that already exists.
 *
 * These build a database the way an older version left it — on disk, with a
 * real row in it — and then open it with the current adapter, which is the
 * only thing a user upgrading ever does.
 */

let dir: string;
let dbPath: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'devpilot-item-description-'));
  dbPath = join(dir, 'data.db');
});

afterEach(() => {
  closeSQLiteConnection();
  rmSync(dir, { recursive: true, force: true });
});

/** `horizon_items` exactly as the bootstrap DDL created it before this column. */
const LEGACY_HORIZON_ITEMS = `
CREATE TABLE horizon_items (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  zone TEXT NOT NULL CHECK(zone IN ('READY', 'REFINING', 'SHAPING', 'DIRECTIONAL')),
  repo TEXT NOT NULL,
  complexity TEXT CHECK(complexity IN ('S', 'M', 'L', 'XL')),
  priority INTEGER NOT NULL DEFAULT 0,
  linear_ticket_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);`;

function writeLegacyDatabase(extraColumns = ''): void {
  const legacy = new Database(dbPath);
  legacy.exec(LEGACY_HORIZON_ITEMS);
  if (extraColumns) legacy.exec(extraColumns);
  legacy
    .prepare(
      `INSERT INTO horizon_items (id, title, zone, repo, priority, linear_ticket_id, created_at, updated_at)
       VALUES ('item_old', 'Fix checkout', 'REFINING', 'acme/storefront', 3, 'AVA-12', 1755000000, 1755000000)`
    )
    .run();
  legacy.close();
}

function columnsOf(table: string): string[] {
  const rows = getSQLiteConnection()!.prepare(`PRAGMA table_info(${table})`).all() as {
    name: string;
  }[];
  return rows.map((r) => r.name);
}

describe('opening a database created before horizon_items.description', () => {
  it('adds the column and leaves the existing row intact, with no description', async () => {
    writeLegacyDatabase();

    const db = createSQLiteAdapter(dbPath);

    expect(columnsOf('horizon_items')).toContain('description');

    const [item] = await db.select().from(horizonItems).where(eq(horizonItems.id, 'item_old'));
    expect(item).toMatchObject({
      id: 'item_old',
      title: 'Fix checkout',
      zone: 'REFINING',
      repo: 'acme/storefront',
      priority: 3,
      linearTicketId: 'AVA-12',
      description: null,
    });
  });

  it('upgrades a database that drizzle-kit push created, which already has archived_at', async () => {
    // The shape of a repo-checkout database: pushed from the drizzle schema as
    // it stood before this change, so one column further along than the DDL.
    writeLegacyDatabase('ALTER TABLE horizon_items ADD COLUMN archived_at INTEGER;');

    const db = createSQLiteAdapter(dbPath);

    const [item] = await db.select().from(horizonItems).where(eq(horizonItems.id, 'item_old'));
    expect(item.description).toBeNull();
    expect(item.archivedAt).toBeNull();
    expect(columnsOf('horizon_items').filter((c) => c === 'archived_at')).toHaveLength(1);
  });

  it('stores and returns a description once upgraded', async () => {
    writeLegacyDatabase();
    const db = createSQLiteAdapter(dbPath);

    const [created] = await db
      .insert(horizonItems)
      .values({
        title: 'Add retry',
        repo: 'acme/storefront',
        description: 'Payments time out when the gateway is slow.',
      })
      .returning();

    const [read] = await db.select().from(horizonItems).where(eq(horizonItems.id, created.id));
    expect(read.description).toBe('Payments time out when the gateway is slow.');
  });

  it('is safe to open again — the upgrade only ever runs once', async () => {
    writeLegacyDatabase();
    const first = createSQLiteAdapter(dbPath);
    await first
      .update(horizonItems)
      .set({ description: 'kept across restarts' })
      .where(eq(horizonItems.id, 'item_old'));
    closeSQLiteConnection();

    const second = createSQLiteAdapter(dbPath);

    const [item] = await second.select().from(horizonItems).where(eq(horizonItems.id, 'item_old'));
    expect(item.description).toBe('kept across restarts');
    expect(columnsOf('horizon_items').filter((c) => c === 'description')).toHaveLength(1);
  });
});

describe('a database created fresh by the adapter', () => {
  it('has the description column', async () => {
    const db = createSQLiteAdapter(dbPath);

    expect(columnsOf('horizon_items')).toContain('description');

    const [created] = await db
      .insert(horizonItems)
      .values({ title: 'No body', repo: 'acme/storefront' })
      .returning();
    expect(created.description).toBeNull();
  });

  /**
   * `archived_at` and `telemetry` were declared in the drizzle schema and never
   * added to the bootstrap DDL. A database that `drizzle-kit push` had touched
   * was fine; one created by the adapter alone — `devpilot serve`, or any test
   * — failed every read of these tables with "no such column".
   */
  it('can read the tables whose columns the bootstrap used to leave out', async () => {
    const db = createSQLiteAdapter(dbPath);

    expect(columnsOf('horizon_items')).toContain('archived_at');
    expect(columnsOf('ruflo_sessions')).toContain('telemetry');
    await expect(db.select().from(horizonItems)).resolves.toEqual([]);
    await expect(db.select().from(rufloSessions)).resolves.toEqual([]);
  });
});
