import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, type Server } from 'http';
import { mkdtempSync, writeFileSync, chmodSync, mkdirSync, readFileSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { execFileSync } from 'child_process';
import { SessionRunner } from '../../src/commands/session-runner';
import { resolveHarness } from '../../src/commands/session-runner/harness';
import type { RunnerConfig } from '../../src/commands/session-runner';

/**
 * The harness, through the real runner.
 *
 * `harness.test.ts` checks which arguments a profile produces. This checks the
 * two things that only the whole path can show: that those arguments actually
 * reach the agent that is launched, and that every reading the runner reports
 * for it carries the profile's stamp — which is the only thing that lets a
 * before-and-after comparison be made later.
 *
 * `claude` is a stub that records its argv and emits stream-json, as in
 * session-runner.test.ts. Everything between the HTTP surface and the callback
 * is the production path.
 */

const CALLBACK_PORT = 39148;
const CALLBACK_URL = `http://127.0.0.1:${CALLBACK_PORT}/api/orchestrator`;

let callbackServer: Server;
let received: { path: string; body: any }[] = [];
let workspace: string;
let repoDir: string;

/** A stub `claude` that records how it was launched and streams one tool call. */
function stubClaude(dir: string, name: string): { path: string; argvLog: string; cfgLog: string } {
  const path = join(dir, name);
  const argvLog = join(dir, `${name}.argv.json`);
  const cfgLog = join(dir, `${name}.mcp.json`);
  writeFileSync(
    path,
    `#!/usr/bin/env node
const fs = require('fs');
const argv = process.argv.slice(2);
fs.writeFileSync(${JSON.stringify(argvLog)}, JSON.stringify(argv));
// Copy the MCP config while it exists: the runner deletes it when we exit.
const i = argv.indexOf('--mcp-config');
if (i !== -1) fs.writeFileSync(${JSON.stringify(cfgLog)}, fs.readFileSync(argv[i + 1], 'utf8'));
let input = '';
process.stdin.on('data', (c) => (input += c));
process.stdin.on('end', () => {
  fs.writeFileSync('touched.txt', 'edited by stub\\n');
  const out = (o) => process.stdout.write(JSON.stringify(o) + '\\n');
  out({ type: 'assistant', message: { id: 'msg_1', model: 'claude-haiku-4-5',
        usage: { input_tokens: 10, output_tokens: 20, cache_read_input_tokens: 300 },
        content: [{ type: 'tool_use', name: 'Write', input: { file_path: process.cwd() + '/touched.txt' } }] } });
  out({ type: 'result', is_error: false, subtype: 'success', result: 'done',
        total_cost_usd: 0.01, num_turns: 1, duration_ms: 50,
        usage: { input_tokens: 10, output_tokens: 20, cache_read_input_tokens: 300, cache_creation_input_tokens: 0 } });
  process.exit(0);
});
`,
    'utf8',
  );
  chmodSync(path, 0o755);
  return { path, argvLog, cfgLog };
}

function config(overrides: Partial<RunnerConfig>): RunnerConfig {
  return {
    port: 0,
    host: '127.0.0.1',
    apiKey: 'test-token',
    workspace,
    repoMap: new Map([['acme/widget', repoDir]]),
    claudePath: 'claude',
    permissionMode: 'acceptEdits',
    maxConcurrent: 3,
    timeoutMs: 30_000,
    log: () => undefined,
    ...overrides,
  };
}

async function run(port: number, sessionId: string, overrides: Partial<RunnerConfig>) {
  const runner = new SessionRunner(config({ port, ...overrides }));
  await runner.start();
  try {
    const res = await fetch(`http://127.0.0.1:${port}/v1/sessions`, {
      method: 'POST',
      headers: { Authorization: 'Bearer test-token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, repo: 'acme/widget', prompt: 'do the thing', callbackUrl: CALLBACK_URL }),
    });
    expect(res.status).toBe(201);

    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline) {
      if (received.some((r) => r.path.endsWith('/complete') && r.body?.sessionId === sessionId)) break;
      await new Promise((r) => setTimeout(r, 100));
    }
    return received.filter((r) => r.body?.sessionId === sessionId);
  } finally {
    await runner.stop();
  }
}

beforeAll(async () => {
  workspace = mkdtempSync(join(tmpdir(), 'dp-harness-'));
  repoDir = join(workspace, 'widget');
  mkdirSync(repoDir, { recursive: true });
  execFileSync('git', ['init', '-q'], { cwd: repoDir });
  execFileSync('git', ['config', 'user.email', 't@t.t'], { cwd: repoDir });
  execFileSync('git', ['config', 'user.name', 't'], { cwd: repoDir });
  writeFileSync(join(repoDir, 'seed.txt'), 'seed\n');
  execFileSync('git', ['add', '-A'], { cwd: repoDir });
  execFileSync('git', ['commit', '-qm', 'init'], { cwd: repoDir });

  callbackServer = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      received.push({ path: req.url ?? '', body: body ? JSON.parse(body) : {} });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('{"ok":true}');
    });
  });
  await new Promise<void>((r) => callbackServer.listen(CALLBACK_PORT, '127.0.0.1', r));
});

