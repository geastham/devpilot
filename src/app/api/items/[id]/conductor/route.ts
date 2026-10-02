import { NextRequest, NextResponse } from 'next/server';
import { Command, type ReviewDecision } from '@devpilot.sh/conductor-agent';
import { db, horizonItems, wavePlans, rufloSessions, activityEvents, eq, and, desc, inArray, sql } from '@/lib/db';
import { getConductorGraph, threadFor } from '@/lib/conductor-graph';
import { withConductorRun } from '@/lib/conductor-resume';
import { getServerOrchestrator } from '@/lib/orchestrator';
import { recordRun } from '@/lib/conductor-memory';
import {
  assignWaves,
  buildSpecContentForItem,
  codeGraphOf,
  dependentClaimsOf,
  describeCodeGraph,
  type CodeGraphReview,
  type ParsedWavePlan,
  type PlanCodeGraph,
  type WaveAdjustment,
  recordPlanReview,
} from '@devpilot.sh/core/wave-planner';

// Never prerendered. A GET handler that touches no request API is treated by
// `next build` as static, and its build-time answer is then served for ever —
// see tests/e2e/cockpit-routes.test.ts in packages/cli.
export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * The conductor run for one horizon item (TRD-01 §7 + docs/CONDUCTOR-AGENT.md).
 *
 *   POST                      → start a run; returns the review request it stops at
 *   POST { decision: … }      → resume a run paused at review
 *   POST { waveOutcome: … }   → resume a run paused waiting for a wave
 *   GET                       → current state without advancing it
 *
 * Every answer carries `codeGraph`: whether the plan was laid out with a code
 * graph, each task's blast radius, and the tasks it sequenced — see
 * `codeGraphFor`.
 *
 * One thread per item, so a second POST while a run is live resumes that run
 * rather than starting a competing one.
 */

/**
 * Write the run record when a run reaches a terminal state (TRD-15 Wave 2).
 *
 * Here rather than in the graph's event sink: the sink receives events with no
 * state attached, so it would need a module-level "last plan id" — which is
 * wrong on the adopt path, where `plan:approved` never fires because no plan was
 * generated. The route knows the id on every path.
 *
 * Terminal, not per-wave: achieved parallelism, total cost and file contention
 * are properties of the whole run.
 */
function maybeRecord(result: Record<string, unknown>): void {
  const status = result.status;
  const wavePlanId = result.wavePlanId;
  if (status !== 'complete' && status !== 'failed') return;
  if (typeof wavePlanId !== 'string') return;
  void recordRun(wavePlanId);
}

/**
 * Record a review decision against the plan that was on screen.
 *
 * The plan is read from the run's own state rather than from the request: the
 * request says what was decided, and only the checkpoint knows what about.
 */
async function recordReview(
  itemId: string,
  decision: ReviewDecision,
  graph: ReturnType<typeof getConductorGraph>,
  thread: ReturnType<typeof threadFor>
): Promise<void> {
  try {
    if (!decision || !['approve', 'refine', 'abort'].includes(decision.action)) return;
    const values = (await graph.getState(thread)).values as {
      plan?: { rawMarkdown?: unknown } | null;
      score?: { parallelizationScore?: unknown } | null;
    };
    const rawMarkdown = typeof values.plan?.rawMarkdown === 'string' ? values.plan.rawMarkdown : null;
    const score = typeof values.score?.parallelizationScore === 'number' ? values.score.parallelizationScore : null;
    await recordPlanReview({
      itemId,
      rawMarkdown,
      action: decision.action,
      constraints: decision.action === 'refine' ? decision.constraints : undefined,
      reason: decision.action === 'abort' ? decision.reason : undefined,
      score,
    });
  } catch {
    // A record of a decision must never be the reason the decision is lost.
  }
}

/** Shape the graph's return into something the UI can branch on. */
function describe(result: Record<string, unknown>) {
  const interrupts = (result.__interrupt__ ?? []) as Array<{ value?: unknown }>;
  const pending = interrupts[0]?.value as Record<string, unknown> | undefined;

  // A wave-wait interrupt carries a waveIndex; a review interrupt carries a plan.
  const waiting = pending && 'waveIndex' in pending;

  return {
    status: result.status,
    awaiting: pending ? (waiting ? 'wave' : 'review') : null,
    review: pending && !waiting ? pending : null,
    wave: waiting ? pending : null,
    wavePlanId: result.wavePlanId ?? null,
    lastDispatch: result.lastDispatch ?? null,
    currentWaveIndex: result.currentWaveIndex ?? 0,
    completedWaves: result.completedWaves ?? [],
    score: result.score ?? null,
    refinementIterations: result.refinementIterations ?? 0,
    tokensUsed: result.tokensUsed ?? 0,
    errors: result.errors ?? [],
  };
}

