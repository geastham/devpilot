#!/usr/bin/env node

// src/statusline-fast.ts
import { execFileSync } from "child_process";
import { readFileSync as readFileSync2 } from "fs";
import { join as join2 } from "path";

// src/utils/statusline-store.ts
import { appendFileSync, mkdirSync, readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";
var n = (v) => typeof v === "number" && Number.isFinite(v) ? v : void 0;
var CAUSE = /^[a-z0-9_]{1,40}$/;
var MAX_CAUSES = 16;
var SESSION_ID = /^[A-Za-z0-9_-]{8,80}$/;
function statuslineDir(home = homedir()) {
  return process.env.DEVPILOT_STATUSLINE_DIR?.trim() || join(home, ".devpilot", "statusline");
}
function windowOf(raw) {
  const used = n(raw?.used_percentage);
  const resetsAt = n(raw?.resets_at);
  if (used === void 0 || resetsAt === void 0) return void 0;
  return { used: Math.max(0, Math.min(100, used)), resetsAt };
}
function causesOf(raw) {
  if (!raw || typeof raw !== "object") return void 0;
  const out = {};
  for (const [name, count] of Object.entries(raw)) {
    if (Object.keys(out).length >= MAX_CAUSES) break;
    const c = n(count);
    if (CAUSE.test(name) && c !== void 0 && c >= 0) out[name] = Math.floor(c);
  }
  return out;
}
function inMinutes(seconds) {
  const m = Math.max(0, Math.round(seconds / 60));
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return m % 60 === 0 ? `${h}h` : `${h}h${String(m % 60).padStart(2, "0")}m`;
}
function renderStatusLine(input, options) {
  if (!input || typeof input !== "object") return "";
  const dim = (s) => options.color ? `\x1B[2m${s}\x1B[0m` : s;
  const warn = (s) => options.color ? `\x1B[33m${s}\x1B[0m` : s;
  const parts = [];
  const model = input.model?.display_name || input.model?.id;
  if (model) parts.push(model);
  const ctx = n(input.context_window?.used_percentage ?? void 0);
  if (ctx !== void 0) parts.push(`ctx ${Math.round(ctx)}%`);
  const cache = input.prompt_cache;
  if (cache && typeof cache.warm === "boolean") {
    const misses = n(cache.misses) ?? 0;
    const state = cache.warm ? "cache warm" : warn("cache cold");
    parts.push(misses > 0 ? `${state} \xB7 ${misses} miss${misses === 1 ? "" : "es"}` : state);
  }
  const cost = n(input.cost?.total_cost_usd);
  if (cost !== void 0 && cost > 0) parts.push(`~$${cost < 10 ? cost.toFixed(2) : cost.toFixed(0)}`);
  const five = windowOf(input.rate_limits?.five_hour);
  if (five) {
    const left = five.resetsAt - options.now / 1e3;
    const text = `5h ${Math.round(five.used)}%` + (left > 0 ? ` (resets ${inMinutes(left)})` : "");
    parts.push(five.used >= 80 ? warn(text) : text);
  }
  const seven = windowOf(input.rate_limits?.seven_day);
  if (seven) {
    const text = `7d ${Math.round(seven.used)}%`;
    parts.push(seven.used >= 80 ? warn(text) : text);
  }
  return parts.join(dim(" \xB7 "));
}
function dayFile(dir, t) {
  return join(dir, `window-${new Date(t).toISOString().slice(0, 10)}.jsonl`);
}
function sessionFile(dir, sessionId) {
  return join(dir, "sessions", `${sessionId}.json`);
}
function loadSessionStatus(dir, sessionId) {
  if (!SESSION_ID.test(sessionId)) return null;
  try {
    return JSON.parse(readFileSync(sessionFile(dir, sessionId), "utf8"));
  } catch {
    return null;
  }
}
var sameWindow = (a, b) => a?.used === b?.used && a?.resetsAt === b?.resetsAt;
function recordStatus(input, dir, now) {
  if (!input || typeof input !== "object") return null;
  const sessionId = input.session_id;
  if (!sessionId || !SESSION_ID.test(sessionId)) return null;
  try {
    mkdirSync(join(dir, "sessions"), { recursive: true });
    const previous = loadSessionStatus(dir, sessionId);
    const five = windowOf(input.rate_limits?.five_hour);
    const seven = windowOf(input.rate_limits?.seven_day);
    const cost = n(input.cost?.total_cost_usd);
    const ctx = n(input.context_window?.used_percentage ?? void 0);
    const cache = input.prompt_cache;
    const next = {
      sessionId,
      updatedAt: now,
      model: input.model?.id ?? previous?.model,
      costUsd: cost ?? previous?.costUsd,
      contextPeakPct: ctx !== void 0 ? Math.max(ctx, previous?.contextPeakPct ?? 0) : previous?.contextPeakPct,
      // The client's counts are cumulative for the session; take them as given
      // rather than adding, and keep the last known value when a payload omits
      // the block (before the first response, and right after a compact).
      cacheMisses: n(cache?.misses) ?? previous?.cacheMisses,
      cacheMissCauses: causesOf(cache?.miss_causes) ?? previous?.cacheMissCauses,
      cacheRecacheTokens: n(cache?.miss_recache_tokens) ?? previous?.cacheRecacheTokens,
      cacheTtl: (cache?.ttl === "5m" || cache?.ttl === "1h" ? cache.ttl : void 0) ?? previous?.cacheTtl,
      // A window that is absent from this payload has not gone away: it is
      // omitted for a moment after it resets. Keep the last reading of each.
      five: five ?? previous?.five,
      seven: seven ?? previous?.seven,
      logged: previous?.logged
    };
    if ((five || seven) && cost !== void 0) {
      const logged = previous?.logged;
      const changed = !logged || !sameWindow(logged.five, five) || !sameWindow(logged.seven, seven) || logged.c !== cost;
      if (changed) {
        const reading = { t: now, s: sessionId, c: cost, ...five ? { five } : {}, ...seven ? { seven } : {} };
        appendFileSync(dayFile(dir, now), JSON.stringify(reading) + "\n");
        next.logged = { five, seven, c: cost };
      }
    }
    const file = sessionFile(dir, sessionId);
    const tmp = `${file}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(next));
    renameSync(tmp, file);
    return next;
  } catch {
    return null;
  }
}
function pruneWindowLogs(dir, now, keepDays = 9) {
  try {
    const cutoff = new Date(now - keepDays * 864e5).toISOString().slice(0, 10);
    for (const name of readdirSync(dir)) {
      if (/^window-\d{4}-\d{2}-\d{2}\.jsonl$/.test(name) && name.slice(7, 17) < cutoff) {
        unlinkSync(join(dir, name));
      }
    }
  } catch {
  }
}

// src/statusline-fast.ts
function readStdin(timeoutMs) {
  return new Promise((resolve) => {
    if (process.stdin.isTTY) return resolve("");
    let data = "";
    const done = () => resolve(data);
    const timer = setTimeout(done, timeoutMs);
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => data += chunk);
    process.stdin.on("end", () => {
      clearTimeout(timer);
      done();
    });
    process.stdin.on("error", () => {
      clearTimeout(timer);
      done();
    });
  });
}
function previousOutput(dir, raw) {
  try {
    const saved = JSON.parse(readFileSync2(join2(dir, "previous.json"), "utf8"));
    const command = saved.statusLine?.command;
    if (!command) return "";
    return execFileSync("/bin/sh", ["-c", command], {
      input: raw,
      encoding: "utf8",
      timeout: 1500,
      stdio: ["pipe", "pipe", "ignore"]
    }).replace(/\n+$/, "");
  } catch {
    return "";
  }
}
async function main(argv = process.argv.slice(3)) {
  const wrap = argv.includes("--wrap");
  const raw = await readStdin(1e3);
  const dir = statuslineDir();
  const now = Date.now();
  let input = {};
  try {
    const parsed = raw ? JSON.parse(raw) : {};
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) input = parsed;
  } catch {
  }
  if (!argv.includes("--no-record")) {
    recordStatus(input, dir, now);
    if (Math.random() < 5e-3) pruneWindowLogs(dir, now);
  }
  const ours = renderStatusLine(input, { now, color: !process.env.NO_COLOR });
  const theirs = wrap ? previousOutput(dir, raw) : "";
  process.stdout.write([theirs, ours].filter(Boolean).join("\n") + "\n");
}
export {
  main
};
//# sourceMappingURL=statusline-fast.mjs.map