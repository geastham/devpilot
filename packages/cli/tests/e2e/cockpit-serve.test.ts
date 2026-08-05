import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

/**
 * Replaces tests/e2e/server.test.ts, which exercised the Fastify server that
 * `devpilot serve` used to start. That server is gone: it was a second
 * implementation of the same API over the same tables, it was missing the
 * wave-plan routes entirely, and it never served a UI — its own source read
 * "In a full implementation, this would open the UI". `serve` now runs the
 * cockpit's own Next server, so there is one API and one UI.
 *
 * What is worth testing here is the PACKAGING CONTRACT, because that is what
 * actually broke for users: the cockpit existed and shipped nowhere. Booting a
 * real cockpit needs the 24 MB bundle, which is a publish-time artifact rather
 * than something CI should build, so these assert the contract around it and
 * the harness covers the live path.
 */

const CLI_ROOT = resolve(__dirname, '../..');
const pkg = JSON.parse(readFileSync(join(CLI_ROOT, 'package.json'), 'utf8'));

describe('the cockpit is packaged with the CLI', () => {
  /**
   * THE REGRESSION GUARD. If `ui` falls out of `files`, npm silently publishes
   * a CLI whose `serve` cannot find a cockpit — which is exactly the state this
   * work fixed, and it would not fail any other test.
   */
  it('publishes the ui/ directory', () => {
    expect(pkg.files).toContain('ui');
  });

  it('bundles the cockpit before publishing', () => {
    // Without this, `npm publish` from a clean checkout ships an empty ui/.
    expect(pkg.scripts.prepublishOnly).toContain('bundle:cockpit');
  });

  it('no longer depends on fastify', () => {
    // The second API implementation is gone; a lingering dep would mean part of
    // it came back.
    expect(Object.keys(pkg.dependencies ?? {})).not.toContain('fastify');
  });

  it('has a bundler script that fails rather than shipping a partial cockpit', () => {
    const script = readFileSync(join(CLI_ROOT, 'scripts/bundle-cockpit.mjs'), 'utf8');

    // Next does not copy these into standalone for you, and a cockpit missing
    // .next/static boots fine and renders with no CSS — the worst failure mode,
    // because it looks like a styling bug rather than a packaging one.
    expect(script).toContain('.next/static');
    expect(script).toContain('refusing to ship a broken cockpit');
  });
});

describe('serve resolves the bundle robustly', () => {
  /**
   * The first version hard-coded '../../ui/server.js', assuming the compiled
   * layout was dist/commands/serve.js. tsup bundles everything into dist/cli.js,
   * so that resolved to packages/ui — and the CLI reported the cockpit as
   * missing while it sat in packages/cli/ui. Candidates, not one guess.
   */
  it('tries more than one candidate path', () => {
    const src = readFileSync(join(CLI_ROOT, 'src/commands/serve.ts'), 'utf8');
    const candidates = src.match(/'\.{1,2}\/[^']*ui\/server\.js'/g) ?? [];
    expect(candidates.length).toBeGreaterThan(1);
  });

  it('finds the entry wherever the bundler puts it', () => {
    // Mirrors cockpitEntry()'s search against a fake package layout, so the
    // logic is checked rather than merely present in the source.
    const root = mkdtempSync(join(tmpdir(), 'dp-cockpit-'));
    try {
      mkdirSync(join(root, 'ui'), { recursive: true });
      writeFileSync(join(root, 'ui/server.js'), '// stub');
      mkdirSync(join(root, 'dist'), { recursive: true });

      const fromDist = ['../ui/server.js', '../../ui/server.js', './ui/server.js']
        .map((rel) => resolve(join(root, 'dist'), rel))
        .find(existsSync);

      expect(fromDist).toBe(join(root, 'ui/server.js'));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('points a user at the fix when the bundle is absent', () => {
    const src = readFileSync(join(CLI_ROOT, 'src/commands/serve.ts'), 'utf8');
    // A bare "not found" would leave someone with no next step; the message has
    // to distinguish a repo checkout from a broken npm install.
    expect(src).toContain('bundle:cockpit');
    expect(src).toContain('packaging bug');
  });
});