/**
 * What a code graph said about the run's plan, for whoever is reviewing it:
 * per task, how many files depend on what it changes and which; and each task
 * the wave assigner moved because of a dependency, in a sentence (TRD 27 §5.1,
 * §5.3).
 *
 * Two sources, because a plan lives in two places over its life:
 *
 *  - Once approved it is a row, and the row holds both the graph's reading and
 *    the adjustments the assigner actually made. That is the record.
 *  - At review it exists only in the run's state. The reading is on the plan
 *    (the generate port put it there), and the adjustments are worked out here
 *    by running the same deterministic assigner over the same claims — which
 *    is what `persistPlan` will do if the plan is approved, so the preview and
 *    the record cannot disagree.
 *
 * `null` means nobody asked: there is no plan yet, or the plan was made before
 * this existed. That is different from `{ used: false, reason }`, which is a
 * plan that was made without the graph and says why. Neither is an error, and
 * the run proceeds identically in all three cases.
 */
async function codeGraphFor(result: Record<string, unknown>): Promise<CodeGraphReview | null> {
  if (typeof result.wavePlanId === 'string') {
    const row = await db.query.wavePlans.findFirst({
      where: eq(wavePlans.id, result.wavePlanId),
      columns: { codeGraph: true, adjustments: true },
    });
    if (row) {
      // Shape-checked like the one in state: it is JSON another version may
      // have written.
      const recorded = codeGraphOf({ codeGraph: row.codeGraph });
      return recorded ? describeCodeGraph(recorded, row.adjustments ?? null) : null;
    }
  }

  const interrupts = (result.__interrupt__ ?? []) as Array<{ value?: unknown }>;
  const reviewing = (interrupts[0]?.value as { plan?: unknown } | undefined)?.plan;
  const plan = reviewing ?? result.plan;

  const codeGraph = codeGraphOf(plan);
  if (!codeGraph) return null;
  return describeCodeGraph(codeGraph, previewAdjustments(plan as ParsedWavePlan, codeGraph));
}

/**
 * The adjustments approving this plan would produce. Null when they cannot be
 * worked out — a plan in state that the assigner rejects (a cycle) — so that
 * "could not say" is never shown as "moved nothing".
 */
function previewAdjustments(plan: ParsedWavePlan, codeGraph: PlanCodeGraph): WaveAdjustment[] | null {
  try {
    const dependentClaims = dependentClaimsOf(codeGraph);
    return assignWaves(
      (plan.waves ?? []).flatMap((wave) => wave.tasks ?? []),
      plan.dependencyEdges ?? [],
      dependentClaims ? { dependentClaims } : undefined
    ).adjustments;
  } catch {
    return null;
  }
}

