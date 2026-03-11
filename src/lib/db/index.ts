/**
 * Database client wrapper using Drizzle ORM from @devpilot.sh/core
 *
 * This replaces the Prisma client with Drizzle ORM for SQLite support.
 * The API routes should use this client for all database operations.
 */

import { getDatabase, initDatabase, resetDatabase } from '@devpilot.sh/core/db';
import { eq, desc, asc, and, or, gt, lt, gte, lte, inArray, sql } from 'drizzle-orm';
import * as schema from '@devpilot.sh/core/db';

// Initialize database on first import (for Next.js)
const globalForDb = globalThis as unknown as {
  dbInitialized: boolean;
};

if (!globalForDb.dbInitialized) {
  // Use SQLite for local development, path from env or default
  const dbPath = process.env.DEVPILOT_SQLITE_PATH || '.devpilot/data.db';
  initDatabase({ type: 'sqlite', sqlitePath: dbPath });
  globalForDb.dbInitialized = true;
}

// Get the database instance
export const db = getDatabase();

// Re-export schema tables for direct access
export const {
  // Horizon tables
  horizonItems,
  plans,
  workstreams,
  tasks,
  touchedFiles,
  inFlightFiles,
  // Fleet tables
  rufloSessions,
  completedTasks,
  // Score tables
  conductorScores,
  scoreHistory,
  // Event tables
  activityEvents,
} = schema;

// Re-export enums for API routes
export {
  zoneValues,
  complexityValues,
  modelValues,
  sessionStatusValues,
  taskStatusValues,
  fileStatusValues,
  eventTypeValues,
} from '@devpilot.sh/core/db';

// Re-export types
export type {
  Zone,
  Complexity,
  Model,
  SessionStatus,
  TaskStatus,
  FileStatus,
  EventType,
  HorizonItem,
  NewHorizonItem,
  Plan,
  NewPlan,
  Workstream,
  NewWorkstream,
  Task,
  NewTask,
  TouchedFile,
  NewTouchedFile,
  InFlightFile,
  NewInFlightFile,
  RufloSession,
  NewRufloSession,
  CompletedTask,
  NewCompletedTask,
  ConductorScore,
  NewConductorScore,
  ScoreHistory,
  NewScoreHistory,
  ActivityEvent,
  NewActivityEvent,
} from '@devpilot.sh/core/db';

// Re-export query operators for building queries
export { eq, desc, asc, and, or, gt, lt, gte, lte, inArray, sql };

// Export utilities
export { initDatabase, resetDatabase };

// Default export for simple imports
export default db;
