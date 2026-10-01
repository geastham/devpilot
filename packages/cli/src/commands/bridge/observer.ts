import chalk from 'chalk';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { BridgeClient } from '@devpilot.sh/bridge-client';
import { runScanPipeline } from '../sessions/scan-pipeline';
import { canSendReadings, sendTranscriptReading, type ReadingTarget } from './transcript-reading.js';

/**
 * Keeping the cockpit live — TRD 22 §8.
 *
 * The bridge re-scans this machine on a cadence and reports what it sees. That
 * is the whole of what makes "turn it on and your sessions are there" true:
 * without a sweep, observation is a snapshot taken at connect time that decays
 * into a list of agents that finished hours ago.
 *
 * ## Why this is safe to run by default, and adoption is not
 *
 * An observation writes to the caller's own organization and creates nothing
 * outside it: no Linear issue, no queue row, no routing decision, no capability.
 * Adoption creates issues on a board a whole team reads, which is why it stays
 * behind a flag and a confirmation.
 *
 * ## Why it reports endings explicitly
 *
 * A session that stops between two sweeps would otherwise stay `running` in the
 * cockpit forever. Each sweep sends the keys it no longer sees live, so the
 * board reflects the machine rather than the high-water mark of the machine. A
 * confidently wrong "11 agents running" is worse than an empty page.
 */

export interface ObserverConfig {
  client: BridgeClient;
  machineName: string;
  repos: string[];
  /** Observe every repo, not only routed ones. Default true — see below. */
  allRepos?: boolean;
  intervalMs?: number;
  /** Model-written summaries per sweep. Sessions beyond it wait for the next. */
  summariseBudget?: number;
  /** How far back a session counts as worth reporting. */
  sinceMs?: number;
  /**
   * Sessions something else is already sending readings for — the adoption
   * watcher, for anything placed on a board. Two senders deriving one
   * transcript would agree with each other and double the traffic.
   */
  isWatched?: (adoptionKey: string) => boolean;
  /** Where read positions are kept between runs. Omit to keep them in memory. */
  readingsStatePath?: string;
  onLog?: (line: string) => void;
}

/** Per-transcript reading state, kept across sweeps. */
interface ObservedReading extends ReadingTarget {
  lastMtimeMs: number;
  retry?: boolean;
}

const DEFAULT_INTERVAL_MS = 60_000;
const DEFAULT_SINCE_MS = 24 * 60 * 60 * 1000;
/** Model-written summaries per sweep. Bounded so a big fleet does not spike. */
const DEFAULT_SUMMARISE_BUDGET = 10;
/**
 * Transcripts read for the first time per sweep.
 *
 * A first connect can find a hundred sessions, each with thousands of events to
 * stream. Sent all at once that is several hundred requests before the bridge
 * has done anything else; spread over sweeps it is a minute or two of catching
 * up that nobody waits on. Sessions already being followed are not counted —
 * they only send what was appended.
 */
const FIRST_READINGS_PER_SWEEP = 8;

export class SessionObserver {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  /** Adoption keys reported live on the previous sweep. */
  private lastLive = new Set<string>();
  /**
   * Adoption keys this process has already reported once.
   *
   * A summary is worth paying for exactly once per session: it is what
   * `/api/sessions/:id/promote` uses as the body of the Linear issue it drafts,
   * and a sweep with no summary produced tickets describing nothing. Paying for
   * it every 60 seconds would be absurd; paying for it never left every ticket
   * thin. First sight is the right moment.
   */
  private seen = new Set<string>();
  /**
   * `adoptionKey → where that conversation lives on this machine`.
   *
   * The resolution table for "take the wheel" (TRD 23 §3.3). The hosted plane
   * can only point at a row; this is the state that says what that means here,
   * and it never leaves the process.
   */
  private targets = new Map<
    string,
    {
      transcriptPath: string;
      sessionUuid: string;
      repo: string;
      title?: string;
      summary?: string;
      branch?: string;
      touchedPaths?: string[];
    }
  >();
  /** `adoptionKey → read position and meter` for the instrument readings. */
  private readings = new Map<string, ObservedReading>();
  private sendingReadings = false;
  private readonly intervalMs: number;
  private readonly sinceMs: number;
  private readonly summariseBudget: number;

