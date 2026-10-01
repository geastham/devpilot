import { execFile } from 'child_process';
import { createHash } from 'crypto';
import { existsSync, mkdirSync, realpathSync, rmSync } from 'fs';
import { homedir } from 'os';
import { basename, dirname, join } from 'path';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

/**
 * A working tree and a branch per task, and a merge per wave.
 *
 * ## What this replaces
 *
 * Every agent in a wave used to be started in the same directory: the
 * operator's own checkout. Nothing separated them. The plan gave parallel tasks
 * different files and the prompt told each agent it held an "exclusive lock",
 * but no lock existed — an agent that ran the formatter, regenerated a lockfile
 * or fixed an import in a file it had not been given wrote straight over a
 * sibling's work, and whichever finished last won. Nothing was committed, so a
 * finished run was one large uncommitted diff in the operator's checkout with
 * no record of which task had produced which part of it, and the "files
 * changed" a task reported came from comparing two `git status` snapshots of a
 * tree four agents were writing to at once.
 *
 * ## What happens instead
 *
 *   devpilot/<run>/run            the run branch: everything merged so far
 *   devpilot/<run>/task-<code>    one branch per task, cut from the run branch
 *
 * A task runs in its own `git worktree` on its own branch. When it ends, the
 * runner commits whatever is in that directory, reads the task's changes from
 * git (base → head, exact) and removes the directory. When a wave ends, the
 * dispatcher asks the runner to merge the wave's task branches into the run
 * branch; the next wave's tasks are cut from the result, so they start with
 * their predecessors' work actually present rather than described.
 *
 * Two tasks that changed the same lines now produce a merge conflict that names
 * the files, instead of one silently overwriting the other.
 *
 * ## What it does not do
 *
 * - It never touches the operator's checkout: no checkout, no stash, no reset.
 *   Their branch, index and uncommitted work are exactly as they left them. The
 *   cost of that is the obvious one — a run starts from the checkout's HEAD
 *   COMMIT, so work the operator has not committed is not part of it.
 * - It never pushes, and never opens a pull request. The run branch is local
 *   until a person decides otherwise.
 * - It does not delete branches. A failed attempt is renamed, not discarded.
 *
 * Git is driven through `execFile` — no shell, so a task code or run id from a
 * dispatch cannot become a command. Both are also reduced to ref-safe
 * characters before they are used in a branch name or a path.
 */

/** What a dispatch sends to ask for an isolated task. */
export interface IsolationRequest {
  /** Groups the tasks of one run. The wave plan's id. */
  runId: string;
  /** The task within it, e.g. `2.1`. */
  taskCode: string;
}

export interface IsolationConfig {
  /** Where task worktrees are created. Defaults to `~/.devpilot/worktrees`. */
  worktreeRoot?: string;
  /**
   * A shell command run in each new worktree before the agent starts.
   *
   * A worktree is a fresh checkout: it has the tracked files and nothing else.
   * No `node_modules`, no `.env`, no build output. For most repos an agent can
   * read and edit without them and cannot run the tests. This is the operator's
   * place to put that right (`pnpm install --offline`, `cp ../.env .`), and it
   * is the operator's because it runs a shell on their machine — a dispatch
   * cannot set it.
   */
  setupCommand?: string;
  /** Wall-clock cap on the setup command. */
  setupTimeoutMs?: number;
}

/** A task's working tree, between `prepare` and `finish`. */
export interface TaskWorkspace {
  /** The operator's checkout the worktree was cut from. */
  repoDir: string;
  /** Where the agent runs. */
  dir: string;
  branch: string;
  runBranch: string;
  /** The commit the task started from: the run branch's head at the time. */
  baseSha: string;
  taskCode: string;
}

export interface TaskResult {
  /** The task branch's head. Equal to `baseSha` when the task changed nothing. */
  commitSha: string;
  /** False when the task left the tree exactly as it found it. */
  changed: boolean;
  filesModified: string[];
  filesCreated: string[];
  filesDeleted: string[];
}

export interface IntegrationRequest {
  runId: string;
  /** Merged in this order. */
  taskCodes: string[];
}

