import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'http';
import { randomUUID } from 'crypto';
import { existsSync } from 'fs';
import { basename, isAbsolute, resolve } from 'path';
import { runClaudeSession } from './claude-runner';
import { sendCompletion, sendStatus } from './callbacks';
import type {
  CreateSessionRequest,
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

const VERSION = '1.0.0';

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
      session.progressPercent = 5;
      session.currentStep = 'session started';
      this.reportStatus(session, callbackUrl, callbackToken, {
        currentStep: 'session started',
        message: `Claude Code session running in ${session.workdir}`,
      });

      // A heartbeat, not a progress estimate. §7.2 asks for a status at least
      // every 2 minutes while running; `claude -p` reports nothing until it is
      // done, so there is no real percentage to send. It stops short of 90 so
      // the bar never implies the work is nearly over when it may not be.
      const heartbeat = setInterval(() => {
        if (session.terminal) return;
        session.progressPercent = Math.min(90, session.progressPercent + 5);
        this.reportStatus(session, callbackUrl, callbackToken, {
          currentStep: 'working',
          message: 'Session in progress',
        });
      }, 90_000);
      heartbeat.unref();

      const outcome = await runClaudeSession({
        workdir: session.workdir,
        prompt: request.prompt,
        sessionLink: request.sessionLink,
        model: request.model,
        claudePath: this.config.claudePath,
        permissionMode: this.config.permissionMode,
        timeoutMs: this.config.timeoutMs,
        onLog: (line) => this.config.log(`[${session.externalSessionId}] ${line}`),
        onSpawn: (kill) => {
          session.kill = kill;
        },
      });

      clearInterval(heartbeat);

      session.terminal = true;
      session.status = outcome.success ? 'complete' : 'error';
      session.progressPercent = outcome.success ? 100 : session.progressPercent;
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
          filesModified: outcome.filesModified,
          filesCreated: outcome.filesCreated,
          filesDeleted: outcome.filesDeleted,
          summary: outcome.summary,
          tokensUsed: outcome.tokensUsed,
          costUsd: outcome.costUsd,
          durationMinutes: outcome.durationMinutes,
          error: outcome.error,
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
      });
    }

    if (!this.authorized(req)) return json(res, 401, { error: 'UNAUTHORIZED' });

    if (path === '/v1/sessions' && req.method === 'POST') {
      return this.handleCreate(req, res);
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
