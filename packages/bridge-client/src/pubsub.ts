export interface TaskDispatchMessage {
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

export interface PubSubSubscriberConfig {
  projectId: string;
  subscriptionName: string;
  onMessage: (message: TaskDispatchMessage) => Promise<void>;
}

export class PubSubSubscriber {
  private config: PubSubSubscriberConfig;
  private isRunning = false;

  constructor(config: PubSubSubscriberConfig) {
    this.config = config;
  }

  async start(): Promise<void> {
    // Dynamic import to avoid requiring @google-cloud/pubsub when not using cloud features
    const { PubSub } = await import('@google-cloud/pubsub');
    const pubsub = new PubSub({ projectId: this.config.projectId });
    const subscription = pubsub.subscription(this.config.subscriptionName);

    this.isRunning = true;

    subscription.on('message', async (message) => {
      try {
        const data = JSON.parse(message.data.toString()) as TaskDispatchMessage;
        await this.config.onMessage(data);
        message.ack();
      } catch (error) {
        console.error('Error processing message:', error);
        message.nack();
      }
    });

    subscription.on('error', (error) => {
      console.error('Subscription error:', error);
    });
  }

  stop(): void {
    this.isRunning = false;
  }
}
