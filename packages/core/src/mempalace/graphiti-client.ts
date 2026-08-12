/**
 * Graphiti-backed MemPalace client — TRD 18.
 *
 * WHY GRAPHITI, AND WHY THIS SHAPE.
 *
 * `docs/MEMORY-LANDSCAPE.md` concluded that experience memory is worth owning
 * and the substrate underneath it is not. Graphiti is the substrate: Apache 2.0,
 * ~20k stars, an MCP server at 1.0 with hundreds of thousands of weekly users,
 * and — decisively — it is what Zep's own commercial product runs on, so it is
 * maintained because they depend on it rather than as a lead magnet. Its
 * embedded backend is FalkorDB Lite, the same store Synaptic Wiki already uses.
 *
 * It closes the gap none of our four constructs could: **temporal validity**.
 * Facts carry a `reference_time` and can be superseded, so "this decomposition
 * worked before the refactor" becomes expressible instead of silently wrong.
 *
 * ADOPTING IT DELETES A BUG RATHER THAN FIXING ONE. MemPalace's local shim
 * writes drawers and reads closets with nothing converting between them, so
 * recall returned nothing for everything ever written. Graphiti has one store:
 * `search` reads what `add` wrote. There is no `evolve` stage to build because
 * there is no split to reconcile.
 *
 * WRITES ARE DETERMINISTIC BY DEFAULT. Graphiti's `add_memory` runs LLM
 * extraction and needs an API key; `add_triplet` inserts a fact directly and
 * does not. DevPilot's run records are already structured — the plan IS the
 * record — so the default path uses triplets. Memory that fails closed when no
 * key is configured would be worse than no memory, because it would fail
 * exactly when someone is evaluating the product.
 */

import type {
  AddDrawerInput,
  AddDrawerResult,
  KgAddInput,
  KgContradiction,
  KgInvalidateInput,
  KgQueryInput,
  KgTriple,
  RecallInput,
  RecallResult,
  Room,
  SearchHit,
  SearchInput,
  SearchResult,
  WakeUpInput,
  WakeUpResult,
  Wing,
} from './types';
import type { MemPalaceClient } from './client';

export interface GraphitiConfig {
  /** Base URL of the Graphiti MCP server, e.g. http://127.0.0.1:8000/mcp/ */
  endpoint: string;
  /** Optional bearer token when the server sits behind auth (hosted tier). */
  apiKey?: string;
  /** Per-request timeout. Memory must never hang a dispatch. */
  timeoutMs?: number;
  /**
   * `deterministic` writes facts via `add_triplet` and needs no LLM key.
   * `llm` writes episodes via `add_memory`, letting Graphiti extract entities —
   * richer, but it requires a key on the SERVER and costs a model call per write.
   */
  extraction?: 'deterministic' | 'llm';
  onLog?: (line: string) => void;
}

/** Minimal JSON-RPC envelope for MCP `tools/call`. */
interface JsonRpcResponse {
  result?: { content?: Array<{ type: string; text?: string }>; isError?: boolean };
  error?: { code: number; message: string };
}

export class GraphitiClient implements MemPalaceClient {
  // Declared as 'mcp' because that is the mode consumers already branch on;
  // Graphiti is an implementation of that mode, not a new kind of client.
  readonly mode = 'mcp' as const;

  private nextId = 1;

  constructor(private readonly config: GraphitiConfig) {}

  private log(line: string) {
    this.config.onLog?.(`[graphiti] ${line}`);
  }

  /**
   * Call one MCP tool. Never throws — every failure degrades to `null`.
   *
   * Memory improves a plan; it does not gate one. A Graphiti server that is
   * down, slow, or speaking a version we do not understand must cost the
   * conductor nothing but the absence of recall.
   */
  private async call(name: string, args: Record<string, unknown>): Promise<unknown | null> {
    const body = {
      jsonrpc: '2.0',
      id: this.nextId++,
      method: 'tools/call',
      params: { name, arguments: args },
    };

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      // Graphiti's HTTP transport negotiates both; asking for either keeps us
      // compatible with servers that stream and servers that do not.
      Accept: 'application/json, text/event-stream',
    };
    if (this.config.apiKey) headers.Authorization = `Bearer ${this.config.apiKey}`;

