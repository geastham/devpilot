"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/adoption/index.ts
var adoption_exports = {};
__export(adoption_exports, {
  HEAD_BYTES: () => HEAD_BYTES,
  MAX_PROBE_BYTES: () => MAX_PROBE_BYTES,
  adoptionKeyFor: () => adoptionKeyFor,
  clearRepoCache: () => clearRepoCache,
  condenseTitle: () => condenseTitle,
  defaultProjectsRoot: () => defaultProjectsRoot,
  groupByOwner: () => groupByOwner,
  heuristicTitle: () => heuristicTitle,
  loadOwnedSessionIds: () => loadOwnedSessionIds,
  parseRemoteUrl: () => parseRemoteUrl,
  probeTranscript: () => probeTranscript,
  readHead: () => readHead,
  resolveBranch: () => resolveBranch,
  resolveRepo: () => resolveRepo,
  resolveTouchedPaths: () => resolveTouchedPaths,
  scanSessions: () => scanSessions,
  summarizeSession: () => summarizeSession,
  summarizeSessions: () => summarizeSessions,
  withheldOwners: () => withheldOwners
});
module.exports = __toCommonJS(adoption_exports);

// src/adoption/transcript.ts
var import_node_fs = require("fs");
var HEAD_BYTES = 64 * 1024;
var MAX_PROBE_BYTES = 1024 * 1024;
var LARGE_LINE_BYTES = 128 * 1024;
var DEVPILOT_PROMPT_MARKERS = [
  "DevPilot session id is",
  "X-DevPilot-Callback-Token"
];
function readHead(path, bytes = HEAD_BYTES, offset = 0) {
  const fd = (0, import_node_fs.openSync)(path, "r");
  try {
    const buf = Buffer.allocUnsafe(bytes);
    const read = (0, import_node_fs.readSync)(fd, buf, 0, bytes, offset);
    return buf.subarray(0, read).toString("utf8");
  } finally {
    (0, import_node_fs.closeSync)(fd);
  }
}
function scrapeLargeLine(line) {
  const cwd = line.match(/"cwd"\s*:\s*"((?:[^"\\]|\\.)*)"/)?.[1];
  const gitBranch = line.match(/"gitBranch"\s*:\s*"((?:[^"\\]|\\.)*)"/)?.[1];
  return {
    cwd: cwd ? cwd.replace(/\\(.)/g, "$1") : void 0,
    gitBranch: gitBranch ? gitBranch.replace(/\\(.)/g, "$1") : void 0
  };
}
function flattenContent(content) {
  if (typeof content === "string") return content.trim() || null;
  if (!Array.isArray(content)) return null;
  const parts = [];
  for (const block of content) {
    if (block && typeof block === "object" && block.type === "text") {
      const text = block.text;
      if (typeof text === "string") parts.push(text);
    }
  }
  const joined = parts.join("\n").trim();
  return joined || null;
}
function isHumanPrompt(entry) {
  if (entry.type !== "user") return false;
  if (entry.isMeta) return false;
  if (entry.origin?.kind && entry.origin.kind !== "human") return false;
  const text = flattenContent(entry.message?.content);
  if (!text) return false;
  if (text.startsWith("<command-name>")) return false;
  if (text.startsWith("<local-command-stdout>")) return false;
  if (text.startsWith("<system-reminder>")) return false;
  return true;
}
function probeTranscript(transcriptPath, sessionUuid, options = {}) {
  const readImpl = options.readHeadImpl ?? readHead;
  const statImpl = options.statImpl ?? ((p) => {
    const s = (0, import_node_fs.statSync)(p);
    return { size: s.size, mtimeMs: s.mtimeMs };
  });
  const chunkBytes = options.headBytes ?? HEAD_BYTES;
  const maxBytes = options.maxBytes ?? MAX_PROBE_BYTES;
  let size;
  let mtimeMs;
  try {
    const stat = statImpl(transcriptPath);
    size = stat.size;
    mtimeMs = stat.mtimeMs;
    if (size === 0) return null;
  } catch {
    return null;
  }
  let cwd = null;
  let gitBranch = null;
  let customTitle = null;
  let webUrl = null;
  let firstHumanPrompt = null;
  let startedAt = null;
  let parsedEntries = 0;
  let sawNonSidechain = false;
  let looksDevPilotOwned = false;
  let bytesRead = 0;
  let headSample = "";
  let carry = "";
  const handleLine = (line) => {
    if (!line) return;
    if (line.length > LARGE_LINE_BYTES) {
      const scraped = scrapeLargeLine(line);
      if (!cwd && scraped.cwd) cwd = scraped.cwd;
      if (!gitBranch && scraped.gitBranch && scraped.gitBranch !== "HEAD") {
        gitBranch = scraped.gitBranch;
      }
      parsedEntries++;
      return;
    }
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      return;
    }
    parsedEntries++;
    if (!entry.isSidechain) sawNonSidechain = true;
    if (!cwd && typeof entry.cwd === "string") cwd = entry.cwd;
    if (!gitBranch && typeof entry.gitBranch === "string" && entry.gitBranch !== "HEAD") {
      gitBranch = entry.gitBranch;
    }
    if (entry.type === "custom-title" && typeof entry.customTitle === "string") {
      customTitle = entry.customTitle.trim() || null;
    }
    if (!webUrl && typeof entry.url === "string" && entry.url.startsWith("https://claude.ai/")) {
      webUrl = entry.url;
    }
    if (!webUrl && typeof entry.bridgeSessionId === "string") {
      const id = entry.bridgeSessionId.replace(/^cse_/, "");
      if (/^[A-Za-z0-9]{8,64}$/.test(id)) {
        webUrl = `https://claude.ai/code/session_${id}`;
      }
    }
    if (!startedAt && typeof entry.timestamp === "string") startedAt = entry.timestamp;
    if (!firstHumanPrompt && isHumanPrompt(entry)) {
      const text = flattenContent(entry.message?.content);
      if (text) {
        firstHumanPrompt = text;
        if (DEVPILOT_PROMPT_MARKERS.some((m) => text.includes(m))) {
          looksDevPilotOwned = true;
        }
      }
    }
  };
  const satisfied = () => Boolean(cwd && customTitle && firstHumanPrompt);
  while (bytesRead < Math.min(size, maxBytes) && !satisfied()) {
    let chunk;
    try {
      chunk = readImpl(transcriptPath, chunkBytes, bytesRead);
    } catch {
      break;
    }
    if (!chunk) break;
    bytesRead += Buffer.byteLength(chunk, "utf8");
    if (!headSample) headSample = chunk;
    const lines = (carry + chunk).split("\n");
    carry = lines.pop() ?? "";
    for (const line of lines) handleLine(line);
  }
  if (carry && bytesRead >= size) handleLine(carry);
  if (parsedEntries === 0) return null;
  const approximate = size > bytesRead;
  const messageCount = approximate ? Math.max(parsedEntries, Math.round(parsedEntries / bytesRead * size)) : parsedEntries;
  return {
    sessionUuid,
    transcriptPath,
    cwd,
    gitBranch,
    customTitle,
    webUrl,
    firstHumanPrompt,
    startedAt,
    lastActivityAt: new Date(mtimeMs).toISOString(),
    lastActivityMs: mtimeMs,
    sizeBytes: size,
    messageCount,
    messageCountIsApproximate: approximate,
    sidechainOnly: !sawNonSidechain,
    looksDevPilotOwned,
    headSample,
    bytesRead
  };
}

