import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AdoptionCandidateSchema, DiscoveredRepoSchema } from '@devpilot.sh/bridge-protocol';
import {
  HEAD_BYTES,
  MAX_PROBE_BYTES,
  probeTranscript,
  parseRemoteUrl,
  scanSessions,
  adoptionKeyFor,
  condenseTitle,
  heuristicTitle,
  withheldOwners,
  loadOwnedSessionIds,
  clearRepoCache,
} from '../../src/adoption';

/**
 * Fixtures are built on disk rather than committed, and the git repos are REAL
 * — `git init` plus a remote — because the whole point of `resolveRepo` is that
 * it reads a real remote through a real git. A mocked git would test the mock.
 */

let workspace: string;
let projectsRoot: string;
const repoDirs: Record<string, string> = {};

const MACHINE = 'Mac.lan';

function git(cwd: string, args: string[]): void {
  execFileSync('git', ['-C', cwd, ...args], { stdio: 'ignore' });
}

function makeRepo(key: string, remote: string): string {
  const dir = join(workspace, 'repos', key);
  mkdirSync(dir, { recursive: true });
  git(dir, ['init', '-q']);
  git(dir, ['remote', 'add', 'origin', remote]);
  repoDirs[key] = dir;
  return dir;
}

interface FixtureOptions {
  cwd: string;
  sessionUuid: string;
  projectSlug: string;
  customTitle?: string;
  prompt?: string;
  gitBranch?: string;
  startedAt?: string;
  /** mtime, which is what liveness and the adoption window read. */
  ageMs?: number;
  extraLines?: string[];
  /** Append a deliberately truncated final line. */
  torn?: boolean;
  sidechain?: boolean;
  /** Pad the file so it exceeds the head budget. */
  padToBytes?: number;
}

