import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { relations } from 'drizzle-orm';
import { createId } from '@paralleldrive/cuid2';
import { sessionStatusValues, modelValues } from './enums';

// ============================================================================
// Ruflo Sessions
// ============================================================================

export const rufloSessions = sqliteTable('ruflo_sessions', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  repo: text('repo').notNull(),
  linearTicketId: text('linear_ticket_id').notNull(),
  ticketTitle: text('ticket_title').notNull(),
  currentWorkstream: text('current_workstream').notNull().default('Main'),
  progressPercent: integer('progress_percent').notNull().default(0),
  elapsedMinutes: integer('elapsed_minutes').notNull().default(0),
  estimatedRemainingMinutes: integer('estimated_remaining_minutes').notNull().default(30),
  status: text('status', { enum: sessionStatusValues }).notNull().default('ACTIVE'),
  inFlightFiles: text('in_flight_files', { mode: 'json' }).$type<string[]>().default([]),
  prUrl: text('pr_url'),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const rufloSessionsRelations = relations(rufloSessions, ({ many }) => ({
  completedTasks: many(completedTasks),
}));

// ============================================================================
// Completed Tasks
// ============================================================================

export const completedTasks = sqliteTable('completed_tasks', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  sessionId: text('session_id').notNull(),
  label: text('label').notNull(),
  model: text('model', { enum: modelValues }),
  durationMinutes: integer('duration_minutes'),
  completedAt: integer('completed_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const completedTasksRelations = relations(completedTasks, ({ one }) => ({
  session: one(rufloSessions, {
    fields: [completedTasks.sessionId],
    references: [rufloSessions.id],
  }),
}));

// ============================================================================
// Type Exports
// ============================================================================

export type RufloSession = typeof rufloSessions.$inferSelect;
export type NewRufloSession = typeof rufloSessions.$inferInsert;

export type CompletedTask = typeof completedTasks.$inferSelect;
export type NewCompletedTask = typeof completedTasks.$inferInsert;
