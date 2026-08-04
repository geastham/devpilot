/**
 * Shared agent sessions client — TRD 06 §5, §6.2, §6.3.
 *
 * One implementation for both consumers: `@devpilot.sh/mcp-session` (so Claude
 * Code can take part) and `devpilot session …` in the CLI. Duplicating it would
 * be the drift that got `packages/bridge` deleted in TRD 05.
 *
 * ─── The key never leaves this process ──────────────────────────────────────
 *
 * It is parsed out of the link fragment, held in a private field, and used only
 * to derive the join verifier and to encrypt/decrypt locally. It is never sent
 * to the bridge, never written to disk, and deliberately not exposed on the
 * instance — `toJSON` is overridden so an accidental `console.log(client)` or
 * `JSON.stringify(client)` cannot print it. That last one is not paranoia: a
 * debug log is exactly how a secret ends up in a terminal recording.
 *
 * ─── What "cannot decrypt" means here ───────────────────────────────────────
 *
 * Two kinds of message do not decrypt, and BOTH are reported rather than hidden:
 *
 *   system        server-authored plaintext (TRD 06 §3.2, corrected in v1.3).
 *                 The server cannot encrypt — it holds no key — so its notices
 *                 about auto-mode expiry arrive as plaintext with a `system:`
 *                 prefix. Attempting to decrypt one would just throw.
 *   undecryptable sealed under a superseded keyVersion. After a rotation, a
 *                 holder of only the new key genuinely cannot read history.
 *                 Silently dropping those would make the transcript look
 *                 complete when it is not, which is worse than a visible gap.
 */
import {
  sessionCrypto,
  parseJoinLink,
  JOIN_PROOF_HEADER,
  formatApiError,
  type SessionMessage,
  type SessionParticipant,
  type SharedSession,
  type SessionMessageKind,
} from '@devpilot.sh/bridge-protocol';
import { BridgeError } from './client';

export interface SharedSessionJoinOptions {
  /** `https://devpilot.sh/s/<id>#k=<key>` — the fragment carries the key. */
  link: string;
  displayName: string;
  kind?: 'human' | 'agent';
  agentKind?: 'claude-code' | 'codex' | 'ao' | 'other';
  orchestratorId?: string;
  fetchImpl?: typeof fetch;
}

export type EntryStatus = 'ok' | 'system' | 'undecryptable';

export interface TranscriptEntry {
  id: string;
  seq: number;
  participantId: string | null;
  kind: SessionMessageKind;
  keyVersion: number;
  createdAt: string;
  /** Plaintext when readable; null otherwise. Never a decryption failure string. */
  text: string | null;
  status: EntryStatus;
  /** Present when status is 'system' — the parsed server notice. */
  systemNotice?: { type: string; reason?: string };
}

const SYSTEM_PREFIX = 'system:';

export class SharedSessionClient {
  readonly sessionId: string;
  readonly baseUrl: string;

  #key: string;
  #token: string;
  #participantId: string;
  #session: SharedSession;
  #joinOptions: Omit<SharedSessionJoinOptions, 'link' | 'fetchImpl'>;
  #fetchImpl: typeof fetch;

  private constructor(init: {
    baseUrl: string;
    sessionId: string;
    key: string;
    token: string;
    participantId: string;
    session: SharedSession;
    joinOptions: Omit<SharedSessionJoinOptions, 'link' | 'fetchImpl'>;
    fetchImpl: typeof fetch;
  }) {
    this.baseUrl = init.baseUrl;
    this.sessionId = init.sessionId;
    this.#key = init.key;
    this.#token = init.token;
    this.#participantId = init.participantId;
    this.#session = init.session;
    this.#joinOptions = init.joinOptions;
    this.#fetchImpl = init.fetchImpl;
  }

  /** Joins by link. The key is taken from the fragment and kept in memory. */
  static async join(options: SharedSessionJoinOptions): Promise<SharedSessionClient> {
    const { sessionId, key } = parseJoinLink(options.link);
    const baseUrl = options.link.slice(0, options.link.indexOf('/s/')).replace(/\/+$/, '');
    const fetchImpl = options.fetchImpl ?? globalThis.fetch;

    const joinOptions = {
      displayName: options.displayName,
      kind: options.kind ?? ('human' as const),
      agentKind: options.agentKind,
      orchestratorId: options.orchestratorId,
    };

    const { token, participantId, session } = await SharedSessionClient.#requestJoin(
      fetchImpl,
      baseUrl,
      sessionId,
      key,
      joinOptions,
    );