export interface IntegrationResult {
  runBranch: string;
  /** The run branch's head after the tasks that could be merged were. */
  headSha: string;
  merged: { taskCode: string; branch: string; commitSha: string; alreadyMerged: boolean }[];
  /** Tasks whose branch did not merge cleanly. The run branch does not contain them. */
  conflicts: { taskCode: string; branch: string; files: string[] }[];
  /** Tasks with no branch at all — never isolated, or never dispatched here. */
  missing: string[];
}

/** A failure of isolation itself, as opposed to a failure of the agent. */
export class IsolationError extends Error {
  constructor(
    message: string,
    /** Stable, for a caller that wants to branch on the cause. */
    readonly code:
      | 'NOT_A_REPOSITORY'
      | 'NO_COMMITS'
      | 'INVALID_NAME'
      | 'RUN_BRANCH_CHECKED_OUT'
      | 'RUN_BRANCH_MISSING'
      | 'RUN_BRANCH_MOVED'
      | 'SETUP_FAILED'
      | 'GIT_FAILED'
  ) {
    super(message);
    this.name = 'IsolationError';
  }
}

const GIT_TIMEOUT_MS = 120_000;
const DEFAULT_SETUP_TIMEOUT_MS = 10 * 60_000;

/**
 * The identity a runner commit uses when the repo has none configured.
 *
 * A commit needs an author, and a fresh machine or a CI box often has neither
 * `user.name` nor `user.email`. Failing the task there would lose the agent's
 * work to a missing config line. A configured identity always wins.
 */
const FALLBACK_IDENTITY = ['-c', 'user.name=DevPilot', '-c', 'user.email=devpilot@localhost'];

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync('git', args, {
    cwd,
    maxBuffer: 32 * 1024 * 1024,
    timeout: GIT_TIMEOUT_MS,
    // A hook or credential helper that prompts would hang a process with no
    // terminal. Nothing here should ever need to ask.
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  });
  return stdout;
}

/** `git` for a question: true when the command exits zero. */
async function gitOk(cwd: string, args: string[]): Promise<boolean> {
  try {
    await git(cwd, args);
    return true;
  } catch {
    return false;
  }
}

function gitMessage(error: unknown): string {
  const e = error as { stderr?: string; message?: string };
  return (e.stderr || e.message || String(error)).trim().slice(-1500);
}

/**
 * Reduce an id to characters that are safe in a ref name AND a path segment.
 *
 * Git forbids a good deal in ref names (`..`, `~`, `^`, `:`, a trailing `.lock`,
 * a leading `-`, control characters); a path forbids `/`. Rather than encode
 * each rule, keep the characters every rule allows and replace the rest.
 */
export function refSafe(value: string): string {
  const cleaned = String(value)
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/\.{2,}/g, '.')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, 80)
    .replace(/[-.]+$/g, '');
  if (!cleaned || cleaned.toLowerCase().endsWith('.lock')) {
    throw new IsolationError(`'${value}' cannot be used in a branch name`, 'INVALID_NAME');
  }
  return cleaned;
}

/**
 * `devpilot/<run>/run`, not `devpilot/run-<run>`.
 *
 * Refs are files: a branch named `devpilot/x` and one named `devpilot/x/task-1`
 * cannot both exist, because the first is a file where the second needs a
 * directory. Keeping the run branch and its task branches as siblings under one
 * directory avoids that.
 */
export function runBranchName(runId: string): string {
  return `devpilot/${refSafe(runId)}/run`;
}

export function taskBranchName(runId: string, taskCode: string): string {
  return `devpilot/${refSafe(runId)}/task-${refSafe(taskCode)}`;
}

function worktreeRoot(config: IsolationConfig): string {
  return config.worktreeRoot ?? join(homedir(), '.devpilot', 'worktrees');
}

/**
 * A directory name for a checkout: readable, and unique per path so two
 * checkouts called `api` do not share a worktree directory.
 */
function repoKey(repoDir: string): string {
  let real = repoDir;
  try {
    real = realpathSync(repoDir);
  } catch {
    // Use the path as given.
  }
  const hash = createHash('sha1').update(real).digest('hex').slice(0, 8);
  return `${refSafe(basename(real) || 'repo')}-${hash}`;
}

