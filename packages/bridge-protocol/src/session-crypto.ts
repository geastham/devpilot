/**
 * sessionCrypto — TRD 06 §4.4, §6.1. End-to-end encryption for shared sessions.
 *
 * THE INVARIANT THIS FILE EXISTS TO ENFORCE: the session key never reaches
 * devpilot.sh. It is generated on a client, lives in the URL fragment (which
 * browsers do not transmit), and is held in process memory by the CLI and the
 * MCP server. The hosted plane stores one hash and relays opaque bytes.
 *
 * Contrast with the website's lib/bridge/crypto.ts, which encrypts Linear
 * credentials with a SERVER-held key (BRIDGE_ENCRYPTION_KEY). That is correct
 * there — the server must use those credentials. It is wrong here, because a
 * server-held key means the server can read the transcript, which is the whole
 * thing we are claiming it cannot do.
 *
 * ─── Key derivation (TRD 06 §5, as corrected) ───────────────────────────────
 *
 * The spec's original join proof was "client sends sha256(key), server compares
 * to the stored joinKeyHash". That makes the stored column DIRECTLY REPLAYABLE:
 * the value in the database is the same value the wire accepts, so a leaked
 * backup or a read-only insider can join any session. It is the store-the-
 * password-verbatim mistake.
 *
 * So one root secret is split into two independent HKDF branches:
 *
 *   k            32 random bytes, base64url — the fragment value, never sent
 *    ├─ HKDF(k, "content") ──▶ encKey        AES-256-GCM key. Never leaves the client.
 *    └─ HKDF(k, "verify")  ──▶ joinVerifier  sent as the join proof
 *                                  │
 *                                  └─ sha256 ──▶ joinKeyHash   what we store
 *
 * A database read yields only sha256(verifier), which cannot be used to join and
 * cannot decrypt anything. The verifier is a different branch from the content
 * key, so possessing it never yields plaintext. And §7.1 — "the key never
 * reaches the server" — becomes literally true, which under the original
 * formulation it was not: sha256(key) is a function of the key, sent on every
 * request.
 *
 * ─── Why this API is async ──────────────────────────────────────────────────
 *
 * §6.1 sketched synchronous signatures. That is not implementable against
 * WebCrypto, whose SubtleCrypto operations are all promise-returning, and
 * WebCrypto is the only AES implementation present in BOTH Node 18+ and the
 * browser. The alternatives were a Node/browser split (two implementations, the
 * exact drift TRD 05 deleted packages/bridge to prevent) or shipping a hand
 * rolled AES in JS (worse in every way). One async implementation, three
 * consumers. The spec is corrected rather than the code contorted.
 */

const KEY_BYTES = 32;
const IV_BYTES = 12; // 96-bit nonce — the GCM standard, not a truncated 16.
const TAG_BYTES = 16;
const TAG_BITS = TAG_BYTES * 8;

/**
 * Domain separation for the two HKDF branches. These strings are part of the
 * wire contract: every consumer must derive identically or Alice's ciphertext
 * is undecryptable by Bob. Versioned so a future scheme can coexist.
 */
const HKDF_SALT = 'devpilot-session/v1';
const INFO_CONTENT = 'dp-session-content/v1';
const INFO_VERIFY = 'dp-session-verify/v1';

export class SessionCryptoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SessionCryptoError';
  }
}

export class SessionKeyError extends SessionCryptoError {
  constructor(message: string) {
    super(message);
    this.name = 'SessionKeyError';
  }
}

export class SessionDecryptionError extends SessionCryptoError {
  constructor(message: string) {
    super(message);
    this.name = 'SessionDecryptionError';
  }
}

// ── Platform access ─────────────────────────────────────────────────────────
//
// `Crypto`, `CryptoKey` and `SubtleCrypto` are lib.dom types, and this package
// does not take the DOM lib: a protocol module has no business being able to
// reference `document` or `window`. Pulling DOM in for three type names would
// hand it both.
//
// So the exact WebCrypto subset in use is declared here instead. It doubles as
// the honest inventory of what this file needs from its host — six operations,
// nothing else — which is what makes "runs in Node and the browser" a claim you
// can check rather than one you have to take on trust.

