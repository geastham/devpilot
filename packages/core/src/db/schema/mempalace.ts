import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { relations } from 'drizzle-orm';
import { createId } from '@paralleldrive/cuid2';

// ============================================================================
// MemPalace — Local Shim Storage
// ============================================================================
//
// These tables back the "LocalShim" MemPalaceClient — a self-contained
// fallback that provides the MemPalace API surface without requiring the
// external MemPalace MCP server to be installed. When the real MCP server
// is configured, these tables are unused (the McpAdapter routes all calls
// to the external service instead).
//
// Data model follows the MemPalace "method of loci" metaphor:
//   Wings   → top-level groupings (per project or persona)
//   Rooms   → topic-specific storage within a wing
//   Drawers → verbatim original content, never summarized
//   Closets → compressed summaries that point back to drawers
//   Halls   → typed relationships between rooms in the same wing
//   Tunnels → cross-wing references
//   KG      → temporal entity-relationship triples with validity windows
// ============================================================================

/**
 * Wings — top-level memory groupings.
 * Typically one wing per project/repo, plus optional persona wings.
 */
export const palaceWings = sqliteTable('palace_wings', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  /** Wing slug, e.g. "devpilot-core" or "persona-architect" */
  slug: text('slug').notNull().unique(),
  /** Human-readable wing name */
  name: text('name').notNull(),
  /** Wing type: project | persona | scratch */
  wingType: text('wing_type').notNull().default('project'),
  /** Repository this wing is bound to, if any */
  repo: text('repo'),
  /** Free-form description */
  description: text('description'),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
});

/**
 * Rooms — topic-specific storage within a wing.
 * Rooms are the primary retrieval unit for L2 (on-demand room recall).
 */
