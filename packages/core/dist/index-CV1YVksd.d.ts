import { AdoptionCandidate, DiscoveredRepo } from '@devpilot.sh/bridge-protocol';
import Anthropic from '@anthropic-ai/sdk';

/**
 * Reading Claude Code's local session store — TRD 21 §6.1.
 *
 * Claude Code writes one JSONL file per session:
 *
 *     ~/.claude/projects/<cwd-slug>/<session-uuid>.jsonl
 *
 * Every entry carries `cwd`, `gitBranch`, `timestamp` and `sessionId`. The head
 * of the file additionally carries a `custom-title` entry — a human-readable
 * title the client already computed — and the first human prompt. That is
 * everything adoption needs, and it is all in the first few kilobytes.
 *
 * ## Why this must not read whole files
 *
 * The machine this was built against has a 36 MB transcript, and 38 project
 * directories. `JSON.parse` per line across all of them on every
 * `bridge connect` would take seconds and allocate hundreds of megabytes, and a
 * command that appears to hang is a command people stop running.
 *
 * So: HEAD_BYTES from the front for content, and `stat()` for recency. The
 * message count is estimated from the head sample's density rather than
 * counted, and is reported as approximate rather than pretending to a precision
 * nobody paid for.
 *
 * ## Why nothing here throws on malformed input
 *
 * A transcript being appended to *right now* has a torn final line by
 * definition — that is the normal state of the most interesting files. A
 * scanner that crashes on live data is useless, so every parse failure is
 * skipped and the probe reports what it managed to read.
 */
/**
 * One chunk, and the whole read for a well-formed transcript.
 *
 * A normal session declares its cwd, title and first prompt within the first
 * few kilobytes, so one chunk answers everything and the scan costs one read
 * per file.
 */
declare const HEAD_BYTES: number;
/**
 * The hard ceiling on what a single transcript may cost, however large it is.
 *
 * One chunk is not always enough, and the reason is worth recording because it
 * was found on real data rather than reasoned about: a session that opens with
 * a large `attachment` entry — a pasted file, an image — can push `custom-title`
 * and the first human prompt past 64 KB in a SINGLE line. Three of the first
 * eight sessions on the reference machine did exactly that, and every one of
 * them fell back to a title of `Agent session 9030b53a`, which is useless on a
 * board.
 *
 * So the probe reads chunks until it has what it needs or reaches this bound.
 * 16 chunks against a 36 MB transcript is still 3% of the file.
 */
declare const MAX_PROBE_BYTES: number;
interface SessionObservation {
    sessionUuid: string;
    transcriptPath: string;
    /** Absolute working directory the session ran in. Null if no entry declared one. */
    cwd: string | null;
    /** The branch recorded at session start. The live branch is resolved separately. */
    gitBranch: string | null;
    /** The client's own session title, when it set one. The best title available. */
    customTitle: string | null;
    /** First prompt with a human origin, flattened to text. */
    firstHumanPrompt: string | null;
    /** Earliest timestamp in the head sample. */
    startedAt: string | null;
    /** From `stat().mtime` — one syscall, no read. */
    lastActivityAt: string;
    lastActivityMs: number;
    sizeBytes: number;
    /** Estimated from head density. See `messageCountIsApproximate`. */
    messageCount: number;
    messageCountIsApproximate: boolean;
    /** True when the head sample contained only sidechain (subagent) entries. */
    sidechainOnly: boolean;
    /** The sample carried a DevPilot callback marker. */
    looksDevPilotOwned: boolean;
    /** The FIRST chunk only, for the summarizer. Never leaves the machine. */
    headSample: string;
    /** What this probe actually cost. Bounded by `MAX_PROBE_BYTES`. */
    bytesRead: number;
}
/**
 * Read at most `bytes` from `offset`.
 *
 * `openSync`/`readSync` rather than `readFileSync`, because the point is that
 * the whole file never enters memory — and rather than a stream, because this
 * runs across hundreds of files and a stream per file costs more in setup than
 * it saves on a bounded read.
 */
declare function readHead(path: string, bytes?: number, offset?: number): string;
interface ProbeOptions {
    /** Bytes per chunk. Default `HEAD_BYTES`. */
    headBytes?: number;
    /** Hard ceiling across all chunks. Default `MAX_PROBE_BYTES`. */
    maxBytes?: number;
    /** Injected in tests so the read budget can be asserted. */
    readHeadImpl?: (path: string, bytes: number, offset: number) => string;
    statImpl?: (path: string) => {
        size: number;
        mtimeMs: number;
    };
}
/**
 * Read one transcript into a `SessionObservation`.
 *
 * Returns null only when the file cannot be opened or contains no parseable
 * entry — a 0-byte file, a directory, a permissions failure. Everything else
 * yields an observation, possibly a sparse one.
 */
