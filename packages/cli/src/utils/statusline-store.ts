import { appendFileSync, mkdirSync, readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

/**
 * What Claude Code tells its status line, kept.
 *
 * Claude Code runs a configured command on every assistant message and hands it
 * a JSON description of the session (https://code.claude.com/docs/en/statusline).
 * Two things in that JSON are available nowhere else for a session a person
 * runs by hand:
 *
 * - `rate_limits` — how much of the 5-hour and 7-day SUBSCRIPTION windows has
 *   been used. Tokens priced at API rates are a size; this is the unit a
 *   subscriber actually runs out of.
 * - `prompt_cache` — cache misses already diagnosed by the client, with a
 *   cause, and the tokens that had to be re-written because of them.
 *
 * So `devpilot statusline` does two jobs with one read of stdin: it prints a
 * line, and it writes down what it was told. The bridge picks the record up
 * and sends it with the session's reading.
 *
 * Everything here is counts, percentages, timestamps and names from Claude
 * Code's own closed vocabulary. Nothing a person typed and nothing an agent
 * wrote passes through this module.
 *
 * The shapes below were taken from payloads captured from Claude Code 2.1.286,
 * not from the documentation's example: `rate_limits` windows come and go
 * independently (the five-hour entry is absent for a moment after it resets),
 * and `prompt_cache` is absent until the first response.
 */

/** The parts of Claude Code's status line input this module reads. */
export interface StatusInput {
  session_id?: string;
  transcript_path?: string;
  version?: string;
  model?: { id?: string; display_name?: string };
  cost?: { total_cost_usd?: number };
  context_window?: { used_percentage?: number | null; context_window_size?: number };
  rate_limits?: {
    five_hour?: { used_percentage?: number; resets_at?: number };
    seven_day?: { used_percentage?: number; resets_at?: number };
  };
  prompt_cache?: {
    warm?: boolean;
    ttl?: string;
    expires_at?: number;
    misses?: number;
    hit_ratio?: number | null;
    miss_recache_tokens?: number;
    miss_causes?: Record<string, number>;
  };
}

/** One window, as read: percent used and when it resets (epoch seconds). */
export interface WindowState {
  used: number;
  resetsAt: number;
}

/** A line of the window log: what the account's windows read, and what one session had cost by then. */
export interface WindowReading {
  /** Epoch ms the reading was taken. */
  t: number;
  /** Claude Code session id. */
  s: string;
  /** Session cost so far, USD at API list price. */
  c: number;
  five?: WindowState;
  seven?: WindowState;
}

/** What is kept per session between invocations. */
export interface SessionStatus {
  sessionId: string;
  updatedAt: number;
  model?: string;
  costUsd?: number;
  contextPeakPct?: number;
  cacheMisses?: number;
  cacheMissCauses?: Record<string, number>;
  cacheRecacheTokens?: number;
  /** The cache lifetime the session is using: `5m` or `1h`. Decides the write price. */
  cacheTtl?: string;
  five?: WindowState;
  seven?: WindowState;
  /** The last window values written to the log, so an unchanged reading is not written again. */
  logged?: { five?: WindowState; seven?: WindowState; c: number };
}

const n = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) ? v : undefined;

/** Cause names come from Claude Code; keep only ones that look like names. */
const CAUSE = /^[a-z0-9_]{1,40}$/;
const MAX_CAUSES = 16;

/** Session ids become file names. Claude Code's are uuids; refuse anything else. */
const SESSION_ID = /^[A-Za-z0-9_-]{8,80}$/;

export function statuslineDir(home: string = homedir()): string {
  // Overridable so a test run or a sandbox does not write into the real store.
  return process.env.DEVPILOT_STATUSLINE_DIR?.trim() || join(home, '.devpilot', 'statusline');
}

