/**
 * Getting a join link to a person without showing it to a model.
 *
 * A join link carries the session key. Everything a tool returns becomes part
 * of the model's context and of the transcript on disk, and from there it is
 * sent to the model provider on every later turn. "End-to-end encrypted" would
 * then mean "except for the copy of the key in both agents' conversations".
 *
 * So the link travels beside the conversation rather than through it: this
 * process puts the handoff on the system clipboard and writes it to an
 * owner-only file, and tells the model only that it did. In the other
 * direction, `join` can take the link from the clipboard, so the person
 * receiving one never has to paste it into a prompt either.
 *
 * Everything here is best-effort and reports what happened. A machine with no
 * clipboard (a server, a container) still gets the file.
 */
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export interface Clipboard {
  /** True when the text is now on the clipboard. */
  write(text: string): boolean;
  /** The clipboard's text, or null when it cannot be read. */
  read(): string | null;
}

type Command = [string, string[]];

function writers(): Command[] {
  if (process.platform === 'darwin') return [['pbcopy', []]];
  if (process.platform === 'win32') return [['clip', []]];
  return [
    ['wl-copy', []],
    ['xclip', ['-selection', 'clipboard']],
    ['xsel', ['--clipboard', '--input']],
  ];
}

function readers(): Command[] {
  if (process.platform === 'darwin') return [['pbpaste', []]];
  if (process.platform === 'win32') return [['powershell', ['-NoProfile', '-Command', 'Get-Clipboard']]];
  return [
    ['wl-paste', ['--no-newline']],
    ['xclip', ['-selection', 'clipboard', '-o']],
    ['xsel', ['--clipboard', '--output']],
  ];
}

/** The real clipboard. Tests inject their own. */
export const systemClipboard: Clipboard = {
  write(text) {
    for (const [cmd, args] of writers()) {
      const result = spawnSync(cmd, args, {
        input: text,
        stdio: ['pipe', 'ignore', 'ignore'],
        timeout: 3000,
      });
      if (result.status === 0) return true;
    }
    return false;
  },
  read() {
    for (const [cmd, args] of readers()) {
      const result = spawnSync(cmd, args, {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
        timeout: 3000,
      });
      if (result.status === 0 && typeof result.stdout === 'string') return result.stdout;
    }
    return null;
  },
};

export function handoffDir(home: string = homedir()): string {
  return join(home, '.devpilot', 'handoffs');
}

/**
 * Write the handoff where only its owner can read it. Returns the path, or
 * null if it could not be written.
 *
 * Mode is re-asserted after the write: `mode` on `writeFileSync` applies only
 * at creation, and a session id is reused if a session is shared twice.
 */
export function writeHandoffFile(dir: string, sessionId: string, text: string): string | null {
  try {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    const file = join(dir, `${sessionId.replace(/[^A-Za-z0-9_-]/g, '_')}.txt`);
    writeFileSync(file, `${text}\n`, { encoding: 'utf8', mode: 0o600 });
    chmodSync(file, 0o600);
    return file;
  } catch {
    return null;
  }
}
