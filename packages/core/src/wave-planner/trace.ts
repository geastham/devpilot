/**
 * The planner's record of itself: every call to the planning model, and every
 * decision a person made about a plan.
 *
 * A plan is the most leveraged thing DevPilot produces — one model call that
 * then governs a fleet of sessions — and until this file the only thing kept
 * of that call was the answer that was chosen. Not what the model had been
 * told, not the plans tried and discarded on the way, not what a reviewer
 * sent back or why. A planner cannot be improved from that: there is nothing
 * to hold a plan's outcome against.
 *
 * So each call writes a row (`planner_traces`), each review writes a row
 * (`planner_reviews`), and when a plan is persisted every row that led to it
 * is given its id. From there the outcome is already recorded, task by task,
 * in `wave_tasks`. `planner-corpus.ts` joins the two.
 *
 * ## Three rules
 *
 * NEVER IN THE WAY. Every function here catches everything. A record that can
 * fail a planning run is worse than no record, and a database that is locked
 * or missing a table must cost a plan nothing.
 *
 * LOCAL. A prompt holds the specification, the repository's file tree and any
 * memory that was recalled; a response is the plan. They are written to the
 * cockpit's own database, on the machine the cockpit runs on, and nothing in
 * DevPilot sends them anywhere. Whether any of it should ever leave is a
 * decision for the person whose code it is, and is not made here.
 *
 * OFF IS OFF. `DEVPILOT_PLANNER_TRACE=0` records nothing.
 */

import { createHash } from 'node:crypto';
import { createId } from '@paralleldrive/cuid2';
import { and, eq, isNull } from 'drizzle-orm';
import { getDatabase } from '../db/client';
import { plannerReviews, plannerTraces } from '../db/schema';
import type { PlanScore } from './types';

export type PlannerTraceKind = 'initial' | 'refine' | 'reoptimize';
export type PlannerTraceOutcome = 'valid' | 'invalid' | 'error';

export interface PlannerTraceRecord {
  runId: string;
  step: number;
  kind: PlannerTraceKind;
  itemId: string;
  repo: string;
  template: string;
  templateVersion: string;
  modelRequested: string;
  prompt: string;
  constraints?: string[];
  /** What the model answered, when it did. */
  response?: {
    content: string;
    model: string;
    stopReason: string | null;
    tokensInput: number;
    tokensOutput: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
    durationMs: number;
  };
  /** For a refinement: the plan it was asked to improve, and the score to beat. */
  basedOn?: { rawMarkdown: string; score: number };
  outcome: PlannerTraceOutcome;
  errors?: string[];
  warnings?: string[];
  taskCount?: number;
  score?: PlanScore;
}

export interface PlanReviewRecord {
  itemId: string;
  /** The plan that was on screen, as the planner wrote it. */
  rawMarkdown?: string | null;
  action: 'approve' | 'refine' | 'abort';
  constraints?: string[];
  reason?: string;
  score?: number | null;
}

/** False when `DEVPILOT_PLANNER_TRACE` says no. On by default. */
export function plannerTraceEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const value = (env.DEVPILOT_PLANNER_TRACE ?? '').trim().toLowerCase();
  return !['0', 'false', 'off', 'no'].includes(value);
}