function windowOf(raw: { used_percentage?: number; resets_at?: number } | undefined): WindowState | undefined {
  const used = n(raw?.used_percentage);
  const resetsAt = n(raw?.resets_at);
  if (used === undefined || resetsAt === undefined) return undefined;
  return { used: Math.max(0, Math.min(100, used)), resetsAt };
}

function causesOf(raw: unknown): Record<string, number> | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const out: Record<string, number> = {};
  for (const [name, count] of Object.entries(raw as Record<string, unknown>)) {
    if (Object.keys(out).length >= MAX_CAUSES) break;
    const c = n(count);
    if (CAUSE.test(name) && c !== undefined && c >= 0) out[name] = Math.floor(c);
  }
  return out;
}

// ============================================================================
// The line
// ============================================================================

export interface RenderOptions {
  /** Epoch ms; for "resets in". */
  now: number;
  color?: boolean;
}

function inMinutes(seconds: number): string {
  const m = Math.max(0, Math.round(seconds / 60));
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return m % 60 === 0 ? `${h}h` : `${h}h${String(m % 60).padStart(2, '0')}m`;
}

/**
 * The line a person sees. Each segment is printed only when its data is there:
 * an API-key user has no windows, and a session that has not answered yet has
 * no cache statistics — and a segment reading `0%` for either would be a
 * statement about something that was not measured.
 *
 * Order is by how often it decides something: the model, how full the context
 * is, whether the cache is warm, what the session has cost, then the two
 * windows. The five-hour window carries its reset time because that is the one
 * a person paces themselves against.
 */
export function renderStatusLine(input: StatusInput, options: RenderOptions): string {
  if (!input || typeof input !== 'object') return '';
  const dim = (s: string) => (options.color ? `\u001b[2m${s}\u001b[0m` : s);
  const warn = (s: string) => (options.color ? `\u001b[33m${s}\u001b[0m` : s);
  const parts: string[] = [];

  const model = input.model?.display_name || input.model?.id;
  if (model) parts.push(model);

  const ctx = n(input.context_window?.used_percentage ?? undefined);
  if (ctx !== undefined) parts.push(`ctx ${Math.round(ctx)}%`);

  const cache = input.prompt_cache;
  if (cache && typeof cache.warm === 'boolean') {
    const misses = n(cache.misses) ?? 0;
    const state = cache.warm ? 'cache warm' : warn('cache cold');
    parts.push(misses > 0 ? `${state} · ${misses} miss${misses === 1 ? '' : 'es'}` : state);
  }

  const cost = n(input.cost?.total_cost_usd);
  if (cost !== undefined && cost > 0) parts.push(`~$${cost < 10 ? cost.toFixed(2) : cost.toFixed(0)}`);

  const five = windowOf(input.rate_limits?.five_hour);
  if (five) {
    const left = five.resetsAt - options.now / 1000;
    const text = `5h ${Math.round(five.used)}%` + (left > 0 ? ` (resets ${inMinutes(left)})` : '');
    parts.push(five.used >= 80 ? warn(text) : text);
  }
  const seven = windowOf(input.rate_limits?.seven_day);
  if (seven) {
    const text = `7d ${Math.round(seven.used)}%`;
    parts.push(seven.used >= 80 ? warn(text) : text);
  }

  return parts.join(dim(' · '));
}

// ============================================================================
// The record
// ============================================================================

function dayFile(dir: string, t: number): string {
  return join(dir, `window-${new Date(t).toISOString().slice(0, 10)}.jsonl`);
}

function sessionFile(dir: string, sessionId: string): string {
  return join(dir, 'sessions', `${sessionId}.json`);
}

export function loadSessionStatus(dir: string, sessionId: string): SessionStatus | null {
  if (!SESSION_ID.test(sessionId)) return null;
  try {
    return JSON.parse(readFileSync(sessionFile(dir, sessionId), 'utf8')) as SessionStatus;
  } catch {
    return null;
  }
}

const sameWindow = (a?: WindowState, b?: WindowState) =>
  a?.used === b?.used && a?.resetsAt === b?.resetsAt;

