import { NextRequest, NextResponse } from 'next/server';
import { Command, type ReviewDecision } from '@devpilot.sh/conductor-agent';
import { db, horizonItems, eq } from '@/lib/db';
import { getConductorGraph, threadFor } from '@/lib/conductor-graph';
import { recordRun } from '@/lib/conductor-memory';
import { buildSpecContentForItem } from '@devpilot.sh/core/wave-planner';

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

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({} as Record<string, unknown>));

    const item = await db.query.horizonItems.findFirst({
      where: eq(horizonItems.id, id),
      with: { plan: true },
    });
    if (!item) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 });
    }

    const graph = getConductorGraph();
    const thread = threadFor(id);

    // --- Resume paths -------------------------------------------------------
    if (body.decision) {
      const result = await graph.invoke(
        new Command({ resume: body.decision as ReviewDecision }),
        thread
      );
      maybeRecord(result as Record<string, unknown>);
      return NextResponse.json(describe(result as Record<string, unknown>));
    }

    if (body.waveOutcome) {
      const result = await graph.invoke(
        new Command({ resume: body.waveOutcome }),
        thread
      );
      maybeRecord(result as Record<string, unknown>);
      return NextResponse.json(describe(result as Record<string, unknown>));
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
    // conductor run and a direct generation see identical input.
    const specContent = adopting
      ? ''
      : buildSpecContentForItem({
          title: item.title,
          plan: item.plan as Parameters<typeof buildSpecContentForItem>[0]['plan'],
        });

    const result = await graph.invoke(
      {
        itemId: id,
        itemTitle: item.title,
        repo: item.repo,
        specContent,
        ...(adopting ? { plan: body.plan, wavePlanId: body.wavePlanId } : {}),
      },
      thread
    );

    maybeRecord(result as Record<string, unknown>);
    return NextResponse.json(describe(result as Record<string, unknown>));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Conductor run failed:', error);
    return NextResponse.json({ error: 'CONDUCTOR_FAILED', detail: message }, { status: 500 });
  }
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const graph = getConductorGraph();
    const snapshot = await graph.getState(threadFor(id));

    if (!snapshot.createdAt) {
      return NextResponse.json({ status: null, awaiting: null }, { status: 404 });
    }

    return NextResponse.json({
      ...describe({
        ...(snapshot.values as Record<string, unknown>),
        __interrupt__: snapshot.tasks.flatMap((t) => t.interrupts ?? []),
      }),
      next: snapshot.next,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: 'CONDUCTOR_FAILED', detail: message }, { status: 500 });
  }
}
