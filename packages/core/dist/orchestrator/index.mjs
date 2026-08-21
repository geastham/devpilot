var __defProp = Object.defineProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// src/orchestrator/adapter.ts
function isPushCapableAdapter(adapter) {
  return typeof adapter.ingestStatus === "function" && typeof adapter.ingestCompletion === "function";
}

// src/orchestrator/client.ts
var OrchestratorClient = class {
  constructor(config) {
    this.config = {
      ...config,
      timeout: config.timeout || 3e4
    };
  }
  /**
   * Check if orchestrator is healthy
   */
  async healthCheck() {
    const response = await this.fetch("/health");
    return response.json();
  }
  /**
   * Dispatch a task to the orchestrator
   */
  async dispatch(request) {
    const response = await this.fetch("/dispatch", {
      method: "POST",
      body: JSON.stringify(request)
    });
    if (!response.ok) {
      const error = await response.text();
      return {
        accepted: false,
        error: `Orchestrator rejected dispatch: ${error}`
      };
    }
    return response.json();
  }
  /**
   * Fetch the completion report for a finished job.
   *
   * The ao-cli and claude-session adapters both implement this; the HTTP
   * adapter did not, and `OrchestratorAdapter.getCompletionReport` is optional —
   * so StatusPoller.handleCompletion received null and NEVER invoked its
   * onComplete callback. In practice that meant an http-mode job could run to
   * completion locally and the host would never be told: the session sat at its
   * last polled status forever.
   *
   * Returns null (rather than throwing) when the job is unknown or not yet
   * finished, which is what the poller expects.
   */
  async getCompletionReport(externalJobId) {
    const response = await this.fetch(`/jobs/${encodeURIComponent(externalJobId)}/result`);
    if (!response.ok) return null;
    try {
      return await response.json();
    } catch {
      return null;
    }
  }
  /**
   * Cancel a running job
   */
  async cancel(sessionId) {
    const response = await this.fetch(`/jobs/${sessionId}/cancel`, {
      method: "POST"
    });
    return response.json();
  }
  /**
   * Get status of a specific job
   */
  async getJobStatus(sessionId) {
    const response = await this.fetch(`/jobs/${sessionId}/status`);
    return response.json();
  }
  /**
   * Get queue information
   */
  async getQueue() {
    const response = await this.fetch("/queue");
    return response.json();
  }
  async fetch(path, options = {}) {
    const url = `${this.config.url}${path}`;
    const headers = {
      "Content-Type": "application/json"
    };
    if (this.config.apiKey) {
      headers["Authorization"] = `Bearer ${this.config.apiKey}`;
    }
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);
    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          ...headers,
          ...options.headers
        },
        signal: controller.signal
      });
      return response;
    } finally {
      clearTimeout(timeoutId);
    }
  }
};
var clientInstance = null;
function initOrchestratorClient(config) {
  clientInstance = new OrchestratorClient(config);
  return clientInstance;
}
function getOrchestratorClient() {
  if (!clientInstance) {
    throw new Error("Orchestrator client not initialized. Call initOrchestratorClient first.");
  }
  return clientInstance;
}
function isOrchestratorConfigured() {
  return clientInstance !== null;
}
function buildDispatchRequest(params) {
  return {
    sessionId: params.sessionId,
    repo: params.repo,
    linearTicketId: params.linearTicketId,
    callbackUrl: params.callbackUrl,
    taskSpec: {
      prompt: `Complete the task: ${params.title}`,
      filePaths: params.filePaths,
      model: params.model || "sonnet",
      workstream: params.workstream,
      acceptanceCriteria: params.acceptanceCriteria,
      estimatedMinutes: params.estimatedMinutes
    }
  };
}

// src/orchestrator/ao-cli-adapter.ts
import { exec } from "child_process";
import { promisify } from "util";
var execAsync = promisify(exec);
function parseSessionId(output) {
  const match = output.match(/Session started:\s*(\S+)/i);
  if (match) return match[1];
  const uuidMatch = output.match(/^([a-f0-9-]{36})$/im);
  if (uuidMatch) return uuidMatch[1];
  const sessionMatch = output.match(/session[:\s]+([a-zA-Z0-9_-]+)/i);
  if (sessionMatch) return sessionMatch[1];
  return null;
}
function parseStatusOutput(output) {
  try {
    const json = JSON.parse(output);
    return {
      status: mapAoStatus(json.status || json.state),
      progressPercent: json.progress ?? json.progressPercent ?? 0,
      currentStep: json.currentStep ?? json.step,
      currentFile: json.currentFile ?? json.file,
      message: json.message,
      filesModified: json.filesModified ?? json.files,
      tokensUsed: json.tokensUsed ?? json.tokens,
      costUsd: json.costUsd ?? json.cost
    };
  } catch {
    const status = {};
    const statusMatch = output.match(/status:\s*(\w+)/i);
    if (statusMatch) {
      status.status = mapAoStatus(statusMatch[1]);
    }
    const progressMatch = output.match(/progress:\s*(\d+)/i);
    if (progressMatch) {
      status.progressPercent = parseInt(progressMatch[1], 10);
    }
    const stepMatch = output.match(/(?:step|task|working on):\s*(.+)/i);
    if (stepMatch) {
      status.currentStep = stepMatch[1].trim();
    }
    const fileMatch = output.match(/(?:file|editing):\s*(.+)/i);
    if (fileMatch) {
      status.currentFile = fileMatch[1].trim();
    }
    const messageMatch = output.match(/message:\s*(.+)/i);
    if (messageMatch) {
      status.message = messageMatch[1].trim();
    }
    return status;
  }
}
function mapAoStatus(aoStatus) {
  const normalized = aoStatus?.toLowerCase() ?? "";
  if (normalized.includes("queue") || normalized.includes("pending")) return "queued";
  if (normalized.includes("run") || normalized.includes("active") || normalized.includes("working")) return "running";
  if (normalized.includes("wait") || normalized.includes("pause")) return "waiting";
  if (normalized.includes("complete") || normalized.includes("done") || normalized.includes("finished")) return "complete";
  if (normalized.includes("error") || normalized.includes("fail")) return "error";
  if (normalized.includes("cancel") || normalized.includes("stop")) return "cancelled";
  return "running";
}
var AoCliAdapter = class {
  constructor(config) {
    this.mode = "ao-cli";
    this.config = config;
    this.aoPath = config.aoPath || "ao";
    throw new Error(
      "The ao-cli orchestrator mode is deprecated and non-functional.\n\n  `ao` no longer exposes the commands this adapter calls (`ao list`,\n  `ao status <id>`), and `ao spawn` no longer accepts a prompt.\n\n  Use --mode http against the ao daemon instead:\n    devpilot bridge connect --mode http --http-url http://127.0.0.1:3001\n\n  See docs/AO-INTEGRATION.md for the current integration path."
    );
    this.projectName = config.aoProjectName || "default";
    this.workingDirectory = config.workingDirectory;
  }
  /**
   * Execute an ao command and return stdout
   */
  async execAo(args, options) {
    const cmd = `${this.aoPath} ${args.join(" ")}`;
    const cwd = options?.cwd || this.workingDirectory || process.cwd();
    try {
      const { stdout, stderr } = await execAsync(cmd, {
        cwd,
        timeout: 6e4,
        // 1 minute timeout for most commands
        env: {
          ...process.env
          // Pass through any ao-specific env vars
        }
      });
      return { stdout: stdout.trim(), stderr: stderr.trim() };
    } catch (error) {
      const execError = error;
      if (execError.stdout || execError.stderr) {
        return {
          stdout: execError.stdout?.trim() || "",
          stderr: execError.stderr?.trim() || execError.message
        };
      }
      throw error;
    }
  }
  /**
   * Check if ao CLI is available and working
   */
  async healthCheck() {
    try {
      const { stdout } = await this.execAo(["--version"]);
      let activeJobs = 0;
      try {
        const { stdout: listOutput } = await this.execAo(["list"]);
        const lines = listOutput.split("\n").filter((l) => l.trim());
        activeJobs = lines.length > 1 ? lines.length - 1 : 0;
      } catch {
      }
      return {
        status: "healthy",
        version: stdout || "unknown",
        activeJobs,
        queueLength: 0,
        // ao-cli doesn't have a queue concept
        availableWorkers: 1
        // Local execution
      };
    } catch (error) {
      return {
        status: "down",
        version: "unknown",
        activeJobs: 0,
        queueLength: 0,
        availableWorkers: 0
      };
    }
  }
  /**
   * Dispatch a task using ao spawn
   * Command: ao spawn <project> <ticket-id> "<prompt>"
   */
  async dispatch(request) {
    try {
      const ticketId = request.linearTicketId || request.sessionId;
      const prompt = request.taskSpec.prompt;
      const args = [
        "spawn",
        this.projectName,
        ticketId,
        `"${prompt.replace(/"/g, '\\"')}"`
      ];
      if (request.taskSpec.model) {
        args.push("--model", request.taskSpec.model);
      }
      if (request.repo) {
        args.push("--repo", request.repo);
      }
      const { stdout, stderr } = await this.execAo(args);
      const externalJobId = parseSessionId(stdout);
      if (!externalJobId && stderr) {
        return {
          accepted: false,
          error: `ao spawn failed: ${stderr}`
        };
      }
      return {
        accepted: true,
        orchestratorJobId: externalJobId || ticketId,
        estimatedStartTime: (/* @__PURE__ */ new Date()).toISOString(),
        queuePosition: 0
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        accepted: false,
        error: `Failed to dispatch via ao CLI: ${errorMessage}`
      };
    }
  }
  /**
   * Get job status using ao status <session>
   */
  async getJobStatus(externalJobId) {
    try {
      const { stdout, stderr } = await this.execAo(["status", externalJobId]);
      if (!stdout && stderr) {
        if (stderr.toLowerCase().includes("not found")) {
          return {
            sessionId: externalJobId,
            externalJobId,
            status: "error",
            progressPercent: 0,
            message: "Session not found"
          };
        }
      }
      const parsed = parseStatusOutput(stdout || stderr);
      return {
        sessionId: externalJobId,
        externalJobId,
        status: parsed.status || "running",
        progressPercent: parsed.progressPercent || 0,
        currentStep: parsed.currentStep,
        currentFile: parsed.currentFile,
        message: parsed.message,
        filesModified: parsed.filesModified,
        tokensUsed: parsed.tokensUsed,
        costUsd: parsed.costUsd,
        updatedAt: (/* @__PURE__ */ new Date()).toISOString()
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        sessionId: externalJobId,
        externalJobId,
        status: "error",
        progressPercent: 0,
        message: `Failed to get status: ${errorMessage}`
      };
    }
  }
  /**
   * Cancel a job using ao stop <session>
   */
  async cancel(externalJobId) {
    try {
      const { stdout, stderr } = await this.execAo(["stop", externalJobId]);
      if (stderr && stderr.toLowerCase().includes("error")) {
        return {
          success: false,
          message: stderr
        };
      }
      return {
        success: true,
        message: stdout || `Session ${externalJobId} stopped`
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        message: `Failed to cancel: ${errorMessage}`
      };
    }
  }
  /**
   * Send a message to an active session using ao send <session> "<message>"
   */
  async sendMessage(externalJobId, message) {
    try {
      const { stdout, stderr } = await this.execAo([
        "send",
        externalJobId,
        `"${message.replace(/"/g, '\\"')}"`
      ]);
      if (stderr && stderr.toLowerCase().includes("error")) {
        return {
          success: false,
          error: stderr
        };
      }
      return {
        success: true,
        message: stdout || "Message sent"
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        error: `Failed to send message: ${errorMessage}`
      };
    }
  }
  /**
   * Get completion report for a finished job
   * Uses ao status with detailed output
   */
  async getCompletionReport(externalJobId) {
    try {
      const { stdout } = await this.execAo(["status", externalJobId, "--json"]);
      try {
        const json = JSON.parse(stdout);
        if (json.status !== "complete" && json.status !== "done" && json.status !== "finished") {
          return null;
        }
        return {
          sessionId: externalJobId,
          success: !json.error,
          prUrl: json.prUrl || json.pr_url,
          commitSha: json.commitSha || json.commit,
          filesModified: json.filesModified || [],
          filesCreated: json.filesCreated || [],
          filesDeleted: json.filesDeleted || [],
          summary: json.summary || json.message || "Task completed",
          tokensUsed: json.tokensUsed || 0,
          costUsd: json.costUsd || 0,
          durationMinutes: json.durationMinutes || 0,
          error: json.error ? {
            code: json.error.code || "UNKNOWN",
            message: json.error.message || String(json.error),
            recoverable: json.error.recoverable || false
          } : void 0
        };
      } catch {
        const status = parseStatusOutput(stdout);
        if (status.status !== "complete") {
          return null;
        }
        return {
          sessionId: externalJobId,
          success: true,
          filesModified: status.filesModified || [],
          filesCreated: [],
          filesDeleted: [],
          summary: status.message || "Task completed",
          tokensUsed: status.tokensUsed || 0,
          costUsd: status.costUsd || 0,
          durationMinutes: 0
        };
      }
    } catch {
      return null;
    }
  }
  /**
   * Cleanup - no persistent resources for CLI adapter
   */
  async shutdown() {
  }
};
function createAoCliAdapter(config) {
  return new AoCliAdapter(config);
}

