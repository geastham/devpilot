import { describe, it, expect } from 'vitest';
import { resolveLocalMode } from '../../src/commands/bridge/connect';
import { createWatchOnlyDispatchHandler } from '../../src/commands/bridge/dispatch-handler';

/**
 * What a bridge does with dispatched work, decided from what it was given.
 *
 * The command the dashboard hands a new user is
 * `devpilot bridge connect --url … --token …`. It used to stop at
 * "--mode http requires --http-url": the default mode was `http`, and a
 * person who only wanted to see their sessions was told about a daemon they
 * had never heard of. Found by running that exact command from a clean
 * install. The first assertion here is that it now does what it says.
 */

describe('which mode a bridge runs in', () => {
  it('watches, when given nothing but where to connect', () => {
    expect(resolveLocalMode({})).toEqual({ kind: 'watch-only' });
  });

  it('routes to the cockpit with --plan, whatever else is or is not set', () => {
    expect(resolveLocalMode({ plan: true })).toEqual({ kind: 'conductor' });
    expect(resolveLocalMode({ plan: true, mode: 'http' })).toEqual({ kind: 'conductor' });
  });

  it('takes the mode from the URL it was given', () => {
    expect(resolveLocalMode({ httpUrl: 'http://127.0.0.1:3001' })).toEqual({ kind: 'orchestrator', mode: 'http' });
    expect(resolveLocalMode({ sessionApiUrl: 'http://127.0.0.1:3900' })).toEqual({
      kind: 'orchestrator',
      mode: 'claude-session',
    });
  });

  /**
   * Someone who typed `--mode http` meant to run work. Watching instead would
   * turn a missing flag into a machine that quietly never picks anything up.
   */
  it('still refuses a mode named without what it needs', () => {
    const http = resolveLocalMode({ mode: 'http' });
    expect(http.kind).toBe('error');
    expect(http.kind === 'error' && http.message).toContain('--http-url');

    const session = resolveLocalMode({ mode: 'claude-session' });
    expect(session.kind === 'error' && session.message).toContain('--session-api-url');

    expect(resolveLocalMode({ mode: 'ao-cli' }).kind).toBe('error');
    expect(resolveLocalMode({ mode: 'nonsense' }).kind).toBe('error');
  });
});

describe('a ticket routed to a machine that is only watching', () => {
  const message = {
    sessionId: 'sess_1',
    linearIdentifier: 'ENG-7',
    title: 'Fix the thing',
    repo: 'acme/widget',
  } as never;

  it('is declined in words, to the bridge, and the claim is released', async () => {
    const reported: { id: string; body: { status: string; message?: string } }[] = [];
    const handler = createWatchOnlyDispatchHandler({
      client: {
        reportSessionStatus: async (id: string, body: { status: string; message?: string }) => {
          reported.push({ id, body });
        },
      } as never,
      machineName: 'lena-laptop',
    });

    // A throw is what makes the dispatch loop release the claim.
    await expect(handler(message)).rejects.toThrow(/watch sessions only/);

    expect(reported).toHaveLength(1);
    expect(reported[0].id).toBe('sess_1');
    expect(reported[0].body.status).toBe('error');
    // It names the machine, the repository, and what to do about it.
    expect(reported[0].body.message).toContain('lena-laptop');
    expect(reported[0].body.message).toContain('--plan --repos acme/widget');
  });

  it('releases the claim even when the bridge cannot be told', async () => {
    const handler = createWatchOnlyDispatchHandler({
      client: {
        reportSessionStatus: async () => {
          throw new Error('offline');
        },
      } as never,
      machineName: 'lena-laptop',
    });
    await expect(handler(message)).rejects.toThrow(/watch sessions only/);
  });
});
