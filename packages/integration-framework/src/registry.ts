import type { IntegrationAdapter } from './adapters/base.js';
import { RestAdapter } from './adapters/rest.js';
import { WebhookOutboundAdapter } from './adapters/webhook.js';
import { SoapAdapter } from './adapters/soap.js';
import { KafkaAdapter } from './adapters/kafka.js';
import { RabbitMqAdapter } from './adapters/rabbitmq.js';
import { SftpAdapter } from './adapters/sftp.js';
import { JdbcAdapter } from './adapters/jdbc.js';

const factories: Record<string, () => IntegrationAdapter> = {
  REST: () => new RestAdapter(),
  WEBHOOK_OUTBOUND: () => new WebhookOutboundAdapter(),
  SOAP: () => new SoapAdapter(),
  KAFKA: () => new KafkaAdapter(),
  RABBITMQ: () => new RabbitMqAdapter(),
  SFTP: () => new SftpAdapter(),
  JDBC: () => new JdbcAdapter(),
};

export function getAdapter(type: string): IntegrationAdapter | null {
  const factory = factories[type];
  return factory ? factory() : null;
}

export function supportedAdapterTypes(): string[] {
  return Object.keys(factories);
}
