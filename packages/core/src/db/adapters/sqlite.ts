import Database from 'better-sqlite3';
import { drizzle, BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as schema from '../schema';
import { existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';

export type SQLiteDatabase = BetterSQLite3Database<typeof schema>;

let sqliteDb: SQLiteDatabase | null = null;
let sqliteConnection: Database.Database | null = null;

// SQL statements to create all tables
const createTableStatements = `
-- Horizon Items
CREATE TABLE IF NOT EXISTS horizon_items (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  zone TEXT NOT NULL CHECK(zone IN ('READY', 'REFINING', 'SHAPING', 'DIRECTIONAL')),
  repo TEXT NOT NULL,
  complexity TEXT CHECK(complexity IN ('S', 'M', 'L', 'XL')),
  priority INTEGER NOT NULL DEFAULT 0,
  linear_ticket_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Plans
CREATE TABLE IF NOT EXISTS plans (
  id TEXT PRIMARY KEY,
  horizon_item_id TEXT NOT NULL UNIQUE REFERENCES horizon_items(id) ON DELETE CASCADE,
  version INTEGER NOT NULL DEFAULT 1,
  estimated_cost_usd REAL NOT NULL,
  baseline_cost_usd REAL NOT NULL,
  acceptance_criteria TEXT NOT NULL,
  confidence_signals TEXT NOT NULL,
  fleet_context_snapshot TEXT NOT NULL,
  memory_sessions_used TEXT DEFAULT '[]',
  previous_plan_id TEXT,
  generated_at INTEGER NOT NULL
);

-- Workstreams
CREATE TABLE IF NOT EXISTS workstreams (
  id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  repo TEXT NOT NULL,
  worker_count INTEGER NOT NULL DEFAULT 1,
  order_index INTEGER NOT NULL DEFAULT 0
);

-- Tasks
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  plan_id TEXT REFERENCES plans(id) ON DELETE CASCADE,
  workstream_id TEXT REFERENCES workstreams(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  model TEXT NOT NULL CHECK(model IN ('HAIKU', 'SONNET', 'OPUS')),
  model_override TEXT CHECK(model_override IN ('HAIKU', 'SONNET', 'OPUS')),
  complexity TEXT NOT NULL CHECK(complexity IN ('S', 'M', 'L', 'XL')),
  estimated_cost_usd REAL NOT NULL,
  file_paths TEXT NOT NULL,
  conflict_warning TEXT,
  depends_on TEXT NOT NULL DEFAULT '[]',
  order_index INTEGER NOT NULL DEFAULT 0
);

-- Touched Files
CREATE TABLE IF NOT EXISTS touched_files (
  id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  path TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'AVAILABLE' CHECK(status IN ('AVAILABLE', 'IN_FLIGHT', 'RECENTLY_MODIFIED')),
  in_flight_via TEXT
);

-- Conflicting Files
CREATE TABLE IF NOT EXISTS conflicting_files (
  id TEXT PRIMARY KEY,
  horizon_item_id TEXT NOT NULL REFERENCES horizon_items(id) ON DELETE CASCADE,
  path TEXT NOT NULL,
  blocked_by_session_id TEXT,
  blocked_by_ticket_id TEXT,
  estimated_unlock_minutes INTEGER
);

-- Fleet Sessions
CREATE TABLE IF NOT EXISTS ruflo_sessions (
  id TEXT PRIMARY KEY,
  repo TEXT NOT NULL,
  linear_ticket_id TEXT NOT NULL,
  ticket_title TEXT NOT NULL,
  current_workstream TEXT NOT NULL DEFAULT 'Main',
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE', 'NEEDS_SPEC', 'COMPLETE', 'ERROR')),
  progress_percent INTEGER NOT NULL DEFAULT 0,
  elapsed_minutes INTEGER NOT NULL DEFAULT 0,
  estimated_remaining_minutes INTEGER NOT NULL DEFAULT 30,
  in_flight_files TEXT NOT NULL DEFAULT '[]',
  pr_url TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Completed Tasks
CREATE TABLE IF NOT EXISTS completed_tasks (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES ruflo_sessions(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  model TEXT CHECK(model IN ('HAIKU', 'SONNET', 'OPUS')),
  duration_minutes INTEGER,
  completed_at INTEGER NOT NULL
);

-- In-Flight Files
CREATE TABLE IF NOT EXISTS in_flight_files (
  id TEXT PRIMARY KEY,
  path TEXT NOT NULL,
  active_session_id TEXT NOT NULL,
  linear_ticket_id TEXT NOT NULL,
  horizon_item_id TEXT,
  estimated_minutes_remaining INTEGER NOT NULL DEFAULT 30,
  locked_at INTEGER NOT NULL
);

-- Conductor Scores
CREATE TABLE IF NOT EXISTS conductor_scores (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  total INTEGER NOT NULL DEFAULT 500,
  fleet_utilization INTEGER NOT NULL DEFAULT 100,
  runway_health INTEGER NOT NULL DEFAULT 100,
  plan_accuracy INTEGER NOT NULL DEFAULT 100,
  cost_efficiency INTEGER NOT NULL DEFAULT 100,
  velocity_trend INTEGER NOT NULL DEFAULT 100,
  leaderboard_rank INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Score History
CREATE TABLE IF NOT EXISTS score_history (
  id TEXT PRIMARY KEY,
  score_id TEXT NOT NULL REFERENCES conductor_scores(id) ON DELETE CASCADE,
  total INTEGER NOT NULL,
  fleet_utilization INTEGER NOT NULL,
  runway_health INTEGER NOT NULL,
  plan_accuracy INTEGER NOT NULL,
  cost_efficiency INTEGER NOT NULL,
  velocity_trend INTEGER NOT NULL,
  recorded_at INTEGER NOT NULL
);

-- Activity Events
CREATE TABLE IF NOT EXISTS activity_events (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK(type IN ('SESSION_PROGRESS', 'SESSION_COMPLETE', 'PLAN_GENERATED', 'PLAN_APPROVED', 'ITEM_CREATED', 'ITEM_DISPATCHED', 'RUNWAY_UPDATE', 'FILE_UNLOCKED', 'SCORE_UPDATE', 'WAVE_PLAN_CREATED', 'WAVE_DISPATCHING', 'WAVE_TASK_DISPATCHED', 'WAVE_TASK_COMPLETE', 'WAVE_TASK_FAILED', 'WAVE_COMPLETE', 'WAVE_ADVANCE', 'WAVE_PLAN_COMPLETE', 'WAVE_PLAN_FAILED', 'WAVE_PLAN_REOPTIMIZING')),
  message TEXT NOT NULL,
  repo TEXT,
  ticket_id TEXT,
  metadata TEXT,
  created_at INTEGER NOT NULL
);

-- Wave Plans
CREATE TABLE IF NOT EXISTS wave_plans (
  id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  horizon_item_id TEXT NOT NULL REFERENCES horizon_items(id) ON DELETE CASCADE,
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

-- Waves
CREATE TABLE IF NOT EXISTS waves (
  id TEXT PRIMARY KEY,
  wave_plan_id TEXT NOT NULL REFERENCES wave_plans(id) ON DELETE CASCADE,
  wave_index INTEGER NOT NULL,
  label TEXT NOT NULL,
  max_parallel_tasks INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'dispatching', 'active', 'completed', 'failed', 'skipped')),
  started_at INTEGER,
  completed_at INTEGER
);

-- Wave Tasks
CREATE TABLE IF NOT EXISTS wave_tasks (
  id TEXT PRIMARY KEY,
  wave_id TEXT NOT NULL REFERENCES waves(id) ON DELETE CASCADE,
  wave_plan_id TEXT NOT NULL REFERENCES wave_plans(id) ON DELETE CASCADE,
  task_id TEXT REFERENCES tasks(id),
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
  retry_count INTEGER NOT NULL DEFAULT 0
);

-- Dependency Edges
CREATE TABLE IF NOT EXISTS dependency_edges (
  id TEXT PRIMARY KEY,
  wave_plan_id TEXT NOT NULL REFERENCES wave_plans(id) ON DELETE CASCADE,
  from_task_code TEXT NOT NULL,
  to_task_code TEXT NOT NULL,
  edge_type TEXT NOT NULL DEFAULT 'hard' CHECK(edge_type IN ('hard', 'soft'))
);

-- Wave Plan Metrics
CREATE TABLE IF NOT EXISTS wave_plan_metrics (
  id TEXT PRIMARY KEY,
  wave_plan_id TEXT NOT NULL UNIQUE REFERENCES wave_plans(id) ON DELETE CASCADE,
  total_wall_clock_ms INTEGER,
  theoretical_min_ms INTEGER,
  parallelization_efficiency REAL,
  waves_executed INTEGER NOT NULL DEFAULT 0,
  tasks_completed INTEGER NOT NULL DEFAULT 0,
  tasks_failed INTEGER NOT NULL DEFAULT 0,
  tasks_retried INTEGER NOT NULL DEFAULT 0,
  avg_task_duration_ms INTEGER,
  max_wave_wait_ms INTEGER,
  file_conflicts_avoided INTEGER NOT NULL DEFAULT 0,
  re_optimization_count INTEGER NOT NULL DEFAULT 0,
  recorded_at INTEGER NOT NULL
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_horizon_items_zone ON horizon_items(zone);
CREATE INDEX IF NOT EXISTS idx_horizon_items_repo ON horizon_items(repo);
CREATE INDEX IF NOT EXISTS idx_ruflo_sessions_status ON ruflo_sessions(status);
CREATE INDEX IF NOT EXISTS idx_ruflo_sessions_repo ON ruflo_sessions(repo);
CREATE INDEX IF NOT EXISTS idx_activity_events_type ON activity_events(type);
CREATE INDEX IF NOT EXISTS idx_activity_events_created_at ON activity_events(created_at);
CREATE INDEX IF NOT EXISTS idx_wave_plans_plan_id ON wave_plans(plan_id);
CREATE INDEX IF NOT EXISTS idx_wave_plans_horizon_item_id ON wave_plans(horizon_item_id);
CREATE INDEX IF NOT EXISTS idx_wave_plans_status ON wave_plans(status);
CREATE INDEX IF NOT EXISTS idx_waves_wave_plan_id ON waves(wave_plan_id);
CREATE INDEX IF NOT EXISTS idx_waves_status ON waves(status);
CREATE INDEX IF NOT EXISTS idx_wave_tasks_wave_id ON wave_tasks(wave_id);
CREATE INDEX IF NOT EXISTS idx_wave_tasks_wave_plan_id ON wave_tasks(wave_plan_id);
CREATE INDEX IF NOT EXISTS idx_wave_tasks_status ON wave_tasks(status);
CREATE INDEX IF NOT EXISTS idx_wave_tasks_task_code ON wave_tasks(task_code);
CREATE INDEX IF NOT EXISTS idx_dependency_edges_wave_plan_id ON dependency_edges(wave_plan_id);
`;

export function createSQLiteAdapter(path: string): SQLiteDatabase {
  if (sqliteDb) {
    return sqliteDb;
  }

  // Ensure directory exists
  const dir = dirname(path);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  // Create SQLite connection
  sqliteConnection = new Database(path);

  // Enable WAL mode for better concurrent access
  sqliteConnection.pragma('journal_mode = WAL');

  // Create tables if they don't exist
  sqliteConnection.exec(createTableStatements);

  // Create Drizzle instance
  sqliteDb = drizzle(sqliteConnection, { schema });

  return sqliteDb;
}

export function closeSQLiteConnection(): void {
  if (sqliteConnection) {
    sqliteConnection.close();
    sqliteConnection = null;
    sqliteDb = null;
  }
}

export function getSQLiteConnection(): Database.Database | null {
  return sqliteConnection;
}
