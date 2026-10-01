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
import { readWaveSignal } from '../../src/wave-planner/execution/wave-state';

/**
 * The ten columns behind "a branch per task, a merge per wave" are new, and the
 * databases they have to work against are not. Same approach as
 * `wave-columns-upgrade.test.ts`: build the two tables the way the previous
 * version left them — on disk, with a run in the middle of a wave — and open
 * that file with the current adapter, which is all a user upgrading ever does.
 *
 * Beyond "the columns appear", what matters is what their absence MEANS for a
 * row that was written without them, because nothing backfills: a plan that was
 * mid-run before the upgrade must carry on exactly as it was going.
 */

let dir: string;
let dbPath: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'devpilot-isolation-columns-'));
  dbPath = join(dir, 'data.db');
});

afterEach(() => {
  closeSQLiteConnection();
  rmSync(dir, { recursive: true, force: true });
});

const PLAN_COLUMNS = ['run_id', 'isolated', 'isolation_note', 'run_branch', 'run_head_sha'];
const TASK_COLUMNS = ['branch', 'base_sha', 'commit_sha', 'files_changed', 'merged_at'];

/** The two tables exactly as the bootstrap DDL created them before these columns. */
const PREVIOUS_WAVE_TABLES = `
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
  last_attempt_at INTEGER,
  completed_at INTEGER,
  error_message TEXT,
  completion_summary TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0
);`;

/** A plan that was executing when the cockpit was upgraded: wave 1 finished. */
function writePreviousDatabase(): void {
  const previous = new Database(dbPath);
  previous.exec(PREVIOUS_WAVE_TABLES);
  previous
    .prepare(
      `INSERT INTO wave_plans (id, plan_id, horizon_item_id, total_waves, total_tasks, max_parallelism,
         critical_path, critical_path_length, parallelization_score, status, created_at, updated_at)
       VALUES ('wp_old', 'plan_old', 'item_old', 2, 2, 1, '[]', 2, 0.5, 'executing', 1755000000, 1755000000)`
    )
    .run();
  previous
    .prepare(
      `INSERT INTO wave_tasks (id, wave_id, wave_plan_id, wave_index, task_code, label, status,
         assigned_session_id, started_at, last_attempt_at, completed_at, completion_summary)
       VALUES ('wt_old', 'wave_old', 'wp_old', 0, '1.1', 'Do it', 'completed', 'sess_old',
         1755000100, 1755000100, 1755000400, 'did it')`
    )
    .run();
  previous.close();
}

const columns = (table: string) =>
  (getSQLiteConnection()!.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map(
    (c) => c.name
  );

describe('run and task-branch columns on an existing database', () => {
  it('adds all ten, and reads existing rows as having none of the values', async () => {
    writePreviousDatabase();
    const db = createSQLiteAdapter(dbPath);

    expect(columns('wave_plans')).toEqual(expect.arrayContaining(PLAN_COLUMNS));
    expect(columns('wave_tasks')).toEqual(expect.arrayContaining(TASK_COLUMNS));

    const [plan] = await db.select().from(wavePlans).where(eq(wavePlans.id, 'wp_old'));
    expect(plan.status).toBe('executing');
    expect(plan).toMatchObject({
      runId: null,
      isolated: null, // not "false": nobody has asked yet
      isolationNote: null,
      runBranch: null,
      runHeadSha: null,
    });

    const [task] = await db.select().from(waveTasks).where(eq(waveTasks.id, 'wt_old'));
    expect(task.status).toBe('completed');
    expect(task.completionSummary).toBe('did it');
    expect(task).toMatchObject({
      branch: null,
      baseSha: null,
      commitSha: null,
      filesChanged: null, // not "[]": nothing was recorded
      mergedAt: null,
    });
  });

  it('leaves a plan that was mid-run before the upgrade exactly as it was going', async () => {
    writePreviousDatabase();
    const db = createSQLiteAdapter(dbPath);

    const [plan] = await db.select().from(wavePlans).where(eq(wavePlans.id, 'wp_old'));
    const tasks = await db.select().from(waveTasks).where(eq(waveTasks.wavePlanId, 'wp_old'));

    // Its finished wave is over. It is not waiting on a merge: its tasks never
    // had branches, and an unmerged, completed task only holds a wave open for
    // a plan that was decided to be isolated.
    expect(readWaveSignal(plan, tasks, 4)).toEqual({ kind: 'over', outcome: { state: 'complete' } });
  });

  it('is a no-op the second time the database is opened, and the columns hold what is written', async () => {
    writePreviousDatabase();
    createSQLiteAdapter(dbPath);
    closeSQLiteConnection();

    const db = createSQLiteAdapter(dbPath);
    const mergedAt = new Date(1755000500 * 1000);
    await db
      .update(wavePlans)
      .set({ runId: 'AVA-12-wp_old', isolated: true, runBranch: 'devpilot/AVA-12-wp_old/run', runHeadSha: 'abc123' })
      .where(eq(wavePlans.id, 'wp_old'));
    await db
      .update(waveTasks)
      .set({
        branch: 'devpilot/AVA-12-wp_old/task-1.1',
        baseSha: 'base',
        commitSha: 'head',
        filesChanged: [],
        mergedAt,
      })
      .where(eq(waveTasks.id, 'wt_old'));

    const [plan] = await db.select().from(wavePlans).where(eq(wavePlans.id, 'wp_old'));
    expect(plan).toMatchObject({ runId: 'AVA-12-wp_old', isolated: true, runHeadSha: 'abc123' });

    const [task] = await db.select().from(waveTasks).where(eq(waveTasks.id, 'wt_old'));
    expect(task.branch).toBe('devpilot/AVA-12-wp_old/task-1.1');
    // An empty list survives as an empty list — "changed nothing" — and does
    // not come back as the NULL that means "not recorded".
    expect(task.filesChanged).toEqual([]);
    expect(task.mergedAt).toEqual(mergedAt);

    for (const column of PLAN_COLUMNS) {
      expect(columns('wave_plans').filter((c) => c === column)).toHaveLength(1);
    }
    for (const column of TASK_COLUMNS) {
      expect(columns('wave_tasks').filter((c) => c === column)).toHaveLength(1);
    }
  });

  it('creates all ten in a brand-new database, with no defaults', () => {
    createSQLiteAdapter(dbPath);

    expect(columns('wave_plans')).toEqual(expect.arrayContaining(PLAN_COLUMNS));
    expect(columns('wave_tasks')).toEqual(expect.arrayContaining(TASK_COLUMNS));

    const info = [
      ...(getSQLiteConnection()!.prepare('PRAGMA table_info(wave_plans)').all() as any[]),
      ...(getSQLiteConnection()!.prepare('PRAGMA table_info(wave_tasks)').all() as any[]),
    ].filter((c) => [...PLAN_COLUMNS, ...TASK_COLUMNS].includes(c.name));

    expect(info).toHaveLength(10);
    // Nullable, no default: NULL is the only thing an untouched row can say.
    expect(info.every((c) => c.notnull === 0 && c.dflt_value === null)).toBe(true);
  });
});
