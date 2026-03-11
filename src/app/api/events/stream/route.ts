import { NextRequest } from 'next/server';
import { db, activityEvents, rufloSessions, gt, eq, asc } from '@/lib/db';

// GET /api/events/stream - Server-Sent Events stream for real-time updates
export async function GET(request: NextRequest) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      // Send initial connection message
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify({ type: 'connected', timestamp: new Date().toISOString() })}\n\n`)
      );

      let lastEventId: string | null = null;
      let isActive = true;

      // Poll for new events every 2 seconds
      const pollInterval = setInterval(async () => {
        if (!isActive) {
          clearInterval(pollInterval);
          return;
        }

        try {
          // Get new events since last check
          const events = await db.query.activityEvents.findMany({
            where: lastEventId
              ? gt(activityEvents.id, lastEventId)
              : gt(activityEvents.createdAt, new Date(Date.now() - 5000)), // Last 5 seconds on initial
            orderBy: asc(activityEvents.createdAt),
            limit: 20,
          });

          if (events.length > 0) {
            lastEventId = events[events.length - 1].id;

            for (const event of events) {
              const sseData = {
                id: event.id,
                type: event.type,
                message: event.message,
                repo: event.repo,
                ticketId: event.ticketId,
                metadata: event.metadata,
                createdAt: event.createdAt,
              };
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify(sseData)}\n\n`)
              );
            }
          }

          // Get updated fleet state
          const sessions = await db.query.rufloSessions.findMany({
            where: eq(rufloSessions.status, 'ACTIVE'),
          });

          // Send fleet heartbeat every poll
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: 'fleet_heartbeat',
                sessions: sessions.map((s) => ({
                  id: s.id,
                  progress: s.progressPercent,
                  status: s.status,
                  eta: s.estimatedRemainingMinutes,
                })),
                timestamp: new Date().toISOString(),
              })}\n\n`
            )
          );
        } catch (error) {
          console.error('SSE poll error:', error);
          // Send error event but keep stream alive
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: 'error', message: 'Poll failed' })}\n\n`
            )
          );
        }
      }, 2000);

      // Handle client disconnect
      request.signal.addEventListener('abort', () => {
        isActive = false;
        clearInterval(pollInterval);
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
