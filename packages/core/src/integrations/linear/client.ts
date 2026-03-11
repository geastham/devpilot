/**
 * Linear SDK wrapper client
 */

import { LinearClient } from '@linear/sdk';
import type {
  LinearConfig,
  LinearIssue,
  CreateIssueInput,
  UpdateIssueInput,
} from './types';

export class DevPilotLinearClient {
  private client: LinearClient;
  private teamId: string;
  private defaultProjectId?: string;

  constructor(config: LinearConfig) {
    this.client = new LinearClient({ apiKey: config.apiKey });
    this.teamId = config.teamId;
    this.defaultProjectId = config.defaultProjectId;
  }

  /**
   * Get the underlying Linear client for advanced operations
   */
  getClient(): LinearClient {
    return this.client;
  }

  /**
   * Create a new issue in Linear
   */
  async createIssue(input: CreateIssueInput): Promise<LinearIssue> {
    const result = await this.client.createIssue({
      teamId: input.teamId || this.teamId,
      title: input.title,
      description: input.description,
      projectId: input.projectId || this.defaultProjectId,
      priority: input.priority,
      parentId: input.parentId,
    });

    const issue = await result.issue;
    if (!issue) {
      throw new Error('Failed to create issue');
    }

    const state = await issue.state;

    return {
      id: issue.id,
      identifier: issue.identifier,
      title: issue.title,
      description: issue.description ?? undefined,
      state: {
        id: state?.id ?? '',
        name: state?.name ?? '',
        type: state?.type ?? '',
      },
      priority: issue.priority,
      url: issue.url,
      createdAt: issue.createdAt,
      updatedAt: issue.updatedAt,
    };
  }

  /**
   * Update an existing issue
   */
  async updateIssue(issueId: string, input: UpdateIssueInput): Promise<LinearIssue> {
    const result = await this.client.updateIssue(issueId, {
      stateId: input.stateId,
      title: input.title,
      description: input.description,
      priority: input.priority,
    });

    const issue = await result.issue;
    if (!issue) {
      throw new Error('Failed to update issue');
    }

    const state = await issue.state;

    return {
      id: issue.id,
      identifier: issue.identifier,
      title: issue.title,
      description: issue.description ?? undefined,
      state: {
        id: state?.id ?? '',
        name: state?.name ?? '',
        type: state?.type ?? '',
      },
      priority: issue.priority,
      url: issue.url,
      createdAt: issue.createdAt,
      updatedAt: issue.updatedAt,
    };
  }

  /**
   * Get an issue by ID
   */
  async getIssue(issueId: string): Promise<LinearIssue | null> {
    try {
      const issue = await this.client.issue(issueId);
      if (!issue) return null;

      const state = await issue.state;

      return {
        id: issue.id,
        identifier: issue.identifier,
        title: issue.title,
        description: issue.description ?? undefined,
        state: {
          id: state?.id ?? '',
          name: state?.name ?? '',
          type: state?.type ?? '',
        },
        priority: issue.priority,
        url: issue.url,
        createdAt: issue.createdAt,
        updatedAt: issue.updatedAt,
      };
    } catch {
      return null;
    }
  }

  /**
   * Get workflow states for a team
   */
  async getWorkflowStates(): Promise<{ id: string; name: string; type: string }[]> {
    const team = await this.client.team(this.teamId);
    const states = await team.states();

    return states.nodes.map((state) => ({
      id: state.id,
      name: state.name,
      type: state.type,
    }));
  }

  /**
   * Move issue to a specific state
   */
  async moveIssueToState(issueId: string, stateName: string): Promise<LinearIssue> {
    const states = await this.getWorkflowStates();
    const targetState = states.find(
      (s) => s.name.toLowerCase() === stateName.toLowerCase()
    );

    if (!targetState) {
      throw new Error(`State "${stateName}" not found`);
    }

    return this.updateIssue(issueId, { stateId: targetState.id });
  }

  /**
   * Add a comment to an issue
   */
  async addComment(issueId: string, body: string): Promise<void> {
    await this.client.createComment({
      issueId,
      body,
    });
  }

  /**
   * Get team info
   */
  async getTeam() {
    const team = await this.client.team(this.teamId);
    return {
      id: team.id,
      name: team.name,
      key: team.key,
    };
  }

  /**
   * Get all teams the user has access to
   */
  async getTeams(): Promise<{ id: string; name: string; key: string }[]> {
    const teamsResult = await this.client.teams();
    return teamsResult.nodes.map((team) => ({
      id: team.id,
      name: team.name,
      key: team.key,
    }));
  }
}

// Singleton instance management
let clientInstance: DevPilotLinearClient | null = null;

export function initLinearClient(config: LinearConfig): DevPilotLinearClient {
  clientInstance = new DevPilotLinearClient(config);
  return clientInstance;
}

export function getLinearClient(): DevPilotLinearClient {
  if (!clientInstance) {
    throw new Error('Linear client not initialized. Call initLinearClient first.');
  }
  return clientInstance;
}

export function isLinearConfigured(): boolean {
  return clientInstance !== null;
}
