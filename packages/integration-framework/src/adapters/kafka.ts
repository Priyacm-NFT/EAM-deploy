import type { IntegrationAdapter, AdapterResult, TestResult } from './base.js';
import { isDryRun } from './base.js';

export interface KafkaConfig {
  brokers: string[];
  topic: string;
  clientId?: string;
  ssl?: boolean;
  dryRun?: boolean;
  // Dead-letter queue
  deadLetterTopic?: string;        // topic to send failed messages
  // Retry policy
  retryAttempts?: number;          // default: 3
  retryInitialDelayMs?: number;    // default: 1000
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

    const maxAttempts = c.retryAttempts ?? 3;
    const initDelay = c.retryInitialDelayMs ?? 1000;
    let lastError: string | undefined;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
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
        lastError = e instanceof Error ? e.message : 'kafka publish failed';
        if (attempt < maxAttempts - 1) {
          await new Promise((r) => setTimeout(r, initDelay * 2 ** attempt));
        }
      }
    }

    // Send to dead-letter queue if configured
    if (c.deadLetterTopic) {
      try {
        const { Kafka } = await import('kafkajs');
        const kafka = new Kafka({ clientId: c.clientId ?? 'eam-integration', brokers: c.brokers, ssl: c.ssl });
        const producer = kafka.producer();
        await producer.connect();
        await producer.send({
          topic: c.deadLetterTopic,
          messages: [{ value: JSON.stringify({ originalPayload: payload, error: lastError, timestamp: new Date().toISOString() }) }],
        });
        await producer.disconnect();
        console.warn(`[kafka] Sent to dead-letter topic: ${c.deadLetterTopic}`);
      } catch (dlqErr) {
        console.error('[kafka] Dead-letter publish failed:', dlqErr);
      }
    }

    return { success: false, error: lastError };
  }
}

