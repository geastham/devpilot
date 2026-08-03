#!/usr/bin/env node
/**
 * Stub orchestrator — a stand-in for a real coding agent.
 *
 * Implements the HTTP contract that packages/core/src/orchestrator/client.ts
 * speaks (`/health`, `/dispatch`, `/jobs/:id/status`, `/jobs/:id/cancel`), so
 * the local dispatch path can be exercised end to end without installing `ao`,
 * cloning a repository, or spending model tokens.
 *
 * What this DOES prove: bridge → claim → dispatch-handler → core
 * OrchestratorService → status polling → progress and completion reported back
 * to the bridge → queue settled.
 *
 * What it does NOT prove: that a real agent produces useful code. That is the
 * agent's job, and it is deliberately out of scope here — this harness exists
 * to test the wiring that sits either side of it.
 *
 * Usage:
 *   node stub-orchestrator.mjs --port 7717 [--fail] [--steps 3] [--step-ms 400]
 */
import http from 'node:http';

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};
const flag = (name) => args.includes(`--${name}`);

const PORT = Number(opt('port', 7717));
const STEPS = Number(opt('steps', 3));
const STEP_MS = Number(opt('step-ms', 400));
const SHOULD_FAIL = flag('fail');

/** sessionId -> job state, mirroring what a real orchestrator tracks. */
const jobs = new Map();

function log(...parts) {
  console.log(`[stub] ${parts.join(' ')}`);
}

function advance(sessionId) {
  const job = jobs.get(sessionId);
  if (!job || job.done) return;

  job.step += 1;
  job.progressPercent = Math.min(100, Math.round((job.step / STEPS) * 100));

  if (job.step >= STEPS) {
    job.done = true;
    if (SHOULD_FAIL) {
      job.status = 'error';
      job.message = 'Stub agent was told to fail';
      job.error = 'Stub agent was told to fail';
    } else {
      job.status = 'complete';
      job.progressPercent = 100;
      job.message = 'Stub agent finished';
      job.success = true;
      job.prUrl = `https://github.com/acme/api/pull/${1000 + job.seq}`;
      job.summary = 'Stub agent completed the task.';
      job.tokensUsed = 12345;
      job.costUsd = 0.31;
    }
    log(`job ${sessionId} -> ${job.status}`);
    return;
  }

  job.status = 'running';
  job.message = `Step ${job.step} of ${STEPS}`;
  setTimeout(() => advance(sessionId), STEP_MS);
}

let seq = 0;

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  const send = (code, body) => {
    res.writeHead(code, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
  };

  if (url.pathname === '/health') {
    return send(200, { status: 'ok', mode: 'stub', activeJobs: jobs.size });
  }

  if (url.pathname === '/dispatch' && req.method === 'POST') {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      let request;
      try {
        request = JSON.parse(raw);
      } catch {
        return send(400, { accepted: false, error: 'bad json' });
      }

      const sessionId = request.sessionId;
      if (!sessionId) return send(400, { accepted: false, error: 'missing sessionId' });

      seq += 1;
      const job = {
        seq,
        step: 0,
        status: 'queued',
        progressPercent: 0,
        message: 'Accepted',
        done: false,
        repo: request.repo,
        sessionIdRef: sessionId,
      };
      // Addressable by both: the poller uses the external id, the harness and
      // completion lookups use the session id.
      jobs.set(sessionId, job);
      jobs.set(`stub-${seq}`, job);
      log(`dispatch ${sessionId} repo=${request.repo}`);

      setTimeout(() => advance(sessionId), STEP_MS);
      // The contract field is `orchestratorJobId` — DispatchResponse in
      // packages/core/src/orchestrator/types.ts:76. Returning `externalJobId`
      // means OrchestratorService.dispatch stores NO session mapping, and every
      // later status/completion lookup silently returns null.
      return send(200, { accepted: true, orchestratorJobId: `stub-${seq}`, sessionId });
    });
    return;
  }

  const statusMatch = url.pathname.match(/^\/jobs\/([^/]+)\/status$/);
  if (statusMatch) {
    const job = jobs.get(decodeURIComponent(statusMatch[1]));
    log(`status poll for ${statusMatch[1]} -> ${job ? job.status : 'unknown'}`);
    if (!job) return send(404, { error: 'unknown job' });
    return send(200, {
      status: job.status,
      progressPercent: job.progressPercent,
      message: job.message,
      success: job.success,
      prUrl: job.prUrl,
      summary: job.summary,
      tokensUsed: job.tokensUsed,
      costUsd: job.costUsd,
      error: job.error,
    });
  }

  const resultMatch = url.pathname.match(/^\/jobs\/([^/]+)\/result$/);
  if (resultMatch) {
    const job = jobs.get(decodeURIComponent(resultMatch[1]));
    log(`result fetch for ${resultMatch[1]} -> ${job ? job.status : 'unknown'}`);
    if (!job || !job.done) return send(404, { error: 'not complete' });
    return send(200, {
      sessionId: job.sessionIdRef,
      success: Boolean(job.success),
      prUrl: job.prUrl,
      filesModified: ['src/rate-limit.ts'],
      filesCreated: [],
      filesDeleted: [],
      summary: job.summary ?? job.message ?? '',
      tokensUsed: job.tokensUsed ?? 0,
      costUsd: job.costUsd ?? 0,
      durationMinutes: 1,
      ...(job.error ? { error: { code: 'agent_error', message: job.error } } : {}),
    });
  }

  const cancelMatch = url.pathname.match(/^\/jobs\/([^/]+)\/cancel$/);
  if (cancelMatch && req.method === 'POST') {
    const id = decodeURIComponent(cancelMatch[1]);
    const job = jobs.get(id);
    if (job) {
      job.done = true;
      job.status = 'cancelled';
    }
    return send(200, { success: Boolean(job), message: job ? 'cancelled' : 'unknown job' });
  }

  send(404, { error: 'not found' });
});

server.listen(PORT, '127.0.0.1', () => {
  log(`listening on http://127.0.0.1:${PORT} (steps=${STEPS}, fail=${SHOULD_FAIL})`);
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    server.close(() => process.exit(0));
  });
}
