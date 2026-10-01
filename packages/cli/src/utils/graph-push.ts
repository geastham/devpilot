import { randomUUID } from 'crypto';
import type { BridgeClient, GraphSyncBatch } from '@devpilot.sh/bridge-client';
import { codeGraph } from '@devpilot.sh/core';

/**
 * Send a repository's code graph STRUCTURE to the hosted plane.
 *
 * What crosses is decided in core (`exportStructure`), from an allowlist of
 * columns: file paths and content hashes, symbol names and kinds and line
 * ranges, and which symbol refers to which. Signatures, docstrings and every
 * other piece of literal source stay in the index on this machine. This module
 * only decides WHICH FILES to send — the ones whose content hash differs from
 * what the hosted plane already holds — and how to cut them into requests.
 *
 * It is never run for a repository whose owner has not said yes: see
 * `commands/graph.ts` for the consent, and the hosted route for the
 * workspace's entitlement.
 */

type Structure = ReturnType<typeof codeGraph.exportStructure>;

/** Kept under the hosted route's own caps, with room to spare. */
export const BATCH_LIMITS = { files: 400, nodes: 4_000, edges: 8_000, removePaths: 2_000 } as const;

export interface GraphIdentity {
  repo: string;
  branch: string;
  commitSha: string;
  indexerVersion: string;
}

/** Which files differ from what the hosted plane holds, and which it holds that are gone. */
export function diffAgainstManifest(
  local: Pick<Structure, 'files'>,
  remote: Record<string, string>
): { changed: string[]; removed: string[] } {
  const here = new Map(local.files.map((f) => [f.path, f.contentHash]));
  const changed = local.files.filter((f) => remote[f.path] !== f.contentHash).map((f) => f.path);
  const removed = Object.keys(remote).filter((path) => !here.has(path));
  return { changed: changed.sort(), removed: removed.sort() };
}

/**
 * Cut the changed files into requests.
 *
 * The unit is a FILE, never part of one: the hosted route replaces a file's
 * rows when it receives that file, so a file split across two requests would
 * have its first half deleted by the second. A file too large to fit a request
 * on its own is therefore left out and reported — a generated file with tens
 * of thousands of symbols, typically — rather than sent in pieces.
 *
 * There is always at least one batch, and the last has `final: true` even when
 * nothing changed: that is what moves the hosted graph's commit and "synced
 * at" forward, so its age is honest.
 */
export function batchesFor(
  local: Structure,
  plan: { changed: string[]; removed: string[] },
  identity: GraphIdentity,
  syncId: string = randomUUID()
): { batches: GraphSyncBatch[]; skipped: { path: string; nodes: number; edges: number }[] } {
  const fileByPath = new Map(local.files.map((f) => [f.path, f]));
  const nodesByFile = new Map<string, Structure['nodes']>();
  for (const node of local.nodes) {
    const list = nodesByFile.get(node.filePath) ?? [];
    list.push(node);
    nodesByFile.set(node.filePath, list);
  }
  const edgesByFile = new Map<string, Structure['edges']>();
  for (const edge of local.edges) {
    const list = edgesByFile.get(edge.filePath) ?? [];
    list.push(edge);
    edgesByFile.set(edge.filePath, list);
  }

  const empty = (): GraphSyncBatch => ({
    repo: identity.repo,
    branch: identity.branch,
    commitSha: identity.commitSha,
    indexer: 'codegraph',
    indexerVersion: identity.indexerVersion,
    syncId,
    final: false,
    upsertFiles: [],
    removePaths: [],
    nodes: [],
    edges: [],
  });

  const batches: GraphSyncBatch[] = [];
  const skipped: { path: string; nodes: number; edges: number }[] = [];
  let current = empty();
  const flush = () => {
    batches.push(current);
    current = empty();
  };

  // Removals first: a path that was renamed is removed before its new name
  // arrives, and never the other way round.
  for (const path of plan.removed) {
    if (current.removePaths.length >= BATCH_LIMITS.removePaths) flush();
    current.removePaths.push(path);
  }

  for (const path of plan.changed) {
    const file = fileByPath.get(path);
    if (!file) continue;
    const nodes = nodesByFile.get(path) ?? [];
    const edges = edgesByFile.get(path) ?? [];

    if (nodes.length > BATCH_LIMITS.nodes || edges.length > BATCH_LIMITS.edges) {
      skipped.push({ path, nodes: nodes.length, edges: edges.length });
      continue;
    }
    if (
      current.upsertFiles.length >= BATCH_LIMITS.files ||
      current.nodes.length + nodes.length > BATCH_LIMITS.nodes ||
      current.edges.length + edges.length > BATCH_LIMITS.edges
    ) {
      flush();
    }
    current.upsertFiles.push({ path: file.path, contentHash: file.contentHash, language: file.language });
    current.nodes.push(...nodes);
    current.edges.push(...edges);
  }

  current.final = true;
  batches.push(current);
  return { batches, skipped };
}

export type PushOutcome =
  | { status: 'pushed'; changed: number; removed: number; batches: number; skipped: { path: string; nodes: number; edges: number }[]; counts?: { files: number; nodes: number; edges: number } }
  | { status: 'no-index'; reason: string }
  | { status: 'disabled'; message: string }
  | { status: 'failed'; message: string; sent: number };

type GraphClient = Pick<BridgeClient, 'graphManifest' | 'graphSync'>;

/**
 * Diff, cut, send. Stops at the first batch that does not land: a later batch
 * that did would leave the hosted graph claiming a file the earlier one was
 * meant to remove, and the next push — which diffs against what is actually
 * there — repairs a stopped sync cleanly.
 */
export async function pushGraph(client: GraphClient, dir: string, identity: GraphIdentity): Promise<PushOutcome> {
  const local = codeGraph.exportStructure(dir);
  // An export from a missing index is not an empty repository. Sending it
  // would delete the hosted copy.
  if (!local.available) return { status: 'no-index', reason: local.reason ?? 'no code graph index' };

  const manifest = await client.graphManifest(identity.repo, identity.branch);
  if (manifest.status === 'disabled') return { status: 'disabled', message: manifest.message };
  if (manifest.status === 'error') return { status: 'failed', message: manifest.message, sent: 0 };

  const plan = diffAgainstManifest(local, manifest.files);
  const { batches, skipped } = batchesFor(local, plan, identity);

  let counts: { files: number; nodes: number; edges: number } | undefined;
  for (let i = 0; i < batches.length; i++) {
    const result = await client.graphSync(batches[i]);
    if (!result.ok) {
      if (result.status === 403) return { status: 'disabled', message: result.message };
      return { status: 'failed', message: result.message, sent: i };
    }
    counts = result.counts ?? counts;
  }

  return {
    status: 'pushed',
    changed: plan.changed.length - skipped.length,
    removed: plan.removed.length,
    batches: batches.length,
    skipped,
    counts,
  };
}
