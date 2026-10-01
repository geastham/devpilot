import type { SessionTelemetry } from './stream-events';
/**
 * Wire types for the local session runner.
 *
 * These mirror `spec/trd/01-TIER1-EXECUTION-LOOP.md` §7.1/§7.2 — the runner is
 * the *other side* of `HttpSessionTransport` in
 * `packages/core/src/orchestrator/claude-session-adapter.ts`, so the shapes here
 * are duplicated deliberately rather than imported from core: the runner is an
 * independent process that must be able to run against a different DevPilot
 * version than the one that built it. Importing core's types would make the two
 * sides move in lockstep, which is exactly what a wire contract exists to avoid.
 */

/** §7.1 `POST /v1/sessions` request body. */
export interface CreateSessionRequest {
  /** DevPilot session id. The idempotency key, and the id echoed in callbacks. */
  sessionId: string;
  repo: string;
  prompt: string;
  model?: 'haiku' | 'sonnet' | 'opus';
  filePaths?: string[];
  acceptanceCriteria?: string[];
  constraints?: string[];
  linearTicketId?: string;
  /** Base URL the session reports to, e.g. http://localhost:3000/api/orchestrator */
  callbackUrl: string;
  /** Echoed back as X-DevPilot-Callback-Token (§7.2). */
  callbackToken?: string;
  environmentId?: string;
  /**
   * Join link for the shared session this dispatch belongs to, including the
   * `#k=` fragment (TRD-15 §3.1).
   *
   * CARRIES THE SESSION KEY. It is never placed in argv, never logged, and
   * never echoed in a response — see `claude-runner.ts` for how it is handed to
   * the agent instead.
   */
  sessionLink?: string;
  /**
   * Continue an existing Claude Code conversation instead of starting a fresh
   * one — TRD 23 §3.4.
   *
   * This is what "take the wheel" is made of. A session DevPilot did not spawn
   * cannot be steered, but a session it RESUMES is one it spawned, so every
   * callback, stream event and plan gate already built applies to it.
   *
   * The uuid is resolved on this machine from an `adoptionKey` and never
   * travels: the hosted plane cannot name a local session (TRD 23 §3.3).
   *
   * Only ever a HELD session. Resuming one that is still being written to
   * would have two processes appending to a single transcript.
   */
  resumeSessionId?: string;
  /**
   * Give this task its own git worktree and branch — see ./isolation.
   *
   * Asked for by the dispatcher, per task, because only the dispatcher knows
   * that a session is one task of a run and which run. Absent, the agent runs
   * in the checkout itself, as it always did: that is right for a single
   * dispatch, and for a resumed session, which must run where its conversation
   * lives.
   */
  isolation?: {
    /** Groups the tasks of one run; names the run branch. */
    runId: string;
    /** The task within the run, e.g. `2.1`; names the task branch. */
    taskCode: string;
    /** One line describing the task, for the commit message. */
    title?: string;
  };
  metadata?: Record<string, unknown>;
}

/** `POST /v1/integrate` request body: merge a wave's task branches. */
export interface IntegrateRequest {
  repo: string;
  runId: string;
  /** Merged in this order. */
  taskCodes: string[];
}

export type RunnerSessionStatus =
  | 'queued'
  | 'running'
  | 'complete'
  | 'error'
  | 'stopped';

/** §7.2 `POST {callbackUrl}/status` body — core's `StatusUpdate`. */
export interface StatusUpdate {
  /**
   * The agent's live telemetry. Optional because the callback contract predates
   * it, and an older cockpit must keep accepting status updates without it.
   */
  telemetry?: SessionTelemetry;
  sessionId: string;
  status: string;
  progressPercent: number;
  currentStep?: string;
  currentFile?: string;
  message?: string;
  filesModified?: string[];
  tokensUsed?: number;
  timestamp: string;
}

/** §7.2 `POST {callbackUrl}/complete` body — core's `CompletionReport`. */
export interface CompletionReport {
  /**
   * The agent's FINAL telemetry. Status reports are throttled, so the last one
   * sent while the agent ran can be seconds short of the end — missing the last
   * files it wrote and the last tokens it spent. This is the complete reading.
   */
  telemetry?: SessionTelemetry;
  sessionId: string;
  success: boolean;
  prUrl?: string;
  /**
   * For an isolated task, the head of its branch. Otherwise the checkout's HEAD
   * when the session ended, which the session may or may not have moved.
   */
  commitSha?: string;
  /** The task's branch. Only present when the task was isolated. */
  branch?: string;
  /** The commit the task's branch was cut from. Only when isolated. */
  baseSha?: string;
  filesModified: string[];
  filesCreated: string[];
  filesDeleted: string[];
  summary: string;
  tokensUsed: number;
  costUsd: number;
  durationMinutes: number;
  error?: string;
  metadata?: Record<string, unknown>;
}

/** In-memory record of one dispatched session. */
export interface RunnerSession {
  /** Live picture of what the agent is doing; see stream-events. */
  telemetry?: SessionTelemetry;
  /** Runner-side id, returned as `externalSessionId`. */
  externalSessionId: string;
  /** DevPilot session id — the correlation key for every callback. */
  devpilotSessionId: string;
  repo: string;
  /** The operator's checkout of `repo`. */
  workdir: string;
  /** The task's branch, once an isolated task has been given one. */
  branch?: string;
  status: RunnerSessionStatus;
  progressPercent: number;
  currentStep?: string;
  message?: string;
  filesModified: string[];
  tokensUsed: number;
  startedAt: number;
  createdAt: string;
  /** Set once terminal, so a second stop/complete is a no-op. */
  terminal: boolean;
  /** Kill handle for `POST /v1/sessions/:id/stop`. */
  kill?: () => void;
}

/** Everything the server needs, injected so tests can drive it. */
export interface RunnerConfig {
  port: number;
  host: string;
  /** Bearer token the dispatcher must present. Unset disables auth. */
  apiKey?: string;
  /** Directory containing checked-out repos. */
  workspace: string;
  /** Explicit `repo -> absolute path` overrides. */
  repoMap: Map<string, string>;
  /** Path to the claude executable. */
  claudePath: string;
  /** `--permission-mode` handed to claude. */
  permissionMode: string;
  /** Max concurrently running sessions before the runner answers 429. */
  maxConcurrent: number;
  /** Wall-clock cap on a single session. */
  timeoutMs: number;
  /**
   * How agents are configured — see ./harness. The OPERATOR's choice, like the
   * permission mode and for the same reason: a dispatch must not be able to
   * change what an agent on someone else's machine is allowed to load.
   */
  harness?: import('./harness').Harness;
  /**
   * Where task worktrees go and how each is prepared — see ./isolation. The
   * OPERATOR's, for the same reason again: the setup step is a shell command.
   */
  isolation?: import('./isolation').IsolationConfig;
  /** Emit a log line. */
  log: (line: string) => void;
}
