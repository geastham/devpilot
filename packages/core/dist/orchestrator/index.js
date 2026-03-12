"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
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
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/orchestrator/index.ts
var orchestrator_exports = {};
__export(orchestrator_exports, {
  AoCliAdapter: () => AoCliAdapter,
  OrchestratorClient: () => OrchestratorClient,
  OrchestratorService: () => OrchestratorService,
  StatusPoller: () => StatusPoller,
  buildDispatchRequest: () => buildDispatchRequest,
  createAoCliAdapter: () => createAoCliAdapter,
  getOrchestratorClient: () => getOrchestratorClient,
  getOrchestratorService: () => getOrchestratorService,
  getOrchestratorServiceOrNull: () => getOrchestratorServiceOrNull,
  getStatusPoller: () => getStatusPoller,
  getStatusPollerOrNull: () => getStatusPollerOrNull,
  initOrchestratorClient: () => initOrchestratorClient,
  initOrchestratorService: () => initOrchestratorService,
  initStatusPoller: () => initStatusPoller,
  isOrchestratorConfigured: () => isOrchestratorConfigured,
  isOrchestratorServiceInitialized: () => isOrchestratorServiceInitialized,
  isStatusPollerInitialized: () => isStatusPollerInitialized
});
module.exports = __toCommonJS(orchestrator_exports);

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
var import_child_process = require("child_process");
var import_util = require("util");
var execAsync = (0, import_util.promisify)(import_child_process.exec);
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
  constructor(config) {
    this.sessionMappings = /* @__PURE__ */ new Map();
    this.eventCallbacks = /* @__PURE__ */ new Set();
    this.config = config;
    this.adapter = this.createAdapter(config);
  }
  /**
   * Create the appropriate adapter based on mode
   */
  createAdapter(config) {
    switch (config.mode) {
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
var serviceInstance = null;
function initOrchestratorService(config) {
  if (serviceInstance) {
    serviceInstance.shutdown();
  }
  serviceInstance = new OrchestratorService(config);
  return serviceInstance;
}
function getOrchestratorService() {
  if (!serviceInstance) {
    throw new Error("Orchestrator service not initialized. Call initOrchestratorService first.");
  }
  return serviceInstance;
}
function isOrchestratorServiceInitialized() {
  return serviceInstance !== null;
}
function getOrchestratorServiceOrNull() {
  return serviceInstance;
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
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  AoCliAdapter,
  OrchestratorClient,
  OrchestratorService,
  StatusPoller,
  buildDispatchRequest,
  createAoCliAdapter,
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
  isStatusPollerInitialized
});
//# sourceMappingURL=index.js.map