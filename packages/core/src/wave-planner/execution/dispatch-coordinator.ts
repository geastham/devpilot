import { getDatabase } from '../../db';
import { waveTasks, wavePlans, waves } from '../../db/schema/wave-planner';
import { horizonItems } from '../../db/schema/horizon';
import { rufloSessions } from '../../db/schema/fleet';
import { eq, and, inArray, isNull, sql } from 'drizzle-orm';
import {
  getOrchestratorServiceOrNull,
  buildSessionPrompt,
  sessionReportingForMode,
  type DispatchRequest,
  type OrchestratorService,
} from '../../orchestrator';
import type {
  WaveExecutionConfig,
  DispatchResult,
  WaveDispatchRequest,
  PredecessorSummary,
  WaveDispatchContext,
  TaskDispatchOutcome,
} from './types';
import type { WaveTask } from '../../db/schema/wave-planner';
import {
  DISPATCHABLE_WAVE_TASK_STATUSES,
  IN_FLIGHT_WAVE_TASK_STATUSES,
  freeDispatchSlots,
  inFlightEverywhereSql,
  inFlightInPlanSql,
  isDispatchableWaveTaskStatus,
} from './wave-state';

/**
 * Back-pressure, as opposed to failure: the orchestrator is not configured, or
 * the runner answered that it is full. See the catch in `dispatchWave`.
 */
function isBackPressure(errorMessage: string): boolean {
  return (
    errorMessage === 'ORCHESTRATOR_UNAVAILABLE' ||
    errorMessage === 'CAPACITY' ||
    /\b429\b/.test(errorMessage)
  );
}

/**
 * A run's name: `<ticket>-<last six of the wave plan id>`, or `run-<…>` for an
 * item with no ticket.
 *
 * Readable, because it ends up in branch names a person will type
 * (`devpilot/AVA-12-k3x9qd/run`), and unique, because two plans for one ticket
 * — a re-plan — must not share a run branch. The ticket is reduced to
 * characters git allows in a ref here as well as on the runner: the runner
 * would do it anyway, and the name stored on the plan should be the name in
 * the branch.
 */
export function runIdFor(linearTicketId: string | null | undefined, wavePlanId: string): string {
  const ticket = (linearTicketId ?? '')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/\.{2,}/g, '.')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, 40)
    .replace(/[-.]+$/g, '');
  const suffix = wavePlanId.replace(/[^A-Za-z0-9]+/g, '').slice(-6) || 'plan';
  return `${ticket || 'run'}-${suffix}`;
}

/**
 * WaveDispatchCoordinator
 *
 * Handles dispatching of wave tasks with:
 * - A per-task claim, so a task is sent to exactly one agent however many
 *   callers ask (see `claimTask`)
 * - Concurrency caps enforced inside that claim
 * - Staggering between dispatches
 * - Predecessor context gathering
 * - Real dispatch to the OrchestratorService (session-native / ao-cli / http)
 */
export class WaveDispatchCoordinator {
  private config: WaveExecutionConfig;
  private db = getDatabase();

  constructor(config: WaveExecutionConfig) {
    this.config = config;
  }