    return new SharedSessionClient({
      baseUrl,
      sessionId,
      key,
      token,
      participantId,
      session,
      joinOptions,
      fetchImpl,
    });
  }

  static async #requestJoin(
    fetchImpl: typeof fetch,
    baseUrl: string,
    sessionId: string,
    key: string,
    joinOptions: Omit<SharedSessionJoinOptions, 'link' | 'fetchImpl'>,
  ) {
    // The verifier is an HKDF branch off the key and cannot decrypt anything,
    // which is what makes it safe to hand to the server (TRD 06 §5).
    const { verifier } = await sessionCrypto.deriveJoinCredentials(key);

    const res = await fetchImpl(`${baseUrl}/api/sessions/shared/${sessionId}/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', [JOIN_PROOF_HEADER]: verifier },
      body: JSON.stringify(joinOptions),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      if (res.status === 404) {
        throw new BridgeError(
          'This link is not valid for that session. Either the id is wrong or the ' +
            'session has been re-keyed — ask for the current link.',
          404,
        );
      }
      throw new BridgeError(formatApiError(body, `Join failed: ${res.status}`), res.status);
    }

    const body = (await res.json()) as {
      participantToken: string;
      participant: SessionParticipant;
      session: SharedSession;
    };

    return {
      token: body.participantToken,
      participantId: body.participant.id,
      session: body.session,
    };
  }

  /**
   * Participant tokens last an hour and an MCP server outlives that easily, so
   * a 401 re-joins once with the key we already hold rather than surfacing an
   * expiry the caller can do nothing about.
   *
   * A 404 on that retry is NOT retried again: it means the session was
   * re-keyed, and no amount of retrying will help. Rotation is revocation
   * (T6-AC-07), and the honest response is to say the link is stale.
   *
   * KNOWN GAP: re-joining creates a NEW participant row, so a long-running
   * `session tail` accumulates one roster entry per hour as its token expires.
   * The transcript itself reads correctly — both ids carry the same display
   * name — but `devpilot_session_who` shows duplicates. Fixing it properly
   * needs POST /join to accept an existing participantId and reuse that row
   * when it belongs to the session; that is a route change, not a client one.
   */
  async #request<T>(path: string, init: RequestInit = {}, retried = false): Promise<T> {
    const res = await this.#fetchImpl(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.#token}`,
        ...(init.headers ?? {}),
      },
    });

    if (res.status === 401 && !retried) {
      const rejoined = await SharedSessionClient.#requestJoin(
        this.#fetchImpl,
        this.baseUrl,
        this.sessionId,
        this.#key,
        this.#joinOptions,
      );
      this.#token = rejoined.token;
      this.#participantId = rejoined.participantId;
      this.#session = rejoined.session;
      return this.#request<T>(path, init, true);
    }

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new BridgeError(
        formatApiError(body, `${init.method ?? 'GET'} ${path} failed: ${res.status}`),
        res.status,
      );
    }

    return (await res.json()) as T;
  }

  get participantId(): string {
    return this.#participantId;
  }

  get session(): SharedSession {
    return this.#session;
  }

  /** Encrypts locally, then posts. The bridge sees only ciphertext. */
  async post(
    text: string,
    opts: { kind?: 'chat' | 'agent_output'; clientNonce?: string } = {},
  ): Promise<SessionMessage> {
    const ciphertext = await sessionCrypto.encrypt(text, this.#key);

    const body = await this.#request<{ message: SessionMessage }>(
      `/api/sessions/shared/${this.sessionId}/messages`,
      {
        method: 'POST',
        body: JSON.stringify({
          ciphertext,
          kind: opts.kind ?? 'chat',
          keyVersion: this.#session.keyVersion,
          ...(opts.clientNonce ? { clientNonce: opts.clientNonce } : {}),
        }),
      },
    );

    return body.message;
  }

  /** Reads and decrypts locally. `since` is a seq cursor, never a clock. */
  async read(since = 0): Promise<{ entries: TranscriptEntry[]; latestSeq: number; hasMore: boolean }> {
    const page = await this.#request<{
      messages: SessionMessage[];
      latestSeq: number;
      hasMore: boolean;
    }>(`/api/sessions/shared/${this.sessionId}/messages?since=${since}`);

    const entries = await Promise.all(page.messages.map((m) => this.#decode(m)));
    return { entries, latestSeq: page.latestSeq, hasMore: page.hasMore };
  }

  async #decode(m: SessionMessage): Promise<TranscriptEntry> {
    const base = {
      id: m.id,
      seq: m.seq,
      participantId: m.participantId,
      kind: m.kind,
      keyVersion: m.keyVersion,
      createdAt: m.createdAt,
    };

    if (m.kind === 'system' || m.ciphertext.startsWith(SYSTEM_PREFIX)) {
      let notice: { type: string; reason?: string } | undefined;
      try {
        notice = JSON.parse(m.ciphertext.slice(SYSTEM_PREFIX.length));
      } catch {
        notice = undefined;
      }
      return { ...base, text: m.ciphertext.slice(SYSTEM_PREFIX.length), status: 'system', systemNotice: notice };
    }

    if (m.keyVersion !== this.#session.keyVersion) {
      // Sealed under a key this participant does not hold. Reported, not hidden.
      return { ...base, text: null, status: 'undecryptable' };
    }

    try {
      return { ...base, text: await sessionCrypto.decrypt(m.ciphertext, this.#key), status: 'ok' };
    } catch {
      return { ...base, text: null, status: 'undecryptable' };
    }
  }

  async who(): Promise<SessionParticipant[]> {
    const { verifier } = await sessionCrypto.deriveJoinCredentials(this.#key);
    const res = await this.#fetchImpl(`${this.baseUrl}/api/sessions/shared/${this.sessionId}`, {
      headers: { [JOIN_PROOF_HEADER]: verifier },
    });

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new BridgeError(formatApiError(body, `Roster failed: ${res.status}`), res.status);
    }

    const body = (await res.json()) as { session: SharedSession; participants: SessionParticipant[] };
    this.#session = body.session;
    return body.participants;
  }

  /**
   * Keeps `console.log(client)` and `JSON.stringify(client)` from printing the
   * key. Private fields are already invisible to JSON.stringify, but this is
   * cheap and states the intent where someone adding a field will read it.
   */
  toJSON() {
    return { sessionId: this.sessionId, baseUrl: this.baseUrl, participantId: this.#participantId };
  }
}
