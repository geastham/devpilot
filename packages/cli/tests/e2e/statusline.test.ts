import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  attributeWindow,
  loadWindowReadings,
  recordStatus,
  renderStatusLine,
  windowFieldsFor,
  type StatusInput,
  type WindowReading,
} from '../../src/utils/statusline-store';
import { installStatusLine, uninstallStatusLine } from '../../src/commands/statusline';
import { cacheMissCost } from '../../src/utils/usage-meter';

/**
 * The status line: what it prints, what it writes down, and how it is put into
 * and taken out of Claude Code's settings.
 *
 * The payload below has the SHAPE of ones captured from Claude Code 2.1.286 —
 * including two things the documentation's example does not show: a window
 * entry that is simply absent just after it resets, and fields in
 * `prompt_cache` beyond the documented ones. Ids and paths are made up.
 */

const SESSION = '3f6c1f0e-9a1b-4c2d-8e7f-000000000001';
const OTHER = '3f6c1f0e-9a1b-4c2d-8e7f-000000000002';
const NOW = Date.UTC(2026, 9, 1, 15, 0, 0);
const RESET_5H = Math.floor(NOW / 1000) + 3 * 3600 + 1800; // 3h30m from now
const RESET_7D = Math.floor(NOW / 1000) + 4 * 86400;

function payload(overrides: Partial<StatusInput> = {}): StatusInput {
  return {
    session_id: SESSION,
    transcript_path: `/Users/someone/.claude/projects/-work-app/${SESSION}.jsonl`,
    version: '2.1.286',
    model: { id: 'claude-opus-5-5', display_name: 'Opus 5.5' },
    cost: { total_cost_usd: 2.184 },
    context_window: { used_percentage: 41, context_window_size: 200000 },
    rate_limits: {
      five_hour: { used_percentage: 37, resets_at: RESET_5H },
      seven_day: { used_percentage: 12, resets_at: RESET_7D },
    },
    prompt_cache: {
      warm: true,
      ttl: '1h',
      expires_at: Math.floor(NOW / 1000) + 3000,
      misses: 0,
      hit_ratio: 0.91,
      miss_recache_tokens: 0,
      miss_causes: {},
    },
    ...overrides,
  };
}

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'dp-statusline-'));
});

describe('the line', () => {
  it('shows model, context, cache, cost and both windows, in that order', () => {
    expect(renderStatusLine(payload(), { now: NOW })).toBe(
      'Opus 5.5 · ctx 41% · cache warm · ~$2.18 · 5h 37% (resets 3h30m) · 7d 12%'
    );
  });

  /**
   * An API-key user has no windows, and a session that has not answered yet has
   * no cache statistics. Printing `0%` for either would be a statement about
   * something nobody measured.
   */
  it('prints only the segments it has data for', () => {
    expect(
      renderStatusLine(
        { model: { display_name: 'Haiku 4.5' }, cost: { total_cost_usd: 0 }, context_window: { used_percentage: null } },
        { now: NOW }
      )
    ).toBe('Haiku 4.5');
    expect(renderStatusLine({}, { now: NOW })).toBe('');
  });

  it('keeps the seven-day window when the five-hour one has just reset and is absent', () => {
    const line = renderStatusLine(payload({ rate_limits: { seven_day: { used_percentage: 46, resets_at: RESET_7D } } }), { now: NOW });
    expect(line).toContain('7d 46%');
    expect(line).not.toContain('5h');
  });

  it('says so when the cache is cold or has missed', () => {
    const line = renderStatusLine(
      payload({ prompt_cache: { warm: false, misses: 3, miss_causes: { ttl_expired_5m: 3 } } }),
      { now: NOW }
    );
    expect(line).toContain('cache cold · 3 misses');
  });
});

