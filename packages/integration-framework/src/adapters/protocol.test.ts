import { describe, it, expect } from 'vitest';
import { SoapAdapter } from './soap.js';
import { KafkaAdapter } from './kafka.js';
import { RabbitMqAdapter } from './rabbitmq.js';
import { SftpAdapter } from './sftp.js';
import { JdbcAdapter } from './jdbc.js';
import { getAdapter, supportedAdapterTypes } from '../registry.js';

describe('protocol adapters', () => {
  it('registers all adapter types', () => {
    expect(supportedAdapterTypes()).toEqual(
      expect.arrayContaining(['REST', 'SOAP', 'KAFKA', 'RABBITMQ', 'SFTP', 'JDBC', 'WEBHOOK_OUTBOUND']),
    );
  });

  it('validates SOAP config', async () => {
    const adapter = new SoapAdapter();
    expect((await adapter.test({})).success).toBe(false);
    expect((await adapter.test({ endpoint: 'https://x', dryRun: true })).success).toBe(true);
  });

  it('validates Kafka config', async () => {
    const adapter = new KafkaAdapter();
    expect((await adapter.test({ brokers: [], topic: 't' })).success).toBe(false);
    expect(
      (await adapter.test({ brokers: ['localhost:9092'], topic: 'eam.events', dryRun: true })).success,
    ).toBe(true);
  });

  it('validates RabbitMQ config', async () => {
    const adapter = new RabbitMqAdapter();
    expect((await adapter.test({ url: 'amqp://localhost', exchange: 'eam', dryRun: true })).success).toBe(
      true,
    );
  });

  it('validates SFTP config', async () => {
    const adapter = new SftpAdapter();
    expect(
      (
        await adapter.test({
          host: 'sftp.example',
          username: 'eam',
          remotePath: '/outbound/data.json',
          dryRun: true,
        })
      ).success,
    ).toBe(true);
  });

  it('validates JDBC config', async () => {
    const adapter = new JdbcAdapter();
    expect((await adapter.test({ connectionString: 'postgres://u:p@localhost/db', dryRun: true })).success).toBe(
      true,
    );
  });

  it('resolves adapters from registry', () => {
    expect(getAdapter('SOAP')?.type).toBe('SOAP');
    expect(getAdapter('UNKNOWN')).toBeNull();
  });
});
