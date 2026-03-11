import { PubSub, Topic } from '@google-cloud/pubsub';
import { TaskDispatchMessage, TelemetryEvent } from './types';

export interface PubSubConfig {
  projectId: string;
  dispatchTopicName: string;
  telemetryTopicName: string;
}

export class PubSubService {
  private pubsub: PubSub;
  private dispatchTopic: Topic;
  private telemetryTopic: Topic;
  private config: PubSubConfig;

  constructor(config: PubSubConfig) {
    this.config = config;
    this.pubsub = new PubSub({ projectId: config.projectId });
    this.dispatchTopic = this.pubsub.topic(config.dispatchTopicName);
    this.telemetryTopic = this.pubsub.topic(config.telemetryTopicName);
  }

  async publishTaskDispatch(message: TaskDispatchMessage): Promise<string> {
    const data = Buffer.from(JSON.stringify(message));
    const messageId = await this.dispatchTopic.publishMessage({
      data,
      attributes: {
        type: 'task_dispatch',
        workspaceId: message.workspaceId,
        repo: message.repo,
      },
    });
    return messageId;
  }

  async publishTelemetry(event: TelemetryEvent): Promise<string> {
    const data = Buffer.from(JSON.stringify(event));
    const messageId = await this.telemetryTopic.publishMessage({
      data,
      attributes: {
        type: event.eventType,
        workspaceId: event.workspaceId || '',
      },
    });
    return messageId;
  }

  async ensureTopicsExist(): Promise<void> {
    const [dispatchExists] = await this.dispatchTopic.exists();
    if (!dispatchExists) {
      await this.pubsub.createTopic(this.config.dispatchTopicName);
    }

    const [telemetryExists] = await this.telemetryTopic.exists();
    if (!telemetryExists) {
      await this.pubsub.createTopic(this.config.telemetryTopicName);
    }
  }
}

// Singleton instance
let pubsubService: PubSubService | null = null;

export function initPubSubService(config: PubSubConfig): PubSubService {
  pubsubService = new PubSubService(config);
  return pubsubService;
}

export function getPubSubService(): PubSubService {
  if (!pubsubService) {
    throw new Error('PubSub service not initialized');
  }
  return pubsubService;
}
