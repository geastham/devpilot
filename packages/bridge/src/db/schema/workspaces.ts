import { pgTable, text, timestamp, jsonb, boolean } from 'drizzle-orm/pg-core';
import { createId } from '@paralleldrive/cuid2';

// Linear workspace configuration
export const workspaces = pgTable('workspaces', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  linearOrgId: text('linear_org_id').notNull().unique(),
  linearOrgName: text('linear_org_name').notNull(),
  botUserId: text('bot_user_id').notNull(),
  webhookSecret: text('webhook_secret').notNull(),
  apiKeyEncrypted: text('api_key_encrypted'),
  isActive: boolean('is_active').notNull().default(true),
  settings: jsonb('settings').$type<{
    autoDispatch: boolean;
    defaultLabels?: string[];
    excludeLabels?: string[];
  }>().default({ autoDispatch: true }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// Per-team configuration within a workspace
export const teamConfigs = pgTable('team_configs', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id),
  linearTeamId: text('linear_team_id').notNull(),
  linearTeamName: text('linear_team_name').notNull(),
  autoDispatchEnabled: boolean('auto_dispatch_enabled').notNull().default(true),
  defaultRepo: text('default_repo'),
  dispatchLabels: jsonb('dispatch_labels').$type<string[]>().default([]),
  excludeLabels: jsonb('exclude_labels').$type<string[]>().default([]),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export type Workspace = typeof workspaces.$inferSelect;
export type NewWorkspace = typeof workspaces.$inferInsert;
export type TeamConfig = typeof teamConfigs.$inferSelect;
export type NewTeamConfig = typeof teamConfigs.$inferInsert;
