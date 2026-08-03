#!/usr/bin/env node
/**
 * Local dispatch harness — proves the half of the pipeline that runs on YOUR
 * machine.
 *
 * The hosted half (signed webhook → routing → queue) is covered by
 * devpilot-website's round-trip test. The half this exercises has never been
 * run: a queued dispatch actually reaching a local orchestrator and reporting
 * back.
 *
 * It drives the REAL artifacts — the built CLI, the real bridge-client, the
 * real core OrchestratorService, the deployed bridge, the live database — with
 * only the coding agent itself stubbed (stub-orchestrator.mjs).
 *
 *   1. seed an org, machine, token and QUEUE ROW, exactly as the webhook would
 *   2. start the stub orchestrator
 *   3. run `devpilot bridge connect --mode http` for real
 *   4. assert the session reached `complete` with the PR url the agent returned,
 *      and that the queue row settled
 *   5. delete everything it created
 *
 * Usage:
 *   node run-local-dispatch.mjs           # happy path
 *   node run-local-dispatch.mjs --fail    # agent fails; assert error + settle
 *
 * ao-cli mode was removed from this harness on 2026-08-03. It exercised
 * AoCliAdapter against tests/harness/fake-ao.mjs — a fake that spoke the format
 * the adapter EXPECTED. Checking against the real `ao` showed that format no
 * longer exists (`ao list` and `ao status <id>` are both gone, and `ao spawn`
 * takes no prompt), so the adapter is deprecated and throws.
 *
 * The lesson is worth keeping: a harness built from our own assumptions
 * confirms our internal consistency and nothing about the world. fake-ao.mjs is
 * retained only as a record of what we had assumed. See docs/AO-INTEGRATION.md.
 */
import { spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '../../../..');
const WEBSITE = path.resolve(REPO_ROOT, '../devpilot-website');

const SHOULD_FAIL = process.argv.includes('--fail');
const MODE = (() => {
  const i = process.argv.indexOf('--mode');
  return i === -1 ? 'http' : process.argv[i + 1];
})();
const AO_CALLS = path.join(os.tmpdir(), `fake-ao-calls-${Date.now()}.jsonl`);
const AO_STATE = path.join(os.tmpdir(), `fake-ao-state-${Date.now()}.json`);
const STUB_PORT = 7717;
const SUFFIX = randomBytes(4).toString('hex');
const ORG = `org_h_${SUFFIX}`;
const WS = `ws_h_${SUFFIX}`;
const ORCH_NAME = `harness-${SUFFIX}`;
const REPO = `acme/harness-${SUFFIX}`;
const SESSION = `sess_h_${SUFFIX}`;
const QUEUE = `q_h_${SUFFIX}`;

function env() {
  const file = path.join(WEBSITE, '.env.local');
  if (!fs.existsSync(file)) {
    throw new Error(`Need ${file} for DATABASE_URL and the bridge URL.`);
  }
  return Object.fromEntries(
    fs
      .readFileSync(file, 'utf8')
      .split('\n')
      .map((l) => l.match(/^([A-Z0-9_]+)="(.*)"$/))
      .filter(Boolean)
      .map((m) => [m[1], m[2]]),
  );
}

const E = env();
const BRIDGE_URL = process.env.BRIDGE_URL || process.env.DEVPILOT_BRIDGE_URL;
if (!BRIDGE_URL) throw new Error('Set BRIDGE_URL to the deployed bridge.');

const sql = postgres(E.DATABASE_URL, { prepare: false, max: 2 });
const log = (...p) => console.log(`[harness] ${p.join(' ')}`);

let stub;
let cli;

async function cleanup() {
  try {
    if (cli && !cli.killed) cli.kill('SIGTERM');
    if (stub && !stub.killed) stub.kill('SIGTERM');
    await sql`DELETE FROM public.organizations WHERE id = ${ORG}`;
    for (const f of [AO_STATE, AO_CALLS]) fs.rmSync(f, { force: true });
    log('cleaned up');
  } catch (e) {
    console.error('[harness] cleanup failed:', e.message);
  } finally {
    await sql.end().catch(() => {});
  }
}