/** `describe`, plus the code graph block — which needs the database. */
async function respond(result: Record<string, unknown>) {
  return { ...describe(result), codeGraph: await codeGraphFor(result) };
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({} as Record<string, unknown>));

    const item = await db.query.horizonItems.findFirst({
      where: eq(horizonItems.id, id),
      // The spec builder renders an "Implementation Plan" section from the
      // plan's workstreams and their tasks. `plan: true` loads the plan row
      // alone, so that section was empty for every item that had one — the
      // planner was handed the acceptance criteria and none of the existing
      // decomposition.
      with: { plan: { with: { workstreams: { with: { tasks: true } } } } },
    });
    if (!item) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 });
    }

    const graph = getConductorGraph();
    const thread = threadFor(id);

    // Every invoke below goes through `withConductorRun`: one thing at a time
    // per run. The execution bridge resumes this same thread as tasks settle,
    // and a completion arriving while an approval is still dispatching its
    // first wave would otherwise find the run "not waiting" and be dropped —
    // or, worse, resume it concurrently.

    // --- Resume paths -------------------------------------------------------
    if (body.decision) {
      // What the reviewer decided, about which plan — written before the run
      // moves on, so that an approval is on record when the plan it approves
      // is persisted and claims it. Every review comes through here: the
      // cockpit's panel, and a decision made on the hosted plane and applied
      // by the bridge. Never fails the request.
      await recordReview(id, body.decision as ReviewDecision, graph, thread);

      const result = await withConductorRun(id, () =>
        graph.invoke(new Command({ resume: body.decision as ReviewDecision }), thread)
      );
      maybeRecord(result as Record<string, unknown>);
      return NextResponse.json(await respond(result as Record<string, unknown>));
    }

    if (body.waveOutcome) {
      const result = await withConductorRun(id, () =>
        graph.invoke(new Command({ resume: body.waveOutcome }), thread)
      );
      maybeRecord(result as Record<string, unknown>);
      return NextResponse.json(await respond(result as Record<string, unknown>));
    }

    // --- Start --------------------------------------------------------------
    // Planning needs a key; adopting an already-approved plan does not, which is
    // why the check sits here rather than at the top of the handler.
    const adopting = Boolean(body.wavePlanId && body.plan);
    if (!adopting && !process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        {
          error: 'PLAN_AI_UNAVAILABLE',
          detail: 'ANTHROPIC_API_KEY is not configured',
        },
        { status: 503 }
      );
    }

    // Same spec text the existing plan-generate route feeds the planner, so a
    // conductor run and a direct generation see identical input. The ticket
    // description goes with it: without it a ticket was planned from its title.
    const specContent = adopting
      ? ''
      : buildSpecContentForItem({
          title: item.title,
          description: item.description,
          plan: item.plan as Parameters<typeof buildSpecContentForItem>[0]['plan'],
        });

    const result = await withConductorRun(id, () =>
      graph.invoke(
        {
          itemId: id,
          itemTitle: item.title,
          repo: item.repo,
          specContent,
          ...(adopting ? { plan: body.plan, wavePlanId: body.wavePlanId } : {}),
        },
        thread
      )
    );

    maybeRecord(result as Record<string, unknown>);
    return NextResponse.json(await respond(result as Record<string, unknown>));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Conductor run failed:', error);
    return NextResponse.json({ error: 'CONDUCTOR_FAILED', detail: message }, { status: 500 });
  }
}

/**
 * What the run has actually produced, for reporting back to Linear.
 *
 * The graph state knows where a run *is*; it does not know what it has *done* —
 * which files changed, what it cost, how many tasks are finished. That lives in
 * the wave plan and the sessions its tasks were dispatched to, and until now
 * nothing joined the two. So Linear, the source of record, recorded that
 * something happened and stopped there.
 */
