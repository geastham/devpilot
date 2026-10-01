/**
 * ExecutionBridge (spec/trd/01-TIER1-EXECUTION-LOOP.md §6.5).
 *
 * Subscribes to the OrchestratorService event stream and routes job:* events to
 * the wave execution machinery, correlating each event's DevPilot sessionId to
 * its owning wave task via waveTasks.assignedSessionId. The correlation lives
 * in the DB rather than the service's in-memory mappings, which is what lets a
 * finished session settle its wave task after a process restart — and, for the
 * reports that never arrive at all, what lets `reconcile` settle it from the
 * session row instead.
 *
 * It records what happened to a task. What happens NEXT — backfilling the wave,
 * ending it, starting another — belongs to whoever drives the plan; see
 * `WaveDriver`.
 */

import { and, eq, inArray, notInArray } from 'drizzle-orm';
import { getDatabase, type Database } from '../../db';
import {
  waveTasks,
  wavePlans,
  rufloSessions,
  activityEvents,
  type WaveTask,
  type RufloSession,
} from '../../db/schema';
import type {
  OrchestratorService,
  OrchestratorEvent,
  CompletionReport,
} from '../../orchestrator';
import { WaveDispatchCoordinator } from './dispatch-coordinator';
import { WaveExecutionController, type TaskFailureOutcome } from './controller';
import { CompletionListener, workFromReport } from './completion-listener';
import type { WaveExecutionConfig } from './types';
import { IN_FLIGHT_WAVE_TASK_STATUSES, TERMINAL_WAVE_PLAN_STATUSES } from './wave-state';

/**
 * The one component that decides a wave is over and starts the next.
 *
 * THERE MUST BE EXACTLY ONE PER PLAN. There were two: the conductor graph
 * resumed on a wave's last completion and dispatched the next wave, and this
 * bridge, hearing the same completion, called
 * `WaveExecutionController.handleWaveComplete`, which waited two seconds and
 * dispatched it again. Neither looked at what the other had done, so a task
 * could be sent to two agents. (A third implementation, `autoAdvanceWave`, sat
 * unused in `auto-advance.ts` and has been deleted.)
 *
 * So ownership is asked, per plan, every time a task changes:
 *
 *  - A plan a driver `owns` is advanced by that driver and by nothing else.
 *    The bridge records the task's new state, emits the event, and calls
 *    `notify`. It does not dispatch — not the next wave, and not the rest of
 *    this one: backfilling a wave when a slot frees and re-dispatching a task
 *    that is owed a retry are dispatches too, and they are the driver's.
 *  - A plan no driver owns is the legacy path — dispatched by hand through
 *    `/api/wave-plans/:id/dispatch`, with nothing sequencing it. For those the
 *    bridge itself backfills and calls `handleWaveComplete`, which advances
 *    when `WaveExecutionConfig.autoAdvance` is set. That path behaves as it
 *    always has; `autoAdvance` now governs it alone.
 *
 * In the Next app the driver is the conductor graph (`src/lib/orchestrator.ts`
 * supplies it). It is an interface rather than an import because the graph
 * carries the langchain dependency, which core deliberately does not.
 */
export interface WaveDriver {
  /**
   * Whether this driver runs the plan. Asked on every task change, so it must
   * be answerable from durable state — a plan does not stop being the graph's
   * because the process restarted.
   *
   * If it throws, the bridge does nothing further for that change (and records
   * the error): falling back to the legacy path on a failed lookup would be
   * exactly the second driver this exists to prevent.
   */
  owns(wavePlanId: string): Promise<boolean>;

  /**
   * Something changed in this wave of a plan the driver owns — a task
   * completed, failed, was reconciled, or the reconciler is simply checking
   * in. The driver looks at the wave and acts. Called repeatedly and
   * redundantly; it must be idempotent.
   */
  notify(wavePlanId: string, waveIndex: number): Promise<WaveDriverAnswer>;
}

/** What the driver did with a notification. Diagnostic, not control flow. */
export interface WaveDriverAnswer {
  resumed: boolean;
  reason?: string;
}

