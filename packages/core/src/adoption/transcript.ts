import { openSync, readSync, closeSync, statSync } from 'node:fs';

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
export const HEAD_BYTES = 64 * 1024;

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
export const MAX_PROBE_BYTES = 1024 * 1024;

/**
 * A line above this is not parsed as JSON — it is an attachment, and
 * `JSON.parse` on a multi-megabyte string to reach a 40-character `cwd` field
 * is the one genuinely wasteful thing this module could do. Those lines are
 * scraped for the two flat fields worth having instead.
 */
const LARGE_LINE_BYTES = 128 * 1024;

/**
 * Markers identifying a session DevPilot itself started (TRD 21 §4.4,
 * mechanism 2). These strings come from `session-prompt.ts`, which composes the
 * callback instructions; they are stable because changing them would break the
 * callback contract itself.
 *
 * This is the fallback for sessions predating the owned-session ledger. Neither
 * mechanism is load-bearing alone.
 */
const DEVPILOT_PROMPT_MARKERS = [
  'DevPilot session id is',
  'X-DevPilot-Callback-Token',
];

export interface SessionObservation {
  sessionUuid: string;
  transcriptPath: string;
  /** Absolute working directory the session ran in. Null if no entry declared one. */
  cwd: string | null;
  /** The branch recorded at session start. The live branch is resolved separately. */
  gitBranch: string | null;
  /** The client's own session title, when it set one. The best title available. */
  customTitle: string | null;
  /**
   * Where this session is being driven — `https://claude.ai/code/session_…`.
   *
   * Present only for sessions that were remote-controlled; a purely local
   * terminal session has no such place and correctly reports null. On the
   * reference machine 19 of the 25 most recent sessions carry one.
   */
  webUrl: string | null;
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

/** Entry shapes this module depends on. Everything else is ignored. */
interface TranscriptEntry {
  type?: string;
  subtype?: string;
  sessionId?: string;
  cwd?: string;
  gitBranch?: string;
  timestamp?: string;
  isMeta?: boolean;
  isSidechain?: boolean;
  customTitle?: string;
  /** `bridge_status` system entries carry the session's web URL directly. */
  url?: string;
  /** `bridge-session` entries carry `cse_<id>`, which maps to `session_<id>`. */
  bridgeSessionId?: string;
  origin?: { kind?: string };
  message?: { role?: string; content?: unknown };
}

/**
 * Read at most `bytes` from `offset`.
 *
 * `openSync`/`readSync` rather than `readFileSync`, because the point is that
 * the whole file never enters memory — and rather than a stream, because this
 * runs across hundreds of files and a stream per file costs more in setup than
 * it saves on a bounded read.
 */
export function readHead(path: string, bytes: number = HEAD_BYTES, offset = 0): string {
  const fd = openSync(path, 'r');
  try {
    const buf = Buffer.allocUnsafe(bytes);
    const read = readSync(fd, buf, 0, bytes, offset);
    return buf.subarray(0, read).toString('utf8');
  } finally {
    closeSync(fd);
  }
}

/** How much of an oversized user prompt to recover for a title. */
const LARGE_LINE_PROMPT_CHARS = 400;

/**
 * Pull the few flat fields worth having out of a line too large to parse.
 *
 * `cwd` and `gitBranch` are flat strings with no nesting, so a regex is exact
 * for them.
 *
 * ## Why the prompt prefix is here too
 *
 * Skipping oversized lines entirely was wrong, and it showed up on the board.
 * A session whose first human prompt is a large paste — 178 KB in the case
 * that exposed this — had that single line skipped, found no title anywhere,
 * and fell back to `Agent session f2565e47`. Placed on Linear that becomes a
 * ticket nobody can identify.
 *
 * So a bounded prefix of `message.content` is recovered when the entry is a
 * user message. Bounded twice over: the regex itself cannot match more than
 * `LARGE_LINE_PROMPT_CHARS`, so a 178 KB string is never materialised, and the
 * result is condensed to a title afterwards.
 *
 * This reads no more than the normal path already does — the first human
 * prompt is exactly what `heuristicTitle` uses — it just stops losing it when
 * the prompt is big. Nothing here reads assistant output or tool results.
 */
function scrapeLargeLine(line: string): {
  cwd?: string;
  gitBranch?: string;
  userPrompt?: string;
} {
  const unescape = (v: string) => v.replace(/\\n/g, ' ').replace(/\\(.)/g, '$1');

  const cwd = line.match(/"cwd"\s*:\s*"((?:[^"\\]|\\.)*)"/)?.[1];
  const gitBranch = line.match(/"gitBranch"\s*:\s*"((?:[^"\\]|\\.)*)"/)?.[1];

  let userPrompt: string | undefined;
  if (/"type"\s*:\s*"user"/.test(line)) {
    // Bounded by construction: at most LARGE_LINE_PROMPT_CHARS characters are
    // captured, whatever the size of the line.
    const m = line.match(
      new RegExp(`"content"\\s*:\\s*"((?:[^"\\\\]|\\\\.){1,${LARGE_LINE_PROMPT_CHARS}})`),
    );
    if (m) userPrompt = unescape(m[1]).trim() || undefined;
  }

  return {
    cwd: cwd ? unescape(cwd) : undefined,
    gitBranch: gitBranch ? unescape(gitBranch) : undefined,
    userPrompt,
  };
}

