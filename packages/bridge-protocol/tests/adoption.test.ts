import { describe, it, expect } from 'vitest';
import {
  AdoptionCandidateSchema,
  AdoptionRequestSchema,
  DiscoveryRequestSchema,
  DiscoveredRepoSchema,
  ADOPTION_LIMITS,
  buildAdoptionComment,
  buildAdoptionIssueDescription,
  escapeLinearMarkdown,
  linearIdentifierFromBranch,
} from '../src/index';

const KEY = 'a'.repeat(64);

function candidate(overrides: Record<string, unknown> = {}) {
  return {
    adoptionKey: KEY,
    agent: 'claude-code',
    title: 'Fleet introspection and adoption',
    repo: 'openconjecture/devpilot',
    startedAt: '2026-08-21T06:00:00.000Z',
    lastActivityAt: '2026-08-21T07:00:00.000Z',
    live: true,
    ...overrides,
  };
}

describe('AdoptionCandidateSchema', () => {
  it('accepts a minimal candidate', () => {
    expect(AdoptionCandidateSchema.parse(candidate())).toMatchObject({
      agent: 'claude-code',
      repo: 'openconjecture/devpilot',
    });
  });

  /**
   * TRD 21 DECISION B, tested directly. These are the field names anyone
   * widening the contract would reach for first, and every one of them must be
   * a parse failure rather than a silently-ignored extra key.
   */
  it.each([
    'transcript',
    'messages',
    'prompt',
    'diff',
    'patch',
    'fileContents',
    'content',
  ])('rejects a candidate carrying `%s`', (field) => {
    const result = AdoptionCandidateSchema.safeParse(
      candidate({ [field]: 'anything at all' }),
    );
    expect(result.success).toBe(false);
  });

  it('rejects a repo that is not owner/name', () => {
    expect(AdoptionCandidateSchema.safeParse(candidate({ repo: 'devpilot' })).success).toBe(false);
    expect(
      AdoptionCandidateSchema.safeParse(candidate({ repo: '/Users/g/dev/devpilot' })).success,
    ).toBe(false);
  });

  it('rejects an adoptionKey that is not sha256 hex', () => {
    expect(AdoptionCandidateSchema.safeParse(candidate({ adoptionKey: 'short' })).success).toBe(
      false,
    );
    expect(
      AdoptionCandidateSchema.safeParse(candidate({ adoptionKey: 'Z'.repeat(64) })).success,
    ).toBe(false);
  });

  it('caps touchedPaths, because paths are the one new class of data', () => {
    const ok = candidate({
      touchedPaths: Array.from({ length: ADOPTION_LIMITS.MAX_TOUCHED_PATHS }, (_, i) => `src/${i}.ts`),
    });
    expect(AdoptionCandidateSchema.safeParse(ok).success).toBe(true);

    const tooMany = candidate({
      touchedPaths: Array.from(
        { length: ADOPTION_LIMITS.MAX_TOUCHED_PATHS + 1 },
        (_, i) => `src/${i}.ts`,
      ),
    });
    expect(AdoptionCandidateSchema.safeParse(tooMany).success).toBe(false);
  });

  it('caps the summary so a transcript cannot be smuggled through it', () => {
    const over = candidate({ summary: 'x'.repeat(ADOPTION_LIMITS.MAX_SUMMARY_CHARS + 1) });
    expect(AdoptionCandidateSchema.safeParse(over).success).toBe(false);
  });

  it('requires ISO timestamps', () => {
    expect(AdoptionCandidateSchema.safeParse(candidate({ startedAt: 'yesterday' })).success).toBe(
      false,
    );
  });
});

describe('AdoptionRequestSchema', () => {
  it('defaults dryRun to false', () => {
    const parsed = AdoptionRequestSchema.parse({
      machineName: 'Mac.lan',
      candidates: [candidate()],
    });
    expect(parsed.dryRun).toBe(false);
  });

  it('rejects an empty candidate list', () => {
    const result = AdoptionRequestSchema.safeParse({ machineName: 'Mac.lan', candidates: [] });
    expect(result.success).toBe(false);
  });

  it('bounds a single request', () => {
    const many = Array.from({ length: ADOPTION_LIMITS.MAX_CANDIDATES + 1 }, (_, i) =>
      candidate({ adoptionKey: i.toString(16).padStart(64, '0') }),
    );
    expect(
      AdoptionRequestSchema.safeParse({ machineName: 'Mac.lan', candidates: many }).success,
    ).toBe(false);
  });

  it('rejects unknown top-level keys', () => {
    const result = AdoptionRequestSchema.safeParse({
      machineName: 'Mac.lan',
      candidates: [candidate()],
      transcripts: ['…'],
    });
    expect(result.success).toBe(false);
  });
});