afterAll(async () => {
  await new Promise<void>((r) => callbackServer.close(() => r()));
});

describe('the harness reaches the agent it configures', () => {
  it('launches a baseline agent exactly as before', async () => {
    const stub = stubClaude(workspace, 'claude-baseline');
    await run(39149, 'sess-baseline', { claudePath: stub.path, harness: resolveHarness('baseline') });

    const argv: string[] = JSON.parse(readFileSync(stub.argvLog, 'utf8'));
    expect(argv).toEqual(['-p', '--output-format', 'stream-json', '--verbose', '--permission-mode', 'acceptEdits']);
  });

  it('launches a lean agent with nothing it was not given', async () => {
    const stub = stubClaude(workspace, 'claude-lean');
    await run(39150, 'sess-lean', { claudePath: stub.path, harness: resolveHarness('lean') });

    const argv: string[] = JSON.parse(readFileSync(stub.argvLog, 'utf8'));
    expect(argv).toContain('--strict-mcp-config');
    expect(argv).toContain('--disable-slash-commands');
    expect(argv).toContain('--exclude-dynamic-system-prompt-sections');
    // The agent was pointed at an MCP config with no servers in it…
    expect(JSON.parse(readFileSync(stub.cfgLog, 'utf8'))).toEqual({ mcpServers: {} });
    // …and that file is gone once the run is over.
    expect(existsSync(argv[argv.indexOf('--mcp-config') + 1])).toBe(false);
  });

  /**
   * Without the stamp, sessions run under two configurations are one
   * undifferentiated pile and no comparison between them is possible.
   */
  it('stamps every reading with the harness it ran under', async () => {
    const stub = stubClaude(workspace, 'claude-stamped');
    const reports = await run(39151, 'sess-stamped', {
      claudePath: stub.path,
      harness: resolveHarness('lean+compact-200k'),
    });

    const readings = reports.map((r) => r.body?.telemetry).filter(Boolean);
    expect(readings.length).toBeGreaterThan(0);
    for (const reading of readings) expect(reading.harness).toBe('lean+compact-200k@1');
    // And the reading says what it cost, by kind, and on which model.
    expect(readings.at(-1)).toMatchObject({ writeCalls: 1, tokensCacheRead: 300, model: 'claude-haiku-4-5' });
  });

  /**
   * Status reports are throttled, so the completion report is the only place
   * the last reading is guaranteed to arrive — and it is the one the cost
   * dimension of the score is computed from.
   */
  it('sends the final reading with the completion, priced against the reference', async () => {
    const stub = stubClaude(workspace, 'claude-final');
    const reports = await run(39152, 'sess-final', { claudePath: stub.path, harness: resolveHarness('baseline') });

    const completion = reports.find((r) => r.path.endsWith('/complete'))!;
    const reading = completion.body.telemetry;
    expect(reading).toMatchObject({ writeCalls: 1, filesTouched: ['touched.txt'], model: 'claude-haiku-4-5' });
    // 10 in, 20 out, 300 cached reads on Haiku: $0.00014 at list…
    expect(reading.listCostUsd).toBeCloseTo((10 * 1 + 20 * 5 + 300 * 0.1) / 1e6, 10);
    // …against the most the same tokens could have cost on any listed model.
    expect(reading.referenceCostUsd).toBeGreaterThan(reading.listCostUsd);
    expect(reading.referenceModel).toMatch(/^claude-fable-5/);
  });
});