/**
 * How long a task may be `dispatched` with no session row before it is treated
 * as lost.
 *
 * The session row is written a few statements after the claim, so in a healthy
 * dispatch this gap is microseconds — but the reconciler can run inside it, and
 * a task that is mid-dispatch must not be declared lost. Two minutes is far
 * longer than a dispatch takes and far shorter than anyone waits for a wave.
 */
const SESSION_LINK_GRACE_MS = 2 * 60_000;

/**
 * How long a session row must have been terminal before the reconciler applies
 * it to the task.
 *
 * The callback route marks the session COMPLETE first and forwards the report
 * to the bridge last, with file-lock releases and a Linear sync in between. A
 * pass landing in that gap would apply the outcome from the row — correctly,
 * but without the completion summary and error text that only the report
 * carries, and the report arriving a moment later would then be a duplicate.
 * So a freshly terminal row is left for the callback that is, almost always,
 * about to deliver it. After a restart the rows are old and this never waits.
 */
const CALLBACK_HANDOFF_GRACE_MS = 30_000;

/**
 * Default stall window: how long a session may go without reporting before its
 * task is treated as lost.
 *
 * Generous on purpose. Declaring a task lost does not stop its agent — nothing
 * here can — it spends the task's retry and starts a SECOND agent on the same
 * files. If the first one was merely quiet, the two now overwrite each other.
 * So the window must be long enough that silence means the runner is gone, not
 * that the agent is thinking:
 *
 *  - the session runner heartbeats every 90s regardless of what the agent is
 *    doing (TRD-01 §7.2 requires two-minute liveness), so thirty minutes is
 *    twenty consecutive missed heartbeats;
 *  - it also matches the runner's own default wall-clock cap (`--timeout 30`),
 *    past which a healthy runner reports the session as failed itself. An
 *    operator who raises that cap should raise this with it.
 */
export const DEFAULT_RECONCILE_STALL_MS = 30 * 60_000;

/** Default interval between reconciler passes. */
export const DEFAULT_RECONCILE_INTERVAL_MS = 60_000;

/**
 * Default age past which a plan found `executing` at start-up is held rather
 * than resumed. See `ExecutionBridge.holdStalePlans`.
 *
 * Six hours: longer than a cockpit is down for a restart, an upgrade, or a
 * laptop lid shut over lunch, with a working day's margin — and far shorter
 * than the weeks an abandoned run sits in a database.
 */
export const DEFAULT_RESUME_MAX_AGE_MS = 6 * 60 * 60_000;

export interface ReconcileOptions {
  /** How often to reconcile after the pass at start. Default 60s. */
  intervalMs?: number;
  /** See `DEFAULT_RECONCILE_STALL_MS`. */
  stallMs?: number;
  /**
   * See `DEFAULT_RESUME_MAX_AGE_MS`. `0` turns the guard off: every plan left
   * `executing` is resumed at start-up however long it has been idle.
   */
  resumeMaxAgeMs?: number;
}

export interface ExecutionBridgeOptions {
  execution: WaveExecutionConfig;
  /**
   * The component that advances plans it owns. Omit it and every plan is on
   * the legacy path, advanced by this bridge. See `WaveDriver`.
   */
  driver?: WaveDriver;
  /**
   * Reconcile wave tasks against their session rows when the bridge starts and
   * then on a timer (see `reconcile`). Off unless asked for: a host that wants
   * it says so, and a test that constructs a bridge does not get a timer.
   */
  reconcile?: ReconcileOptions | false;
}

/** What one orchestrator event did to the wave task it was about. */
export interface TaskSettlement {
  /** The wave task the session belongs to; null for a plain fleet session. */
  task: { wavePlanId: string; waveIndex: number; taskCode: string } | null;
  /**
   * The state recorded. `ignored` means the report changed nothing — a
   * duplicate, or about an attempt that is no longer current.
   */
  recorded: 'running' | 'completed' | TaskFailureOutcome | null;
  /** The driver's answer, when the plan has one and the task changed. */
  driver?: WaveDriverAnswer;
  /** Set when handling the event threw. The fault is also in the activity feed. */
  error?: string;
}