declare function probeTranscript(transcriptPath: string, sessionUuid: string, options?: ProbeOptions): SessionObservation | null;

/**
 * Working directory → repository — TRD 21 §6.2.
 *
 * This is the join that makes adoption possible at all: a transcript knows its
 * `cwd`, `repo_routes` is keyed on `owner/name`, and `git remote get-url` is
 * the bridge between them. No configuration, no registry, no agent cooperation.
 *
 * `execFileSync` and not `exec`: a `cwd` comes from a transcript on disk, and
 * putting it through a shell would make a directory named `; rm -rf ~` a
 * remote-code-execution vector in a tool whose entire job is to walk directories
 * it did not create. There is no shell here, ever.
 *
 * Everything is memoized per process. A machine with 38 project directories has
 * far fewer distinct repos, and `git status` on a large repo is the single most
 * expensive call in the scan.
 */
interface RepoIdentity {
    /** `owner/name`. */
    repo: string;
    owner: string;
    name: string;
    /** `github.com`, `gitlab.com`, … Never a path. */
    host: string;
}
/** Test seam and long-lived-process hygiene. */
declare function clearRepoCache(): void;
/**
 * Normalize a git remote URL to `host` + `owner/name`.
 *
 * The four forms that actually occur:
 *
 *     git@github.com:openconjecture/devpilot.git
 *     https://github.com/openconjecture/devpilot.git
 *     ssh://git@github.com/openconjecture/devpilot
 *     https://user:token@github.com/openconjecture/devpilot
 *
 * Credentials in the third and fourth forms are discarded here and never
 * returned, which matters because this value is about to cross the network.
 */
declare function parseRemoteUrl(raw: string): RepoIdentity | null;
/**
 * The repo a directory belongs to, or null when it belongs to none.
 *
 * A worktree resolves to the same repo as its parent checkout, which is
 * correct: `…--claude-worktrees-work-2026-08-09` is the same project as the
 * directory it was cut from, and adoption should attach both to the same board.
 */
declare function resolveRepo(cwd: string): RepoIdentity | null;
/**
 * The branch a directory is on right now.
 *
 * Preferred over the transcript's `gitBranch`, which records the branch at the
 * moment an entry was written — usually session start. Branch matching against
 * Linear (`AVA-31-…`) wants the branch the work is actually on, and an agent
 * that created a branch mid-session would otherwise be matched against `main`.
 *
 * Returns null on a detached HEAD, where `rev-parse --abbrev-ref` answers
 * `HEAD` and there is no branch name to match on.
 */
declare function resolveBranch(cwd: string): string | null;
/**
 * Paths with uncommitted changes in a directory.
 *
 * PATHS ONLY. This function must never return, log, or read file contents —
 * `--porcelain` is parsed for its path column and nothing else. It exists so
 * the in-flight-file guard is correct for sessions DevPilot did not start
 * (TRD 21 §1.1), which needs the names and never the bodies.
 *
 * `-uall` lists untracked files individually; without it a session that creates
 * `src/new/a.ts` and `src/new/b.ts` reports the single path `src/new/`.
 */
declare function resolveTouchedPaths(cwd: string, limit?: number): string[];

/**
 * The walk — TRD 21 §6.3.
 *
 * Enumerates every Claude Code session on this machine, resolves each to a
 * repository, decides which are adoptable, and produces both halves of the
 * output: `candidates` for the board, and `discovered` for the inventory.
 *
 * ## Every exclusion is reported
 *
 * `skipped` is not a debug affordance. A user who expects to see a session and
 * does not must be able to find out why from the preview — a scanner whose
 * skips are invisible is indistinguishable from one that is broken, and the
 * conclusion a user reaches is "this doesn't work", not "that session was
 * outside the window".
 */