function writeTranscript(opts: FixtureOptions): string {
  const dir = join(projectsRoot, opts.projectSlug);
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${opts.sessionUuid}.jsonl`);
  const stamp = opts.startedAt ?? '2026-08-21T06:00:00.000Z';

  const common = {
    cwd: opts.cwd,
    sessionId: opts.sessionUuid,
    gitBranch: opts.gitBranch ?? 'main',
    timestamp: stamp,
    isSidechain: opts.sidechain ?? false,
    version: '2.1.224',
  };

  const lines: string[] = [
    JSON.stringify({ type: 'mode', mode: 'normal', sessionId: opts.sessionUuid }),
    JSON.stringify({ ...common, type: 'system', subtype: 'local_command', content: 'x' }),
  ];
  if (opts.customTitle) {
    lines.push(
      JSON.stringify({
        type: 'custom-title',
        customTitle: opts.customTitle,
        sessionId: opts.sessionUuid,
      }),
    );
  }
  if (opts.prompt) {
    lines.push(
      JSON.stringify({
        ...common,
        type: 'user',
        origin: { kind: 'human' },
        message: { role: 'user', content: opts.prompt },
      }),
    );
  }
  lines.push(...(opts.extraLines ?? []));

  if (opts.padToBytes) {
    const filler = 'y'.repeat(2000);
    while (lines.join('\n').length < opts.padToBytes) {
      lines.push(
        JSON.stringify({
          ...common,
          type: 'assistant',
          message: { role: 'assistant', content: [{ type: 'text', text: filler }] },
        }),
      );
    }
  }

  let body = `${lines.join('\n')}\n`;
  if (opts.torn) body += '{"type":"user","message":{"role":"user","cont';

  writeFileSync(path, body, 'utf8');

  if (opts.ageMs !== undefined) {
    const when = (Date.now() - opts.ageMs) / 1000;
    utimesSync(path, when, when);
  }
  return path;
}

beforeAll(() => {
  workspace = mkdtempSync(join(tmpdir(), 'devpilot-adoption-'));
  projectsRoot = join(workspace, 'projects');
  mkdirSync(projectsRoot, { recursive: true });

  makeRepo('devpilot', 'git@github.com:openconjecture/devpilot.git');
  makeRepo('website', 'https://github.com/openconjecture/website.git');
  makeRepo('arthaus', 'git@github.com:arthaus/storefront.git');
});

afterAll(() => {
  rmSync(workspace, { recursive: true, force: true });
});

beforeEach(() => {
  clearRepoCache();
});

// ---------------------------------------------------------------------------

describe('probeTranscript', () => {
  it('extracts cwd, branch, title and the first human prompt', () => {
    const path = writeTranscript({
      cwd: repoDirs.devpilot,
      sessionUuid: 'aaaaaaaa-0000-0000-0000-000000000001',
      projectSlug: 'slug-devpilot',
      customTitle: 'Fleet introspection',
      prompt: 'Adopt every running session onto the board',
      gitBranch: 'conductor/arena-foundations',
    });

    const observation = probeTranscript(path, 'aaaaaaaa-0000-0000-0000-000000000001');
    expect(observation).not.toBeNull();
    expect(observation!.cwd).toBe(repoDirs.devpilot);
    expect(observation!.gitBranch).toBe('conductor/arena-foundations');
    expect(observation!.customTitle).toBe('Fleet introspection');
    expect(observation!.firstHumanPrompt).toContain('Adopt every running session');
  });

  /** T21-AC-02. The performance claim has to be enforced, not asserted in prose. */
  it('reads one chunk of a 5 MB transcript when the head is well-formed', () => {
    const path = writeTranscript({
      cwd: repoDirs.devpilot,
      sessionUuid: 'aaaaaaaa-0000-0000-0000-000000000002',
      projectSlug: 'slug-devpilot',
      customTitle: 'Big one',
      prompt: 'big one',
      padToBytes: 5 * 1024 * 1024,
    });

    const observation = probeTranscript(path, 'aaaaaaaa-0000-0000-0000-000000000002');
    expect(observation!.sizeBytes).toBeGreaterThan(5 * 1024 * 1024);
    expect(observation!.bytesRead).toBeLessThanOrEqual(HEAD_BYTES);
    expect(Buffer.byteLength(observation!.headSample, 'utf8')).toBeLessThanOrEqual(HEAD_BYTES);
    expect(observation!.messageCountIsApproximate).toBe(true);
  });

  /**
   * Found on real data: three of the first eight sessions on the reference
   * machine opened with an `attachment` entry larger than one chunk, and every
   * one of them produced a useless `Agent session 9030b53a` title.
   */
  it('finds a title past a multi-chunk attachment, without parsing it', () => {
    const giant = JSON.stringify({
      type: 'attachment',
      cwd: repoDirs.devpilot,
      gitBranch: 'main',
      content: 'z'.repeat(300 * 1024),
    });
    const path = writeTranscript({
      cwd: repoDirs.devpilot,
      sessionUuid: 'aaaaaaaa-0000-0000-0000-000000000008',
      projectSlug: 'slug-devpilot',
      extraLines: [
        giant,
        JSON.stringify({ type: 'custom-title', customTitle: 'Behind the attachment' }),
        JSON.stringify({
          type: 'user',
          cwd: repoDirs.devpilot,
          origin: { kind: 'human' },
          message: { role: 'user', content: 'the actual request' },
        }),
      ],
    });

    const observation = probeTranscript(path, 'aaaaaaaa-0000-0000-0000-000000000008');
    expect(observation!.customTitle).toBe('Behind the attachment');
    expect(observation!.firstHumanPrompt).toBe('the actual request');
    expect(observation!.cwd).toBe(repoDirs.devpilot);
    // Scraped from the oversized line, not parsed out of it.
    expect(observation!.gitBranch).toBe('main');
  });

  it('never exceeds MAX_PROBE_BYTES, however large the file', () => {
    const giant = JSON.stringify({
      type: 'attachment',
      content: 'z'.repeat(3 * 1024 * 1024),
    });
    const path = writeTranscript({
      cwd: repoDirs.devpilot,
      sessionUuid: 'aaaaaaaa-0000-0000-0000-000000000009',
      projectSlug: 'slug-devpilot',
      extraLines: [giant],
      padToBytes: 6 * 1024 * 1024,
    });

    const observation = probeTranscript(path, 'aaaaaaaa-0000-0000-0000-000000000009');
    expect(observation!.sizeBytes).toBeGreaterThan(6 * 1024 * 1024);
    expect(observation!.bytesRead).toBeLessThanOrEqual(MAX_PROBE_BYTES);
  });

  it('asks for one chunk at a time, from the front', () => {
    const path = writeTranscript({
      cwd: repoDirs.devpilot,
      sessionUuid: 'aaaaaaaa-0000-0000-0000-000000000003',
      projectSlug: 'slug-devpilot',
      prompt: 'hello',
    });
    const spy = vi.fn(
      () =>
        '{"type":"custom-title","customTitle":"t"}\n{"type":"user","cwd":"/tmp","origin":{"kind":"human"},"message":{"role":"user","content":"hi"}}\n',
    );
    probeTranscript(path, 'x', { readHeadImpl: spy });
    expect(spy).toHaveBeenCalledWith(path, HEAD_BYTES, 0);
  });

  it('survives a torn final line, which every live transcript has', () => {
    const path = writeTranscript({
      cwd: repoDirs.devpilot,
      sessionUuid: 'aaaaaaaa-0000-0000-0000-000000000004',
      projectSlug: 'slug-devpilot',
      customTitle: 'Still writing',
      prompt: 'go',
      torn: true,
    });
    const observation = probeTranscript(path, 'aaaaaaaa-0000-0000-0000-000000000004');
    expect(observation!.customTitle).toBe('Still writing');
  });

  it('returns null for an empty file', () => {
    const dir = join(projectsRoot, 'slug-empty');
    mkdirSync(dir, { recursive: true });
    const path = join(dir, 'empty.jsonl');
    writeFileSync(path, '', 'utf8');
    expect(probeTranscript(path, 'empty')).toBeNull();
  });

  it('returns null for a missing file rather than throwing', () => {
    expect(probeTranscript(join(projectsRoot, 'nope', 'nope.jsonl'), 'nope')).toBeNull();
  });

  it('ignores command echoes when looking for the first human prompt', () => {
    const path = writeTranscript({
      cwd: repoDirs.devpilot,
      sessionUuid: 'aaaaaaaa-0000-0000-0000-000000000005',
      projectSlug: 'slug-devpilot',
      extraLines: [
        JSON.stringify({
          type: 'user',
          origin: { kind: 'human' },
          message: { role: 'user', content: '<command-name>/remote-control</command-name>' },
        }),
        JSON.stringify({
          type: 'user',
          origin: { kind: 'human' },
          message: { role: 'user', content: 'The real request' },
        }),
      ],
    });
    expect(probeTranscript(path, 'x')!.firstHumanPrompt).toBe('The real request');
  });

  it('does not read tool-result blocks into the prompt', () => {
    const path = writeTranscript({
      cwd: repoDirs.devpilot,
      sessionUuid: 'aaaaaaaa-0000-0000-0000-000000000006',
      projectSlug: 'slug-devpilot',
      extraLines: [
        JSON.stringify({
          type: 'user',
          origin: { kind: 'human' },
          message: {
            role: 'user',
            content: [
              { type: 'tool_result', content: 'SECRET_KEY=hunter2' },
              { type: 'text', text: 'carry on' },
            ],
          },
        }),
      ],
    });
    const observation = probeTranscript(path, 'x');
    expect(observation!.firstHumanPrompt).toBe('carry on');
    expect(observation!.firstHumanPrompt).not.toContain('hunter2');
  });

  it('recognises a DevPilot-composed prompt', () => {
    const path = writeTranscript({
      cwd: repoDirs.devpilot,
      sessionUuid: 'aaaaaaaa-0000-0000-0000-000000000007',
      projectSlug: 'slug-devpilot',
      prompt: 'Implement AVA-3. Your DevPilot session id is `sess_x` — use it as sessionId.',
    });
    expect(probeTranscript(path, 'x')!.looksDevPilotOwned).toBe(true);
  });
});

// ---------------------------------------------------------------------------

describe('parseRemoteUrl', () => {
  it.each([
    ['git@github.com:openconjecture/devpilot.git', 'openconjecture/devpilot', 'github.com'],
    ['https://github.com/openconjecture/devpilot.git', 'openconjecture/devpilot', 'github.com'],
    ['https://github.com/openconjecture/devpilot', 'openconjecture/devpilot', 'github.com'],
    ['ssh://git@github.com/openconjecture/devpilot', 'openconjecture/devpilot', 'github.com'],
    ['git@gitlab.acme.com:platform/team/service.git', 'team/service', 'gitlab.acme.com'],
  ])('parses %s', (url, repo, host) => {
    const parsed = parseRemoteUrl(url);
    expect(parsed).toMatchObject({ repo, host });
  });

  it('discards embedded credentials — this value is about to cross the network', () => {
    const parsed = parseRemoteUrl('https://garrett:ghp_secrettoken@github.com/acme/widget.git');
    expect(parsed).toMatchObject({ repo: 'acme/widget', host: 'github.com' });
    expect(JSON.stringify(parsed)).not.toContain('ghp_secrettoken');
  });

  it.each(['', 'not a url', 'https://github.com/onlyone', '/Users/g/dev/thing'])(
    'rejects %s',
    (url) => {
      expect(parseRemoteUrl(url)).toBeNull();
    },
  );
});

// ---------------------------------------------------------------------------

describe('adoptionKeyFor', () => {
  it('is stable and 64 hex chars', () => {
    const key = adoptionKeyFor(MACHINE, 'uuid-1');
    expect(key).toMatch(/^[0-9a-f]{64}$/);
    expect(adoptionKeyFor(MACHINE, 'uuid-1')).toBe(key);
  });

  it('differs by machine, so a copied ~/.claude is two observations', () => {
    expect(adoptionKeyFor('a', 'uuid-1')).not.toBe(adoptionKeyFor('b', 'uuid-1'));
  });
});

describe('condenseTitle', () => {
  it('cuts on a word boundary', () => {
    expect(condenseTitle('the quick brown fox jumps over', 20)).toBe('the quick brown fox…');
  });

  it('does not collapse a single long token to nothing', () => {
    expect(condenseTitle(`short ${'x'.repeat(100)}`, 20)).toHaveLength(21);
  });

  it('flattens newlines', () => {
    expect(condenseTitle('one\n\ntwo', 40)).toBe('one two');
  });
});

// ---------------------------------------------------------------------------

describe('scanSessions', () => {
  function scan(overrides: Partial<Parameters<typeof scanSessions>[0]> = {}) {
    return scanSessions({
      root: projectsRoot,
      machineName: MACHINE,
      repos: ['openconjecture/devpilot'],
      includePaths: false,
      existsImpl: () => false, // no scratchpads in a temp fixture
      ...overrides,
    });
  }

  beforeAll(() => {
    // Routed, fresh.
    writeTranscript({
      cwd: repoDirs.devpilot,
      sessionUuid: 'bbbbbbbb-0000-0000-0000-000000000001',
      projectSlug: 'slug-dp',
      customTitle: 'Adoption scanner',
      prompt: 'build the scanner',
      ageMs: 60_000,
    });
    // Routed, stale.
    writeTranscript({
      cwd: repoDirs.devpilot,
      sessionUuid: 'bbbbbbbb-0000-0000-0000-000000000002',
      projectSlug: 'slug-dp',
      customTitle: 'Ancient history',
      ageMs: 40 * 24 * 60 * 60 * 1000,
    });
    // A different client's repo — the §3.5 case.
    writeTranscript({
      cwd: repoDirs.arthaus,
      sessionUuid: 'bbbbbbbb-0000-0000-0000-000000000003',
      projectSlug: 'slug-arthaus',
      customTitle: 'Storefront copy',
      ageMs: 120_000,
    });
    // DevPilot's own.
    writeTranscript({
      cwd: repoDirs.devpilot,
      sessionUuid: 'bbbbbbbb-0000-0000-0000-000000000004',
      projectSlug: 'slug-dp',
      prompt: 'Your DevPilot session id is `sess_a`',
      ageMs: 60_000,
    });
    // No git remote at all.
    const orphan = join(workspace, 'orphan');
    mkdirSync(orphan, { recursive: true });
    writeTranscript({
      cwd: orphan,
      sessionUuid: 'bbbbbbbb-0000-0000-0000-000000000005',
      projectSlug: 'slug-orphan',
      customTitle: 'Scratch work',
      ageMs: 60_000,
    });
  });

  it('adopts only routed repos by default', () => {
    const result = scan();
    const repos = new Set(result.candidates.map((c) => c.repo));
    expect(repos).toEqual(new Set(['openconjecture/devpilot']));
  });

  it('names the owners it is withholding', () => {
    expect(withheldOwners(scan().skipped)).toContain('arthaus');
  });

  it('includes other repos under allRepos', () => {
    const repos = new Set(scan({ allRepos: true }).candidates.map((c) => c.repo));
    expect(repos).toContain('arthaus/storefront');
  });

  it('skips sessions older than the window, and says so', () => {
    const stale = scan().skipped.find(
      (s) => s.sessionUuid === 'bbbbbbbb-0000-0000-0000-000000000002',
    );
    expect(stale?.reason).toBe('too-old');
  });

  it('skips DevPilot-owned sessions', () => {
    const owned = scan().skipped.find(
      (s) => s.sessionUuid === 'bbbbbbbb-0000-0000-0000-000000000004',
    );
    expect(owned?.reason).toBe('devpilot-owned');
  });

  it('honours an explicit owned-session exclusion list', () => {
    const result = scan({
      excludeSessionUuids: new Set(['bbbbbbbb-0000-0000-0000-000000000001']),
    });
    expect(result.candidates.map((c) => c.adoptionKey)).not.toContain(
      adoptionKeyFor(MACHINE, 'bbbbbbbb-0000-0000-0000-000000000001'),
    );
  });

  it('counts directories with no resolvable repo instead of adopting them', () => {
    const result = scan();
    expect(result.unmappedProjectCount).toBeGreaterThanOrEqual(1);
    expect(result.candidates.every((c) => c.repo.includes('/'))).toBe(true);
  });

  it('produces an inventory covering repos it will not adopt', () => {
    const repos = new Set(scan().discovered.map((d) => d.repo));
    expect(repos).toContain('openconjecture/devpilot');
    // Discovery is the onboarding signal — it must see what adoption withholds.
    expect(repos).toContain('arthaus/storefront');
  });

  it('emits candidates that satisfy the published wire schema', () => {
    for (const candidate of scan({ allRepos: true }).candidates) {
      expect(AdoptionCandidateSchema.safeParse(candidate).success).toBe(true);
    }
  });

  it('emits inventory rows that satisfy the published wire schema', () => {
    for (const repo of scan({ allRepos: true }).discovered) {
      expect(DiscoveredRepoSchema.safeParse(repo).success).toBe(true);
    }
  });

  it('treats a live session as adoptable however old its last write is', () => {
    const result = scan({
      // Pretend every scratchpad exists: a thinking session writes nothing.
      existsImpl: () => true,
    });
    const uuids = result.skipped
      .filter((s) => s.reason === 'too-old')
      .map((s) => s.sessionUuid);
    expect(uuids).toHaveLength(0);
  });

  it('returns an empty result when the machine has never run Claude Code', () => {
    const result = scanSessions({
      root: join(workspace, 'does-not-exist'),
      machineName: MACHINE,
    });
    expect(result).toMatchObject({ candidates: [], discovered: [], projectDirCount: 0 });
  });

  it('collects changed file paths, and only paths, when asked', () => {
    writeFileSync(join(repoDirs.devpilot, 'dirty.ts'), 'export const secret = "hunter2";\n');
    clearRepoCache();
    const result = scan({ includePaths: true });
    const withPaths = result.candidates.find((c) => c.touchedPaths?.length);
    expect(withPaths?.touchedPaths).toContain('dirty.ts');
    expect(JSON.stringify(result)).not.toContain('hunter2');
    rmSync(join(repoDirs.devpilot, 'dirty.ts'));
    clearRepoCache();
  });
});

describe('loadOwnedSessionIds', () => {
  it('returns an empty set when the ledger is absent', () => {
    expect(loadOwnedSessionIds(join(workspace, 'nothing.json')).size).toBe(0);
  });

  it('returns an empty set for a corrupt ledger rather than throwing', () => {
    const path = join(workspace, 'corrupt.json');
    writeFileSync(path, '{ not json', 'utf8');
    expect(loadOwnedSessionIds(path).size).toBe(0);
  });

  it('reads a valid ledger', () => {
    const path = join(workspace, 'owned.json');
    writeFileSync(path, JSON.stringify({ version: 1, sessionIds: ['a', 'b'] }), 'utf8');
    expect(loadOwnedSessionIds(path)).toEqual(new Set(['a', 'b']));
  });
});

describe('heuristicTitle', () => {
  it('prefers the client-assigned title', () => {
    const observation = {
      sessionUuid: 'uuid',
      customTitle: 'Cockpit landing copy',
      firstHumanPrompt: 'a much longer thing the user typed',
    } as never;
    expect(heuristicTitle(observation)).toBe('Cockpit landing copy');
  });

  it('falls back to the prompt, then to the uuid', () => {
    expect(
      heuristicTitle({ sessionUuid: 'uuid', customTitle: null, firstHumanPrompt: 'do a thing' } as never),
    ).toBe('do a thing');
    expect(
      heuristicTitle({
        sessionUuid: 'deadbeef-1111',
        customTitle: null,
        firstHumanPrompt: null,
      } as never),
    ).toBe('Agent session deadbeef');
  });
});