/** What one reconciler pass did. */
export interface ReconcileReport {
  /** In-flight tasks of live plans looked at. */
  examined: number;
  /** Tasks whose session had completed without the task hearing of it. */
  completed: number;
  /** Tasks whose session had ended in error without the task hearing of it. */
  failed: number;
  /** Tasks whose session is missing or silent past the stall window. */
  lost: number;
  /** Waves handed to their driver (or the legacy path) to look at. */
  settled: number;
  /** Plans paused by the start-up pass because they had been idle too long. */
  held: number;
  errors: string[];
}

const NO_TASK: TaskSettlement = { task: null, recorded: null };

let bridgeInstance: ExecutionBridge | null = null;

export class ExecutionBridge {
  private db: Database;
  private coordinator: WaveDispatchCoordinator;
  private controller: WaveExecutionController;
  private listener: CompletionListener;
  private driver?: WaveDriver;
  private reconcileOptions: ReconcileOptions | false;
  private unsubscribe: (() => void) | null = null;
  private reconcileTimer: NodeJS.Timeout | null = null;
  private reconciling: Promise<ReconcileReport> | null = null;
  private startedAt: Date | null = null;
  /** The newest unfinished handler per session, for `settlementFor`/`drain`. */
  private readonly inFlight = new Map<string, Promise<TaskSettlement>>();

  constructor(
    private orchestrator: OrchestratorService,
    options: ExecutionBridgeOptions
  ) {
    this.db = getDatabase();
    this.driver = options.driver;
    this.reconcileOptions = options.reconcile ?? false;
    this.coordinator = new WaveDispatchCoordinator(options.execution);
    this.controller = new WaveExecutionController(options.execution, this.coordinator);
    this.listener = new CompletionListener();
  }

  /**
   * Subscribe to orchestrator events and, when configured, reconcile once now
   * and then on a timer. Idempotent.
   */
  start(): void {
    if (this.unsubscribe) return;
    this.startedAt = new Date();

    this.unsubscribe = this.orchestrator.onEvent((event) => {
      // Session-level progress lives on rufloSessions via callbacks/poller; it
      // is not a wave-task event and must not displace one in `inFlight`.
      if (event.type === 'job:progress') return;

      // Fire-and-forget: the handler isolates its own faults.
      const handling = this.handleEvent(event);
      this.inFlight.set(event.sessionId, handling);
      void handling.finally(() => {
        if (this.inFlight.get(event.sessionId) === handling) {
          this.inFlight.delete(event.sessionId);
        }
      });
    });

    if (this.reconcileOptions) {
      // Once at start: this is the pass that picks up what a restart dropped —
      // and, because it can therefore start agents nobody asked for today, the
      // one pass that first holds plans too old to pick up (`holdStalePlans`).
      void this.reconcile(new Date(), { startup: true });

      const timer = setInterval(
        () => void this.reconcile(),
        this.reconcileOptions.intervalMs ?? DEFAULT_RECONCILE_INTERVAL_MS
      );
      // Never hold the process open on this timer alone.
      timer.unref?.();
      this.reconcileTimer = timer;
    }
  }

  /** Unsubscribe and stop reconciling. */
  stop(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    if (this.reconcileTimer) {
      clearInterval(this.reconcileTimer);
      this.reconcileTimer = null;
    }
  }

  /**
   * The outcome of the event currently being handled for a session, or of
   * nothing if none is.
   *
   * For the completion callback route: it forwards a report to the
   * orchestrator service, which emits the event this bridge handles — and it
   * wants to answer the runner only once the task is recorded and the driver
   * has been told, and to say what the driver did. The subscription above
   * registers the handler synchronously, inside the service's `emit`, so by
   * the time the route asks, the promise is here.
   */
  settlementFor(sessionId: string): Promise<TaskSettlement> {
    return this.inFlight.get(sessionId) ?? Promise.resolve(NO_TASK);
  }

  /** Resolves when no event is being handled and no reconcile pass is running. */
  async drain(): Promise<void> {
    while (this.inFlight.size > 0 || this.reconciling) {
      await Promise.all([...this.inFlight.values(), this.reconciling]);
    }
  }

  /** Resolve a DevPilot sessionId to its owning wave task, if any. */
  private async resolveTask(sessionId: string): Promise<WaveTask | null> {
    const task = await this.db.query.waveTasks.findFirst({
      where: eq(waveTasks.assignedSessionId, sessionId),
    });
    return task ?? null;
  }