/** Opaque handle. We never inspect a key, only pass it back to SubtleCrypto. */
interface CryptoKeyHandle {
  readonly __webCryptoKey?: never;
}

type BinaryInput = ArrayBuffer | ArrayBufferView;

interface WebCryptoSubtle {
  importKey(
    format: 'raw',
    keyData: BinaryInput,
    algorithm: unknown,
    extractable: boolean,
    usages: string[],
  ): Promise<CryptoKeyHandle>;
  deriveBits(algorithm: unknown, baseKey: CryptoKeyHandle, length: number): Promise<ArrayBuffer>;
  encrypt(algorithm: unknown, key: CryptoKeyHandle, data: BinaryInput): Promise<ArrayBuffer>;
  decrypt(algorithm: unknown, key: CryptoKeyHandle, data: BinaryInput): Promise<ArrayBuffer>;
  digest(algorithm: 'SHA-256', data: BinaryInput): Promise<ArrayBuffer>;
}

interface WebCryptoLike {
  getRandomValues<T extends ArrayBufferView>(array: T): T;
  subtle: WebCryptoSubtle;
}

function subtleCrypto(): WebCryptoLike {
  const c = (globalThis as { crypto?: WebCryptoLike }).crypto;
  if (!c || !c.subtle) {
    throw new SessionCryptoError(
      'WebCrypto is unavailable. Shared sessions require Node 18+ or a browser ' +
        'with a secure context (https or localhost).',
    );
  }
  return c;
}

const utf8 = new TextEncoder();

// ── base64 / base64url ──────────────────────────────────────────────────────
//
// Hand-rolled rather than Buffer (Node-only) or btoa (browser-only, and
// deprecated in Node). Platform branching here would mean the encoding could
// differ between the CLI and the browser, which is precisely the failure §8.1
// tests for. One code path, byte-identical everywhere.

const B64_STD = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const B64_URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/** Accepts both alphabets — `-_` and `+/` do not collide, so decode is permissive. */
const B64_REVERSE = (() => {
  const map = new Int16Array(128).fill(-1);
  for (let i = 0; i < 64; i++) {
    map[B64_STD.charCodeAt(i)] = i;
    map[B64_URL.charCodeAt(i)] = i;
  }
  return map;
})();

function toBase64(bytes: Uint8Array, urlSafe: boolean): string {
  const alpha = urlSafe ? B64_URL : B64_STD;
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1: number | undefined = bytes[i + 1];
    const b2: number | undefined = bytes[i + 2];
    out += alpha[b0 >> 2];
    out += alpha[((b0 & 0x03) << 4) | ((b1 ?? 0) >> 4)];
    if (b1 === undefined) {
      if (!urlSafe) out += '==';
      break;
    }
    out += alpha[((b1 & 0x0f) << 2) | ((b2 ?? 0) >> 6)];
    if (b2 === undefined) {
      if (!urlSafe) out += '=';
      break;
    }
    out += alpha[b2 & 0x3f];
  }
  return out;
}

function fromBase64(text: string): Uint8Array {
  const out: number[] = [];
  let acc = 0;
  let bits = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code === 0x3d /* = */) break; // padding ends the payload
    const value = code < 128 ? B64_REVERSE[code] : -1;
    if (value < 0) {
      throw new SessionCryptoError('Malformed base64 payload.');
    }
    acc = (acc << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out.push((acc >> bits) & 0xff);
    }
  }
  return new Uint8Array(out);
}

function toHex(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i].toString(16).padStart(2, '0');
  }
  return out;
}

// ── Key material ────────────────────────────────────────────────────────────

/** Decode and validate a session key. Throws rather than deriving from garbage. */
function parseKey(key: string): Uint8Array {
  let raw: Uint8Array;
  try {
    raw = fromBase64(key);
  } catch {
    throw new SessionKeyError('Session key is not valid base64url.');
  }
  if (raw.length !== KEY_BYTES) {
    throw new SessionKeyError(
      `Session key must decode to ${KEY_BYTES} bytes, got ${raw.length}. ` +
        'The link is truncated or was not produced by sessionCrypto.generateKey().',
    );
  }
  return raw;
}