  constructor(private readonly config: ObserverConfig) {
    this.intervalMs = config.intervalMs ?? DEFAULT_INTERVAL_MS;
    this.sinceMs = config.sinceMs ?? DEFAULT_SINCE_MS;
    this.summariseBudget = config.summariseBudget ?? DEFAULT_SUMMARISE_BUDGET;
    this.restoreReadings();
  }

  /**
   * Where a conversation lives on this machine, by adoption key.
   *
   * Undefined for anything this process has not observed — which is the honest
   * answer, and the reason a resume for another machine's session refuses
   * rather than guessing.
   */
  targetFor(adoptionKey: string):
    | {
        transcriptPath: string;
        sessionUuid: string;
        repo: string;
        title?: string;
        summary?: string;
        branch?: string;
        touchedPaths?: string[];
      }
    | undefined {
    return this.targets.get(adoptionKey);
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.sweep(), this.intervalMs);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /**
   * One pass. Never throws, and never overlaps itself.
   *
   * A scan on a large machine takes most of a second and `git status` can take
   * longer; without the guard a slow sweep would stack behind the interval and
   * the machine would spend its life scanning itself.
   */
  async sweep(): Promise<{ observed: number; ended: number } | null> {
    if (this.running) return null;
    this.running = true;

    try {
      const result = await runScanPipeline({
        machineName: this.config.machineName,
        repos: this.config.repos,
        /**
         * Observation defaults to EVERY repo, unlike placement.
         *
         * TRD 21 §3.5 narrowed adoption to routed repos because it pushes repo
         * names onto a shared Linear board, and one client's names must not
         * reach another client's workspace. Observation has no such reach: it
         * writes only into the org that already receives the full repo
         * inventory from discovery, so restricting it here would buy no privacy
         * and would leave the cockpit empty for anyone who has not routed
         * anything yet — which is everyone, on day one.
         */
        allRepos: this.config.allRepos !== false,
        sinceMs: this.sinceMs,
        includePaths: true,
        /**
         * Summarise only what this process has not seen before, and only a
         * handful per sweep.
         *
         * The first sweep after a connect is the expensive one — everything is
         * new — so it is capped, and the remainder pick up their summary on
         * later passes rather than all at once.
         */
        maxSummaries: this.summariseBudget,
        summarize: true,
        skipSummaryFor: this.seen,
      });

      /**
       * Nothing is stripped from already-seen candidates here: they simply
       * never got a summary this pass, and the server's COALESCE upsert treats
       * an absent summary as "leave what you have" rather than an erasure.
       */
      result.candidates.forEach((c) => {
        this.seen.add(c.adoptionKey);
        const at = result.transcriptPaths.get(c.adoptionKey);
        if (at) {
          this.targets.set(c.adoptionKey, {
            transcriptPath: at.transcriptPath,
            sessionUuid: at.sessionUuid,
            repo: c.repo,
            // Carried so a planning handoff has a brief to work from without
            // going back to the hosted plane for what this machine just read.
            title: c.title,
            summary: c.summary,
            branch: c.branch,
            touchedPaths: c.touchedPaths,
          });
        }
      });

      const live = new Set(result.candidates.filter((c) => c.live).map((c) => c.adoptionKey));
      const ended = [...this.lastLive].filter((key) => !live.has(key));

      const response = await this.config.client.reportObservations({
        machineName: this.config.machineName,
        sessions: result.candidates,
        endedKeys: ended,
      });

      this.lastLive = live;

      if (response) {
        /**
         * Instruments for what was just observed.
         *
         * Not awaited: the sweep's job is to say which sessions exist, and it
         * is what `bridge connect` waits on before printing that it is
         * observing. Catching a hundred transcripts up to the present is a
         * separate, slower thing that must not hold that line.
         */
        if (response.sessionIds) {
          void this.sendReadings(
            result.candidates.map((c) => ({ key: c.adoptionKey, label: c.repo, live: c.live })),
            response.sessionIds,
            result.transcriptPaths,
          );
        }
        return { observed: response.observed, ended: response.ended };
      }
      return null;
    } catch (err) {
      this.config.onLog?.(
        chalk.gray(`observation sweep failed: ${err instanceof Error ? err.message : err}`),
      );
      return null;
    } finally {
      this.running = false;
    }
  }

