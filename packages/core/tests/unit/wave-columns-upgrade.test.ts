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
import { wavePlans, waveTasks } from '../../src/db/schema';

/**
 * `wave_tasks.last_attempt_at` and `wave_plans.failure_reason` are new, and the
 * databases they have to work against are not. Same approach as
 * `item-description-storage.test.ts`: build the two tables the way an older
 * version left them — on disk, with real rows mid-run — and open that file with
 * the current adapter, which is all a user upgrading ever does.
 */

let dir: string;
let dbPath: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'devpilot-wave-columns-'));
  dbPath = join(dir, 'data.db');
});

afterEach(() => {
  closeSQLiteConnection();
  rmSync(dir, { recursive: true, force: true });
});

/** The two tables exactly as the bootstrap DDL created them before these columns. */
const LEGACY_WAVE_TABLES = `
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
  started_at INTEGER,
  completed_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE wave_tasks (
  id TEXT PRIMARY KEY,
  wave_id TEXT NOT NULL,
  wave_plan_id TEXT NOT NULL,
  task_id TEXT,
  wave_index INTEGER NOT NULL,
  task_code TEXT NOT NULL,
  label TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  file_paths TEXT NOT NULL DEFAULT '[]',
  dependencies TEXT NOT NULL DEFAULT '[]',
  recommended_model TEXT CHECK(recommended_model IN ('HAIKU', 'SONNET', 'OPUS')),
  complexity TEXT CHECK(complexity IN ('S', 'M', 'L', 'XL')),
  is_on_critical_path INTEGER NOT NULL DEFAULT 0,
  can_run_in_parallel INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'dispatched', 'running', 'completed', 'failed', 'retrying', 'skipped')),
  assigned_session_id TEXT,
  started_at INTEGER,
  completed_at INTEGER,
  error_message TEXT,
  completion_summary TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0
);`;

function writeLegacyDatabase(): void {
  const legacy = new Database(dbPath);
  legacy.exec(LEGACY_WAVE_TABLES);
  legacy
    .prepare(
      `INSERT INTO wave_plans (id, plan_id, horizon_item_id, total_waves, total_tasks, max_parallelism,
         critical_path, critical_path_length, parallelization_score, status, created_at, updated_at)
       VALUES ('wp_old', 'plan_old', 'item_old', 1, 1, 1, '[]', 1, 0.5, 'failed', 1755000000, 1755000000)`
    )
    .run();
  legacy
    .prepare(
      `INSERT INTO wave_tasks (id, wave_id, wave_plan_id, wave_index, task_code, label, status,
         assigned_session_id, started_at)
       VALUES ('wt_old', 'wave_old', 'wp_old', 0, '1.1', 'Do it', 'dispatched', 'sess_old', 1755000100)`
    )
    .run();
  legacy.close();
}

const columns = (table: string) =>
  (getSQLiteConnection()!.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map(
    (c) => c.name
  );

describe('wave timing and failure columns on an existing database', () => {
  it('adds both columns and reads existing rows as having neither value', async () => {
    writeLegacyDatabase();
    const db = createSQLiteAdapter(dbPath);

    expect(columns('wave_tasks')).toContain('last_attempt_at');
    expect(columns('wave_plans')).toContain('failure_reason');

    const [task] = await db.select().from(waveTasks).where(eq(waveTasks.id, 'wt_old'));
    expect(task.status).toBe('dispatched');
    expect(task.startedAt).toEqual(new Date(1755000100 * 1000));
    expect(task.lastAttemptAt).toBeNull();

    const [plan] = await db.select().from(wavePlans).where(eq(wavePlans.id, 'wp_old'));
    expect(plan.status).toBe('failed');
    expect(plan.failureReason).toBeNull();
  });

  it('is a no-op the second time the database is opened', async () => {
    writeLegacyDatabase();
    createSQLiteAdapter(dbPath);
    closeSQLiteConnection();

    const db = createSQLiteAdapter(dbPath);
    await db.update(waveTasks).set({ lastAttemptAt: new Date(1755000200 * 1000) }).where(eq(waveTasks.id, 'wt_old'));

    const [task] = await db.select().from(waveTasks).where(eq(waveTasks.id, 'wt_old'));
    expect(task.lastAttemptAt).toEqual(new Date(1755000200 * 1000));
    expect(columns('wave_tasks').filter((c) => c === 'last_attempt_at')).toHaveLength(1);
  });

  it('creates both columns in a brand-new database', () => {
    createSQLiteAdapter(dbPath);

    expect(columns('wave_tasks')).toContain('last_attempt_at');
    expect(columns('wave_plans')).toContain('failure_reason');
  });
});