describe('the record', () => {
  it('writes the session state and one log line, and not a second for an unchanged reading', () => {
    recordStatus(payload(), dir, NOW);
    recordStatus(payload(), dir, NOW + 1_000);
    recordStatus(payload(), dir, NOW + 2_000);

    expect(loadWindowReadings(dir, 0)).toHaveLength(1);
    const state = JSON.parse(readFileSync(join(dir, 'sessions', `${SESSION}.json`), 'utf8'));
    expect(state).toMatchObject({ model: 'claude-opus-5-5', costUsd: 2.184, contextPeakPct: 41, cacheMisses: 0 });

    // Cost moved: that is a new reading.
    recordStatus(payload({ cost: { total_cost_usd: 2.5 } }), dir, NOW + 3_000);
    expect(loadWindowReadings(dir, 0)).toHaveLength(2);
  });

  it('keeps the peak of the context window, not the latest', () => {
    recordStatus(payload({ context_window: { used_percentage: 71 } }), dir, NOW);
    recordStatus(payload({ context_window: { used_percentage: 12 } }), dir, NOW + 1_000); // after a compact
    expect(windowFieldsFor(dir, SESSION, NOW + 2_000).contextPeakPct).toBe(71);
  });

  it('keeps the last five-hour reading when a payload omits it', () => {
    recordStatus(payload(), dir, NOW);
    recordStatus(payload({ rate_limits: { seven_day: { used_percentage: 13, resets_at: RESET_7D } } }), dir, NOW + 1_000);
    const fields = windowFieldsFor(dir, SESSION, NOW + 2_000);
    expect(fields.windowUsed5h).toBe(37);
    expect(fields.windowUsed7d).toBe(13);
    expect(fields.windowResets5h).toBe(new Date(RESET_5H * 1000).toISOString());
  });

  it('carries cache misses by cause, and drops anything that is not a cause name', () => {
    recordStatus(
      payload({
        prompt_cache: {
          warm: true,
          ttl: '5m',
          misses: 4,
          miss_recache_tokens: 120_000,
          miss_causes: { ttl_expired_5m: 3, tools_changed: 1, 'not a cause; rm -rf': 9 } as Record<string, number>,
        },
      }),
      dir,
      NOW
    );
    const fields = windowFieldsFor(dir, SESSION, NOW);
    expect(fields.cacheMisses).toBe(4);
    expect(fields.cacheMissCauses).toEqual({ ttl_expired_5m: 3, tools_changed: 1 });
    expect(fields.cacheRecacheTokens).toBe(120_000);
  });

  it('refuses a session id that is not one, rather than use it as a file name', () => {
    expect(recordStatus(payload({ session_id: '../../etc/passwd' }), dir, NOW)).toBeNull();
    expect(recordStatus(payload({ session_id: undefined }), dir, NOW)).toBeNull();
    expect(existsSync(join(dir, 'sessions'))).toBe(false);
  });

  it('sends nothing for a session the status line never saw', () => {
    expect(windowFieldsFor(dir, OTHER, NOW)).toEqual({});
  });

  it('never throws on input that is not what it expects', () => {
    for (const bad of [null, 42, 'x', [], { session_id: SESSION, rate_limits: 'no', prompt_cache: 7, cost: [] }]) {
      expect(() => recordStatus(bad as never, dir, NOW)).not.toThrow();
      expect(() => renderStatusLine((bad ?? {}) as never, { now: NOW })).not.toThrow();
    }
  });
});