  /**
   * Send an instrument reading for each observed session that has something
   * new to say.
   *
   * Live sessions first, and first-time readings capped per pass — see
   * FIRST_READINGS_PER_SWEEP. A session that ended before this bridge started
   * is still read once: what it cost is as much a fact about last week as what
   * a running one costs is about now.
   *
   * Exposed for tests; never throws and never overlaps itself.
   */
  async sendReadings(
    candidates: { key: string; label: string; live: boolean }[],
    sessionIds: Record<string, string>,
    locations: Map<string, { transcriptPath: string; sessionUuid: string; cwd: string | null }>,
    now = Date.now(),
  ): Promise<number> {
    const client = this.config.client;
    if (this.sendingReadings || !canSendReadings(client)) return 0;
    this.sendingReadings = true;

    let sent = 0;
    let first = 0;
    try {
      const ordered = [...candidates].sort((a, b) => Number(b.live) - Number(a.live));
      for (const candidate of ordered) {
        const sessionId = sessionIds[candidate.key];
        const location = locations.get(candidate.key);
        if (!sessionId || !location) continue;
        if (this.config.isWatched?.(candidate.key)) continue;

        let mtimeMs: number;
        try {
          mtimeMs = statSync(location.transcriptPath).mtimeMs;
        } catch {
          this.readings.delete(candidate.key);
          continue;
        }

        const known = this.readings.get(candidate.key);
        if (known && mtimeMs <= known.lastMtimeMs && !known.retry) continue;
        if (!known) {
          if (first >= FIRST_READINGS_PER_SWEEP) continue;
          first++;
        }

        const reading: ObservedReading = known ?? {
          sessionId,
          label: candidate.label,
          transcriptPath: location.transcriptPath,
          cwd: location.cwd,
          lastMtimeMs: 0,
        };
        // The hosted id is stable per adoption key, but a row can be recreated
        // (an org reset, a different bridge); the latest answer is the truth.
        reading.sessionId = sessionId;

        const outcome = await sendTranscriptReading(client, reading, { now, mtimeMs }, this.config.onLog);
        reading.retry = outcome === 'failed';
        if (outcome !== 'failed') reading.lastMtimeMs = mtimeMs;
        this.readings.set(candidate.key, reading);
        if (outcome === 'sent') sent++;
      }

      // Forget transcripts the scan no longer reports, so the state file
      // tracks the machine rather than everything it has ever seen.
      const current = new Set(candidates.map((c) => c.key));
      for (const key of this.readings.keys()) if (!current.has(key)) this.readings.delete(key);
      this.persistReadings();
    } catch (err) {
      this.config.onLog?.(
        chalk.gray(`instrument readings failed: ${err instanceof Error ? err.message : err}`),
      );
    } finally {
      this.sendingReadings = false;
    }
    return sent;
  }

  private restoreReadings(): void {
    const path = this.config.readingsStatePath;
    if (!path) return;
    try {
      if (!existsSync(path)) return;
      const parsed = JSON.parse(readFileSync(path, 'utf8')) as {
        version?: number;
        readings?: Record<string, ObservedReading>;
      };
      if (parsed?.version !== 1 || !parsed.readings) return;
      for (const [key, reading] of Object.entries(parsed.readings)) this.readings.set(key, reading);
    } catch {
      // A corrupt file costs a re-read of the transcripts, which is idempotent
      // on the hosted side. It must not stop a bridge from connecting.
    }
  }

  private persistReadings(): void {
    const path = this.config.readingsStatePath;
    if (!path) return;
    try {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(
        path,
        JSON.stringify({ version: 1, readings: Object.fromEntries(this.readings) }),
        'utf8',
      );
    } catch {
      // Unwritable state means a restart re-reads from the top. Never fatal.
    }
  }
}
