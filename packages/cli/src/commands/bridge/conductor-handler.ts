import type { BridgeClient, TaskDispatchMessage } from '@devpilot.sh/bridge-client';

/**
 * Bridge dispatch → the CONDUCTOR, rather than a single agent session.
 *
 * `createBridgeDispatchHandler` turns a Linear ticket into exactly one Claude
 * Code session. That works, but it routes the paid path around the entire
 * product thesis: DESIGN.md §1 argues the bottleneck is planning throughput, and
 * a ticket that becomes one agent is never planned, never decomposed into waves,
 * and never parallelised. This handler is the other option — the ticket lands on
 * the conductor's desk and comes back as a wave plan.
 *
 * ## Why this talks HTTP to the local cockpit
 *
 * The conductor graph lives in the Next app, not in `@devpilot.sh/core`, because
 * the langchain dependency is deliberately kept out of the package every CLI
 * install pulls down (`src/lib/conductor.ts` says so explicitly). The CLI
 * therefore cannot import it. Rather than duplicate the graph or drag langchain
 * into core, this calls the cockpit's own API — the same endpoints the Review
 * Plan button uses. The boundary stays where it was drawn.
 *
 * ## Why it does not wait for the run to finish
 *
 * The conductor stops at a human review interrupt by default, which is the point
 * of it (DESIGN.md §6 calls that "the highest-stakes interaction in DevPilot").
 * A handler that awaited approval would hold its queue claim for however long a
 * person takes to look — hours, overnight — and a held claim is invisible work
 * that the stale sweep eventually reclaims and re-runs.
 *
 * So the unit of work here is "get the ticket onto the conductor's desk and say
 * so". Wave execution and completion reporting continue under the cockpit's own
 * machinery after this returns.
 */

export interface ConductorHandlerOptions {
  client: BridgeClient;
  /** Base URL of the local cockpit (`devpilot serve`). */
  cockpitUrl: string;
  /** Bound on each cockpit call. Plan generation is a model call and is slow. */
  requestTimeoutMs?: number;
  onLog?: (line: string) => void;
}

interface HorizonItem {
  id: string;
  title?: string;
  linearTicketId?: string | null;
}

interface ConductorState {
  status?: string;
  awaiting?: 'review' | 'wave' | null;
  review?: { score?: { parallelizationScore?: number } } | null;
  errors?: string[];
}

const DEFAULT_TIMEOUT_MS = 15 * 60_000;

async function call<T>(
  url: string,
  init: RequestInit,
  timeoutMs: number
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
    });

    const text = await res.text();
    if (!res.ok) {
      // Carry the body: the cockpit reports PLAN_AI_UNAVAILABLE and
      // CONDUCTOR_FAILED with detail, and losing that turns a fixable
      // configuration problem into "the bridge failed".
      throw new Error(`${init.method ?? 'GET'} ${url} → ${res.status}: ${text.slice(0, 300)}`);
    }
    return (text ? JSON.parse(text) : {}) as T;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Find the item this ticket already created, if any.
 *
 * The hosted side dedupes Linear's own redelivery, but a claim that is released
 * and re-taken (handler threw, process died mid-run, stale sweep) arrives here
 * again with the same ticket. Without this, each retry creates another board
 * item and starts another paid planning run.
 */
async function existingItem(
  cockpitUrl: string,
  linearTicketId: string,
  timeoutMs: number
): Promise<HorizonItem | null> {
  const items = await call<HorizonItem[]>(
    `${cockpitUrl}/api/items?linearTicketId=${encodeURIComponent(linearTicketId)}`,
    { method: 'GET' },
    timeoutMs
  );
  return Array.isArray(items) && items.length > 0 ? items[0] : null;
}

