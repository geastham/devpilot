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
import { cpSync, existsSync, rmSync, mkdirSync, statSync, lstatSync, readdirSync, renameSync } from 'node:fs';
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

/**
 * Make `ui/node_modules` a plain directory tree.
 *
 * WHY: in a pnpm workspace Next's standalone output is a pnpm layout — the
 * real packages sit in `node_modules/.pnpm/<name@version>/node_modules/<name>`
 * and everything that makes them findable is a SYMLINK: `node_modules/next`,
 * and each package's links to its own dependencies. npm does not put symlinks
 * in a tarball. So the published CLI carried a `.pnpm` directory nothing
 * pointed into, `ui/server.js` began with `require('next')`, and
 * `devpilot serve` installed from npm died with "Cannot find module 'next'".
 * Every version that shipped a cockpit did this (checked on 0.5.14 and 0.7.0);
 * it only ever worked from a checkout, where the links exist.
 *
 * A flat tree needs no links: every package is at `node_modules/<name>` and
 * finds its dependencies by walking up one level. That is only correct when no
 * package is present in two versions, so two versions is a build failure here
 * rather than something resolved by picking one.
 *
 * NOT SHIPPED: the native addon. `better-sqlite3` is compiled for the machine
 * that built it, so the copy in the standalone output is wrong on every other
 * platform. It is a dependency of the CLI package instead, installed for the
 * user's own platform, and Node finds it by walking up out of `ui/`.
 */
const NATIVE = new Set(['better-sqlite3', 'bindings', 'file-uri-to-path']);

/** Package names directly inside a node_modules directory, scopes expanded. */
function packageNames(dir) {
  const names = [];
  for (const entry of readdirSync(dir)) {
    if (entry.startsWith('.')) continue;
    if (entry.startsWith('@')) {
      for (const scoped of readdirSync(join(dir, entry))) names.push(`${entry}/${scoped}`);
    } else {
      names.push(entry);
    }
  }
  return names;
}

function flattenNodeModules(out) {
  const modules = join(out, 'node_modules');
  const store = join(modules, '.pnpm');
  if (!existsSync(store)) return 0;

  // Where each real package lives in the store.
  const real = new Map();
  for (const entry of readdirSync(store)) {
    const inner = join(store, entry, 'node_modules');
    if (!existsSync(inner)) continue;
    for (const name of packageNames(inner)) {
      const dir = join(inner, name);
      // A link here is a package's pointer to one of its dependencies, which
      // has its own entry in the store.
      if (lstatSync(dir).isSymbolicLink()) continue;
      if (real.has(name)) {
        console.error(
          `\n✗ ${name} is in the cockpit bundle in two versions (${real.get(name).entry} and ${entry}).\n` +
            '  A flat node_modules can hold one. Align the versions before shipping.\n',
        );
        process.exit(1);
      }
      real.set(name, { dir, entry });
    }
  }

  // Everything at the top level other than the store is a link into it.
  for (const name of packageNames(modules)) rmSync(join(modules, name), { recursive: true, force: true });

  let placed = 0;
  for (const [name, { dir }] of real) {
    if (NATIVE.has(name)) continue;
    const target = join(modules, name);
    mkdirSync(dirname(target), { recursive: true });
    renameSync(dir, target);
    placed += 1;
  }
  rmSync(store, { recursive: true, force: true });
  return placed;
}

/** Every symlink under a directory. npm would drop each one from the tarball. */
function symlinksIn(dir) {
  const found = [];
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isSymbolicLink()) found.push(p);
      else if (e.isDirectory()) walk(p);
    }
  };
  walk(dir);
  return found;
}

step('flattening node_modules…');
const placed = flattenNodeModules(OUT);
step(`  ${placed} packages, no links`);

const links = symlinksIn(OUT);
if (links.length > 0) {
  console.error(
    `\n✗ ${links.length} symlink(s) left in the bundle — npm will not publish them, and whatever\n` +
      `  they pointed at will be missing for everyone who installs. First: ${links[0]}\n`,
  );
  process.exit(1);
}

// Fail loudly rather than shipping a cockpit that renders unstyled, or one
// that cannot find its own server.
for (const required of [
  'server.js',
  '.next/static',
  'node_modules/next/package.json',
  'node_modules/react/package.json',
  'node_modules/react-dom/package.json',
]) {
  if (!existsSync(join(OUT, required))) {
    console.error(`\n✗ ${required} missing from the bundle — refusing to ship a broken cockpit.\n`);
    process.exit(1);
  }
}

console.log(`\n✓ cockpit bundled → packages/cli/ui  (${bytes(OUT)})\n`);