type SkipReason = 'devpilot-owned' | 'not-routed' | 'no-repo' | 'too-old' | 'sidechain' | 'empty' | 'unreadable';
interface SkippedSession {
    sessionUuid: string;
    reason: SkipReason;
    /** Present when known — lets the preview say WHICH repo was withheld. */
    repo?: string;
    owner?: string;
}
interface ScanOptions {
    /** Defaults to `~/.claude/projects`. */
    root?: string;
    /**
     * Repos this machine routes. A session outside this set is skipped as
     * `not-routed` unless `allRepos` is set.
     *
     * TRD 21 §3.5: the default is narrow because `~/.claude/projects` holds every
     * project on the machine, which on the reference machine meant four unrelated
     * clients in one directory.
     */
    repos?: string[];
    /** Widen to every repo found. The caller is responsible for consent. */
    allRepos?: boolean;
    /** Still-running window. Default 15 minutes. */
    liveWithinMs?: number;
    /** Adoptable window. Default 24 hours. */
    sinceMs?: number;
    /** Claude session UUIDs DevPilot itself started (TRD 21 §4.4 mechanism 1). */
    excludeSessionUuids?: Set<string>;
    /** Include changed file paths. Default true; `--no-paths` clears it. */
    includePaths?: boolean;
    machineName: string;
    now?: Date;
    probe?: ProbeOptions;
    /** Test seam for the scratchpad liveness probe. */
    existsImpl?: (path: string) => boolean;
}
interface ScanResult {
    candidates: AdoptionCandidate[];
    discovered: DiscoveredRepo[];
    /** Sessions in directories with no resolvable git remote. */
    unmappedProjectCount: number;
    skipped: SkippedSession[];
    /** Project directories walked. The denominator in "scanned N projects". */
    projectDirCount: number;
    /** Observations that survived probing, before any filtering. */
    observedCount: number;
}
declare function defaultProjectsRoot(): string;
/**
 * `sha256(machineName + ':' + sessionUuid)`, hex — TRD 21 §4.1.
 *
 * The machine name is in the hash because two laptops share a session UUID only
 * if someone copied a `~/.claude` directory between them, and if they did,
 * those are genuinely two observations of two different machines rather than
 * one thing seen twice.
 */
declare function adoptionKeyFor(machineName: string, sessionUuid: string): string;
/**
 * Sessions DevPilot's own runner started, recorded from `claude`'s JSON
 * envelope — TRD 21 §4.4 mechanism 1.
 *
 * Never throws: a missing or corrupt ledger must degrade to "we don't know",
 * where mechanism 2 (the prompt marker) still applies, rather than failing a
 * scan.
 */
declare function loadOwnedSessionIds(path?: string): Set<string>;
/** One line, no newlines, cut on a word boundary. */
declare function condenseTitle(text: string, max: number): string;
/**
 * The title used when no model call is made.
 *
 * The client's own `custom-title` is genuinely good — the reference transcript
 * carries `"DevPilot: Claude Code Bootstrap"` — which is why the heuristic tier
 * is a floor rather than a degraded mode (TRD 21 §6.4).
 */
declare function heuristicTitle(observation: SessionObservation): string;
/**
 * Walk `~/.claude/projects` and classify everything in it.
 *
 * Pure with respect to the network: this function reads the filesystem and runs
 * `git`, and does nothing else. Summarization and upload are the caller's.
 */
declare function scanSessions(options: ScanOptions): ScanResult;
/** `{ owner → [repo, …] }`, for the preview's "3 not routed (arthaus, …)" line. */
declare function groupByOwner(repos: DiscoveredRepo[]): Map<string, DiscoveredRepo[]>;
/** Distinct owners behind a set of skips, for naming what is being withheld. */
declare function withheldOwners(skipped: SkippedSession[]): string[];

interface SummarizeOptions {
    apiKey?: string;
    model?: string;
    /** Cap on model calls per scan. Beyond it, candidates keep heuristic titles. */
    maxSummaries?: number;
    concurrency?: number;
    timeoutMs?: number;
    /** Injected in tests. */
    clientFactory?: (apiKey: string) => Pick<Anthropic, 'messages'>;
    onWarn?: (message: string) => void;
}
interface SessionSummary {
    title: string;
    summary?: string;
    /** Which tier produced this. Surfaced so a preview can be honest. */
    source: 'model' | 'heuristic';
}
/**
 * Summarize one session. Never throws — any failure degrades to the heuristic.
 *
 * A failed summary must cost that one candidate its nicer title and nothing
 * else. Failing the scan because a model call timed out would trade the entire
 * feature for a cosmetic improvement to part of it.
 */
declare function summarizeSession(observation: SessionObservation, touchedPaths: string[], options?: SummarizeOptions): Promise<SessionSummary>;
/**
 * Summarize a batch with bounded concurrency, in observation order.
 *
 * Bounded because a scan can produce dozens of candidates and firing them all
 * at once would rate-limit the user's own key — the one they use for real work.
 * Beyond `maxSummaries` the remainder keep heuristic titles rather than queueing
 * indefinitely behind a progress bar.
 */
