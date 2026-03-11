export interface TaskDispatchMessage {
  messageId: string;
  workspaceId: string;
  linearIssueId: string;
  linearIdentifier: string;
  title: string;
  description?: string;
  repo: string;
  teamId: string;
  priority?: number;
  labels?: string[];
  targetOrchestratorId?: string;
  dispatchedAt: string;
}

export interface TelemetryEvent {
  eventType: string;
  sessionId?: string;
  workspaceId?: string;
  orchestratorId?: string;
  data: Record<string, unknown>;
  timestamp: string;
}
