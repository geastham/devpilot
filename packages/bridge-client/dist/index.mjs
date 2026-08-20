var __typeError = (msg) => {
  throw TypeError(msg);
};
var __accessCheck = (obj, member, msg) => member.has(obj) || __typeError("Cannot " + msg);
var __privateGet = (obj, member, getter) => (__accessCheck(obj, member, "read from private field"), getter ? getter.call(obj) : member.get(obj));
var __privateAdd = (obj, member, value) => member.has(obj) ? __typeError("Cannot add the same private member more than once") : member instanceof WeakSet ? member.add(obj) : member.set(obj, value);
var __privateSet = (obj, member, value, setter) => (__accessCheck(obj, member, "write to private field"), setter ? setter.call(obj, value) : member.set(obj, value), value);
var __privateMethod = (obj, member, method) => (__accessCheck(obj, member, "access private method"), method);

// src/client.ts
import {
  RegisterRequestSchema,
  RegisterResponseSchema,
  formatApiError
} from "@devpilot.sh/bridge-protocol";
var BridgeError = class extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
    this.name = "BridgeError";
  }
};
var BridgeClient = class {
  constructor(config) {
    this.config = config;
    this.orchestratorId = null;
    this.fetchImpl = config.fetchImpl ?? globalThis.fetch;
  }
  url(path) {
    return `${this.hostedUrl()}${path}`;
  }
  /**
   * The hosted plane's base URL, without a trailing slash.
   *
   * Exposed because agent activities need to link a person to the hosted
   * cockpit. The first version of those links pointed at the *local* cockpit,
   * which is a dead link for anyone not sitting at the machine the bridge runs
   * on — and most people on the hosted product never run it at all.
   */
  hostedUrl() {
    return this.config.bridgeUrl.replace(/\/+$/, "");
  }
  async request(path, init = {}) {
    const res = await this.fetchImpl(this.url(path), {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.config.token}`,
        ...init.headers ?? {}
      }
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new BridgeError(
        formatApiError(
          body,
          `${init.method ?? "GET"} ${path} failed: ${res.status} ${res.statusText}`
        ),
        res.status
      );
    }
    return res.status === 204 ? void 0 : await res.json();
  }
  /**
   * Register this machine.
   *
   * `name` is REQUIRED and validated locally before the request goes out. In
   * 0.1.x the client sent `{repos, maxConcurrentJobs}` while the bridge
   * required `name`, so this call returned 400 every single time and the
   * pipeline never once connected end to end.
   */
  async register(capabilities) {
    const body = RegisterRequestSchema.parse(capabilities);
    const raw = await this.request("/api/orchestrators/register", {
      method: "POST",
      body: JSON.stringify(body)
    });
    const parsed = RegisterResponseSchema.parse(raw);
    this.orchestratorId = parsed.orchestratorId;
    return parsed;
  }
  async heartbeat(activeJobs) {
    if (!this.orchestratorId) throw new BridgeError("Not registered", 400);
    await this.request(`/api/orchestrators/${this.orchestratorId}/heartbeat`, {
      method: "POST",
      body: JSON.stringify({ activeJobs })
    });
  }
  /** Unclaimed work for this machine. The fallback transport and the sweep. */
  async poll() {
    const res = await this.request("/api/dispatch/poll");
    return res.messages;
  }
  /** Claim. Returns null when another worker won the race. */
  async claim(queueId) {
    try {
      const res = await this.request(
        `/api/dispatch/${queueId}/claim`,
        { method: "POST" }
      );
      return res.message;
    } catch (err) {
      if (err instanceof BridgeError && err.status === 409) return null;
      throw err;
    }
  }
  /** Nack, so a claimed row is not stranded until the stale sweep. */
  async release(queueId, error) {
    await this.request(`/api/dispatch/${queueId}/release`, {
      method: "POST",
      body: JSON.stringify({ error })
    });
  }
  async reportSessionStatus(sessionId, status) {
    await this.request(`/api/sessions/${sessionId}/status`, {
      method: "POST",
      body: JSON.stringify(status)
    });
  }
  async reportSessionComplete(sessionId, report) {
    await this.request(`/api/sessions/${sessionId}/complete`, {
      method: "POST",
      body: JSON.stringify(report)
    });
  }
  /**
   * Mirror a wave plan to the hosted cockpit.
   *
   * Derived structure only — waves, task descriptions, file paths, dependency
   * edges. Never source: no file contents, no diffs. The hosted schema has no
   * column for those, which is the enforcement; this comment is only the intent.
   *
   * Best-effort by design. Mirroring is what makes the plan visible on
   * devpilot.sh, but the run is real work already underway on this machine, and
   * losing it because a display copy failed to upload would be an absurd trade.
   * Callers get a boolean and decide whether to mention it.
   */
  async mirrorSessionPlan(sessionId, plan) {
    try {
      await this.request(`/api/sessions/${sessionId}/plan`, {
        method: "POST",
        body: JSON.stringify(plan)
      });
      return true;
    } catch {
      return false;
    }
  }
  /** Fixes the `getOrchestatorId` typo from 0.1.x. */
  getOrchestratorId() {
    return this.orchestratorId;
  }
  setOrchestratorId(id) {
    this.orchestratorId = id;
  }
};

// src/realtime.ts
var RealtimeSubscriber = class {
  constructor(config) {
    this.config = config;
    this.client = null;
    this.channel = null;
    this.running = false;
  }
  async start() {
    if (this.running) return;
    const { createClient } = await import("@supabase/supabase-js");
    this.client = createClient(this.config.supabaseUrl, this.config.anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      realtime: { params: { eventsPerSecond: 10 } }
    });
    await this.client.realtime.setAuth(this.config.jwt);
    this.running = true;
    this.channel = this.client.channel(`dispatch:${this.config.orchestratorId}`).on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "dispatch_queue",
        filter: `orchestrator_id=eq.${this.config.orchestratorId}`
      },
      (payload) => {
        const id = payload.new?.id;
        if (id) this.config.onNotify(id);
      }
    ).subscribe((status) => {
      if (status === "SUBSCRIBED") {
        this.config.onReconnect();
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        this.config.onError?.(new Error(`Realtime channel ${status}`));
      }
    });
  }
  /** Refresh before the 1h JWT expires, or the channel silently goes deaf. */
  async updateAuth(jwt) {
    if (this.client) await this.client.realtime.setAuth(jwt);
  }
  async stop() {
    this.running = false;
    if (this.channel) await this.channel.unsubscribe();
    if (this.client) await this.client.realtime.disconnect();
    this.channel = null;
    this.client = null;
  }
  get isRunning() {
    return this.running;
  }
};

// src/dispatch-loop.ts
var DispatchLoop = class {
  constructor(config) {
    this.config = config;
    this.subscriber = null;
    this.timer = null;
    this.running = false;
    this.sweeping = false;
    /** Claimed and not yet settled — used only to respect maxConcurrent. */
    this.inFlight = /* @__PURE__ */ new Set();
  }
  get activeJobs() {
    return this.inFlight.size;
  }
  async start() {
    if (this.running) return;
    this.running = true;
    if (this.config.realtime) {
      this.subscriber = new RealtimeSubscriber({
        supabaseUrl: this.config.realtime.supabaseUrl,
        anonKey: this.config.realtime.anonKey,
        jwt: this.config.realtime.jwt,
        orchestratorId: this.config.orchestratorId,
        onNotify: (queueId) => void this.take(queueId),
        onReconnect: () => void this.sweep(),
        onError: (err) => {
          this.config.onLog?.(`realtime: ${err.message} \u2014 continuing on the sweep timer`);
        }
      });
      try {
        await this.subscriber.start();
      } catch (err) {
        this.config.onLog?.(
          `realtime unavailable (${err instanceof Error ? err.message : String(err)}); polling instead`
        );
        this.subscriber = null;
      }
    }
    const interval = this.config.sweepIntervalMs ?? (this.subscriber ? 3e4 : 5e3);
    this.timer = setInterval(() => void this.sweep(), interval);
    await this.sweep();
  }
  async stop() {
    this.running = false;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (this.subscriber) await this.subscriber.stop();
    this.subscriber = null;
  }
  /** Ask for unclaimed work and take what we have capacity for. */
  async sweep() {
    if (!this.running || this.sweeping) return;
    this.sweeping = true;
    try {
      const messages = await this.config.client.poll();
      for (const message of messages) {
        if (!this.hasCapacity()) break;
        await this.take(message.queueId);
      }
    } catch (err) {
      this.config.onError?.(err instanceof Error ? err : new Error(String(err)));
    } finally {
      this.sweeping = false;
    }
  }
  hasCapacity() {
    return this.inFlight.size < (this.config.maxConcurrent ?? 4);
  }
  /**
   * Claim then run. The claim is server-side and conditional, so losing a race
   * is a normal outcome (null) rather than an error — that is how two machines
   * can watch the same queue safely.
   */
  async take(queueId) {
    if (!this.running || !this.hasCapacity() || this.inFlight.has(queueId)) return;
    let message;
    try {
      message = await this.config.client.claim(queueId);
    } catch (err) {
      this.config.onError?.(err instanceof Error ? err : new Error(String(err)));
      return;
    }
    if (!message) return;
    this.inFlight.add(queueId);
    try {
      await this.config.handler(message);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      this.config.onError?.(new Error(`handler threw for ${message.linearIdentifier}: ${reason}`));
      try {
        await this.config.client.release(queueId, reason);
      } catch {
      }
    } finally {
      this.inFlight.delete(queueId);
    }
  }
};

// src/heartbeat.ts
var HeartbeatService = class {
  constructor(config) {
    this.config = config;
    this.timer = null;
  }
  start() {
    if (this.timer) return;
    const interval = this.config.intervalMs ?? 3e4;
    const beat = async () => {
      try {
        await this.config.client.heartbeat(this.config.activeJobs?.());
      } catch (err) {
        this.config.onError?.(err instanceof Error ? err : new Error(String(err)));
      }
    };
    this.timer = setInterval(beat, interval);
    void beat();
  }
  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
};

// src/shared-session.ts
import {
  sessionCrypto,
  parseJoinLink,
  JOIN_PROOF_HEADER,
  formatApiError as formatApiError2
} from "@devpilot.sh/bridge-protocol";
var SYSTEM_PREFIX = "system:";
var _key, _token, _participantId, _session, _joinOptions, _fetchImpl, _SharedSessionClient_static, requestJoin_fn, _SharedSessionClient_instances, request_fn, decode_fn;
var _SharedSessionClient = class _SharedSessionClient {
  constructor(init) {
    __privateAdd(this, _SharedSessionClient_instances);
    __privateAdd(this, _key);
    __privateAdd(this, _token);
    __privateAdd(this, _participantId);
    __privateAdd(this, _session);
    __privateAdd(this, _joinOptions);
    __privateAdd(this, _fetchImpl);
    this.baseUrl = init.baseUrl;
    this.sessionId = init.sessionId;
    __privateSet(this, _key, init.key);
    __privateSet(this, _token, init.token);
    __privateSet(this, _participantId, init.participantId);
    __privateSet(this, _session, init.session);
    __privateSet(this, _joinOptions, init.joinOptions);
    __privateSet(this, _fetchImpl, init.fetchImpl);
  }
  /** Joins by link. The key is taken from the fragment and kept in memory. */
  static async join(options) {
    var _a;
    const { sessionId, key } = parseJoinLink(options.link);
    const baseUrl = options.link.slice(0, options.link.indexOf("/s/")).replace(/\/+$/, "");
    const fetchImpl = options.fetchImpl ?? globalThis.fetch;
    const joinOptions = {
      displayName: options.displayName,
      kind: options.kind ?? "human",
      agentKind: options.agentKind,
      orchestratorId: options.orchestratorId
    };
    const { token, participantId, session } = await __privateMethod(_a = _SharedSessionClient, _SharedSessionClient_static, requestJoin_fn).call(_a, fetchImpl, baseUrl, sessionId, key, joinOptions);
    return new _SharedSessionClient({
      baseUrl,
      sessionId,
      key,
      token,
      participantId,
      session,
      joinOptions,
      fetchImpl
    });
  }
  get participantId() {
    return __privateGet(this, _participantId);
  }
  get session() {
    return __privateGet(this, _session);
  }
  /** Encrypts locally, then posts. The bridge sees only ciphertext. */
  async post(text, opts = {}) {
    const ciphertext = await sessionCrypto.encrypt(text, __privateGet(this, _key));
    const body = await __privateMethod(this, _SharedSessionClient_instances, request_fn).call(this, `/api/sessions/shared/${this.sessionId}/messages`, {
      method: "POST",
      body: JSON.stringify({
        ciphertext,
        kind: opts.kind ?? "chat",
        keyVersion: __privateGet(this, _session).keyVersion,
        ...opts.clientNonce ? { clientNonce: opts.clientNonce } : {}
      })
    });
    return body.message;
  }
  /** Reads and decrypts locally. `since` is a seq cursor, never a clock. */
  async read(since = 0) {
    const page = await __privateMethod(this, _SharedSessionClient_instances, request_fn).call(this, `/api/sessions/shared/${this.sessionId}/messages?since=${since}`);
    const entries = await Promise.all(page.messages.map((m) => __privateMethod(this, _SharedSessionClient_instances, decode_fn).call(this, m)));
    return { entries, latestSeq: page.latestSeq, hasMore: page.hasMore };
  }
  async who() {
    const { verifier } = await sessionCrypto.deriveJoinCredentials(__privateGet(this, _key));
    const res = await __privateGet(this, _fetchImpl).call(this, `${this.baseUrl}/api/sessions/shared/${this.sessionId}`, {
      headers: { [JOIN_PROOF_HEADER]: verifier }
    });
    if (!res.ok) {
      const body2 = await res.json().catch(() => null);
      throw new BridgeError(formatApiError2(body2, `Roster failed: ${res.status}`), res.status);
    }
    const body = await res.json();
    __privateSet(this, _session, body.session);
    return body.participants;
  }
  /**
   * Keeps `console.log(client)` and `JSON.stringify(client)` from printing the
   * key. Private fields are already invisible to JSON.stringify, but this is
   * cheap and states the intent where someone adding a field will read it.
   */
  toJSON() {
    return { sessionId: this.sessionId, baseUrl: this.baseUrl, participantId: __privateGet(this, _participantId) };
  }
};
_key = new WeakMap();
_token = new WeakMap();
_participantId = new WeakMap();
_session = new WeakMap();
_joinOptions = new WeakMap();
_fetchImpl = new WeakMap();
_SharedSessionClient_static = new WeakSet();
requestJoin_fn = async function(fetchImpl, baseUrl, sessionId, key, joinOptions, resumeToken) {
  const { verifier } = await sessionCrypto.deriveJoinCredentials(key);
  const res = await fetchImpl(`${baseUrl}/api/sessions/shared/${sessionId}/join`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      [JOIN_PROOF_HEADER]: verifier,
      ...resumeToken ? { "x-session-resume": resumeToken } : {}
    },
    body: JSON.stringify(joinOptions)
  });
  if (!res.ok) {
    const body2 = await res.json().catch(() => null);
    if (res.status === 404) {
      throw new BridgeError(
        "This link is not valid for that session. Either the id is wrong or the session has been re-keyed \u2014 ask for the current link.",
        404
      );
    }
    throw new BridgeError(formatApiError2(body2, `Join failed: ${res.status}`), res.status);
  }
  const body = await res.json();
  return {
    token: body.participantToken,
    participantId: body.participant.id,
    session: body.session
  };
};
_SharedSessionClient_instances = new WeakSet();
request_fn = async function(path, init = {}, retried = false) {
  var _a;
  const res = await __privateGet(this, _fetchImpl).call(this, `${this.baseUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${__privateGet(this, _token)}`,
      ...init.headers ?? {}
    }
  });
  if (res.status === 401 && !retried) {
    const rejoined = await __privateMethod(_a = _SharedSessionClient, _SharedSessionClient_static, requestJoin_fn).call(_a, __privateGet(this, _fetchImpl), this.baseUrl, this.sessionId, __privateGet(this, _key), __privateGet(this, _joinOptions), __privateGet(this, _token));
    __privateSet(this, _token, rejoined.token);
    __privateSet(this, _participantId, rejoined.participantId);
    __privateSet(this, _session, rejoined.session);
    return __privateMethod(this, _SharedSessionClient_instances, request_fn).call(this, path, init, true);
  }
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new BridgeError(
      formatApiError2(body, `${init.method ?? "GET"} ${path} failed: ${res.status}`),
      res.status
    );
  }
  return await res.json();
};
decode_fn = async function(m) {
  const base = {
    id: m.id,
    seq: m.seq,
    participantId: m.participantId,
    kind: m.kind,
    keyVersion: m.keyVersion,
    createdAt: m.createdAt
  };
  if (m.kind === "system" || m.ciphertext.startsWith(SYSTEM_PREFIX)) {
    let notice;
    try {
      notice = JSON.parse(m.ciphertext.slice(SYSTEM_PREFIX.length));
    } catch {
      notice = void 0;
    }
    return { ...base, text: m.ciphertext.slice(SYSTEM_PREFIX.length), status: "system", systemNotice: notice };
  }
  if (m.keyVersion !== __privateGet(this, _session).keyVersion) {
    return { ...base, text: null, status: "undecryptable" };
  }
  try {
    return { ...base, text: await sessionCrypto.decrypt(m.ciphertext, __privateGet(this, _key)), status: "ok" };
  } catch {
    return { ...base, text: null, status: "undecryptable" };
  }
};
__privateAdd(_SharedSessionClient, _SharedSessionClient_static);
var SharedSessionClient = _SharedSessionClient;

// src/pubsub.ts
var REMOVED = "@devpilot.sh/bridge-client: the Pub/Sub transport was removed in 0.2.0. Upgrade the DevPilot CLI (npm i -g @devpilot.sh/cli) and use `devpilot bridge connect`. GCP credentials are no longer required.";
var PubSubSubscriber = class {
  constructor() {
    throw new Error(REMOVED);
  }
};
export {
  BridgeClient,
  BridgeError,
  DispatchLoop,
  HeartbeatService,
  PubSubSubscriber,
  RealtimeSubscriber,
  SharedSessionClient
};
//# sourceMappingURL=index.mjs.map