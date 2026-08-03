#!/usr/bin/env node
/**
 * Fake `ao` binary — a stand-in for the agent-orchestrator CLI.
 *
 * WHAT THIS PROVES: the parts of ao-cli mode that are OURS — how
 * AoCliAdapter builds its argv, and how it parses stdout back into
 * JobStatus / CompletionReport. Those are the places a wrapper actually breaks,
 * and they are currently untested.
 *
 * WHAT IT DOES NOT PROVE: that the real `ao` emits this format. That is an
 * assumption baked into packages/core/src/orchestrator/ao-cli-adapter.ts, and
 * the only way to check it is to run the real binary once and compare. This
 * file encodes the format the adapter EXPECTS, taken from its own parser:
 *
 *   spawn   -> "Session started: <id>"        (parseSessionId)
 *   status  -> JSON {status, progress, ...}   (parseStatusOutput)
 *   status --json when complete -> adds prUrl, tokensUsed, costUsd, summary
 *
 * State lives in a temp file because every invocation is a fresh process, and
 * the adapter calls spawn once then status repeatedly.
 *
 * Usage (as the adapter calls it):
 *   fake-ao.mjs --version
 *   fake-ao.mjs list
 *   fake-ao.mjs spawn <project> <ticket> "<prompt>" [--model m] [--repo r]
 *   fake-ao.mjs status <session-id> [--json]
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const STATE = process.env.FAKE_AO_STATE || path.join(os.tmpdir(), 'fake-ao-state.json');
/** Number of `status` polls before the job reports complete. */
const STEPS = Number(process.env.FAKE_AO_STEPS || 2);
const SHOULD_FAIL = process.env.FAKE_AO_FAIL === '1';
/** Every invocation is appended here so the harness can assert on argv. */
const CALLS = process.env.FAKE_AO_CALLS;

const argv = process.argv.slice(2);

function readState() {
  try {
    return JSON.parse(fs.readFileSync(STATE, 'utf8'));
  } catch {
    return { sessions: {} };
  }
}
function writeState(s) {
  fs.writeFileSync(STATE, JSON.stringify(s, null, 2));
}
function record() {
  if (!CALLS) return;
  fs.appendFileSync(CALLS, JSON.stringify(argv) + '\n');
}

record();

const cmd = argv[0];

if (argv.includes('--version')) {
  console.log('ao version 0.0.0-fake');
  process.exit(0);
}

if (cmd === 'list') {
  const s = readState();
  console.log(Object.keys(s.sessions).join('\n'));
  process.exit(0);
}

if (cmd === 'spawn') {
  // Adapter builds: spawn <project> <ticket> "<prompt>" [--model m] [--repo r]
  const [, project, ticket, ...rest] = argv;
  if (!project || !ticket) {
    console.error('usage: ao spawn <project> <ticket> "<prompt>"');
    process.exit(1);
  }

  const prompt = rest.find((a) => !a.startsWith('--')) ?? '';
  const flag = (n) => {
    const i = rest.indexOf(`--${n}`);
    return i === -1 ? undefined : rest[i + 1];
  };

  const sessionId = `ao-sess-${Date.now().toString(36)}`;
  const s = readState();
  s.sessions[sessionId] = {
    project,
    ticket,
    prompt,
    model: flag('model'),
    repo: flag('repo'),
    polls: 0,
  };
  writeState(s);

  // EXACTLY the format parseSessionId() looks for.
  console.log(`Session started: ${sessionId}`);
  process.exit(0);
}

if (cmd === 'status') {
  const sessionId = argv[1];
  const s = readState();
  const job = s.sessions[sessionId];

  if (!job) {
    // parseSessionId's sibling path: the adapter checks stderr for "not found".
    console.error(`Session not found: ${sessionId}`);
    process.exit(1);
  }

  job.polls += 1;
  writeState(s);

  const done = job.polls >= STEPS;
  const progress = Math.min(100, Math.round((job.polls / STEPS) * 100));

  if (!done) {
    console.log(
      JSON.stringify({
        status: 'running',
        progress,
        step: `Working (poll ${job.polls}/${STEPS})`,
        message: `In progress on ${job.repo ?? job.project}`,
      }),
    );
    process.exit(0);
  }

  if (SHOULD_FAIL) {
    console.log(
      JSON.stringify({
        status: 'failed',
        progress: 100,
        message: 'Fake ao was told to fail',
        error: { code: 'AGENT_ERROR', message: 'Fake ao was told to fail' },
      }),
    );
    process.exit(0);
  }

  console.log(
    JSON.stringify({
      status: 'complete',
      progress: 100,
      message: 'Task completed',
      summary: 'Fake ao finished the task.',
      prUrl: `https://github.com/${job.repo ?? 'acme/api'}/pull/4242`,
      commitSha: 'deadbeef',
      filesModified: ['src/rate-limit.ts'],
      filesCreated: [],
      filesDeleted: [],
      tokensUsed: 9876,
      costUsd: 0.27,
      durationMinutes: 2,
    }),
  );
  process.exit(0);
}

console.error(`fake-ao: unknown command ${cmd}`);
process.exit(1);
