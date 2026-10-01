import { execFileSync } from 'child_process';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  pruneWindowLogs,
  recordStatus,
  renderStatusLine,
  statuslineDir,
  type StatusInput,
} from './utils/statusline-store';

/**
 * `devpilot statusline`, without the rest of the CLI.
 *
 * Claude Code runs the status line command on every assistant message. Loading
 * the whole CLI for that — commander, the bridge, the cockpit's database
 * driver — took about 270 ms a time on the machine this was written on, for a
 * command whose job is to print one line. This entry imports the status line
 * store and nothing else, and `bin/devpilot.js` routes the bare `statusline`
 * invocation to it.
 *
 * It must always print something and always exit zero: Claude Code shows
 * whatever this prints, and a status line that throws shows a blank row.
 */

/** Read all of stdin, or give up quickly: an empty status line beats a hung one. */
function readStdin(timeoutMs: number): Promise<string> {
  return new Promise((resolve) => {
    if (process.stdin.isTTY) return resolve('');
    let data = '';
    const done = () => resolve(data);
    const timer = setTimeout(done, timeoutMs);
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => (data += chunk));
    process.stdin.on('end', () => {
      clearTimeout(timer);
      done();
    });
    process.stdin.on('error', () => {
      clearTimeout(timer);
      done();
    });
  });
}

/**
 * The status line the person had before DevPilot's was installed.
 *
 * Claude Code has one status line slot and no way to add a second, so
 * installing ours would otherwise replace theirs. `statusline install` records
 * the command it found, and with `--wrap` this runs it on the same input and
 * prints its output first, exactly as it would have appeared.
 */
function previousOutput(dir: string, raw: string): string {
  try {
    const saved = JSON.parse(readFileSync(join(dir, 'previous.json'), 'utf8')) as {
      statusLine?: { command?: string };
    };
    const command = saved.statusLine?.command;
    if (!command) return '';
    return execFileSync('/bin/sh', ['-c', command], {
      input: raw,
      encoding: 'utf8',
      timeout: 1_500,
      stdio: ['pipe', 'pipe', 'ignore'],
    }).replace(/\n+$/, '');
  } catch {
    return '';
  }
}

export async function main(argv: string[] = process.argv.slice(3)): Promise<void> {
  const wrap = argv.includes('--wrap');
  const raw = await readStdin(1_000);
  const dir = statuslineDir();
  const now = Date.now();

  let input: StatusInput = {};
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) input = parsed as StatusInput;
  } catch {
    // Not JSON: print what can be printed (nothing) rather than fail.
  }

  if (!argv.includes('--no-record')) {
    recordStatus(input, dir, now);
    // About once in two hundred runs, clear day logs nothing reads any more.
    if (Math.random() < 0.005) pruneWindowLogs(dir, now);
  }

  const ours = renderStatusLine(input, { now, color: !process.env.NO_COLOR });
  const theirs = wrap ? previousOutput(dir, raw) : '';
  process.stdout.write([theirs, ours].filter(Boolean).join('\n') + '\n');
}
