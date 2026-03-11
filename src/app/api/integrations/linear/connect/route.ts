import { NextResponse } from 'next/server';
import { linear } from '@devpilot/core';

// POST /api/integrations/linear/connect - Configure Linear integration
export async function POST(request: Request) {
  try {
    const { apiKey, teamId, defaultProjectId } = await request.json() as {
      apiKey: string;
      teamId: string;
      defaultProjectId?: string;
    };

    if (!apiKey || !teamId) {
      return NextResponse.json(
        { error: 'apiKey and teamId are required' },
        { status: 400 }
      );
    }

    // Initialize the Linear client
    const client = linear.initLinearClient({
      apiKey,
      teamId,
      defaultProjectId,
    });

    // Verify the connection by getting team info
    const team = await client.getTeam();

    return NextResponse.json({
      success: true,
      team: {
        id: team.id,
        name: team.name,
        key: team.key,
      },
      message: `Connected to Linear team: ${team.name}`,
    });
  } catch (error) {
    console.error('Linear connect error:', error);
    const message = error instanceof Error ? error.message : 'Connection failed';
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}

// GET /api/integrations/linear/connect - Check if Linear is configured
export async function GET() {
  const configured = linear.isLinearConfigured();

  if (!configured) {
    return NextResponse.json({
      configured: false,
      message: 'Linear integration not configured',
    });
  }

  try {
    const client = linear.getLinearClient();
    const team = await client.getTeam();

    return NextResponse.json({
      configured: true,
      team: {
        id: team.id,
        name: team.name,
        key: team.key,
      },
    });
  } catch (error) {
    return NextResponse.json({
      configured: false,
      error: 'Failed to fetch team info',
    });
  }
}

// DELETE /api/integrations/linear/connect - Disconnect Linear
export async function DELETE() {
  // Note: The singleton pattern in the client doesn't support disconnection
  // In a real implementation, we'd clear stored credentials
  return NextResponse.json({
    success: true,
    message: 'Linear integration disconnected (restart required to take effect)',
  });
}