// src/orchestrator/claude-session-adapter.ts
var HttpSessionTransport = class _HttpSessionTransport {
  constructor(baseUrl, apiKey, timeoutMs = 3e4) {
    this.baseUrl = baseUrl;
    this.apiKey = apiKey;
    this.timeoutMs = timeoutMs;
  }
  /** Extract the runner's session id from a create/idempotent response body. */
  static readExternalId(json) {
    const j = json ?? {};
    return j.externalSessionId ?? j.sessionId ?? j.id;
  }
  async createSession(params) {
    try {
      const res = await this.fetch("/v1/sessions", {
        method: "POST",
        body: JSON.stringify(params)
      });
      if (res.status === 201 || res.status === 200) {
        const json = await res.json().catch(() => ({}));
        return { accepted: true, externalSessionId: _HttpSessionTransport.readExternalId(json) };
      }
      if (res.status === 409) {
        const json = await res.json().catch(() => ({}));
        const existing = _HttpSessionTransport.readExternalId(json);
        if (existing) {
          return { accepted: true, externalSessionId: existing };
        }
        return { accepted: false, error: "CONFLICT: session already dispatched without an id in response" };
      }
      if (res.status === 429) {
        return { accepted: false, error: "CAPACITY" };
      }
      return { accepted: false, error: `Session create failed: ${res.status} ${await res.text().catch(() => "")}` };
    } catch (error) {
      return { accepted: false, error: error instanceof Error ? error.message : String(error) };
    }
  }
  async sendMessage(externalSessionId, message) {
    try {
      const res = await this.fetch(`/v1/sessions/${externalSessionId}/messages`, {
        method: "POST",
        body: JSON.stringify({ message })
      });
      if (res.status === 410) {
        return { success: false, error: "session already terminal" };
      }
      return res.ok ? { success: true } : { success: false, error: `send failed: ${res.status}` };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }
  async stopSession(externalSessionId) {
    try {
      const res = await this.fetch(`/v1/sessions/${externalSessionId}/stop`, { method: "POST" });
      if (res.ok || res.status === 410) {
        return { success: true, message: `Session ${externalSessionId} stopped` };
      }
      return { success: false, message: `stop failed: ${res.status}` };
    } catch (error) {
      return { success: false, message: error instanceof Error ? error.message : String(error) };
    }
  }
  async getSession(externalSessionId) {
    try {
      const res = await this.fetch(`/v1/sessions/${externalSessionId}`);
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }
  async health() {
    try {
      const res = await this.fetch("/v1/health");
      if (!res.ok) return { status: "down", version: "unknown" };
      const json = await res.json();
      return { status: "healthy", version: json.version ?? "unknown" };
    } catch {
      return { status: "down", version: "unknown" };
    }
  }
  async fetch(path, options = {}) {
    const headers = { "Content-Type": "application/json" };
    if (this.apiKey) headers["Authorization"] = `Bearer ${this.apiKey}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      return await fetch(`${this.baseUrl}${path}`, {
        ...options,
        headers: { ...headers, ...options.headers },
        signal: controller.signal
      });
    } finally {
      clearTimeout(timeout);
    }
  }
};
var ClaudeSessionAdapter = class {
  constructor(config, transport) {
    this.mode = "claude-session";
    this.pushBased = true;
    this.cache = /* @__PURE__ */ new Map();
    this.config = config;
    if (transport) {
      this.transport = transport;
    } else {
      if (!config.sessionApiUrl) {
        throw new Error(
          "claude-session adapter requires sessionApiUrl (or an injected SessionTransport)"
        );
      }
      this.transport = new HttpSessionTransport(
        config.sessionApiUrl,
        config.sessionApiKey ?? config.apiKey,
        config.timeout
      );
    }
  }
  async healthCheck() {
    const base = {
      status: "healthy",
      version: "claude-session",
      activeJobs: this.cache.size,
      queueLength: 0,
      availableWorkers: 1
    };
    if (this.transport.health) {
      const probe = await this.transport.health();
      return { ...base, status: probe.status, version: probe.version };
    }
    return base;
  }
  async dispatch(request) {
    const result = await this.transport.createSession({
      sessionId: request.sessionId,
      repo: request.repo,
      prompt: request.taskSpec.prompt,
      model: request.taskSpec.model,
      filePaths: request.taskSpec.filePaths,
      acceptanceCriteria: request.taskSpec.acceptanceCriteria,
      constraints: request.taskSpec.constraints,
      linearTicketId: request.linearTicketId,
      callbackUrl: request.callbackUrl,
      callbackToken: this.config.callbackToken,
      environmentId: this.config.sessionEnvironmentId,
      metadata: request.metadata
    });
    if (!result.accepted || !result.externalSessionId) {
      return { accepted: false, error: result.error ?? "Session dispatch rejected" };
    }
    this.cache.set(result.externalSessionId, {
      status: {
        sessionId: request.sessionId,
        externalJobId: result.externalSessionId,
        status: "queued",
        progressPercent: 0,
        message: "Session dispatched, awaiting first update",
        startedAt: (/* @__PURE__ */ new Date()).toISOString()
      }
    });
    return {
      accepted: true,
      orchestratorJobId: result.externalSessionId,
      estimatedStartTime: (/* @__PURE__ */ new Date()).toISOString(),
      queuePosition: 0
    };
  }
  async getJobStatus(externalJobId) {
    const cached = this.cache.get(externalJobId);
    if (cached) return cached.status;
    if (this.transport.getSession) {
      const pulled = await this.transport.getSession(externalJobId);
      if (pulled) {
        return {
          sessionId: externalJobId,
          externalJobId,
          status: pulled.status ?? "running",
          progressPercent: pulled.progressPercent ?? 0,
          currentStep: pulled.currentStep,
          currentFile: pulled.currentFile,
          message: pulled.message,
          filesModified: pulled.filesModified,
          updatedAt: (/* @__PURE__ */ new Date()).toISOString()
        };
      }
    }
    return {
      sessionId: externalJobId,
      externalJobId,
      status: "error",
      progressPercent: 0,
      message: "Unknown session (no cached state and no pull fallback)"
    };
  }
  async cancel(externalJobId) {
    const result = await this.transport.stopSession(externalJobId);
    if (result.success) this.cache.delete(externalJobId);
    return result;
  }
  async sendMessage(externalJobId, message) {
    const result = await this.transport.sendMessage(externalJobId, message);
    return result.success ? { success: true, message: "Message delivered to session" } : { success: false, error: result.error };
  }
  async getCompletionReport(externalJobId) {
    return this.cache.get(externalJobId)?.completion ?? null;
  }
  async shutdown() {
    this.cache.clear();
  }
  // --- IPushCapableAdapter -------------------------------------------------
  /**
   * Feed a pushed status update (from the session's POST to
   * `/api/orchestrator/status`) into the adapter's cache.
   */
  ingestStatus(externalJobId, update) {
    const prev = this.cache.get(externalJobId);
    this.cache.set(externalJobId, {
      completion: prev?.completion,
      status: {
        sessionId: update.sessionId,
        externalJobId,
        status: update.status,
        progressPercent: update.progressPercent,
        currentStep: update.currentStep,
        currentFile: update.currentFile,
        message: update.message,
        filesModified: update.filesModified,
        tokensUsed: update.tokensUsed,
        updatedAt: update.timestamp
      }
    });
  }
  /**
   * Feed a pushed completion report (from the session's POST to
   * `/api/orchestrator/complete`) into the adapter's cache.
   */
  ingestCompletion(externalJobId, report) {
    const prev = this.cache.get(externalJobId);
    this.cache.set(externalJobId, {
      completion: report,
      status: {
        sessionId: report.sessionId,
        externalJobId,
        status: report.success ? "complete" : "error",
        progressPercent: report.success ? 100 : prev?.status.progressPercent ?? 0,
        message: report.summary,
        filesModified: report.filesModified,
        tokensUsed: report.tokensUsed,
        costUsd: report.costUsd,
        updatedAt: (/* @__PURE__ */ new Date()).toISOString()
      }
    });
  }
};
function createClaudeSessionAdapter(config, transport) {
  return new ClaudeSessionAdapter(config, transport);
}

// src/orchestrator/session-prompt.ts
function buildSessionPrompt(input) {
  const {
    taskDescription,
    repo,
    fileScope,
    predecessorContext,
    acceptanceCriteria,
    constraints,
    callbackUrl,
    sessionId
  } = input;
  const sections = [];
  sections.push(`# Task

${taskDescription}

**Repository:** \`${repo}\``);
  if (fileScope.length > 0) {
    sections.push(
      `# File Scope

You hold an **exclusive lock** on the following files for the duration of this task. Do not modify files outside this set \u2014 other agents are working in parallel and edits outside your scope will conflict:

` + fileScope.map((f) => `- \`${f}\``).join("\n")
    );
  }
  if (predecessorContext.length > 0) {
    const blocks = predecessorContext.map((p) => {
      const files = p.filesModified.length > 0 ? p.filesModified.map((f) => `\`${f}\``).join(", ") : "(none recorded)";
      const summary = p.completionSummary?.trim() || "(no summary provided)";
      return `## ${p.taskCode} \u2014 ${p.description}

- Files modified: ${files}
- Summary: ${summary}`;
    }).join("\n\n");
    sections.push(
      `# Context From Predecessors

These upstream tasks completed before yours; build on their work:

${blocks}`
    );
  }
  if (acceptanceCriteria && acceptanceCriteria.length > 0) {
    sections.push(
      `# Acceptance Criteria

` + acceptanceCriteria.map((c) => `- ${c}`).join("\n")
    );
  }
  if (constraints && constraints.length > 0) {
    sections.push(
      `# Constraints

` + constraints.map((c) => `- ${c}`).join("\n")
    );
  }
  const statusUrl = `${callbackUrl}/status`;
  const completeUrl = `${callbackUrl}/complete`;
  sections.push(
    `# Reporting Protocol

You MUST report progress back to DevPilot so it can track this task. Your DevPilot session id is \`${sessionId}\` \u2014 use it as \`sessionId\` in every callback body.

**On each meaningful milestone** (and at least every 2 minutes while working), POST a status update:

\`\`\`bash
curl -sS -X POST '${statusUrl}' \\
  -H 'Content-Type: application/json' \\
  -H 'X-DevPilot-Callback-Token: <callback-token>' \\
  -d '{
    "sessionId": "${sessionId}",
    "status": "running",
    "progressPercent": 40,
    "currentStep": "implementing X",
    "message": "\u2026",
    "filesModified": ["src/lib/foo.ts"],
    "timestamp": "'"$(date -u +%Y-%m-%dT%H:%M:%SZ)"'"
  }'
\`\`\`

**Exactly once, when the task is done** (success or failure), POST the final completion report:

\`\`\`bash
curl -sS -X POST '${completeUrl}' \\
  -H 'Content-Type: application/json' \\
  -H 'X-DevPilot-Callback-Token: <callback-token>' \\
  -d '{
    "sessionId": "${sessionId}",
    "success": true,
    "filesModified": ["src/lib/foo.ts"],
    "filesCreated": [],
    "filesDeleted": [],
    "summary": "One-paragraph summary of what you did.",
    "tokensUsed": 0,
    "costUsd": 0,
    "durationMinutes": 0,
    "timestamp": "'"$(date -u +%Y-%m-%dT%H:%M:%SZ)"'"
  }'
\`\`\`

Replace \`<callback-token>\` with the token provided by your runner. Send the completion callback even if the task failed \u2014 set \`"success": false\` and include an \`"error"\` field describing what went wrong.`
  );
  return sections.join("\n\n");
}

// src/orchestrator/service.ts
var HttpAdapter = class {
  constructor(config) {
    this.mode = "http";
    if (!config.url) {
      throw new Error("HTTP adapter requires url configuration");
    }
    this.client = new OrchestratorClient({
      url: config.url,
      apiKey: config.apiKey,
      callbackUrl: config.callbackUrl || "",
      timeout: config.timeout
    });
  }
  async healthCheck() {
    return this.client.healthCheck();
  }
  async dispatch(request) {
    return this.client.dispatch(request);
  }
  /**
   * Forwarded so http mode can actually finish.
   *
   * IOrchestratorAdapter.getCompletionReport is OPTIONAL, and this adapter did
   * not implement it — so OrchestratorService.getCompletionReport always
   * returned null for http mode, StatusPoller.handleCompletion never invoked
   * onComplete, and a job that finished locally was never reported to the host.
   * The ao-cli and claude-session adapters both implement it; this was the odd
   * one out.
   */
  async getCompletionReport(externalJobId) {
    return this.client.getCompletionReport(externalJobId);
  }
  async getJobStatus(externalJobId) {
    const status = await this.client.getJobStatus(externalJobId);
    return {
      sessionId: externalJobId,
      externalJobId,
      status: status.status,
      progressPercent: status.progressPercent,
      message: status.message
    };
  }
  async cancel(externalJobId) {
    return this.client.cancel(externalJobId);
  }
  async sendMessage(_externalJobId, _message) {
    return {
      success: false,
      error: "HTTP adapter does not support direct messaging"
    };
  }
  async shutdown() {
  }
};
var DisabledAdapter = class {
  constructor() {
    this.mode = "disabled";
  }
  async healthCheck() {
    return {
      status: "down",
      version: "disabled",
      activeJobs: 0,
      queueLength: 0,
      availableWorkers: 0
    };
  }
  async dispatch(_request) {
    return {
      accepted: false,
      error: "Orchestrator is disabled"
    };
  }
  async getJobStatus(externalJobId) {
    return {
      sessionId: externalJobId,
      externalJobId,
      status: "error",
      progressPercent: 0,
      message: "Orchestrator is disabled"
    };
  }
  async cancel(_externalJobId) {
    return {
      success: false,
      message: "Orchestrator is disabled"
    };
  }
  async shutdown() {
  }
};
var OrchestratorService = class {
  constructor(config, sessionTransport) {
    this.sessionMappings = /* @__PURE__ */ new Map();
    this.eventCallbacks = /* @__PURE__ */ new Set();
    this.config = config;
    this.sessionTransport = sessionTransport;
    this.adapter = this.createAdapter(config);
  }
  /**
   * Create the appropriate adapter based on mode
   */
  createAdapter(config) {
    switch (config.mode) {
      case "claude-session":
        return new ClaudeSessionAdapter(config, this.sessionTransport);
      case "http":
        return new HttpAdapter(config);
      case "ao-cli":
        return new AoCliAdapter(config);
      case "disabled":
      default:
        return new DisabledAdapter();
    }
  }
  /**
   * Whether the active adapter receives progress via pushed callbacks. When
   * true, the StatusPoller should not track its sessions.
   */
  get isPushBased() {
    return this.adapter.pushBased ?? false;
  }
  /**
   * Get current orchestrator mode
   */
  get mode() {
    return this.adapter.mode;
  }
  /**
   * Check if orchestrator is available
   */
  get isEnabled() {
    return this.adapter.mode !== "disabled";
  }
  /**
   * Subscribe to orchestrator events
   */
  onEvent(callback) {
    this.eventCallbacks.add(callback);
    return () => this.eventCallbacks.delete(callback);
  }
  /**
   * Emit an event to all subscribers
   */
  emitEvent(event) {
    for (const callback of this.eventCallbacks) {
      try {
        callback(event);
      } catch (error) {
        console.error("Error in orchestrator event callback:", error);
      }
    }
  }
  /**
   * Check orchestrator health
   */
  async healthCheck() {
    return this.adapter.healthCheck();
  }
  /**
   * Dispatch a task to the orchestrator
   * Stores session mapping for later status queries
   */
  async dispatch(request) {
    const response = await this.adapter.dispatch(request);
    if (response.accepted && response.orchestratorJobId) {
      this.sessionMappings.set(request.sessionId, {
        sessionId: request.sessionId,
        externalJobId: response.orchestratorJobId,
        mode: this.adapter.mode,
        startedAt: /* @__PURE__ */ new Date()
      });
      this.emitEvent({
        type: "job:started",
        sessionId: request.sessionId,
        externalJobId: response.orchestratorJobId,
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        data: {
          sessionId: request.sessionId,
          status: "running",
          progressPercent: 0,
          timestamp: (/* @__PURE__ */ new Date()).toISOString()
        }
      });
    }
    return {
      ...response,
      mode: this.adapter.mode
    };
  }
  /**
   * Get job status by DevPilot session ID
   */
  async getJobStatusBySessionId(sessionId) {
    const mapping = this.sessionMappings.get(sessionId);
    if (!mapping) {
      return null;
    }
    const status = await this.adapter.getJobStatus(mapping.externalJobId);
    mapping.lastStatusAt = /* @__PURE__ */ new Date();
    this.emitEvent({
      type: "job:progress",
      sessionId,
      externalJobId: mapping.externalJobId,
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      data: {
        sessionId,
        status: status.status,
        progressPercent: status.progressPercent,
        currentStep: status.currentStep,
        currentFile: status.currentFile,
        message: status.message,
        filesModified: status.filesModified,
        tokensUsed: status.tokensUsed,
        timestamp: (/* @__PURE__ */ new Date()).toISOString()
      }
    });
    return status;
  }
  /**
   * Get job status by external job ID
   */
  async getJobStatus(externalJobId) {
    return this.adapter.getJobStatus(externalJobId);
  }
  /**
   * Cancel a job by DevPilot session ID
   */
  async cancelBySessionId(sessionId) {
    const mapping = this.sessionMappings.get(sessionId);
    if (!mapping) {
      return {
        success: false,
        message: `No active job found for session ${sessionId}`
      };
    }
    const result = await this.adapter.cancel(mapping.externalJobId);
    if (result.success) {
      this.emitEvent({
        type: "job:cancelled",
        sessionId,
        externalJobId: mapping.externalJobId,
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        data: { error: "Cancelled by user" }
      });
      this.sessionMappings.delete(sessionId);
    }
    return result;
  }
  /**
   * Cancel a job by external job ID
   */
  async cancel(externalJobId) {
    return this.adapter.cancel(externalJobId);
  }
  /**
   * Send a message to an active session
   */
  async sendMessage(sessionId, message) {
    const mapping = this.sessionMappings.get(sessionId);
    if (!mapping) {
      return {
        success: false,
        error: `No active job found for session ${sessionId}`
      };
    }
    if (!this.adapter.sendMessage) {
      return {
        success: false,
        error: `Current adapter (${this.adapter.mode}) does not support messaging`
      };
    }
    return this.adapter.sendMessage(mapping.externalJobId, message);
  }
  /**
   * Get completion report for a finished job
   */
  async getCompletionReport(sessionId) {
    const mapping = this.sessionMappings.get(sessionId);
    if (!mapping) {
      return null;
    }
    if (!this.adapter.getCompletionReport) {
      return null;
    }
    return this.adapter.getCompletionReport(mapping.externalJobId);
  }
  /**
   * Ingest a pushed status update from a session callback
   * (`/api/orchestrator/status`). For push-based adapters this replaces the
   * poll loop: the payload is cached on the adapter and re-emitted as a
   * `job:progress` event to SSE subscribers. No-op mapping if the session is
   * unknown. Safe to call for non-push adapters (falls through to event only).
   */
  ingestStatusUpdate(update) {
    const mapping = this.sessionMappings.get(update.sessionId);
    if (mapping && isPushCapableAdapter(this.adapter)) {
      this.adapter.ingestStatus(mapping.externalJobId, update);
      mapping.lastStatusAt = /* @__PURE__ */ new Date();
    }
    this.emitEvent({
      type: "job:progress",
      sessionId: update.sessionId,
      externalJobId: mapping?.externalJobId ?? update.sessionId,
      timestamp: update.timestamp,
      data: update
    });
  }
  /**
   * Ingest a pushed completion report from a session callback
   * (`/api/orchestrator/complete`). Caches it on the adapter (so
   * getCompletionReport can serve it) and finalizes the session.
   */
  ingestCompletionReport(report) {
    const mapping = this.sessionMappings.get(report.sessionId);
    if (mapping && isPushCapableAdapter(this.adapter)) {
      this.adapter.ingestCompletion(mapping.externalJobId, report);
    }
    this.markSessionComplete(report.sessionId, report);
  }
  /**
   * Mark a session as complete (for external completion notifications)
   */
  markSessionComplete(sessionId, report) {
    const mapping = this.sessionMappings.get(sessionId);
    if (!mapping) return;
    this.emitEvent({
      type: report.success ? "job:complete" : "job:error",
      sessionId,
      externalJobId: mapping.externalJobId,
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      data: report
    });
    this.sessionMappings.delete(sessionId);
  }
  /**
   * Get all active session mappings
   */
  getActiveSessions() {
    return Array.from(this.sessionMappings.values());
  }
  /**
   * Get external job ID for a session
   */
  getExternalJobId(sessionId) {
    return this.sessionMappings.get(sessionId)?.externalJobId;
  }
  /**
   * Shutdown the orchestrator service
   */
  async shutdown() {
    if (this.adapter.shutdown) {
      await this.adapter.shutdown();
    }
    this.sessionMappings.clear();
    this.eventCallbacks.clear();
  }
};
var globalForOrchestrator = globalThis;
function getInstance() {
  return globalForOrchestrator.__devpilotOrchestratorService ?? null;
}
function setInstance(service) {
  globalForOrchestrator.__devpilotOrchestratorService = service;
}
function initOrchestratorService(config, sessionTransport) {
  const existing = getInstance();
  if (existing) {
    existing.shutdown();
  }
  const service = new OrchestratorService(config, sessionTransport);
  setInstance(service);
  return service;
}
function getOrchestratorService() {
  const service = getInstance();
  if (!service) {
    throw new Error("Orchestrator service not initialized. Call initOrchestratorService first.");
  }
  return service;
}
function isOrchestratorServiceInitialized() {
  return getInstance() !== null;
}
function getOrchestratorServiceOrNull() {
  return getInstance();
}

// src/orchestrator/status-poller.ts
var DEFAULT_CONFIG = {
  pollIntervalMs: 5e3,
  // 5 seconds
  maxRetries: 3
};
var StatusPoller = class {
  constructor(orchestrator, config = {}) {
    this.trackedSessions = /* @__PURE__ */ new Map();
    this.pollInterval = null;
    this.isPolling = false;
    this.isRunning = false;
    this.orchestrator = orchestrator;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.unsubscribe = orchestrator.onEvent(this.handleOrchestratorEvent.bind(this));
  }
  /**
   * Handle events from orchestrator service
   */
  handleOrchestratorEvent(event) {
    switch (event.type) {
      case "job:started":
        if (this.orchestrator.isPushBased) break;
        this.trackSession(event.sessionId, event.externalJobId);
        break;
      case "job:complete":
      case "job:error":
      case "job:cancelled":
        this.untrackSession(event.sessionId);
        break;
    }
  }
  /**
   * Start tracking a session for polling
   */
  trackSession(sessionId, externalJobId) {
    if (this.trackedSessions.has(sessionId)) return;
    this.trackedSessions.set(sessionId, {
      sessionId,
      externalJobId,
      retryCount: 0,
      startedAt: /* @__PURE__ */ new Date()
    });
    if (!this.isRunning && this.trackedSessions.size > 0) {
      this.start();
    }
  }
  /**
   * Stop tracking a session
   */
  untrackSession(sessionId) {
    this.trackedSessions.delete(sessionId);
    if (this.trackedSessions.size === 0) {
      this.stop();
    }
  }
  /**
   * Start the polling loop
   */
  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.pollInterval = setInterval(
      () => this.poll(),
      this.config.pollIntervalMs
    );
    this.poll();
  }
  /**
   * Stop the polling loop
   */
  stop() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    this.isRunning = false;
  }
  /**
   * Poll all tracked sessions for status
   */
  async poll() {
    if (this.isPolling) return;
    this.isPolling = true;
    try {
      await this.pollOnce();
    } finally {
      this.isPolling = false;
    }
  }
  async pollOnce() {
    const sessions = Array.from(this.trackedSessions.values());
    if (sessions.length === 0) return;
    await Promise.all(
      sessions.map((session) => this.pollSession(session))
    );
  }
  /**
   * Poll a single session for status
   */
  async pollSession(session) {
    try {
      const status = await this.orchestrator.getJobStatus(session.externalJobId);
      session.lastPollAt = /* @__PURE__ */ new Date();
      session.retryCount = 0;
      const statusChanged = !session.lastStatus || session.lastStatus.status !== status.status || session.lastStatus.progressPercent !== status.progressPercent || session.lastStatus.currentStep !== status.currentStep;
      if (statusChanged) {
        session.lastStatus = status;
        if (this.config.onStatusUpdate) {
          await this.config.onStatusUpdate(session.sessionId, status);
        }
      }
      if (status.status === "complete" || status.status === "error" || status.status === "cancelled") {
        await this.handleCompletion(session, status);
      }
    } catch (error) {
      session.retryCount++;
      if (session.retryCount >= this.config.maxRetries) {
        if (this.config.onError) {
          await this.config.onError(
            session.sessionId,
            error instanceof Error ? error : new Error(String(error))
          );
        }
        this.untrackSession(session.sessionId);
      }
    }
  }
  /**
   * Handle session completion
   */
  async handleCompletion(session, status) {
    const report = await this.orchestrator.getCompletionReport(session.sessionId);
    if (report && this.config.onComplete) {
      await this.config.onComplete(session.sessionId, report);
    } else if (status.status === "error" && this.config.onError) {
      await this.config.onError(
        session.sessionId,
        new Error(status.message || "Job failed")
      );
    }
    if (report) {
      this.orchestrator.markSessionComplete(session.sessionId, report);
    }
    this.untrackSession(session.sessionId);
  }
  /**
   * Get all currently tracked sessions
   */
  getTrackedSessions() {
    return Array.from(this.trackedSessions.values());
  }
  /**
   * Get polling statistics
   */
  getStats() {
    return {
      isRunning: this.isRunning,
      trackedCount: this.trackedSessions.size,
      pollIntervalMs: this.config.pollIntervalMs
    };
  }
  /**
   * Shutdown the poller
   */
  shutdown() {
    this.stop();
    if (this.unsubscribe) {
      this.unsubscribe();
    }
    this.trackedSessions.clear();
  }
};
var pollerInstance = null;
function initStatusPoller(orchestrator, config) {
  if (pollerInstance) {
    pollerInstance.shutdown();
  }
  pollerInstance = new StatusPoller(orchestrator, config);
  return pollerInstance;
}
function getStatusPoller() {
  if (!pollerInstance) {
    throw new Error("Status poller not initialized. Call initStatusPoller first.");
  }
  return pollerInstance;
}
function isStatusPollerInitialized() {
  return pollerInstance !== null;
}
function getStatusPollerOrNull() {
  return pollerInstance;
}