describe('DiscoveryRequestSchema', () => {
  it('accepts an inventory and defaults the unmapped count', () => {
    const parsed = DiscoveryRequestSchema.parse({
      machineName: 'Mac.lan',
      repos: [
        {
          repo: 'openconjecture/devpilot',
          owner: 'openconjecture',
          host: 'github.com',
          projectCount: 3,
          sessionCount: 7,
          liveSessionCount: 2,
          lastActivityAt: '2026-08-21T07:00:00.000Z',
        },
      ],
    });
    expect(parsed.unmappedProjectCount).toBe(0);
  });

  it('accepts an empty inventory — a machine with no agent history is normal', () => {
    expect(
      DiscoveryRequestSchema.safeParse({ machineName: 'Mac.lan', repos: [] }).success,
    ).toBe(true);
  });

  it('rejects a local path masquerading as a repo', () => {
    expect(
      DiscoveredRepoSchema.safeParse({
        repo: '/Users/garrett/dev/devpilot',
        owner: 'garrett',
        host: 'local',
        projectCount: 1,
        sessionCount: 1,
        liveSessionCount: 0,
        lastActivityAt: null,
      }).success,
    ).toBe(false);
  });
});

describe('escapeLinearMarkdown', () => {
  it('neutralises a link injection', () => {
    const out = escapeLinearMarkdown('[click](javascript:alert(1))');
    expect(out).not.toContain('](');
    expect(out).toContain('\\[');
  });

  it('neutralises a fence that would swallow the rest of the comment', () => {
    expect(escapeLinearMarkdown('```\nrest')).not.toContain('```');
  });

  it('flattens newlines', () => {
    expect(escapeLinearMarkdown('one\ntwo')).toBe('one two');
  });

  it('escapes backslashes before anything else, so escapes cannot be escaped', () => {
    expect(escapeLinearMarkdown('a\\*b')).toBe('a\\\\\\*b');
  });
});

describe('buildAdoptionComment', () => {
  const base = {
    identifier: 'AVA-31',
    machineName: 'Mac.lan',
    agent: 'claude-code' as const,
    startedAt: '2026-08-21T06:00:00.000Z',
    lastActivityAt: '2026-08-21T07:30:00.000Z',
  };

  it('says it was observed, and never says completed', () => {
    const body = buildAdoptionComment(base);
    expect(body).toContain('Agent session observed');
    expect(body).toContain('DevPilot did not start this session');
    expect(body.toLowerCase()).not.toContain('completed');
  });

  it('states that the issue was not moved', () => {
    expect(buildAdoptionComment(base)).toContain('This issue was not moved');
  });

  it('renders a duration', () => {
    expect(buildAdoptionComment(base)).toContain('1h 30m');
    expect(
      buildAdoptionComment({ ...base, lastActivityAt: '2026-08-21T06:00:10.000Z' }),
    ).toContain('under a minute');
  });

  it('survives a reversed clock rather than printing nonsense', () => {
    const body = buildAdoptionComment({
      ...base,
      lastActivityAt: '2026-08-20T06:00:00.000Z',
    });
    expect(body).toContain('an unknown duration');
  });

  it('truncates a long file list', () => {
    const body = buildAdoptionComment({
      ...base,
      touchedPaths: Array.from({ length: 14 }, (_, i) => `src/file-${i}.ts`),
    });
    expect(body).toContain('… and 4 more');
  });

  it('escapes an injected summary', () => {
    const body = buildAdoptionComment({ ...base, summary: '[x](javascript:1)' });
    expect(body).not.toContain('](javascript');
  });
});

describe('buildAdoptionIssueDescription', () => {
  it('states the provenance and the status caveat', () => {
    const body = buildAdoptionIssueDescription({
      machineName: 'Mac.lan',
      agent: 'claude-code',
      repo: 'openconjecture/devpilot',
      startedAt: '2026-08-21T06:00:00.000Z',
    });
    expect(body).toContain('already running');
    expect(body).toContain('observed this session; it did not dispatch it');
  });
});

describe('linearIdentifierFromBranch', () => {
  it.each([
    ['AVA-31-fleet-scan', 'AVA-31'],
    ['feature/AVA-31', 'AVA-31'],
    ['garrett/ava-31-adoption', 'AVA-31'],
    ['ENG-4', 'ENG-4'],
    ['fix/DP-1234-thing', 'DP-1234'],
  ])('reads %s as %s', (branch, expected) => {
    expect(linearIdentifierFromBranch(branch)).toBe(expected);
  });

  it.each(['main', 'release-2026', 'conductor/arena-foundations', 'v1-2-3'])(
    'finds nothing in %s',
    (branch) => {
      expect(linearIdentifierFromBranch(branch)).toBeNull();
    },
  );

  it('does not read a date as an identifier', () => {
    expect(linearIdentifierFromBranch('work-2026-08-09')).toBeNull();
  });
});
