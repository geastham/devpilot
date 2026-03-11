import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { createId } from '@paralleldrive/cuid2';
import { eventTypeValues } from './enums';

// ============================================================================
// Activity Events
// ============================================================================

export const activityEvents = sqliteTable('activity_events', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  type: text('type', { enum: eventTypeValues }).notNull(),
  message: text('message').notNull(),
  repo: text('repo'),
  ticketId: text('ticket_id'),
  metadata: text('metadata', { mode: 'json' }).$type<Record<string, unknown>>(),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ============================================================================
// Type Exports
// ============================================================================

export type ActivityEvent = typeof activityEvents.$inferSelect;
export type NewActivityEvent = typeof activityEvents.$inferInsert;
