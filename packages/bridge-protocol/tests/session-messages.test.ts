import { describe, it, expect } from 'vitest';
import {
  SessionMessageSchema,
  SessionParticipantSchema,
  SharedSessionSchema,
  CreateSharedSessionRequestSchema,
  JoinSessionRequestSchema,
  PostSessionMessageRequestSchema,
  SessionMessagePageSchema,
  SetSessionModeRequestSchema,
  RotateSessionKeyRequestSchema,
  SESSION_LIMITS,
  JOIN_PROOF_HEADER,
  parseSessionMessage,
  safeParseSessionMessage,
} from '../src/index';

/** TRD 06 §6.1 — the shared-session wire contract. */

const validMessage = {
  id: 'msg_1',
  sessionId: 'sess_1',
  participantId: 'part_1',
  ciphertext: 'aXY=.Y3Q=.dGFn',
  keyVersion: 1,
  kind: 'chat' as const,
  seq: 1,
  createdAt: '2026-08-03T10:00:00.000Z',
};

describe('SessionMessage', () => {
  it('round-trips a valid message', () => {
    expect(parseSessionMessage(validMessage)).toEqual(validMessage);
  });

  it('allows a null participant so a message outlives the participant row', () => {
    expect(safeParseSessionMessage({ ...validMessage, participantId: null }).success).toBe(true);
  });

  it.each([
    ['seq 0', { seq: 0 }],
    ['negative seq', { seq: -1 }],
    ['fractional seq', { seq: 1.5 }],
    ['keyVersion 0', { keyVersion: 0 }],
    ['empty ciphertext', { ciphertext: '' }],
    ['unknown kind', { kind: 'diff' }],
    ['non-ISO createdAt', { createdAt: 'yesterday' }],
  ])('rejects %s', (_label, patch) => {
    expect(safeParseSessionMessage({ ...validMessage, ...patch }).success).toBe(false);
  });

  /**
   * `seq` is 1-based and assigned by the server. A client that invents one must
   * not be able to smuggle it through PostSessionMessageRequest — §8.4's
   * ordering guarantee depends on the server owning this number outright.
   */
  it('has no seq field on the post request', () => {
    const parsed = PostSessionMessageRequestSchema.safeParse({
      ciphertext: 'aXY=.Y3Q=.dGFn',
      keyVersion: 1,
      seq: 99,
    });
    expect(parsed.success).toBe(false);
  });
});

describe('CreateSharedSessionRequest', () => {
  const valid = { title: 'Fixing the checkout 500s', joinKeyHash: 'a'.repeat(64) };

  it('accepts a title and a hash', () => {
    expect(CreateSharedSessionRequestSchema.parse(valid)).toEqual(valid);
  });

  /**
   * T6-AC-02, enforced at the type boundary rather than by review.
   *
   * `.strict()` is what makes this a parse failure instead of a field that
   * rides along to the server. A client that accidentally spreads its whole
   * session object into the create call gets a 400, not a leaked key.
   */
  it.each(['key', 'sessionKey', 'k', 'verifier', 'joinVerifier'])(
    'refuses to carry a `%s` field',
    (field) => {
      const parsed = CreateSharedSessionRequestSchema.safeParse({ ...valid, [field]: 'secret' });
      expect(parsed.success).toBe(false);
    },
  );

  it.each([
    ['uppercase hex', 'A'.repeat(64)],
    ['too short', 'a'.repeat(63)],
    ['too long', 'a'.repeat(65)],
    ['not hex', 'z'.repeat(64)],
    ['a base64url key', 'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8'],
  ])('rejects a joinKeyHash that is %s', (_label, joinKeyHash) => {
    expect(CreateSharedSessionRequestSchema.safeParse({ ...valid, joinKeyHash }).success).toBe(false);
  });

  it('applies the same rule to rotation', () => {
    expect(RotateSessionKeyRequestSchema.safeParse({ joinKeyHash: 'b'.repeat(64) }).success).toBe(true);
    expect(
      RotateSessionKeyRequestSchema.safeParse({ joinKeyHash: 'b'.repeat(64), key: 'oops' }).success,
    ).toBe(false);
  });
});

describe('JoinSessionRequest', () => {
  it('defaults a joiner to human', () => {
    expect(JoinSessionRequestSchema.parse({ displayName: 'Alice' }).kind).toBe('human');
  });

  it('accepts an agent bound to an orchestrator', () => {
    const parsed = JoinSessionRequestSchema.parse({
      displayName: "Alice's Claude Code",
      kind: 'agent',
      agentKind: 'claude-code',
      orchestratorId: 'orch_1',
    });
    expect(parsed.agentKind).toBe('claude-code');
  });

  it('carries the proof in a header, never the body', () => {
    expect(JOIN_PROOF_HEADER).toBe('x-session-key-proof');
    expect(JoinSessionRequestSchema.safeParse({ displayName: 'A', proof: 'x' }).success).toBe(false);
  });

  it('rejects an empty or oversized display name', () => {
    expect(JoinSessionRequestSchema.safeParse({ displayName: '' }).success).toBe(false);
    expect(JoinSessionRequestSchema.safeParse({ displayName: 'x'.repeat(121) }).success).toBe(false);
  });
});

