/**
 * Token usage, counted once per model response.
 *
 * Claude Code writes one transcript line per CONTENT BLOCK, and every line of a
 * response repeats that response's full `usage`. A reply with a text block and
 * two tool calls is three lines carrying the same numbers three times, so
 * summing line by line overcounts — measured against real transcripts, by 2× to
 * 5×, never by a constant factor you could divide back out.
 *
 * The lines of one response share a `message.id` and are always adjacent, so
 * the meter remembers the response it counted last and REPLACES its
 * contribution when the same id comes round again, instead of adding to it.
 * That is exact for the adjacent case and for a response whose usage grows
 * between lines, which a "skip if seen" rule would get wrong.
 *
 * The state is plain data on purpose: the adoption watcher persists it in its
 * ledger, so a restarted bridge resumes the count instead of starting from zero
 * halfway through a session.
 *
 * Nothing here reads content. Counts are derived facts in the sense the
 * telemetry schema means — they say how much, never what.
 */

/** Usage as Claude Code reports it on an assistant message. */
export interface RawUsage {
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
  /** How the cache write splits by lifetime, when the client reports it. */
  cache_creation?: {
    ephemeral_5m_input_tokens?: number;
    ephemeral_1h_input_tokens?: number;
  };
}

export interface UsageTotals {
  /** Input tokens processed fresh — not served from the prompt cache. */
  input: number;
  output: number;
  /** Input tokens served from the prompt cache. */
  cacheRead: number;
  /** Input tokens written to the prompt cache, at either lifetime. */
  cacheWrite: number;
  /**
   * Of `cacheWrite`, how many were written with the one-hour lifetime. Kept
   * only because it is priced differently; it is part of `cacheWrite`, not in
   * addition to it.
   */
  cacheWrite1h?: number;
}

export interface UsageMeterState {
  totals: UsageTotals;
  /** Model responses seen: one per message id, not per transcript line. */
  turns: number;
  /** The response counted last, so its repeated lines replace rather than add. */
  last: { id: string; model?: string; counted: UsageTotals } | null;
  /**
   * The same totals split by model, because a session is rarely one model —
   * the main loop on one, background calls and subagents on another — and
   * their prices differ by an order of magnitude.
   */
  byModel?: Record<string, UsageTotals>;
}

export function emptyUsage(): UsageTotals {
  return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cacheWrite1h: 0 };
}

export function initialUsageMeter(): UsageMeterState {
  return { totals: emptyUsage(), turns: 0, last: null };
}

function toTotals(usage: RawUsage): UsageTotals {
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0);
  const cacheWrite = n(usage.cache_creation_input_tokens);
  return {
    input: n(usage.input_tokens),
    output: n(usage.output_tokens),
    cacheRead: n(usage.cache_read_input_tokens),
    cacheWrite,
    // Never more than the write it is part of, whatever the client reports.
    cacheWrite1h: Math.min(n(usage.cache_creation?.ephemeral_1h_input_tokens), cacheWrite),
  };
}

function apply(into: UsageTotals, add: UsageTotals, subtract?: UsageTotals): void {
  into.input += add.input - (subtract?.input ?? 0);
  into.output += add.output - (subtract?.output ?? 0);
  into.cacheRead += add.cacheRead - (subtract?.cacheRead ?? 0);
  into.cacheWrite += add.cacheWrite - (subtract?.cacheWrite ?? 0);
  into.cacheWrite1h = (into.cacheWrite1h ?? 0) + (add.cacheWrite1h ?? 0) - (subtract?.cacheWrite1h ?? 0);
}

/** `<synthetic>` and friends are the client talking to itself, not a model. */
function modelKey(model: string | null | undefined): string | null {
  if (!model || model.startsWith('<')) return null;
  return model.slice(0, 80);
}

/**
 * Count one assistant line's usage into the meter.
 *
 * A line with no message id cannot be recognised if it repeats, so it is
 * counted as its own response. That errs toward overcounting a shape that has
 * not been observed rather than dropping usage that was really spent.
 */
export function countUsage(
  state: UsageMeterState,
  messageId: string | null | undefined,
  usage: RawUsage | null | undefined,
  model?: string | null,
): void {
  if (!usage) return;
  const next = toTotals(usage);
  const key = modelKey(model);
  const bucket = key ? ((state.byModel ??= {})[key] ??= emptyUsage()) : null;

  if (messageId && state.last?.id === messageId) {
    const prev = state.last.counted;
    apply(state.totals, next, prev);
    // The model of a response does not change between its lines; the bucket
    // it was first counted into is the one corrected.
    const earlier = state.last.model ? state.byModel?.[state.last.model] : null;
    if (earlier) apply(earlier, next, prev);
    state.last.counted = next;
    return;
  }

  apply(state.totals, next);
  if (bucket) apply(bucket, next);
  state.turns += 1;
  state.last = messageId ? { id: messageId, model: key ?? undefined, counted: next } : null;
}

/** Every token the model processed, cached or not. */
export function totalTokens(t: UsageTotals): number {
  return t.input + t.output + t.cacheRead + t.cacheWrite;
}

