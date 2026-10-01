import { Command } from 'commander';
import chalk from 'chalk';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { dirname, join, resolve } from 'path';
import { statuslineDir } from '../utils/statusline-store';

/**
 * `devpilot statusline` — the live line in Claude Code, and its installer.
 *
 * The bare command is what Claude Code runs; it lives in `statusline-fast.ts`
 * and is reached without loading this file. What is here is the part a person
 * runs once: putting the command into Claude Code's settings, and taking it
 * out again.
 *
 * THE ONE RULE OF INSTALLING. Claude Code has a single status line slot and
 * documents no way to add a second line beside an existing one. So a person
 * who already has a status line — a prompt theme, a git segment, something
 * they wrote — would lose it to a naive install, and would find out when it
 * was gone. This never overwrites one. It records the command it found, sets
 * ours to run it first and print its output unchanged, and `uninstall` puts
 * the original back exactly as it was.
 */

/** Claude Code's `statusLine` setting. Other keys are kept as found. */
interface StatusLineSetting {
  type?: string;
  command?: string;
  [key: string]: unknown;
}

interface Previous {
  /** The settings file this was taken from. */
  settingsPath: string;
  /** The setting as it was, or null when there was none. */
  statusLine: StatusLineSetting | null;
  savedAt: string;
}

export interface InstallPaths {
  settingsPath: string;
  /** Where the previous setting is kept — `~/.devpilot/statusline`. */
  storeDir: string;
  /** The command line Claude Code should run. */
  command: string;
}

const MARKER = 'statusline';

/** Is this setting one that `install` wrote? */
function isOurs(setting: StatusLineSetting | null | undefined): boolean {
  const command = setting?.command ?? '';
  return /devpilot(\.js)?["']?\s+statusline\b/.test(command) || /\bdevpilot statusline\b/.test(command);
}

function readSettings(path: string): Record<string, unknown> {
  if (!existsSync(path)) return {};
  const text = readFileSync(path, 'utf8');
  if (!text.trim()) return {};
  // Thrown on purpose: a settings file that does not parse is one this must
  // not rewrite, and the caller says so instead of guessing at its contents.
  return JSON.parse(text) as Record<string, unknown>;
}

function writeSettings(path: string, settings: Record<string, unknown>): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.devpilot.tmp`;
  writeFileSync(tmp, JSON.stringify(settings, null, 2) + '\n');
  renameSync(tmp, path);
}

function previousPath(storeDir: string): string {
  return join(storeDir, 'previous.json');
}

function readPrevious(storeDir: string): Previous | null {
  try {
    return JSON.parse(readFileSync(previousPath(storeDir), 'utf8')) as Previous;
  } catch {
    return null;
  }
}

export type InstallOutcome =
  | { status: 'installed'; wrapped: boolean; previousCommand?: string }
  | { status: 'already' }
  | { status: 'unreadable'; message: string };

/**
 * Put the status line into a Claude Code settings file.
 *
 * Returns what happened rather than printing, so the three outcomes can be
 * tested: a clean install, an install that wraps an existing line, and a
 * second run that changes nothing.
 */
export function installStatusLine(paths: InstallPaths): InstallOutcome {
  let settings: Record<string, unknown>;
  try {
    settings = readSettings(paths.settingsPath);
  } catch (error) {
    return {
      status: 'unreadable',
      message: `${paths.settingsPath} is not valid JSON (${error instanceof Error ? error.message : error}). Fix it and run this again; it was not changed.`,
    };
  }

  const existing = (settings.statusLine ?? null) as StatusLineSetting | null;
  if (isOurs(existing)) return { status: 'already' };

  mkdirSync(paths.storeDir, { recursive: true });
  const previous: Previous = {
    settingsPath: paths.settingsPath,
    statusLine: existing,
    savedAt: new Date().toISOString(),
  };
  writeFileSync(previousPath(paths.storeDir), JSON.stringify(previous, null, 2) + '\n');

  const wrapped = Boolean(existing?.command);
  settings.statusLine = {
    // Keep what the person had configured about the row itself (padding,
    // refresh interval); only the command changes.
    ...(existing ?? {}),
    type: 'command',
    command: wrapped ? `${paths.command} --wrap` : paths.command,
  };
  writeSettings(paths.settingsPath, settings);

  return { status: 'installed', wrapped, previousCommand: existing?.command };
}

export type UninstallOutcome =
  | { status: 'restored'; previousCommand?: string }
  | { status: 'removed' }
  | { status: 'not-ours' }
  | { status: 'unreadable'; message: string };

/** Take it out again, leaving the settings file as `install` found it. */
export function uninstallStatusLine(paths: Pick<InstallPaths, 'settingsPath' | 'storeDir'>): UninstallOutcome {
  let settings: Record<string, unknown>;
  try {
    settings = readSettings(paths.settingsPath);
  } catch (error) {
    return {
      status: 'unreadable',
      message: `${paths.settingsPath} is not valid JSON (${error instanceof Error ? error.message : error}); it was not changed.`,
    };
  }

  // Someone has since replaced the line with their own. That is theirs.
  if (!isOurs(settings.statusLine as StatusLineSetting | undefined)) return { status: 'not-ours' };

  const previous = readPrevious(paths.storeDir);
  const restore = previous && resolve(previous.settingsPath) === resolve(paths.settingsPath) ? previous.statusLine : null;

  if (restore) settings.statusLine = restore;
  else delete settings.statusLine;
  writeSettings(paths.settingsPath, settings);

  return restore ? { status: 'restored', previousCommand: restore.command } : { status: 'removed' };
}

/** The command Claude Code is given: this node, this CLI, by absolute path. */
function selfCommand(): string {
  // Absolute paths, not `devpilot`: Claude Code runs the command through a
  // shell whose PATH need not include wherever a global npm bin lives, and a
  // status line that cannot be found fails silently, as a blank row.
  const script = resolve(process.argv[1] ?? 'devpilot');
  const quote = (s: string) => (/^[\w./:-]+$/.test(s) ? s : `"${s.replace(/(["\\$`])/g, '\\$1')}"`);
  return `${quote(process.execPath)} ${quote(script)} ${MARKER}`;
}

