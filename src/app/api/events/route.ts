import { NextRequest, NextResponse } from 'next/server';
import { db, activityEvents, eq, and, gt, desc } from '@/lib/db';
import type { EventType } from '@/lib/db';

// GET /api/events - Get recent activity events
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const type = searchParams.get('type') as EventType | null;
    const repo = searchParams.get('repo');
    const after = searchParams.get('after'); // ISO timestamp for pagination

    // Build where conditions
    const conditions = [];
    if (type) conditions.push(eq(activityEvents.type, type));
    if (repo) conditions.push(eq(activityEvents.repo, repo));
    if (after) conditions.push(gt(activityEvents.createdAt, new Date(after)));

    const events = await db.query.activityEvents.findMany({
      where: conditions.length > 0 ? and(...conditions) : undefined,
      orderBy: desc(activityEvents.createdAt),
      limit: Math.min(limit, 100), // Cap at 100
    });

    return NextResponse.json({
      events,
      count: events.length,
      hasMore: events.length === limit,
    });
  } catch (error) {
    console.error('Failed to fetch events:', error);
    return NextResponse.json(
      { error: 'Failed to fetch events' },
      { status: 500 }
    );
  }
}

// POST /api/events - Create a new activity event (internal use)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { type, message, repo, ticketId, metadata } = body;

    if (!type || !message) {
      return NextResponse.json(
        { error: 'type and message are required' },
        { status: 400 }
      );
    }

    const [event] = await db.insert(activityEvents).values({
      type: type as EventType,
      message,
      repo,
      ticketId,
      metadata,
    }).returning();

    return NextResponse.json(event, { status: 201 });
  } catch (error) {
    console.error('Failed to create event:', error);
    return NextResponse.json(
      { error: 'Failed to create event' },
      { status: 500 }
    );
  }
}
