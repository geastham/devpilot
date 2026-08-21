import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { relations } from 'drizzle-orm';
import { createId } from '@paralleldrive/cuid2';
import { sessionStatusValues, modelValues, orchestratorModeValues } from './enums';

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
  // External orchestrator tracking
  externalSessionId: text('external_session_id'),
  orchestratorMode: text('orchestrator_mode', { enum: orchestratorModeValues }),
  tokensUsed: integer('tokens_used'),
  costUsd: integer('cost_usd'),
  /**
   * What the agent is doing right now, as reported by the session runner.
   *
   * The fleet used to know only that a session existed and a percentage that
   * was a timer in disguise. This carries the live picture — tool calls, files
   * touched, cost so far, idle time — so the cockpit can show an instrument
   * instead of a placebo. JSON because the shape belongs to the runner and the
   * cockpit only renders it.
   */
  telemetry: text('telemetry', { mode: 'json' }).$type<{
    toolCalls?: number;
    filesTouched?: string[];
    filesRead?: string[];
    commands?: string[];
    lastText?: string;
    lastAction?: { tool: string; path?: string; atMs: number };
    actions?: { tool: string; path?: string; atMs: number }[];
    costUsd?: number;
    tokensIn?: number;
    tokensOut?: number;
    turns?: number;
    elapsedMs?: number;
    idleMs?: number;
  }>(),
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