// src/orchestrator/host-wiring.ts
import { eq } from "drizzle-orm";

// src/db/config.ts
import { z } from "zod";
var databaseConfigSchema = z.object({
  type: z.enum(["sqlite", "postgres"]).default("sqlite"),
  // SQLite options
  sqlitePath: z.string().optional(),
  // Postgres options
  postgresUrl: z.string().optional()
});
function getDatabaseConfig() {
  const type = process.env.DEVPILOT_DB_TYPE || "sqlite";
  return {
    type,
    sqlitePath: process.env.DEVPILOT_SQLITE_PATH || ".devpilot/data.db",
    postgresUrl: process.env.DATABASE_URL
  };
}

// src/db/adapters/sqlite.ts
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";

// src/db/schema/index.ts
var schema_exports = {};
__export(schema_exports, {
  activityEvents: () => activityEvents,
  completedTasks: () => completedTasks,
  completedTasksRelations: () => completedTasksRelations,
  complexityValues: () => complexityValues,
  conductorScores: () => conductorScores,
  conductorScoresRelations: () => conductorScoresRelations,
  conflictingFiles: () => conflictingFiles,
  conflictingFilesRelations: () => conflictingFilesRelations,
  dependencyEdgeTypeValues: () => dependencyEdgeTypeValues,
  dependencyEdges: () => dependencyEdges,
  dependencyEdgesRelations: () => dependencyEdgesRelations,
  eventTypeValues: () => eventTypeValues,
  fileStatusValues: () => fileStatusValues,
  horizonItems: () => horizonItems,
  horizonItemsRelations: () => horizonItemsRelations,
  inFlightFiles: () => inFlightFiles,
  inFlightFilesRelations: () => inFlightFilesRelations,
  modelValues: () => modelValues,
  orchestratorModeValues: () => orchestratorModeValues,
  palaceClosets: () => palaceClosets,
  palaceClosetsRelations: () => palaceClosetsRelations,
  palaceDiary: () => palaceDiary,
  palaceDrawers: () => palaceDrawers,
  palaceDrawersRelations: () => palaceDrawersRelations,
  palaceHalls: () => palaceHalls,
  palaceKgTriples: () => palaceKgTriples,
  palaceRooms: () => palaceRooms,
  palaceRoomsRelations: () => palaceRoomsRelations,
  palaceTunnels: () => palaceTunnels,
  palaceWings: () => palaceWings,
  palaceWingsRelations: () => palaceWingsRelations,
  plans: () => plans,
  plansRelations: () => plansRelations,
  rufloSessions: () => rufloSessions,
  rufloSessionsRelations: () => rufloSessionsRelations,
  scoreHistory: () => scoreHistory,
  scoreHistoryRelations: () => scoreHistoryRelations,
  sessionStatusValues: () => sessionStatusValues,
  tasks: () => tasks,
  tasksRelations: () => tasksRelations,
  touchedFiles: () => touchedFiles,
  touchedFilesRelations: () => touchedFilesRelations,
  wavePlanMetrics: () => wavePlanMetrics,
  wavePlanMetricsRelations: () => wavePlanMetricsRelations,
  wavePlanStatusValues: () => wavePlanStatusValues,
  wavePlans: () => wavePlans,
  wavePlansRelations: () => wavePlansRelations,
  waveStatusValues: () => waveStatusValues,
  waveTaskStatusValues: () => waveTaskStatusValues,
  waveTasks: () => waveTasks,
  waveTasksRelations: () => waveTasksRelations,
  waves: () => waves,
  wavesRelations: () => wavesRelations,
  wikiArticleStatusValues: () => wikiArticleStatusValues,
  wikiArticles: () => wikiArticles,
  wikiArticlesRelations: () => wikiArticlesRelations,
  wikiLog: () => wikiLog,
  wikiLogActionValues: () => wikiLogActionValues,
  wikiLogRelations: () => wikiLogRelations,
  wikiSourceTypeValues: () => wikiSourceTypeValues,
  wikiSources: () => wikiSources,
  wikiSourcesRelations: () => wikiSourcesRelations,
  workstreams: () => workstreams,
  workstreamsRelations: () => workstreamsRelations,
  zoneValues: () => zoneValues
});