  /**
   * Apply one orchestrator event to the wave task it is about, then let the
   * wave's driver react. Never rejects.
   *
   * Events for one session can be handled out of order and more than once —
   * handlers run concurrently, callbacks are retried, and the reconciler may
   * apply the same outcome from the session row. Every write underneath is a
   * conditional UPDATE, so each outcome lands once whoever delivers it.
   */
  async handleEvent(event: OrchestratorEvent): Promise<TaskSettlement> {
    try {
      if (event.type === 'job:progress') return NO_TASK;

      const task = await this.resolveTask(event.sessionId);
      if (!task) return NO_TASK; // non-wave session (plain fleet dispatch) — ignore.

      const { wavePlanId, waveIndex, taskCode } = task;
      const settlement: TaskSettlement = {
        task: { wavePlanId, waveIndex, taskCode },
        recorded: 'ignored',
      };
      const attempt = { sessionId: event.sessionId };

      switch (event.type) {
        case 'job:started':
          // A start changes nothing a driver acts on: no slot freed, no wave
          // nearer its end.
          if (await this.listener.handleTaskStarted(wavePlanId, taskCode, event.sessionId)) {
            settlement.recorded = 'running';
          }
          return settlement;
        case 'job:complete': {
          // The report is the one the callback route was posted, passed
          // through the orchestrator service unchanged. For an isolated task it
          // says where the work is — branch, base, head — and exactly which
          // files it changed, and that is recorded with the completion rather
          // than looked up afterwards: nothing else holds it.
          const report = event.data as CompletionReport;
          if (
            await this.listener.handleTaskComplete(
              wavePlanId,
              taskCode,
              report.summary,
              event.sessionId,
              workFromReport(report)
            )
          ) {
            settlement.recorded = 'completed';
          }
          break;
        }
        case 'job:error':
          // A failed agent's partial work is committed to its branch too.
          await this.listener.recordTaskWork(
            wavePlanId,
            taskCode,
            event.sessionId,
            workFromReport(event.data)
          );
          settlement.recorded = await this.controller.onTaskFailed(
            wavePlanId,
            taskCode,
            this.errorMessage(event.data),
            attempt
          );
          break;
        case 'job:cancelled':
          // Cancellation is terminal — skip retry, go straight to failure.
          settlement.recorded = await this.controller.cancelTask(
            wavePlanId,
            taskCode,
            'cancelled',
            attempt
          );
          break;
      }

      // A report that changed nothing settles nothing: whoever recorded the
      // change settled the wave then, and the reconciler re-checks every live
      // plan's current wave regardless.
      if (settlement.recorded === 'ignored') return settlement;

      settlement.driver = await this.settle(wavePlanId, waveIndex);
      return settlement;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.recordFault(
        `ExecutionBridge handler error for session ${event.sessionId}: ${message}`,
        { sessionId: event.sessionId, eventType: event.type }
      );
      return { task: null, recorded: null, error: message };
    }
  }

  /**
   * A task in this wave changed: record the wave's end if it has ended, then
   * hand the wave to whoever drives the plan.
   *
   * For an owned plan that is `driver.notify` and nothing else.
   *
   * For a legacy plan the bridge does the driving itself — and, like every
   * driver, it asks `signalForDriver` rather than reading the wave's rows: for
   * a plan whose tasks each have their own branch, the wave's work is merged
   * before this is told the wave is over. Both halves of the driving
   * matter. `handleWaveComplete` ends the wave. The backfill is what
   * drains a wave larger than the cap: without it the executor was a
   * **deadlock for any wave larger than `maxConcurrentSubagents`** —
   * `dispatchWave` dispatches up to the cap and leaves the remainder `pending`,
   * nothing ever dispatched them, and the wave could never complete, so the run
   * hung with the fleet idle. It stayed hidden because the only wave plan
   * executed end to end had fewer tasks per wave than the cap; the first live
   * plan generated afterwards had waves of 8, 9 and 9 against a cap of 4. A
   * task that FAILS frees its slot exactly as one that succeeds, and a
   * `retrying` task is itself dispatchable, which is why this runs after every
   * change and not only after completions.
   */
  private async settle(
    wavePlanId: string,
    waveIndex: number
  ): Promise<WaveDriverAnswer | undefined> {
    await this.controller.recordWaveIfOver(wavePlanId, waveIndex);

    if (this.driver && (await this.driver.owns(wavePlanId))) {
      return this.driver.notify(wavePlanId, waveIndex);
    }

    const signal = await this.controller.signalForDriver(wavePlanId, waveIndex);
    if (signal.kind === 'over') {
      await this.controller.handleWaveComplete(wavePlanId, waveIndex);
    } else if (signal.kind === 'backfill') {
      await this.controller.dispatchWave(wavePlanId, waveIndex);
    }
    return undefined;
  }

