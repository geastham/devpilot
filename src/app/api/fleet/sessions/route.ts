import { NextRequest, NextResponse } from 'next/server';
import {
  db,
  rufloSessions,
  inFlightFiles,
  activityEvents,
  eq,
  and,
  desc,
  asc,
} from '@/lib/db';
import type { SessionStatus } from '@/lib/db';

// GET /api/fleet/sessions - List all fleet sessions
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get('status') as SessionStatus | null;
    const repo = searchParams.get('repo');

    // Build where conditions
    const conditions = [];
    if (status) conditions.push(eq(rufloSessions.status, status));
    if (repo) conditions.push(eq(rufloSessions.repo, repo));

    const sessions = await db.query.rufloSessions.findMany({
      where: conditions.length > 0 ? and(...conditions) : undefined,
      with: {
        completedTasks: true,
      },
      orderBy: [asc(rufloSessions.status), desc(rufloSessions.updatedAt)],
    });

    return NextResponse.json(sessions);
  } catch (error) {
    console.error('Failed to fetch sessions:', error);
    return NextResponse.json(
      { error: 'Failed to fetch sessions' },
      { status: 500 }
    );
  }
}

// POST /api/fleet/sessions - Create a new session (internal use)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      repo,
      linearTicketId,
      ticketTitle,
      currentWorkstream,
      estimatedRemainingMinutes,
      inFlightFiles: inFlightFilePaths = [],
    } = body;

    if (!repo || !linearTicketId || !ticketTitle) {
      return NextResponse.json(
        { error: 'repo, linearTicketId, and ticketTitle are required' },
        { status: 400 }
      );
    }

    const [session] = await db.insert(rufloSessions).values({
      repo,
      linearTicketId,
      ticketTitle,
      currentWorkstream: currentWorkstream || 'Main',
      status: 'ACTIVE',
      progressPercent: 0,
      elapsedMinutes: 0,
      estimatedRemainingMinutes: estimatedRemainingMinutes || 30,
      inFlightFiles: inFlightFilePaths,
    }).returning();

    // Create in-flight file records
    for (const filePath of inFlightFilePaths) {
      await db.insert(inFlightFiles).values({
        path: filePath,
        activeSessionId: session.id,
        linearTicketId,
        estimatedMinutesRemaining: estimatedRemainingMinutes || 30,
      });
    }

    // Create activity event
    await db.insert(activityEvents).values({
      type: 'ITEM_DISPATCHED',
      message: `Session started: "${ticketTitle}"`,
      repo,
      ticketId: linearTicketId,
      metadata: { sessionId: session.id },
    });

    // Fetch session with relations
    const sessionWithRelations = await db.query.rufloSessions.findFirst({
      where: eq(rufloSessions.id, session.id),
      with: {
        completedTasks: true,
      },
    });

    return NextResponse.json(sessionWithRelations, { status: 201 });
  } catch (error) {
    console.error('Failed to create session:', error);
    return NextResponse.json(
      { error: 'Failed to create session' },
      { status: 500 }
    );
  }
}