// src/db/schema/enums.ts
var zoneValues = ["READY", "REFINING", "SHAPING", "DIRECTIONAL"];
var complexityValues = ["S", "M", "L", "XL"];
var modelValues = ["HAIKU", "SONNET", "OPUS"];
var sessionStatusValues = ["ACTIVE", "NEEDS_SPEC", "COMPLETE", "ERROR"];
var fileStatusValues = ["AVAILABLE", "IN_FLIGHT", "RECENTLY_MODIFIED"];
var eventTypeValues = [
  "SESSION_PROGRESS",
  "SESSION_COMPLETE",
  "PLAN_GENERATED",
  "PLAN_APPROVED",
  "ITEM_CREATED",
  "ITEM_DISPATCHED",
  "RUNWAY_UPDATE",
  "FILE_UNLOCKED",
  "SCORE_UPDATE",
  // Wave Planner events
  "WAVE_PLAN_CREATED",
  "WAVE_DISPATCHING",
  "WAVE_TASK_DISPATCHED",
  "WAVE_TASK_COMPLETE",
  "WAVE_TASK_FAILED",
  "WAVE_COMPLETE",
  "WAVE_ADVANCE",
  "WAVE_PLAN_COMPLETE",
  "WAVE_PLAN_FAILED",
  "WAVE_PLAN_REOPTIMIZING"
];
var orchestratorModeValues = ["claude-session", "http", "ao-cli", "manual", "disabled"];
var wavePlanStatusValues = [
  "draft",
  "approved",
  "executing",
  "paused",
  "completed",
  "failed",
  "re-optimizing"
];
var waveStatusValues = [
  "pending",
  "dispatching",
  "active",
  "completed",
  "failed",
  "skipped"
];
var waveTaskStatusValues = [
  "pending",
  "dispatched",
  "running",
  "completed",
  "failed",
  "retrying",
  "skipped"
];
var dependencyEdgeTypeValues = ["hard", "soft"];
var wikiSourceTypeValues = [
  "session_log",
  "commit",
  "spec",
  "decision",
  "manual"
];
var wikiArticleStatusValues = ["active", "stale", "archived"];
var wikiLogActionValues = [
  "ingest",
  "compile",
  "query",
  "lint",
  "update"
];