async function outcomeFor(itemId: string) {
  const plan = await db.query.wavePlans.findFirst({
    where: eq(wavePlans.horizonItemId, itemId),
    orderBy: desc(wavePlans.createdAt),
    with: { waveTasks: true },
  });
  if (!plan) return null;

  type OutcomeTask = {
    status: string;
    waveIndex: number;
    taskCode: string;
    assignedSessionId: string | null;
    errorMessage: string | null;
    branch: string | null;
    commitSha: string | null;
    filesChanged: string[] | null;
    mergedAt: Date | null;
  };
  const tasks = (plan.waveTasks ?? []) as OutcomeTask[];
  const done = tasks.filter((t) => t.status === 'completed');
  const failed = tasks.filter((t) => t.status === 'failed');
  const skipped = tasks.filter((t) => t.status === 'skipped');

  const sessionIds = tasks
    .map((t) => t.assignedSessionId)
    .filter((v): v is string => Boolean(v));

  const sessions = sessionIds.length
    ? await db.query.rufloSessions.findMany({ where: inArray(rufloSessions.id, sessionIds) })
    : [];

  // Union, not sum: three agents editing one file is one changed file, and a
  // count that double-reports would overstate the blast radius of a run.
  //
  // A task that ran on its own branch has an exact list — git's diff of that
  // branch — and it is used in place of what the session's tool calls were
  // seen to write, which misses anything a shell command changed.
  const files = new Set<string>();
  const exact = new Map<string, string[]>();
  for (const task of tasks) {
    if (task.branch && task.filesChanged && task.assignedSessionId) {
      exact.set(task.assignedSessionId, task.filesChanged);
    }
  }
  for (const session of sessions) {
    const t = session.telemetry as { filesTouched?: string[] } | null;
    for (const f of exact.get(session.id) ?? t?.filesTouched ?? []) files.add(f);
  }

  /**
   * What the run cost: EVERY agent it started, not just the last one per task.
   *
   * A task row names only its current attempt, so summing the sessions the
   * tasks point at left out any attempt that had been retried. A live run in
   * which one task was rerun after a merge conflict reported $0.09 for four
   * agents that had cost $0.13 — and the retry is exactly the spend a person
   * reading the summary would want to know about.
   *
   * Every dispatch writes a `WAVE_TASK_DISPATCHED` event naming the plan and
   * the session, so the full set is recoverable from the feed. The sessions
   * the tasks point at are unioned in, for a plan dispatched before those
   * events were written.
   */
  const dispatched = await db
    .select({ metadata: activityEvents.metadata })
    .from(activityEvents)
    .where(
      and(
        eq(activityEvents.type, 'WAVE_TASK_DISPATCHED'),
        sql`json_extract(${activityEvents.metadata}, '$.wavePlanId') = ${plan.id}`
      )
    );
  const everySessionId = new Set<string>(sessionIds);
  for (const row of dispatched) {
    const id = (row.metadata as { sessionId?: unknown } | null)?.sessionId;
    if (typeof id === 'string' && id) everySessionId.add(id);
  }
  const earlier = [...everySessionId].filter((id) => !sessionIds.includes(id));
  const earlierSessions = earlier.length
    ? await db.query.rufloSessions.findMany({ where: inArray(rufloSessions.id, earlier) })
    : [];

  let costUsd = 0;
  for (const session of [...sessions, ...earlierSessions]) {
    costUsd += (session.telemetry as { costUsd?: number } | null)?.costUsd ?? 0;
  }

  return {
    // The row's own verdict, and why. `GET` uses these to report a failed plan
    // as failed even when the graph has not reached its `fail` node.
    wavePlanId: plan.id,
    planStatus: plan.status,
    failureReason: plan.failureReason ?? null,
    tasksTotal: tasks.length,
    tasksComplete: done.length,
    tasksFailed: failed.length,
    tasksSkipped: skipped.length,
    wavesTotal: new Set(tasks.map((t) => t.waveIndex)).size,
    filesChanged: [...files].sort(),
    costUsd,
    // How many agents were started for the run. More than the number of tasks
    // when something was retried.
    agentsStarted: everySessionId.size,
    failures: failed.map((t) => ({
      taskCode: t.taskCode,
      error: t.errorMessage ?? 'no error recorded',
    })),
    // Why a plan nobody paused is paused: it was left executing, and had been
    // idle too long to pick up when the cockpit started. Null otherwise.
    pausedReason: plan.status === 'paused' ? (plan.failureReason ?? null) : null,
    isolation: describeIsolation(plan, tasks),
  };
}

/**
 * Where the run's work is.
 *
 * A run whose tasks each had their own branch leaves nothing in the operator's
 * checkout: the work is on a run branch that exists only in the repository the
 * session runner used, and DevPilot does not push it. Someone told "finished 3
 * tasks" who then looks at their working tree, or at the remote, finds nothing
 * — so the run has to say where to look.
 *
 * And a run that was NOT isolated has to say that too, with the reason, because
 * it is the opposite situation: its changes are uncommitted edits in the
 * shared checkout, and nothing else in this response would tell the two apart.
 *
 * `null` means the question has not been asked yet — nothing has been
 * dispatched for the plan — or the plan predates it.
 */