/**
 * Per-million-token API list prices, by model family.
 *
 * WHAT THIS IS FOR. Token types are not comparable as counts — a cached read
 * costs a fortieth of an output token — so "how big was this session" needs a
 * common unit, and the public one is what the tokens would cost on the API.
 * On a subscription nobody is billed this. It is a size, labelled as an
 * estimate everywhere it is shown.
 *
 * WHY BY MODEL. This was one table of Opus rates applied to everything, which
 * overstated a Sonnet or Haiku session several times over and, once newer
 * models were priced lower, overstated those too.
 *
 * Matched by prefix, longest first, because the ids in a transcript carry
 * suffixes (`claude-opus-5[1m]`, `claude-haiku-4-5-20251001`). An unrecognised
 * model is priced at the default rather than at zero: an estimate that is a
 * little off is more useful than a session that appears to have been free.
 *
 * As of 2026-09-25. Prices move; this table is the kind of thing that has to
 * be kept current, and it is one place to do it.
 */
interface Price {
  input: number;
  output: number;
  cacheRead: number;
  /** Five-minute cache write. The one-hour write is `input × 2`. */
  cacheWrite: number;
}

/** Standard multipliers where a model has no special rate: read 0.1×, write 1.25×. */
function standard(input: number, output: number, cacheRead = input * 0.1): Price {
  return { input, output, cacheRead, cacheWrite: input * 1.25 };
}

const PRICES: [prefix: string, price: Price][] = [
  ['claude-fable-5-1', standard(10, 50, 0.25)],
  ['claude-mythos-5-1', standard(10, 50, 0.25)],
  ['claude-fable-5', standard(10, 50)],
  ['claude-mythos-5', standard(10, 50)],
  ['claude-opus-5-5', standard(4, 20, 0.2)],
  ['claude-opus-5', standard(5, 25)],
  ['claude-opus-4', standard(5, 25)],
  ['claude-sonnet-5-5', standard(2, 10)],
  ['claude-sonnet-5', standard(2, 10)],
  ['claude-sonnet-4', standard(3, 15)],
  ['claude-haiku-4-5', standard(1, 5)],
];

const DEFAULT_PRICE = standard(5, 25);

function priceFor(model: string | null | undefined): Price {
  if (!model) return DEFAULT_PRICE;
  for (const [prefix, price] of PRICES) if (model.startsWith(prefix)) return price;
  return DEFAULT_PRICE;
}

/** What these tokens would cost on the API at list price, for one model. */
export function priceUsage(t: UsageTotals, model?: string | null): number {
  const p = priceFor(model);
  const m = 1_000_000;
  const write1h = Math.min(t.cacheWrite1h ?? 0, t.cacheWrite);
  return (
    (t.input * p.input) / m +
    (t.output * p.output) / m +
    (t.cacheRead * p.cacheRead) / m +
    ((t.cacheWrite - write1h) * p.cacheWrite) / m +
    (write1h * p.input * 2) / m
  );
}

/**
 * The same, for a whole meter: each model's tokens at that model's price.
 *
 * Falls back to pricing the grand total at the default when nothing was
 * attributed to a model — a meter restored from before models were recorded.
 */
export function priceMeter(state: UsageMeterState): number {
  const models = Object.entries(state.byModel ?? {});
  if (models.length === 0) return priceUsage(state.totals);

  let cost = 0;
  const attributed = emptyUsage();
  for (const [model, totals] of models) {
    cost += priceUsage(totals, model);
    apply(attributed, totals);
  }
  // Anything counted before models were tracked, or with no model named.
  const rest: UsageTotals = {
    input: Math.max(0, state.totals.input - attributed.input),
    output: Math.max(0, state.totals.output - attributed.output),
    cacheRead: Math.max(0, state.totals.cacheRead - attributed.cacheRead),
    cacheWrite: Math.max(0, state.totals.cacheWrite - attributed.cacheWrite),
    cacheWrite1h: Math.max(0, (state.totals.cacheWrite1h ?? 0) - (attributed.cacheWrite1h ?? 0)),
  };
  return cost + priceUsage(rest);
}

/**
 * What the same tokens would have cost on the most expensive model.
 *
 * This is the baseline the Conductor Score's cost dimension is measured
 * against: the saving a fleet made by not running everything on the costliest
 * option. The comparison holds the tokens fixed and changes only the model, so
 * `priceMeter` and this come from one table and differ in nothing else.
 *
 * "Most expensive" is not one model. Prices are set per kind of token, and no
 * model is dearest at all of them — one charges the most for output, another
 * the most for a cached read, and a long agent session is almost entirely
 * cached reads. So the reference is whichever model on the list would have
 * charged the most FOR THESE TOKENS, and its name travels with the figure:
 * two savings are comparable only if they were measured against the same one.
 *
 * Returns null when there is nothing to price.
 */
export function priceAtReference(t: UsageTotals): { costUsd: number; model: string } | null {
  if (totalTokens(t) <= 0) return null;
  let best: { costUsd: number; model: string } | null = null;
  for (const [model] of PRICES) {
    const costUsd = priceUsage(t, model);
    // Strictly greater, so a tie goes to the model listed first.
    if (!best || costUsd > best.costUsd) best = { costUsd, model };
  }
  return best;
}

/**
 * The model that did most of the work, by tokens processed.
 *
 * One name per session is a simplification, and a deliberate one: it is what a
 * person means by "which model was that session on", and it is the grouping a
 * comparison between sessions needs. The suffix a client adds for a context
 * window (`[1m]`) is dropped so the same model is not two rows.
 */
export function dominantModel(state: UsageMeterState): string | null {
  let best: string | null = null;
  let most = -1;
  for (const [model, totals] of Object.entries(state.byModel ?? {})) {
    const size = totalTokens(totals);
    if (size > most) {
      most = size;
      best = model;
    }
  }
  return best ? best.replace(/\[[^\]]*\]$/, '') : null;
}