/** A plan's identity: the hash of its text exactly as the model wrote it. */
export function planSha(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

export function newPlannerRunId(): string {
  return createId();
}

let warned = false;
function warnOnce(what: string, error: unknown): void {
  if (warned) return;
  warned = true;
  console.warn(
    `[planner-trace] ${what} could not be recorded (${error instanceof Error ? error.message : String(error)}). ` +
      'Planning is unaffected; further failures are not reported.'
  );
}

/** Record one call to the planning model. Never throws. */
export async function recordPlannerTrace(record: PlannerTraceRecord): Promise<void> {
  if (!plannerTraceEnabled()) return;
  try {
    const improved =
      record.basedOn && record.score ? record.score.parallelizationScore > record.basedOn.score : null;

    await getDatabase()
      .insert(plannerTraces)
      .values({
        runId: record.runId,
        step: record.step,
        kind: record.kind,
        itemId: record.itemId,
        repo: record.repo,
        template: record.template,
        templateVersion: record.templateVersion,
        modelRequested: record.modelRequested,
        model: record.response?.model ?? null,
        prompt: record.prompt,
        promptSha: planSha(record.prompt),
        response: record.response?.content ?? null,
        responseSha: record.response ? planSha(record.response.content) : null,
        basedOnSha: record.basedOn ? planSha(record.basedOn.rawMarkdown) : null,
        stopReason: record.response?.stopReason ?? null,
        tokensInput: record.response?.tokensInput ?? null,
        tokensOutput: record.response?.tokensOutput ?? null,
        cacheReadTokens: record.response?.cacheReadTokens ?? null,
        cacheWriteTokens: record.response?.cacheWriteTokens ?? null,
        durationMs: record.response?.durationMs ?? null,
        outcome: record.outcome,
        errors: record.errors && record.errors.length > 0 ? record.errors : null,
        warnings: record.warnings && record.warnings.length > 0 ? record.warnings : null,
        taskCount: record.taskCount ?? null,
        score: record.score?.parallelizationScore ?? null,
        scoreDetail: record.score ? ({ ...record.score } as Record<string, unknown>) : null,
        previousScore: record.basedOn?.score ?? null,
        improved,
        constraints: record.constraints && record.constraints.length > 0 ? record.constraints : null,
      });
  } catch (error) {
    warnOnce('a planner call', error);
  }
}

/** Record what a person decided about a plan they were shown. Never throws. */
export async function recordPlanReview(review: PlanReviewRecord): Promise<void> {
  if (!plannerTraceEnabled()) return;
  try {
    await getDatabase()
      .insert(plannerReviews)
      .values({
        itemId: review.itemId,
        planSha: review.rawMarkdown ? planSha(review.rawMarkdown) : null,
        action: review.action,
        constraints: review.constraints && review.constraints.length > 0 ? review.constraints : null,
        reason: review.reason?.trim() || null,
        score: review.score ?? null,
      });
  } catch (error) {
    warnOnce('a plan review', error);
  }
}

/**
 * A plan has been persisted for the item: give its id to everything that led
 * to it.
 *
 * "Everything that led to it" is every call and every review for the item not
 * already claimed by an earlier plan — the initial attempt, the refinements
 * that were kept and the ones that were not, the review that sent it back.
 * The one call whose answer IS this plan is marked `chosen`, matched on the
 * hash of the text; a fallback plan, which no model wrote, has none.
 *
 * Never throws.
 */
export async function linkTracesToPlan(
  itemId: string,
  rawMarkdown: string | null | undefined,
  wavePlanId: string
): Promise<void> {
  if (!plannerTraceEnabled()) return;
  try {
    const db = getDatabase();
    await db
      .update(plannerTraces)
      .set({ wavePlanId })
      .where(and(eq(plannerTraces.itemId, itemId), isNull(plannerTraces.wavePlanId)));
    await db
      .update(plannerReviews)
      .set({ wavePlanId })
      .where(and(eq(plannerReviews.itemId, itemId), isNull(plannerReviews.wavePlanId)));

    if (rawMarkdown) {
      await db
        .update(plannerTraces)
        .set({ chosen: true })
        .where(
          and(
            eq(plannerTraces.wavePlanId, wavePlanId),
            eq(plannerTraces.responseSha, planSha(rawMarkdown)),
            eq(plannerTraces.outcome, 'valid')
          )
        );
    }
  } catch (error) {
    warnOnce('the link between a plan and its planner calls', error);
  }
}

/** For tests: forget that a warning was printed. */
export function resetPlannerTraceWarning(): void {
  warned = false;
}
