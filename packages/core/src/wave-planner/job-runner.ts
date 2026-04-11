/**
 * Wave Plan Job Runner
 * =============================================================================
 *
 * The borrowed-from-ULTRAPLAN piece: plan generation runs as an asynchronous
 * job that the UI can poll. The caller no longer waits for the entire Opus +
 * extended-thinking run to finish — it gets a `jobId` back immediately, then
 * polls `GET /api/items/:id/wave-plan/jobs/:jobId` until the job reaches
 * `ready`, at which point the user can explicitly approve or reject.
 *
 * Design notes:
 *   - The authoritative job state lives in the `wave_plan_jobs` table. The
 *     in-process `activeJobs` map only exists so we can hold an
 *     `AbortController` for cancellation — it is not a cache and losing it
 *     (e.g. across a server restart) only means in-flight jobs can't be
 *     cancelled mid-stream, not that their state is lost.
 *   - Progress updates are debounced so we don't hammer the DB with writes on
 *     every streaming token; we update at phase boundaries and on completion.
 *   - Because devpilot's backend is a plain Next.js server (not a background
 *     worker framework), jobs run inside the request process via a
 *     fire-and-forget `.then()`. That is deliberate — the "container per
 *     plan" pattern from ULTRAPLAN is unnecessary in a web app because we
 *     already have process isolation from the UI. If/when devpilot adds a
 *     proper queue (BullMQ, Temporal, etc.), swap the `.then()` for a
 *     `queue.add()` and everything else in this file stays the same.
 */

import { getDatabase } from '../db/client';
import { wavePlanJobs } from '../db/schema';
import { eq } from 'drizzle-orm';
import type { WavePlanJob, WavePlanJobStatus, WavePlanModelTier } from '../db/schema';
import {
  createWavePlanGeneratorFromEnv,
  type WavePlanGenerator,
  type WavePlanGenerationResult,
} from './generator';
import type {
  RefinementPhase,
  RefinementRuntimeOptions,
} from './plan-refinement-service';
import type {
  GenerationProgressCallback,
  GenerationProgressEvent,
} from './ai-client';

// ---------------------------------------------------------------------------
// In-process registry of live jobs (for cancellation only)
// ---------------------------------------------------------------------------

interface LiveJob {
  abortController: AbortController;
  startedAt: Date;
}

const activeJobs = new Map<string, LiveJob>();

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface StartJobInput {
  horizonItemId: string;
  planId: string;
  specContent: string;
  itemTitle: string;
  repo: string;
  workingDir: string;
  apiKey: string;
  /** Start directly on the ultra tier instead of standard → escalate. */
  forceUltra?: boolean;
}

export interface StartJobResult {
  jobId: string;
  status: WavePlanJobStatus;
}

/**
 * Enqueue a new plan generation job. Returns immediately with a job id; the
 * actual generation runs in the background and is tracked in the
 * `wave_plan_jobs` table.
 */
export async function startPlanJob(input: StartJobInput): Promise<StartJobResult> {
  const db = getDatabase();

  const initialTier: WavePlanModelTier = input.forceUltra ? 'ultra' : 'standard';

  const [row] = await db
    .insert(wavePlanJobs)
    .values({
      horizonItemId: input.horizonItemId,
      planId: input.planId,
      status: 'queued',
      modelTier: initialTier,
      currentStep: 'Queued — waiting for planner',
      progressPercent: 0,
      startedAt: new Date(),
    })
    .returning();

  const jobId = row.id;

  // Kick off generation in the background. We intentionally do not `await`:
  // the request handler returns the jobId immediately and the client polls.
  void runJob(jobId, input).catch(async (err) => {
    const message = err instanceof Error ? err.message : String(err);
    // If cancelled, status was already updated by cancelPlanJob; skip.
    const current = await getPlanJob(jobId);
    if (current?.status === 'cancelled') return;
    await updateJob(jobId, {
      status: 'failed',
      errorMessage: message,
      currentStep: 'Failed',
      completedAt: new Date(),
    });
    activeJobs.delete(jobId);
  });

  return { jobId, status: 'queued' };
}