export const palaceRooms = sqliteTable(
  'palace_rooms',
  {
    id: text('id').primaryKey().$defaultFn(() => createId()),
    wingId: text('wing_id')
      .notNull()
      .references(() => palaceWings.id, { onDelete: 'cascade' }),
    /** Room slug, unique within a wing, e.g. "auth-flow" */
    slug: text('slug').notNull(),
    /** Human-readable room name */
    name: text('name').notNull(),
    /** Topic label for routing retrieval */
    topic: text('topic').notNull(),
    /** Free-form description of what belongs in this room */
    description: text('description'),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => ({
    wingSlugIdx: index('palace_rooms_wing_slug_idx').on(table.wingId, table.slug),
  })
);

/**
 * Drawers — verbatim original content.
 * Drawers are immutable once written; they're the canonical source of truth.
 */
export const palaceDrawers = sqliteTable(
  'palace_drawers',
  {
    id: text('id').primaryKey().$defaultFn(() => createId()),
    roomId: text('room_id')
      .notNull()
      .references(() => palaceRooms.id, { onDelete: 'cascade' }),
    /** Memory type: fact | event | discovery | preference | advice | decision */
    memoryType: text('memory_type').notNull().default('fact'),
    /** Short label for the drawer */
    label: text('label').notNull(),
    /** Verbatim content — never summarized */
    content: text('content').notNull(),
    /** Optional AAAK-compressed form (populated when the MCP server is used) */
    aaakContent: text('aaak_content'),
    /** SHA256 of content for deduplication */
    contentHash: text('content_hash').notNull(),
    /** Source provenance — e.g. wiki article slug, session id, commit sha */
    sourceKind: text('source_kind'),
    sourceRef: text('source_ref'),
    /** Free-form tags for filtering */
    tags: text('tags', { mode: 'json' }).$type<string[]>().default([]),
    /** Rough salience score 0-1 controlling L0/L1 eligibility */
    salience: integer('salience').notNull().default(0),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => ({
    hashIdx: index('palace_drawers_hash_idx').on(table.contentHash),
    roomIdx: index('palace_drawers_room_idx').on(table.roomId),
  })
);

/**
 * Closets — compressed summaries that point back to drawers.
 * Closets are what gets loaded into prompts; drawers are only cited for deep dives.
 */
export const palaceClosets = sqliteTable(
  'palace_closets',
  {
    id: text('id').primaryKey().$defaultFn(() => createId()),
    roomId: text('room_id')
      .notNull()
      .references(() => palaceRooms.id, { onDelete: 'cascade' }),
    /** Compressed summary (AAAK-dialect or plain) */
    summary: text('summary').notNull(),
    /** Which drawers this closet summarizes */
    drawerIds: text('drawer_ids', { mode: 'json' }).$type<string[]>().default([]),
    /** Tier — 0 (identity), 1 (critical), 2 (room), 3 (deep) */
    tier: integer('tier').notNull().default(2),
    /** Approximate token cost when injected */
    tokenCost: integer('token_cost').notNull().default(0),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => ({
    tierIdx: index('palace_closets_tier_idx').on(table.tier),
  })
);

/**
 * Halls — typed relationships between rooms in the same wing.
 * Used for in-wing navigation and backlink expansion.
 */
export const palaceHalls = sqliteTable('palace_halls', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  wingId: text('wing_id')
    .notNull()
    .references(() => palaceWings.id, { onDelete: 'cascade' }),
  fromRoomId: text('from_room_id')
    .notNull()
    .references(() => palaceRooms.id, { onDelete: 'cascade' }),
  toRoomId: text('to_room_id')
    .notNull()
    .references(() => palaceRooms.id, { onDelete: 'cascade' }),
  /** Relationship type: depends_on | related_to | supersedes | contradicts */
  relation: text('relation').notNull().default('related_to'),
  weight: integer('weight').notNull().default(1),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
});

/**
 * Tunnels — cross-wing references.
 * Used when a concept in one wing relates to a concept in another.
 */
export const palaceTunnels = sqliteTable('palace_tunnels', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  fromRoomId: text('from_room_id')
    .notNull()
    .references(() => palaceRooms.id, { onDelete: 'cascade' }),
  toRoomId: text('to_room_id')
    .notNull()
    .references(() => palaceRooms.id, { onDelete: 'cascade' }),
  reason: text('reason'),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
});

/**
 * Knowledge Graph triples with temporal validity windows.
 * Facts can be auto-invalidated when contradicting facts arrive.
 */
export const palaceKgTriples = sqliteTable(
  'palace_kg_triples',
  {
    id: text('id').primaryKey().$defaultFn(() => createId()),
    wingId: text('wing_id')
      .notNull()
      .references(() => palaceWings.id, { onDelete: 'cascade' }),
    subject: text('subject').notNull(),
    predicate: text('predicate').notNull(),
    object: text('object').notNull(),
    /** Validity window start — when this fact became true */
    validFrom: integer('valid_from', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
    /** Validity window end — null if still valid */
    validUntil: integer('valid_until', { mode: 'timestamp' }),
    /** Source drawer that asserted this fact */
    sourceDrawerId: text('source_drawer_id'),
    /** Confidence 0-100 */
    confidence: integer('confidence').notNull().default(100),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => ({
    spIdx: index('palace_kg_sp_idx').on(table.subject, table.predicate),
    wingIdx: index('palace_kg_wing_idx').on(table.wingId),
  })
);

/**
 * Agent diary — scratch memory per agent/persona.
 * Lower priority than drawers; typically not loaded unless queried.
 */
export const palaceDiary = sqliteTable('palace_diary', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  wingId: text('wing_id')
    .notNull()
    .references(() => palaceWings.id, { onDelete: 'cascade' }),
  agentId: text('agent_id').notNull(),
  entry: text('entry').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ============================================================================
// Relations
// ============================================================================

export const palaceWingsRelations = relations(palaceWings, ({ many }) => ({
  rooms: many(palaceRooms),
  halls: many(palaceHalls),
  kgTriples: many(palaceKgTriples),
}));

export const palaceRoomsRelations = relations(palaceRooms, ({ one, many }) => ({
  wing: one(palaceWings, {
    fields: [palaceRooms.wingId],
    references: [palaceWings.id],
  }),
  drawers: many(palaceDrawers),
  closets: many(palaceClosets),
}));

export const palaceDrawersRelations = relations(palaceDrawers, ({ one }) => ({
  room: one(palaceRooms, {
    fields: [palaceDrawers.roomId],
    references: [palaceRooms.id],
  }),
}));

export const palaceClosetsRelations = relations(palaceClosets, ({ one }) => ({
  room: one(palaceRooms, {
    fields: [palaceClosets.roomId],
    references: [palaceRooms.id],
  }),
}));