declare function summarizeSessions(jobs: {
    observation: SessionObservation;
    touchedPaths: string[];
}[], options?: SummarizeOptions): Promise<SessionSummary[]>;

/**
 * Fleet introspection — TRD 21.
 *
 * Reads the agent sessions already running on this machine and turns them into
 * something the board can hold. Deliberately free of any database import: this
 * is a separate tsup entry so the CLI can pull it in without dragging
 * `better-sqlite3` along, exactly as `score/` is.
 *
 * Nothing here reaches the network. Scanning produces values; uploading them is
 * the caller's decision and the caller's consent to obtain.
 */

declare const index_HEAD_BYTES: typeof HEAD_BYTES;
declare const index_MAX_PROBE_BYTES: typeof MAX_PROBE_BYTES;
type index_ProbeOptions = ProbeOptions;
type index_RepoIdentity = RepoIdentity;
type index_ScanOptions = ScanOptions;
type index_ScanResult = ScanResult;
type index_SessionObservation = SessionObservation;
type index_SessionSummary = SessionSummary;
type index_SkipReason = SkipReason;
type index_SkippedSession = SkippedSession;
type index_SummarizeOptions = SummarizeOptions;
declare const index_adoptionKeyFor: typeof adoptionKeyFor;
declare const index_clearRepoCache: typeof clearRepoCache;
declare const index_condenseTitle: typeof condenseTitle;
declare const index_defaultProjectsRoot: typeof defaultProjectsRoot;
declare const index_groupByOwner: typeof groupByOwner;
declare const index_heuristicTitle: typeof heuristicTitle;
declare const index_loadOwnedSessionIds: typeof loadOwnedSessionIds;
declare const index_parseRemoteUrl: typeof parseRemoteUrl;
declare const index_probeTranscript: typeof probeTranscript;
declare const index_readHead: typeof readHead;
declare const index_resolveBranch: typeof resolveBranch;
declare const index_resolveRepo: typeof resolveRepo;
declare const index_resolveTouchedPaths: typeof resolveTouchedPaths;
declare const index_scanSessions: typeof scanSessions;
declare const index_summarizeSession: typeof summarizeSession;
declare const index_summarizeSessions: typeof summarizeSessions;
declare const index_withheldOwners: typeof withheldOwners;
declare namespace index {
  export { index_HEAD_BYTES as HEAD_BYTES, index_MAX_PROBE_BYTES as MAX_PROBE_BYTES, type index_ProbeOptions as ProbeOptions, type index_RepoIdentity as RepoIdentity, type index_ScanOptions as ScanOptions, type index_ScanResult as ScanResult, type index_SessionObservation as SessionObservation, type index_SessionSummary as SessionSummary, type index_SkipReason as SkipReason, type index_SkippedSession as SkippedSession, type index_SummarizeOptions as SummarizeOptions, index_adoptionKeyFor as adoptionKeyFor, index_clearRepoCache as clearRepoCache, index_condenseTitle as condenseTitle, index_defaultProjectsRoot as defaultProjectsRoot, index_groupByOwner as groupByOwner, index_heuristicTitle as heuristicTitle, index_loadOwnedSessionIds as loadOwnedSessionIds, index_parseRemoteUrl as parseRemoteUrl, index_probeTranscript as probeTranscript, index_readHead as readHead, index_resolveBranch as resolveBranch, index_resolveRepo as resolveRepo, index_resolveTouchedPaths as resolveTouchedPaths, index_scanSessions as scanSessions, index_summarizeSession as summarizeSession, index_summarizeSessions as summarizeSessions, index_withheldOwners as withheldOwners };
}

export { HEAD_BYTES as H, MAX_PROBE_BYTES as M, type ProbeOptions as P, type RepoIdentity as R, type ScanOptions as S, type ScanResult as a, type SessionObservation as b, type SessionSummary as c, type SkipReason as d, type SkippedSession as e, type SummarizeOptions as f, adoptionKeyFor as g, clearRepoCache as h, index as i, condenseTitle as j, defaultProjectsRoot as k, groupByOwner as l, heuristicTitle as m, loadOwnedSessionIds as n, probeTranscript as o, parseRemoteUrl as p, resolveBranch as q, readHead as r, resolveRepo as s, resolveTouchedPaths as t, scanSessions as u, summarizeSession as v, summarizeSessions as w, withheldOwners as x };
