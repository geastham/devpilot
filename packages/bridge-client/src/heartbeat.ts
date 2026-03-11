export interface HeartbeatConfig {
  bridgeUrl: string;
  apiKey: string;
  orchestratorId: string;
  intervalMs: number;
}

export class HeartbeatService {
  private config: HeartbeatConfig;
  private intervalId: NodeJS.Timeout | null = null;

  constructor(config: HeartbeatConfig) {
    this.config = config;
  }

  start(): void {
    if (this.intervalId) return;

    this.intervalId = setInterval(async () => {
      try {
        await this.sendHeartbeat();
      } catch (error) {
        console.error('Heartbeat failed:', error);
      }
    }, this.config.intervalMs);

    // Send initial heartbeat
    this.sendHeartbeat().catch(console.error);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  private async sendHeartbeat(): Promise<void> {
    await fetch(
      `${this.config.bridgeUrl}/api/orchestrators/${this.config.orchestratorId}/heartbeat`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
        },
      }
    );
  }
}