  /**
   * Bring wave tasks back into agreement with their session rows.
   *
   * A wave task learns that its session ended from one event, delivered once,
   * in memory. Anything that loses that delivery strands the task in
   * `dispatched`/`running` forever: a cockpit restart between the callback and
   * the write, a handler that threw, a runner that died and will never call
   * back. Observed in a real database as six tasks still `dispatched` whose
   * sessions were `COMPLETE` with cost recorded — and a stranded task is a wave
   * that never ends and a run that never reports.
   *
   * For every in-flight task of a plan that is not terminal:
   *
   *  (a) its session row is terminal → apply that completion or failure, by the
   *      same methods the callback would have used;
   *  (b) its session row is missing, or has reported nothing for longer than
   *      the stall window → fail the task as `lost: no report since <time>`,
   *      so the ordinary retry-once rule applies and a second loss fails the
   *      plan loudly.
   *
   * Then every wave that changed — and the current wave of every executing
   * plan, changed or not — is handed to its driver, which resumes the run if
   * the wave has ended and dispatches what is queued if a slot is free. The
   * unconditional check-in is deliberate: it is the only thing that will ever
   * move a wave whose dispatch queued every task (nothing in flight means
   * nothing will report), or whose settle was itself interrupted.
   *
   * Safe alongside live callbacks: every write is conditional, so a callback
   * and this pass applying the same outcome apply it once, and the driver's
   * `notify` is idempotent. Passes do not overlap. Never rejects.
   *
   * Tasks of terminal plans are left alone by design — a failed plan's
   * siblings are allowed to finish, and nothing waits on them.
   *
   * A task of a PAUSED plan is never declared lost. Its finished sessions are
   * still applied — that is writing down what happened — but silence is not
   * judged until the plan is resumed: losing a task spends its retry and can
   * fail the plan, and a plan somebody paused (or that was held at start-up,
   * below) is not to be changed underneath them. Nothing is lost by waiting;
   * a paused plan dispatches nothing, so the retry could not start anyway.
   *
   * `startup` marks the pass made when the bridge starts. That pass alone
   * first holds plans that have been idle too long to resume without a person
   * (`holdStalePlans`).
   */
  reconcile(
    now: Date = new Date(),
    options: { startup?: boolean } = {}
  ): Promise<ReconcileReport> {
    // Reentrancy guard, as in StatusPoller: setInterval fires on schedule
    // whatever the previous pass is still doing, and a pass can dispatch.
    if (this.reconciling) return this.reconciling;

    const pass = this.reconcileOnce(now, options.startup === true).finally(() => {
      if (this.reconciling === pass) this.reconciling = null;
    });
    this.reconciling = pass;
    return pass;
  }

