import { interrupt } from '@langchain/langgraph';
import type { ConductorStateType, ConductorUpdate } from './state';
import type {
  ConductorConfig,
  ConductorPorts,
  GeneratePlanInput,
  ReviewDecision,
  ReviewRequest,
  WaveOutcome,
} from './types';

/**
 * Node implementations.
 *
 * Every node is a pure-ish `state -> partial state` function. Side effects go
 * through `ports`; nothing here touches a database or an SDK directly, which is
 * what makes the graph testable with six stub functions and no infrastructure.
 */

/**
 * How many waves the run has: the persisted plan's count when the host gave
 * one, otherwise the planner's. The one place this is decided — the branch
 * after `advance` and the `run:complete` event must not disagree about it.
 */
export function waveCount(state: ConductorStateType): number {
  return state.totalWaves ?? state.plan?.waves.length ?? 0;
}

/** How many tasks the plan in hand has. */
export function taskCount(state: ConductorStateType): number {
  return state.plan?.waves.reduce((n, wave) => n + wave.tasks.length, 0) ?? 0;
}

/**
 * Whether the plan is below the parallelization threshold AND large enough
 * for the threshold to mean something. The one place this is decided: the
 * branch after planning and the `belowThreshold` a reviewer is shown must
 * agree, or a one-task plan is waved through and then presented as deficient.
 */
export function belowThreshold(state: ConductorStateType, config: ConductorConfig): boolean {
  if (taskCount(state) < config.minTasksForRefinement) return false;
  return (state.score?.parallelizationScore ?? 0) < config.minParallelizationScore;
}

function usableWaveCount(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null;
}

function planInput(state: ConductorStateType): GeneratePlanInput {
  return {
    itemId: state.itemId,
    itemTitle: state.itemTitle,
    repo: state.repo,
    specContent: state.specContent,
    constraints: state.constraints,
  };
}

