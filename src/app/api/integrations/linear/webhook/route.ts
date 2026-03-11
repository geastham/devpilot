import { NextResponse } from 'next/server';
import { linear } from '@devpilot/core';

export async function POST(request: Request) {
  try {
    const payload = await request.json() as linear.LinearWebhookPayload;

    // Verify webhook signature if configured
    const signature = request.headers.get('linear-signature');
    // TODO: Verify signature with webhook secret

    const result = await linear.handleLinearWebhook(payload);

    if (!result.handled) {
      return NextResponse.json(
        { message: 'Webhook type not handled', type: payload.type },
        { status: 200 }
      );
    }

    return NextResponse.json({
      success: true,
      action: result.action,
    });
  } catch (error) {
    console.error('Linear webhook error:', error);
    return NextResponse.json(
      { error: 'Webhook processing failed' },
      { status: 500 }
    );
  }
}

// Linear sends GET to verify webhook URL
export async function GET() {
  return NextResponse.json({ status: 'ok', service: 'devpilot-linear-webhook' });
}
