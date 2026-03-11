import { NextRequest, NextResponse } from 'next/server';
import { db, horizonItems, activityEvents, eq, and, desc } from '@/lib/db';
import type { Zone, Complexity } from '@/lib/db';

// GET /api/items - List all horizon items
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const zone = searchParams.get('zone') as Zone | null;
    const repo = searchParams.get('repo');

    // Build where conditions
    const conditions = [];
    if (zone) conditions.push(eq(horizonItems.zone, zone));
    if (repo) conditions.push(eq(horizonItems.repo, repo));

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

    return NextResponse.json(items);
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
