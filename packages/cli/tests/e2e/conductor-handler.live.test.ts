import { describe, it, expect } from 'vitest';
import { createConductorDispatchHandler } from '../../src/commands/bridge/conductor-handler';

/**
 * The join, against a REAL cockpit — opt-in.
 *
 * `conductor-handler.test.ts` pins the contract against a stub, which is the
 * right default: it is fast, free, and deterministic. It also cannot tell you
 * that the cockpit's actual endpoints match that contract, and this repository
 * has repeatedly shipped tests that agreed with themselves while the real path
 * was broken.
 *
 * This one talks to a running `devpilot serve`. It creates a real horizon item
 * and starts a real conductor run, which costs a model call and takes minutes —
 * so it only runs when DEVPILOT_LIVE_COCKPIT_URL is set, and it cleans up after
 * itself.
 *
 *   DEVPILOT_LIVE_COCKPIT_URL=http://localhost:3100 \
 *     pnpm --filter @devpilot.sh/cli exec vitest run tests/e2e/conductor-handler.live.test.ts
 */

const cockpitUrl = process.env.DEVPILOT_LIVE_COCKPIT_URL;
const suite = cockpitUrl ? describe : describe.skip;

const TICKET = 'ENG-LIVE-JOIN';
const REPO = 'neurograph/editor';

const reported: { status: string; message?: string }[] = [];
const client = {
  reportSessionStatus: async (_id: string, s: { status: string; message?: string }) => {
    reported.push(s);
  },
} as never;

const message = {
  sessionId: 'sesn_live_join',
  orgId: 'org_live',
  workspaceId: 'ws_live',
  linearIssueId: 'iss_live',
  linearIdentifier: TICKET,
  title: 'Add a keyboard shortcut for toggling the grid',
  description: 'Users want to hide the background grid without opening settings.',
  teamId: 'team_live',
  repo: REPO,
  targetOrchestratorId: 'orch_live',
  dispatchedAt: new Date().toISOString(),
} as never;

async function itemsFor(ticket: string) {
  const res = await fetch(`${cockpitUrl}/api/items?linearTicketId=${encodeURIComponent(ticket)}`);
  return (await res.json()) as { id: string }[];
}

suite('bridge → conductor, against a running cockpit', () => {
  it(
    'puts a Linear ticket on the board and drives it to a reviewable plan',
    async () => {
      // Start clean so a rerun is meaningful rather than exercising the
      // reuse path by accident.
      for (const stale of await itemsFor(TICKET)) {
        await fetch(`${cockpitUrl}/api/items/${stale.id}`, { method: 'DELETE' });
      }

      const handler = createConductorDispatchHandler({
        client,
        cockpitUrl: cockpitUrl!,
        requestTimeoutMs: 15 * 60_000,
      });

      await handler(message);

      // 1. The ticket is on the board, linked to Linear.
      const items = await itemsFor(TICKET);
      expect(items.length, 'the ticket should have produced exactly one item').toBe(1);

      // 2. The conductor actually ran and is parked at the review gate.
      const state = await (
        await fetch(`${cockpitUrl}/api/items/${items[0].id}/conductor`)
      ).json();
      expect(state.awaiting, 'the run should be waiting for a human').toBe('review');
      expect(state.review?.plan?.waves?.length ?? 0).toBeGreaterThan(0);

      // 3. The human-facing status made it back to the bridge.
      const last = reported[reported.length - 1];
      expect(last.status).toBe('running');
      expect(last.message).toMatch(/awaiting review/i);

      // 4. Redelivery reuses the item rather than starting a second paid run.
      const before = (await itemsFor(TICKET)).length;
      await handler(message);
      expect((await itemsFor(TICKET)).length, 'redelivery must not duplicate').toBe(before);
    },
    20 * 60_000
  );
});
