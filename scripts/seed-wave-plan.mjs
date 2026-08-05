#!/usr/bin/env node
/**
 * Seed one EXECUTING wave plan.
 *
 * packages/core/src/db/seed.ts creates horizon items, sessions and plans, but
 * no wave plans — so the wave planner, the DAG view and the critical path had
 * nothing to render, and the parts of the cockpit that make this product
 * different from a kanban board could not be seen at all.
 *
 * The shape below is deliberately not a toy: a 4-wave plan with a genuine
 * diamond dependency (two independent branches that rejoin), so the critical
 * path is the LONGER of two routes rather than the only route. A path that is
 * simply "every task" demonstrates nothing.
 *
 *   1.1 ──┬── 2.1 ── 3.1 ──┬── 4.1     ← critical: 1.1 → 2.1 → 3.1 → 4.1
 *         └── 2.2 ─────────┘
 *
 * Usage: node scripts/seed-wave-plan.mjs
 */
import Database from 'better-sqlite3';
import { resolve } from 'node:path';

const DB = process.env.DEVPILOT_SQLITE_PATH || resolve(process.cwd(), '.devpilot/data.db');
const db = new Database(DB);

const id = (p) => `${p}_${Math.random().toString(36).slice(2, 10)}`;
const now = Math.floor(Date.now() / 1000);

// Attach to whichever horizon item is furthest along, so the plan appears
// against something that looks plausibly in flight.
const item = db
  .prepare("SELECT id, title FROM horizon_items WHERE zone IN ('READY','REFINING') LIMIT 1")
  .get();

if (!item) {
  console.error('No READY/REFINING horizon item found — run the core seed first.');
  process.exit(1);
}

const planRow = db.prepare('SELECT id FROM plans WHERE horizon_item_id = ? LIMIT 1').get(item.id);

const wavePlanId = id('wp');
const CRITICAL = ['1.1', '2.1', '3.1', '4.1'];

db.exec('BEGIN');
try {
  // Clear any previous run of this script so it is idempotent.
  const stale = db.prepare('SELECT id FROM wave_plans WHERE horizon_item_id = ?').all(item.id);
  for (const { id: wid } of stale) {
    for (const t of ['dependency_edges', 'wave_tasks', 'waves']) {
      db.prepare(`DELETE FROM ${t} WHERE wave_plan_id = ?`).run(wid);
    }
    db.prepare('DELETE FROM wave_plans WHERE id = ?').run(wid);
  }

  db.prepare(
    `INSERT INTO wave_plans (id, plan_id, horizon_item_id, total_waves, total_tasks,
      max_parallelism, critical_path, critical_path_length, parallelization_score,
      status, current_wave_index, version, started_at, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  ).run(
    wavePlanId,
    planRow?.id ?? id('plan'),
    item.id,
    4,
    6,
    2,
    JSON.stringify(CRITICAL),
    4,
    1.5,
    'executing',
    1, // wave 0 done, wave 1 running — mid-flight is the interesting state
    1,
    now - 900,
    now - 900,
    now
  );

  const waveDefs = [
    { i: 0, label: 'Foundations', status: 'completed' },
    // 'active', not 'running' — waves and wave_tasks have DIFFERENT status
    // enums (waves: dispatching/active, tasks: dispatched/running) and the
    // CHECK constraint catches the mix-up rather than storing nonsense.
    { i: 1, label: 'Parallel build-out', status: 'active' },
    { i: 2, label: 'Integration', status: 'pending' },
    { i: 3, label: 'Ship', status: 'pending' },
  ];
  const waveIds = {};
  for (const w of waveDefs) {
    waveIds[w.i] = id('wave');
    db.prepare(
      `INSERT INTO waves (id, wave_plan_id, wave_index, label, max_parallel_tasks, status, started_at, completed_at)
       VALUES (?,?,?,?,?,?,?,?)`
    ).run(
      waveIds[w.i],
      wavePlanId,
      w.i,
      w.label,
      2,
      w.status,
      w.status === 'pending' ? null : now - 900 + w.i * 240,
      w.status === 'completed' ? now - 900 + w.i * 240 + 200 : null
    );
  }

  const tasks = [
    { code: '1.1', wave: 0, label: 'Extract schema module', status: 'completed', crit: true, cx: 'M' },
    { code: '2.1', wave: 1, label: 'Wire adapter layer', status: 'running', crit: true, cx: 'L' },
    { code: '2.2', wave: 1, label: 'Add fixture generator', status: 'running', crit: false, cx: 'S' },
    { code: '3.1', wave: 2, label: 'Migrate call sites', status: 'pending', crit: true, cx: 'L' },
    { code: '3.2', wave: 2, label: 'Backfill unit tests', status: 'pending', crit: false, cx: 'S' },
    { code: '4.1', wave: 3, label: 'Cut over and delete shim', status: 'pending', crit: true, cx: 'M' },
  ];

  for (const t of tasks) {
    db.prepare(
      `INSERT INTO wave_tasks (id, wave_id, wave_plan_id, wave_index, task_code, label,
        description, file_paths, dependencies, complexity, is_on_critical_path,
        can_run_in_parallel, status, retry_count, started_at, completed_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    ).run(
      id('wt'),
      waveIds[t.wave],
      wavePlanId,
      t.wave,
      t.code,
      t.label,
      '',
      JSON.stringify([]),
      JSON.stringify([]),
      t.cx,
      t.crit ? 1 : 0,
      1,
      t.status,
      0,
      t.status === 'pending' ? null : now - 800,
      t.status === 'completed' ? now - 600 : null
    );
  }

  // The diamond: 1.1 fans out to 2.1 and 2.2, both rejoin at 3.1, then 4.1.
  const edges = [
    ['1.1', '2.1', 'hard'],
    ['1.1', '2.2', 'hard'],
    ['2.1', '3.1', 'hard'],
    ['2.2', '3.1', 'hard'],
    ['2.2', '3.2', 'soft'],
    ['3.1', '4.1', 'hard'],
    ['3.2', '4.1', 'soft'],
  ];
  for (const [from, to, type] of edges) {
    db.prepare(
      'INSERT INTO dependency_edges (id, wave_plan_id, from_task_code, to_task_code, edge_type) VALUES (?,?,?,?,?)'
    ).run(id('de'), wavePlanId, from, to, type);
  }

  db.exec('COMMIT');
} catch (err) {
  db.exec('ROLLBACK');
  throw err;
}

console.log(`\n✓ Seeded an executing wave plan on "${item.title}"`);
console.log(`  4 waves · 6 tasks · critical path ${CRITICAL.join(' → ')}`);
console.log(`  wave 0 complete, wave 1 running\n`);