function settingsPathFor(options: { project?: boolean }): string {
  return options.project
    ? join(process.cwd(), '.claude', 'settings.local.json')
    : join(homedir(), '.claude', 'settings.json');
}

export const statuslineCommand = new Command('statusline')
  .description('The Claude Code status line: session cost, context, cache and subscription windows')
  .option('--wrap', 'Also run the status line that was configured before this one')
  .option('--no-record', 'Print the line without recording the reading')
  .action(async () => {
    // Reached only when invoked through the full CLI (the bin routes the bare
    // command to the fast entry). Same behaviour either way.
    const { main } = await import('../statusline-fast');
    await main(process.argv.slice(3));
  });

statuslineCommand
  .command('install')
  .description('Add the status line to Claude Code, keeping any you already have')
  .option('--project', 'Install for this project only (.claude/settings.local.json) instead of for your user')
  .action((options: { project?: boolean }) => {
    const settingsPath = settingsPathFor(options);
    const outcome = installStatusLine({ settingsPath, storeDir: statuslineDir(), command: selfCommand() });

    if (outcome.status === 'unreadable') {
      console.error(chalk.red(outcome.message));
      process.exitCode = 1;
      return;
    }
    if (outcome.status === 'already') {
      console.log(chalk.gray(`Already installed in ${settingsPath}.`));
      return;
    }

    console.log(chalk.green('Status line installed.'));
    console.log(chalk.gray(`  ${settingsPath}`));
    if (outcome.wrapped) {
      console.log('');
      console.log('  You already had a status line. It was kept: it runs first and its');
      console.log('  output is shown unchanged, with DevPilot\'s line under it.');
      console.log(chalk.gray(`  was: ${outcome.previousCommand}`));
    }
    console.log('');
    console.log('  It shows the model, how full the context is, whether the prompt cache is');
    console.log('  warm, what the session has cost at API rates, and — on a Pro or Max');
    console.log('  subscription — how much of your 5-hour and 7-day windows is used.');
    console.log('');
    console.log('  It also records those readings on this machine, under ~/.devpilot/statusline,');
    console.log('  so a connected bridge can report them with each session: percentages,');
    console.log('  counts and cache-miss causes. Nothing you type and nothing an agent writes.');
    console.log('');
    console.log(chalk.gray('  Takes effect in new Claude Code sessions. `devpilot statusline uninstall` puts'));
    console.log(chalk.gray('  things back exactly as they were.'));
  });

statuslineCommand
  .command('uninstall')
  .description('Remove the status line and restore the one you had before')
  .option('--project', 'Uninstall from this project (.claude/settings.local.json)')
  .action((options: { project?: boolean }) => {
    const settingsPath = settingsPathFor(options);
    const outcome = uninstallStatusLine({ settingsPath, storeDir: statuslineDir() });

    if (outcome.status === 'unreadable') {
      console.error(chalk.red(outcome.message));
      process.exitCode = 1;
    } else if (outcome.status === 'not-ours') {
      console.log(chalk.gray(`The status line in ${settingsPath} is not DevPilot's. Nothing was changed.`));
    } else if (outcome.status === 'restored') {
      console.log(chalk.green('Removed. Your previous status line is back:'));
      console.log(chalk.gray(`  ${outcome.previousCommand}`));
    } else {
      console.log(chalk.green('Removed.'));
    }
  });