  /**
   * Pause every plan left `executing` whose last activity is older than the
   * resume window, so that starting the cockpit starts no agents for it.
   * Returns the ids of the plans it paused.
   *
   * WHY. The start-up pass exists to pick up what a restart dropped: it
   * applies outcomes from session rows, hands every executing plan's wave to
   * its driver, and the driver dispatches what is owed — the next wave, a
   * retry, a queued task, a run that was cut off in the middle of dispatching.
   * That is right for a cockpit that was down for a minute. It is wrong for a
   * plan left `executing` weeks ago: a database that has been in use for a
   * while holds several, the first start after an upgrade would wake them all,
   * and each wakes real agents that spend the operator's tokens on work nobody
   * asked for today.
   *
   * THE ONE PLACE. Everything that can dispatch at start-up without a person
   * — the reconciler's resume and backfill, the legacy path's advance, and the
   * re-entry of a run interrupted mid-dispatch — is reached from this pass's
   * `settle`, which runs after this and never for a plan this held. And a held
   * plan is `paused`, which the dispatch claim refuses whoever asks. So the
   * rule is enforced here once, not at each thing that could start an agent.
   *
   * WHAT COUNTS AS ACTIVITY. The latest of: the plan row's `updatedAt` (moved
   * by every dispatch pass, pause, resume and merge); its tasks' `startedAt`,
   * `lastAttemptAt` and `completedAt`; and `updatedAt` on the sessions those
   * tasks are assigned to (a live runner moves that every ninety seconds). It
   * is read BEFORE this pass applies anything, because applying a session that
   * finished three weeks ago stamps its task as completed now, and the plan
   * would then look as though it had been busy a moment ago.
   *
   * WHAT IS LEFT ALONE. Everything but the plan's status and reason (see
   * `WaveExecutionController.holdStalePlan`). Sessions of a held plan that
   * have already finished are still applied to their tasks by the pass — that
   * is bookkeeping, and it starts nothing — but the plan's driver is not told,
   * so the run is not resumed, nothing is merged and the wave pointer does not
   * move. A person resumes it (`/api/wave-plans/:id/resume`, or the cockpit),
   * and it then behaves as any resumed plan does.
   *
   * Start-up only. A plan that goes quiet while the cockpit is running is the
   * reconciler's ordinary business (a silent session is lost after the stall
   * window), and pausing it would stop the retry that is the remedy.
   */
  private async holdStalePlans(now: Date, report: ReconcileReport): Promise<Set<string>> {
    const held = new Set<string>();
    const configured = this.reconcileOptions ? this.reconcileOptions.resumeMaxAgeMs : undefined;
    const maxAgeMs = configured ?? DEFAULT_RESUME_MAX_AGE_MS;
    if (maxAgeMs <= 0) return held;

    const executing = await this.db.query.wavePlans.findMany({
      where: eq(wavePlans.status, 'executing'),
    });

    for (const plan of executing) {
      try {
        const lastActivity = await this.lastActivity(plan);
        if (now.getTime() - lastActivity.getTime() <= maxAgeMs) continue;

        if (await this.controller.holdStalePlan(plan.id, lastActivity)) {
          held.add(plan.id);
          report.held++;
        }
      } catch (err) {
        // A plan whose age could not be read is not resumed on a guess: it is
        // counted as held for this pass (nothing is settled for it), left as
        // it is on disk, and looked at again by the next start.
        held.add(plan.id);
        report.errors.push(
          `reading the age of plan ${plan.id}: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }

    if (report.held > 0) {
      console.warn(
        `Wave reconciler: ${report.held} plan(s) left executing had no activity for more than ` +
          `${Math.round(maxAgeMs / 3_600_000)}h and were paused instead of resumed`
      );
    }
    return held;
  }

  /** When a plan last did anything. See `holdStalePlans` for what that means. */
  private async lastActivity(plan: { id: string; updatedAt: Date }): Promise<Date> {
    const tasks = await this.db.query.waveTasks.findMany({
      where: eq(waveTasks.wavePlanId, plan.id),
    });
    const sessionIds = tasks
      .map((task) => task.assignedSessionId)
      .filter((id): id is string => Boolean(id));
    const sessions = sessionIds.length
      ? await this.db.query.rufloSessions.findMany({ where: inArray(rufloSessions.id, sessionIds) })
      : [];

    const instants = [
      plan.updatedAt,
      ...tasks.flatMap((task) => [task.startedAt, task.lastAttemptAt, task.completedAt]),
      ...sessions.map((session) => session.updatedAt),
    ].filter((at): at is Date => at instanceof Date);

    return new Date(Math.max(...instants.map((at) => at.getTime())));
  }

  private async reconcileOnce(now: Date, startup: boolean): Promise<ReconcileReport> {
    const report: ReconcileReport = {
      examined: 0,
      completed: 0,
      failed: 0,
      lost: 0,
      settled: 0,
      held: 0,
      errors: [],
    };
    const stallMs =
      (this.reconcileOptions && this.reconcileOptions.stallMs) || DEFAULT_RECONCILE_STALL_MS;
    const toSettle = new Map<string, { wavePlanId: string; waveIndex: number }>();
    const mark = (wavePlanId: string, waveIndex: number) =>
      toSettle.set(`${wavePlanId}\u0000${waveIndex}`, { wavePlanId, waveIndex });

    try {
      // First, and before anything is applied: see `holdStalePlans`.
      const held = startup ? await this.holdStalePlans(now, report) : new Set<string>();

      const rows = await this.db
        .select({ task: waveTasks, planStatus: wavePlans.status })
        .from(waveTasks)
        .innerJoin(wavePlans, eq(waveTasks.wavePlanId, wavePlans.id))
        .where(
          and(
            inArray(waveTasks.status, [...IN_FLIGHT_WAVE_TASK_STATUSES]),
            notInArray(wavePlans.status, [...TERMINAL_WAVE_PLAN_STATUSES])
          )
        );

      for (const { task, planStatus } of rows) {
        report.examined++;
        try {
          const applied = await this.reconcileTask(task, now, stallMs, planStatus === 'paused');
          if (!applied) continue;
          report[applied]++;
          if (held.has(task.wavePlanId)) {
            // What happened is written down, the wave row included. The driver
            // is not told: a held plan is not resumed.
            await this.controller.recordWaveIfOver(task.wavePlanId, task.waveIndex);
            continue;
          }
          mark(task.wavePlanId, task.waveIndex);
        } catch (err) {
          report.errors.push(
            `${task.taskCode}: ${err instanceof Error ? err.message : String(err)}`
          );
        }
      }

      const executing = await this.db.query.wavePlans.findMany({
        where: eq(wavePlans.status, 'executing'),
      });
      for (const plan of executing) mark(plan.id, plan.currentWaveIndex);

      for (const { wavePlanId, waveIndex } of toSettle.values()) {
        try {
          await this.settle(wavePlanId, waveIndex);
          report.settled++;
        } catch (err) {
          report.errors.push(
            `settling wave ${waveIndex} of ${wavePlanId}: ${
              err instanceof Error ? err.message : String(err)
            }`
          );
        }
      }
    } catch (err) {
      report.errors.push(err instanceof Error ? err.message : String(err));
    }

    if (report.completed + report.failed + report.lost > 0) {
      console.warn(
        `Wave reconciler: ${report.completed} completion(s) and ${report.failed} failure(s) ` +
          `applied from session rows, ${report.lost} task(s) marked lost`
      );
    }
    if (report.errors.length > 0) {
      await this.recordFault(`Wave reconciler: ${report.errors.join('; ')}`, {
        errors: report.errors,
      });
    }

    return report;
  }

  /**
   * Reconcile one in-flight task. Returns what was applied, or null when the
   * task is fine (or someone else settled it first).
   */
  private async reconcileTask(
    task: WaveTask,
    now: Date,
    stallMs: number,
    planPaused: boolean
  ): Promise<'completed' | 'failed' | 'lost' | null> {
    const { wavePlanId, taskCode } = task;

    const session = task.assignedSessionId
      ? await this.db.query.rufloSessions.findFirst({
          where: eq(rufloSessions.id, task.assignedSessionId),
        })
      : undefined;

    if (!session) {
      // No session row: the dispatch never finished, or the row is gone. The
      // attempt's own start is the only clock there is. (`startedAt` is the
      // fallback for a task dispatched before `lastAttemptAt` existed.)
      const since = task.lastAttemptAt ?? task.startedAt;
      if (since && now.getTime() - since.getTime() < SESSION_LINK_GRACE_MS) return null;
      if (planPaused) return null;

      const outcome = await this.controller.onTaskFailed(
        wavePlanId,
        taskCode,
        `lost: no report since ${since ? since.toISOString() : 'dispatch'} (no session row)`
      );
      return outcome === 'ignored' ? null : 'lost';
    }

    const attempt = { sessionId: session.id };

    if (
      (session.status === 'COMPLETE' || session.status === 'ERROR') &&
      now.getTime() - session.updatedAt.getTime() < CALLBACK_HANDOFF_GRACE_MS
    ) {
      return null;
    }

    if (session.status === 'COMPLETE') {
      // The completion summary travels in the callback and is not stored on
      // the session row, so the callback's exact text is gone. The agent's
      // last message is the closest surviving thing — it is what the summary
      // is made from — and a successor task is better served by it than by
      // nothing.
      //
      // The same is true of where the work is. The task's branch, the commit
      // it was cut from, its head and its file list are in the callback and
      // nowhere on this row, so a task completed here has all four NULL — "not
      // recorded". For an isolated plan that loses less than it sounds: the
      // wave's merge asks the runner for the task by its code, not by anything
      // stored here, and its answer fills in the branch and the commit.
      // …and it finished when the session row says it did, not now.
      const applied = await this.listener.handleTaskComplete(
        wavePlanId,
        taskCode,
        session.telemetry?.lastText,
        session.id,
        undefined,
        session.updatedAt
      );
      return applied ? 'completed' : null;
    }

    if (session.status === 'ERROR') {
      // Likewise the error text: the row says only that it failed.
      const outcome = await this.controller.onTaskFailed(
        wavePlanId,
        taskCode,
        'session ended in ERROR (reconciled from the session row; its error was not recorded there)',
        { ...attempt, endedAt: session.updatedAt }
      );
      return outcome === 'ignored' ? null : 'failed';
    }

    if (!this.reportsLiveness(session)) return null;
    if (planPaused) return null;

    // Silence is measured from the later of the session's last report and the
    // moment this bridge started listening. A cockpit that was down for an
    // hour heard nothing for an hour, from agents that may have been working
    // the whole time; their runners' reports only start landing again once it
    // is back up, and they must be given the window to do so.
    const lastSeen = Math.max(session.updatedAt.getTime(), this.startedAt?.getTime() ?? 0);
    if (now.getTime() - lastSeen <= stallMs) return null;

    const outcome = await this.controller.onTaskFailed(
      wavePlanId,
      taskCode,
      `lost: no report since ${session.updatedAt.toISOString()}`,
      attempt
    );
    return outcome === 'ignored' ? null : 'lost';
  }

  /**
   * Whether a quiet session row means a quiet session.
   *
   * Only where something is contractually refreshing it. The session runner
   * heartbeats, so a `claude-session` row that stops moving has lost its
   * runner. The poll-based modes (`http`, `ao-cli`) write the row only when
   * the job's status CHANGES, so an hour-long job leaves it untouched for an
   * hour while perfectly healthy — silence there is not evidence, and a task
   * must not be failed on it. `NEEDS_SPEC` is a session waiting on a person,
   * which is not lost however long the person takes.
   *
   * A row with no mode recorded never got as far as an accepted dispatch (the
   * mode is written on acceptance), so it is judged by the clock too.
   */
  private reportsLiveness(session: RufloSession): boolean {
    if (session.status !== 'ACTIVE') return false;
    return session.orchestratorMode === 'claude-session' || session.orchestratorMode == null;
  }

  /** Write a bridge fault to the activity feed. Never throws. */
  private async recordFault(message: string, metadata: Record<string, unknown>): Promise<void> {
    try {
      await this.db.insert(activityEvents).values({
        type: 'WAVE_TASK_FAILED',
        message,
        metadata,
      });
    } catch {
      // Nothing more we can do if even the error insert fails.
    }
  }

  /** Extract a human-readable error from a job:error payload. */
  private errorMessage(data: OrchestratorEvent['data']): string {
    if (data && typeof data === 'object') {
      const d = data as Record<string, unknown>;
      if (typeof d.error === 'string') return d.error;
      if (d.error && typeof d.error === 'object' && 'message' in d.error) {
        return String((d.error as { message: unknown }).message);
      }
      if (typeof d.summary === 'string') return d.summary;
      if (typeof d.message === 'string') return d.message;
    }
    return 'error';
  }
}

/** Initialize (or replace) the process-wide ExecutionBridge singleton. */
export function initExecutionBridge(
  orchestrator: OrchestratorService,
  options: ExecutionBridgeOptions
): ExecutionBridge {
  if (bridgeInstance) {
    bridgeInstance.stop();
  }
  bridgeInstance = new ExecutionBridge(orchestrator, options);
  return bridgeInstance;
}

export function getExecutionBridgeOrNull(): ExecutionBridge | null {
  return bridgeInstance;
}
