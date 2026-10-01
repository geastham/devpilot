import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * The fleet harness — how DevPilot configures the agents it launches.
 *
 * ## Why this exists
 *
 * A dispatched agent ran as a bare `claude -p`, inheriting whatever the
 * operator's machine happened to have: every MCP server they had ever added,
 * every skill, their output style, their hooks. Two machines in one fleet ran
 * different agents and neither configuration was written down anywhere. The
 * "token optimisation" on offer was two third-party tools installed into that
 * same user-level configuration, neither of which held up when measured
 * independently, and one of which a headless agent never activates.
 *
 * Measurement says where the tokens are: on a long session nearly all of them
 * are the session's own context, re-read from cache on every turn. So the
 * levers are the ones that change what is in the context and how many turns
 * read it — and those are settings of the agent, not add-ons to it.
 *
 * This module is those settings, as code DevPilot ships and versions.
 *
 * ## The rule: nothing is on by default until it has been measured
 *
 * A technique here is a hypothesis. Each one names the bucket it is expected to
 * move and the reading that would show it has made things worse, and each can
 * be switched on alone, so an A/B changes one thing at a time. The default
 * profile is `baseline`: exactly what the runner did before this file existed.
 *
 * Every session is stamped with the profile it ran under (`lean@1`,
 * `baseline+stable-prefix@1`), and that stamp travels with its readings. That
 * is what turns "we think this helps" into two rows on the Efficiency page.
 *
 * ## What is deliberately not here
 *
 * `--bare`, which would be the tidy way to stop inheriting user configuration,
 * requires API-key authentication and so locks out anyone running on a
 * subscription. `--max-turns` does not exist in current Claude Code. Both were
 * checked against the installed CLI rather than assumed.
 */

/** Which part of a session's spend a technique is expected to reduce. */
export type Bucket = 'fixed-overhead' | 'context-size' | 'cache-writes' | 'tail-cost';

export interface Technique {
  id: string;
  /** One line a person can read: what it changes. */
  summary: string;
  bucket: Bucket;
  /** The reading that says it backfired. Printed when the technique is chosen. */
  watch: string;
  /** Arguments it adds to the `claude` invocation. */
  args(ctx: HarnessContext): string[];
  /**
   * Whether the technique can take effect in THIS run. Absent means always.
   *
   * A technique that needs something the run does not have — an index for the
   * repository, a figure the operator has not named — does nothing. A run it
   * did nothing for must not carry its name: the stamp is what the readings
   * are grouped by, and a row labelled `+code-graph` that mixes runs which had
   * a graph with runs which did not would compare a thing with itself.
   */
  applies?(ctx: HarnessContext): boolean;
  /**
   * Tools the agent must be allowed to call for the technique to do anything.
   *
   * A headless agent cannot be asked for permission, so a tool it has not been
   * granted is simply refused. The first live run of `code-graph` showed what
   * that looks like: the agent called the graph tool three times, was refused
   * each time ("you haven't granted it yet"), and found the answer with grep —
   * under a stamp that said it had a code graph. Every stubbed test passed.
   *
   * Returned separately from `args` because `--allowedTools` takes a list and
   * the runner has names of its own to add; it must be written once.
   */
  allowedTools?(ctx: HarnessContext): string[];
}

export interface HarnessContext {
  /**
   * True when the run already supplies its own MCP config (a shared-session
   * link). The runner passes `--strict-mcp-config` itself in that case, and a
   * second, empty config must not be added on top of it.
   */
  hasMcpConfig: boolean;
  /**
   * The MCP server entry for this run's code graph, when the indexer is
   * installed and the directory the agent runs in has an index. Null or absent
   * otherwise.
   */
  codeGraph?: { command: string; args: string[]; env?: Record<string, string> } | null;
  /** Where to write files a technique needs. Deleted with the run. */
  scratchDir: () => string;
}

/**
 * Bumped whenever a technique's arguments change. Adding a technique does not
 * bump it: `lean@1` means what it meant before `code-graph` existed, and
 * readings taken under it stay comparable.
 * A session's stamp carries
 * it, so readings taken under an older definition are not mixed with newer
 * ones under the same name.
 */
export const HARNESS_VERSION = 1;