async function deriveBits(key: string, info: string, lengthBits: number): Promise<Uint8Array> {
  const c = subtleCrypto();
  const ikm = await c.subtle.importKey('raw', parseKey(key), 'HKDF', false, ['deriveBits']);
  const bits = await c.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: utf8.encode(HKDF_SALT), info: utf8.encode(info) },
    ikm,
    lengthBits,
  );
  return new Uint8Array(bits);
}

async function deriveContentKey(key: string): Promise<CryptoKeyHandle> {
  const raw = await deriveBits(key, INFO_CONTENT, KEY_BYTES * 8);
  return subtleCrypto().subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, [
    'encrypt',
    'decrypt',
  ]);
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await subtleCrypto().subtle.digest('SHA-256', utf8.encode(input));
  return toHex(new Uint8Array(digest));
}

// ── Ciphertext ──────────────────────────────────────────────────────────────
//
// Format: base64(iv).base64(ciphertext).base64(tag) — deliberately identical to
// lib/bridge/crypto.ts so there is one on-the-wire shape in the product, even
// though the two hold their keys in completely different places.
//
// WebCrypto returns ciphertext||tag concatenated; Node's createCipheriv exposes
// the tag separately. Splitting the last 16 bytes here is what reconciles them.

async function encryptWithKey(plain: string, contentKey: CryptoKeyHandle): Promise<string> {
  const c = subtleCrypto();
  // Fresh IV per call. Nonce reuse under one key is catastrophic for GCM, so
  // this is never derived from the plaintext, a counter, or the sequence number.
  const iv = c.getRandomValues(new Uint8Array(IV_BYTES));
  const sealed = new Uint8Array(
    await c.subtle.encrypt({ name: 'AES-GCM', iv, tagLength: TAG_BITS }, contentKey, utf8.encode(plain)),
  );
  const ct = sealed.subarray(0, sealed.length - TAG_BYTES);
  const tag = sealed.subarray(sealed.length - TAG_BYTES);
  return [toBase64(iv, false), toBase64(ct, false), toBase64(tag, false)].join('.');
}

async function decryptWithKey(payload: string, contentKey: CryptoKeyHandle): Promise<string> {
  const parts = payload.split('.');
  if (parts.length !== 3) {
    throw new SessionDecryptionError('Ciphertext is malformed (expected iv.ciphertext.tag).');
  }

  let iv: Uint8Array;
  let ct: Uint8Array;
  let tag: Uint8Array;
  try {
    iv = fromBase64(parts[0]);
    ct = fromBase64(parts[1]);
    tag = fromBase64(parts[2]);
  } catch {
    throw new SessionDecryptionError('Ciphertext is malformed (bad base64).');
  }

  if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) {
    throw new SessionDecryptionError('Ciphertext is malformed (bad iv or tag length).');
  }

  const sealed = new Uint8Array(ct.length + tag.length);
  sealed.set(ct, 0);
  sealed.set(tag, ct.length);

  try {
    const plain = await subtleCrypto().subtle.decrypt(
      { name: 'AES-GCM', iv, tagLength: TAG_BITS },
      contentKey,
      sealed,
    );
    return new TextDecoder().decode(plain);
  } catch {
    // GCM is authenticated: this is a THROW, not a garbage return. Wrong key and
    // tampered payload are indistinguishable here, deliberately — telling them
    // apart would be an oracle.
    throw new SessionDecryptionError('Could not decrypt: wrong key or tampered ciphertext.');
  }
}

// ── Public API ──────────────────────────────────────────────────────────────

/** What a client computes at creation time and sends to the server. */
export interface JoinCredentials {
  /** base64url. Sent as the join proof, in a header. Never stored by us. */
  verifier: string;
  /** sha256 hex of the verifier. THE ONLY THING THE SERVER PERSISTS. */
  joinKeyHash: string;
}

