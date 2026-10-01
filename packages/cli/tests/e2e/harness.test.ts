import { describe, it, expect, afterEach } from 'vitest';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import {
  HARNESS_VERSION,
  PROFILES,
  TECHNIQUES,
  resolveHarness,
} from '../../src/commands/session-runner/harness';

/**
 * The harness is how DevPilot configures the agents it launches, and its
 * first rule is that nothing changes until it has been measured. So the
 * tests that matter most are that the default adds nothing, and that every
 * configuration has a name that can be compared against another.
 */

const cleanup: string[] = [];
afterEach(() => {
  for (const dir of cleanup.splice(0)) rmSync(dir, { recursive: true, force: true });
  delete process.env.DEVPILOT_HARNESS_MAX_BUDGET_USD;
});

function build(spec: string | undefined, hasMcpConfig = false) {
  const harness = resolveHarness(spec);
  const built = harness.build({ hasMcpConfig });
  if (built.cleanupDir) cleanup.push(built.cleanupDir);
  return { harness, ...built };
}

describe('the default changes nothing', () => {
  it('is baseline when nothing is asked for', () => {
    for (const spec of [undefined, '', '  ', 'baseline']) {
      const { harness, args, cleanupDir } = build(spec);
      expect(harness.stamp).toBe(`baseline@${HARNESS_VERSION}`);
      // Exactly what the runner did before the harness existed.
      expect(args).toEqual([]);
      expect(cleanupDir).toBeUndefined();
    }
  });
});

describe('every configuration has a name', () => {
  it('stamps a profile', () => {
    expect(resolveHarness('lean').stamp).toBe(`lean@${HARNESS_VERSION}`);
  });

  it('stamps a profile plus what was added to it, in a stable order', () => {
    const a = resolveHarness('baseline+compact-200k+budget-cap').stamp;
    const b = resolveHarness('baseline+budget-cap+compact-200k').stamp;
    expect(a).toBe(`baseline+budget-cap+compact-200k@${HARNESS_VERSION}`);
    expect(b).toBe(a);
  });

  it('does not name a technique twice when the profile already includes it', () => {
    expect(resolveHarness('lean+strict-mcp').stamp).toBe(`lean@${HARNESS_VERSION}`);
  });

  /**
   * A typo that fell back to baseline would produce an A/B in which both arms
   * were the same thing, and a result that said the technique did nothing.
   */
  it('refuses an unknown profile or technique rather than falling back', () => {
    expect(() => resolveHarness('leen')).toThrow(/Unknown harness profile "leen"/);
    expect(() => resolveHarness('baseline+compact-200')).toThrow(/Unknown harness technique/);
  });
});

describe('techniques', () => {
  it('each says what it is expected to move and what would show it backfired', () => {
    for (const t of TECHNIQUES) {
      expect(t.summary.length, t.id).toBeGreaterThan(20);
      expect(t.watch.length, t.id).toBeGreaterThan(20);
      expect(['fixed-overhead', 'context-size', 'cache-writes', 'tail-cost']).toContain(t.bucket);
    }
  });

  it('every profile is made only of techniques that exist', () => {
    const ids = new Set(TECHNIQUES.map((t) => t.id));
    for (const [name, members] of Object.entries(PROFILES)) {
      for (const id of members) expect(ids.has(id), `${name} → ${id}`).toBe(true);
    }
  });

  it('strict-mcp gives the agent an empty server list, in a private file', () => {
    const { args, cleanupDir } = build('baseline+strict-mcp');
    expect(args[0]).toBe('--mcp-config');
    expect(args[2]).toBe('--strict-mcp-config');
    expect(JSON.parse(readFileSync(args[1], 'utf8'))).toEqual({ mcpServers: {} });
    expect(cleanupDir && existsSync(cleanupDir)).toBe(true);
  });

  /**
   * A shared-session run already passes its own config with
   * --strict-mcp-config. A second, empty one on top would be at best
   * redundant and at worst take the session tools away.
   */
  it('strict-mcp stands down when the run supplies its own MCP config', () => {
    const { args } = build('baseline+strict-mcp', true);
    expect(args).toEqual([]);
  });

  it('lean removes what a scoped worker does not use, and leaves compaction alone', () => {
    const { args } = build('lean');
    expect(args).toContain('--strict-mcp-config');
    expect(args).toContain('--disable-slash-commands');
    expect(args).toContain('--exclude-dynamic-system-prompt-sections');
    // The one technique with a real way to hurt is measured on its own.
    expect(args).not.toContain('--autocompact');
  });

  it('compact-200k sets the window explicitly', () => {
    expect(build('baseline+compact-200k').args).toEqual(['--autocompact', '200000']);
  });

  /**
   * No default cap: a number chosen here would be a guess about someone
   * else's work.
   */
  it('budget-cap does nothing until the operator names a figure', () => {
    expect(build('baseline+budget-cap').args).toEqual([]);

    process.env.DEVPILOT_HARNESS_MAX_BUDGET_USD = '12.5';
    expect(build('baseline+budget-cap').args).toEqual(['--max-budget-usd', '12.5']);

    process.env.DEVPILOT_HARNESS_MAX_BUDGET_USD = 'lots';
    expect(build('baseline+budget-cap').args).toEqual([]);
  });

  /**
   * Checked against the installed CLI rather than assumed: `--max-turns` does
   * not exist in current Claude Code, and `--bare` requires API-key auth and
   * would lock out anyone on a subscription.
   */
  it('uses no flag that would break a run or lock out subscription users', () => {
    const all = resolveHarness(`baseline+${TECHNIQUES.map((t) => t.id).join('+')}`);
    process.env.DEVPILOT_HARNESS_MAX_BUDGET_USD = '5';
    const built = all.build({ hasMcpConfig: false });
    if (built.cleanupDir) cleanup.push(built.cleanupDir);
    expect(built.args).not.toContain('--max-turns');
    expect(built.args).not.toContain('--bare');
  });
});
