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

// src/index.ts
var index_exports = {};
__export(index_exports, {
  BridgeClient: () => BridgeClient,
  HeartbeatService: () => HeartbeatService,
  PubSubSubscriber: () => PubSubSubscriber
});
module.exports = __toCommonJS(index_exports);

// src/client.ts
var BridgeClient = class {
  constructor(config) {
    this.orchestratorId = null;
    this.config = config;
    this.orchestratorId = config.orchestratorId || null;
  }
  async register(capabilities) {
    const response = await fetch(`${this.config.bridgeUrl}/api/orchestrators/register`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${this.config.apiKey}`
      },
      body: JSON.stringify(capabilities)
    });
    if (!response.ok) {
      throw new Error(`Registration failed: ${response.statusText}`);
    }
    const result = await response.json();
    this.orchestratorId = result.orchestratorId;
    return result;
  }
  async reportSessionStatus(sessionId, status) {
    await fetch(`${this.config.bridgeUrl}/api/sessions/${sessionId}/status`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${this.config.apiKey}`
      },
      body: JSON.stringify(status)
    });
  }
  async reportSessionComplete(sessionId, report) {
    await fetch(`${this.config.bridgeUrl}/api/sessions/${sessionId}/complete`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${this.config.apiKey}`
      },
      body: JSON.stringify(report)
    });
  }
  getOrchestatorId() {
    return this.orchestratorId;
  }
};

// src/pubsub.ts
var PubSubSubscriber = class {
  constructor(config) {
    this.isRunning = false;
    this.config = config;
  }
  async start() {
    const { PubSub } = await import("@google-cloud/pubsub");
    const pubsub = new PubSub({ projectId: this.config.projectId });
    const subscription = pubsub.subscription(this.config.subscriptionName);
    this.isRunning = true;
    subscription.on("message", async (message) => {
      try {
        const data = JSON.parse(message.data.toString());
        await this.config.onMessage(data);
        message.ack();
      } catch (error) {
        console.error("Error processing message:", error);
        message.nack();
      }
    });
    subscription.on("error", (error) => {
      console.error("Subscription error:", error);
    });
  }
  stop() {
    this.isRunning = false;
  }
};

// src/heartbeat.ts
var HeartbeatService = class {
  constructor(config) {
    this.intervalId = null;
    this.config = config;
  }
  start() {
    if (this.intervalId) return;
    this.intervalId = setInterval(async () => {
      try {
        await this.sendHeartbeat();
      } catch (error) {
        console.error("Heartbeat failed:", error);
      }
    }, this.config.intervalMs);
    this.sendHeartbeat().catch(console.error);
  }
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }
  async sendHeartbeat() {
    await fetch(
      `${this.config.bridgeUrl}/api/orchestrators/${this.config.orchestratorId}/heartbeat`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${this.config.apiKey}`
        }
      }
    );
  }
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  BridgeClient,
  HeartbeatService,
  PubSubSubscriber
});
//# sourceMappingURL=index.js.map