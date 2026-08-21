import { NextRequest, NextResponse } from 'next/server';
import { db, horizonItems, wavePlans, eq, and, isNull, inArray, desc } from '@/lib/db';

/**
 * Sweep finished and abandoned work off the board.
 *
 * Columns accumulate. Nothing ages out, nothing can be dismissed, and a run
 * that stranded — AVA-10 has read "Executing" since its completion callback was
 * pointed at the wrong port — sits there forever looking like live work. Past a
 * few of those the board stops being scannable, which is the only thing it is
 * for.
 *
 * Sweeping is deliberate rather than automatic. A board that quietly removes
 * work is worse than a cluttered one: the whole value is that what is on it is
 * what is real. So this reports what it *would* archive, and archives only when
 * asked.
 */

/** A run untouched for this long is not coming back on its own. */
const STALE_MS = 6 * 60 * 60_000;

interface Sweepable {
  id: string;
  title: string;
  linearTicketId: string | null;
  reason: 'finished' | 'stranded';
}

async function findSweepable(): Promise<Sweepable[]> {
  const items = await db.query.horizonItems.findMany({
    where: isNull(horizonItems.archivedAt),
  });
  if (items.length === 0) return [];

  const plans = await db.query.wavePlans.findMany({
    where: inArray(
      wavePlans.horizonItemId,
      items.map((i) => i.id)
    ),
    orderBy: desc(wavePlans.createdAt),
  });

  // Latest plan per item; an item that was re-planned should be judged on the
  // plan it is actually running.
  const latest = new Map<string, (typeof plans)[number]>();
  for (const p of plans) if (!latest.has(p.horizonItemId)) latest.set(p.horizonItemId, p);

  const cutoff = Date.now() - STALE_MS;
  const out: Sweepable[] = [];

  for (const item of items) {
    const plan = latest.get(item.id);
    if (!plan) continue;

    const touched = (plan.updatedAt ?? plan.createdAt)?.getTime?.() ?? 0;

    if (plan.status === 'completed') {
      out.push({
        id: item.id,
        title: item.title,
        linearTicketId: item.linearTicketId,
        reason: 'finished',
      });
    } else if (plan.status === 'executing' && touched < cutoff) {
      // Executing, and nothing has moved for hours. Either the fleet died or
      // the callbacks never landed; both leave a card that lies about being
      // live work.
      out.push({
        id: item.id,
        title: item.title,
        linearTicketId: item.linearTicketId,
        reason: 'stranded',
      });
    }
  }

  return out;
}

/** GET — what a sweep would remove, so it can be shown before it is done. */
export async function GET() {
  try {
    return NextResponse.json({ sweepable: await findSweepable() });
  } catch (error) {
    console.error('Sweep preview failed:', error);
    return NextResponse.json({ error: 'Failed to inspect the board' }, { status: 500 });
  }
}

/**
 * POST — archive them.
 *
 * `itemIds` archives exactly those; omitting it archives everything the preview
 * listed. Archiving sets a timestamp and nothing else: the item keeps its zone,
 * its plan and its history, so this is reversible and loses nothing.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request
      .json()
      .catch(() => ({}) as { itemIds?: string[] });

    const ids =
      Array.isArray(body.itemIds) && body.itemIds.length > 0
        ? body.itemIds
        : (await findSweepable()).map((s) => s.id);

    if (ids.length === 0) {
      return NextResponse.json({ archived: 0 });
    }

    await db
      .update(horizonItems)
      .set({ archivedAt: new Date() })
      .where(and(inArray(horizonItems.id, ids), isNull(horizonItems.archivedAt)));

    return NextResponse.json({ archived: ids.length, itemIds: ids });
  } catch (error) {
    console.error('Sweep failed:', error);
    return NextResponse.json({ error: 'Failed to sweep the board' }, { status: 500 });
  }
}

/** DELETE — un-archive, because a sweep should never be a one-way door. */
export async function DELETE(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as { itemIds?: string[] };
    if (!Array.isArray(body.itemIds) || body.itemIds.length === 0) {
      return NextResponse.json({ error: 'itemIds is required' }, { status: 400 });
    }

    await db
      .update(horizonItems)
      .set({ archivedAt: null })
      .where(inArray(horizonItems.id, body.itemIds));

    return NextResponse.json({ restored: body.itemIds.length });
  } catch (error) {
    console.error('Restore failed:', error);
    return NextResponse.json({ error: 'Failed to restore items' }, { status: 500 });
  }
}
