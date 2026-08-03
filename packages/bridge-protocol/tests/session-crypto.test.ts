import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  sessionCrypto,
  buildJoinLink,
  parseJoinLink,
  SessionKeyError,
  SessionDecryptionError,
} from '../src/index';

/**
 * TRD 06 §8.1 (crypto round-trip), §8.2 (server blindness), §8.3 (join proof).
 *
 * The tests that matter most here are the NEGATIVE ones. A round-trip test only
 * proves the happy path composes; it says nothing about whether the design
 * actually withholds anything from the server. §5's original join proof would
 * have passed a round-trip suite with full marks.
 */

/** Bytes 0x00..0x1f. Deterministic so any implementation can reproduce it. */
const GOLDEN_KEY = 'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8';

describe('sessionCrypto.generateKey', () => {
  it('produces a 32-byte base64url key with no padding', () => {
    const key = sessionCrypto.generateKey();
    expect(key).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(key).not.toContain('=');
    expect(Buffer.from(key, 'base64url')).toHaveLength(32);
  });

  it('does not repeat', () => {
    const keys = new Set(Array.from({ length: 200 }, () => sessionCrypto.generateKey()));
    expect(keys.size).toBe(200);
  });
});

describe('encrypt / decrypt round-trip', () => {
  it.each([
    ['ascii', 'the checkout 500s are coming from the retry wrapper'],
    ['empty', ''],
    ['unicode', 'ünïcode ✅ 日本語 🔐 — em-dash and all'],
    ['json', JSON.stringify({ file: 'src/app.ts', diff: '- a\n+ b' })],
    ['newlines', 'line one\nline two\r\nline three\t\ttabbed'],
  ])('round-trips %s', async (_label, plain) => {
    const key = sessionCrypto.generateKey();
    expect(await sessionCrypto.decrypt(await sessionCrypto.encrypt(plain, key), key)).toBe(plain);
  });

  it('round-trips a payload larger than a typical agent output dump', async () => {
    const key = sessionCrypto.generateKey();
    const plain = 'x'.repeat(200_000);
    expect(await sessionCrypto.decrypt(await sessionCrypto.encrypt(plain, key), key)).toBe(plain);
  });

  it('emits the iv.ciphertext.tag format used by lib/bridge/crypto.ts', async () => {
    const parts = (await sessionCrypto.encrypt('hello', GOLDEN_KEY)).split('.');
    expect(parts).toHaveLength(3);
    expect(Buffer.from(parts[0], 'base64')).toHaveLength(12); // 96-bit GCM nonce
    expect(Buffer.from(parts[2], 'base64')).toHaveLength(16); // 128-bit tag
  });

  /**
   * Nonce reuse under one key is catastrophic for GCM. If someone ever derives
   * the IV from the plaintext or from `seq` to make messages deduplicable, this
   * fails.
   */
  it('never reuses an IV for the same plaintext and key', async () => {
    const key = sessionCrypto.generateKey();
    const seen = new Set<string>();
    for (let i = 0; i < 50; i++) {
      seen.add((await sessionCrypto.encrypt('identical', key)).split('.')[0]);
    }
    expect(seen.size).toBe(50);
  });

  it('reuses a derived key via open() with identical results', async () => {
    const key = sessionCrypto.generateKey();
    const cipher = await sessionCrypto.open(key);
    const sealed = await cipher.encrypt('via handle');
    // Cross-check: the bound handle and the one-shot API agree on the format.
    expect(await sessionCrypto.decrypt(sealed, key)).toBe('via handle');
    expect(await cipher.decrypt(await sessionCrypto.encrypt('via one-shot', key))).toBe('via one-shot');
  });
});

describe('decrypt rejects everything it should', () => {
  it('throws on the wrong key rather than returning garbage', async () => {
    const sealed = await sessionCrypto.encrypt('secret', sessionCrypto.generateKey());
    await expect(sessionCrypto.decrypt(sealed, sessionCrypto.generateKey())).rejects.toThrow(
      SessionDecryptionError,
    );
  });

  it.each([0, 1, 2])('throws when part %i is tampered with', async (partIndex) => {
    const key = sessionCrypto.generateKey();
    const parts = (await sessionCrypto.encrypt('secret', key)).split('.');
    const bytes = Buffer.from(parts[partIndex], 'base64');
    bytes[0] ^= 0xff;
    parts[partIndex] = bytes.toString('base64');
    await expect(sessionCrypto.decrypt(parts.join('.'), key)).rejects.toThrow(SessionDecryptionError);
  });

  it.each([
    ['too few parts', 'aaa.bbb'],
    ['too many parts', 'aaa.bbb.ccc.ddd'],
    ['empty', ''],
    ['not base64', '!!!.???.***'],
    ['short iv', `${Buffer.alloc(4).toString('base64')}.YWJj.${Buffer.alloc(16).toString('base64')}`],
    ['short tag', `${Buffer.alloc(12).toString('base64')}.YWJj.${Buffer.alloc(4).toString('base64')}`],
  ])('throws on malformed input: %s', async (_label, payload) => {
    await expect(sessionCrypto.decrypt(payload, GOLDEN_KEY)).rejects.toThrow(SessionDecryptionError);
  });

  it.each([
    ['truncated key', 'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwd'],
    ['empty key', ''],
    ['not base64', '!!!not-a-key!!!'],
  ])('throws SessionKeyError on %s', async (_label, badKey) => {
    await expect(sessionCrypto.encrypt('x', badKey)).rejects.toThrow(SessionKeyError);
  });
});

