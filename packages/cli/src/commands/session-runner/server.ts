import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'http';
import { randomUUID } from 'crypto';
import { existsSync } from 'fs';
import { basename, isAbsolute, resolve } from 'path';
import { runClaudeSession } from './claude-runner';
import { workHistorySource } from './harness';
import { sendCompletion, sendStatus } from './callbacks';
import { describeActivity, estimateProgress, type SessionTelemetry } from './stream-events';
import {
  IsolationError,
  checkIsolatable,
  finishTaskWorkspace,
  integrateRun,
  prepareTaskWorkspace,
  refSafe,
  workspacePreamble,
  type TaskWorkspace,
} from './isolation';
import { codeGraph as graph } from '@devpilot.sh/core';
import {
  excludeIndexFromGit,
  hasIndex,
  mcpServerFor,
  seedIndex,
  stopIndexDaemon,
  syncIndex,
} from '../../utils/codegraph';
import type {
  CreateSessionRequest,
  IntegrateRequest,
  RunnerConfig,
  RunnerSession,
  StatusUpdate,
} from './types';

/**
 * The local session runner — the dispatcher API from
 * `spec/trd/01-TIER1-EXECUTION-LOOP.md` §7.1.
 *
 * This is the piece that was missing. `ClaudeSessionAdapter` and its
 * `HttpSessionTransport` were built, and so were DevPilot's `/api/orchestrator/*`
 * callback routes — but nothing implemented the service in between, so
 * `claude-session` mode had no runner to point `DEVPILOT_SESSION_API_URL` at and
 * could never dispatch. Every other orchestrator mode is either deprecated
 * (`ao-cli`), speaks a contract nothing local implements (`http` against the ao
 * daemon), or is `disabled`.
 *
 * Deliberately `node:http` and no framework: it runs on a conductor's laptop
 * next to `devpilot serve`, and a dependency-free daemon is one less thing to
 * break at install time.
 */

const VERSION = '1.1.0';

/**
 * What this runner can do beyond the original contract, reported by
 * `/v1/health` so a dispatcher can tell before it asks. A runner that predates
 * a capability ignores the field it does not know, which for `isolation` would
 * mean a task quietly run in the shared checkout — so the dispatcher checks.
 */
const CAPABILITIES = ['isolation', 'code-graph'] as const;

/** The first line of a commit message: one line, and short enough to read in a log. */
function commitSubject(taskCode: string, title: string | undefined): string {
  const line = (title ?? '').replace(/\s+/g, ' ').trim();
  const subject = line ? `devpilot(${taskCode}): ${line}` : `devpilot: task ${taskCode}`;
  return subject.length > 72 ? `${subject.slice(0, 71)}…` : subject;
}

function json(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of req) {
    bytes += (chunk as Buffer).length;
    // A composed prompt is large but bounded. Refuse rather than buffer forever.
    if (bytes > 8 * 1024 * 1024) throw new Error('PAYLOAD_TOO_LARGE');
    chunks.push(chunk as Buffer);
  }
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

export class SessionRunner {
  /** Keyed by runner-side externalSessionId. */
  private readonly sessions = new Map<string, RunnerSession>();
  /** DevPilot sessionId -> externalSessionId. The §7.1 idempotency index. */
  private readonly byDevpilotId = new Map<string, string>();
  private server: Server | null = null;

  constructor(private readonly config: RunnerConfig) {}

  private get activeCount(): number {
    let n = 0;
    for (const session of this.sessions.values()) {
      if (session.status === 'queued' || session.status === 'running') n++;
    }
    return n;
  }

  /**
   * Resolve `owner/name` to a checkout on this machine.
   *
   * Explicit `--repo` mappings win; otherwise the repo's basename is looked up
   * under `--workspace`. A repo that resolves nowhere is rejected at create
   * time with a message naming the path it tried, because the alternative —
   * spawning the agent in the wrong directory — produces a session that edits
   * unrelated files and reports success.
   */
  private resolveWorkdir(repo: string): { workdir?: string; error?: string } {
    const mapped = this.config.repoMap.get(repo);
    if (mapped) {
      return existsSync(mapped)
        ? { workdir: mapped }
        : { error: `Mapped path for '${repo}' does not exist: ${mapped}` };
    }

    const candidate = isAbsolute(repo)
      ? repo
      : resolve(this.config.workspace, basename(repo));

    if (!existsSync(candidate)) {
      return {
        error:
          `No checkout for '${repo}'. Tried ${candidate}. ` +
          `Pass --repo ${repo}=/path/to/checkout, or set --workspace.`,
      };
    }
    return { workdir: candidate };
  }

