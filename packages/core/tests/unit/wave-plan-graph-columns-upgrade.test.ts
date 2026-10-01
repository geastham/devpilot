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
import { wavePlans } from '../../src/db/schema';

/**
 * `wave_plans.adjustments` and `wave_plans.code_graph` are new, and the
 * databases they have to work against are not. Same approach as
 * `wave-isolation-columns-upgrade.test.ts`: build the table the way the
 * previous version left it — on disk, with a plan in it — and open that file
 * with the current adapter, which is all a user upgrading ever does.
 *
 * What matters beyond "the columns appear" is what their absence MEANS for a
 * plan written without them, because nothing backfills: NULL adjustments is
 * "not recorded", not "none"; NULL code_graph is "nobody asked".
 */

let dir: string;
let dbPath: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'devpilot-graph-columns-'));
  dbPath = join(dir, 'data.db');
});

afterEach(() => {
  closeSQLiteConnection();
  rmSync(dir, { recursive: true, force: true });
});

const COLUMNS = ['adjustments', 'code_graph'];

/** `wave_plans` exactly as the bootstrap DDL created it before these columns. */
const PREVIOUS_WAVE_PLANS = `
CREATE TABLE wave_plans (
  id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL,
  horizon_item_id TEXT NOT NULL,
  total_waves INTEGER NOT NULL,
  total_tasks INTEGER NOT NULL,
  max_parallelism INTEGER NOT NULL,
  critical_path TEXT NOT NULL,
  critical_path_length INTEGER NOT NULL,
  parallelization_score REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft', 'approved', 'executing', 'paused', 'completed', 'failed', 're-optimizing')),
  current_wave_index INTEGER NOT NULL DEFAULT 0,
  version INTEGER NOT NULL DEFAULT 1,
  previous_wave_plan_id TEXT REFERENCES wave_plans(id),
  raw_markdown TEXT,
  failure_reason TEXT,
  run_id TEXT,
  isolated INTEGER,
  isolation_note TEXT,
  run_branch TEXT,
  run_head_sha TEXT,
  started_at INTEGER,
  completed_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);`;

function writePreviousDatabase(): void {
  const previous = new Database(dbPath);
  previous.exec(PREVIOUS_WAVE_PLANS);
  previous
    .prepare(
      `INSERT INTO wave_plans (id, plan_id, horizon_item_id, total_waves, total_tasks, max_parallelism,
         critical_path, critical_path_length, parallelization_score, status, run_id, isolated, created_at, updated_at)
       VALUES ('wp_old', 'plan_old', 'item_old', 2, 2, 1, '[]', 2, 0.5, 'executing', 'AVA-12-wp_old', 1, 1755000000, 1755000000)`
    )
    .run();
  previous.close();
}

const columns = () =>
  (getSQLiteConnection()!.prepare('PRAGMA table_info(wave_plans)').all() as { name: string }[]).map((c) => c.name);

describe('adjustments and code-graph columns on an existing database', () => {
  it('adds both, and reads an existing plan as having neither recorded', async () => {
    writePreviousDatabase();
    const db = createSQLiteAdapter(dbPath);

    expect(columns()).toEqual(expect.arrayContaining(COLUMNS));

    const [plan] = await db.select().from(wavePlans).where(eq(wavePlans.id, 'wp_old'));
    // Untouched: it is still the run it was.
    expect(plan).toMatchObject({ status: 'executing', runId: 'AVA-12-wp_old', isolated: true });
    // Not "[]": nobody recorded what the assigner did for this plan.
    expect(plan.adjustments).toBeNull();
    // Not "{ used: false }": nobody asked.
    expect(plan.codeGraph).toBeNull();
  });

  it('is a no-op the second time the database is opened, and the columns hold what is written', async () => {
    writePreviousDatabase();
    createSQLiteAdapter(dbPath);
    closeSQLiteConnection();

    const db = createSQLiteAdapter(dbPath);
    const adjustments = [
      {
        type: 'DEPENDENCY_CONFLICT_BUMP' as const,
        taskCode: '1.2',
        fromWave: 0,
        toWave: 1,
        reason: 'Dependency conflict: src/fetch.ts depends on src/policy.ts, which task 1.1 changes',
      },
    ];
    await db
      .update(wavePlans)
      .set({ adjustments, codeGraph: { used: false, reason: 'there is no code graph index' } })
      .where(eq(wavePlans.id, 'wp_old'));

    const [plan] = await db.select().from(wavePlans).where(eq(wavePlans.id, 'wp_old'));
    expect(plan.adjustments).toEqual(adjustments);
    expect(plan.codeGraph).toEqual({ used: false, reason: 'there is no code graph index' });

    // An empty list survives as an empty list — "moved nothing" — and does not
    // come back as the NULL that means "not recorded".
    await db.update(wavePlans).set({ adjustments: [] }).where(eq(wavePlans.id, 'wp_old'));
    const [again] = await db.select().from(wavePlans).where(eq(wavePlans.id, 'wp_old'));
    expect(again.adjustments).toEqual([]);

    for (const column of COLUMNS) {
      expect(columns().filter((c) => c === column)).toHaveLength(1);
    }
  });

  it('creates both in a brand-new database, nullable, with no default', () => {
    createSQLiteAdapter(dbPath);

    const info = (getSQLiteConnection()!.prepare('PRAGMA table_info(wave_plans)').all() as any[]).filter((c) =>
      COLUMNS.includes(c.name)
    );

    expect(info).toHaveLength(2);
    expect(info.every((c) => c.notnull === 0 && c.dflt_value === null)).toBe(true);
  });
});
