import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
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
// Type Exports
// ============================================================================

export type ConductorScore = typeof conductorScores.$inferSelect;
export type NewConductorScore = typeof conductorScores.$inferInsert;

export type ScoreHistory = typeof scoreHistory.$inferSelect;
export type NewScoreHistory = typeof scoreHistory.$inferInsert;
