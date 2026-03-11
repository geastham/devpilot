interface BridgeClientConfig {
    bridgeUrl: string;
    apiKey: string;
    orchestratorId?: string;
    gcpProjectId?: string;
}
declare class BridgeClient {
    private config;
    private orchestratorId;
    constructor(config: BridgeClientConfig);
    register(capabilities: {
        repos: string[];
        maxConcurrentJobs: number;
    }): Promise<{
        orchestratorId: string;
    }>;
    reportSessionStatus(sessionId: string, status: {
        status: string;
        progressPercent: number;
        message?: string;
    }): Promise<void>;
    reportSessionComplete(sessionId: string, report: {
        success: boolean;
        prUrl?: string;
        summary: string;
        tokensUsed: number;
        costUsd: number;
    }): Promise<void>;
    getOrchestatorId(): string | null;
}

interface TaskDispatchMessage {
    linearIssueId: string;
    linearIdentifier: string;
    title: string;
    description?: string;
    teamId: string;
    priority?: number;
    labels?: string[];
    repo: string;
    workspaceId: string;
}
interface PubSubSubscriberConfig {
    projectId: string;
    subscriptionName: string;
    onMessage: (message: TaskDispatchMessage) => Promise<void>;
}
declare class PubSubSubscriber {
    private config;
    private isRunning;
    constructor(config: PubSubSubscriberConfig);
    start(): Promise<void>;
    stop(): void;
}

interface HeartbeatConfig {
    bridgeUrl: string;
    apiKey: string;
    orchestratorId: string;
    intervalMs: number;
}
declare class HeartbeatService {
    private config;
    private intervalId;
    constructor(config: HeartbeatConfig);
    start(): void;
    stop(): void;
    private sendHeartbeat;
}

export { BridgeClient, type BridgeClientConfig, HeartbeatService, PubSubSubscriber, type TaskDispatchMessage };
