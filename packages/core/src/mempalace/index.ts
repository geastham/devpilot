// MemPalace — structured, temporal, hierarchical memory layer.
//
// Augments (but does not replace) the Wiki system. The Wiki continues to
// own the `/wiki` folder, markdown compilation, backlink generation, and
// human-readable documentation. MemPalace provides:
//
//   - Spatially-organized memory (Wings → Rooms → Drawers/Closets)
//   - Tiered L0-L3 loading stack for prompt-time context
//   - Temporal knowledge graph with automatic fact invalidation
//   - Pluggable backend (LocalShim or external MemPalace MCP server)
//
// Entry points:
//   - createMemPalaceService() — construct the service with config
//   - DualFeedSessionHook        — drop-in replacement for WikiSessionHook
//                                  that keeps Wiki intact and mirrors into
//                                  MemPalace
//   - createWikiPalaceBridge()   — explicit bridge for backfill and custom
//                                  flows

export * from './types';
export {
  LocalShimClient,
  McpAdapterClient,
  DisabledClient,
  createMemPalaceClient,
  estimateTokens,
} from './client';
export type { MemPalaceClient, McpTransport } from './client';
export { MemPalaceService, createMemPalaceService } from './service';
export { WikiPalaceBridge, createWikiPalaceBridge } from './wiki-bridge';
export type { WikiBridgeConfig } from './wiki-bridge';
export { DualFeedSessionHook } from './session-hook';
export type { DualFeedHookConfig } from './session-hook';

export { GraphitiClient, type GraphitiConfig } from './graphiti-client';