  private authorized(req: IncomingMessage): boolean {
    if (!this.config.apiKey) return true;
    return req.headers.authorization === `Bearer ${this.config.apiKey}`;
  }

  /** Fire-and-forget status callback; delivery failures are logged, not thrown. */
  private reportStatus(
    session: RunnerSession,
    callbackUrl: string,
    callbackToken: string | undefined,
    patch: Partial<StatusUpdate>
  ): void {
    const update: StatusUpdate = {
      sessionId: session.devpilotSessionId,
      status: session.status,
      progressPercent: session.progressPercent,
      filesModified: session.filesModified,
      tokensUsed: session.tokensUsed,
      timestamp: new Date().toISOString(),
      ...patch,
    };
    void sendStatus(callbackUrl, update, callbackToken, this.config.log);
  }

  /**
   * Run a session to completion and report. Never rejects: a throw here would be
   * an unhandled rejection in a detached promise, and — worse — would leave the
   * wave task stuck on `dispatched` with no completion callback ever sent.
   */
  private async execute(session: RunnerSession, request: CreateSessionRequest): Promise<void> {
    const { callbackUrl, callbackToken } = request;

    try {
      session.status = 'running';

      /**
       * Give the task its own tree before the agent exists. A failure here is
       * thrown into the catch below and reported as a failed task, with the
       * reason — never answered by falling back to the shared checkout, which
       * is the thing isolation was asked for to avoid.
       */
      let workspace: TaskWorkspace | undefined;
      if (request.isolation) {
        workspace = await prepareTaskWorkspace(session.workdir, request.isolation, this.config.isolation);
        session.branch = workspace.branch;
        this.config.log(
          `[${session.externalSessionId}] task ${request.isolation.taskCode} on ${workspace.branch} ` +
            `(from ${workspace.baseSha.slice(0, 8)})`
        );
      }
      const rundir = workspace?.dir ?? session.workdir;

      /**
       * Give the run its code graph, if this machine has the indexer and the
       * repository has an index. All of it is best-effort: the graph is an aid,
       * and a task must run exactly as it would have without one when any step
       * here fails.
       *
       * Order matters. The exclude goes in first — before the agent can write
       * anything and long before the runner's own `git add -A` — because the
       * index directory contains a `.gitignore` that un-ignores itself.
       */
      let codeGraph: ReturnType<typeof mcpServerFor> | null = null;
      const indexer = this.config.codeGraph;
      if (indexer && hasIndex(session.workdir)) {
        try {
          await excludeIndexFromGit(session.workdir);
          if (workspace && seedIndex(session.workdir, workspace.dir)) {
            // The worktree was cut from the run branch, which can be ahead of
            // the checkout the index describes. Bring it up to the tree it is in.
            await syncIndex(indexer, workspace.dir, 60_000);
          }
          if (hasIndex(rundir)) codeGraph = mcpServerFor(indexer, rundir);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          this.config.log(`[${session.externalSessionId}] code graph unavailable for this run: ${message.slice(0, 300)}`);
          codeGraph = null;
        }
      }

      session.progressPercent = 5;
      session.currentStep = 'session started';
      this.reportStatus(session, callbackUrl, callbackToken, {
        currentStep: 'session started',
        message: workspace
          ? `Claude Code session running on ${workspace.branch}`
          : `Claude Code session running in ${session.workdir}`,
      });

      /**
       * The heartbeat is now a floor, not the signal.
       *
       * It used to BE the progress: five percent every ninety seconds, capped
       * at ninety, because `claude -p` said nothing until it exited. Agents sat
       * at 0% for ten minutes and then snapped to 100%, and elapsed read 0m
       * against a real 5.76m. With `stream-json` the telemetry below carries
       * the actual picture; this only guarantees §7.2's two-minute liveness
       * requirement when an agent is genuinely quiet (a long Bash step, say).
       */
      const heartbeat = setInterval(() => {
        if (session.terminal) return;
        this.reportStatus(session, callbackUrl, callbackToken, {
          currentStep: session.currentStep ?? 'working',
          message: session.message ?? 'Session in progress',
        });
      }, 90_000);
      heartbeat.unref();

      /**
       * Throttled so the instrument does not become the load. A busy agent
       * emits tool calls faster than anyone can read them, and every report is
       * an HTTP round trip plus a database write on the other end.
       */
      let lastReportAt = 0;
      const REPORT_INTERVAL_MS = 3_000;

      const outcome = await runClaudeSession({
        workdir: rundir,
        prompt: workspace
          ? workspacePreamble(workspace, this.config.isolation) + request.prompt
          : request.prompt,
        sessionLink: request.sessionLink,
        model: request.model,
        claudePath: this.config.claudePath,
        /**
         * Permission mode is the OPERATOR's, never the caller's — TRD 23 S-04.
         *
         * A request that could raise it would let someone in the cockpit
         * escalate what an agent may do on another person's laptop. It stays
         * with whoever started the bridge.
         */
        permissionMode: this.config.permissionMode,
        resumeSessionId: request.resumeSessionId,
        timeoutMs: this.config.timeoutMs,
        harness: this.config.harness,
        codeGraph,
        workHistory: workHistorySource(callbackUrl, request.repo),
        onLog: (line) => this.config.log(`[${session.externalSessionId}] ${line}`),
        onSpawn: (kill) => {
          session.kill = kill;
        },
        onTelemetry: (telemetry) => {
          session.telemetry = telemetry;
          session.currentStep = describeActivity(telemetry);
          session.progressPercent = estimateProgress(telemetry, request.filePaths ?? []);

          const now = Date.now();
          if (now - lastReportAt < REPORT_INTERVAL_MS) return;
          lastReportAt = now;

          this.reportStatus(session, callbackUrl, callbackToken, {
            currentStep: session.currentStep,
            message: telemetry.lastText ?? `${telemetry.toolCalls} tool calls`,
            filesModified: telemetry.filesTouched,
            tokensUsed: telemetry.tokensIn + telemetry.tokensOut,
            telemetry,
          });
        },
      });

      clearInterval(heartbeat);

      // The indexer's MCP server leaves a daemon running after the agent has
      // gone. Stop it before the worktree is committed and removed, or every
      // task leaves one behind watching a directory that no longer exists.
      if (codeGraph) await stopIndexDaemon(rundir);

      /**
       * Commit the task and read its changes from git.
       *
       * For an isolated task this REPLACES the before/after snapshot the agent
       * run made: that compared two `git status` readings, which is the best
       * available in a tree other agents share, and here is simply less exact
       * than asking git what the branch changed.
       *
       * Done for a failed task too — its partial work is kept on the branch. If
       * the commit itself fails, the task did not produce a result anyone can
       * merge, so it is reported as failed whatever the agent said.
       */
      if (workspace && request.isolation) {
        try {
          const result = await finishTaskWorkspace(workspace, {
            message:
              `${commitSubject(request.isolation.taskCode, request.isolation.title)}\n\n` +
              `Run: ${request.isolation.runId}\n` +
              `Session: ${session.devpilotSessionId}\n` +
              (outcome.success ? '' : 'The agent did not finish this task; this is what it left.\n'),
          });
          outcome.filesModified = result.filesModified;
          outcome.filesCreated = result.filesCreated;
          outcome.filesDeleted = result.filesDeleted;
          outcome.commitSha = result.commitSha;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          outcome.success = false;
          outcome.error = outcome.error ? `${outcome.error}\n${message}` : message;
          outcome.filesModified = [];
          outcome.filesCreated = [];
          outcome.filesDeleted = [];
          outcome.commitSha = undefined;
        }
      }

      session.terminal = true;
      session.status = outcome.success ? 'complete' : 'error';
      session.progressPercent = outcome.success ? 100 : session.progressPercent;
      session.currentStep = outcome.success ? 'complete' : 'failed';
      session.filesModified = outcome.filesModified;
      session.tokensUsed = outcome.tokensUsed;
      session.message = outcome.summary;

      this.config.log(
        `[${session.externalSessionId}] ${outcome.success ? 'complete' : 'FAILED'} — ` +
          `${outcome.filesModified.length} modified, ${outcome.filesCreated.length} created, ` +
          `$${outcome.costUsd.toFixed(4)}, ${outcome.durationMinutes}m`
      );

      await sendCompletion(
        callbackUrl,
        {
          sessionId: session.devpilotSessionId,
          success: outcome.success,
          commitSha: outcome.commitSha,
          branch: workspace?.branch,
          baseSha: workspace?.baseSha,
          filesModified: outcome.filesModified,
          filesCreated: outcome.filesCreated,
          filesDeleted: outcome.filesDeleted,
          summary: outcome.summary,
          tokensUsed: outcome.tokensUsed,
          costUsd: outcome.costUsd,
          durationMinutes: outcome.durationMinutes,
          error: outcome.error,
          telemetry: session.telemetry,
          metadata: request.metadata,
        },
        callbackToken,
        this.config.log
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.config.log(`[${session.externalSessionId}] runner error: ${message}`);

      session.terminal = true;
      session.status = 'error';

      // Still report. A wave task with no completion callback is stuck forever.
      await sendCompletion(
        callbackUrl,
        {
          sessionId: session.devpilotSessionId,
          success: false,
          filesModified: [],
          filesCreated: [],
          filesDeleted: [],
          summary: 'The session runner failed before the agent could report.',
          tokensUsed: 0,
          costUsd: 0,
          durationMinutes: (Date.now() - session.startedAt) / 60_000,
          error: message,
          metadata: request.metadata,
        },
        callbackToken,
        this.config.log
      ).catch(() => undefined);
    }
  }

  private async handleCreate(req: IncomingMessage, res: ServerResponse): Promise<void> {
    let body: CreateSessionRequest;
    try {
      body = (await readBody(req)) as CreateSessionRequest;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'invalid JSON';
      return json(res, 400, { error: 'INVALID_PAYLOAD', message });
    }

    if (!body?.sessionId || !body?.repo || !body?.prompt || !body?.callbackUrl) {
      return json(res, 400, {
        error: 'INVALID_PAYLOAD',
        message: 'sessionId, repo, prompt and callbackUrl are required',
      });
    }

    // §7.1 idempotency: re-POSTing a sessionId must not start a second agent.
    // Returns 200 with the existing id — a duplicate dispatch after a DevPilot
    // restart is normal, not an error.
    const existing = this.byDevpilotId.get(body.sessionId);
    if (existing) {
      const session = this.sessions.get(existing);
      return json(res, 200, {
        externalSessionId: existing,
        status: session?.status ?? 'running',
        createdAt: session?.createdAt,
        idempotent: true,
      });
    }

    if (this.activeCount >= this.config.maxConcurrent) {
      return json(res, 429, { error: 'CAPACITY', retryAfterSeconds: 60 });
    }

    const { workdir, error } = this.resolveWorkdir(body.repo);
    if (!workdir) {
      this.config.log(`create rejected: ${error}`);
      return json(res, 400, { error: 'REPO_NOT_FOUND', message: error });
    }

    /**
     * Refuse an isolation request that cannot be honoured, now, while the
     * dispatcher is still listening. Creating the worktree happens after the
     * response (it can be slow), but whether it is possible at all is known
     * here, and a 400 with the reason is kinder than a 201 and a failure.
     */
    if (body.isolation !== undefined) {
      const refusal = await this.isolationRefusal(body, workdir);
      if (refusal) {
        this.config.log(`create rejected: ${refusal}`);
        return json(res, 400, { error: 'ISOLATION_UNAVAILABLE', message: refusal });
      }
    }

    const externalSessionId = `run_${randomUUID()}`;
    const session: RunnerSession = {
      externalSessionId,
      devpilotSessionId: body.sessionId,
      repo: body.repo,
      workdir,
      status: 'queued',
      progressPercent: 0,
      filesModified: [],
      tokensUsed: 0,
      startedAt: Date.now(),
      createdAt: new Date().toISOString(),
      terminal: false,
    };

    this.sessions.set(externalSessionId, session);
    this.byDevpilotId.set(body.sessionId, externalSessionId);

    // Logs that a shared session is attached, NEVER the link — it carries the
    // session key and runner logs are routinely pasted into bug reports.
    this.config.log(
      `dispatch ${body.sessionId} -> ${externalSessionId} (${body.repo} @ ${workdir}, ` +
        `model=${body.model ?? 'default'}${body.sessionLink ? ', shared-session' : ''})`
    );

    // Respond before the agent runs. §7.1 is create-and-return; the adapter
    // treats 201 as accepted and waits for callbacks.
    json(res, 201, { externalSessionId, status: 'queued', createdAt: session.createdAt });

    void this.execute(session, body);
  }

  /** Why an isolation request cannot be honoured, or null if it can. */
  private async isolationRefusal(body: CreateSessionRequest, workdir: string): Promise<string | null> {
    const isolation = body.isolation;
    if (
      !isolation ||
      typeof isolation.runId !== 'string' ||
      typeof isolation.taskCode !== 'string' ||
      !isolation.runId ||
      !isolation.taskCode
    ) {
      return 'isolation needs a runId and a taskCode';
    }
    // A resumed conversation belongs to the directory it was started in:
    // `claude --resume` looks for it there, and would not find it in a new tree.
    if (body.resumeSessionId) {
      return 'a resumed session runs where its conversation lives and cannot be isolated';
    }
    try {
      refSafe(isolation.runId);
      refSafe(isolation.taskCode);
      await checkIsolatable(workdir);
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
    return null;
  }

  /**
   * `POST /v1/integrate` — merge a wave's task branches into the run branch.
   *
   * Answers when the merge is done rather than calling back: it is a few ref
   * updates, and the dispatcher needs the result (the new head, and which
   * tasks conflicted) before it can decide what the next wave starts from.
   */
  private async handleIntegrate(req: IncomingMessage, res: ServerResponse): Promise<void> {
    let body: IntegrateRequest;
    try {
      body = (await readBody(req)) as IntegrateRequest;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'invalid JSON';
      return json(res, 400, { error: 'INVALID_PAYLOAD', message });
    }

    if (
      !body?.repo ||
      typeof body.runId !== 'string' ||
      !body.runId ||
      !Array.isArray(body.taskCodes) ||
      body.taskCodes.some((code) => typeof code !== 'string' || !code)
    ) {
      return json(res, 400, {
        error: 'INVALID_PAYLOAD',
        message: 'repo, runId and taskCodes are required',
      });
    }

    const { workdir, error } = this.resolveWorkdir(body.repo);
    if (!workdir) return json(res, 400, { error: 'REPO_NOT_FOUND', message: error });

    try {
      const result = await integrateRun(
        workdir,
        { runId: body.runId, taskCodes: body.taskCodes },
        this.config.isolation
      );
      this.config.log(
        `integrate ${result.runBranch}: ${result.merged.length} merged, ` +
          `${result.conflicts.length} conflicted, ${result.missing.length} missing ` +
          `-> ${result.headSha.slice(0, 8)}`
      );
      return json(res, 200, result);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.config.log(`integrate failed: ${message}`);
      if (!(error instanceof IsolationError)) return json(res, 500, { error: 'INTERNAL', message });

      // The dispatcher branches on the code; the status is for everything else.
      const status =
        error.code === 'RUN_BRANCH_MISSING'
          ? 404
          : error.code === 'RUN_BRANCH_CHECKED_OUT' || error.code === 'RUN_BRANCH_MOVED'
            ? 409
            : error.code === 'GIT_FAILED'
              ? 500
              : 400;
      return json(res, status, { error: error.code, message });
    }
  }

  /**
   * `POST /v1/graph/dependents` and `POST /v1/graph/affected-tests`.
   *
   * The cockpit plans the work but does not know where a repository is checked
   * out; this runner does. So the planner asks here which files depend on the
   * files a task will change, and gets an answer read straight from the index
   * — no model, no agent, a few milliseconds.
   *
   * "No index" is an ordinary answer, `{ available: false, reason }` with a
   * 200: the caller plans without the graph, exactly as it did before.
   */
  private async handleGraph(req: IncomingMessage, res: ServerResponse, kind: 'dependents' | 'affected-tests'): Promise<void> {
    let body: { repo?: unknown; files?: unknown; depth?: unknown; limit?: unknown };
    try {
      body = (await readBody(req)) as typeof body;
    } catch (error) {
      return json(res, 400, { error: 'INVALID_PAYLOAD', message: error instanceof Error ? error.message : 'invalid JSON' });
    }
    if (
      typeof body?.repo !== 'string' ||
      !Array.isArray(body.files) ||
      body.files.length > 2_000 ||
      body.files.some((f) => typeof f !== 'string' || !f || f.length > 500)
    ) {
      return json(res, 400, { error: 'INVALID_PAYLOAD', message: 'repo and files (at most 2000 paths) are required' });
    }

    const { workdir, error } = this.resolveWorkdir(body.repo);
    if (!workdir) return json(res, 200, { available: false, reason: error });
    if (!hasIndex(workdir)) {
      return json(res, 200, {
        available: false,
        reason: `No code graph index for ${body.repo}. Run \`devpilot graph enable\` in its checkout to build one.`,
      });
    }

    const files = body.files as string[];
    if (kind === 'dependents') {
      const depth = typeof body.depth === 'number' ? body.depth : undefined;
      const limit = typeof body.limit === 'number' ? body.limit : undefined;
      const result = graph.dependentsOf(workdir, files, { depth, limit });
      const status = graph.readGraphStatus(workdir);
      return json(res, 200, {
        ...result,
        indexedAt: status.indexedAt ? new Date(status.indexedAt).toISOString() : null,
      });
    }
    return json(res, 200, graph.affectedTests(workdir, files));
  }

  private handleGet(res: ServerResponse, externalSessionId: string): void {
    const session = this.sessions.get(externalSessionId);
    if (!session) return json(res, 404, { error: 'NOT_FOUND' });

    json(res, 200, {
      status: session.status,
      progressPercent: session.progressPercent,
      currentStep: session.currentStep,
      message: session.message,
      filesModified: session.filesModified,
      tokensUsed: session.tokensUsed,
      branch: session.branch,
    });
  }

  private async handleMessages(
    req: IncomingMessage,
    res: ServerResponse,
    externalSessionId: string
  ): Promise<void> {
    const session = this.sessions.get(externalSessionId);
    if (!session) return json(res, 404, { error: 'NOT_FOUND' });
    if (session.terminal) return json(res, 410, { error: 'TERMINAL' });

    // `claude -p` is one-shot: it reads a prompt on stdin and exits. There is no
    // channel to steer a run already in flight, so this reports honestly rather
    // than accepting the message and dropping it. Steering needs the streaming
    // input mode (`--input-format stream-json`), which is a separate change.
    await readBody(req).catch(() => ({}));
    json(res, 501, {
      error: 'NOT_IMPLEMENTED',
      message: 'Mid-session steering requires streaming input mode; not supported by this runner.',
    });
  }

  private handleStop(res: ServerResponse, externalSessionId: string): void {
    const session = this.sessions.get(externalSessionId);
    if (!session) return json(res, 404, { error: 'NOT_FOUND' });
    if (session.terminal) return json(res, 410, { success: true, message: 'already stopped' });

    session.kill?.();
    this.config.log(`stop requested for ${externalSessionId}`);
    json(res, 202, { success: true, message: 'stopping' });
  }

  private async route(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    const path = url.pathname;

    if (path === '/v1/health' && req.method === 'GET') {
      return json(res, 200, {
        status: 'healthy',
        version: VERSION,
        activeSessions: this.activeCount,
        // How many agents this runner will run at once. It is the fleet's
        // capacity as a fact rather than a setting somebody typed into the
        // cockpit, and the score's utilization dimension is a ratio against it.
        maxConcurrent: this.config.maxConcurrent,
        capabilities: CAPABILITIES,
      });
    }

    if (!this.authorized(req)) return json(res, 401, { error: 'UNAUTHORIZED' });

    if (path === '/v1/sessions' && req.method === 'POST') {
      return this.handleCreate(req, res);
    }

    if (path === '/v1/integrate' && req.method === 'POST') {
      return this.handleIntegrate(req, res);
    }

    if (path === '/v1/graph/dependents' && req.method === 'POST') {
      return this.handleGraph(req, res, 'dependents');
    }
    if (path === '/v1/graph/affected-tests' && req.method === 'POST') {
      return this.handleGraph(req, res, 'affected-tests');
    }

    const match = path.match(/^\/v1\/sessions\/([^/]+)(\/messages|\/stop)?$/);
    if (match) {
      const [, id, suffix] = match;
      if (!suffix && req.method === 'GET') return this.handleGet(res, id);
      if (suffix === '/messages' && req.method === 'POST') return this.handleMessages(req, res, id);
      if (suffix === '/stop' && req.method === 'POST') return this.handleStop(res, id);
      return json(res, 405, { error: 'METHOD_NOT_ALLOWED' });
    }

    json(res, 404, { error: 'NOT_FOUND' });
  }

  start(): Promise<void> {
    return new Promise((resolvePromise, reject) => {
      this.server = createServer((req, res) => {
        this.route(req, res).catch((error) => {
          const message = error instanceof Error ? error.message : String(error);
          this.config.log(`unhandled: ${message}`);
          if (!res.headersSent) json(res, 500, { error: 'INTERNAL', message });
        });
      });

      this.server.on('error', reject);
      this.server.listen(this.config.port, this.config.host, () => resolvePromise());
    });
  }

  async stop(): Promise<void> {
    for (const session of this.sessions.values()) {
      if (!session.terminal) session.kill?.();
    }
    await new Promise<void>((resolvePromise) => {
      if (!this.server) return resolvePromise();
      this.server.close(() => resolvePromise());
    });
  }
}
