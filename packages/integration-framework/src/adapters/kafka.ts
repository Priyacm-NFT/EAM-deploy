import type { IntegrationAdapter, AdapterResult, TestResult } from './base.js';
import { isDryRun } from './base.js';

export interface KafkaConfig {
  brokers: string[];
  topic: string;
  clientId?: string;
  ssl?: boolean;
  dryRun?: boolean;
}

export class KafkaAdapter implements IntegrationAdapter {
  type = 'KAFKA' as const;

  async test(config: unknown): Promise<TestResult> {
    const c = config as KafkaConfig;
    if (!c.brokers?.length) return { success: false, message: 'brokers required' };
    if (!c.topic) return { success: false, message: 'topic required' };
    if (isDryRun(config)) return { success: true, message: 'dry run' };
    try {
      const { Kafka } = await import('kafkajs');
      const kafka = new Kafka({ clientId: c.clientId ?? 'eam-integration', brokers: c.brokers, ssl: c.ssl });
      const admin = kafka.admin();
      await admin.connect();
      await admin.fetchTopicMetadata({ topics: [c.topic] });
      await admin.disconnect();
      return { success: true };
    } catch (e) {
      return { success: false, message: e instanceof Error ? e.message : 'kafka connect failed' };
    }
  }

  async execute(config: unknown, payload: unknown): Promise<AdapterResult> {
    const c = config as KafkaConfig;
    if (!c.brokers?.length || !c.topic) {
      return { success: false, error: 'brokers and topic required' };
    }
    if (isDryRun(config)) return { success: true, data: { dryRun: true, topic: c.topic } };

    try {
      const { Kafka } = await import('kafkajs');
      const kafka = new Kafka({ clientId: c.clientId ?? 'eam-integration', brokers: c.brokers, ssl: c.ssl });
      const producer = kafka.producer();
      await producer.connect();
      const result = await producer.send({
        topic: c.topic,
        messages: [{ value: JSON.stringify(payload) }],
      });
      await producer.disconnect();
      return { success: true, data: result };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : 'kafka publish failed' };
    }
  }
}