// src/adoption/repo.ts
var import_node_child_process = require("child_process");
var import_node_fs2 = require("fs");
var GIT_TIMEOUT_MS = 5e3;
var remoteCache = /* @__PURE__ */ new Map();
var branchCache = /* @__PURE__ */ new Map();
var statusCache = /* @__PURE__ */ new Map();
function clearRepoCache() {
  remoteCache.clear();
  branchCache.clear();
  statusCache.clear();
}
function git(cwd, args, maxBuffer = 4 * 1024 * 1024) {
  try {
    return (0, import_node_child_process.execFileSync)("git", ["-C", cwd, ...args], {
      encoding: "utf8",
      timeout: GIT_TIMEOUT_MS,
      maxBuffer,
      stdio: ["ignore", "pipe", "ignore"]
    });
  } catch {
    return null;
  }
}
function parseRemoteUrl(raw) {
  const url = raw.trim();
  if (!url) return null;
  let host;
  let path;
  const scp = url.match(/^(?:([^@/]+)@)?([^:/@]+):(.+)$/);
  if (scp && !url.includes("://")) {
    host = scp[2];
    path = scp[3];
  } else {
    try {
      const parsed = new URL(url);
      host = parsed.hostname;
      path = parsed.pathname;
    } catch {
      return null;
    }
  }
  const segments = path.replace(/\.git$/, "").split("/").filter(Boolean);
  if (segments.length < 2) return null;
  const name = segments[segments.length - 1];
  const owner = segments[segments.length - 2];
  if (!owner || !name) return null;
  if (!/^[\w.-]+$/.test(owner) || !/^[\w.-]+$/.test(name)) return null;
  return { repo: `${owner}/${name}`, owner, name, host: host.toLowerCase() };
}
function resolveRepo(cwd) {
  const cached = remoteCache.get(cwd);
  if (cached !== void 0) return cached;
  let identity = null;
  if ((0, import_node_fs2.existsSync)(cwd)) {
    const remote = git(cwd, ["remote", "get-url", "origin"]);
    identity = remote ? parseRemoteUrl(remote) : null;
  }
  remoteCache.set(cwd, identity);
  return identity;
}
function resolveBranch(cwd) {
  const cached = branchCache.get(cwd);
  if (cached !== void 0) return cached;
  let branch = null;
  if ((0, import_node_fs2.existsSync)(cwd)) {
    const out = git(cwd, ["rev-parse", "--abbrev-ref", "HEAD"]);
    const trimmed = out?.trim();
    branch = trimmed && trimmed !== "HEAD" ? trimmed : null;
  }
  branchCache.set(cwd, branch);
  return branch;
}
function resolveTouchedPaths(cwd, limit = 50) {
  const cached = statusCache.get(cwd);
  if (cached !== void 0) return cached.slice(0, limit);
  let paths = [];
  if ((0, import_node_fs2.existsSync)(cwd)) {
    const out = git(cwd, ["status", "--porcelain", "-uall"]);
    if (out) {
      paths = out.split("\n").filter(Boolean).map((line) => {
        const body = line.slice(3);
        const arrow = body.indexOf(" -> ");
        return (arrow === -1 ? body : body.slice(arrow + 4)).replace(/^"|"$/g, "");
      }).filter(Boolean);
    }
  }
  statusCache.set(cwd, paths);
  return paths.slice(0, limit);
}