export function makeNodes(ports: ConductorPorts, config: ConductorConfig) {
  const emit = (event: Parameters<NonNullable<ConductorPorts['onEvent']>>[0]) =>
    ports.onEvent?.(event);

  /** Generate the first plan and score it. */
  async function generate(state: ConductorStateType): Promise<ConductorUpdate> {
    const result = await ports.generatePlan(planInput(state));
    const score = await ports.scorePlan(result.plan);

    emit({ type: 'plan:generated', iterations: 1, score: score.parallelizationScore });

    return {
      plan: result.plan,
      score,
      refinementIterations: 1,
      tokensUsed: result.tokensUsed ?? 0,
      costUsd: result.costUsd ?? 0,
      status: 'planning',
    };
  }

  /**
   * One refinement pass.
   *
   * A refinement is kept only if it actually scored better. The model is quite
   * willing to return a *different* plan that parallelises worse, and accepting
   * it because it is newer makes the loop a random walk. Iterations still count
   * up either way, so a run that cannot improve terminates.
   */
  async function refine(state: ConductorStateType): Promise<ConductorUpdate> {
    const result = await ports.refinePlan({
      ...planInput(state),
      previousPlan: state.plan ?? undefined,
      previousScore: state.score ?? undefined,
    });
    const score = await ports.scorePlan(result.plan);

    const improved =
      score.parallelizationScore > (state.score?.parallelizationScore ?? -Infinity);

    emit({
      type: 'plan:refined',
      iterations: state.refinementIterations + 1,
      score: score.parallelizationScore,
      improved,
    });

    return {
      plan: improved ? result.plan : state.plan,
      score: improved ? score : state.score,
      refinementIterations: state.refinementIterations + 1,
      tokensUsed: result.tokensUsed ?? 0,
      costUsd: result.costUsd ?? 0,
    };
  }

  /**
   * Human-in-the-loop review — the node the old architecture could not express.
   *
   * `interrupt()` suspends the run and hands the plan to the conductor. Their
   * decision comes back as the return value when the host resumes with a
   * `Command({ resume })`. Plan review stops being a separate database flow
   * bolted onto the side and becomes a step the agent genuinely waits at, so
   * constraints the conductor adds re-enter refinement as state.
   */
  async function review(state: ConductorStateType): Promise<ConductorUpdate> {
    const request: ReviewRequest = {
      itemId: state.itemId,
      itemTitle: state.itemTitle,
      plan: state.plan!,
      score: state.score!,
      refinementIterations: state.refinementIterations,
      belowThreshold: belowThreshold(state, config),
    };

    const decision = interrupt<ReviewRequest, ReviewDecision>(request);

    if (decision.action === 'abort') {
      emit({ type: 'plan:aborted', reason: decision.reason });
      return {
        status: 'aborted',
        errors: decision.reason ? [decision.reason] : ['aborted at review'],
      };
    }

    if (decision.action === 'refine') {
      return { constraints: decision.constraints, status: 'planning' };
    }

    return { status: 'executing' };
  }

  /** Persist the approved plan so dispatch has an id to work against. */
  async function persist(state: ConductorStateType): Promise<ConductorUpdate> {
    const { wavePlanId, totalWaves } = await ports.persistPlan(
      state.plan!,
      state.score!,
      planInput(state)
    );
    emit({ type: 'plan:approved', wavePlanId });
    return {
      wavePlanId,
      // Only a usable count is kept. Anything else — absent, zero, not a whole
      // number — leaves the graph counting the planner's waves, which is what
      // it did before a host could say.
      totalWaves: usableWaveCount(totalWaves),
      status: 'executing',
      currentWaveIndex: 0,
    };
  }

  /**
   * Dispatch what can be dispatched of the current wave.
   *
   * Reached three ways — a wave's first dispatch, a wave retry, and an
   * `in-flight` signal — and it is the same call each time; the port is
   * required to be idempotent. The result's `settled` is carried into
   * `waveSignal` so `awaitWave` does not wait on a wave that is already over.
   */
  async function dispatch(state: ConductorStateType): Promise<ConductorUpdate> {
    const backfill = state.waveSignal?.state === 'in-flight';
    const result = await ports.dispatchWave(state.wavePlanId!, state.currentWaveIndex);

    emit({
      type: 'wave:dispatched',
      waveIndex: state.currentWaveIndex,
      dispatched: result.dispatched,
      queued: result.queued,
      ...(backfill ? { backfill: true } : {}),
    });

    return {
      // A run that is dispatching is executing. `persist` says so too, but a run
      // that ADOPTS an existing plan enters here without passing through it, and
      // reported `planning` for its whole life — so anything that narrates an
      // executing run (DevPilot's bridge watcher does) said nothing about it.
      status: 'executing',
      lastDispatch: { dispatched: result.dispatched, queued: result.queued },
      waveSignal: result.settled ?? null,
      errors: result.errors.map((e) => `wave ${state.currentWaveIndex} ${e.taskCode}: ${e.error}`),
    };
  }

  /**
   * Wait for the current wave to reach a terminal state.
   *
   * Without a `waitForWave` port this `interrupt()`s: the graph checkpoints and
   * stops, and the host resumes it when its completion callbacks say the wave is
   * done. That is the correct shape when a wave is a fleet of coding agents
   * running for an hour — holding an open promise across that is how you lose
   * the run to a restart.
   *
   * It does not wait at all when `dispatch` already knows how the wave ended.
   * Nothing would ever answer: a wave with no task in flight has no completion
   * callback coming, so the interrupt would never be resumed.
   */
  async function awaitWave(state: ConductorStateType): Promise<ConductorUpdate> {
    const known = state.waveSignal;

    const outcome: WaveOutcome =
      known && known.state !== 'in-flight'
        ? known
        : ports.waitForWave
          ? await ports.waitForWave(state.wavePlanId!, state.currentWaveIndex)
          : interrupt<{ wavePlanId: string; waveIndex: number }, WaveOutcome>({
              wavePlanId: state.wavePlanId!,
              waveIndex: state.currentWaveIndex,
            });

    // Still running; the branch after this node sends it back to `dispatch`.
    if (outcome.state === 'in-flight') {
      return { waveSignal: outcome };
    }

    if (outcome.state === 'complete') {
      emit({ type: 'wave:complete', waveIndex: state.currentWaveIndex });
      return { waveSignal: outcome, completedWaves: [state.currentWaveIndex] };
    }

    emit({
      type: 'wave:failed',
      waveIndex: state.currentWaveIndex,
      failures: outcome.failures.length,
    });
    return {
      waveSignal: outcome,
      errors: outcome.failures.map(
        (f) => `wave ${state.currentWaveIndex} ${f.taskCode}: ${f.error}`
      ),
    };
  }

  /** Move to the next wave, resetting the per-wave retry budget. */
  async function advance(state: ConductorStateType): Promise<ConductorUpdate> {
    return { currentWaveIndex: state.currentWaveIndex + 1, waveRetries: 0 };
  }

  /** Consume one retry and re-dispatch the same wave. */
  async function retryWave(state: ConductorStateType): Promise<ConductorUpdate> {
    return { waveRetries: state.waveRetries + 1 };
  }

  /**
   * Both terminal nodes tell the host how the run ended before they return.
   * A run aborted at review has no persisted plan and nothing to tell it about.
   */
  async function finish(state: ConductorStateType): Promise<ConductorUpdate> {
    if (state.wavePlanId) {
      await ports.endRun?.(state.wavePlanId, { status: 'complete' });
    }
    emit({ type: 'run:complete', waves: waveCount(state) });
    return { status: 'complete' };
  }

  async function fail(state: ConductorStateType): Promise<ConductorUpdate> {
    const reason = state.errors[state.errors.length - 1] ?? 'unknown failure';
    if (state.wavePlanId) {
      await ports.endRun?.(state.wavePlanId, { status: 'failed', reason });
    }
    emit({ type: 'run:failed', reason });
    return { status: 'failed' };
  }

  return { generate, refine, review, persist, dispatch, awaitWave, advance, retryWave, finish, fail };
}