// src/db/schema/horizon.ts
import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { relations } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";
var horizonItems = sqliteTable("horizon_items", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  title: text("title").notNull(),
  zone: text("zone", { enum: zoneValues }).notNull().default("DIRECTIONAL"),
  repo: text("repo").notNull(),
  complexity: text("complexity", { enum: complexityValues }),
  priority: integer("priority").notNull().default(0),
  linearTicketId: text("linear_ticket_id"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => /* @__PURE__ */ new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => /* @__PURE__ */ new Date())
});
var horizonItemsRelations = relations(horizonItems, ({ one, many }) => ({
  plan: one(plans, {
    fields: [horizonItems.id],
    references: [plans.horizonItemId]
  }),
  conflictingFiles: many(inFlightFiles)
}));
var plans = sqliteTable("plans", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  version: integer("version").notNull().default(1),
  horizonItemId: text("horizon_item_id").notNull().unique(),
  estimatedCostUsd: real("estimated_cost_usd").notNull(),
  baselineCostUsd: real("baseline_cost_usd").notNull(),
  acceptanceCriteria: text("acceptance_criteria", { mode: "json" }).$type().notNull(),
  confidenceSignals: text("confidence_signals", { mode: "json" }).$type().notNull(),
  fleetContextSnapshot: text("fleet_context_snapshot", { mode: "json" }).$type().notNull(),
  memorySessionsUsed: text("memory_sessions_used", { mode: "json" }).$type().default([]),
  previousPlanId: text("previous_plan_id"),
  generatedAt: integer("generated_at", { mode: "timestamp" }).notNull().$defaultFn(() => /* @__PURE__ */ new Date())
});
var plansRelations = relations(plans, ({ one, many }) => ({
  horizonItem: one(horizonItems, {
    fields: [plans.horizonItemId],
    references: [horizonItems.id]
  }),
  workstreams: many(workstreams),
  sequentialTasks: many(tasks, { relationName: "sequentialTasks" }),
  filesTouched: many(touchedFiles),
  previousPlan: one(plans, {
    fields: [plans.previousPlanId],
    references: [plans.id],
    relationName: "planHistory"
  })
}));
var workstreams = sqliteTable("workstreams", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  planId: text("plan_id").notNull(),
  label: text("label").notNull(),
  repo: text("repo").notNull(),
  workerCount: integer("worker_count").notNull().default(1),
  orderIndex: integer("order_index").notNull().default(0)
});
var workstreamsRelations = relations(workstreams, ({ one, many }) => ({
  plan: one(plans, {
    fields: [workstreams.planId],
    references: [plans.id]
  }),
  tasks: many(tasks)
}));
var tasks = sqliteTable("tasks", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  label: text("label").notNull(),
  model: text("model", { enum: modelValues }).notNull().default("SONNET"),
  modelOverride: text("model_override", { enum: modelValues }),
  complexity: text("complexity", { enum: complexityValues }).notNull(),
  estimatedCostUsd: real("estimated_cost_usd").notNull(),
  filePaths: text("file_paths", { mode: "json" }).$type().notNull(),
  conflictWarning: text("conflict_warning"),
  dependsOn: text("depends_on", { mode: "json" }).$type().default([]),
  orderIndex: integer("order_index").notNull().default(0),
  // Either belongs to a workstream OR is a sequential task on a plan
  workstreamId: text("workstream_id"),
  planId: text("plan_id")
});
var tasksRelations = relations(tasks, ({ one }) => ({
  workstream: one(workstreams, {
    fields: [tasks.workstreamId],
    references: [workstreams.id]
  }),
  plan: one(plans, {
    fields: [tasks.planId],
    references: [plans.id],
    relationName: "sequentialTasks"
  })
}));
var touchedFiles = sqliteTable("touched_files", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  planId: text("plan_id").notNull(),
  path: text("path").notNull(),
  status: text("status", { enum: fileStatusValues }).notNull().default("AVAILABLE"),
  inFlightVia: text("in_flight_via")
});
var touchedFilesRelations = relations(touchedFiles, ({ one }) => ({
  plan: one(plans, {
    fields: [touchedFiles.planId],
    references: [plans.id]
  })
}));
var inFlightFiles = sqliteTable("in_flight_files", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  path: text("path").notNull(),
  activeSessionId: text("active_session_id").notNull(),
  linearTicketId: text("linear_ticket_id").notNull(),
  estimatedMinutesRemaining: integer("estimated_minutes_remaining").notNull().default(30),
  horizonItemId: text("horizon_item_id"),
  lockedAt: integer("locked_at", { mode: "timestamp" }).notNull().$defaultFn(() => /* @__PURE__ */ new Date())
});
var inFlightFilesRelations = relations(inFlightFiles, ({ one }) => ({
  horizonItem: one(horizonItems, {
    fields: [inFlightFiles.horizonItemId],
    references: [horizonItems.id]
  })
}));
var conflictingFiles = sqliteTable("conflicting_files", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  horizonItemId: text("horizon_item_id").notNull(),
  path: text("path").notNull(),
  blockedBySessionId: text("blocked_by_session_id"),
  blockedByTicketId: text("blocked_by_ticket_id"),
  estimatedUnlockMinutes: integer("estimated_unlock_minutes")
});
var conflictingFilesRelations = relations(conflictingFiles, ({ one }) => ({
  horizonItem: one(horizonItems, {
    fields: [conflictingFiles.horizonItemId],
    references: [horizonItems.id]
  })
}));

