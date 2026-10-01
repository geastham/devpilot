/**
 * Where a connected machine remembers which bridge it belongs to.
 *
 * A machine token is shown once, when it is minted. Nothing kept it, so every
 * later command that needed the bridge — reconnecting after a reboot, starting
 * a shared session — had to be handed the token again by a person who, by
 * design, could no longer look it up. In practice that meant minting a new
 * token each time, or leaving the old one in shell history, which is where
 * `--token dp_orch_…` on a command line ends up anyway.
 *
 * So `devpilot bridge connect` writes the pair here, readable by its owner
 * only, and everything else reads it. That is the same trade `gh`, `npm` and
 * `vercel` make: a revocable credential at rest in the home directory, in
 * exchange for commands that work without being re-told who they are.
 *
 * Resolution order everywhere is: explicit flag, then environment, then this
 * file. An explicit value always wins, so a saved credential can never
 * override what someone typed.
 */
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

export interface BridgeCredentials {
  /** Bridge base URL, no trailing slash. */
  url: string;
  /** Machine token (`dp_orch_…`). Revocable from the dashboard. */
  token: string;
}

export const DEFAULT_BRIDGE_URL = 'https://devpilot.sh';

export function bridgeCredentialsPath(home: string = homedir()): string {
  return join(home, '.devpilot', 'bridge.json');
}

/** The saved pair, or null. A corrupt or partial file reads as "nothing saved". */
export function loadBridgeCredentials(path: string = bridgeCredentialsPath()): BridgeCredentials | null {
  try {
    if (!existsSync(path)) return null;
    const saved = JSON.parse(readFileSync(path, 'utf8')) as Partial<BridgeCredentials>;
    if (typeof saved.url !== 'string' || typeof saved.token !== 'string') return null;
    if (!saved.url || !saved.token) return null;
    return { url: saved.url.replace(/\/+$/, ''), token: saved.token };
  } catch {
    return null;
  }
}

/**
 * Owner-only, and re-asserted on every write: `writeFileSync`'s `mode` applies
 * only when the file is created, so a file that already existed with looser
 * permissions would otherwise keep them.
 *
 * Returns false rather than throwing. An unwritable home directory must not
 * stop a bridge from connecting; the credential is simply not remembered.
 */
export function saveBridgeCredentials(
  credentials: BridgeCredentials,
  path: string = bridgeCredentialsPath(),
): boolean {
  try {
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    writeFileSync(
      path,
      JSON.stringify({ url: credentials.url.replace(/\/+$/, ''), token: credentials.token }, null, 2),
      { encoding: 'utf8', mode: 0o600 },
    );
    chmodSync(path, 0o600);
    return true;
  } catch {
    return false;
  }
}

export function clearBridgeCredentials(path: string = bridgeCredentialsPath()): void {
  try {
    rmSync(path, { force: true });
  } catch {
    // Already gone, or not ours to remove — either way there is nothing to do.
  }
}

/**
 * Flag, then environment, then the saved file.
 *
 * The URL and the token resolve independently so `--url` alone can point a
 * saved token at a different deployment — but a saved TOKEN is only offered to
 * the URL it was saved for. Sending a production token to whatever host a flag
 * names would hand a credential to the wrong server.
 */
export function resolveBridgeCredentials(
  explicit: { url?: string; token?: string } = {},
  env: NodeJS.ProcessEnv = process.env,
  path: string = bridgeCredentialsPath(),
): { url?: string; token?: string; source: 'explicit' | 'env' | 'saved' | 'none' } {
  const saved = loadBridgeCredentials(path);
  const trim = (u?: string) => u?.replace(/\/+$/, '');

  const url = trim(explicit.url) ?? trim(env.DEVPILOT_BRIDGE_URL) ?? saved?.url;
  const direct = explicit.token ?? env.DEVPILOT_BRIDGE_TOKEN;
  if (direct) {
    return { url, token: direct, source: explicit.token ? 'explicit' : 'env' };
  }
  if (saved && (!url || url === saved.url)) {
    return { url: saved.url, token: saved.token, source: 'saved' };
  }
  return { url, token: undefined, source: 'none' };
}
