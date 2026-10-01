import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';
import { relations } from 'drizzle-orm';
import { createId } from '@paralleldrive/cuid2';

// ============================================================================
// Conductor Score
// ============================================================================

export const conductorScores = sqliteTable('conductor_scores', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  userId: text('user_id').notNull().unique(),
  total: integer('total').notNull().default(500),
  fleetUtilization: integer('fleet_utilization').notNull().default(100),
  runwayHealth: integer('runway_health').notNull().default(100),
  planAccuracy: integer('plan_accuracy').notNull().default(100),
  costEfficiency: integer('cost_efficiency').notNull().default(100),
  velocityTrend: integer('velocity_trend').notNull().default(100),
  leaderboardRank: integer('leaderboard_rank'),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const conductorScoresRelations = relations(conductorScores, ({ many }) => ({
  history: many(scoreHistory),
}));

// ============================================================================
// Score History
// ============================================================================

export const scoreHistory = sqliteTable('score_history', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  scoreId: text('score_id').notNull(),
  total: integer('total').notNull(),
  fleetUtilization: integer('fleet_utilization').notNull(),
  runwayHealth: integer('runway_health').notNull(),
  planAccuracy: integer('plan_accuracy').notNull(),
  costEfficiency: integer('cost_efficiency').notNull(),
  velocityTrend: integer('velocity_trend').notNull(),
  recordedAt: integer('recorded_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const scoreHistoryRelations = relations(scoreHistory, ({ one }) => ({
  score: one(conductorScores, {
    fields: [scoreHistory.scoreId],
    references: [conductorScores.id],
  }),
}));

// ============================================================================
// Runway Samples
// ============================================================================

/**
 * Runway, written down as it was read.
 *
 * Runway used to exist only as the answer to a request: computed, returned and
 * forgotten. So "how consistently was work kept queued ahead of the fleet" —
 * the largest dimension of the Conductor Score — had no history to be computed
 * from, and was a stored counter instead.
 *
 * One row per reading, taken about once a minute while the cockpit is running.
 * `capacity` is the fleet's concurrent agent slots at that moment, when known:
 * recorded with the reading rather than looked up later, because the score's
 * utilization dimension is a ratio against what capacity WAS, and a setting
 * read at scoring time would silently rescale history.
 */
export const runwaySamples = sqliteTable('runway_samples', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  at: integer('at', { mode: 'timestamp_ms' }).notNull(),
  /** Hours. Real-valued: a reading of 3.75h must not round to 4 and pass the line. */
  runwayHours: real('runway_hours').notNull(),
  capacity: integer('capacity'),
});

// ============================================================================
// Score Readings
// ============================================================================

/**
 * A computed score, kept with its working.
 *
 * `result` is the whole `ScoreResult`: every dimension's value, the numbers it
 * was computed from, and why any dimension was unmeasured. That is the score's
 * provenance (TRD 16 §4.3) — a stored total nobody can derive is what the
 * counters in `conductor_scores` were.
 *
 * `total`, `measuredMax`, `complete` and `modelVersion` are copied out of it
 * only so a history can be drawn without parsing every row.
 */
export const scoreReadings = sqliteTable('score_readings', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  at: integer('at', { mode: 'timestamp_ms' }).notNull(),
  modelVersion: integer('model_version').notNull(),
  windowHours: real('window_hours').notNull(),
  total: integer('total').notNull(),
  measuredMax: integer('measured_max').notNull(),
  complete: integer('complete', { mode: 'boolean' }).notNull(),
  result: text('result', { mode: 'json' }).notNull(),
});

// ============================================================================
// Type Exports
// ============================================================================

export type ConductorScore = typeof conductorScores.$inferSelect;
export type NewConductorScore = typeof conductorScores.$inferInsert;

export type ScoreHistory = typeof scoreHistory.$inferSelect;
export type NewScoreHistory = typeof scoreHistory.$inferInsert;

export type RunwaySampleRow = typeof runwaySamples.$inferSelect;
export type NewRunwaySampleRow = typeof runwaySamples.$inferInsert;

export type ScoreReading = typeof scoreReadings.$inferSelect;
export type NewScoreReading = typeof scoreReadings.$inferInsert;