// src/db/schema/fleet.ts
import { sqliteTable as sqliteTable2, text as text2, integer as integer2 } from "drizzle-orm/sqlite-core";
import { relations as relations2 } from "drizzle-orm";
import { createId as createId2 } from "@paralleldrive/cuid2";
var rufloSessions = sqliteTable2("ruflo_sessions", {
  id: text2("id").primaryKey().$defaultFn(() => createId2()),
  repo: text2("repo").notNull(),
  linearTicketId: text2("linear_ticket_id").notNull(),
  ticketTitle: text2("ticket_title").notNull(),
  currentWorkstream: text2("current_workstream").notNull().default("Main"),
  progressPercent: integer2("progress_percent").notNull().default(0),
  elapsedMinutes: integer2("elapsed_minutes").notNull().default(0),
  estimatedRemainingMinutes: integer2("estimated_remaining_minutes").notNull().default(30),
  status: text2("status", { enum: sessionStatusValues }).notNull().default("ACTIVE"),
  inFlightFiles: text2("in_flight_files", { mode: "json" }).$type().default([]),
  prUrl: text2("pr_url"),
  // External orchestrator tracking
  externalSessionId: text2("external_session_id"),
  orchestratorMode: text2("orchestrator_mode", { enum: orchestratorModeValues }),
  tokensUsed: integer2("tokens_used"),
  costUsd: integer2("cost_usd"),
  /**
   * What the agent is doing right now, as reported by the session runner.
   *
   * The fleet used to know only that a session existed and a percentage that
   * was a timer in disguise. This carries the live picture — tool calls, files
   * touched, cost so far, idle time — so the cockpit can show an instrument
   * instead of a placebo. JSON because the shape belongs to the runner and the
   * cockpit only renders it.
   */
  telemetry: text2("telemetry", { mode: "json" }).$type(),
  createdAt: integer2("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => /* @__PURE__ */ new Date()),
  updatedAt: integer2("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => /* @__PURE__ */ new Date())
});
var rufloSessionsRelations = relations2(rufloSessions, ({ many }) => ({
  completedTasks: many(completedTasks)
}));
var completedTasks = sqliteTable2("completed_tasks", {
  id: text2("id").primaryKey().$defaultFn(() => createId2()),
  sessionId: text2("session_id").notNull(),
  label: text2("label").notNull(),
  model: text2("model", { enum: modelValues }),
  durationMinutes: integer2("duration_minutes"),
  completedAt: integer2("completed_at", { mode: "timestamp" }).notNull().$defaultFn(() => /* @__PURE__ */ new Date())
});
var completedTasksRelations = relations2(completedTasks, ({ one }) => ({
  session: one(rufloSessions, {
    fields: [completedTasks.sessionId],
    references: [rufloSessions.id]
  })
}));

// src/db/schema/score.ts
import { sqliteTable as sqliteTable3, text as text3, integer as integer3 } from "drizzle-orm/sqlite-core";
import { relations as relations3 } from "drizzle-orm";
import { createId as createId3 } from "@paralleldrive/cuid2";
var conductorScores = sqliteTable3("conductor_scores", {
  id: text3("id").primaryKey().$defaultFn(() => createId3()),
  userId: text3("user_id").notNull().unique(),
  total: integer3("total").notNull().default(500),
  fleetUtilization: integer3("fleet_utilization").notNull().default(100),
  runwayHealth: integer3("runway_health").notNull().default(100),
  planAccuracy: integer3("plan_accuracy").notNull().default(100),
  costEfficiency: integer3("cost_efficiency").notNull().default(100),
  velocityTrend: integer3("velocity_trend").notNull().default(100),
  leaderboardRank: integer3("leaderboard_rank"),
  createdAt: integer3("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => /* @__PURE__ */ new Date()),
  updatedAt: integer3("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => /* @__PURE__ */ new Date())
});
var conductorScoresRelations = relations3(conductorScores, ({ many }) => ({
  history: many(scoreHistory)
}));
var scoreHistory = sqliteTable3("score_history", {
  id: text3("id").primaryKey().$defaultFn(() => createId3()),
  scoreId: text3("score_id").notNull(),
  total: integer3("total").notNull(),
  fleetUtilization: integer3("fleet_utilization").notNull(),
  runwayHealth: integer3("runway_health").notNull(),
  planAccuracy: integer3("plan_accuracy").notNull(),
  costEfficiency: integer3("cost_efficiency").notNull(),
  velocityTrend: integer3("velocity_trend").notNull(),
  recordedAt: integer3("recorded_at", { mode: "timestamp" }).notNull().$defaultFn(() => /* @__PURE__ */ new Date())
});
var scoreHistoryRelations = relations3(scoreHistory, ({ one }) => ({
  score: one(conductorScores, {
    fields: [scoreHistory.scoreId],
    references: [conductorScores.id]
  })
}));

// src/db/schema/events.ts
import { sqliteTable as sqliteTable4, text as text4, integer as integer4 } from "drizzle-orm/sqlite-core";
import { createId as createId4 } from "@paralleldrive/cuid2";
var activityEvents = sqliteTable4("activity_events", {
  id: text4("id").primaryKey().$defaultFn(() => createId4()),
  type: text4("type", { enum: eventTypeValues }).notNull(),
  message: text4("message").notNull(),
  repo: text4("repo"),
  ticketId: text4("ticket_id"),
  metadata: text4("metadata", { mode: "json" }).$type(),
  createdAt: integer4("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => /* @__PURE__ */ new Date())
});

// src/db/schema/wave-planner.ts
import { sqliteTable as sqliteTable5, text as text5, integer as integer5, real as real2 } from "drizzle-orm/sqlite-core";
import { relations as relations4 } from "drizzle-orm";
import { createId as createId5 } from "@paralleldrive/cuid2";
var wavePlans = sqliteTable5("wave_plans", {
  id: text5("id").primaryKey().$defaultFn(() => createId5()),
  planId: text5("plan_id").notNull(),
  horizonItemId: text5("horizon_item_id").notNull(),
  totalWaves: integer5("total_waves").notNull(),
  totalTasks: integer5("total_tasks").notNull(),
  maxParallelism: integer5("max_parallelism").notNull(),
  criticalPath: text5("critical_path", { mode: "json" }).$type().notNull(),
  criticalPathLength: integer5("critical_path_length").notNull(),
  parallelizationScore: real2("parallelization_score").notNull(),
  status: text5("status", { enum: wavePlanStatusValues }).notNull().default("draft"),
  currentWaveIndex: integer5("current_wave_index").notNull().default(0),
  version: integer5("version").notNull().default(1),
  previousWavePlanId: text5("previous_wave_plan_id"),
  rawMarkdown: text5("raw_markdown"),
  startedAt: integer5("started_at", { mode: "timestamp" }),
  completedAt: integer5("completed_at", { mode: "timestamp" }),
  createdAt: integer5("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => /* @__PURE__ */ new Date()),
  updatedAt: integer5("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => /* @__PURE__ */ new Date())
});
var wavePlansRelations = relations4(wavePlans, ({ one, many }) => ({
  plan: one(plans, {
    fields: [wavePlans.planId],
    references: [plans.id]
  }),
  horizonItem: one(horizonItems, {
    fields: [wavePlans.horizonItemId],
    references: [horizonItems.id]
  }),
  previousWavePlan: one(wavePlans, {
    fields: [wavePlans.previousWavePlanId],
    references: [wavePlans.id],
    relationName: "wavePlanHistory"
  }),
  waves: many(waves),
  waveTasks: many(waveTasks),
  dependencyEdges: many(dependencyEdges),
  metrics: one(wavePlanMetrics, {
    fields: [wavePlans.id],
    references: [wavePlanMetrics.wavePlanId]
  })
}));
var waves = sqliteTable5("waves", {
  id: text5("id").primaryKey().$defaultFn(() => createId5()),
  wavePlanId: text5("wave_plan_id").notNull(),
  waveIndex: integer5("wave_index").notNull(),
  label: text5("label").notNull(),
  maxParallelTasks: integer5("max_parallel_tasks").notNull(),
  status: text5("status", { enum: waveStatusValues }).notNull().default("pending"),
  startedAt: integer5("started_at", { mode: "timestamp" }),
  completedAt: integer5("completed_at", { mode: "timestamp" })
});
var wavesRelations = relations4(waves, ({ one, many }) => ({
  wavePlan: one(wavePlans, {
    fields: [waves.wavePlanId],
    references: [wavePlans.id]
  }),
  tasks: many(waveTasks)
}));
var waveTasks = sqliteTable5("wave_tasks", {
  id: text5("id").primaryKey().$defaultFn(() => createId5()),
  waveId: text5("wave_id").notNull(),
  wavePlanId: text5("wave_plan_id").notNull(),
  taskId: text5("task_id"),
  // FK to existing tasks table (nullable)
  waveIndex: integer5("wave_index").notNull(),
  taskCode: text5("task_code").notNull(),
  // e.g., "1.1", "4.3"
  label: text5("label").notNull(),
  description: text5("description").notNull().default(""),
  filePaths: text5("file_paths", { mode: "json" }).$type().notNull().default([]),
  dependencies: text5("dependencies", { mode: "json" }).$type().notNull().default([]),
  recommendedModel: text5("recommended_model", { enum: modelValues }),
  complexity: text5("complexity", { enum: complexityValues }),
  isOnCriticalPath: integer5("is_on_critical_path", { mode: "boolean" }).notNull().default(false),
  canRunInParallel: integer5("can_run_in_parallel", { mode: "boolean" }).notNull().default(true),
  status: text5("status", { enum: waveTaskStatusValues }).notNull().default("pending"),
  assignedSessionId: text5("assigned_session_id"),
  startedAt: integer5("started_at", { mode: "timestamp" }),
  completedAt: integer5("completed_at", { mode: "timestamp" }),
  errorMessage: text5("error_message"),
  completionSummary: text5("completion_summary"),
  retryCount: integer5("retry_count").notNull().default(0)
});
var waveTasksRelations = relations4(waveTasks, ({ one }) => ({
  wave: one(waves, {
    fields: [waveTasks.waveId],
    references: [waves.id]
  }),
  wavePlan: one(wavePlans, {
    fields: [waveTasks.wavePlanId],
    references: [wavePlans.id]
  }),
  task: one(tasks, {
    fields: [waveTasks.taskId],
    references: [tasks.id]
  })
}));
var dependencyEdges = sqliteTable5("dependency_edges", {
  id: text5("id").primaryKey().$defaultFn(() => createId5()),
  wavePlanId: text5("wave_plan_id").notNull(),
  fromTaskCode: text5("from_task_code").notNull(),
  toTaskCode: text5("to_task_code").notNull(),
  edgeType: text5("edge_type", { enum: dependencyEdgeTypeValues }).notNull().default("hard")
});
var dependencyEdgesRelations = relations4(dependencyEdges, ({ one }) => ({
  wavePlan: one(wavePlans, {
    fields: [dependencyEdges.wavePlanId],
    references: [wavePlans.id]
  })
}));
var wavePlanMetrics = sqliteTable5("wave_plan_metrics", {
  id: text5("id").primaryKey().$defaultFn(() => createId5()),
  wavePlanId: text5("wave_plan_id").notNull().unique(),
  totalWallClockMs: integer5("total_wall_clock_ms"),
  theoreticalMinMs: integer5("theoretical_min_ms"),
  parallelizationEfficiency: real2("parallelization_efficiency"),
  wavesExecuted: integer5("waves_executed").notNull().default(0),
  tasksCompleted: integer5("tasks_completed").notNull().default(0),
  tasksFailed: integer5("tasks_failed").notNull().default(0),
  tasksRetried: integer5("tasks_retried").notNull().default(0),
  avgTaskDurationMs: integer5("avg_task_duration_ms"),
  maxWaveWaitMs: integer5("max_wave_wait_ms"),
  fileConflictsAvoided: integer5("file_conflicts_avoided").notNull().default(0),
  reOptimizationCount: integer5("re_optimization_count").notNull().default(0),
  recordedAt: integer5("recorded_at", { mode: "timestamp" }).notNull().$defaultFn(() => /* @__PURE__ */ new Date())
});
var wavePlanMetricsRelations = relations4(wavePlanMetrics, ({ one }) => ({
  wavePlan: one(wavePlans, {
    fields: [wavePlanMetrics.wavePlanId],
    references: [wavePlans.id]
  })
}));

// src/db/schema/wiki.ts
import { sqliteTable as sqliteTable6, text as text6, integer as integer6 } from "drizzle-orm/sqlite-core";
import { relations as relations5 } from "drizzle-orm";
import { createId as createId6 } from "@paralleldrive/cuid2";
var wikiSources = sqliteTable6("wiki_sources", {
  id: text6("id").primaryKey().$defaultFn(() => createId6()),
  /** Source type: session_log, commit, spec, decision, manual */
  sourceType: text6("source_type", { enum: wikiSourceTypeValues }).notNull(),
  /** Human-readable title */
  title: text6("title").notNull(),
  /** Raw content of the source material */
  content: text6("content").notNull(),
  /** Origin identifier (e.g. session ID, commit SHA, file path) */
  origin: text6("origin"),
  /** Repository this source belongs to */
  repo: text6("repo"),
  /** Hash of content for deduplication */
  contentHash: text6("content_hash").notNull(),
  createdAt: integer6("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => /* @__PURE__ */ new Date())
});
var wikiArticles = sqliteTable6("wiki_articles", {
  id: text6("id").primaryKey().$defaultFn(() => createId6()),
  /** URL-safe slug for the article (e.g. "authentication-flow") */
  slug: text6("slug").notNull().unique(),
  /** Article title */
  title: text6("title").notNull(),
  /** Category for organization (e.g. "architecture", "patterns", "decisions") */
  category: text6("category").notNull(),
  /** Compiled markdown content with backlinks */
  content: text6("content").notNull(),
  /** Status: active, stale, archived */
  status: text6("status", { enum: wikiArticleStatusValues }).notNull().default("active"),
  /** Backlinks — slugs of related articles */
  backlinks: text6("backlinks", { mode: "json" }).$type().default([]),
  /** Source IDs that contributed to this article */
  sourceIds: text6("source_ids", { mode: "json" }).$type().default([]),
  /** Repository this article belongs to */
  repo: text6("repo"),
  /** Version counter — incremented on each recompile */
  version: integer6("version").notNull().default(1),
  createdAt: integer6("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => /* @__PURE__ */ new Date()),
  updatedAt: integer6("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => /* @__PURE__ */ new Date())
});
var wikiLog = sqliteTable6("wiki_log", {
  id: text6("id").primaryKey().$defaultFn(() => createId6()),
  /** Action type: ingest, compile, query, lint, update */
  action: text6("action", { enum: wikiLogActionValues }).notNull(),
  /** Summary of what happened */
  summary: text6("summary").notNull(),
  /** IDs of articles affected */
  articleIds: text6("article_ids", { mode: "json" }).$type().default([]),
  /** IDs of sources involved */
  sourceIds: text6("source_ids", { mode: "json" }).$type().default([]),
  /** Repository context */
  repo: text6("repo"),
  /** Token usage for this operation */
  tokensUsed: integer6("tokens_used"),
  createdAt: integer6("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => /* @__PURE__ */ new Date())
});
var wikiSourcesRelations = relations5(wikiSources, ({ many }) => ({}));
var wikiArticlesRelations = relations5(wikiArticles, ({ many }) => ({}));
var wikiLogRelations = relations5(wikiLog, ({ many }) => ({}));

// src/db/schema/mempalace.ts
import { sqliteTable as sqliteTable7, text as text7, integer as integer7, index } from "drizzle-orm/sqlite-core";
import { relations as relations6 } from "drizzle-orm";
import { createId as createId7 } from "@paralleldrive/cuid2";
var palaceWings = sqliteTable7("palace_wings", {
  id: text7("id").primaryKey().$defaultFn(() => createId7()),
  /** Wing slug, e.g. "devpilot-core" or "persona-architect" */
  slug: text7("slug").notNull().unique(),
  /** Human-readable wing name */
  name: text7("name").notNull(),
  /** Wing type: project | persona | scratch */
  wingType: text7("wing_type").notNull().default("project"),
  /** Repository this wing is bound to, if any */
  repo: text7("repo"),
  /** Free-form description */
  description: text7("description"),
  createdAt: integer7("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => /* @__PURE__ */ new Date()),
  updatedAt: integer7("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => /* @__PURE__ */ new Date())
});
var palaceRooms = sqliteTable7(
  "palace_rooms",
  {
    id: text7("id").primaryKey().$defaultFn(() => createId7()),
    wingId: text7("wing_id").notNull().references(() => palaceWings.id, { onDelete: "cascade" }),
    /** Room slug, unique within a wing, e.g. "auth-flow" */
    slug: text7("slug").notNull(),
    /** Human-readable room name */
    name: text7("name").notNull(),
    /** Topic label for routing retrieval */
    topic: text7("topic").notNull(),
    /** Free-form description of what belongs in this room */
    description: text7("description"),
    createdAt: integer7("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => /* @__PURE__ */ new Date()),
    updatedAt: integer7("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => /* @__PURE__ */ new Date())
  },
  (table) => ({
    wingSlugIdx: index("palace_rooms_wing_slug_idx").on(table.wingId, table.slug)
  })
);
var palaceDrawers = sqliteTable7(
  "palace_drawers",
  {
    id: text7("id").primaryKey().$defaultFn(() => createId7()),
    roomId: text7("room_id").notNull().references(() => palaceRooms.id, { onDelete: "cascade" }),
    /** Memory type: fact | event | discovery | preference | advice | decision */
    memoryType: text7("memory_type").notNull().default("fact"),
    /** Short label for the drawer */
    label: text7("label").notNull(),
    /** Verbatim content — never summarized */
    content: text7("content").notNull(),
    /** Optional AAAK-compressed form (populated when the MCP server is used) */
    aaakContent: text7("aaak_content"),
    /** SHA256 of content for deduplication */
    contentHash: text7("content_hash").notNull(),
    /** Source provenance — e.g. wiki article slug, session id, commit sha */
    sourceKind: text7("source_kind"),
    sourceRef: text7("source_ref"),
    /** Free-form tags for filtering */
    tags: text7("tags", { mode: "json" }).$type().default([]),
    /** Rough salience score 0-1 controlling L0/L1 eligibility */
    salience: integer7("salience").notNull().default(0),
    createdAt: integer7("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => /* @__PURE__ */ new Date())
  },
  (table) => ({
    hashIdx: index("palace_drawers_hash_idx").on(table.contentHash),
    roomIdx: index("palace_drawers_room_idx").on(table.roomId)
  })
);
var palaceClosets = sqliteTable7(
  "palace_closets",
  {
    id: text7("id").primaryKey().$defaultFn(() => createId7()),
    roomId: text7("room_id").notNull().references(() => palaceRooms.id, { onDelete: "cascade" }),
    /** Compressed summary (AAAK-dialect or plain) */
    summary: text7("summary").notNull(),
    /** Which drawers this closet summarizes */
    drawerIds: text7("drawer_ids", { mode: "json" }).$type().default([]),
    /** Tier — 0 (identity), 1 (critical), 2 (room), 3 (deep) */
    tier: integer7("tier").notNull().default(2),
    /** Approximate token cost when injected */
    tokenCost: integer7("token_cost").notNull().default(0),
    createdAt: integer7("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => /* @__PURE__ */ new Date()),
    updatedAt: integer7("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => /* @__PURE__ */ new Date())
  },
  (table) => ({
    tierIdx: index("palace_closets_tier_idx").on(table.tier)
  })
);
var palaceHalls = sqliteTable7("palace_halls", {
  id: text7("id").primaryKey().$defaultFn(() => createId7()),
  wingId: text7("wing_id").notNull().references(() => palaceWings.id, { onDelete: "cascade" }),
  fromRoomId: text7("from_room_id").notNull().references(() => palaceRooms.id, { onDelete: "cascade" }),
  toRoomId: text7("to_room_id").notNull().references(() => palaceRooms.id, { onDelete: "cascade" }),
  /** Relationship type: depends_on | related_to | supersedes | contradicts */
  relation: text7("relation").notNull().default("related_to"),
  weight: integer7("weight").notNull().default(1),
  createdAt: integer7("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => /* @__PURE__ */ new Date())
});
var palaceTunnels = sqliteTable7("palace_tunnels", {
  id: text7("id").primaryKey().$defaultFn(() => createId7()),
  fromRoomId: text7("from_room_id").notNull().references(() => palaceRooms.id, { onDelete: "cascade" }),
  toRoomId: text7("to_room_id").notNull().references(() => palaceRooms.id, { onDelete: "cascade" }),
  reason: text7("reason"),
  createdAt: integer7("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => /* @__PURE__ */ new Date())
});
var palaceKgTriples = sqliteTable7(
  "palace_kg_triples",
  {
    id: text7("id").primaryKey().$defaultFn(() => createId7()),
    wingId: text7("wing_id").notNull().references(() => palaceWings.id, { onDelete: "cascade" }),
    subject: text7("subject").notNull(),
    predicate: text7("predicate").notNull(),
    object: text7("object").notNull(),
    /** Validity window start — when this fact became true */
    validFrom: integer7("valid_from", { mode: "timestamp" }).notNull().$defaultFn(() => /* @__PURE__ */ new Date()),
    /** Validity window end — null if still valid */
    validUntil: integer7("valid_until", { mode: "timestamp" }),
    /** Source drawer that asserted this fact */
    sourceDrawerId: text7("source_drawer_id"),
    /** Confidence 0-100 */
    confidence: integer7("confidence").notNull().default(100),
    createdAt: integer7("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => /* @__PURE__ */ new Date())
  },
  (table) => ({
    spIdx: index("palace_kg_sp_idx").on(table.subject, table.predicate),
    wingIdx: index("palace_kg_wing_idx").on(table.wingId)
  })
);
var palaceDiary = sqliteTable7("palace_diary", {
  id: text7("id").primaryKey().$defaultFn(() => createId7()),
  wingId: text7("wing_id").notNull().references(() => palaceWings.id, { onDelete: "cascade" }),
  agentId: text7("agent_id").notNull(),
  entry: text7("entry").notNull(),
  createdAt: integer7("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => /* @__PURE__ */ new Date())
});
var palaceWingsRelations = relations6(palaceWings, ({ many }) => ({
  rooms: many(palaceRooms),
  halls: many(palaceHalls),
  kgTriples: many(palaceKgTriples)
}));
var palaceRoomsRelations = relations6(palaceRooms, ({ one, many }) => ({
  wing: one(palaceWings, {
    fields: [palaceRooms.wingId],
    references: [palaceWings.id]
  }),
  drawers: many(palaceDrawers),
  closets: many(palaceClosets)
}));
var palaceDrawersRelations = relations6(palaceDrawers, ({ one }) => ({
  room: one(palaceRooms, {
    fields: [palaceDrawers.roomId],
    references: [palaceRooms.id]
  })
}));
var palaceClosetsRelations = relations6(palaceClosets, ({ one }) => ({
  room: one(palaceRooms, {
    fields: [palaceClosets.roomId],
    references: [palaceRooms.id]
  })
}));

// src/db/adapters/sqlite.ts
import { existsSync, mkdirSync } from "fs";
import { dirname } from "path";
var sqliteDb = null;
var sqliteConnection = null;
function ensureColumn(connection, table, column, ddl) {
  const cols = connection.prepare(`PRAGMA table_info(${table})`).all();
  if (!cols.some((c) => c.name === column)) {
    connection.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
  }
}
var createTableStatements = `
-- Horizon Items
CREATE TABLE IF NOT EXISTS horizon_items (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  zone TEXT NOT NULL CHECK(zone IN ('READY', 'REFINING', 'SHAPING', 'DIRECTIONAL')),
  repo TEXT NOT NULL,
  complexity TEXT CHECK(complexity IN ('S', 'M', 'L', 'XL')),
  priority INTEGER NOT NULL DEFAULT 0,
  linear_ticket_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Plans
CREATE TABLE IF NOT EXISTS plans (
  id TEXT PRIMARY KEY,
  horizon_item_id TEXT NOT NULL UNIQUE REFERENCES horizon_items(id) ON DELETE CASCADE,
  version INTEGER NOT NULL DEFAULT 1,
  estimated_cost_usd REAL NOT NULL,
  baseline_cost_usd REAL NOT NULL,
  acceptance_criteria TEXT NOT NULL,
  confidence_signals TEXT NOT NULL,
  fleet_context_snapshot TEXT NOT NULL,
  memory_sessions_used TEXT DEFAULT '[]',
  previous_plan_id TEXT,
  generated_at INTEGER NOT NULL
);

-- Workstreams
CREATE TABLE IF NOT EXISTS workstreams (
  id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  repo TEXT NOT NULL,
  worker_count INTEGER NOT NULL DEFAULT 1,
  order_index INTEGER NOT NULL DEFAULT 0
);

-- Tasks
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  plan_id TEXT REFERENCES plans(id) ON DELETE CASCADE,
  workstream_id TEXT REFERENCES workstreams(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  model TEXT NOT NULL CHECK(model IN ('HAIKU', 'SONNET', 'OPUS')),
  model_override TEXT CHECK(model_override IN ('HAIKU', 'SONNET', 'OPUS')),
  complexity TEXT NOT NULL CHECK(complexity IN ('S', 'M', 'L', 'XL')),
  estimated_cost_usd REAL NOT NULL,
  file_paths TEXT NOT NULL,
  conflict_warning TEXT,
  depends_on TEXT NOT NULL DEFAULT '[]',
  order_index INTEGER NOT NULL DEFAULT 0
);

-- Touched Files
CREATE TABLE IF NOT EXISTS touched_files (
  id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  path TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'AVAILABLE' CHECK(status IN ('AVAILABLE', 'IN_FLIGHT', 'RECENTLY_MODIFIED')),
  in_flight_via TEXT
);

-- Conflicting Files
CREATE TABLE IF NOT EXISTS conflicting_files (
  id TEXT PRIMARY KEY,
  horizon_item_id TEXT NOT NULL REFERENCES horizon_items(id) ON DELETE CASCADE,
  path TEXT NOT NULL,
  blocked_by_session_id TEXT,
  blocked_by_ticket_id TEXT,
  estimated_unlock_minutes INTEGER
);

-- Fleet Sessions
CREATE TABLE IF NOT EXISTS ruflo_sessions (
  id TEXT PRIMARY KEY,
  repo TEXT NOT NULL,
  linear_ticket_id TEXT NOT NULL,
  ticket_title TEXT NOT NULL,
  current_workstream TEXT NOT NULL DEFAULT 'Main',
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE', 'NEEDS_SPEC', 'COMPLETE', 'ERROR')),
  progress_percent INTEGER NOT NULL DEFAULT 0,
  elapsed_minutes INTEGER NOT NULL DEFAULT 0,
  estimated_remaining_minutes INTEGER NOT NULL DEFAULT 30,
  in_flight_files TEXT NOT NULL DEFAULT '[]',
  pr_url TEXT,
  external_session_id TEXT,
  orchestrator_mode TEXT CHECK(orchestrator_mode IN ('claude-session', 'http', 'ao-cli', 'manual', 'disabled')),
  tokens_used INTEGER,
  cost_usd INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Completed Tasks
CREATE TABLE IF NOT EXISTS completed_tasks (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES ruflo_sessions(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  model TEXT CHECK(model IN ('HAIKU', 'SONNET', 'OPUS')),
  duration_minutes INTEGER,
  completed_at INTEGER NOT NULL
);

-- In-Flight Files
CREATE TABLE IF NOT EXISTS in_flight_files (
  id TEXT PRIMARY KEY,
  path TEXT NOT NULL,
  active_session_id TEXT NOT NULL,
  linear_ticket_id TEXT NOT NULL,
  horizon_item_id TEXT,
  estimated_minutes_remaining INTEGER NOT NULL DEFAULT 30,
  locked_at INTEGER NOT NULL
);

-- Conductor Scores
CREATE TABLE IF NOT EXISTS conductor_scores (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  total INTEGER NOT NULL DEFAULT 500,
  fleet_utilization INTEGER NOT NULL DEFAULT 100,
  runway_health INTEGER NOT NULL DEFAULT 100,
  plan_accuracy INTEGER NOT NULL DEFAULT 100,
  cost_efficiency INTEGER NOT NULL DEFAULT 100,
  velocity_trend INTEGER NOT NULL DEFAULT 100,
  leaderboard_rank INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Score History
CREATE TABLE IF NOT EXISTS score_history (
  id TEXT PRIMARY KEY,
  score_id TEXT NOT NULL REFERENCES conductor_scores(id) ON DELETE CASCADE,
  total INTEGER NOT NULL,
  fleet_utilization INTEGER NOT NULL,
  runway_health INTEGER NOT NULL,
  plan_accuracy INTEGER NOT NULL,
  cost_efficiency INTEGER NOT NULL,
  velocity_trend INTEGER NOT NULL,
  recorded_at INTEGER NOT NULL
);

-- Activity Events
CREATE TABLE IF NOT EXISTS activity_events (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK(type IN ('SESSION_PROGRESS', 'SESSION_COMPLETE', 'PLAN_GENERATED', 'PLAN_APPROVED', 'ITEM_CREATED', 'ITEM_DISPATCHED', 'RUNWAY_UPDATE', 'FILE_UNLOCKED', 'SCORE_UPDATE', 'WAVE_PLAN_CREATED', 'WAVE_DISPATCHING', 'WAVE_TASK_DISPATCHED', 'WAVE_TASK_COMPLETE', 'WAVE_TASK_FAILED', 'WAVE_COMPLETE', 'WAVE_ADVANCE', 'WAVE_PLAN_COMPLETE', 'WAVE_PLAN_FAILED', 'WAVE_PLAN_REOPTIMIZING')),
  message TEXT NOT NULL,
  repo TEXT,
  ticket_id TEXT,
  metadata TEXT,
  created_at INTEGER NOT NULL
);

-- Wave Plans
CREATE TABLE IF NOT EXISTS wave_plans (
  id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  horizon_item_id TEXT NOT NULL REFERENCES horizon_items(id) ON DELETE CASCADE,
  total_waves INTEGER NOT NULL,
  total_tasks INTEGER NOT NULL,
  max_parallelism INTEGER NOT NULL,
  critical_path TEXT NOT NULL,
  critical_path_length INTEGER NOT NULL,
  parallelization_score REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft', 'approved', 'executing', 'paused', 'completed', 'failed', 're-optimizing')),
  current_wave_index INTEGER NOT NULL DEFAULT 0,
  version INTEGER NOT NULL DEFAULT 1,
  previous_wave_plan_id TEXT REFERENCES wave_plans(id),
  raw_markdown TEXT,
  started_at INTEGER,
  completed_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Waves
CREATE TABLE IF NOT EXISTS waves (
  id TEXT PRIMARY KEY,
  wave_plan_id TEXT NOT NULL REFERENCES wave_plans(id) ON DELETE CASCADE,
  wave_index INTEGER NOT NULL,
  label TEXT NOT NULL,
  max_parallel_tasks INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'dispatching', 'active', 'completed', 'failed', 'skipped')),
  started_at INTEGER,
  completed_at INTEGER
);

-- Wave Tasks
CREATE TABLE IF NOT EXISTS wave_tasks (
  id TEXT PRIMARY KEY,
  wave_id TEXT NOT NULL REFERENCES waves(id) ON DELETE CASCADE,
  wave_plan_id TEXT NOT NULL REFERENCES wave_plans(id) ON DELETE CASCADE,
  task_id TEXT REFERENCES tasks(id),
  wave_index INTEGER NOT NULL,
  task_code TEXT NOT NULL,
  label TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  file_paths TEXT NOT NULL DEFAULT '[]',
  dependencies TEXT NOT NULL DEFAULT '[]',
  recommended_model TEXT CHECK(recommended_model IN ('HAIKU', 'SONNET', 'OPUS')),
  complexity TEXT CHECK(complexity IN ('S', 'M', 'L', 'XL')),
  is_on_critical_path INTEGER NOT NULL DEFAULT 0,
  can_run_in_parallel INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'dispatched', 'running', 'completed', 'failed', 'retrying', 'skipped')),
  assigned_session_id TEXT,
  started_at INTEGER,
  completed_at INTEGER,
  error_message TEXT,
  completion_summary TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0
);

-- Dependency Edges
CREATE TABLE IF NOT EXISTS dependency_edges (
  id TEXT PRIMARY KEY,
  wave_plan_id TEXT NOT NULL REFERENCES wave_plans(id) ON DELETE CASCADE,
  from_task_code TEXT NOT NULL,
  to_task_code TEXT NOT NULL,
  edge_type TEXT NOT NULL DEFAULT 'hard' CHECK(edge_type IN ('hard', 'soft'))
);

-- Wave Plan Metrics
CREATE TABLE IF NOT EXISTS wave_plan_metrics (
  id TEXT PRIMARY KEY,
  wave_plan_id TEXT NOT NULL UNIQUE REFERENCES wave_plans(id) ON DELETE CASCADE,
  total_wall_clock_ms INTEGER,
  theoretical_min_ms INTEGER,
  parallelization_efficiency REAL,
  waves_executed INTEGER NOT NULL DEFAULT 0,
  tasks_completed INTEGER NOT NULL DEFAULT 0,
  tasks_failed INTEGER NOT NULL DEFAULT 0,
  tasks_retried INTEGER NOT NULL DEFAULT 0,
  avg_task_duration_ms INTEGER,
  max_wave_wait_ms INTEGER,
  file_conflicts_avoided INTEGER NOT NULL DEFAULT 0,
  re_optimization_count INTEGER NOT NULL DEFAULT 0,
  recorded_at INTEGER NOT NULL
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_horizon_items_zone ON horizon_items(zone);
CREATE INDEX IF NOT EXISTS idx_horizon_items_repo ON horizon_items(repo);
CREATE INDEX IF NOT EXISTS idx_ruflo_sessions_status ON ruflo_sessions(status);
CREATE INDEX IF NOT EXISTS idx_ruflo_sessions_repo ON ruflo_sessions(repo);
CREATE INDEX IF NOT EXISTS idx_activity_events_type ON activity_events(type);
CREATE INDEX IF NOT EXISTS idx_activity_events_created_at ON activity_events(created_at);
CREATE INDEX IF NOT EXISTS idx_wave_plans_plan_id ON wave_plans(plan_id);
CREATE INDEX IF NOT EXISTS idx_wave_plans_horizon_item_id ON wave_plans(horizon_item_id);
CREATE INDEX IF NOT EXISTS idx_wave_plans_status ON wave_plans(status);
CREATE INDEX IF NOT EXISTS idx_waves_wave_plan_id ON waves(wave_plan_id);
CREATE INDEX IF NOT EXISTS idx_waves_status ON waves(status);
CREATE INDEX IF NOT EXISTS idx_wave_tasks_wave_id ON wave_tasks(wave_id);
CREATE INDEX IF NOT EXISTS idx_wave_tasks_wave_plan_id ON wave_tasks(wave_plan_id);
CREATE INDEX IF NOT EXISTS idx_wave_tasks_status ON wave_tasks(status);
CREATE INDEX IF NOT EXISTS idx_wave_tasks_task_code ON wave_tasks(task_code);
CREATE INDEX IF NOT EXISTS idx_dependency_edges_wave_plan_id ON dependency_edges(wave_plan_id);
`;
function createSQLiteAdapter(path) {
  if (sqliteDb) {
    return sqliteDb;
  }
  const dir = dirname(path);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  sqliteConnection = new Database(path);
  sqliteConnection.pragma("busy_timeout = 5000");
  sqliteConnection.pragma("journal_mode = WAL");
  sqliteConnection.exec(createTableStatements);
  ensureColumn(sqliteConnection, "wave_tasks", "completion_summary", "completion_summary TEXT");
  ensureColumn(sqliteConnection, "ruflo_sessions", "external_session_id", "external_session_id TEXT");
  ensureColumn(
    sqliteConnection,
    "ruflo_sessions",
    "orchestrator_mode",
    "orchestrator_mode TEXT CHECK(orchestrator_mode IN ('claude-session', 'http', 'ao-cli', 'manual', 'disabled'))"
  );
  ensureColumn(sqliteConnection, "ruflo_sessions", "tokens_used", "tokens_used INTEGER");
  ensureColumn(sqliteConnection, "ruflo_sessions", "cost_usd", "cost_usd INTEGER");
  sqliteDb = drizzle(sqliteConnection, { schema: schema_exports });
  return sqliteDb;
}

// src/db/adapters/postgres.ts
import { drizzle as drizzle2 } from "drizzle-orm/postgres-js";
import postgres from "postgres";
var pgDb = null;
var pgConnection = null;
function createPostgresAdapter(connectionString) {
  if (pgDb) {
    return pgDb;
  }
  pgConnection = postgres(connectionString, {
    max: 10,
    // Connection pool size
    idle_timeout: 20,
    connect_timeout: 10
  });
  pgDb = drizzle2(pgConnection, { schema: schema_exports });
  return pgDb;
}

// src/db/adapters/index.ts
function createDatabase(config) {
  switch (config.type) {
    case "sqlite":
      if (!config.sqlitePath) {
        throw new Error("SQLite path is required for SQLite database");
      }
      return createSQLiteAdapter(config.sqlitePath);
    case "postgres":
      if (!config.postgresUrl) {
        throw new Error("Postgres connection URL is required for Postgres database");
      }
      return createPostgresAdapter(config.postgresUrl);
    default:
      throw new Error(`Unsupported database type: ${config.type}`);
  }
}

// src/db/client.ts
var db = null;
function getDatabase() {
  if (!db) {
    const config = getDatabaseConfig();
    db = createDatabase(config);
  }
  return db;
}

// src/orchestrator/host-wiring.ts
function createDbStatusPollerCallbacks() {
  return {
    onStatusUpdate: async (sessionId, status) => {
      const db2 = getDatabase();
      await db2.update(rufloSessions).set({
        progressPercent: status.progressPercent,
        status: status.status === "running" ? "ACTIVE" : status.status === "complete" ? "COMPLETE" : status.status === "error" ? "ERROR" : "ACTIVE",
        updatedAt: /* @__PURE__ */ new Date()
      }).where(eq(rufloSessions.id, sessionId));
    },
    onComplete: async (sessionId, report) => {
      const db2 = getDatabase();
      await db2.update(rufloSessions).set({
        status: report.success ? "COMPLETE" : "ERROR",
        progressPercent: 100,
        prUrl: report.prUrl,
        tokensUsed: report.tokensUsed,
        costUsd: Math.round(report.costUsd * 100),
        // store as cents
        updatedAt: /* @__PURE__ */ new Date()
      }).where(eq(rufloSessions.id, sessionId));
      await db2.insert(activityEvents).values({
        type: "SESSION_COMPLETE",
        message: report.success ? `Session completed: ${report.summary}` : `Session failed: ${report.error?.message || "Unknown error"}`,
        metadata: { sessionId, prUrl: report.prUrl }
      });
    },
    onError: async (sessionId, error) => {
      const db2 = getDatabase();
      await db2.update(rufloSessions).set({
        status: "ERROR",
        updatedAt: /* @__PURE__ */ new Date()
      }).where(eq(rufloSessions.id, sessionId));
      await db2.insert(activityEvents).values({
        type: "SESSION_COMPLETE",
        message: `Session error: ${error.message}`,
        metadata: { sessionId, error: error.message }
      });
    }
  };
}
export {
  AoCliAdapter,
  ClaudeSessionAdapter,
  HttpSessionTransport,
  OrchestratorClient,
  OrchestratorService,
  StatusPoller,
  buildDispatchRequest,
  buildSessionPrompt,
  createAoCliAdapter,
  createClaudeSessionAdapter,
  createDbStatusPollerCallbacks,
  getOrchestratorClient,
  getOrchestratorService,
  getOrchestratorServiceOrNull,
  getStatusPoller,
  getStatusPollerOrNull,
  initOrchestratorClient,
  initOrchestratorService,
  initStatusPoller,
  isOrchestratorConfigured,
  isOrchestratorServiceInitialized,
  isPushCapableAdapter,
  isStatusPollerInitialized
};
//# sourceMappingURL=index.mjs.map