describe('sharing out how far the window moved', () => {
  const five = (used: number, resetsAt = RESET_5H) => ({ five: { used, resetsAt } });
  const r = (t: number, s: string, c: number, w: object): WindowReading => ({ t: NOW + t * 1000, s, c, ...w });

  /**
   * The percentage is the ACCOUNT's. Two agents running side by side each see
   * it go from 20 to 30, and subtracting per session would report ten points
   * twice.
   */
  it('does not count the same movement once per session', () => {
    const shares = attributeWindow([
      r(0, SESSION, 1.0, five(20)),
      r(1, OTHER, 0.5, five(20)),
      r(60, SESSION, 4.0, five(26)),
      r(61, OTHER, 1.5, five(30)),
    ]);
    // The window moved 10 points. Costs rose by $3 and $1: shares 7.5 and 2.5.
    expect(shares.get(SESSION)!.fiveHour).toBeCloseTo(7.5, 9);
    expect(shares.get(OTHER)!.fiveHour).toBeCloseTo(2.5, 9);
    expect(shares.get(SESSION)!.fiveHour! + shares.get(OTHER)!.fiveHour!).toBeCloseTo(10, 9);
  });

  it('gives a lone session the whole movement', () => {
    const shares = attributeWindow([r(0, SESSION, 1, five(10)), r(60, SESSION, 2, five(13)), r(120, SESSION, 3, five(18))]);
    expect(shares.get(SESSION)!.fiveHour).toBeCloseTo(8, 9);
  });

  it('adds up across reset windows without subtracting across the reset', () => {
    const next = RESET_5H + 5 * 3600;
    const shares = attributeWindow([
      r(0, SESSION, 1, five(90)),
      r(60, SESSION, 2, five(96)),
      // The window reset: it reads low again. That is not a negative movement.
      r(7200, SESSION, 3, five(2, next)),
      r(7260, SESSION, 4, five(5, next)),
    ]);
    expect(shares.get(SESSION)!.fiveHour).toBeCloseTo(6 + 3, 9);
  });

  it('gives nothing to a session whose cost did not rise while the window moved', () => {
    const shares = attributeWindow([r(0, SESSION, 1, five(10)), r(60, OTHER, 0.2, five(10)), r(120, OTHER, 2.2, five(16)), r(121, SESSION, 1, five(16))]);
    expect(shares.get(SESSION)!.fiveHour).toBe(0);
    expect(shares.get(OTHER)!.fiveHour).toBeCloseTo(6, 9);
  });

  it('attributes movement to nobody when no metered session spent anything', () => {
    // Another device used the account. Both idle sessions saw it; neither did it.
    const shares = attributeWindow([r(0, SESSION, 1, five(10)), r(60, SESSION, 1, five(25))]);
    expect(shares.get(SESSION)!.fiveHour).toBe(0);
  });

  it('leaves a window a session never had a reading in as not measured', () => {
    const shares = attributeWindow([r(0, SESSION, 1, five(10)), r(60, SESSION, 2, five(12))]);
    expect(shares.get(SESSION)!.sevenDay).toBeNull();
    expect(attributeWindow([]).size).toBe(0);
  });

  it('does not depend on the order readings were written in', () => {
    const readings = [r(0, SESSION, 1, five(20)), r(1, OTHER, 0.5, five(20)), r(60, SESSION, 4, five(26)), r(61, OTHER, 1.5, five(30))];
    expect(attributeWindow([...readings].reverse())).toEqual(attributeWindow(readings));
  });

  it('reaches the reading that is sent, through the files on disk', () => {
    recordStatus(payload({ cost: { total_cost_usd: 1 }, rate_limits: { five_hour: { used_percentage: 20, resets_at: RESET_5H } } }), dir, NOW);
    recordStatus(payload({ session_id: OTHER, cost: { total_cost_usd: 0.5 }, rate_limits: { five_hour: { used_percentage: 20, resets_at: RESET_5H } } }), dir, NOW + 1_000);
    recordStatus(payload({ cost: { total_cost_usd: 4 }, rate_limits: { five_hour: { used_percentage: 26, resets_at: RESET_5H } } }), dir, NOW + 60_000);
    recordStatus(payload({ session_id: OTHER, cost: { total_cost_usd: 1.5 }, rate_limits: { five_hour: { used_percentage: 30, resets_at: RESET_5H } } }), dir, NOW + 61_000);

    expect(windowFieldsFor(dir, SESSION, NOW + 62_000).windowDelta5h).toBe(7.5);
    expect(windowFieldsFor(dir, OTHER, NOW + 62_000).windowDelta5h).toBe(2.5);
    // Day logs are named by date and found again.
    expect(readdirSync(dir).filter((f) => f.startsWith('window-'))).toHaveLength(1);
  });
});

