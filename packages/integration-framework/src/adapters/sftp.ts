import { writeFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { IntegrationAdapter, AdapterResult, TestResult } from './base.js';
import { isDryRun } from './base.js';

export interface SftpConfig {
  host: string;
  port?: number;
  username: string;
  password?: string;
  privateKey?: string;
  remotePath: string;
  direction?: 'outbound' | 'inbound';
  dryRun?: boolean;
}

export class SftpAdapter implements IntegrationAdapter {
  type = 'SFTP' as const;

  async test(config: unknown): Promise<TestResult> {
    const c = config as SftpConfig;
    if (!c.host || !c.username) return { success: false, message: 'host and username required' };
    if (!c.remotePath) return { success: false, message: 'remotePath required' };
    if (isDryRun(config)) return { success: true, message: 'dry run' };
    try {
      const SftpClient = (await import('ssh2-sftp-client')).default;
      const client = new SftpClient();
      await client.connect({
        host: c.host,
        port: c.port ?? 22,
        username: c.username,
        password: c.password,
        privateKey: c.privateKey,
      });
      await client.end();
      return { success: true };
    } catch (e) {
      return { success: false, message: e instanceof Error ? e.message : 'sftp connect failed' };
    }
  }

  async execute(config: unknown, payload: unknown): Promise<AdapterResult> {
    const c = config as SftpConfig;
    if (!c.host || !c.username || !c.remotePath) {
      return { success: false, error: 'host, username, and remotePath required' };
    }
    if (isDryRun(config)) return { success: true, data: { dryRun: true, remotePath: c.remotePath } };

    const tmpPath = join(tmpdir(), `eam-sftp-${randomUUID()}.json`);
    try {
      const SftpClient = (await import('ssh2-sftp-client')).default;
      const client = new SftpClient();
      await client.connect({
        host: c.host,
        port: c.port ?? 22,
        username: c.username,
        password: c.password,
        privateKey: c.privateKey,
      });

      if (c.direction === 'inbound') {
        const data = await client.get(c.remotePath);
        await client.end();
        const text = Buffer.isBuffer(data) ? data.toString('utf8') : String(data);
        return { success: true, data: JSON.parse(text) };
      }

      await writeFile(tmpPath, JSON.stringify(payload, null, 2));
      await client.put(tmpPath, c.remotePath);
      await client.end();
      return { success: true, data: { remotePath: c.remotePath } };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : 'sftp transfer failed' };
    } finally {
      await unlink(tmpPath).catch(() => undefined);
    }
  }
}
