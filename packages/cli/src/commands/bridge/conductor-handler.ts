import type { BridgeClient, MirroredPlan, TaskDispatchMessage } from '@devpilot.sh/bridge-client';
import type { ConductorWatcher } from './conductor-watcher';

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
  /**
   * Watches handed-off runs and reports completion to the bridge, which is what
   * triggers the Linear write-back. Optional: without it a planned ticket runs
   * to completion and Linear is never told.
   */
  watcher?: ConductorWatcher;
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
  review?: {
    score?: { parallelizationScore?: number };
    /** Carried so the review message can say how big the plan is, not just that
        one exists — "2 waves, 9 tasks, 89% parallel" is a decision; "plan
        ready" is a notification. It is also what gets mirrored to the hosted
        cockpit. */
    plan?: PlanShape;
  } | null;
  errors?: string[];
}

/** The planner's output, as the cockpit returns it. */
interface PlanShape {
  waves?: {
    label?: string;
    tasks?: {
      taskCode?: string;
      description?: string;
      filePaths?: string[];
      complexity?: string;
      recommendedModel?: string;
      canRunInParallel?: boolean;
    }[];
  }[];
  dependencyEdges?: { from: string; to: string; type?: string }[];
  criticalPath?: string[];
}

/**
 * The planner writes file paths as markdown code spans — `` `src/lib/x.ts` `` —
 * because its output is a markdown table. Storing the backticks would push them
 * into every hosted surface that renders a path.
 */