function describeIsolation(
  plan: {
    isolated: boolean | null;
    isolationNote: string | null;
    runId: string | null;
    runBranch: string | null;
    runHeadSha: string | null;
  },
  tasks: {
    taskCode: string;
    status: string;
    branch: string | null;
    commitSha: string | null;
    mergedAt: Date | null;
  }[]
) {
  if (plan.isolated === null) return null;

  if (!plan.isolated) {
    return {
      isolated: false as const,
      reason: plan.isolationNote ?? 'no reason was recorded',
    };
  }

  const unmerged = tasks.filter((t) => t.status === 'completed' && !t.mergedAt).length;

  return {
    isolated: true as const,
    runId: plan.runId,
    // Both null until the first wave has been merged: the branch is the
    // runner's to name, and is recorded from its answer.
    runBranch: plan.runBranch,
    headSha: plan.runHeadSha,
    // What DevPilot has done, not a reading of any remote: nothing here ever
    // pushes. If the operator has pushed the branch themselves, this does not
    // know.
    pushed: false as const,
    /**
     * One sentence for a person, and the only part of this that is meant to
     * leave the machine: the branch name and a short sha. No path, no diff.
     */
    summary: plan.runBranch
      ? `The work is on the local branch \`${plan.runBranch}\`` +
        (plan.runHeadSha ? ` (at ${plan.runHeadSha.slice(0, 8)})` : '') +
        `, on the machine that ran it, and has not been pushed.` +
        (unmerged > 0
          ? ` ${unmerged} completed task${unmerged === 1 ? ' was' : 's were'} not merged into it` +
            ` and ${unmerged === 1 ? 'is' : 'are'} on ${unmerged === 1 ? 'its' : 'their'} own branch.`
          : '')
      : null,
    tasks: [...tasks]
      .sort((a, b) => a.taskCode.localeCompare(b.taskCode, 'en', { numeric: true }))
      .map((t) => ({
        taskCode: t.taskCode,
        status: t.status,
        // The task's own branch and its head. Null for a task that has not
        // reported, and for one whose completion was applied from the session
        // row after a restart and whose wave has not been merged yet.
        branch: t.branch,
        commitSha: t.commitSha,
        merged: Boolean(t.mergedAt),
      })),
  };
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    // Make sure the orchestrator — and with it the execution bridge's
    // reconciler — is up. It is initialised lazily by the first route that
    // needs it, and after a restart this may be that route: the bridge watcher
    // polls here every 30s for a run whose runner may never call back again.
    // Without this, the tasks that restart stranded would wait for some
    // unrelated request to wake the thing that recovers them.
    getServerOrchestrator();

    const graph = getConductorGraph();
    const snapshot = await graph.getState(threadFor(id));

    if (!snapshot.createdAt) {
      return NextResponse.json({ status: null, awaiting: null }, { status: 404 });
    }

    const state = {
      ...(snapshot.values as Record<string, unknown>),
      __interrupt__: snapshot.tasks.flatMap((t) => t.interrupts ?? []),
    };
    const described = describe(state);
    const outcome = await outcomeFor(id);

    /**
     * A failed plan is reported as a failed run, whatever the graph says.
     *
     * Normally they agree: the task that fails a plan also resumes the graph,
     * which reaches `fail` and sets `status: 'failed'`. But the row is failed
     * first and the graph second, and the second step can be late or can not
     * happen — a resume that threw, a plan failed by something other than the
     * graph. The watcher treats only `complete` and `failed` as terminal, so a
     * run reported as `executing` forever is a Linear ticket that is never
     * told. The row is the fact; nothing further will be dispatched for it.
     *
     * Only when the row is the plan this run is executing — `outcomeFor` reads
     * the item's newest wave plan, which after a re-plan may not be it.
     */
    const halted =
      outcome?.planStatus === 'failed' &&
      outcome.wavePlanId === described.wavePlanId &&
      described.status !== 'failed' &&
      described.status !== 'complete';

    const reason = outcome?.failureReason;
    const recorded = described.errors as string[];
    // The recorded reason, last — the watcher falls back to the final entry
    // when the plan has no failed task to name.
    const errors =
      outcome?.planStatus === 'failed' && reason && !recorded.includes(reason)
        ? [...recorded, reason]
        : recorded;
    const failures = outcome?.failures ?? [];

    // Where the work is travels as `outcome.isolation.summary`, and the bridge
    // watcher appends it to the summaries it writes. It used to be spliced
    // into a failed task's error text here, because that was the only free
    // text the watcher relayed; now that the watcher reads the field, splicing
    // it in as well would say it twice.

    return NextResponse.json({
      ...described,
      ...(halted ? { status: 'failed', awaiting: null, wave: null } : {}),
      errors,
      // What the run produced, so the bridge can tell Linear something worth
      // recording rather than "complete".
      outcome: outcome ? { ...outcome, failures } : outcome,
      // Each task's blast radius, and why any task was sequenced on account of
      // it — or that the plan was made without a code graph, and why. Local:
      // file paths and counts from the index on this machine.
      codeGraph: await codeGraphFor(state),
      next: snapshot.next,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: 'CONDUCTOR_FAILED', detail: message }, { status: 500 });
  }
}
