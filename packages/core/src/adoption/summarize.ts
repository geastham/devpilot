import Anthropic from '@anthropic-ai/sdk';
import { ADOPTION_LIMITS } from '@devpilot.sh/bridge-protocol';
import { resolveWikiModel } from '../wave-planner/models';
import { condenseTitle, heuristicTitle } from './scanner';
import type { SessionObservation } from './transcript';

/**
 * Titles and summaries for adopted sessions — TRD 21 §6.4.
 *
 * Two tiers, and the lower one is NOT a degraded mode:
 *
 *   1. Heuristic — the client's own `custom-title`, or the first human prompt
 *      condensed. Always available, no key, no network, no cost.
 *   2. Model — one call at the wiki tier over the transcript head.
 *
 * ## Why a missing API key must never block adoption
 *
 * The product claim is "turn it on and everything is already there". Making
 * that conditional on an `ANTHROPIC_API_KEY` the user may not have set would
 * put the headline experience behind configuration, for a feature whose whole
 * point is that it needs none. The heuristic title is genuinely good — the
 * client has usually already named the session — so tier 1 is the floor and
 * tier 2 is an improvement on it.
 *
 * ## Why the wiki tier and not the planner tier
 *
 * `models.ts` states the distinction directly: summarisation over already
 * retrieved content is not the same problem as decomposition and does not need
 * the same tier. This is summarisation, and it runs once per candidate across
 * potentially dozens of candidates.
 */

/** Bytes of transcript head shown to the model. */
const SAMPLE_CHARS = 6_000;
const REQUEST_TIMEOUT_MS = 20_000;
const MAX_CONCURRENCY = 4;

export interface SummarizeOptions {
  apiKey?: string;
  model?: string;
  /** Cap on model calls per scan. Beyond it, candidates keep heuristic titles. */
  maxSummaries?: number;
  concurrency?: number;
  timeoutMs?: number;
  /** Injected in tests. */
  clientFactory?: (apiKey: string) => Pick<Anthropic, 'messages'>;
  onWarn?: (message: string) => void;
}

export interface SessionSummary {
  title: string;
  summary?: string;
  /** Which tier produced this. Surfaced so a preview can be honest. */
  source: 'model' | 'heuristic';
}

/**
 * Title AND body, with no model call.
 *
 * The heuristic tier used to produce only a title, so a session on a machine
 * with no `ANTHROPIC_API_KEY` reached the hosted plane with a null summary —
 * and `/api/sessions/:id/promote` uses that as the body of the Linear issue it
 * drafts. Every such ticket fell back to bare evidence: a repo, a branch, a
 * file list, and nothing about the work.
 *
 * The first human prompt is right there and is a genuinely good body: it is the
 * person's own statement of what they wanted. It is not a summary of the work —
 * it is the request — so it is labelled as such rather than passed off as one.
 *
 * This keeps the promise that observation costs nothing: no key, no network,
 * still a usable ticket.
 */
export function heuristicSummary(observation: SessionObservation): SessionSummary {
  const title = heuristicTitle(observation);
  const prompt = observation.firstHumanPrompt?.trim();

  // Only worth including when it says more than the title already did.
  const summary =
    prompt && prompt.length > title.length
      ? condenseTitle(`Session opened with: ${prompt}`, ADOPTION_LIMITS.MAX_SUMMARY_CHARS)
      : undefined;

  return { title, summary, source: 'heuristic' };
}

const SYSTEM_PROMPT = [
  'You label coding-agent sessions so they can be tracked on an issue board.',
  '',
  'You are given the opening of a session transcript and the list of files it has',
  'changed. Reply with exactly two lines and nothing else:',
  '',
  'TITLE: <an imperative summary of the work, at most 10 words, no trailing period>',
  'SUMMARY: <one or two sentences on what this session is doing and why>',
  '',
  'Describe the WORK, not the conversation. Never write "the user asked" or "this',
  'session". Never quote the transcript. Never include file contents, code, secrets,',
  'or credentials — if the transcript contains any, ignore them entirely.',
].join('\n');

function buildUserPrompt(observation: SessionObservation, touchedPaths: string[]): string {
  const parts: string[] = [];
  if (observation.customTitle) parts.push(`Client-assigned title: ${observation.customTitle}`);
  if (observation.gitBranch) parts.push(`Branch: ${observation.gitBranch}`);
  if (touchedPaths.length > 0) {
    parts.push(`Changed files:\n${touchedPaths.slice(0, 25).map((p) => `- ${p}`).join('\n')}`);
  }
  parts.push(`Transcript opening:\n${observation.headSample.slice(0, SAMPLE_CHARS)}`);
  return parts.join('\n\n');
}

function parseResponse(text: string): { title?: string; summary?: string } {
  const title = text.match(/^TITLE:\s*(.+)$/m)?.[1]?.trim();
  const summary = text.match(/^SUMMARY:\s*([\s\S]+?)$/m)?.[1]?.trim();
  return { title: title || undefined, summary: summary || undefined };
}

/**
 * Summarize one session. Never throws — any failure degrades to the heuristic.
 *
 * A failed summary must cost that one candidate its nicer title and nothing
 * else. Failing the scan because a model call timed out would trade the entire
 * feature for a cosmetic improvement to part of it.
 */
export async function summarizeSession(
  observation: SessionObservation,
  touchedPaths: string[],
  options: SummarizeOptions = {},
): Promise<SessionSummary> {
  const fallback: SessionSummary = heuristicSummary(observation);

  const apiKey = options.apiKey ?? process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return fallback;

  try {
    const client = options.clientFactory
      ? options.clientFactory(apiKey)
      : new Anthropic({ apiKey, timeout: options.timeoutMs ?? REQUEST_TIMEOUT_MS });

    const response = await client.messages.create({
      model: options.model ?? resolveWikiModel(),
      max_tokens: 300,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: buildUserPrompt(observation, touchedPaths) }],
    });

    const text = ('content' in response ? response.content : [])
      .map((block) => (block.type === 'text' ? block.text : ''))
      .join('')
      .trim();

    const { title, summary } = parseResponse(text);
    if (!title) return fallback;

    return {
      title: condenseTitle(title, ADOPTION_LIMITS.MAX_TITLE_CHARS),
      summary: summary ? condenseTitle(summary, ADOPTION_LIMITS.MAX_SUMMARY_CHARS) : undefined,
      source: 'model',
    };
  } catch (err) {
    options.onWarn?.(
      `could not summarize ${observation.sessionUuid.slice(0, 8)}: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
    return fallback;
  }
}

/**
 * Summarize a batch with bounded concurrency, in observation order.
 *
 * Bounded because a scan can produce dozens of candidates and firing them all
 * at once would rate-limit the user's own key — the one they use for real work.
 * Beyond `maxSummaries` the remainder keep heuristic titles rather than queueing
 * indefinitely behind a progress bar.
 */
export async function summarizeSessions(
  jobs: { observation: SessionObservation; touchedPaths: string[] }[],
  options: SummarizeOptions = {},
): Promise<SessionSummary[]> {
  const limit = options.maxSummaries ?? 25;
  const concurrency = Math.max(1, options.concurrency ?? MAX_CONCURRENCY);
  const results: SessionSummary[] = new Array(jobs.length);

  let next = 0;
  async function worker(): Promise<void> {
    for (;;) {
      const index = next++;
      if (index >= jobs.length) return;
      const job = jobs[index];
      results[index] =
        index < limit
          ? await summarizeSession(job.observation, job.touchedPaths, options)
          : heuristicSummary(job.observation);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, jobs.length) }, () => worker()),
  );

  return results;
}
