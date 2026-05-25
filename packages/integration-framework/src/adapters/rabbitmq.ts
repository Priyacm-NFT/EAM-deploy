import type { IntegrationAdapter, AdapterResult, TestResult } from './base.js';
import { isDryRun } from './base.js';

export interface RabbitMqConfig {
  url: string;
  exchange: string;
  routingKey?: string;
  dryRun?: boolean;
}

export class RabbitMqAdapter implements IntegrationAdapter {
  type = 'RABBITMQ' as const;

  async test(config: unknown): Promise<TestResult> {
    const c = config as RabbitMqConfig;
    if (!c.url) return { success: false, message: 'url required' };
    if (!c.exchange) return { success: false, message: 'exchange required' };
    if (isDryRun(config)) return { success: true, message: 'dry run' };
    try {
      const amqp = await import('amqplib');
      const conn = await amqp.connect(c.url);
      await conn.close();
      return { success: true };
    } catch (e) {
      return { success: false, message: e instanceof Error ? e.message : 'rabbitmq connect failed' };
    }
  }

  async execute(config: unknown, payload: unknown): Promise<AdapterResult> {
    const c = config as RabbitMqConfig;
    if (!c.url || !c.exchange) {
      return { success: false, error: 'url and exchange required' };
    }
    if (isDryRun(config)) return { success: true, data: { dryRun: true, exchange: c.exchange } };

    try {
      const amqp = await import('amqplib');
      const conn = await amqp.connect(c.url);
      const channel = await conn.createChannel();
      const body = Buffer.from(JSON.stringify(payload));
      channel.publish(c.exchange, c.routingKey ?? '', body, { contentType: 'application/json' });
      await channel.close();
      await conn.close();
      return { success: true };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : 'rabbitmq publish failed' };
    }
  }
}