/**
 * One git operation at a time per repository.
 *
 * Worktrees share one object database and one set of refs. Git takes its own
 * locks, but it does not wait for them: two `git worktree add` calls that
 * overlap fail with "could not lock" rather than queueing, and a wave starts
 * all of its tasks at the same instant. The work inside the lock is a handful
 * of ref updates, so serialising it costs nothing next to an agent run.
 *
 * Per process. Two runners pointed at one checkout are not protected from each
 * other, which is one reason not to do that.
 */
const repoLocks = new Map<string, Promise<unknown>>();

function withRepoLock<T>(repoDir: string, fn: () => Promise<T>): Promise<T> {
  const previous = repoLocks.get(repoDir) ?? Promise.resolve();
  const next = previous.then(fn, fn);
  repoLocks.set(
    repoDir,
    next.catch(() => undefined)
  );
  return next;
}

async function revParse(cwd: string, ref: string): Promise<string | null> {
  try {
    return (await git(cwd, ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`])).trim() || null;
  } catch {
    return null;
  }
}

async function identityArgs(cwd: string): Promise<string[]> {
  const hasName = await gitOk(cwd, ['config', 'user.name']);
  const hasEmail = await gitOk(cwd, ['config', 'user.email']);
  return hasName && hasEmail ? [] : FALLBACK_IDENTITY;
}

/** Remove a worktree and its directory, whatever state either is in. */
async function removeWorktree(repoDir: string, dir: string): Promise<void> {
  await git(repoDir, ['worktree', 'remove', '--force', dir]).catch(() => undefined);
  rmSync(dir, { recursive: true, force: true });
  await git(repoDir, ['worktree', 'prune']).catch(() => undefined);
}

/**
 * Can `repoDir` be isolated at all? Cheap enough to run before answering a
 * dispatch, so a repo that cannot be is refused at the door rather than
 * accepted and failed a moment later.
 */
export async function checkIsolatable(repoDir: string): Promise<void> {
  if (!(await gitOk(repoDir, ['rev-parse', '--git-dir']))) {
    throw new IsolationError(
      `${repoDir} is not a git repository, so a task cannot be given its own branch there.`,
      'NOT_A_REPOSITORY'
    );
  }
  if (!(await revParse(repoDir, 'HEAD'))) {
    throw new IsolationError(
      `${repoDir} has no commits yet. A task branch needs a commit to start from.`,
      'NO_COMMITS'
    );
  }
}

/**
 * Create the task's branch and working tree.
 *
 * The run branch is created the first time any task of the run asks for it, at
 * the checkout's HEAD. Every later task of the run — in this wave or a later
 * one — is cut from wherever the run branch is by then.
 */
export async function prepareTaskWorkspace(
  repoDir: string,
  request: IsolationRequest,
  config: IsolationConfig = {}
): Promise<TaskWorkspace> {
  const runBranch = runBranchName(request.runId);
  const branch = taskBranchName(request.runId, request.taskCode);
  const dir = join(
    worktreeRoot(config),
    repoKey(repoDir),
    refSafe(request.runId),
    `task-${refSafe(request.taskCode)}`
  );

  const workspace = await withRepoLock(repoDir, async (): Promise<TaskWorkspace> => {
    await checkIsolatable(repoDir);

    try {
      if (!(await revParse(repoDir, `refs/heads/${runBranch}`))) {
        await git(repoDir, ['branch', runBranch, 'HEAD']);
      }
      const baseSha = (await revParse(repoDir, `refs/heads/${runBranch}`))!;

      // A directory left behind by a runner that was killed mid-task. Its
      // branch is dealt with below; the directory itself is just in the way.
      if (existsSync(dir)) await removeWorktree(repoDir, dir);

      /**
       * The branch already exists: this is a second attempt at the task.
       *
       * The first attempt is kept under another name rather than overwritten.
       * It failed, but it is still what an agent did, and the person deciding
       * what went wrong may want to read it. The new attempt starts from the
       * run branch as it is NOW — which, if the first attempt failed because
       * its branch would not merge, includes the work it collided with.
       */
      const previous = await revParse(repoDir, `refs/heads/${branch}`);
      if (previous) {
        let kept = `${branch}-attempt-${previous.slice(0, 8)}`;
        for (let n = 2; await revParse(repoDir, `refs/heads/${kept}`); n++) {
          kept = `${branch}-attempt-${previous.slice(0, 8)}-${n}`;
        }
        await git(repoDir, ['branch', '-m', branch, kept]);
      }

      mkdirSync(dirname(dir), { recursive: true });
      await git(repoDir, ['worktree', 'add', '-b', branch, dir, runBranch]);

      return { repoDir, dir, branch, runBranch, baseSha, taskCode: request.taskCode };
    } catch (error) {
      if (error instanceof IsolationError) throw error;
      throw new IsolationError(
        `Could not create a working tree for task ${request.taskCode}: ${gitMessage(error)}`,
        'GIT_FAILED'
      );
    }
  });

  // Outside the lock: an install can take minutes, and the rest of the wave
  // should not queue behind it.
  if (config.setupCommand) {
    try {
      await execFileAsync('/bin/sh', ['-c', config.setupCommand], {
        cwd: workspace.dir,
        timeout: config.setupTimeoutMs ?? DEFAULT_SETUP_TIMEOUT_MS,
        maxBuffer: 32 * 1024 * 1024,
      });
    } catch (error) {
      // The branch has nothing on it yet; leave no trace of the attempt.
      await withRepoLock(repoDir, async () => {
        await removeWorktree(repoDir, workspace.dir);
        await git(repoDir, ['branch', '-D', workspace.branch]).catch(() => undefined);
      });
      throw new IsolationError(
        `The worktree setup command failed for task ${request.taskCode}: ${gitMessage(error)}`,
        'SETUP_FAILED'
      );
    }
  }

  return workspace;
}

/**
 * Commit what the task left, read what it changed, and remove its directory.
 *
 * Called whether or not the agent succeeded. A failed task's partial work is
 * committed too: it costs nothing, and the alternative is deleting the only
 * evidence of what the agent was doing when it failed.
 */
export async function finishTaskWorkspace(
  workspace: TaskWorkspace,
  options: { message: string }
): Promise<TaskResult> {
  const { repoDir, dir, branch, baseSha } = workspace;

  return withRepoLock(repoDir, async (): Promise<TaskResult> => {
    let commitSha: string;

    try {
      await git(dir, ['add', '-A']);

      if ((await git(dir, ['status', '--porcelain'])).trim()) {
        /**
         * `--no-verify`: the repo's commit hooks are not run.
         *
         * This commit is the runner writing down what an agent left, on a
         * branch nobody has reviewed. A pre-commit hook here would fail for
         * reasons that have nothing to do with the work — a fresh worktree has
         * no `node_modules` for the linter the hook calls — and a hook that
         * fails loses the task. The hooks get their say when a person brings
         * the run branch into their own.
         */
        await git(dir, [
          ...(await identityArgs(dir)),
          'commit',
          '--no-verify',
          '--no-gpg-sign',
          '-m',
          options.message,
        ]);
      }

      /**
       * Whatever HEAD is here is the task's result, even if the agent committed
       * for itself or — against instructions — moved off the branch it was
       * given. Pointing the task branch at it means the merge step finds the
       * work under the name it expects. (If the agent did move off, the branch
       * is no longer checked out here, so moving it is safe.)
       */
      commitSha = (await revParse(dir, 'HEAD'))!;
      if ((await revParse(repoDir, `refs/heads/${branch}`)) !== commitSha) {
        await git(repoDir, ['update-ref', `refs/heads/${branch}`, commitSha]);
      }
    } catch (error) {
      // The directory is deliberately left where it is: it holds work that
      // could not be committed, and it is the only copy.
      throw new IsolationError(
        `Could not commit task ${workspace.taskCode}'s work. It is still in ${dir}: ${gitMessage(error)}`,
        'GIT_FAILED'
      );
    }

    try {
      const filesModified: string[] = [];
      const filesCreated: string[] = [];
      const filesDeleted: string[] = [];

      // base → head, from git. Exact, and unaffected by what any other task
      // was doing at the time. `-z` keeps a path with a newline or a quote
      // intact; `--no-renames` reports a move as a delete and a create, which
      // is what the callback's three lists can express.
      const diff = await git(repoDir, [
        'diff',
        '--name-status',
        '--no-renames',
        '-z',
        baseSha,
        commitSha,
      ]);
      const fields = diff.split('\0');
      for (let i = 0; i + 1 < fields.length; i += 2) {
        const status = fields[i];
        const path = fields[i + 1];
        if (!path) continue;
        if (status.startsWith('A')) filesCreated.push(path);
        else if (status.startsWith('D')) filesDeleted.push(path);
        else filesModified.push(path);
      }

      return {
        commitSha,
        changed: commitSha !== baseSha,
        filesModified,
        filesCreated,
        filesDeleted,
      };
    } catch (error) {
      throw new IsolationError(
        `Task ${workspace.taskCode}'s work is committed on ${branch}, but its changes could not be read back: ${gitMessage(error)}`,
        'GIT_FAILED'
      );
    } finally {
      // The work is on the branch, so the directory has served its purpose.
      // Without `--force` git refuses a tree that still has uncommitted
      // changes, which is the check wanted here: nothing is deleted that is
      // not also in a commit.
      if (await gitOk(repoDir, ['worktree', 'remove', dir])) {
        rmSync(dir, { recursive: true, force: true });
      }
    }
  });
}

