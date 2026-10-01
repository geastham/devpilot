import type { BridgeClient } from '@devpilot.sh/bridge-client';
import { findIndexer, hasIndex, syncIndex } from '../../utils/codegraph';
import { pushGraph } from '../../utils/graph-push';
import { identify, loadShares, shareStorePath } from '../graph';

/**
 * Keeps shared code graphs current while the bridge runs.
 *
 * `devpilot graph share` sends a repository's graph once and records the
 * choice. This is what honours "and keep it current": every few minutes it
 * re-syncs each shared repository's index and sends whatever changed. A graph
 * that fell behind the code would be describing a repository that no longer
 * exists, and the hosted warnings built on it would be about that one.
 *
 * It only ever touches repositories listed in the share file, which only
 * `graph share --yes` writes. A repository with an index but no entry there is
 * never sent.
 *
 * Best effort: a failure is logged and the next sweep tries again.
 */
export class GraphSharer {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  /** repo dir -> the commit and index time last sent, to skip a sweep with nothing new. */
  private readonly sent = new Map<string, string>();

  constructor(
    private readonly opts: {
      client: Pick<BridgeClient, 'graphManifest' | 'graphSync'>;
      intervalMs?: number;
      storePath?: string;
      onLog?: (line: string) => void;
    }
  ) {}

  start(): void {
    if (this.timer) return;
    void this.sweep();
    this.timer = setInterval(() => void this.sweep(), this.opts.intervalMs ?? 10 * 60_000);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async sweep(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const shares = loadShares(this.opts.storePath ?? shareStorePath());
      const dirs = Object.keys(shares.repos);
      if (dirs.length === 0) return;

      const indexer = await findIndexer();
      for (const dir of dirs) {
        if (!hasIndex(dir)) continue;
        try {
          if (indexer) await syncIndex(indexer, dir);
          const identity = identify(dir, indexer?.version ?? 'unknown');
          // A checkout that has moved off the default branch is left alone
          // until it comes back; see `identify`.
          if ('error' in identity || identity.skip) continue;

          const outcome = await pushGraph(this.opts.client, dir, identity);
          if (outcome.status === 'pushed') {
            const key = `${identity.commitSha}:${outcome.counts?.nodes ?? ''}`;
            if ((outcome.changed > 0 || outcome.removed > 0) && this.sent.get(dir) !== key) {
              this.opts.onLog?.(
                `code graph for ${identity.repo}: ${outcome.changed} file(s) sent, ${outcome.removed} removed`
              );
            }
            this.sent.set(dir, key);
          } else if (outcome.status === 'disabled') {
            this.opts.onLog?.(`code graph for ${identity.repo} not sent: the workspace has not turned the feature on`);
          } else if (outcome.status === 'failed') {
            this.opts.onLog?.(`code graph for ${identity.repo} did not land: ${outcome.message}`);
          }
        } catch (error) {
          this.opts.onLog?.(`code graph sweep for ${dir} failed: ${error instanceof Error ? error.message : error}`);
        }
      }
    } finally {
      this.running = false;
    }
  }
}