/**
 * A key bound to its derived AES key, so a long-lived reader (`session tail`,
 * the MCP server) derives once instead of per message.
 *
 * Deliberately NOT a module-level cache keyed by the key string: that would
 * retain session keys in memory for the life of the process with no way to
 * drop them. Holding the handle is an explicit choice with an obvious end.
 */
export interface SessionCipher {
  encrypt(plain: string): Promise<string>;
  decrypt(payload: string): Promise<string>;
}

export const sessionCrypto = {
  /** 32 random bytes, base64url. This is the value that goes in the fragment. */
  generateKey(): string {
    return toBase64(subtleCrypto().getRandomValues(new Uint8Array(KEY_BYTES)), true);
  },

  /**
   * Derive the join proof and the value the server stores.
   *
   * Creation sends `joinKeyHash` only. Joining sends `verifier`; the server
   * hashes it with `hashJoinVerifier` and compares in constant time.
   */
  async deriveJoinCredentials(key: string): Promise<JoinCredentials> {
    const verifier = toBase64(await deriveBits(key, INFO_VERIFY, KEY_BYTES * 8), true);
    return { verifier, joinKeyHash: await sha256Hex(verifier) };
  },

  /** Server-side half of the join check. Takes the verifier, never the key. */
  async hashJoinVerifier(verifier: string): Promise<string> {
    return sha256Hex(verifier);
  },

  /**
   * Constant-time comparison of a presented verifier against a stored hash.
   *
   * The server calls this. It cannot derive the verifier from what it stores,
   * which is the entire point of the split.
   */
  async verifyJoinProof(verifier: string, storedJoinKeyHash: string): Promise<boolean> {
    return timingSafeEqualString(await sha256Hex(verifier), storedJoinKeyHash);
  },

  async encrypt(plain: string, key: string): Promise<string> {
    return encryptWithKey(plain, await deriveContentKey(key));
  },

  /** Throws SessionDecryptionError on a wrong key or a tampered payload. */
  async decrypt(payload: string, key: string): Promise<string> {
    return decryptWithKey(payload, await deriveContentKey(key));
  },

  /** Bind a key once for repeated use. */
  async open(key: string): Promise<SessionCipher> {
    const contentKey = await deriveContentKey(key);
    return {
      encrypt: (plain: string) => encryptWithKey(plain, contentKey),
      decrypt: (payload: string) => decryptWithKey(payload, contentKey),
    };
  },
};

/**
 * Build a join link. The key goes after the `#` and nowhere else — browsers do
 * not send fragments, so it never reaches our logs, proxies, or database.
 */
export function buildJoinLink(baseUrl: string, sessionId: string, key: string): string {
  const base = baseUrl.replace(/\/+$/, '');
  return `${base}/s/${encodeURIComponent(sessionId)}#k=${key}`;
}

/**
 * Split a join link into its id and key.
 *
 * Parsed by hand rather than with `new URL()` so this behaves identically in
 * Node and the browser and never round-trips the key through anything that
 * might log a URL.
 */
export function parseJoinLink(link: string): { sessionId: string; key: string } {
  const hashAt = link.indexOf('#');
  if (hashAt === -1) {
    throw new SessionKeyError('Join link has no #k= fragment — the key is missing.');
  }
  const fragment = link.slice(hashAt + 1);
  const path = link.slice(0, hashAt);

  const keyMatch = /(?:^|&)k=([A-Za-z0-9_-]+)/.exec(fragment);
  if (!keyMatch) {
    throw new SessionKeyError('Join link fragment does not contain k=<key>.');
  }

  const idMatch = /\/s\/([^/?#]+)/.exec(path);
  if (!idMatch) {
    throw new SessionKeyError('Join link does not contain a /s/<id> path.');
  }

  const key = keyMatch[1];
  parseKey(key); // fail here, not at first decrypt
  return { sessionId: decodeURIComponent(idMatch[1]), key };
}

function timingSafeEqualString(a: string, b: string): boolean {
  // Both operands are fixed-length hex digests, so the length check leaks nothing.
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