describe('PostSessionMessageRequest', () => {
  it('defaults kind to chat', () => {
    const parsed = PostSessionMessageRequestSchema.parse({ ciphertext: 'a.b.c', keyVersion: 1 });
    expect(parsed.kind).toBe('chat');
  });

  it('rejects ciphertext beyond the documented cap', () => {
    const oversized = 'x'.repeat(SESSION_LIMITS.maxCiphertextBytes + 1);
    expect(
      PostSessionMessageRequestSchema.safeParse({ ciphertext: oversized, keyVersion: 1 }).success,
    ).toBe(false);
  });

  it('accepts a client nonce for retry deduplication', () => {
    const parsed = PostSessionMessageRequestSchema.parse({
      ciphertext: 'a.b.c',
      keyVersion: 1,
      clientNonce: 'n_01234567',
    });
    expect(parsed.clientNonce).toBe('n_01234567');
  });
});

describe('SetSessionModeRequest', () => {
  it.each(['observe', 'relay'])('accepts %s with no bounds', (mode) => {
    expect(SetSessionModeRequestSchema.safeParse({ mode }).success).toBe(true);
  });

  /**
   * DECISION A (§3.3), enforced in the schema rather than in a handler.
   *
   * `auto` without both a budget and a TTL is unrepresentable — the same move
   * TRD 05 made with enqueueDispatch's transaction handle. An unbounded `auto`
   * cannot be constructed, so no route can accidentally allow one.
   */
  it.each([
    ['neither bound', {}],
    ['budget only', { autoBudget: 20 }],
    ['ttl only', { autoTtlMinutes: 30 }],
  ])('rejects auto with %s', (_label, patch) => {
    expect(SetSessionModeRequestSchema.safeParse({ mode: 'auto', ...patch }).success).toBe(false);
  });

  it('accepts auto when both bounds are present', () => {
    const parsed = SetSessionModeRequestSchema.parse({
      mode: 'auto',
      autoBudget: SESSION_LIMITS.autoDefaultBudget,
      autoTtlMinutes: SESSION_LIMITS.autoDefaultTtlMinutes,
    });
    expect(parsed).toMatchObject({ mode: 'auto', autoBudget: 20, autoTtlMinutes: 30 });
  });

  it('caps how far the bounds can be pushed', () => {
    expect(
      SetSessionModeRequestSchema.safeParse({ mode: 'auto', autoBudget: 10_000, autoTtlMinutes: 30 })
        .success,
    ).toBe(false);
    expect(
      SetSessionModeRequestSchema.safeParse({ mode: 'auto', autoBudget: 20, autoTtlMinutes: 10_000 })
        .success,
    ).toBe(false);
  });
});

describe('what the server hands back', () => {
  /**
   * §3.2's "server cannot see" column, asserted structurally. If someone adds a
   * plaintext `body` or `preview` to keep the portal list from looking empty,
   * this is the test that should stop them.
   */
  it('exposes no plaintext content field on a message', () => {
    const keys = Object.keys(SessionMessageSchema.shape);
    expect(keys).toEqual([
      'id',
      'sessionId',
      'participantId',
      'ciphertext',
      'keyVersion',
      'kind',
      'seq',
      'createdAt',
    ]);
  });

  /** A participant may be from another org, so org internals must not ride along. */
  it('leaks neither orgId nor joinKeyHash to a participant', () => {
    const keys = Object.keys(SharedSessionSchema.shape);
    expect(keys).not.toContain('orgId');
    expect(keys).not.toContain('joinKeyHash');
    expect(keys).not.toContain('createdByUserId');
  });

  it('parses a message page with a cursor', () => {
    const page = SessionMessagePageSchema.parse({
      messages: [validMessage],
      latestSeq: 1,
      hasMore: false,
    });
    expect(page.messages).toHaveLength(1);
  });

  it('accepts an empty first page with latestSeq 0', () => {
    expect(
      SessionMessagePageSchema.safeParse({ messages: [], latestSeq: 0, hasMore: false }).success,
    ).toBe(true);
  });

  it('accepts a participant record', () => {
    const parsed = SessionParticipantSchema.parse({
      id: 'part_1',
      sessionId: 'sess_1',
      kind: 'agent',
      displayName: "Bob's Codex",
      agentKind: 'codex',
      joinedAt: '2026-08-03T10:00:00.000Z',
      lastSeenAt: null,
      leftAt: null,
    });
    expect(parsed.kind).toBe('agent');
  });
});