/** Describe where the run got to, for the status line a human reads in Linear. */
function describe(state: ConductorState): string {
  if (state.awaiting === 'review') {
    const score = state.review?.score?.parallelizationScore;
    const pct = typeof score === 'number' ? ` (parallelization ${Math.round(score * 100)}%)` : '';
    return `Plan ready${pct} — awaiting review in the DevPilot cockpit.`;
  }
  if (state.awaiting === 'wave') return 'Plan approved — dispatching waves.';
  if (state.status === 'complete') return 'All waves complete.';
  if (state.status === 'failed') {
    return `Conductor run failed: ${state.errors?.[state.errors.length - 1] ?? 'unknown error'}`;
  }
  return `Conductor run ${state.status ?? 'started'}.`;
}

export function createConductorDispatchHandler(
  opts: ConductorHandlerOptions
): (message: TaskDispatchMessage) => Promise<void> {
  const log = opts.onLog ?? (() => {});
  const timeout = opts.requestTimeoutMs ?? DEFAULT_TIMEOUT_MS;
  const base = opts.cockpitUrl.replace(/\/$/, '');

  return async function handle(message: TaskDispatchMessage): Promise<void> {
    const { sessionId, linearIdentifier, title, repo, description } = message;
    log(`${linearIdentifier} → conductor (${repo}): ${title}`);

    try {
      let item = await existingItem(base, linearIdentifier, timeout);

      if (item) {
        log(`${linearIdentifier} already on the board as ${item.id} — reusing`);

        // Reusing the item is not enough. Posting to /conductor again starts a
        // *fresh* planning run — observed live at 236s and a full model call for
        // a ticket that was already sitting at its review gate. A redelivery
        // must not re-spend that. Only an item with no live run gets one.
        const current = await call<ConductorState>(
          `${base}/api/items/${item.id}/conductor`,
          { method: 'GET' },
          timeout
        ).catch(() => ({}) as ConductorState);

        const live =
          current.awaiting === 'review' ||
          current.awaiting === 'wave' ||
          current.status === 'planning' ||
          current.status === 'executing';

        if (live) {
          const summary = describe(current);
          log(`${linearIdentifier}: ${summary} (no new run started)`);
          await opts.client.reportSessionStatus(sessionId, {
            status: 'running',
            progressPercent: current.awaiting === 'review' ? 40 : 60,
            message: summary,
          });
          return;
        }
      } else {
        item = await call<HorizonItem>(
          `${base}/api/items`,
          {
            method: 'POST',
            body: JSON.stringify({
              title,
              repo,
              // REFINING is where an item that is about to be planned belongs;
              // DIRECTIONAL (the API default) would leave it parked as an idea.
              zone: 'REFINING',
              linearTicketId: linearIdentifier,
              description,
            }),
          },
          timeout
        );
        if (!item?.id) throw new Error('Cockpit did not return a created item id');
        log(`${linearIdentifier} → item ${item.id}`);
      }

      await opts.client.reportSessionStatus(sessionId, {
        status: 'running',
        progressPercent: 5,
        message: `On the board as ${item.id}. Planning…`,
      });

      // The planning call itself. Minutes, and it costs tokens.
      const state = await call<ConductorState>(
        `${base}/api/items/${item.id}/conductor`,
        { method: 'POST', body: JSON.stringify({}) },
        timeout
      );

      const summary = describe(state);
      log(`${linearIdentifier}: ${summary}`);

      if (state.status === 'failed') {
        throw new Error(summary);
      }

      // `running`, not a new status: SESSION_STATUSES is mirrored by a CHECK
      // constraint on dispatch_sessions.status, and its own comment requires a
      // matching migration for any new value. An "awaiting review" state is not
      // worth a schema change — the message carries it.
      await opts.client.reportSessionStatus(sessionId, {
        status: 'running',
        progressPercent: state.awaiting === 'review' ? 40 : 60,
        message: summary,
      });

      // Deliberately returns here. See the header: waiting for a human to
      // approve would strand the queue claim.
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      log(`${linearIdentifier} failed: ${reason}`);

      try {
        await opts.client.reportSessionStatus(sessionId, {
          status: 'error',
          progressPercent: 0,
          message: reason,
        });
      } catch {
        /* bridge unreachable too — the throw below still releases the claim */
      }

      // Throwing is what makes DispatchLoop release the claim for a retry.
      throw new Error(reason);
    }
  };
}