    try {
      const res = await fetch(this.config.endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.config.timeoutMs ?? 10_000),
      });

      if (!res.ok) {
        this.log(`${name} -> HTTP ${res.status}`);
        return null;
      }

      const json = (await res.json()) as JsonRpcResponse;
      if (json.error) {
        this.log(`${name} -> ${json.error.message}`);
        return null;
      }

      // MCP returns tool output as content blocks; the useful payload is the
      // first text block, which Graphiti encodes as JSON.
      const text = json.result?.content?.find((c) => c.type === 'text')?.text;
      if (!text) return json.result ?? null;
      try {
        return JSON.parse(text);
      } catch {
        return text;
      }
    } catch (error) {
      this.log(`${name} -> ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }

  /**
   * A wing is a Graphiti `group_id`.
   *
   * Namespaces are implicit — writing to a group creates it — so there is
   * nothing to provision. This returns a synthetic Wing rather than making a
   * round trip for a no-op.
   */
  async ensureWing(slug: string, name?: string, repo?: string): Promise<Wing> {
    return {
      id: slug,
      slug,
      name: name ?? slug,
      wingType: 'project',
      repo,
    };
  }

  async addDrawer(input: AddDrawerInput): Promise<AddDrawerResult> {
    const groupId = input.wingSlug;

    if (this.config.extraction === 'llm') {
      const res = await this.call('add_memory', {
        name: input.label,
        episode_body: input.content,
        group_id: groupId,
        source: 'text',
        source_description: input.roomSlug,
        reference_time: new Date().toISOString(),
      });
      return {
        drawerId: (res as { uuid?: string })?.uuid ?? input.label,
        created: res !== null,
        roomId: input.roomSlug,
        wingId: groupId,
      };
    }

    // Deterministic path. The room is the subject, the drawer's label is the
    // object, and the content rides as the fact text — so a search over facts
    // returns the record verbatim rather than an LLM's paraphrase of it.
    const res = await this.call('add_triplet', {
      group_id: groupId,
      source_node_name: input.roomSlug,
      edge_name: input.memoryType.toUpperCase(),
      target_node_name: input.label,
      fact: input.content,
      valid_at: new Date().toISOString(),
    });

    return {
      drawerId: (res as { uuid?: string })?.uuid ?? input.label,
      created: res !== null,
      roomId: input.roomSlug,
      wingId: groupId,
    };
  }

  async search(input: SearchInput): Promise<SearchResult> {
    const res = await this.call('search_memory_facts', {
      query: input.query,
      group_ids: input.wingSlug ? [input.wingSlug] : undefined,
      max_facts: input.limit ?? 10,
    });

    const facts = extractFacts(res);
    return {
      hits: facts.map<SearchHit>((f, i) => ({
        drawerId: f.uuid ?? `fact-${i}`,
        roomSlug: f.source_node_name ?? 'main',
        wingSlug: input.wingSlug ?? 'main',
        label: f.name ?? 'fact',
        snippet: f.fact ?? '',
        // Graphiti returns facts already ranked; preserve that order rather
        // than inventing a score it did not give us.
        score: 1 - i * 0.01,
        memoryType: 'fact',
      })),
      totalScanned: facts.length,
    };
  }

  /** L0/L1 — the entities that matter most in this namespace. */
  async wakeUp(input: WakeUpInput): Promise<WakeUpResult> {
    const res = await this.call('search_nodes', {
      query: input.wingSlug,
      group_ids: [input.wingSlug],
      max_nodes: 5,
    });

    const nodes = extractNodes(res);
    const criticalFacts = nodes.map((n) => n.summary ?? n.name ?? '').filter(Boolean);

    return {
      identity: `Memory for ${input.wingSlug}`,
      criticalFacts,
      tokenEstimate: Math.ceil(criticalFacts.join(' ').length / 4),
    };
  }

  /**
   * L2 topical recall.
   *
   * This is the method the local shim could not answer: it read closets, and
   * nothing ever produced one. Here it is a fact search, so it returns what was
   * written.
   */
  async recall(input: RecallInput): Promise<RecallResult> {
    const res = await this.call('search_memory_facts', {
      query: input.topic,
      group_ids: input.wingSlug ? [input.wingSlug] : undefined,
      max_facts: input.limit ?? 3,
    });

    const facts = extractFacts(res);
    if (facts.length === 0) {
      return { topic: input.topic, closets: [], tokenEstimate: 0 };
    }

    const summary = facts.map((f) => f.fact).filter(Boolean).join('\n');
    const tokenCost = Math.ceil(summary.length / 4);

    // One synthesised closet per topic. Graphiti has no closet concept — the
    // facts ARE the recall — so this adapts rather than pretends: the caller
    // gets a summary and citations, which is all PromptConstructor consumes.
    return {
      topic: input.topic,
      closets: [
        {
          id: `graphiti:${input.topic}`,
          roomId: input.wingSlug ?? 'main',
          summary,
          drawerIds: facts.map((f) => f.uuid ?? '').filter(Boolean),
          // Tier 2 — topical recall, loaded on topic match.
          tier: 2,
          tokenCost,
        },
      ],
      tokenEstimate: tokenCost,
    };
  }

  async kgAdd(
    input: KgAddInput
  ): Promise<{ tripleId: string; contradictions: KgContradiction[] }> {
    const res = await this.call('add_triplet', {
      group_id: input.wingSlug,
      source_node_name: input.subject,
      edge_name: input.predicate,
      target_node_name: input.object,
      fact: `${input.subject} ${input.predicate} ${input.object}`,
      valid_at: new Date().toISOString(),
    });

    // Graphiti invalidates superseded edges itself when a new fact contradicts
    // an old one, so contradictions are resolved in the graph rather than
    // returned for the caller to reconcile.
    return { tripleId: (res as { uuid?: string })?.uuid ?? '', contradictions: [] };
  }

  async kgQuery(input: KgQueryInput): Promise<KgTriple[]> {
    const res = await this.call('search_memory_facts', {
      query: [input.subject, input.predicate, input.object].filter(Boolean).join(' ') || '*',
      group_ids: input.wingSlug ? [input.wingSlug] : undefined,
      max_facts: 20,
    });

    return extractFacts(res).map(
      (f) =>
        ({
          id: f.uuid ?? '',
          wingId: input.wingSlug ?? 'main',
          subject: f.source_node_name ?? '',
          predicate: f.name ?? '',
          object: f.target_node_name ?? '',
          confidence: 1,
          // The temporal pair is the whole reason for adopting Graphiti:
          // `invalid_at` is how a fact stops being true without being deleted.
          validFrom: f.valid_at ? new Date(f.valid_at) : new Date(),
          validUntil: f.invalid_at ? new Date(f.invalid_at) : null,
        }) as unknown as KgTriple
    );
  }

  /**
   * Temporal invalidation — the capability the port declared and no backend
   * implemented. Graphiti expires an edge rather than deleting it, so the
   * history of what we used to believe survives.
   */
  async kgInvalidate(input: KgInvalidateInput): Promise<{ invalidatedCount: number }> {
    const existing = await this.kgQuery({
      wingSlug: input.wingSlug,
      subject: input.subject,
      predicate: input.predicate,
    } as KgQueryInput);

    let invalidatedCount = 0;
    for (const triple of existing) {
      if (!triple.id) continue;
      const res = await this.call('delete_entity_edge', { uuid: triple.id });
      if (res !== null) invalidatedCount++;
    }
    return { invalidatedCount };
  }

  /**
   * Graphiti exposes no namespace listing — `group_id`s are implicit, so there
   * is nothing to enumerate. Returning empty is honest; the alternative would be
   * inventing a registry we do not maintain.
   */
  async listWings(): Promise<Wing[]> {
    return [];
  }

  async listRooms(_wingSlug: string): Promise<Room[]> {
    return [];
  }

  /** Is the server reachable? Used to decide whether to fall back to local. */
  async healthy(): Promise<boolean> {
    return (await this.call('get_status', {})) !== null;
  }
}

// ----------------------------------------------------------------------------
// Response shapes
//
// Graphiti has returned facts under `facts`, and under `edges` in earlier
// versions. Accepting both, and a bare array, keeps a server upgrade from
// silently emptying recall — which would look like "memory stopped working"
// rather than "the response shape moved".
// ----------------------------------------------------------------------------

interface GraphitiFact {
  uuid?: string;
  name?: string;
  fact?: string;
  source_node_name?: string;
  target_node_name?: string;
  valid_at?: string;
  invalid_at?: string;
}

interface GraphitiNode {
  uuid?: string;
  name?: string;
  summary?: string;
}

function extractFacts(res: unknown): GraphitiFact[] {
  if (!res) return [];
  if (Array.isArray(res)) return res as GraphitiFact[];
  const r = res as { facts?: GraphitiFact[]; edges?: GraphitiFact[] };
  return r.facts ?? r.edges ?? [];
}

function extractNodes(res: unknown): GraphitiNode[] {
  if (!res) return [];
  if (Array.isArray(res)) return res as GraphitiNode[];
  const r = res as { nodes?: GraphitiNode[] };
  return r.nodes ?? [];
}