/**
 * Write down one status line input.
 *
 * Two files. The per-session file is the session's latest state — small,
 * overwritten atomically, read by the bridge. The day log is every CHANGE in
 * what the account's windows read, with what the reporting session had cost by
 * then; it is what `attributeWindow` works from.
 *
 * An unchanged reading is not logged. The status line runs on every assistant
 * message, and a long session would otherwise write thousands of identical
 * lines; a line is added only when a window value or the session's cost moved.
 *
 * Never throws: a status line that crashes prints nothing, and the one thing
 * this command must always do is print.
 */
export function recordStatus(input: StatusInput, dir: string, now: number): SessionStatus | null {
  if (!input || typeof input !== 'object') return null;
  const sessionId = input.session_id;
  if (!sessionId || !SESSION_ID.test(sessionId)) return null;

  try {
    mkdirSync(join(dir, 'sessions'), { recursive: true });
    const previous = loadSessionStatus(dir, sessionId);

    const five = windowOf(input.rate_limits?.five_hour);
    const seven = windowOf(input.rate_limits?.seven_day);
    const cost = n(input.cost?.total_cost_usd);
    const ctx = n(input.context_window?.used_percentage ?? undefined);
    const cache = input.prompt_cache;

    const next: SessionStatus = {
      sessionId,
      updatedAt: now,
      model: input.model?.id ?? previous?.model,
      costUsd: cost ?? previous?.costUsd,
      contextPeakPct:
        ctx !== undefined ? Math.max(ctx, previous?.contextPeakPct ?? 0) : previous?.contextPeakPct,
      // The client's counts are cumulative for the session; take them as given
      // rather than adding, and keep the last known value when a payload omits
      // the block (before the first response, and right after a compact).
      cacheMisses: n(cache?.misses) ?? previous?.cacheMisses,
      cacheMissCauses: causesOf(cache?.miss_causes) ?? previous?.cacheMissCauses,
      cacheRecacheTokens: n(cache?.miss_recache_tokens) ?? previous?.cacheRecacheTokens,
      cacheTtl: (cache?.ttl === '5m' || cache?.ttl === '1h' ? cache.ttl : undefined) ?? previous?.cacheTtl,
      // A window that is absent from this payload has not gone away: it is
      // omitted for a moment after it resets. Keep the last reading of each.
      five: five ?? previous?.five,
      seven: seven ?? previous?.seven,
      logged: previous?.logged,
    };

    if ((five || seven) && cost !== undefined) {
      const logged = previous?.logged;
      const changed =
        !logged || !sameWindow(logged.five, five) || !sameWindow(logged.seven, seven) || logged.c !== cost;
      if (changed) {
        const reading: WindowReading = { t: now, s: sessionId, c: cost, ...(five ? { five } : {}), ...(seven ? { seven } : {}) };
        appendFileSync(dayFile(dir, now), JSON.stringify(reading) + '\n');
        next.logged = { five, seven, c: cost };
      }
    }

    const file = sessionFile(dir, sessionId);
    const tmp = `${file}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(next));
    renameSync(tmp, file);
    return next;
  } catch {
    return null;
  }
}

/** A reading from a source other than the status line — the session runner's stream. */
export function recordWindowReading(reading: WindowReading, dir: string): void {
  if (!SESSION_ID.test(reading.s)) return;
  try {
    mkdirSync(dir, { recursive: true });
    appendFileSync(dayFile(dir, reading.t), JSON.stringify(reading) + '\n');
  } catch {
    // Best effort, like everything here.
  }
}

/** Every logged reading at or after `sinceMs`, oldest first. */
export function loadWindowReadings(dir: string, sinceMs: number): WindowReading[] {
  const out: WindowReading[] = [];
  let names: string[] = [];
  try {
    names = readdirSync(dir).filter((f) => /^window-\d{4}-\d{2}-\d{2}\.jsonl$/.test(f)).sort();
  } catch {
    return out;
  }
  // A day file is named in UTC; start one day early so a reading taken just
  // before midnight is not missed.
  const firstDay = new Date(sinceMs - 86_400_000).toISOString().slice(0, 10);
  for (const name of names) {
    if (name.slice(7, 17) < firstDay) continue;
    let text = '';
    try {
      text = readFileSync(join(dir, name), 'utf8');
    } catch {
      continue;
    }
    for (const line of text.split('\n')) {
      if (!line) continue;
      try {
        const r = JSON.parse(line) as WindowReading;
        if (typeof r.t === 'number' && typeof r.s === 'string' && typeof r.c === 'number' && r.t >= sinceMs) {
          out.push(r);
        }
      } catch {
        // A torn last line while another process is appending. Skip it.
      }
    }
  }
  return out.sort((a, b) => a.t - b.t);
}

/** Delete day logs older than `keepDays`. Called occasionally; never throws. */
export function pruneWindowLogs(dir: string, now: number, keepDays = 9): void {
  try {
    const cutoff = new Date(now - keepDays * 86_400_000).toISOString().slice(0, 10);
    for (const name of readdirSync(dir)) {
      if (/^window-\d{4}-\d{2}-\d{2}\.jsonl$/.test(name) && name.slice(7, 17) < cutoff) {
        unlinkSync(join(dir, name));
      }
    }
  } catch {
    // Nothing to prune, or not ours to prune.
  }
}

// ============================================================================
// Attribution
// ============================================================================

export interface WindowShare {
  /** Percentage points of the 5-hour window attributed to the session. */
  fiveHour: number | null;
  /** Percentage points of the 7-day window attributed to the session. */
  sevenDay: number | null;
}

/**
 * Share out how far a window moved among the sessions that were metered.
 *
 * WHY THIS IS NOT "LAST MINUS FIRST". The percentage Claude Code reports is the
 * ACCOUNT's: every session on every device moves the same number. Two agents
 * running side by side each see the window go from 20% to 30%, and a per-session
 * subtraction would report ten points twice. On a fleet — which is the case
 * this product exists for — nearly every reading would be wrong that way.
 *
 * WHAT IT DOES INSTEAD. For each reset window (one value of `resetsAt`):
 *
 *   moved   = the sum of every increase in the window's reading between one
 *             logged reading and the next, whichever sessions took them
 *   cost_s  = what session s's cost rose by between its own first and last
 *             reading in that window
 *   share_s = moved × cost_s ÷ Σ cost
 *
 * The points are shared in proportion to API-rate cost, because cost is the
 * one measure of "how much model" that every session reports in the same unit.
 * Summed over sessions, the shares equal `moved` exactly — so a period's total
 * is right even where a single session's share is rough.
 *
 * WHAT IT CANNOT SEE, and the reason every surface calls this an estimate:
 *
 * - The window also moves for usage this machine did not meter — another
 *   device, the web app, a session with no status line. That movement is in
 *   `moved`, and it lands on the sessions that were metered.
 * - Usage before the first reading in a window is not in `moved` at all.
 * - The subscription does not charge the window in proportion to list price
 *   exactly; cost is a proxy for it.
 *
 * A session whose cost did not rise in a window gets zero from it. A window in
 * which no session's cost rose is left unattributed (null) rather than shared
 * equally among sessions that did nothing.
 */
export function attributeWindow(readings: readonly WindowReading[]): Map<string, WindowShare> {
  const shares = new Map<string, WindowShare>();
  const add = (s: string, key: 'fiveHour' | 'sevenDay', points: number) => {
    const share = shares.get(s) ?? { fiveHour: null, sevenDay: null };
    share[key] = (share[key] ?? 0) + points;
    shares.set(s, share);
  };

  const ordered = [...readings].sort((a, b) => a.t - b.t);

  for (const [field, key] of [
    ['five', 'fiveHour'],
    ['seven', 'sevenDay'],
  ] as const) {
    // Group the readings that carry this window by the window they belong to.
    const byReset = new Map<number, WindowReading[]>();
    for (const r of ordered) {
      const w = r[field];
      if (!w) continue;
      const list = byReset.get(w.resetsAt) ?? [];
      list.push(r);
      byReset.set(w.resetsAt, list);
    }

    for (const list of byReset.values()) {
      let moved = 0;
      for (let i = 1; i < list.length; i++) {
        const delta = list[i][field]!.used - list[i - 1][field]!.used;
        // A reading can arrive slightly out of order from two processes; a
        // window does not go down within one reset period.
        if (delta > 0) moved += delta;
      }

      const first = new Map<string, number>();
      const last = new Map<string, number>();
      for (const r of list) {
        if (!first.has(r.s)) first.set(r.s, r.c);
        last.set(r.s, r.c);
      }
      let total = 0;
      const rose = new Map<string, number>();
      for (const [s, start] of first) {
        const d = Math.max(0, (last.get(s) ?? start) - start);
        rose.set(s, d);
        total += d;
      }

      // Every session that had a reading in this window has a figure for it,
      // even if the figure is zero — "measured, and none" is different from
      // "not measured".
      //
      // When nobody's cost rose while the window moved, the movement was all
      // someone else's: these sessions stay at zero and it is attributed to
      // nobody.
      for (const [s, d] of rose) add(s, key, total > 0 ? (moved * d) / total : 0);
    }
  }

  return shares;
}

/** The fields a session's reading carries to the hosted plane. All optional. */
export interface WindowFields {
  windowUsed5h?: number;
  windowUsed7d?: number;
  windowResets5h?: string;
  windowResets7d?: string;
  windowDelta5h?: number;
  windowDelta7d?: number;
  cacheMisses?: number;
  cacheMissCauses?: Record<string, number>;
  cacheRecacheTokens?: number;
  contextPeakPct?: number;
}

const round2 = (v: number) => Math.round(v * 100) / 100;

/**
 * What to send for one Claude Code session, or an empty object when nothing
 * was recorded for it — a machine where `devpilot statusline` is not installed,
 * or a session that started before it was.
 *
 * `lookbackMs` bounds the log read. The seven-day window is the longest thing
 * attributed, so eight days covers it.
 */
export function windowFieldsFor(
  dir: string,
  sessionId: string,
  now: number,
  lookbackMs = 8 * 86_400_000
): WindowFields {
  const status = loadSessionStatus(dir, sessionId);
  if (!status) return {};

  const fields: WindowFields = {};
  if (status.five) {
    fields.windowUsed5h = round2(status.five.used);
    fields.windowResets5h = new Date(status.five.resetsAt * 1000).toISOString();
  }
  if (status.seven) {
    fields.windowUsed7d = round2(status.seven.used);
    fields.windowResets7d = new Date(status.seven.resetsAt * 1000).toISOString();
  }
  if (status.cacheMisses !== undefined) fields.cacheMisses = status.cacheMisses;
  if (status.cacheMissCauses && Object.keys(status.cacheMissCauses).length > 0) {
    fields.cacheMissCauses = status.cacheMissCauses;
  }
  if (status.cacheRecacheTokens !== undefined) fields.cacheRecacheTokens = status.cacheRecacheTokens;
  if (status.contextPeakPct !== undefined) fields.contextPeakPct = round2(status.contextPeakPct);

  const share = attributeWindow(loadWindowReadings(dir, now - lookbackMs)).get(sessionId);
  if (share?.fiveHour !== null && share?.fiveHour !== undefined) fields.windowDelta5h = round2(share.fiveHour);
  if (share?.sevenDay !== null && share?.sevenDay !== undefined) fields.windowDelta7d = round2(share.sevenDay);

  return fields;
}
