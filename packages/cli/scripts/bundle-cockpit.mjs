#!/usr/bin/env node
/**
 * Assemble the cockpit into the CLI package.
 *
 * WHY THIS EXISTS: the cockpit — the work horizon, the wave planner views, the
 * runway indicator — is a Next app at the repo root. It only ever ran from a
 * checkout. `devpilot serve` started a SECOND, Fastify implementation of the
 * same API and its source read, verbatim:
 *
 *     // Note: In a full implementation, this would open the UI
 *
 * So anyone who installed from npm got an API on :3847 and no cockpit at all.
 *
 * Next's standalone output traces the server and only the dependencies it
 * actually reaches, which is what makes it shippable. Two directories have to
 * be copied in by hand afterwards — Next documents this and does not do it for
 * you, and forgetting either produces a server that boots and then serves a
 * page with no CSS:
 *
 *   .next/static  → hashed JS/CSS chunks
 *   public        → static assets
 *
 * Run from the repo root via `pnpm --filter @devpilot.sh/cli bundle:cockpit`.
 */
import { execSync } from 'node:child_process';
import { cpSync, existsSync, rmSync, mkdirSync, statSync, readdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const CLI_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REPO_ROOT = resolve(CLI_DIR, '../..');
const OUT = join(CLI_DIR, 'ui');

const step = (m) => console.log(`  ${m}`);

function bytes(dir) {
  let total = 0;
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else total += statSync(p).size;
    }
  };
  walk(dir);
  return `${(total / 1024 / 1024).toFixed(1)} MB`;
}

console.log('\nBundling the cockpit into the CLI\n');

if (!process.env.DEVPILOT_SKIP_NEXT_BUILD) {
  step('next build (standalone)…');
  execSync('pnpm build:app', { cwd: REPO_ROOT, stdio: 'inherit' });
} else {
  step('reusing existing .next (DEVPILOT_SKIP_NEXT_BUILD)');
}

const standalone = join(REPO_ROOT, '.next/standalone');
if (!existsSync(join(standalone, 'server.js'))) {
  console.error(
    '\n✗ .next/standalone/server.js is missing.\n' +
      "  next.config.mjs must set output: 'standalone' — without it Next emits a\n" +
      '  normal build that cannot be run outside the repo.\n',
  );
  process.exit(1);
}

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

step('copying standalone server…');
cpSync(standalone, OUT, { recursive: true });

// The two Next does not copy for you.
step('copying .next/static…');
cpSync(join(REPO_ROOT, '.next/static'), join(OUT, '.next/static'), { recursive: true });

if (existsSync(join(REPO_ROOT, 'public'))) {
  step('copying public…');
  cpSync(join(REPO_ROOT, 'public'), join(OUT, 'public'), { recursive: true });
}

// Fail loudly rather than shipping a cockpit that renders unstyled.
for (const required of ['server.js', '.next/static']) {
  if (!existsSync(join(OUT, required))) {
    console.error(`\n✗ ${required} missing from the bundle — refusing to ship a broken cockpit.\n`);
    process.exit(1);
  }
}

console.log(`\n✓ cockpit bundled → packages/cli/ui  (${bytes(OUT)})\n`);