describe('HKDF split — the §5 join-proof correction', () => {
  it('derives a stable verifier and hash (golden vector)', async () => {
    /**
     * PINNED. These come from HKDF-SHA256 over the session key with the salt
     * 'devpilot-session/v1' and info 'dp-session-verify/v1'. If a change to
     * those constants lands, this fails — which is the point: the browser, the
     * CLI and the MCP server must derive identically or Alice's ciphertext is
     * undecryptable by Bob and the failure shows up in production, not here.
     */
    const creds = await sessionCrypto.deriveJoinCredentials(GOLDEN_KEY);
    expect(creds.verifier).toBe('dFtUBBxxCo12DTrYlzo4yIaX5q9ea1MMihy2Xivttto');
    expect(creds.joinKeyHash).toBe(
      '134f7f759e61e80e023f07c1c8f953a61abcad830c7084b5710adc54e2d65e2f',
    );
  });

  it('decrypts a ciphertext sealed by a previous build (golden vector)', async () => {
    // Guards the CONTENT branch the same way, and would catch a change to the
    // 'dp-session-content/v1' info string that a round-trip test cannot see.
    const sealed =
      'i+1dajVv6irg4bdH.YdvRs9ijpQZICFdosWNIMiBch/gjHBLZVaE69Q==.Z18yjVq220E1wDmDScdwRQ==';
    expect(await sessionCrypto.decrypt(sealed, GOLDEN_KEY)).toBe('shared session golden vector');
  });

  it('produces a verifier that is not the key', async () => {
    const key = sessionCrypto.generateKey();
    const { verifier } = await sessionCrypto.deriveJoinCredentials(key);
    expect(verifier).not.toBe(key);
  });

  /**
   * THE LOAD-BEARING TEST for the HKDF split. The verifier is a valid 32-byte
   * base64url string, so it is shaped exactly like a key. If both branches
   * collapsed to one secret, the server — which receives the verifier on every
   * join — could decrypt the whole transcript, and §3.2 would be a lie.
   */
  it('cannot decrypt with the verifier, which the server receives', async () => {
    const key = sessionCrypto.generateKey();
    const { verifier } = await sessionCrypto.deriveJoinCredentials(key);
    const sealed = await sessionCrypto.encrypt('the server must never read this', key);
    await expect(sessionCrypto.decrypt(sealed, verifier)).rejects.toThrow(SessionDecryptionError);
  });

  it('yields a 64-char lowercase hex hash, matching the route schemas', async () => {
    const { joinKeyHash } = await sessionCrypto.deriveJoinCredentials(sessionCrypto.generateKey());
    expect(joinKeyHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('accepts the right verifier and rejects a wrong one', async () => {
    const key = sessionCrypto.generateKey();
    const { verifier, joinKeyHash } = await sessionCrypto.deriveJoinCredentials(key);
    const other = await sessionCrypto.deriveJoinCredentials(sessionCrypto.generateKey());

    expect(await sessionCrypto.verifyJoinProof(verifier, joinKeyHash)).toBe(true);
    expect(await sessionCrypto.verifyJoinProof(other.verifier, joinKeyHash)).toBe(false);
  });

  /**
   * REGRESSION GUARD for the defect this design was written to fix.
   *
   * §5 originally had the client send sha256(key) and the server compare it to
   * the stored joinKeyHash — making the stored column directly replayable, so a
   * leaked backup or a read-only insider could join any session. Under the
   * split, presenting the stored hash as a proof fails, because the hash is
   * sha256(verifier) and the server hashes whatever it is handed.
   *
   * If this ever passes, the two values have been collapsed back into one and
   * the database has become a set of session credentials again.
   */
  it('rejects the stored hash when replayed as a proof', async () => {
    const { joinKeyHash } = await sessionCrypto.deriveJoinCredentials(sessionCrypto.generateKey());
    expect(await sessionCrypto.verifyJoinProof(joinKeyHash, joinKeyHash)).toBe(false);
  });

  it('rejects a rotated session, so old links stop working (T6-AC-07)', async () => {
    const oldKey = sessionCrypto.generateKey();
    const oldProof = (await sessionCrypto.deriveJoinCredentials(oldKey)).verifier;
    const rotated = await sessionCrypto.deriveJoinCredentials(sessionCrypto.generateKey());

    expect(await sessionCrypto.verifyJoinProof(oldProof, rotated.joinKeyHash)).toBe(false);
  });

  it('keeps pre-rotation ciphertext readable with the pre-rotation key', async () => {
    // Rotation stops FUTURE reads; it does not retract past access. Stating
    // that honestly (§4.4) means asserting it, not hoping nobody checks.
    const oldKey = sessionCrypto.generateKey();
    const sealed = await sessionCrypto.encrypt('posted before rotation', oldKey);
    sessionCrypto.generateKey(); // rotation happens
    expect(await sessionCrypto.decrypt(sealed, oldKey)).toBe('posted before rotation');
  });
});

describe('join links', () => {
  it('round-trips id and key', () => {
    const key = sessionCrypto.generateKey();
    expect(parseJoinLink(buildJoinLink('https://devpilot.sh', 'sess_abc', key))).toEqual({
      sessionId: 'sess_abc',
      key,
    });
  });

  /** §4.4: the key lives in the fragment, which browsers do not transmit. */
  it('puts the key after the # and nowhere else', () => {
    const key = sessionCrypto.generateKey();
    const link = buildJoinLink('https://devpilot.sh', 'sess_abc', key);
    const [beforeHash, afterHash] = link.split('#');

    expect(beforeHash).not.toContain(key);
    expect(afterHash).toBe(`k=${key}`);
  });

  it('tolerates a trailing slash on the base url', () => {
    const key = sessionCrypto.generateKey();
    expect(buildJoinLink('https://devpilot.sh///', 'sess_abc', key)).toBe(
      `https://devpilot.sh/s/sess_abc#k=${key}`,
    );
  });

  it.each([
    ['no fragment', 'https://devpilot.sh/s/sess_abc'],
    ['fragment without k=', 'https://devpilot.sh/s/sess_abc#other=1'],
    ['no /s/ path', 'https://devpilot.sh/sessions/sess_abc#k=AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8'],
    ['truncated key', 'https://devpilot.sh/s/sess_abc#k=AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwd'],
  ])('rejects a link with %s', (_label, link) => {
    expect(() => parseJoinLink(link)).toThrow(SessionKeyError);
  });

  /** Fail at parse, not at the first decrypt three screens later. */
  it('validates key length at parse time', () => {
    expect(() => parseJoinLink('https://devpilot.sh/s/sess_abc#k=AAAA')).toThrow(
      /must decode to 32 bytes/,
    );
  });
});

/**
 * §8.1 requires this to work in the browser too. jsdom does not implement
 * SubtleCrypto, so a jsdom run would fail for reasons unrelated to our code and
 * prove nothing. Instead: assert the module reaches for no API a browser lacks.
 *
 * NOT PROVEN by this file: execution in a real browser engine. That is
 * T6-W5-T1's join page, which is the first consumer that actually runs this in
 * one. Until then the guarantee here is static, and this comment says so rather
 * than letting a green suite imply more than it checked.
 */
describe('browser compatibility (static)', () => {
  const rawSource = readFileSync(join(__dirname, '../src/session-crypto.ts'), 'utf8');

  /**
   * Comments discuss Buffer at length — explaining why the module does not use
   * it — so matching raw source would fail on its own documentation. Strip
   * comments and check the CODE.
   */
  const code = rawSource
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:\\])\/\/.*$/gm, '$1');

  /**
   * The stripper is the thing this section's guarantee rests on, so it is
   * checked rather than trusted: over-strip and every assertion below passes
   * vacuously.
   */
  it('strips comments without eating code', () => {
    expect(code).toContain('subtle.encrypt(');
    expect(code).toContain('getRandomValues');
    expect(code).not.toContain('Hand-rolled rather than');
  });

  it.each([
    ['Buffer', /\bBuffer\b/],
    ['node: imports', /from\s+'node:/],
    ['require()', /\brequire\(/],
    ['process.', /\bprocess\./],
  ])('does not reference %s', (_label, pattern) => {
    expect(code).not.toMatch(pattern);
  });

  it('round-trips with Node-only globals removed', async () => {
    const savedBuffer = globalThis.Buffer;
    const savedProcess = globalThis.process;
    try {
      // @ts-expect-error — simulating a runtime where these do not exist.
      delete globalThis.Buffer;
      // @ts-expect-error — same.
      delete globalThis.process;

      const key = sessionCrypto.generateKey();
      const creds = await sessionCrypto.deriveJoinCredentials(key);
      const sealed = await sessionCrypto.encrypt('browser-shaped runtime', key);

      expect(await sessionCrypto.decrypt(sealed, key)).toBe('browser-shaped runtime');
      expect(await sessionCrypto.verifyJoinProof(creds.verifier, creds.joinKeyHash)).toBe(true);
    } finally {
      globalThis.Buffer = savedBuffer;
      globalThis.process = savedProcess;
    }
  });
});
