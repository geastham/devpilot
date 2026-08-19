import { NextResponse } from 'next/server';
import { linear } from '@devpilot.sh/core';

/**
 * Linear webhook receiver.
 *
 * This endpoint mutates state on behalf of an external caller, so it verifies
 * before it acts. It previously did neither of the two things it needed to:
 *
 *  - It read the `linear-signature` header and dropped it on the floor behind a
 *    `TODO`. `handleLinearWebhook` only verifies when it is *handed* a secret,
 *    signature and raw body, and the call site passed none of them — so the
 *    guard was structurally unreachable and the endpoint accepted forged
 *    payloads from anyone who knew the URL.
 *  - It never passed `botUserId`, which is the sole trigger for the
 *    `bot_assigned` branch — the mechanism the whole bridge exists for. The
 *    branch could not fire, and the resulting `dispatch` intent was discarded
 *    by the caller anyway.
 *
 * Both are fixed here. The endpoint now **fails closed**: with no configured
 * secret it refuses to process rather than silently trusting the caller.
 */

export const dynamic = 'force-dynamic';

function config() {
  return {
    webhookSecret: process.env.LINEAR_WEBHOOK_SECRET,
    botUserId: process.env.LINEAR_BOT_USER_ID,
  };
}

export async function POST(request: Request) {
  const { webhookSecret, botUserId } = config();

  // Refuse rather than accept-unverified. An unauthenticated endpoint that
  // creates work is worse than one that is switched off.
  if (!webhookSecret) {
    return NextResponse.json(
      {
        error: 'NOT_CONFIGURED',
        detail:
          'LINEAR_WEBHOOK_SECRET is not set. The webhook refuses unverified ' +
          'payloads, so it cannot process this request.',
      },
      { status: 503 }
    );
  }

  const signature = request.headers.get('linear-signature');
  if (!signature) {
    return NextResponse.json(
      { error: 'MISSING_SIGNATURE', detail: 'No linear-signature header.' },
      { status: 401 }
    );
  }

  // The raw body is what the HMAC is computed over — parse only after reading
  // it as text, never re-serialise. `JSON.stringify(JSON.parse(x))` is not
  // byte-identical to `x` and would fail every signature.
  const rawBody = await request.text();

  let payload: linear.LinearWebhookPayload;
  try {
    payload = JSON.parse(rawBody) as linear.LinearWebhookPayload;
  } catch {
    return NextResponse.json(
      { error: 'INVALID_JSON', detail: 'Body is not valid JSON.' },
      { status: 400 }
    );
  }

  try {
    const result = await linear.handleLinearWebhook(payload, {
      webhookSecret,
      signature,
      rawBody,
      botUserId,
    });

    if (!result.handled) {
      return NextResponse.json(
        { message: 'Webhook type not handled', type: payload.type },
        { status: 200 }
      );
    }

    return NextResponse.json({
      success: true,
      action: result.action,
      // Surfaced so the dispatch intent is observable rather than computed and
      // thrown away. Consuming it (creating the horizon item and starting a
      // conductor run) is the next step and is deliberately not silent here.
      dispatch: result.dispatch ?? null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';

    // A signature mismatch is a 401, not a 500 — it is the caller that is
    // wrong, and returning 500 would make Linear retry a payload that can
    // never succeed.
    if (message.includes('Invalid webhook signature')) {
      return NextResponse.json(
        { error: 'INVALID_SIGNATURE' },
        { status: 401 }
      );
    }

    console.error('Linear webhook error:', error);
    return NextResponse.json(
      { error: 'WEBHOOK_FAILED', detail: message },
      { status: 500 }
    );
  }
}

// Linear sends GET to verify webhook URL.
export async function GET() {
  const { webhookSecret, botUserId } = config();
  return NextResponse.json({
    status: 'ok',
    service: 'devpilot-linear-webhook',
    // Configuration state, never the values themselves.
    configured: { webhookSecret: Boolean(webhookSecret), botUserId: Boolean(botUserId) },
  });
}