function cleanPath(value: string): string {
  return value.replace(/`/g, '').trim();
}

/**
 * Reshape a plan for the hosted cockpit.
 *
 * Structure only. Task descriptions and file paths cross the boundary; nothing
 * that could carry file contents does, and the hosted schema has no column for
 * it either.
 */
function toMirroredPlan(
  plan: PlanShape,
  itemId: string,
  parallelization?: number
): MirroredPlan {
  return {
    cockpitItemId: itemId,
    parallelization,
    waves: (plan.waves ?? []).map((w) => ({
      label: w.label,
      tasks: (w.tasks ?? []).map((t) => ({
        taskCode: t.taskCode ?? '',
        description: t.description ?? '',
        filePaths: (t.filePaths ?? []).map(cleanPath),
        complexity: t.complexity,
        recommendedModel: t.recommendedModel,
        canRunInParallel: t.canRunInParallel,
      })),
    })),
    dependencyEdges: plan.dependencyEdges ?? [],
    criticalPath: plan.criticalPath ?? [],
  };
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
/**
 * Deep links back into the cockpit.
 *
 * These messages become agent activities on the Linear issue, and they used to
 * name the board item as a bare id — "On the board as ds21hni0xpviz…" — which
 * is a fact you cannot act on. The whole point of the review gate is that a
 * human goes and looks; telling them where without letting them go there is the
 * wrong half of the sentence.
 *
 * Linear renders activity bodies as markdown, so these are real links. They
 * point at the cockpit, which is the machine the bridge runs on: the hosted
 * plane never sees a plan, so there is nothing to link to there.
 */
/**
 * Where a link in a Linear activity should send someone.
 *
 * The first version pointed at the local cockpit — `127.0.0.1:3100/?item=…` —
 * which is a dead link for anyone not sitting at the machine the bridge runs
 * on. Most people on the hosted product never run that app at all, so the link
 * has to go to the hosted session page, which renders the mirrored plan with
 * the same cockpit components.
 */
function sessionLink(hosted: string, sessionId: string): string {
  return `${hosted}/sessions/${sessionId}`;
}

/**
 * The hosted base URL, or empty if this client cannot say.
 *
 * `hostedUrl` arrived in a later bridge-client, and calling it unconditionally
 * threw on an older one — propagating out, releasing the queue claim and
 * failing the ticket. That is the second time a *link* nearly cost a dispatch;
 * a message that cannot be decorated is still a message worth sending.
 */
function hostedBase(client: BridgeClient): string {
  return typeof client.hostedUrl === 'function' ? client.hostedUrl() : '';
}

/** A markdown link, or bare text when we have nowhere to point. */
function linkOrText(hosted: string, sessionId: string, text: string): string {
  return hosted ? `[${text}](${sessionLink(hosted, sessionId)})` : text;
}

function describe(state: ConductorState, hosted: string, sessionId: string): string {
  if (state.awaiting === 'review') {
    const score = state.review?.score?.parallelizationScore;
    const waves = state.review?.plan?.waves?.length;
    const tasks = state.review?.plan?.waves?.reduce(
      (n, w) => n + (w.tasks?.length ?? 0),
      0
    );
    // Assembled from the parts that exist. The shape is absent on a run whose
    // plan we have not read back, and stitching in a placeholder produced
    // "Plan ready — Plan ready, 88% parallel".
    const parts = [
      waves && tasks ? `${waves} wave${waves === 1 ? '' : 's'}, ${tasks} tasks` : null,
      typeof score === 'number' ? `${Math.round(score * 100)}% parallel` : null,
    ].filter(Boolean);
    const shape = parts.length ? ` — ${parts.join(', ')}` : '';
    return `Plan ready${shape}. ${linkOrText(hosted, sessionId, 'Review it in the cockpit')} to dispatch, or reply here with constraints to re-plan. Awaiting review.`;
  }
  if (state.awaiting === 'wave') {
    return `Plan approved — dispatching waves. ${linkOrText(hosted, sessionId, 'Watch the waves')}.`;
  }
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
          const summary = describe(current, hostedBase(opts.client), sessionId);
          log(`${linearIdentifier}: ${summary} (no new run started)`);
          await opts.client.reportSessionStatus(sessionId, {
            status: 'running',
            progressPercent: current.awaiting === 'review' ? 40 : 60,
            message: summary,
          });
          // Still hand it to the watcher: this claim is a *new* bridge session
          // for a run that was already in flight, and its completion has to be
          // reported against this session id or Linear never hears back.
          opts.watcher?.watch({ sessionId, itemId: item.id, linearIdentifier });
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
        message: `Planning — ${linkOrText(hostedBase(opts.client), sessionId, 'open it in the cockpit')}.`,
      });

      // The planning call itself. Minutes, and it costs tokens.
      const state = await call<ConductorState>(
        `${base}/api/items/${item.id}/conductor`,
        { method: 'POST', body: JSON.stringify({}) },
        timeout
      );

      const summary = describe(state, hostedBase(opts.client), sessionId);
      log(`${linearIdentifier}: ${summary}`);

      /**
       * Mirror the plan so it is visible on devpilot.sh, not only on this
       * machine. Best-effort: the run is real work already underway, and losing
       * it because a display copy failed to upload would be an absurd trade.
       */
      // The capability check is not defensive noise. `mirrorSessionPlan` arrived
      // in a later bridge-client, and a client without it threw a TypeError
      // here — which propagates, releases the queue claim, and fails the ticket.
      // Losing real work because a *display copy* could not be uploaded is
      // exactly the trade this must never make.
      if (state.review?.plan?.waves?.length && typeof opts.client.mirrorSessionPlan === 'function') {
        const mirrored = await opts.client.mirrorSessionPlan(
          sessionId,
          toMirroredPlan(
            state.review.plan,
            item.id,
            state.review.score?.parallelizationScore
          )
        );
        log(
          `${linearIdentifier}: plan ${mirrored ? 'mirrored to the hosted cockpit' : 'not mirrored (hosted unreachable)'}`
        );
      }

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

      // The run continues under the cockpit after this returns, so completion
      // is the watcher's job — it is what eventually calls
      // reportSessionComplete and makes the hosted side write back to Linear.
      opts.watcher?.watch({ sessionId, itemId: item.id, linearIdentifier });

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
