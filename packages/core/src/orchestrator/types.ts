/**
 * Orchestrator bridge type definitions
 * Defines the contract between DevPilot and the external agent-orchestrator
 */

export interface OrchestratorConfig {
  url: string;
  apiKey?: string;
  callbackUrl: string;
  timeout?: number;
}

/**
 * Request sent to orchestrator when dispatching work
 */
export interface DispatchRequest {
  sessionId: string;
  repo: string;
  taskSpec: TaskSpec;
  linearTicketId?: string;
  callbackUrl: string;
  /**
   * Run this session as one task of a run, in its own git worktree, on its own
   * branch. Set by the wave dispatcher for a task of an isolated plan, and by
   * nothing else: a single dispatch from the fleet has no run to belong to.
   *
   * Only the `claude-session` adapter acts on it. The other modes do not
   * isolate, and the dispatcher never sets it for them.
   */
  isolation?: TaskIsolation;
  metadata?: Record<string, unknown>;
}

/** Which run a task belongs to, and which task of it this is. */
export interface TaskIsolation {
  /** Groups the tasks of one run; the runner names the run branch after it. */
  runId: string;
  /** The task within the run, e.g. `2.1`; the runner names the task branch after it. */
  taskCode: string;
  /** One line describing the task, for the commit the runner makes. */
  title?: string;
}

/** `POST /v1/integrate`: merge these tasks' branches into the run branch. */
export interface IntegrateRequest {
  repo: string;
  runId: string;
  /** Merged in this order, each on its own. */
  taskCodes: string[];
}

/** What the runner answers when a merge was carried out. */
export interface IntegrationResult {
  runBranch: string;
  /** The run branch's head after the tasks that could be merged were. */
  headSha: string;
  merged: { taskCode: string; branch: string; commitSha: string; alreadyMerged: boolean }[];
  /** Tasks whose branch did not merge. The run branch does not contain them. */
  conflicts: { taskCode: string; branch: string; files: string[] }[];
  /** Tasks the runner has no branch for. */
  missing: string[];
}

/**
 * The answer to an integrate call.
 *
 * `ok: false` is a failure of the merge itself — the run branch is checked out
 * somewhere, the runner is gone, git refused — as opposed to a task whose
 * branch conflicted, which is a successful answer with `conflicts` in it. The
 * difference matters to the caller: a conflict is one task's problem and that
 * task is retried, while this is nobody's task's fault and ends the run with
 * `message`, which is written for the person who has to act on it.
 */
export type IntegrateOutcome =
  | { ok: true; result: IntegrationResult }
  | { ok: false; code: string; message: string };

/** Whether tasks dispatched now can be isolated, and if not, why not. */
export interface IsolationSupport {
  supported: boolean;
  /** Present when `supported` is false. Recorded on the plan and shown to a person. */
  reason?: string;
}

/**
 * `POST /v1/graph/dependents`: for each file, the files that depend on it,
 * read from the code graph index of the repository's checkout.
 *
 * The runner is asked because it is the only party that knows where a
 * repository is checked out; the cockpit knows a repo by name.
 */
export interface GraphDependentsRequest {
  repo: string;
  /** Repo-relative paths. */
  files: string[];
  /** How many steps of "depends on" to follow. The runner's default is 1, its cap 3. */
  depth?: number;
  /** Per file. The runner's default is 200. */
  limit?: number;
}

/**
 * The answer to a dependents call.
 *
 * `available: false` is an ordinary answer, not an error, and it is the answer
 * in every case where there is nothing to read: the repository has no index,
 * the runner predates the code graph, the runner did not answer, the
 * orchestrator is in a mode with no runner. `reason` says which, in words for
 * a person, because the caller's only use for it is to say why a plan was made
 * without the graph. Nothing may treat it as a failure: a plan is produced
 * either way.
 */
export type GraphDependentsOutcome =
  | {
      available: true;
      /** Under each file as it was asked about. Sorted; never the file itself. */
      byFile: Record<string, string[]>;
      /** True when at least one list was cut at the limit. */
      truncated: boolean;
      /** When the index was last written (ISO-8601), or null when it does not say. Its age, not its accuracy. */
      indexedAt: string | null;
    }
  | { available: false; reason: string };

/** `POST /v1/graph/affected-tests`: the test files reached from these files. */
export interface GraphAffectedTestsRequest {
  repo: string;
  files: string[];
}

/** As `GraphDependentsOutcome`: `available: false` is an answer. */
export type GraphAffectedTestsOutcome =
  | { available: true; tests: string[]; truncated: boolean }
  | { available: false; reason: string };

export interface TaskSpec {
  prompt: string;
  filePaths: string[];
  model: 'haiku' | 'sonnet' | 'opus';
  workstream?: string;
  acceptanceCriteria?: string[];
  constraints?: string[];
  estimatedMinutes?: number;
}

/**
 * Status update received from orchestrator during execution
 */
export interface StatusUpdate {
  sessionId: string;
  status: 'queued' | 'running' | 'waiting' | 'complete' | 'error' | 'cancelled';
  progressPercent: number;
  currentStep?: string;
  currentFile?: string;
  message?: string;
  filesModified?: string[];
  tokensUsed?: number;
  /**
   * Live picture of what the agent is doing, when the runner can supply one.
   *
   * Optional because this contract predates it: a runner built before
   * `stream-json` reports status without telemetry, and the cockpit must keep
   * accepting those rather than treating a missing instrument as an error.
   */
  telemetry?: {
    toolCalls?: number;
    filesTouched?: string[];
    filesRead?: string[];
    commands?: string[];
    lastText?: string;
    lastAction?: { tool: string; path?: string; atMs: number };
    actions?: { tool: string; path?: string; atMs: number }[];
    costUsd?: number;
    tokensIn?: number;
    tokensOut?: number;
    turns?: number;
    elapsedMs?: number;
    idleMs?: number;
  };
  timestamp: string;
}

/**
 * Completion report received when orchestrator finishes a task
 */
export interface CompletionReport {
  sessionId: string;
  success: boolean;
  prUrl?: string;
  /**
   * For an isolated task, the head of its branch. Otherwise the checkout's
   * HEAD when the session ended, which the session may or may not have moved.
   */
  commitSha?: string;
  /** The task's branch. Present only when the task was isolated. */
  branch?: string;
  /** The commit the task's branch was cut from. Present only when isolated. */
  baseSha?: string;
  /**
   * For an isolated task these three are git's diff from `baseSha` to
   * `commitSha` and are exact. Otherwise the runner compares two `git status`
   * readings of a checkout other agents may be writing to.
   */
  filesModified: string[];
  filesCreated: string[];
  filesDeleted: string[];
  summary: string;
  tokensUsed: number;
  costUsd: number;
  durationMinutes: number;
  error?: {
    code: string;
    message: string;
    recoverable: boolean;
  };
  metadata?: Record<string, unknown>;
}

/**
 * Response from orchestrator when dispatch is accepted
 */
export interface DispatchResponse {
  accepted: boolean;
  orchestratorJobId?: string;
  estimatedStartTime?: string;
  queuePosition?: number;
  error?: string;
}

/**
 * Health check response from orchestrator
 */
export interface OrchestratorHealth {
  status: 'healthy' | 'degraded' | 'down';
  version: string;
  activeJobs: number;
  queueLength: number;
  availableWorkers: number;
}
