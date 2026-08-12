import type { CompletionReport, StatusUpdate } from './types';

/**
 * Callback delivery to DevPilot (§7.2).
 *
 * "At-least-once with exponential backoff for 10 minutes; DevPilot handlers are
 * idempotent." Both halves matter: the completion POST is the only thing that
 * moves a wave task off `dispatched`, so dropping it silently strands the whole
 * wave — which looks exactly like an agent that never finished.
 */

/** 1s, 2s, 4s … capped, summing to a little over 10 minutes. */
const BACKOFF_MS = [1_000, 2_000, 4_000, 8_000, 16_000, 32_000, 60_000, 120_000, 240_000, 240_000];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function post(
  url: string,
  body: unknown,
  token: string | undefined,
  log: (line: string) => void
): Promise<boolean> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['X-DevPilot-Callback-Token'] = token;

  for (let attempt = 0; attempt <= BACKOFF_MS.length; attempt++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30_000),
      });

      if (res.ok) return true;

      // 4xx other than 408/429 is a contract problem, not a transient one.
      // Retrying a 401 for ten minutes just delays the error by ten minutes.
      if (res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429) {
        log(`callback ${url} rejected: ${res.status} ${await res.text().catch(() => '')}`);
        return false;
      }

      log(`callback ${url} failed: ${res.status} (attempt ${attempt + 1})`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log(`callback ${url} error: ${message} (attempt ${attempt + 1})`);
    }

    if (attempt < BACKOFF_MS.length) await sleep(BACKOFF_MS[attempt]);
  }

  log(`callback ${url} GAVE UP after ${BACKOFF_MS.length + 1} attempts`);
  return false;
}

export function sendStatus(
  callbackUrl: string,
  update: StatusUpdate,
  token: string | undefined,
  log: (line: string) => void
): Promise<boolean> {
  return post(`${callbackUrl.replace(/\/$/, '')}/status`, update, token, log);
}

export function sendCompletion(
  callbackUrl: string,
  report: CompletionReport,
  token: string | undefined,
  log: (line: string) => void
): Promise<boolean> {
  return post(`${callbackUrl.replace(/\/$/, '')}/complete`, report, token, log);
}
