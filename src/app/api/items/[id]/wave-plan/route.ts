import { NextRequest, NextResponse } from 'next/server';
import { db, rufloSessions, horizonItems, wavePlans, eq, desc, inArray } from '@/lib/db';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/items/[id]/wave-plan - Get the current wave plan for a horizon item
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    // Verify the horizon item exists
    const item = await db.query.horizonItems.findFirst({
      where: eq(horizonItems.id, id),
    });

    if (!item) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 });
    }

    // Fetch the most recent wave plan with all relations
    const wavePlan = await db.query.wavePlans.findFirst({
      where: eq(wavePlans.horizonItemId, id),
      orderBy: [desc(wavePlans.version)],
      with: {
        waves: {
          with: {
            tasks: true,
          },
        },
        waveTasks: true,
        dependencyEdges: true,
        metrics: true,
        plan: true,
        horizonItem: true,
        previousWavePlan: true,
      },
    });

    if (!wavePlan) {
      return NextResponse.json(
        { error: 'No wave plan exists for this item' },
        { status: 404 }
      );
    }

    /**
     * Attach the agent working each task, so the graph can show what is
     * happening rather than what was planned.
     *
     * `wave_tasks.assigned_session_id` is the join dispatch already writes; the
     * telemetry hanging off that session is what makes a node pulse, name the
     * file it is editing, and admit when it has gone quiet. Without this the
     * DAG is a picture of a plan — accurate, and silent about the fleet.
     *
     * Sessions are fetched in one query rather than per task: a wide wave is 20
     * nodes, and 20 round trips to render one screen is how a live view becomes
     * the reason the page is slow.
     */
    type LiveTask = { taskCode: string; assignedSessionId: string | null };
    const tasks = wavePlan.waveTasks as LiveTask[];

    const sessionIds = tasks
      .map((t) => t.assignedSessionId)
      .filter((id): id is string => Boolean(id));

    const sessions = sessionIds.length
      ? await db.query.rufloSessions.findMany({
          where: inArray(rufloSessions.id, sessionIds),
        })
      : [];

    const byId = new Map(sessions.map((s) => [s.id, s]));

    const live = Object.fromEntries(
      tasks
        .filter((t) => t.assignedSessionId && byId.has(t.assignedSessionId))
        .map((t) => {
          const session = byId.get(t.assignedSessionId!)!;
          return [
            t.taskCode,
            {
              sessionStatus: session.status,
              progressPercent: session.progressPercent,
              telemetry: session.telemetry ?? null,
            },
          ];
        })
    );

    return NextResponse.json({ ...wavePlan, live });
  } catch (error) {
    console.error('Failed to fetch wave plan:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch wave plan',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