/** The path of the worktree a branch is checked out in, if any. */
async function checkedOutAt(repoDir: string, branch: string): Promise<string | null> {
  const out = await git(repoDir, ['worktree', 'list', '--porcelain']);
  let current: string | null = null;
  for (const line of out.split('\n')) {
    if (line.startsWith('worktree ')) current = line.slice('worktree '.length);
    else if (line === `branch refs/heads/${branch}`) return current;
  }
  return null;
}

/**
 * Merge a wave's task branches into the run branch.
 *
 * Each branch is merged on its own. One that conflicts is backed out and
 * reported with the files it conflicted on; the rest still go in. The caller
 * decides what a conflict means — the useful thing it can do is run the task
 * again, because a second attempt is cut from a run branch that now contains
 * the work the first one collided with.
 *
 * Safe to call twice: a branch already contained in the run branch is reported
 * as merged and nothing is done.
 *
 * The merge happens in a throwaway detached worktree and the run branch is then
 * moved to the result. That way the run branch is never checked out by this
 * module, so the operator can check it out themselves between waves — almost.
 * If they have it checked out when a merge is due, moving it underneath them
 * would leave their checkout looking like they had reverted the merge, so this
 * refuses and says where it is checked out.
 */
export async function integrateRun(
  repoDir: string,
  request: IntegrationRequest,
  config: IsolationConfig = {}
): Promise<IntegrationResult> {
  const runBranch = runBranchName(request.runId);
  const dir = join(worktreeRoot(config), repoKey(repoDir), refSafe(request.runId), '_integrate');

  return withRepoLock(repoDir, async (): Promise<IntegrationResult> => {
    await checkIsolatable(repoDir);

    const startSha = await revParse(repoDir, `refs/heads/${runBranch}`);
    if (!startSha) {
      throw new IsolationError(
        `There is no run branch ${runBranch} in ${repoDir}. No task of this run was isolated here.`,
        'RUN_BRANCH_MISSING'
      );
    }

    const heldAt = await checkedOutAt(repoDir, runBranch);
    if (heldAt) {
      throw new IsolationError(
        `${runBranch} is checked out in ${heldAt}. Switch that checkout to another branch ` +
          `so the wave's work can be merged into it.`,
        'RUN_BRANCH_CHECKED_OUT'
      );
    }

    const result: IntegrationResult = {
      runBranch,
      headSha: startSha,
      merged: [],
      conflicts: [],
      missing: [],
    };

    if (existsSync(dir)) await removeWorktree(repoDir, dir);
    mkdirSync(dirname(dir), { recursive: true });

    try {
      await git(repoDir, ['worktree', 'add', '--detach', dir, runBranch]);
      const identity = await identityArgs(dir);

      for (const taskCode of request.taskCodes) {
        const branch = taskBranchName(request.runId, taskCode);
        const commitSha = await revParse(repoDir, `refs/heads/${branch}`);
        if (!commitSha) {
          result.missing.push(taskCode);
          continue;
        }

        if (await gitOk(dir, ['merge-base', '--is-ancestor', commitSha, 'HEAD'])) {
          result.merged.push({ taskCode, branch, commitSha, alreadyMerged: true });
          continue;
        }

        try {
          // `--no-ff` so every task is one merge commit on the run branch: the
          // history then reads as the plan did, task by task.
          await git(dir, [
            ...identity,
            'merge',
            '--no-ff',
            '--no-verify',
            '--no-gpg-sign',
            '-m',
            `devpilot: merge task ${taskCode}`,
            commitSha,
          ]);
          result.merged.push({ taskCode, branch, commitSha, alreadyMerged: false });
        } catch (error) {
          const unmerged = await git(dir, ['diff', '--name-only', '--diff-filter=U', '-z']).catch(
            () => ''
          );
          const files = unmerged.split('\0').filter(Boolean);
          // Back to the last good state before trying the next branch.
          await git(dir, ['merge', '--abort']).catch(() => undefined);
          await git(dir, ['reset', '--hard', '--quiet']).catch(() => undefined);

          // No conflicted files means the merge failed for some other reason,
          // and calling that a conflict would send someone looking for one.
          if (files.length === 0) {
            throw new IsolationError(
              `Merging task ${taskCode} into ${runBranch} failed: ${gitMessage(error)}`,
              'GIT_FAILED'
            );
          }
          result.conflicts.push({ taskCode, branch, files });
        }
      }

      const headSha = (await revParse(dir, 'HEAD'))!;
      if (headSha !== startSha) {
        try {
          // Compare-and-swap: only if the branch is still where this started.
          await git(repoDir, ['update-ref', `refs/heads/${runBranch}`, headSha, startSha]);
        } catch (error) {
          throw new IsolationError(
            `${runBranch} changed while the wave was being merged; nothing was written. ${gitMessage(error)}`,
            'RUN_BRANCH_MOVED'
          );
        }
      }
      result.headSha = headSha;
      return result;
    } catch (error) {
      if (error instanceof IsolationError) throw error;
      throw new IsolationError(
        `Could not merge into ${runBranch}: ${gitMessage(error)}`,
        'GIT_FAILED'
      );
    } finally {
      await removeWorktree(repoDir, dir);
    }
  });
}