/**
 * Flatten a message's content to text.
 *
 * `content` is a string for simple prompts and an array of typed blocks
 * otherwise. Only `text` blocks are read: a tool-result block can carry file
 * contents, and this value feeds the summarizer and (truncated) the title, so
 * pulling tool output in here would route file content somewhere it must not go.
 */
function flattenContent(content: unknown): string | null {
  if (typeof content === 'string') return content.trim() || null;
  if (!Array.isArray(content)) return null;

  const parts: string[] = [];
  for (const block of content) {
    if (block && typeof block === 'object' && (block as { type?: string }).type === 'text') {
      const text = (block as { text?: unknown }).text;
      if (typeof text === 'string') parts.push(text);
    }
  }
  const joined = parts.join('\n').trim();
  return joined || null;
}

/**
 * Whether a user entry is a real human prompt.
 *
 * The transcript's `user` entries include command echoes, local command stdout,
 * and tool results injected back into the conversation. `origin.kind` is the
 * client's own answer to this question; older transcripts predate the field, so
 * absence is treated as human and the obvious wrappers are filtered by shape.
 */
function isHumanPrompt(entry: TranscriptEntry): boolean {
  if (entry.type !== 'user') return false;
  if (entry.isMeta) return false;
  if (entry.origin?.kind && entry.origin.kind !== 'human') return false;

  const text = flattenContent(entry.message?.content);
  if (!text) return false;
  if (text.startsWith('<command-name>')) return false;
  if (text.startsWith('<local-command-stdout>')) return false;
  if (text.startsWith('<system-reminder>')) return false;
  return true;
}

export interface ProbeOptions {
  /** Bytes per chunk. Default `HEAD_BYTES`. */
  headBytes?: number;
  /** Hard ceiling across all chunks. Default `MAX_PROBE_BYTES`. */
  maxBytes?: number;
  /** Injected in tests so the read budget can be asserted. */
  readHeadImpl?: (path: string, bytes: number, offset: number) => string;
  statImpl?: (path: string) => { size: number; mtimeMs: number };
}

/**
 * Read one transcript into a `SessionObservation`.
 *
 * Returns null only when the file cannot be opened or contains no parseable
 * entry — a 0-byte file, a directory, a permissions failure. Everything else
 * yields an observation, possibly a sparse one.
 */