describe('what a cache miss cost', () => {
  it('is the write rate less the read rate, for the lifetime in use', () => {
    // Opus 5.5: input $4, one-hour write $8, five-minute write $5, read $0.20.
    expect(cacheMissCost(1_000_000, 'claude-opus-5-5', '1h')).toBeCloseTo(8 - 0.2, 9);
    expect(cacheMissCost(1_000_000, 'claude-opus-5-5', '5m')).toBeCloseTo(5 - 0.2, 9);
    expect(cacheMissCost(0, 'claude-opus-5-5', '1h')).toBe(0);
  });
});

describe('installing into Claude Code’s settings', () => {
  const command = '/usr/local/bin/node /opt/devpilot/bin/devpilot.js statusline';
  let settingsPath: string;
  let storeDir: string;
  beforeEach(() => {
    mkdirSync(join(dir, '.claude'), { recursive: true });
    settingsPath = join(dir, '.claude', 'settings.json');
    storeDir = join(dir, 'store');
  });
  const read = () => JSON.parse(readFileSync(settingsPath, 'utf8'));

  it('adds the status line and leaves every other setting alone', () => {
    writeFileSync(settingsPath, JSON.stringify({ model: 'opus', permissions: { allow: ['Bash(ls:*)'] } }));
    expect(installStatusLine({ settingsPath, storeDir, command })).toEqual({ status: 'installed', wrapped: false, previousCommand: undefined });
    expect(read()).toEqual({
      model: 'opus',
      permissions: { allow: ['Bash(ls:*)'] },
      statusLine: { type: 'command', command },
    });
  });

  it('creates the settings file when there is none', () => {
    expect(installStatusLine({ settingsPath, storeDir, command }).status).toBe('installed');
    expect(read().statusLine.command).toBe(command);
  });

  /**
   * Claude Code has one status line slot. A person who already has one must
   * not lose it, and must get it back exactly.
   */
  it('wraps a status line that is already there, and uninstall restores it exactly', () => {
    const theirs = { type: 'command', command: '~/.claude/my-line.sh', padding: 2, refreshInterval: 5 };
    const before = { theme: 'dark', statusLine: theirs };
    writeFileSync(settingsPath, JSON.stringify(before));

    expect(installStatusLine({ settingsPath, storeDir, command })).toEqual({
      status: 'installed',
      wrapped: true,
      previousCommand: '~/.claude/my-line.sh',
    });
    // Their row settings are kept; only the command changes, and it wraps.
    expect(read().statusLine).toEqual({ type: 'command', command: `${command} --wrap`, padding: 2, refreshInterval: 5 });

    expect(uninstallStatusLine({ settingsPath, storeDir })).toEqual({ status: 'restored', previousCommand: '~/.claude/my-line.sh' });
    expect(read()).toEqual(before);
  });

  it('changes nothing on a second install', () => {
    installStatusLine({ settingsPath, storeDir, command });
    const after = readFileSync(settingsPath, 'utf8');
    expect(installStatusLine({ settingsPath, storeDir, command })).toEqual({ status: 'already' });
    expect(readFileSync(settingsPath, 'utf8')).toBe(after);
  });

  it('removes the key again when there was nothing before', () => {
    writeFileSync(settingsPath, JSON.stringify({ model: 'opus' }));
    installStatusLine({ settingsPath, storeDir, command });
    expect(uninstallStatusLine({ settingsPath, storeDir })).toEqual({ status: 'removed' });
    expect(read()).toEqual({ model: 'opus' });
  });

  it('leaves alone a status line someone has since made their own', () => {
    installStatusLine({ settingsPath, storeDir, command });
    writeFileSync(settingsPath, JSON.stringify({ statusLine: { type: 'command', command: 'my-own-thing' } }));
    expect(uninstallStatusLine({ settingsPath, storeDir })).toEqual({ status: 'not-ours' });
    expect(read().statusLine.command).toBe('my-own-thing');
  });

  it('refuses to rewrite a settings file it cannot parse', () => {
    writeFileSync(settingsPath, '{ "model": "opus", // a comment\n }');
    const outcome = installStatusLine({ settingsPath, storeDir, command });
    expect(outcome.status).toBe('unreadable');
    expect(readFileSync(settingsPath, 'utf8')).toBe('{ "model": "opus", // a comment\n }');
  });
});
