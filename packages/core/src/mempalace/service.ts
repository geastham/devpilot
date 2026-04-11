import { createMemPalaceClient, estimateTokens } from './client';
import type { MemPalaceClient, McpTransport } from './client';
import type {
  AddDrawerInput,
  MemPalaceConfig,
  PalaceContextBlock,
  SearchHit,
} from './types';

// ============================================================================
// MemPalaceService — high-level API for prompt context assembly
// ============================================================================

/**
 * MemPalaceService is the primary entry point for callers who want to use
 * MemPalace without worrying about which backend is active. It:
 *
 *   1. Holds a single MemPalaceClient (local, mcp, or disabled)
 *   2. Assembles PalaceContextBlocks for wave planner prompts
 *   3. Coordinates ingestion from sources (wiki, session logs, commits)
 *
 * It does NOT own:
 *   - The Wiki system (that keeps its own compiler, its own /wiki folder,
 *     its own backlink maintenance). The service only *reads* from the
 *     wiki and *writes* drawer copies into MemPalace.
 *   - Session capture (the session hook owns that and delegates to both
 *     the Wiki compiler and this service).
 *
 * The Wiki remains the canonical human-readable documentation layer.
 * MemPalace remains the canonical structured-retrieval / prompt-injection
 * layer. They are complementary.
 */
export class MemPalaceService {
  readonly client: MemPalaceClient;
  private config: MemPalaceConfig;

  constructor(config: MemPalaceConfig, mcpTransport?: McpTransport) {
    this.config = config;
    this.client = createMemPalaceClient(config, mcpTransport);
  }

  get enabled(): boolean {
    return this.client.mode !== 'disabled';
  }

  // --------------------------------------------------------------------------
  // Prompt context assembly (L0-L3 stack)
  // --------------------------------------------------------------------------

  /**
   * Assemble a PalaceContextBlock for injection into wave planner prompts.
   *
   * - L0 (always): identity
   * - L1 (always): critical facts
   * - L2 (on-demand): topical recall for hints derived from the task
   * - L3 (deep search): only triggered by explicit queries elsewhere
   *
   * Returns null if the service is disabled or has no content to inject.
   */
  async assemblePromptContext(options: {
    wingSlug?: string;
    topicHints?: string[];
    maxTokens?: number;
  }): Promise<PalaceContextBlock | null> {
    if (!this.enabled) return null;

    const wingSlug = options.wingSlug ?? this.config.defaultWingSlug;
    const maxTokens = options.maxTokens ?? 2000;

    // L0 + L1
    const wakeUp = await this.client.wakeUp({ wingSlug });

    // L2 — topical recall for each hint, skipping duplicates.
    const topicalClosets: PalaceContextBlock['topicalClosets'] = [];
    let totalTokens = wakeUp.tokenEstimate;

    for (const topic of options.topicHints ?? []) {
      if (totalTokens >= maxTokens) break;
      const recall = await this.client.recall({
        wingSlug,
        topic,
        limit: 3,
      });
      for (const closet of recall.closets) {
        if (totalTokens + closet.tokenCost > maxTokens) continue;
        topicalClosets.push({
          topic,
          summary: closet.summary,
          citations: closet.drawerIds,
        });
        totalTokens += closet.tokenCost;
      }
    }

    // If nothing at all was retrieved, return null so the caller can
    // fall back to the legacy MemoryContextBlock cleanly.
    if (
      !wakeUp.identity &&
      wakeUp.criticalFacts.length === 0 &&
      topicalClosets.length === 0
    ) {
      return null;
    }

    return {
      identity: wakeUp.identity,
      criticalFacts: wakeUp.criticalFacts,
      topicalClosets,
      tokenEstimate: totalTokens,
      wingSlug,
    };
  }

  // --------------------------------------------------------------------------
  // Ingestion
  // --------------------------------------------------------------------------

  /**
   * Add a drawer to MemPalace. Convenience wrapper that fills in the
   * default wing slug when callers don't specify one.
   */
  async addDrawer(
    input: Omit<AddDrawerInput, 'wingSlug'> & { wingSlug?: string }
  ): Promise<void> {
    if (!this.enabled) return;
    await this.client.addDrawer({
      ...input,
      wingSlug: input.wingSlug ?? this.config.defaultWingSlug,
    });
  }

  /**
   * Add a KG triple to the default wing. Returns any contradictions
   * detected during insertion so the caller can decide what to do.
   */
  async addFact(input: {
    subject: string;
    predicate: string;
    object: string;
    sourceDrawerId?: string;
    confidence?: number;
    wingSlug?: string;
  }) {
    if (!this.enabled) return { tripleId: '', contradictions: [] };
    return this.client.kgAdd({
      wingSlug: input.wingSlug ?? this.config.defaultWingSlug,
      subject: input.subject,
      predicate: input.predicate,
      object: input.object,
      sourceDrawerId: input.sourceDrawerId,
      confidence: input.confidence,
    });
  }

  /**
   * Convenience search across the default wing.
   */
  async quickSearch(query: string, limit = 5): Promise<SearchHit[]> {
    if (!this.enabled) return [];
    const res = await this.client.search({
      wingSlug: this.config.defaultWingSlug,
      query,
      limit,
    });
    return res.hits;
  }

  // --------------------------------------------------------------------------
  // Rendering helpers
  // --------------------------------------------------------------------------

  /**
   * Render a PalaceContextBlock as a markdown snippet suitable for
   * injecting into a prompt template.
   */
  static renderBlock(block: PalaceContextBlock | null | undefined): string {
    if (!block) return '';

    const lines: string[] = [];
    lines.push('### Palace Context (MemPalace)');
    lines.push('');

    if (block.identity) {
      lines.push('**Identity (L0):**');
      lines.push(block.identity);
      lines.push('');
    }

    if (block.criticalFacts.length > 0) {
      lines.push('**Critical Facts (L1):**');
      for (const fact of block.criticalFacts) {
        lines.push(`- ${fact}`);
      }
      lines.push('');
    }

    if (block.topicalClosets.length > 0) {
      lines.push('**Topical Recall (L2):**');
      for (const closet of block.topicalClosets) {
        lines.push(`- *[${closet.topic}]* ${closet.summary}`);
      }
      lines.push('');
    }

    lines.push(
      `> Palace tokens: ~${block.tokenEstimate} · Wing: \`${block.wingSlug}\``
    );
    lines.push('');

    return lines.join('\n');
  }
}

/**
 * Factory helper.
 */
export function createMemPalaceService(
  config: MemPalaceConfig,
  mcpTransport?: McpTransport
): MemPalaceService {
  return new MemPalaceService(config, mcpTransport);
}
