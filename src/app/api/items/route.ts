import { NextRequest, NextResponse } from 'next/server';
import { db, horizonItems, activityEvents, eq, and, desc } from '@/lib/db';
import type { Zone, Complexity } from '@/lib/db';
import { getConductorGraph, threadFor } from '@/lib/conductor-graph';
import type { ConductorSummary } from '@/types';

/**
 * Summarise the live conductor run for one item.
 *
 * A conductor plan does not exist in the database while it is being reviewed.
 * The graph interrupts at the review gate and only the `persist` node — which
 * runs *after* approval — writes `wave_plans`. So between "plan ready" and
 * "approved" the plan lives solely in the LangGraph checkpoint.
 *
 * The board read the database, found nothing, and rendered "Planning agent is
 * still working on this" over a finished plan. Observed on AVA-10: two waves,
 * nine tasks, 89% parallelization, and a card that said it was still thinking.
 * The review gate is the one moment the plan MUST be visible — it is the moment
 * a human is being asked to judge it.
 *
 * Reads the checkpoint, which is a local SQLite lookup, not a model call.
 * Returns null for items that have never been through the conductor.
 */
async function conductorSummary(itemId: string): Promise<ConductorSummary | null> {
  try {
    const snapshot = await getConductorGraph().getState(threadFor(itemId));
    if (!snapshot.createdAt) return null;

    const values = snapshot.values as Record<string, unknown>;
    const interrupts = snapshot.tasks.flatMap((t) => t.interrupts ?? []);
    const pending = interrupts[0]?.value as Record<string, unknown> | undefined;
    const waiting = Boolean(pending && 'waveIndex' in pending);

    const plan = (pending?.plan ?? values.plan) as
      | { waves?: { label?: string; tasks?: unknown[] }[] }
      | undefined;
    const waves = plan?.waves ?? [];

    return {
      status: String(values.status ?? 'planning'),
      awaiting: pending ? (waiting ? 'wave' : 'review') : null,
      waveCount: waves.length,
      taskCount: waves.reduce((n, w) => n + (w.tasks?.length ?? 0), 0),
      waveNames: waves.map((w, i) => w.label ?? `Wave ${i + 1}`),
      parallelizationScore:
        (values.score as { parallelizationScore?: number } | undefined)?.parallelizationScore ??
        null,
      currentWaveIndex: Number(values.currentWaveIndex ?? 0),
      wavePlanId: (values.wavePlanId as string | undefined) ?? null,
    };
  } catch {
    // A board that renders is worth more than a board that 500s because one
    // checkpoint is unreadable.
    return null;
  }
}

// GET /api/items - List all horizon items
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const zone = searchParams.get('zone') as Zone | null;
    const repo = searchParams.get('repo');
    // The Linear bridge needs to ask "is this ticket already on the board?"
    // before creating an item, or a redelivered/re-claimed dispatch produces a
    // duplicate item and a duplicate conductor run.
    const linearTicketId = searchParams.get('linearTicketId');

    // Build where conditions
    const conditions = [];
    if (zone) conditions.push(eq(horizonItems.zone, zone));
    if (repo) conditions.push(eq(horizonItems.repo, repo));
    if (linearTicketId) conditions.push(eq(horizonItems.linearTicketId, linearTicketId));

    const items = await db.query.horizonItems.findMany({
      where: conditions.length > 0 ? and(...conditions) : undefined,
      with: {
        plan: {
          with: {
            workstreams: {
              with: {
                tasks: true,
              },
            },
            sequentialTasks: true,
            filesTouched: true,
          },
        },
        conflictingFiles: true,
      },
      orderBy: [desc(horizonItems.priority), desc(horizonItems.createdAt)],
    });

    /**
     * Only REFINING items can be mid-review, and there are a handful of them.
     * Reading every item's checkpoint would turn one board load into N SQLite
     * reads for no gain.
     */
    const withConductor = await Promise.all(
      items.map(async (item) =>
        item.zone === 'REFINING'
          ? { ...item, conductor: await conductorSummary(item.id) }
          : item
      )
    );

    return NextResponse.json(withConductor);
  } catch (error) {
    console.error('Failed to fetch items:', error);
    return NextResponse.json(
      { error: 'Failed to fetch items' },
      { status: 500 }
    );
  }
}

// POST /api/items - Create a new horizon item
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { title, zone = 'DIRECTIONAL', repo, complexity, priority = 0, linearTicketId } = body;

    if (!title || !repo) {
      return NextResponse.json(
        { error: 'Title and repo are required' },
        { status: 400 }
      );
    }

    // Insert the new item
    const [item] = await db.insert(horizonItems).values({
      title,
      zone: zone as Zone,
      repo,
      complexity: complexity as Complexity | undefined,
      priority,
      linearTicketId,
    }).returning();

    // Fetch with relations
    const itemWithRelations = await db.query.horizonItems.findFirst({
      where: eq(horizonItems.id, item.id),
      with: {
        plan: true,
        conflictingFiles: true,
      },
    });

    // Create activity event
    await db.insert(activityEvents).values({
      type: 'ITEM_CREATED',
      message: `New item "${title}" added to ${zone}`,
      repo,
      ticketId: linearTicketId,
    });

    return NextResponse.json(itemWithRelations, { status: 201 });
  } catch (error) {
    console.error('Failed to create item:', error);
    return NextResponse.json(
      { error: 'Failed to create item' },
      { status: 500 }
    );
  }
}