// src/adoption/scanner.ts
var import_node_crypto = require("crypto");
var import_node_fs3 = require("fs");
var import_node_os = require("os");
var import_node_path = require("path");
var import_bridge_protocol = require("@devpilot.sh/bridge-protocol");
var DEFAULT_LIVE_WITHIN_MS = 15 * 60 * 1e3;
var DEFAULT_SINCE_MS = 24 * 60 * 60 * 1e3;
function defaultProjectsRoot() {
  return (0, import_node_path.join)((0, import_node_os.homedir)(), ".claude", "projects");
}
function adoptionKeyFor(machineName, sessionUuid) {
  return (0, import_node_crypto.createHash)("sha256").update(`${machineName}:${sessionUuid}`).digest("hex");
}
function loadOwnedSessionIds(path) {
  const file = path ?? (0, import_node_path.join)((0, import_node_os.homedir)(), ".devpilot", "owned-sessions.json");
  try {
    if (!(0, import_node_fs3.existsSync)(file)) return /* @__PURE__ */ new Set();
    const parsed = JSON.parse((0, import_node_fs3.readFileSync)(file, "utf8"));
    if (!Array.isArray(parsed.sessionIds)) return /* @__PURE__ */ new Set();
    return new Set(parsed.sessionIds.filter((v) => typeof v === "string"));
  } catch {
    return /* @__PURE__ */ new Set();
  }
}
function scratchpadRoots() {
  const override = process.env.DEVPILOT_SCRATCHPAD_ROOT;
  if (override) return [override];
  const uid = typeof process.getuid === "function" ? process.getuid() : null;
  if (uid === null) return [];
  return [`/private/tmp/claude-${uid}`, `/tmp/claude-${uid}`];
}
function isLive(observation, projectSlug, liveWithinMs, nowMs, existsImpl) {
  if (nowMs - observation.lastActivityMs <= liveWithinMs) return true;
  return scratchpadRoots().some(
    (root) => existsImpl((0, import_node_path.join)(root, projectSlug, observation.sessionUuid))
  );
}
function condenseTitle(text, max) {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  const body = lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut;
  return `${body.trimEnd()}\u2026`;
}
function heuristicTitle(observation) {
  if (observation.customTitle) {
    return condenseTitle(observation.customTitle, import_bridge_protocol.ADOPTION_LIMITS.MAX_TITLE_CHARS);
  }
  if (observation.firstHumanPrompt) {
    return condenseTitle(observation.firstHumanPrompt, import_bridge_protocol.ADOPTION_LIMITS.MAX_TITLE_CHARS);
  }
  return `Agent session ${observation.sessionUuid.slice(0, 8)}`;
}
function scanSessions(options) {
  const root = options.root ?? defaultProjectsRoot();
  const nowMs = (options.now ?? /* @__PURE__ */ new Date()).getTime();
  const liveWithinMs = options.liveWithinMs ?? DEFAULT_LIVE_WITHIN_MS;
  const sinceMs = options.sinceMs ?? DEFAULT_SINCE_MS;
  const includePaths = options.includePaths !== false;
  const excluded = options.excludeSessionUuids ?? /* @__PURE__ */ new Set();
  const existsImpl = options.existsImpl ?? import_node_fs3.existsSync;
  const routed = new Set((options.repos ?? []).map((r) => r.toLowerCase()));
  const candidates = [];
  const skipped = [];
  const transcriptPaths = /* @__PURE__ */ new Map();
  const inventory = /* @__PURE__ */ new Map();
  let unmappedProjectCount = 0;
  let projectDirCount = 0;
  let observedCount = 0;
  let projectDirs;
  try {
    projectDirs = (0, import_node_fs3.readdirSync)(root, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
  } catch {
    return {
      candidates: [],
      discovered: [],
      unmappedProjectCount: 0,
      skipped: [],
      projectDirCount: 0,
      observedCount: 0,
      transcriptPaths: /* @__PURE__ */ new Map()
    };
  }
  for (const projectSlug of projectDirs) {
    projectDirCount++;
    const dir = (0, import_node_path.join)(root, projectSlug);
    let files;
    try {
      files = (0, import_node_fs3.readdirSync)(dir).filter((f) => f.endsWith(".jsonl"));
    } catch {
      continue;
    }
    for (const file of files) {
      const sessionUuid = file.replace(/\.jsonl$/, "");
      const transcriptPath = (0, import_node_path.join)(dir, file);
      const observation = probeTranscript(transcriptPath, sessionUuid, options.probe);
      if (!observation) {
        skipped.push({ sessionUuid, reason: "empty" });
        continue;
      }
      observedCount++;
      if (observation.sidechainOnly) {
        skipped.push({ sessionUuid, reason: "sidechain" });
        continue;
      }
      if (excluded.has(sessionUuid) || observation.looksDevPilotOwned) {
        skipped.push({ sessionUuid, reason: "devpilot-owned" });
        continue;
      }
      if (!observation.cwd) {
        skipped.push({ sessionUuid, reason: "unreadable" });
        continue;
      }
      const identity = resolveRepo(observation.cwd);
      if (!identity) {
        unmappedProjectCount++;
        skipped.push({ sessionUuid, reason: "no-repo" });
        continue;
      }
      const live = isLive(observation, projectSlug, liveWithinMs, nowMs, existsImpl);
      const entry = inventory.get(identity.repo) ?? {
        repo: identity.repo,
        owner: identity.owner,
        host: identity.host,
        projectCount: 0,
        sessionCount: 0,
        liveSessionCount: 0,
        lastActivityAt: null,
        cwds: /* @__PURE__ */ new Set()
      };
      entry.cwds.add(observation.cwd);
      entry.sessionCount++;
      if (live) entry.liveSessionCount++;
      if (!entry.lastActivityAt || observation.lastActivityAt > entry.lastActivityAt) {
        entry.lastActivityAt = observation.lastActivityAt;
      }
      inventory.set(identity.repo, entry);
      if (!options.allRepos && !routed.has(identity.repo.toLowerCase())) {
        skipped.push({
          sessionUuid,
          reason: "not-routed",
          repo: identity.repo,
          owner: identity.owner
        });
        continue;
      }
      if (!live && nowMs - observation.lastActivityMs > sinceMs) {
        skipped.push({ sessionUuid, reason: "too-old", repo: identity.repo, owner: identity.owner });
        continue;
      }
      const startedAt = observation.startedAt ?? observation.lastActivityAt;
      const touchedPaths = includePaths ? resolveTouchedPaths(observation.cwd, import_bridge_protocol.ADOPTION_LIMITS.MAX_TOUCHED_PATHS) : [];
      const adoptionKey = adoptionKeyFor(options.machineName, sessionUuid);
      transcriptPaths.set(adoptionKey, { transcriptPath, sessionUuid });
      candidates.push({
        adoptionKey,
        agent: "claude-code",
        title: heuristicTitle(observation),
        repo: identity.repo,
        // Live branch beats the transcript's, which records session start.
        branch: resolveBranch(observation.cwd) ?? observation.gitBranch ?? void 0,
        startedAt: new Date(startedAt).toISOString(),
        lastActivityAt: observation.lastActivityAt,
        messageCount: observation.messageCount,
        live,
        ...touchedPaths.length > 0 ? { touchedPaths } : {},
        ...observation.webUrl ? { webUrl: observation.webUrl } : {}
      });
    }
  }
  const discovered = [...inventory.values()].map(({ cwds, ...repo }) => ({ ...repo, projectCount: cwds.size })).sort((a, b) => b.sessionCount - a.sessionCount || a.repo.localeCompare(b.repo));
  candidates.sort((a, b) => b.lastActivityAt.localeCompare(a.lastActivityAt));
  return {
    candidates,
    discovered,
    unmappedProjectCount,
    skipped,
    projectDirCount,
    observedCount,
    transcriptPaths
  };
}
function groupByOwner(repos) {
  const groups = /* @__PURE__ */ new Map();
  for (const repo of repos) {
    const list = groups.get(repo.owner) ?? [];
    list.push(repo);
    groups.set(repo.owner, list);
  }
  return groups;
}
function withheldOwners(skipped) {
  const owners = /* @__PURE__ */ new Set();
  for (const skip of skipped) {
    if (skip.reason === "not-routed" && skip.owner) owners.add(skip.owner);
  }
  return [...owners].sort();
}

// src/adoption/summarize.ts
var import_sdk = __toESM(require("@anthropic-ai/sdk"));
var import_bridge_protocol2 = require("@devpilot.sh/bridge-protocol");

// src/wave-planner/models.ts
var DEFAULT_WIKI_MODEL = "claude-sonnet-5";
function resolveWikiModel(explicit) {
  return explicit || process.env.WIKI_MODEL || DEFAULT_WIKI_MODEL;
}

// src/adoption/summarize.ts
var SAMPLE_CHARS = 6e3;
var REQUEST_TIMEOUT_MS = 2e4;
var MAX_CONCURRENCY = 4;
var SYSTEM_PROMPT = [
  "You label coding-agent sessions so they can be tracked on an issue board.",
  "",
  "You are given the opening of a session transcript and the list of files it has",
  "changed. Reply with exactly two lines and nothing else:",
  "",
  "TITLE: <an imperative summary of the work, at most 10 words, no trailing period>",
  "SUMMARY: <one or two sentences on what this session is doing and why>",
  "",
  'Describe the WORK, not the conversation. Never write "the user asked" or "this',
  'session". Never quote the transcript. Never include file contents, code, secrets,',
  "or credentials \u2014 if the transcript contains any, ignore them entirely."
].join("\n");
function buildUserPrompt(observation, touchedPaths) {
  const parts = [];
  if (observation.customTitle) parts.push(`Client-assigned title: ${observation.customTitle}`);
  if (observation.gitBranch) parts.push(`Branch: ${observation.gitBranch}`);
  if (touchedPaths.length > 0) {
    parts.push(`Changed files:
${touchedPaths.slice(0, 25).map((p) => `- ${p}`).join("\n")}`);
  }
  parts.push(`Transcript opening:
${observation.headSample.slice(0, SAMPLE_CHARS)}`);
  return parts.join("\n\n");
}
function parseResponse(text) {
  const title = text.match(/^TITLE:\s*(.+)$/m)?.[1]?.trim();
  const summary = text.match(/^SUMMARY:\s*([\s\S]+?)$/m)?.[1]?.trim();
  return { title: title || void 0, summary: summary || void 0 };
}
async function summarizeSession(observation, touchedPaths, options = {}) {
  const fallback = { title: heuristicTitle(observation), source: "heuristic" };
  const apiKey = options.apiKey ?? process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return fallback;
  try {
    const client = options.clientFactory ? options.clientFactory(apiKey) : new import_sdk.default({ apiKey, timeout: options.timeoutMs ?? REQUEST_TIMEOUT_MS });
    const response = await client.messages.create({
      model: options.model ?? resolveWikiModel(),
      max_tokens: 300,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: buildUserPrompt(observation, touchedPaths) }]
    });
    const text = ("content" in response ? response.content : []).map((block) => block.type === "text" ? block.text : "").join("").trim();
    const { title, summary } = parseResponse(text);
    if (!title) return fallback;
    return {
      title: condenseTitle(title, import_bridge_protocol2.ADOPTION_LIMITS.MAX_TITLE_CHARS),
      summary: summary ? condenseTitle(summary, import_bridge_protocol2.ADOPTION_LIMITS.MAX_SUMMARY_CHARS) : void 0,
      source: "model"
    };
  } catch (err) {
    options.onWarn?.(
      `could not summarize ${observation.sessionUuid.slice(0, 8)}: ${err instanceof Error ? err.message : String(err)}`
    );
    return fallback;
  }
}
async function summarizeSessions(jobs, options = {}) {
  const limit = options.maxSummaries ?? 25;
  const concurrency = Math.max(1, options.concurrency ?? MAX_CONCURRENCY);
  const results = new Array(jobs.length);
  let next = 0;
  async function worker() {
    for (; ; ) {
      const index = next++;
      if (index >= jobs.length) return;
      const job = jobs[index];
      results[index] = index < limit ? await summarizeSession(job.observation, job.touchedPaths, options) : { title: heuristicTitle(job.observation), source: "heuristic" };
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, jobs.length) }, () => worker())
  );
  return results;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  HEAD_BYTES,
  MAX_PROBE_BYTES,
  adoptionKeyFor,
  clearRepoCache,
  condenseTitle,
  defaultProjectsRoot,
  groupByOwner,
  heuristicTitle,
  loadOwnedSessionIds,
  parseRemoteUrl,
  probeTranscript,
  readHead,
  resolveBranch,
  resolveRepo,
  resolveTouchedPaths,
  scanSessions,
  summarizeSession,
  summarizeSessions,
  withheldOwners
});
//# sourceMappingURL=index.js.map