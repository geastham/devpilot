import { pgTable, text, timestamp, integer, jsonb, boolean } from 'drizzle-orm/pg-core';
import { createId } from '@paralleldrive/cuid2';

// Registered local orchestrator instances
export const orchestrators = pgTable('orchestrators', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  name: text('name').notNull(),
  apiKeyHash: text('api_key_hash').notNull(),
  repos: jsonb('repos').$type<string[]>().notNull().default([]),
  maxConcurrentJobs: integer('max_concurrent_jobs').notNull().default(4),
  activeJobs: integer('active_jobs').notNull().default(0),
  isOnline: boolean('is_online').notNull().default(false),
  lastHeartbeat: timestamp('last_heartbeat'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// Repo to orchestrator routing
export const repoRoutes = pgTable('repo_routes', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  repo: text('repo').notNull().unique(),
  orchestratorId: text('orchestrator_id').notNull().references(() => orchestrators.id),
  priority: integer('priority').notNull().default(0),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// API keys for orchestrator authentication
export const apiKeys = pgTable('api_keys', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  keyHash: text('key_hash').notNull().unique(),
  orchestratorId: text('orchestrator_id').references(() => orchestrators.id),
  name: text('name').notNull(),
  scopes: jsonb('scopes').$type<string[]>().default(['dispatch']),
  expiresAt: timestamp('expires_at'),
  lastUsedAt: timestamp('last_used_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export type Orchestrator = typeof orchestrators.$inferSelect;
export type NewOrchestrator = typeof orchestrators.$inferInsert;
export type RepoRoute = typeof repoRoutes.$inferSelect;
export type ApiKey = typeof apiKeys.$inferSelect;