async function seed() {
  const token = 'dp_orch_' + randomBytes(32).toString('base64url');
  const hash = createHash('sha256').update(token).digest('hex');

  await sql`INSERT INTO public.organizations (id, name, slug)
            VALUES (${ORG}, 'Harness', ${'harness-' + SUFFIX})`;
  await sql`INSERT INTO public.workspaces
              (id, org_id, linear_org_id, linear_org_name, bot_user_id, webhook_secret)
            VALUES (${WS}, ${ORG}, ${'lin_' + SUFFIX}, 'Harness Linear', 'bot', 'CIPHERTEXT')`;
  await sql`INSERT INTO public.orchestrator_tokens (id, org_id, token_hash, token_prefix, name)
            VALUES (${'tok_' + SUFFIX}, ${ORG}, ${hash}, ${token.slice(0, 12)}, 'harness')`;

  log(`seeded org ${ORG}`);
  return token;
}

/** The row the Linear webhook would have committed. */
async function enqueue(orchestratorId) {
  await sql`INSERT INTO public.dispatch_sessions
              (id, org_id, workspace_id, orchestrator_id, linear_issue_id,
               linear_identifier, title, repo, status)
            VALUES (${SESSION}, ${ORG}, ${WS}, ${orchestratorId}, ${'iss_' + SUFFIX},
                    'ENG-H1', 'Harness dispatch', ${REPO}, 'pending')`;
  await sql`INSERT INTO public.dispatch_queue
              (id, org_id, orchestrator_id, session_id, payload)
            VALUES (${QUEUE}, ${ORG}, ${orchestratorId}, ${SESSION}, ${sql.json({
              messageId: 'm_' + SUFFIX,
              queueId: QUEUE,
              sessionId: SESSION,
              orgId: ORG,
              workspaceId: WS,
              linearIssueId: 'iss_' + SUFFIX,
              linearIdentifier: 'ENG-H1',
              title: 'Harness dispatch',
              teamId: 'team_h',
              repo: REPO,
              targetOrchestratorId: orchestratorId,
              dispatchedAt: new Date().toISOString(),
            })})`;
  log(`queued ${QUEUE} for ${orchestratorId}`);
}

function start(cmd, args, name) {
  const p = spawn(cmd, args, {
    cwd: REPO_ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      FAKE_AO_STATE: AO_STATE,
      FAKE_AO_CALLS: AO_CALLS,
      FAKE_AO_STEPS: '2',
      ...(SHOULD_FAIL ? { FAKE_AO_FAIL: '1' } : {}),
    },
  });
  const tag = (d) =>
    d
      .toString()
      .split('\n')
      .filter(Boolean)
      // Never let a token reach the transcript.
      .map((l) => l.replace(/dp_orch_[A-Za-z0-9_-]+/g, 'dp_orch_<redacted>'))
      .forEach((l) => console.log(`  [${name}] ${l}`));
  p.stdout.on('data', tag);
  p.stderr.on('data', tag);
  return p;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(label, check, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const v = await check();
    if (v) return v;
    await sleep(1000);
  }
  throw new Error(`timed out waiting for ${label}`);
}

