#!/usr/bin/env node
/**
 * Seed a small, REAL wave plan for a live conductor-agent run.
 *
 * Unlike `seed-wave-plan.mjs` — which seeds a mid-flight plan for the DAG view
 * to render — this one seeds a plan that is ready to actually execute: two waves
 * of one task each, everything `pending`, pointed at a repo the session runner
 * can resolve.
 *
 * Two waves rather than one is the whole point. One wave proves dispatch; two
 * prove the part that had never run — the graph suspending after wave 0,
 * being resumed by a completion callback, and advancing to wave 1 on its own.
 *
 * Usage:
 *   node scripts/seed-conductor-run.mjs <repo> [taskA] [taskB]
 */
import Database from 'better-sqlite3';
import { resolve } from 'node:path';

const DB = process.env.DEVPILOT_SQLITE_PATH || resolve(process.cwd(), '.devpilot/data.db');
const db = new Database(DB);

const repo = process.argv[2] ?? 'neurograph/core';
const taskA = process.argv[3] ?? 'Add a CONTRIBUTING.md with a short setup section';
const taskB = process.argv[4] ?? 'Add a LICENSE file (MIT, 2026 Open Conjecture)';

const id = (p) => `${p}_${Math.random().toString(36).slice(2, 10)}`;
const now = Math.floor(Date.now() / 1000);

const itemId = id('item');
const planId = id('plan');
const wavePlanId = id('wp');

db.exec('BEGIN');
try {
  db.prepare(
    `INSERT INTO horizon_items (id, title, zone, repo, complexity, priority, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?)`
  ).run(itemId, 'Conductor agent live run', 'READY', repo, 'S', 0, now, now);

  // confidence_signals and fleet_context_snapshot are NOT NULL with no default.
  db.prepare(
    `INSERT INTO plans (id, horizon_item_id, version, estimated_cost_usd, baseline_cost_usd,
       acceptance_criteria, confidence_signals, fleet_context_snapshot, generated_at)
     VALUES (?,?,?,?,?,?,?,?,?)`
  ).run(
    planId, itemId, 1, 0, 0,
    JSON.stringify(['Both files exist']),
    JSON.stringify({}),
    JSON.stringify({}),
    now
  );

  db.prepare(
    `INSERT INTO wave_plans (id, plan_id, horizon_item_id, total_waves, total_tasks,
       max_parallelism, critical_path, critical_path_length, parallelization_score,
       status, current_wave_index, version, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  ).run(
    wavePlanId, planId, itemId, 2, 2, 1,
    JSON.stringify(['1.1', '2.1']), 2, 1.0,
    // 'approved', not 'executing': the graph is what moves it to executing.
    'approved', 0, 1, now, now
  );

  const specs = [
    { i: 0, code: '1.1', label: taskA },
    { i: 1, code: '2.1', label: taskB },
  ];

  for (const s of specs) {
    const waveId = id('wave');
    db.prepare(
      `INSERT INTO waves (id, wave_plan_id, wave_index, label, max_parallel_tasks, status)
       VALUES (?,?,?,?,?,?)`
    ).run(waveId, wavePlanId, s.i, `Wave ${s.i + 1}`, 1, 'pending');

    db.prepare(
      `INSERT INTO wave_tasks (id, wave_id, wave_plan_id, wave_index, task_code, label,
         description, file_paths, dependencies, complexity, is_on_critical_path,
         can_run_in_parallel, status, retry_count)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    ).run(
      id('wt'), waveId, wavePlanId, s.i, s.code, s.label,
      s.label, JSON.stringify([]),
      JSON.stringify(s.i === 0 ? [] : ['1.1']),
      'S', 1, 0, 'pending', 0
    );
  }

  db.exec('COMMIT');
} catch (error) {
  db.exec('ROLLBACK');
  throw error;
}

// The `plan` the conductor route adopts. Only `waves` is load-bearing — the
// graph reads its length to know when it has run out of waves.
const plan = {
  waves: [
    { waveNumber: 0, tasks: [{ taskCode: '1.1' }] },
    { waveNumber: 1, tasks: [{ taskCode: '2.1' }] },
  ],
  dependencyEdges: [{ from: '1.1', to: '2.1' }],
};

console.log(JSON.stringify({ itemId, wavePlanId, repo, plan }, null, 2));