export function probeTranscript(
  transcriptPath: string,
  sessionUuid: string,
  options: ProbeOptions = {},
): SessionObservation | null {
  const readImpl = options.readHeadImpl ?? readHead;
  const statImpl =
    options.statImpl ??
    ((p: string) => {
      const s = statSync(p);
      return { size: s.size, mtimeMs: s.mtimeMs };
    });

  const chunkBytes = options.headBytes ?? HEAD_BYTES;
  const maxBytes = options.maxBytes ?? MAX_PROBE_BYTES;

  let size: number;
  let mtimeMs: number;
  try {
    const stat = statImpl(transcriptPath);
    size = stat.size;
    mtimeMs = stat.mtimeMs;
    if (size === 0) return null;
  } catch {
    return null;
  }

  let cwd: string | null = null;
  let gitBranch: string | null = null;
  let customTitle: string | null = null;
  let webUrl: string | null = null;
  let firstHumanPrompt: string | null = null;
  let startedAt: string | null = null;
  let parsedEntries = 0;
  let sawNonSidechain = false;
  let looksDevPilotOwned = false;
  let bytesRead = 0;
  let headSample = '';
  /** Carries a line that straddles a chunk boundary into the next chunk. */
  let carry = '';

  const handleLine = (line: string): void => {
    if (!line) return;

    // An attachment can be megabytes on one line. Parsing it to reach a
    // 40-character `cwd` is pure waste, so scrape the two flat fields instead
    // and move on. `content` is never touched on this path.
    if (line.length > LARGE_LINE_BYTES) {
      const scraped = scrapeLargeLine(line);
      if (!cwd && scraped.cwd) cwd = scraped.cwd;
      if (!gitBranch && scraped.gitBranch && scraped.gitBranch !== 'HEAD') {
        gitBranch = scraped.gitBranch;
      }
      if (!firstHumanPrompt && scraped.userPrompt) {
        firstHumanPrompt = scraped.userPrompt;
        if (DEVPILOT_PROMPT_MARKERS.some((m) => scraped.userPrompt!.includes(m))) {
          looksDevPilotOwned = true;
        }
      }
      parsedEntries++;
      return;
    }

    let entry: TranscriptEntry;
    try {
      entry = JSON.parse(line) as TranscriptEntry;
    } catch {
      return; // torn or malformed — normal, not exceptional
    }
    parsedEntries++;

    if (!entry.isSidechain) sawNonSidechain = true;
    if (!cwd && typeof entry.cwd === 'string') cwd = entry.cwd;
    if (!gitBranch && typeof entry.gitBranch === 'string' && entry.gitBranch !== 'HEAD') {
      gitBranch = entry.gitBranch;
    }
    if (entry.type === 'custom-title' && typeof entry.customTitle === 'string') {
      customTitle = entry.customTitle.trim() || null;
    }

    /**
     * Two sources, explicit preferred.
     *
     * `bridge_status` states the URL outright. `bridge-session` gives only
     * `cse_01Xdtzh…`, which is the same identifier the URL uses after
     * `session_` — so the link is reconstructable when the explicit entry falls
     * outside the sample. Reconstructing is worth it: the entries do not always
     * arrive in the same order, and a missing link is a session the cockpit can
     * show but not reach.
     */
    if (!webUrl && typeof entry.url === 'string' && entry.url.startsWith('https://claude.ai/')) {
      webUrl = entry.url;
    }
    if (!webUrl && typeof entry.bridgeSessionId === 'string') {
      const id = entry.bridgeSessionId.replace(/^cse_/, '');
      if (/^[A-Za-z0-9]{8,64}$/.test(id)) {
        webUrl = `https://claude.ai/code/session_${id}`;
      }
    }
    if (!startedAt && typeof entry.timestamp === 'string') startedAt = entry.timestamp;

    if (!firstHumanPrompt && isHumanPrompt(entry)) {
      const text = flattenContent(entry.message?.content);
      if (text) {
        firstHumanPrompt = text;
        if (DEVPILOT_PROMPT_MARKERS.some((m) => text.includes(m))) {
          looksDevPilotOwned = true;
        }
      }
    }
  };

  /**
   * Everything a title and a repo need. Reached in one chunk for most files.
   *
   * `webUrl` is deliberately NOT part of this. Requiring it would make every
   * session that was never remote-controlled — which has no link at all, and
   * never will — read to `MAX_PROBE_BYTES` looking for something that does not
   * exist. Across 670 sessions that is ~670 MB of reads to find nothing.
   *
   * The link entries appear in the first handful of lines when they exist, so
   * capturing it opportunistically inside whatever we already read costs
   * nothing and loses nothing in practice.
   */
  const satisfied = (): boolean => Boolean(cwd && customTitle && firstHumanPrompt);

  while (bytesRead < Math.min(size, maxBytes) && !satisfied()) {
    let chunk: string;
    try {
      chunk = readImpl(transcriptPath, chunkBytes, bytesRead);
    } catch {
      break;
    }
    if (!chunk) break;
    bytesRead += Buffer.byteLength(chunk, 'utf8');

    // Keep only the first chunk for the summarizer. Later chunks exist to find
    // a title past a large attachment, not to widen what a model is shown.
    if (!headSample) headSample = chunk;

    const lines = (carry + chunk).split('\n');
    // The last element is either a line straddling this chunk's end or, at EOF,
    // a torn final write. Either way it is carried rather than parsed here.
    carry = lines.pop() ?? '';
    for (const line of lines) handleLine(line);
  }

  // At EOF the carry is a complete line unless the file is being written to.
  if (carry && bytesRead >= size) handleLine(carry);

  if (parsedEntries === 0) return null;

  // Estimate from density. The sample is biased — preamble entries are smaller
  // than mid-conversation ones — so this reads high on long sessions, which is
  // why it is flagged approximate wherever it surfaces.
  const approximate = size > bytesRead;
  const messageCount = approximate
    ? Math.max(parsedEntries, Math.round((parsedEntries / bytesRead) * size))
    : parsedEntries;

  return {
    sessionUuid,
    transcriptPath,
    cwd,
    gitBranch,
    customTitle,
    webUrl,
    firstHumanPrompt,
    startedAt,
    lastActivityAt: new Date(mtimeMs).toISOString(),
    lastActivityMs: mtimeMs,
    sizeBytes: size,
    messageCount,
    messageCountIsApproximate: approximate,
    sidechainOnly: !sawNonSidechain,
    looksDevPilotOwned,
    headSample,
    bytesRead,
  };
}