export const TECHNIQUES: readonly Technique[] = [
  {
    id: 'strict-mcp',
    summary: 'Give the agent no MCP servers except the ones the dispatch supplies',
    bucket: 'fixed-overhead',
    watch: 'tool-not-found errors, or a task that needed a project MCP server failing',
    args: (ctx) => {
      if (ctx.hasMcpConfig) return [];
      const file = join(ctx.scratchDir(), 'mcp-none.json');
      writeFileSync(file, JSON.stringify({ mcpServers: {} }), { mode: 0o600 });
      return ['--mcp-config', file, '--strict-mcp-config'];
    },
  },
  {
    id: 'no-skills',
    summary: 'Do not load skills into a worker — it has one scoped task',
    bucket: 'fixed-overhead',
    watch: 'a task failing because it relied on a project skill',
    args: () => ['--disable-slash-commands'],
  },
  {
    id: 'stable-prefix',
    summary: 'Keep per-directory details out of the system prompt so worktrees share one cache entry',
    bucket: 'cache-writes',
    watch: 'no fall in first-turn cache writes across parallel tasks, or changed behaviour',
    args: () => ['--exclude-dynamic-system-prompt-sections'],
  },
  {
    id: 'compact-200k',
    summary: 'Summarise history once the context passes 200k tokens, instead of near the window limit',
    bucket: 'context-size',
    watch: 'files being read again after a compaction, more turns, lower task success',
    args: () => ['--autocompact', '200000'],
  },
  {
    id: 'budget-cap',
    summary: 'Stop a run that has spent more than DEVPILOT_HARNESS_MAX_BUDGET_USD at API rates',
    bucket: 'tail-cost',
    watch: 'legitimate long tasks being cut off before they finish',
    args: () => {
      const cap = Number(process.env.DEVPILOT_HARNESS_MAX_BUDGET_USD);
      // No default cap: a number chosen here would be a guess about someone
      // else's work. The technique does nothing until the operator names one.
      return Number.isFinite(cap) && cap > 0 ? ['--max-budget-usd', String(cap)] : [];
    },
    applies: () => {
      const cap = Number(process.env.DEVPILOT_HARNESS_MAX_BUDGET_USD);
      return Number.isFinite(cap) && cap > 0;
    },
  },
  {
    id: 'code-graph',
    summary: 'Give the agent one tool that answers "where is this and what depends on it" from an index of the repository',
    // What it is meant to reduce is the reading an agent does to find its way
    // around. It is in no profile: whether it does reduce it, at equal task
    // success, is exactly what running with and without this technique is for.
    bucket: 'context-size',
    watch: 'more tokens per written change, not fewer; retrieved context left sitting in the window; answers about the wrong module',
    // In addition to whatever MCP config the run already has: `claude` merges
    // several `--mcp-config` files, and `--strict-mcp-config` (from strict-mcp
    // or a shared session) keeps the total to exactly the ones named.
    args: (ctx) => {
      if (!ctx.codeGraph) return [];
      const file = join(ctx.scratchDir(), 'mcp-code-graph.json');
      writeFileSync(file, JSON.stringify({ mcpServers: { codegraph: ctx.codeGraph } }), { mode: 0o600 });
      return ['--mcp-config', file];
    },
    applies: (ctx) => Boolean(ctx.codeGraph),
    // The one tool, by its full name — not the whole server — so a later
    // version of the indexer that adds tools does not have them granted here.
    allowedTools: (ctx) => (ctx.codeGraph ? ['mcp__codegraph__codegraph_explore'] : []),
  },
];

/**
 * Named sets. `lean` is the three that only remove things a scoped worker does
 * not use; the compaction window is kept out of it because it is the one with
 * a real way to hurt, and should be measured on its own.
 */
export const PROFILES: Readonly<Record<string, readonly string[]>> = {
  baseline: [],
  lean: ['strict-mcp', 'no-skills', 'stable-prefix'],
};

export interface Harness {
  /** `baseline@1`, `lean@1`, `baseline+compact-200k@1`. Travels with the readings. */
  stamp: string;
  techniques: Technique[];
  /**
   * Extra arguments for `claude`, the directory to delete afterwards, and the
   * stamp for THIS run — which names only the techniques that could take
   * effect in it (see `Technique.applies`).
   */
  build(ctx: Pick<HarnessContext, 'hasMcpConfig' | 'codeGraph'>): {
    args: string[];
    /** Tool names to grant; the runner writes them into one `--allowedTools`. */
    allowedTools: string[];
    cleanupDir?: string;
    stamp: string;
  };
}

/**
 * Resolve a spec into a harness.
 *
 * A spec is a profile name, optionally followed by technique ids:
 * `baseline`, `lean`, `baseline+compact-200k`, `lean+budget-cap`. Unknown
 * names throw — a typo that silently fell back to `baseline` would produce an
 * A/B in which both arms were the same thing.
 */
export function resolveHarness(spec: string | undefined | null): Harness {
  const parts = (spec?.trim() || 'baseline').split('+').map((p) => p.trim()).filter(Boolean);
  const [profile, ...extras] = parts;

  const base = PROFILES[profile];
  if (!base) {
    throw new Error(
      `Unknown harness profile "${profile}". Profiles: ${Object.keys(PROFILES).join(', ')}. ` +
        `Techniques: ${TECHNIQUES.map((t) => t.id).join(', ')}.`,
    );
  }

  const ids = [...new Set([...base, ...extras])];
  const techniques = ids.map((id) => {
    const technique = TECHNIQUES.find((t) => t.id === id);
    if (!technique) {
      throw new Error(
        `Unknown harness technique "${id}". Techniques: ${TECHNIQUES.map((t) => t.id).join(', ')}.`,
      );
    }
    return technique;
  });

  // The stamp names the profile and only what was added to it, in a stable
  // order, so the same configuration always reads the same.
  const added = extras.filter((id) => !base.includes(id)).sort();
  const stamp = `${[profile, ...new Set(added)].join('+')}@${HARNESS_VERSION}`;

  return {
    stamp,
    techniques,
    build({ hasMcpConfig, codeGraph }) {
      let dir: string | undefined;
      const ctx: HarnessContext = {
        hasMcpConfig,
        codeGraph,
        scratchDir: () => (dir ??= mkdtempSync(join(tmpdir(), 'devpilot-harness-'))),
      };
      const applied = techniques.filter((t) => t.applies?.(ctx) ?? true);
      const args = applied.flatMap((t) => t.args(ctx));
      const ran = new Set(applied.map((t) => t.id));
      return {
        args,
        allowedTools: applied.flatMap((t) => t.allowedTools?.(ctx) ?? []),
        cleanupDir: dir,
        stamp: `${[profile, ...new Set(added.filter((id) => ran.has(id)))].join('+')}@${HARNESS_VERSION}`,
      };
    },
  };
}
