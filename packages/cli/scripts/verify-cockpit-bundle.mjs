#!/usr/bin/env node
/**
 * Boot the bundled cockpit the way an installed one boots, before it ships.
 *
 * WHY THIS EXISTS: every check on the bundle so far asked whether files were
 * present. They were, and `devpilot serve` installed from npm still died on
 * its first line — `Cannot find module 'next'` — in every version that
 * shipped a cockpit, because what made `next` findable was a symlink and npm
 * does not publish symlinks. Nothing ran the bundle outside the checkout,
 * where the links exist, so nothing noticed.
 *
 * So this runs it outside the checkout. `ui/` is copied to a temporary
 * directory with symlinks NOT followed — which is what a tarball does to them
 * — and the copy is started with the same environment `serve` gives it. It
 * passes when the server answers an API route and the page; it fails with the
 * server's own output otherwise.
 *
 * The one thing supplied from outside is the native addon, exactly as in an
 * install: `better-sqlite3` is not in the bundle (see bundle-cockpit.mjs), it
 * is a dependency of the CLI package, one directory above `ui/`.
 *
 * Run via `pnpm --filter @devpilot.sh/cli verify:cockpit`.
 */
import { spawn } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, symlinkSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const CLI_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const UI = join(CLI_DIR, 'ui');

const fail = (message) => {
  console.error(`\n✗ ${message}\n`);
  process.exit(1);
};

if (!existsSync(join(UI, 'server.js'))) fail('No bundle to verify: packages/cli/ui/server.js is missing. Run bundle:cockpit first.');

/** A port nothing is listening on. */
const freePort = () =>
  new Promise((done, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => done(port));
    });
  });

console.log('\nVerifying the bundled cockpit boots outside the checkout\n');

// <tmp>/pkg stands in for the installed package; <tmp>/pkg/node_modules for
// the dependencies npm installs beside it.
const root = mkdtempSync(join(tmpdir(), 'devpilot-cockpit-verify-'));
const pkg = join(root, 'pkg');
mkdirSync(join(pkg, 'node_modules'), { recursive: true });

// `verbatimSymlinks` keeps a link a link, and the filter then leaves it out:
// the copy has what the tarball will have and nothing more.
let dropped = 0;
cpSync(UI, join(pkg, 'ui'), {
  recursive: true,
  verbatimSymlinks: true,
  filter: (source) => {
    const parent = dirname(source);
    const entry = readdirSync(parent, { withFileTypes: true }).find((e) => join(parent, e.name) === source);
    if (entry?.isSymbolicLink()) {
      dropped += 1;
      return false;
    }
    return true;
  },
});
if (dropped > 0) console.log(`  ${dropped} symlink(s) left out, as npm would`);

// The native addon and what it loads through, from the CLI's own dependencies.
const requireFromCli = createRequire(join(CLI_DIR, 'package.json'));
let sqliteDir;
try {
  sqliteDir = dirname(requireFromCli.resolve('better-sqlite3/package.json'));
} catch {
  fail('better-sqlite3 is not resolvable from the CLI package. It must be one of its dependencies: the bundle does not carry it.');
}
symlinkSync(sqliteDir, join(pkg, 'node_modules', 'better-sqlite3'));

const port = await freePort();
const base = `http://127.0.0.1:${port}`;
let output = '';

const child = spawn(process.execPath, [join(pkg, 'ui', 'server.js')], {
  cwd: root,
  stdio: ['ignore', 'pipe', 'pipe'],
  env: {
    ...process.env,
    PORT: String(port),
    HOSTNAME: '127.0.0.1',
    DEVPILOT_SQLITE_PATH: join(root, 'data.db'),
    DEVPILOT_ORCHESTRATOR_MODE: 'disabled',
    DEVPILOT_RECONCILE: 'false',
  },
});
child.stdout.on('data', (c) => (output += c));
child.stderr.on('data', (c) => (output += c));

let exited = null;
child.on('exit', (code) => (exited = code ?? 1));

const cleanup = () => {
  child.kill('SIGTERM');
  rmSync(root, { recursive: true, force: true });
};

const status = async (path) => {
  try {
    const res = await fetch(base + path, { signal: AbortSignal.timeout(5_000) });
    return res.status;
  } catch {
    return 0;
  }
};

const deadline = Date.now() + 45_000;
let api = 0;
while (Date.now() < deadline && exited === null) {
  api = await status('/api/fleet/state');
  if (api === 200) break;
  await new Promise((r) => setTimeout(r, 500));
}

if (api !== 200) {
  cleanup();
  fail(
    (exited !== null ? `The bundled cockpit exited with code ${exited} before answering.` : `The bundled cockpit did not answer /api/fleet/state (last status ${api}).`) +
      `\n\n${output.trim().split('\n').slice(0, 25).join('\n')}`,
  );
}

const page = await status('/');
cleanup();
if (page !== 200) fail(`The API answered but the page did not: GET / returned ${page}.\n\n${output.trim().split('\n').slice(-15).join('\n')}`);

console.log('  GET /api/fleet/state → 200');
console.log('  GET /                → 200');
console.log('\n✓ the bundled cockpit boots with no checkout around it\n');
