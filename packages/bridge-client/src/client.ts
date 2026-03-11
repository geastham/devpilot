export interface BridgeClientConfig {
  bridgeUrl: string;
  apiKey: string;
  orchestratorId?: string;
  gcpProjectId?: string;
}

export class BridgeClient {
  private config: BridgeClientConfig;
  private orchestratorId: string | null = null;

  constructor(config: BridgeClientConfig) {
    this.config = config;
    this.orchestratorId = config.orchestratorId || null;
  }

  async register(capabilities: {
    repos: string[];
    maxConcurrentJobs: number;
  }): Promise<{ orchestratorId: string }> {
    const response = await fetch(`${this.config.bridgeUrl}/api/orchestrators/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify(capabilities),
    });

    if (!response.ok) {
      throw new Error(`Registration failed: ${response.statusText}`);
    }

    const result = await response.json() as { orchestratorId: string };
    this.orchestratorId = result.orchestratorId;
    return result;
  }

  async reportSessionStatus(sessionId: string, status: {
    status: string;
    progressPercent: number;
    message?: string;
  }): Promise<void> {
    await fetch(`${this.config.bridgeUrl}/api/sessions/${sessionId}/status`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify(status),
    });
  }

  async reportSessionComplete(sessionId: string, report: {
    success: boolean;
    prUrl?: string;
    summary: string;
    tokensUsed: number;
    costUsd: number;
  }): Promise<void> {
    await fetch(`${this.config.bridgeUrl}/api/sessions/${sessionId}/complete`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify(report),
    });
  }

  getOrchestatorId(): string | null {
    return this.orchestratorId;
  }
}
