import { NextRequest, NextResponse } from 'next/server';
import { db, horizonItems, activityEvents, eq } from '@/lib/db';
import type { Zone, Complexity } from '@/lib/db';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/items/[id] - Get a single horizon item
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    const item = await db.query.horizonItems.findFirst({
      where: eq(horizonItems.id, id),
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
    });

    if (!item) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 });
    }

    return NextResponse.json(item);
  } catch (error) {
    console.error('Failed to fetch item:', error);
    return NextResponse.json(
      { error: 'Failed to fetch item' },
      { status: 500 }
    );
  }
}

// PATCH /api/items/[id] - Update a horizon item
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { title, zone, repo, complexity, priority, linearTicketId } = body;

    const existingItem = await db.query.horizonItems.findFirst({
      where: eq(horizonItems.id, id),
    });
    if (!existingItem) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 });
    }

    // Build update object with only defined values
    const updateData: Partial<typeof horizonItems.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (title !== undefined) updateData.title = title;
    if (zone !== undefined) updateData.zone = zone as Zone;
    if (repo !== undefined) updateData.repo = repo;
    if (complexity !== undefined) updateData.complexity = complexity as Complexity | undefined;
    if (priority !== undefined) updateData.priority = priority;
    if (linearTicketId !== undefined) updateData.linearTicketId = linearTicketId;

    await db.update(horizonItems)
      .set(updateData)
      .where(eq(horizonItems.id, id));

    // Fetch updated item with relations
    const item = await db.query.horizonItems.findFirst({
      where: eq(horizonItems.id, id),
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
    });

    // Create activity event for zone transitions
    if (zone && zone !== existingItem.zone && item) {
      await db.insert(activityEvents).values({
        type: 'RUNWAY_UPDATE',
        message: `"${item.title}" moved from ${existingItem.zone} to ${zone}`,
        repo: item.repo,
        ticketId: item.linearTicketId,
      });
    }

    return NextResponse.json(item);
  } catch (error) {
    console.error('Failed to update item:', error);
    return NextResponse.json(
      { error: 'Failed to update item' },
      { status: 500 }
    );
  }
}

// DELETE /api/items/[id] - Delete a horizon item
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    const existingItem = await db.query.horizonItems.findFirst({
      where: eq(horizonItems.id, id),
    });
    if (!existingItem) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 });
    }

    await db.delete(horizonItems).where(eq(horizonItems.id, id));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete item:', error);
    return NextResponse.json(
      { error: 'Failed to delete item' },
      { status: 500 }
    );
  }
}
