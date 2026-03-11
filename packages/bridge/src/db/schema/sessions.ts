import { pgTable, text, timestamp, integer, jsonb, real } from 'drizzle-orm/pg-core';
import { createId } from '@paralleldrive/cuid2';
import { orchestrators } from './orchestrators';
import { workspaces } from './workspaces';

// Dispatch sessions tracked across cloud and local
export const dispatchSessions = pgTable('dispatch_sessions', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id),
  orchestratorId: text('orchestrator_id').references(() => orchestrators.id),
  linearIssueId: text('linear_issue_id').notNull(),
  linearIdentifier: text('linear_identifier').notNull(),
  title: text('title').notNull(),
  repo: text('repo').notNull(),
  status: text('status', {
    enum: ['pending', 'dispatched', 'running', 'complete', 'error', 'cancelled']
  }).notNull().default('pending'),
  progressPercent: integer('progress_percent').notNull().default(0),
  prUrl: text('pr_url'),
  tokensUsed: integer('tokens_used'),
  costUsd: real('cost_usd'),
  summary: text('summary'),
  errorMessage: text('error_message'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),
  dispatchedAt: timestamp('dispatched_at'),
  completedAt: timestamp('completed_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// Event log for analytics and debugging
export const sessionEvents = pgTable('session_events', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  sessionId: text('session_id').notNull().references(() => dispatchSessions.id),
  type: text('type', {
    enum: ['created', 'dispatched', 'progress', 'complete', 'error', 'cancelled']
  }).notNull(),
  message: text('message'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export type DispatchSession = typeof dispatchSessions.$inferSelect;
export type NewDispatchSession = typeof dispatchSessions.$inferInsert;
export type SessionEvent = typeof sessionEvents.$inferSelect;