async function main() {
  const token = await seed();

  if (MODE === 'http') {
    stub = start('node', [
      path.join(HERE, 'stub-orchestrator.mjs'),
      '--port', String(STUB_PORT),
      ...(SHOULD_FAIL ? ['--fail'] : []),
    ], 'stub');
    await sleep(700);
  } else {
    log(`ao-cli mode — using fake ao at ${path.join(HERE, 'fake-ao.mjs')}`);
  }

  cli = start('node', [
    path.join(REPO_ROOT, 'packages/cli/bin/devpilot.js'),
    'bridge', 'connect',
    '--url', BRIDGE_URL,
    '--token', token,
    '--name', ORCH_NAME,
    '--repos', REPO,
    '--transport', 'poll',
    ...(MODE === 'http'
      ? ['--mode', 'http', '--http-url', `http://127.0.0.1:${STUB_PORT}`]
      : ['--mode', 'ao-cli', '--ao-project', 'harness-project',
         '--ao-path', path.join(HERE, 'fake-ao.mjs')]),
  ], 'cli');

  const orchestratorId = await waitFor('registration', async () => {
    const rows = await sql`SELECT id FROM public.orchestrators
                            WHERE org_id = ${ORG} AND name = ${ORCH_NAME}`;
    return rows[0]?.id ?? null;
  });
  log(`registered as ${orchestratorId}`);

  await enqueue(orchestratorId);

  const terminal = await waitFor('a terminal session state', async () => {
    const [row] = await sql`SELECT status, progress_percent, pr_url, tokens_used, cost_usd,
                                   error_message
                              FROM public.dispatch_sessions WHERE id = ${SESSION}`;
    return ['complete', 'error', 'cancelled'].includes(row?.status) ? row : null;
  });

  const events = await sql`SELECT type, message FROM public.session_events
                            WHERE session_id = ${SESSION} ORDER BY created_at`;
  // The harness seeds a workspace with no Linear API key, so completion always
  // logs one Linear-sync error. Surface it explicitly rather than leaving an
  // unexplained `error` in the event trail.
  const linearNote = events.find((e) => e.type === 'error' && /Linear sync/i.test(e.message ?? ''));
  const [{ queued }] = await sql`SELECT count(*)::int AS queued FROM public.dispatch_queue
                                  WHERE session_id = ${SESSION}`;

  console.log('\n================ RESULT ================');
  console.log('status        :', terminal.status);
  console.log('progress      :', terminal.progress_percent);
  console.log('pr_url        :', terminal.pr_url ?? '(none)');
  console.log('tokens / cost :', terminal.tokens_used ?? '-', '/', terminal.cost_usd ?? '-');
  console.log('error         :', terminal.error_message ?? '(none)');
  console.log('events        :', events.map((e) => e.type).join(' → '));
  console.log('queue rows    :', queued);
  console.log('linear sync   :', linearNote ? `skipped — ${linearNote.message}` : 'n/a');
  if (MODE === 'ao-cli' && fs.existsSync(AO_CALLS)) {
    const calls = fs.readFileSync(AO_CALLS, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    console.log('ao invocations (argv as received — quoting matters here):');
    for (const c of calls) console.log('   ' + JSON.stringify(c));
    // The prompt must survive as ONE argv entry. AoCliAdapter wraps it in
    // quotes inside a shell string; if that ever regresses, `ao` receives the
    // prompt split across argv and the agent gets garbage.
    const spawnCall = calls.find((c) => c[0] === 'spawn');
    if (spawnCall) {
      const prompt = spawnCall[3];
      const intact = typeof prompt === 'string' && prompt.includes(' ');
      console.log(`   prompt intact as one arg: ${intact ? 'YES' : 'NO — SHELL SPLIT IT'}`);
      if (!intact) process.exitCode = 1;
    }
  }
  console.log('========================================\n');

  const problems = [];
  if (SHOULD_FAIL) {
    if (terminal.status !== 'error') problems.push(`expected error, got ${terminal.status}`);
  } else {
    if (terminal.status !== 'complete') problems.push(`expected complete, got ${terminal.status}`);
    if (!terminal.pr_url) problems.push('agent PR url did not reach the bridge');
    if (terminal.progress_percent !== 100) problems.push('progress did not reach 100');
  }
  if (queued !== 0) problems.push('queue row did not settle');
  if (!events.some((e) => e.type === 'dispatched')) problems.push('no dispatched event');

  if (problems.length) {
    console.error('FAILED:\n  - ' + problems.join('\n  - '));
    process.exitCode = 1;
  } else {
    console.log('PASS — local dispatch path verified end to end.');
  }
}

main()
  .catch((e) => {
    console.error('[harness] error:', e.message);
    process.exitCode = 1;
  })
  .finally(cleanup);
