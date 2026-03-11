/**
 * Linear integration type definitions
 */

export interface LinearConfig {
  apiKey: string;
  teamId: string;
  defaultProjectId?: string;
  webhookSecret?: string;
}

export interface LinearIssue {
  id: string;
  identifier: string;
  title: string;
  description?: string;
  state: {
    id: string;
    name: string;
    type: string;
  };
  priority: number;
  url: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateIssueInput {
  title: string;
  description?: string;
  teamId: string;
  projectId?: string;
  priority?: number;
  labels?: string[];
  parentId?: string;
}

export interface UpdateIssueInput {
  stateId?: string;
  title?: string;
  description?: string;
  priority?: number;
}

export interface LinearWebhookPayload {
  action: 'create' | 'update' | 'remove';
  type: 'Issue' | 'Comment' | 'Project' | 'Cycle';
  data: Record<string, unknown>;
  createdAt: string;
  url: string;
  organizationId: string;
  webhookId: string;
  webhookTimestamp: number;
}

export interface SyncResult {
  success: boolean;
  issueId?: string;
  error?: string;
}