  /**
   * Dispatch what can be dispatched of a wave.
   *
   * Safe to call any number of times, from any number of callers, at once. It
   * has to be: a wave larger than the cap is drained by calling this again each
   * time a slot frees, completions arrive in bursts, and a retry is just
   * another pass over the same wave. The `tasks` argument is a snapshot and is
   * treated as one — it nominates candidates, and `claimTask` decides.
   *
   * Tasks that cannot reach an orchestrator (unconfigured/disabled) or that the
   * runner turns away for capacity are left dispatchable and counted as queued
   * — never burned as failures (§9.1).
   */
  async dispatchWave(
    wavePlanId: string,
    _waveIndex: number,
    tasks: WaveTask[]
  ): Promise<DispatchResult> {
    const result: DispatchResult = {
      dispatched: 0,
      queued: 0,
      errors: [],
    };

    // Pending OR retrying tasks are eligible (a retry is re-dispatched here,
    // by whoever next passes over the wave).
    //
    // Critical-path tasks go first. When the cap admits only some of a wave,
    // which ones wait is not neutral: a critical-path task is by definition on
    // the longest chain, so starting it late delays the whole plan by exactly
    // that long, while a task with slack can absorb the wait. The plan computes
    // this and it was never consulted. `sort` is stable, so within each group
    // the plan's own order stands.
    const candidates = tasks
      .filter((t) => isDispatchableWaveTaskStatus(t.status))
      .sort((a, b) => Number(b.isOnCriticalPath) - Number(a.isOnCriticalPath));

    if (candidates.length === 0) {
      return result;
    }

    // Nothing to dispatch to: every candidate is queued, and none is claimed —
    // a claim taken only to be handed straight back would flicker the task
    // through `dispatched` for no agent.
    const service = getOrchestratorServiceOrNull();
    if (!service || !service.isEnabled) {
      result.queued = candidates.length;
      return result;
    }

    // Load repo/title/ticket once per wave dispatch — and, the first time
    // anything is dispatched for the plan, decide how the whole plan will run.
    const ctx = await this.loadDispatchContext(wavePlanId, service);

    for (let i = 0; i < candidates.length; i++) {
      const candidate = candidates[i];

      const task = await this.claimTask(candidate);
      if (!task) {
        // Either another caller took this task, or a cap is reached (or the
        // plan stopped executing, in which case every claim fails and the loop
        // falls through quickly). Only the cap is a reason to stop looking.
        if ((await freeDispatchSlots(wavePlanId, this.config, this.db)) === 0) {
          break;
        }
        continue;
      }

      try {
        const predecessorContext = await this.getPredecessorContext(wavePlanId, task.taskCode);
        const dispatchRequest = this.buildDispatchRequest(task, predecessorContext);
        await this.dispatchToOrchestrator(task, dispatchRequest, ctx);

        // A wave starts when its first task does — once. This used to be
        // written by the controller on every call, including every backfill
        // pass, so a wave's start time was the time of its most recent
        // dispatch and its duration was meaningless.
        await this.db
          .update(waves)
          .set({ startedAt: task.lastAttemptAt })
          .where(and(eq(waves.id, task.waveId), isNull(waves.startedAt)));

        result.dispatched++;

        // Add delay between dispatches (staggering)
        if (i < candidates.length - 1) {
          await this.delay(this.config.subagentDispatchDelayMs);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        // Back-pressure is not failure. Two cases hand the task back so a
        // later dispatch pass picks it up:
        //
        //  - ORCHESTRATOR_UNAVAILABLE — dispatch is disabled/unconfigured; the
        //    work is retried once it is enabled.
        //  - CAPACITY — the runner answered 429 because its own concurrency cap
        //    was saturated. §7 of the session-runner contract is explicit that
        //    DevPilot *queues* here. It instead marked the task permanently
        //    `failed` with `retryCount` still 0, so a wave silently lost tasks
        //    whenever the fleet was busy — precisely the steady state when
        //    running 5–10 concurrent sessions, and observed live: two tasks of
        //    an eight-task wave died as `CAPACITY` while the wave itself stayed
        //    `active`, because this path bypasses the failure policy entirely.
        //
        // Either answer holds for the rest of this pass too — a runner that is
        // full for this task is full for the next — so stop rather than create
        // and roll back a session row for each remaining task.
        if (isBackPressure(errorMessage)) {
          await this.releaseClaim(candidate, task);
          break;
        }

        result.errors.push({ taskCode: task.taskCode, error: errorMessage });

        // The task is failed here; whether that fails the PLAN is the failure
        // policy's call, and the controller applies it to every error returned.
        await this.db.update(waveTasks)
          .set({
            status: 'failed',
            errorMessage,
            completedAt: new Date(),
          })
          .where(
            and(
              eq(waveTasks.id, task.id),
              inArray(waveTasks.status, [...IN_FLIGHT_WAVE_TASK_STATUSES])
            )
          );
      }
    }

    // Queued = candidates still waiting once this pass is done. Read back
    // rather than derived by subtraction: a candidate another caller dispatched
    // in the meantime is not queued, and subtraction would say it was.
    const [still] = await this.db
      .select({ count: sql<number>`count(*)`.mapWith(Number) })
      .from(waveTasks)
      .where(
        and(
          inArray(waveTasks.id, candidates.map((c) => c.id)),
          inArray(waveTasks.status, [...DISPATCHABLE_WAVE_TASK_STATUSES])
        )
      );
    result.queued = still?.count ?? 0;

    return result;
  }

  /**
   * Take a task for dispatch, or learn that it is not ours to take.
   *
   * This is what makes dispatch idempotent, and it is one statement on
   * purpose. Two components used to be able to dispatch a wave about two
   * seconds apart — the conductor graph, and the execution bridge's
   * auto-advance — each iterating a snapshot it had read earlier and neither
   * looking again, so a task still `pending` in both snapshots was sent to two
   * agents. Checking the status and then writing it is the same bug with a
   * smaller window. A conditional UPDATE has no window: the task moves
   * `pending|retrying → dispatched` only if it is still dispatchable, and only
   * the caller whose UPDATE changed the row sends the prompt.
   *
   * The same statement carries the three things that must be true at that
   * instant and not a moment before:
   *
   *  - the plan is `executing` — so a paused plan dispatches nothing, and a
   *    plan that has just been failed dispatches nothing more;
   *  - fewer than `maxTotalActiveTasks` tasks are in flight across live plans;
   *  - fewer than `maxConcurrentSubagents` of this plan's are.
   *
   * It also clears `assignedSessionId`. On a retry that column still names the
   * previous attempt's session, which is terminal; left in place, a reconciler
   * pass landing between this claim and the new session being linked would
   * read "in flight, session ended in ERROR" and fail the attempt that has not
   * started yet.
   *
   * And it clears where the previous attempt's work was — branch, base, commit,
   * files, merged. They describe an attempt this claim supersedes: the runner
   * renames that attempt's branch the moment the new one starts, so the name
   * recorded here would point at the new attempt's (empty) branch, and a
   * `mergedAt` carried over would tell the wave gate the retry was already in.
   *
   * Returns the claimed row, or null.
   */
  private async claimTask(candidate: WaveTask): Promise<WaveTask | null> {
    // `timestamp` columns hold whole seconds; the raw value below has to be the
    // same unit drizzle would have written, because it bypasses the column's
    // encoder.
    const nowSeconds = Math.floor(Date.now() / 1000);

    const [claimed] = await this.db
      .update(waveTasks)
      .set({
        status: 'dispatched',
        assignedSessionId: null,
        branch: null,
        baseSha: null,
        commitSha: null,
        filesChanged: null,
        mergedAt: null,
        // First attempt's start, kept. Each attempt's start, recorded.
        startedAt: sql`coalesce(started_at, ${nowSeconds})`,
        lastAttemptAt: new Date(nowSeconds * 1000),
      })
      .where(
        and(
          eq(waveTasks.id, candidate.id),
          inArray(waveTasks.status, [...DISPATCHABLE_WAVE_TASK_STATUSES]),
          sql`exists (select 1 from wave_plans p where p.id = ${candidate.wavePlanId} and p.status = 'executing')`,
          sql`${inFlightEverywhereSql()} < ${this.config.maxTotalActiveTasks}`,
          sql`${inFlightInPlanSql(candidate.wavePlanId)} < ${this.config.maxConcurrentSubagents}`
        )
      )
      .returning();

    return claimed ?? null;
  }

  /**
   * Hand a claimed task back because nothing was dispatched for it.
   *
   * It returns to the status it was claimed from, with the timestamps it had:
   * an attempt that never reached an agent did not start, and must not be
   * recorded as the task's first. For the same reason it gets back what the
   * claim cleared about the previous attempt's work — that attempt is still the
   * latest one there has been, and its branch has not been renamed.
   */
  private async releaseClaim(candidate: WaveTask, claimed: WaveTask): Promise<void> {
    await this.db
      .update(waveTasks)
      .set({
        status: candidate.status,
        assignedSessionId: null,
        startedAt: candidate.startedAt,
        lastAttemptAt: candidate.lastAttemptAt,
        branch: candidate.branch,
        baseSha: candidate.baseSha,
        commitSha: candidate.commitSha,
        filesChanged: candidate.filesChanged,
        mergedAt: candidate.mergedAt,
      })
      .where(and(eq(waveTasks.id, claimed.id), eq(waveTasks.status, 'dispatched')));
  }

  /**
   * Build a dispatch request for a task
   * Includes task details, file scope, model, predecessor context, and constraints
   */
  buildDispatchRequest(
    task: WaveTask,
    predecessorContext: PredecessorSummary[]
  ): WaveDispatchRequest {
    const filePaths = task.filePaths || [];
    return {
      wavePlanId: task.wavePlanId,
      waveIndex: task.waveIndex,
      taskCode: task.taskCode,
      taskDescription: task.description,
      fileScope: filePaths,
      model: this.mapModelToDispatchModel(task.recommendedModel),
      predecessorContext,
      // File-scope guard rails so the session doesn't touch out-of-scope files.
      constraints:
        filePaths.length > 0
          ? [`Only modify files within: ${filePaths.join(', ')}`]
          : [],
    };
  }

  /**
   * Get predecessor context for a task
   * Fetches completion summaries for task's completed dependencies.
   *
   * The files reported for a predecessor are, in order of how much is known:
   *
   *  - `'changed'` — what git says its branch changed. Only for a task that
   *    ran isolated: its completion report's file list is then the diff from
   *    the commit the branch was cut from to its head, and exact. An empty
   *    list here means the task changed nothing, and is reported as that.
   *  - `'touched'` — the files its session wrote to, as the runner observed.
   *  - `'scoped'` — only the files the plan gave it.
   *
   * `filesSource` says which, so the prompt can label them honestly. This used
   * to pass the planned paths as "files modified".
   *
   * A task that was NOT isolated has a recorded file list too, and it is
   * deliberately not used as `'changed'`: there the runner compares two
   * `git status` readings of a checkout that every other agent in the wave is
   * writing to, so the list can hold a sibling's files. What the session's own
   * tool calls wrote is the better account of that task, and comes first as it
   * did before.
   *
   * `merged` is whether the predecessor's branch is in the run branch — and so
   * in the checkout the successor is about to be given.
   */
  async getPredecessorContext(
    wavePlanId: string,
    taskCode: string
  ): Promise<PredecessorSummary[]> {
    const task = await this.db.query.waveTasks.findFirst({
      where: and(
        eq(waveTasks.wavePlanId, wavePlanId),
        eq(waveTasks.taskCode, taskCode)
      ),
    });

    if (!task || !task.dependencies || task.dependencies.length === 0) {
      return [];
    }

    const predecessorSummaries: PredecessorSummary[] = [];

    for (const depTaskCode of task.dependencies) {
      const depTask = await this.db.query.waveTasks.findFirst({
        where: and(
          eq(waveTasks.wavePlanId, wavePlanId),
          eq(waveTasks.taskCode, depTaskCode),
          eq(waveTasks.status, 'completed')
        ),
      });

      if (depTask) {
        const changedFiles = depTask.branch ? depTask.filesChanged : null;
        const touchedFiles = changedFiles
          ? null
          : await this.getTouchedFiles(depTask.assignedSessionId);

        predecessorSummaries.push({
          taskCode: depTask.taskCode,
          description: depTask.description,
          filesModified: changedFiles ?? touchedFiles ?? depTask.filePaths ?? [],
          filesSource: changedFiles ? 'changed' : touchedFiles ? 'touched' : 'scoped',
          completionSummary: depTask.completionSummary ?? '',
          ...(depTask.mergedAt ? { merged: true } : {}),
        });
      }
    }

    return predecessorSummaries;
  }

  /**
   * The files a task's session wrote to, as the session runner observed them
   * (`ruflo_sessions.telemetry.filesTouched`, repo-relative).
   *
   * Null when that is not known: the task has no session, the runner predates
   * telemetry, or it reported none. An empty list is treated as "not known"
   * rather than "touched nothing" — telemetry arrives on status callbacks, so
   * a session can finish before its last edits are reflected in it.
   */
  private async getTouchedFiles(sessionId: string | null): Promise<string[] | null> {
    if (!sessionId) {
      return null;
    }

    const session = await this.db.query.rufloSessions.findFirst({
      where: eq(rufloSessions.id, sessionId),
    });

    const touched = session?.telemetry?.filesTouched;
    return Array.isArray(touched) && touched.length > 0 ? touched : null;
  }

  /**
   * Load repo / item title / description / linear ticket for a wave plan
   * (wavePlans → horizonItems), and the run the plan's tasks belong to. Cached
   * per dispatchWave call by the caller.
   */
  private async loadDispatchContext(
    wavePlanId: string,
    service: OrchestratorService
  ): Promise<WaveDispatchContext> {
    const wavePlan = await this.db.query.wavePlans.findFirst({
      where: eq(wavePlans.id, wavePlanId),
    });
    if (!wavePlan) {
      throw new Error(`Wave plan ${wavePlanId} not found`);
    }

    const item = await this.db.query.horizonItems.findFirst({
      where: eq(horizonItems.id, wavePlan.horizonItemId),
    });
    if (!item) {
      throw new Error(`Horizon item ${wavePlan.horizonItemId} not found`);
    }

    return {
      repo: item.repo,
      itemTitle: item.title,
      itemDescription: item.description,
      linearTicketId: item.linearTicketId,
      run: await this.ensureRun(wavePlan, item.linearTicketId, service),
    };
  }

  /**
   * The run this plan's tasks belong to, and whether they are isolated —
   * decided the first time anything is dispatched for the plan, and read from
   * the plan row every time after.
   *
   * This is the only place the decision is made, and every dispatch for a plan
   * passes through it (a wave's first pass, a backfill, a retry, the legacy
   * route and the conductor graph alike), so there is no path that sends a
   * task without the plan having been asked.
   *
   * **Decided once.** The run id and the answer are written together in one
   * statement that only succeeds while the plan is still undecided, and then
   * read back — so two dispatchers arriving together for a plan's first wave
   * both use the first one's decision. It is not revisited when the runner
   * later changes: a plan that started isolated and then met a runner that
   * cannot isolate fails its next task with that reason (the transport
   * refuses to send it), and a plan that started un-isolated stays that way
   * even after the runner is upgraded. Half a plan on branches and half in the
   * shared checkout is worse than either.
   *
   * **Never silently.** When the answer is no, the reason is on the plan row
   * (`isolation_note`) and the conductor route reports it. The plan then runs
   * exactly as plans did before isolation existed.
   *
   * **Not for a plan that has already started.** A plan can reach this
   * undecided with tasks already run: it was mid-run when the cockpit was
   * upgraded to a version that asks. Its earlier waves ran in the shared
   * checkout and left their work there, uncommitted. Isolating the rest would
   * cut each remaining task a worktree from the last COMMIT — without any of
   * that work — which is the half-isolated plan the rule above exists to
   * prevent. So such a plan is decided un-isolated without the runner being
   * asked, and finishes the way it began.
   */
  private async ensureRun(
    wavePlan: typeof wavePlans.$inferSelect,
    linearTicketId: string | null,
    service: OrchestratorService
  ): Promise<WaveDispatchContext['run']> {
    if (wavePlan.runId && wavePlan.isolated !== null) {
      return { id: wavePlan.runId, isolated: wavePlan.isolated };
    }

    const [started] = await this.db
      .select({ count: sql<number>`count(*)`.mapWith(Number) })
      .from(waveTasks)
      .where(
        and(
          eq(waveTasks.wavePlanId, wavePlan.id),
          sql`(${waveTasks.startedAt} is not null or ${waveTasks.status} <> 'pending')`
        )
      );

    const support =
      (started?.count ?? 0) > 0
        ? {
            supported: false,
            reason:
              'the run had already started, in the shared checkout, before tasks could be given ' +
              'their own branch — and a run is never half isolated',
          }
        : await service.isolationSupport();

    await this.db
      .update(wavePlans)
      .set({
        runId: wavePlan.runId ?? runIdFor(linearTicketId, wavePlan.id),
        isolated: support.supported,
        isolationNote: support.supported ? null : (support.reason ?? 'no reason given'),
      })
      .where(and(eq(wavePlans.id, wavePlan.id), isNull(wavePlans.isolated)));

    const decided = await this.db.query.wavePlans.findFirst({
      where: eq(wavePlans.id, wavePlan.id),
    });
    if (!decided?.runId || decided.isolated === null) {
      throw new Error(`Wave plan ${wavePlan.id} has no run recorded after its first dispatch`);
    }
    return { id: decided.runId, isolated: decided.isolated };
  }

  /**
   * Dispatch a single, already-claimed task to the orchestrator service.
   *
   * Creates a rufloSessions row, links the task to it, builds the session
   * prompt + DispatchRequest and dispatches through the active adapter. Throws
   * 'ORCHESTRATOR_UNAVAILABLE' when no orchestrator is configured (caller
   * queues rather than fails the task). Whatever it throws, it leaves no
   * session row and no link behind.
   */
  private async dispatchToOrchestrator(
    task: WaveTask,
    request: WaveDispatchRequest,
    ctx: WaveDispatchContext
  ): Promise<TaskDispatchOutcome> {
    const service = getOrchestratorServiceOrNull();
    if (!service || !service.isEnabled) {
      throw new Error('ORCHESTRATOR_UNAVAILABLE');
    }

    // A plan that started isolated, picked up by a cockpit that has since been
    // pointed at an orchestrator that cannot isolate. Sending the task anyway
    // would run it in a shared checkout with its predecessors' work sitting on
    // a branch it will never see. Failing it says what happened.
    if (ctx.run.isolated && service.mode !== 'claude-session') {
      throw new Error(
        `ISOLATION_UNAVAILABLE: this run gives each task its own branch, and the orchestrator ` +
          `is now in '${service.mode}' mode, which cannot`
      );
    }

    // Which tests the task's files reach, if a code graph can say. Asked
    // before the session row exists, so the few seconds it may take are not
    // spent with an ACTIVE row on the board for an agent nobody has started.
    const reached = await this.reachedTests(service, ctx.repo, request.fileScope);

    // Create the DevPilot session row first so its id can seed the prompt and
    // correlate pushed callbacks.
    const [session] = await this.db.insert(rufloSessions)
      .values({
        repo: ctx.repo,
        linearTicketId: ctx.linearTicketId ?? `DP-${task.taskCode}-${Date.now()}`,
        ticketTitle: `${ctx.itemTitle} — ${task.taskCode} ${task.label}`,
        // +1: waveIndex is 0-based internally, and every surface a person
        // reads counts from 1 — the board says "wave 1 of 2" while these cards
        // said "Wave 0" for the same work.
        currentWorkstream: `Wave ${task.waveIndex + 1} · ${task.taskCode}`,
        status: 'ACTIVE',
        progressPercent: 0,
        inFlightFiles: task.filePaths ?? [],
      })
      .returning();

    const prompt = buildSessionPrompt({
      taskDescription: request.taskDescription,
      repo: ctx.repo,
      fileScope: request.fileScope,
      predecessorContext: request.predecessorContext.map((p) => ({
        taskCode: p.taskCode,
        description: p.description,
        filesModified: p.filesModified,
        filesSource: p.filesSource,
        completionSummary: p.completionSummary,
      })),
      constraints: request.constraints,
      callbackUrl: this.config.callbackUrl,
      sessionId: session.id,
      // Only ask the agent to report for itself when nothing does it on its
      // behalf; where the runner reports, the instruction cannot succeed and
      // its failure ends up in the summary the next wave reads.
      reporting: sessionReportingForMode(service.mode),
      // What the item as a whole is for. The task description alone is one
      // sentence with no indication of what it is in service of.
      goal: { title: ctx.itemTitle, description: ctx.itemDescription },
      // True only when it is: the plan is isolated and every predecessor
      // listed has been merged, so the worktree this task is given was cut
      // from a branch that contains them.
      predecessorsMerged:
        ctx.run.isolated &&
        request.predecessorContext.length > 0 &&
        request.predecessorContext.every((p) => p.merged === true),
      // Present only when there is a list with something in it. Spread rather
      // than passed as undefined so that, without a code graph, the input —
      // and the prompt — are what they were.
      ...(reached ? { reachedTests: reached.tests, reachedTestsTruncated: reached.truncated } : {}),
    });

    const dispatchReq: DispatchRequest = {
      sessionId: session.id,
      repo: ctx.repo,
      callbackUrl: this.config.callbackUrl,
      taskSpec: {
        prompt,
        filePaths: request.fileScope,
        model: request.model,
        workstream: `wave-${request.waveIndex}`,
        constraints: request.constraints,
      },
      linearTicketId: ctx.linearTicketId ?? undefined,
      // One task of an isolated plan: its own worktree, on its own branch, cut
      // from the run branch as the last merge left it. The title is the task's
      // label, which the runner uses as the subject of the commit it makes.
      ...(ctx.run.isolated
        ? { isolation: { runId: ctx.run.id, taskCode: task.taskCode, title: task.label } }
        : {}),
      metadata: {
        wavePlanId: request.wavePlanId,
        waveIndex: request.waveIndex,
        taskCode: request.taskCode,
      },
    };

    // Link the task to its session BEFORE dispatching, not after.
    //
    // `service.dispatch` emits `job:started` synchronously on acceptance, and
    // the execution bridge resolves that event to a wave task by looking for
    // this session id on `wave_tasks`. The link used to be written once
    // dispatch had returned, so the lookup always ran first and always found
    // nothing: no task ever became `running`, no WAVE_TASK_DISPATCHED event was
    // ever written (zero across 26 dispatches in a real database), and a
    // concurrency cap that counted `running` tasks counted nothing.
    await this.db
      .update(waveTasks)
      .set({ assignedSessionId: session.id })
      .where(and(eq(waveTasks.id, task.id), eq(waveTasks.status, 'dispatched')));

    // Undo both, for a dispatch that did not happen. A thrown dispatch used to
    // skip the rollback that a rejected one got, leaving an ACTIVE session row
    // for an agent that was never started.
    const rollBack = async (): Promise<void> => {
      await this.db
        .update(waveTasks)
        .set({ assignedSessionId: null })
        .where(and(eq(waveTasks.id, task.id), eq(waveTasks.assignedSessionId, session.id)));
      await this.db.delete(rufloSessions).where(eq(rufloSessions.id, session.id));
    };

    let response: Awaited<ReturnType<typeof service.dispatch>>;
    try {
      response = await service.dispatch(dispatchReq);
    } catch (error) {
      await rollBack();
      throw error;
    }

    if (!response.accepted) {
      await rollBack();
      throw new Error(response.error ?? 'DISPATCH_REJECTED');
    }

    await this.db.update(rufloSessions)
      .set({
        externalSessionId: response.orchestratorJobId ?? null,
        orchestratorMode: service.mode,
        updatedAt: new Date(),
      })
      .where(eq(rufloSessions.id, session.id));

    return {
      sessionId: session.id,
      externalJobId: response.orchestratorJobId ?? '',
      mode: service.mode,
    };
  }

  /**
   * The test files reached from a task's files, or null when there is nothing
   * to tell the worker: the task names no files, there is no code graph to
   * ask, or it found none.
   *
   * Asked of the runner, like the plan's dependents, because the index lives
   * in the checkout and only the runner knows where that is. The request
   * names the repository and nothing about the task's run, so the answer
   * cannot come from an isolated task's own worktree: it describes the
   * repository as it was last indexed, not the run branch the task's checkout
   * is cut from. That is one more reason the prompt presents the list as
   * information.
   *
   * Never throws and never fails a dispatch. "Unavailable" is not logged or
   * recorded per task: it is the normal state of a repository with no index,
   * and the plan already says whether a graph was there when it was made.
   */
  private async reachedTests(
    service: OrchestratorService,
    repo: string,
    files: string[]
  ): Promise<{ tests: string[]; truncated: boolean } | null> {
    if (files.length === 0) {
      return null;
    }

    try {
      const outcome = await service.graphAffectedTests({ repo, files });
      if (!outcome.available || outcome.tests.length === 0) {
        return null;
      }
      return { tests: outcome.tests, truncated: outcome.truncated };
    } catch {
      // The service answers rather than rejects; a stand-in for it might not.
      return null;
    }
  }

  /**
   * Map database model enum to dispatch model format
   */
  private mapModelToDispatchModel(model: string | null): 'haiku' | 'sonnet' | 'opus' {
    if (!model) {
      return 'sonnet'; // default
    }

    const modelLower = model.toLowerCase();
    if (modelLower === 'haiku') return 'haiku';
    if (modelLower === 'opus') return 'opus';
    return 'sonnet';
  }

  /**
   * Delay helper for staggering dispatches
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
