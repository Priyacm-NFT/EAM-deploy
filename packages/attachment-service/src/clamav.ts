import net from 'node:net';
import type { ScanResult } from './scan.js';

const INSTREAM_CMD = Buffer.from('zINSTREAM\0');
const CHUNK_SIZE = 64 * 1024;

export interface ClamavScanOptions {
  host?: string;
  port?: number;
  timeoutMs?: number;
}

export function parseClamavResponse(response: string): ScanResult {
  const line = response.trim();
  if (line.includes('FOUND')) {
    const match = line.match(/:\s*(.+?)\s+FOUND/i);
    return { status: 'INFECTED', signature: match?.[1]?.trim() ?? 'unknown' };
  }
  if (/\bOK\b/i.test(line)) {
    return { status: 'CLEAN' };
  }
  return { status: 'FAILED', signature: line || 'empty ClamAV response' };
}

export function clamavInstreamScan(
  buffer: Buffer,
  options: ClamavScanOptions = {},
): Promise<ScanResult> {
  const host = options.host ?? process.env.CLAMAV_HOST ?? 'localhost';
  const port = options.port ?? Number(process.env.CLAMAV_PORT ?? 3310);
  const timeoutMs = options.timeoutMs ?? Number(process.env.CLAMAV_TIMEOUT_MS ?? 120_000);

  return new Promise((resolve, reject) => {
    let response = '';
    let settled = false;

    const finish = (result: ScanResult | Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      if (result instanceof Error) reject(result);
      else resolve(result);
    };

    const socket = net.createConnection({ host, port }, () => {
      socket.write(INSTREAM_CMD);
      for (let offset = 0; offset < buffer.length; offset += CHUNK_SIZE) {
        const chunk = buffer.subarray(offset, Math.min(offset + CHUNK_SIZE, buffer.length));
        const len = Buffer.alloc(4);
        len.writeUInt32BE(chunk.length, 0);
        socket.write(len);
        socket.write(chunk);
      }
      socket.write(Buffer.alloc(4));
    });

    socket.on('data', (chunk) => {
      response += chunk.toString('utf8');
    });

    socket.on('end', () => finish(parseClamavResponse(response)));
    socket.on('error', (err) => finish(err));
    socket.on('timeout', () => finish(new Error('ClamAV socket timed out')));

    const timer = setTimeout(() => {
      finish(new Error(`ClamAV scan timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });
}