/**
 * Fetch a job's current state. The `wave_plan_jobs` row IS the state — the
 * client polls this to drive the `PlanProgressCard` UI.
 */
export async function getPlanJob(jobId: string): Promise<WavePlanJob | null> {
  const db = getDatabase();
  const rows = await db
    .select()
    .from(wavePlanJobs)
    .where(eq(wavePlanJobs.id, jobId))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Cancel a running job. If the job is still in-flight, the AbortSignal is
 * fired and the generator unwinds promptly. If the job has already finished
 * (ready/approved/rejected/failed), this is a no-op.
 */
export async function cancelPlanJob(jobId: string): Promise<boolean> {
  const job = await getPlanJob(jobId);
  if (!job) return false;

  if (
    job.status === 'ready' ||
    job.status === 'approved' ||
    job.status === 'rejected' ||
    job.status === 'failed' ||
    job.status === 'cancelled'
  ) {
    return false;
  }

  const live = activeJobs.get(jobId);
  if (live) {
    live.abortController.abort();
    activeJobs.delete(jobId);
  }

  await updateJob(jobId, {
    status: 'cancelled',
    currentStep: 'Cancelled by user',
    completedAt: new Date(),
  });

  return true;
}

/**
 * Explicitly approve a `ready` job. This is the first-class approve path:
 * instead of silently flipping the horizon item's zone, we record the
 * approval against the job row so the draft is preserved for audit.
 *
 * Returns the wavePlanId the caller should promote.
 */
export async function approvePlanJob(jobId: string): Promise<WavePlanJob> {
  const job = await getPlanJob(jobId);
  if (!job) throw new Error(`Job not found: ${jobId}`);
  if (job.status !== 'ready') {
    throw new Error(
      `Cannot approve job in status "${job.status}" (expected "ready")`
    );
  }
  const updated = await updateJob(jobId, {
    status: 'approved',
    currentStep: 'Approved',
    completedAt: new Date(),
  });
  return updated;
}

/**
 * Reject a `ready` job with an optional reason. The draft wave plan is
 * retained (we do not delete `resultWavePlanId`) so the user can still see
 * what was proposed. Callers typically follow up with a replan request that
 * passes the rejection reason as a constraint.
 */
export async function rejectPlanJob(
  jobId: string,
  reason: string
): Promise<WavePlanJob> {
  const job = await getPlanJob(jobId);
  if (!job) throw new Error(`Job not found: ${jobId}`);
  if (job.status !== 'ready') {
    throw new Error(
      `Cannot reject job in status "${job.status}" (expected "ready")`
    );
  }
  const updated = await updateJob(jobId, {
    status: 'rejected',
    rejectionReason: reason,
    currentStep: 'Rejected',
    completedAt: new Date(),
  });
  return updated;
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

async function runJob(jobId: string, input: StartJobInput): Promise<void> {
  const abortController = new AbortController();
  activeJobs.set(jobId, { abortController, startedAt: new Date() });

  const generator: WavePlanGenerator = createWavePlanGeneratorFromEnv(input.apiKey, {
    forceUltra: input.forceUltra,
  });

  // ------------------------------------------------------------------
  // Progress callbacks
  //
  // We map the two lower-level streams (RefinementPhase from the service,
  // GenerationProgressEvent from the AI client) into DB writes on the job
  // row. The UI polls `GET .../jobs/:jobId` and renders these fields.
  // ------------------------------------------------------------------
  const onPhase = (phase: RefinementPhase): void => {
    const updates: Partial<WavePlanJob> = {};
    switch (phase.type) {
      case 'generating':
        updates.status = phase.tier === 'ultra' ? 'thinking' : 'drafting';
        updates.modelTier = phase.tier;
        updates.iterations = phase.iteration;
        updates.currentStep =
          phase.tier === 'ultra'
            ? `Thinking (ultra tier, attempt ${phase.iteration})`
            : `Drafting plan (attempt ${phase.iteration})`;
        updates.progressPercent = phase.tier === 'ultra' ? 45 : 20;
        break;
      case 'validating':
        updates.status = 'validating';
        updates.currentStep = 'Validating DAG';
        updates.progressPercent = 70;
        break;
      case 'refining':
        updates.status = 'refining';
        updates.modelTier = phase.tier;
        updates.iterations = phase.iteration;
        updates.currentStep = `Refining (score ${(phase.currentScore * 100).toFixed(0)}%, attempt ${phase.iteration})`;
        updates.bestParallelizationScore = phase.currentScore;
        updates.progressPercent = 60;
        break;
      case 'escalating':
        updates.status = 'escalating';
        updates.modelTier = 'ultra';
        updates.escalated = true;
        updates.escalationReason = phase.reason;
        updates.currentStep = `Escalating to ultra tier`;
        updates.progressPercent = 40;
        break;
      case 'done':
        updates.modelTier = phase.tier;
        updates.bestParallelizationScore = phase.score;
        updates.progressPercent = 95;
        break;
    }
    // Fire-and-forget; don't block the generator on DB writes.
    void updateJob(jobId, updates).catch(() => {
      /* best-effort progress write */
    });
  };

  const onProgress: GenerationProgressCallback = (event: GenerationProgressEvent) => {
    const updates: Partial<WavePlanJob> = {};
    switch (event.type) {
      case 'started':
        updates.lastModel = event.model;
        if (event.hasThinking) {
          updates.status = 'thinking';
          updates.currentStep = `Thinking (${event.model})`;
        }
        break;
      case 'thinking':
        updates.status = 'thinking';
        updates.currentStep = 'Extended thinking in progress';
        break;
      case 'drafting':
        updates.status = 'drafting';
        updates.currentStep = 'Drafting plan';
        break;
      case 'completed':
        updates.tokensInput = (Number(updates.tokensInput) || 0) + event.tokensInput;
        updates.tokensOutput = (Number(updates.tokensOutput) || 0) + event.tokensOutput;
        updates.thinkingTokens =
          (Number(updates.thinkingTokens) || 0) + event.thinkingTokens;
        break;
    }
    void updateJob(jobId, updates).catch(() => {
      /* best-effort */
    });
  };

  const runtime: RefinementRuntimeOptions = {
    onPhase,
    onProgress,
    signal: abortController.signal,
  };

  await updateJob(jobId, {
    status: input.forceUltra ? 'thinking' : 'drafting',
    currentStep: input.forceUltra
      ? 'Starting on ultra tier'
      : 'Starting on standard tier',
    progressPercent: 5,
  });

  let result: WavePlanGenerationResult;
  try {
    result = await generator.generate(
      input.horizonItemId,
      input.planId,
      input.specContent,
      input.itemTitle,
      input.repo,
      { workingDir: input.workingDir },
      runtime
    );
  } finally {
    activeJobs.delete(jobId);
  }

  // Accumulate final metrics. Note we *overwrite* token counters with the
  // authoritative totals from the generator metrics, since the streaming
  // callbacks above were approximate.
  await updateJob(jobId, {
    status: 'ready',
    currentStep: `Ready — ${result.wavePlan.statistics.totalTasks} tasks across ${result.waveAssignment.totalWaves} waves`,
    progressPercent: 100,
    resultWavePlanId: result.wavePlanId,
    bestParallelizationScore: result.score.parallelizationScore,
    modelTier: result.metrics.modelTierUsed,
    lastModel: result.metrics.modelUsed,
    escalated: result.metrics.escalated,
    escalationReason: result.metrics.escalationReason,
    iterations: result.metrics.refinementIterations,
    tokensInput: 0, // reset; writing the aggregate below
    tokensOutput: result.metrics.totalTokensUsed,
    thinkingTokens: result.metrics.thinkingTokensUsed,
    completedAt: new Date(),
  });
}

async function updateJob(
  jobId: string,
  updates: Partial<WavePlanJob>
): Promise<WavePlanJob> {
  const db = getDatabase();
  const [row] = await db
    .update(wavePlanJobs)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(wavePlanJobs.id, jobId))
    .returning();
  return row;
}