/**
 * What an agent is told about the directory it has been put in.
 *
 * Written by the runner rather than composed with the rest of the prompt,
 * because only the runner knows it to be true: whether the task was isolated,
 * on which branch, and whether the operator's setup step ran.
 */
export function workspacePreamble(workspace: TaskWorkspace, config: IsolationConfig = {}): string {
  return [
    '# Your workspace',
    '',
    `You are in a git worktree made for this task, on the branch \`${workspace.branch}\`.`,
    'Other tasks in this run each have their own. Nothing you do here reaches theirs,',
    'and nothing they do reaches you, until DevPilot merges the wave.',
    '',
    '- Stay on this branch. Do not switch branches, rebase, push, or open a pull request.',
    '- You do not need to commit. Whatever is in this directory when you finish is',
    '  committed to the branch for you.',
    config.setupCommand
      ? '- This is a fresh checkout that the operator\'s setup step has prepared. If something'
      : '- This is a fresh checkout: it has the tracked files only. Installed dependencies,',
    config.setupCommand
      ? '  a command needs is still missing, say so in your final message rather than'
      : '  local env files and build output from the main checkout are not here. If a command',
    config.setupCommand
      ? '  working around it.'
      : '  fails because of that, say so in your final message rather than working around it.',
    '',
    '---',
    '',
  ].join('\n');
}
