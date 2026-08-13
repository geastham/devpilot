// ============================================================================
// MemPalace Types
// ============================================================================
//
// Type definitions for the MemPalace integration — a structured, temporal,
// hierarchical memory layer that augments (but does not replace) the Wiki.
//
// The Wiki continues to own the `/wiki` folder, markdown compilation,
// backlink generation, and human-readable documentation. MemPalace provides
// structured retrieval, tiered prompt loading (L0-L3), and a temporal
// knowledge graph for fact invalidation — all feeding prompts with minimal
// token cost.
// ============================================================================

/** Memory tier for the L0-L3 loading stack. */
export type MemoryTier = 0 | 1 | 2 | 3;

/** Type of memory captured in a drawer. */
export type MemoryType =
  | 'fact'
  | 'event'
  | 'discovery'
  | 'preference'
  | 'advice'
  | 'decision';

/** Type of wing — projects are primary, personas are optional. */
export type WingType = 'project' | 'persona' | 'scratch';

/** Hall relationship types between rooms in the same wing. */
export type HallRelation =
  | 'depends_on'
  | 'related_to'
  | 'supersedes'
  | 'contradicts';

/** Source of a drawer — provenance tracking. */
export interface DrawerSource {
  /** e.g. "wiki_article", "session_log", "commit", "spec", "manual" */
  kind: string;
  /** e.g. wiki slug, session id, commit sha */
  ref: string;
}

/** A wing — top-level memory grouping. */
export interface Wing {
  id: string;
  slug: string;
  name: string;
  wingType: WingType;
  repo?: string;
  description?: string;
}

/** A room — topic-specific storage within a wing. */
export interface Room {
  id: string;
  wingId: string;
  slug: string;
  name: string;
  topic: string;
  description?: string;
}

/** A drawer — verbatim original content, never summarized. */
export interface Drawer {
  id: string;
  roomId: string;
  memoryType: MemoryType;
  label: string;
  content: string;
  aaakContent?: string;
  contentHash: string;
  source?: DrawerSource;
  tags: string[];
  salience: number;
  createdAt: Date;
}

/** A closet — compressed summary pointing back to drawers. */
export interface Closet {
  id: string;
  roomId: string;
  summary: string;
  drawerIds: string[];
  tier: MemoryTier;
  tokenCost: number;
}

/** A hall — typed relationship between rooms. */
export interface Hall {
  id: string;
  wingId: string;
  fromRoomId: string;
  toRoomId: string;
  relation: HallRelation;
  weight: number;
}

/** A tunnel — cross-wing reference. */
export interface Tunnel {
  id: string;
  fromRoomId: string;
  toRoomId: string;
  reason?: string;
}

/** A knowledge graph triple with temporal validity. */
export interface KgTriple {
  id: string;
  wingId: string;
  subject: string;
  predicate: string;
  object: string;
  validFrom: Date;
  validUntil?: Date;
  sourceDrawerId?: string;
  confidence: number;
}

// ============================================================================
// API request/response types
// ============================================================================

export interface AddDrawerInput {
  wingSlug: string;
  roomSlug: string;
  /** Room is auto-created if it doesn't exist */
  roomName?: string;
  roomTopic?: string;
  memoryType: MemoryType;
  label: string;
  content: string;
  aaakContent?: string;
  source?: DrawerSource;
  tags?: string[];
  salience?: number;
}

export interface AddDrawerResult {
  drawerId: string;
  created: boolean;
  roomId: string;
  wingId: string;
}

export interface SearchInput {
  wingSlug?: string;
  query: string;
  topic?: string;
  memoryTypes?: MemoryType[];
  limit?: number;
}

export interface SearchHit {
  drawerId: string;
  roomSlug: string;
  wingSlug: string;
  label: string;
  snippet: string;
  score: number;
  memoryType: MemoryType;
  source?: DrawerSource;
}

export interface SearchResult {
  hits: SearchHit[];
  totalScanned: number;
}

export interface KgAddInput {
  wingSlug: string;
  subject: string;
  predicate: string;
  object: string;
  validFrom?: Date;
  sourceDrawerId?: string;
  confidence?: number;
}

export interface KgQueryInput {
  wingSlug: string;
  subject?: string;
  predicate?: string;
  object?: string;
  /** If true, only return triples currently valid */
  currentOnly?: boolean;
}

export interface KgInvalidateInput {
  wingSlug: string;
  subject: string;
  predicate: string;
  reason?: string;
}

export interface KgContradiction {
  subject: string;
  predicate: string;
  oldObject: string;
  newObject: string;
  oldDrawerId?: string;
  newDrawerId?: string;
  detectedAt: Date;
}

export interface WakeUpInput {
  wingSlug: string;
  /** Optional topic hint to bias which critical facts get loaded */
  topic?: string;
}

/** L0 + L1 context — always loaded, ~170 tokens. */
export interface WakeUpResult {
  /** L0 — identity, ~50 tokens */
  identity: string;
  /** L1 — critical facts, ~120 tokens */
  criticalFacts: string[];
  tokenEstimate: number;
}

export interface RecallInput {
  wingSlug: string;
  topic: string;
  limit?: number;
}

/** L2 — on-demand topical recall. */
export interface RecallResult {
  topic: string;
  closets: Closet[];
  tokenEstimate: number;
}

// ============================================================================
// Client configuration
// ============================================================================

/** MemPalace client mode. */
export type MemPalaceMode = 'local' | 'falkor-lite' | 'mcp' | 'graphiti' | 'disabled';

export interface MemPalaceConfig {
  /** Active mode. "local" uses the SQLite shim, "mcp" uses an external MemPalace MCP server, "disabled" is a no-op. */
  mode: MemPalaceMode;
  /** Default wing slug — usually the repo identifier */
  defaultWingSlug: string;
  /** Default wing human name */
  defaultWingName?: string;
  /** Optional MCP endpoint (e.g. local Unix socket or HTTP) when mode=mcp */
  mcpEndpoint?: string;
  /** Bearer token for a Graphiti server behind auth (hosted tier). */
  mcpApiKey?: string;
  /** Snapshot directory for mode=falkor-lite. Omit for ephemeral. */
  dataDir?: string;
  /**
   * Graphiti write path. `deterministic` uses add_triplet and needs no LLM key
   * on the server; `llm` uses add_memory and does. Defaults to deterministic —
   * memory must not fail closed when no key is configured (TRD 18 §4).
   */
  graphitiExtraction?: 'deterministic' | 'llm';
  /** Repository this palace is bound to */
  repo?: string;
}

// ============================================================================
// Prompt context block
// ============================================================================

/**
 * Rendered MemPalace context for injection into wave planner prompts.
 * This replaces/augments the flat `MemoryContextBlock.relevantSessions`
 * with a tiered L0-L3 loading stack.
 */
export interface PalaceContextBlock {
  /** L0 — identity string, always loaded */
  identity: string;
  /** L1 — critical facts, always loaded */
  criticalFacts: string[];
  /** L2 — topical closets, loaded on topic match */
  topicalClosets: {
    topic: string;
    summary: string;
    citations: string[];
  }[];
  /** Approximate token cost of this block */
  tokenEstimate: number;
  /** Wing the context was drawn from */
  wingSlug: string;
}
