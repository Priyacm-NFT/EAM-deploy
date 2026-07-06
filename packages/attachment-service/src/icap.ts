/**
 * ICAP protocol adapter for commercial antivirus engines (Symantec, McAfee, Trend Micro, etc.)
 * ICAP RFC 3507 — REQMOD/RESPMOD scanning via TCP socket
 *
 * Configure via environment variables:
 *   ICAP_HOST      — ICAP server hostname (default: localhost)
 *   ICAP_PORT      — ICAP server port (default: 1344)
 *   ICAP_SERVICE   — ICAP service path (default: /avscan)
 *   ICAP_TIMEOUT_MS — Timeout in ms (default: 30000)
 */

import net from 'node:net';
import type { ScanResult } from './scan.js';

export interface IcapScanOptions {
  host?: string;
  port?: number;
  service?: string;
  timeoutMs?: number;
}

function buildIcapRequest(buffer: Buffer, host: string, service: string): Buffer {
  const httpBody = buffer;

  // Minimal HTTP request wrapper for ICAP REQMOD
  const httpHeader = Buffer.from(
    `POST / HTTP/1.1\r\nHost: ${host}\r\nContent-Length: ${httpBody.length}\r\n\r\n`,
  );

  const encapsulatedOffset = httpHeader.length;

  const icapHeader = [
    `REQMOD icap://${host}${service} ICAP/1.0`,
    `Host: ${host}`,
    `Encapsulated: req-hdr=0, req-body=${encapsulatedOffset}`,
    `Connection: close`,
    `\r\n`,
  ].join('\r\n');

  // Chunked encoding for body
  const chunkSize = httpBody.length.toString(16);
  const chunkedBody = Buffer.concat([
    Buffer.from(`${chunkSize}\r\n`),
    httpBody,
    Buffer.from('\r\n0\r\n\r\n'),
  ]);

  return Buffer.concat([Buffer.from(icapHeader), httpHeader, chunkedBody]);
}

function parseIcapResponse(response: string): ScanResult {
  // Check HTTP 200 (clean) vs 204 (no content = clean) vs modification (infected)
  if (response.includes('ICAP/1.0 204') || response.includes('X-Infection-Found: 0')) {
    return { status: 'CLEAN', engine: 'icap' };
  }

  // X-Infection-Found header present = infected
  const infectionMatch = response.match(/X-Infection-Found[:\s]+.*?Threat=([^\r\n;]+)/i);
  if (infectionMatch) {
    return { status: 'INFECTED', signature: infectionMatch[1]?.trim(), engine: 'icap' };
  }

  // ICAP/1.0 200 with body modification = infected
  if (response.includes('ICAP/1.0 200')) {
    const threatMatch = response.match(/X-Virus-ID[:\s]+([^\r\n]+)/i);
    return {
      status: 'INFECTED',
      signature: threatMatch?.[1]?.trim() ?? 'unknown',
      engine: 'icap',
    };
  }

  return { status: 'FAILED', signature: 'Unexpected ICAP response', engine: 'icap' };
}

export function icapScan(buffer: Buffer, options: IcapScanOptions = {}): Promise<ScanResult> {
  const host = options.host ?? process.env.ICAP_HOST ?? 'localhost';
  const port = options.port ?? Number(process.env.ICAP_PORT ?? 1344);
  const service = options.service ?? process.env.ICAP_SERVICE ?? '/avscan';
  const timeoutMs = options.timeoutMs ?? Number(process.env.ICAP_TIMEOUT_MS ?? 30000);

  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    const chunks: Buffer[] = [];
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      socket.destroy();
      resolve({ status: 'FAILED', signature: 'ICAP scan timed out', engine: 'icap' });
    }, timeoutMs);

    socket.on('connect', () => {
      const request = buildIcapRequest(buffer, host, service);
      socket.write(request);
    });

    socket.on('data', (chunk) => chunks.push(chunk));

    socket.on('end', () => {
      if (timedOut) return;
      clearTimeout(timer);
      const response = Buffer.concat(chunks).toString('utf8');
      resolve(parseIcapResponse(response));
    });

    socket.on('error', (err) => {
      if (timedOut) return;
      clearTimeout(timer);
      resolve({ status: 'FAILED', signature: err.message, engine: 'icap' });
    });
  });
}

/**
 * Unified scan function: uses ICAP if ICAP_HOST is set, otherwise falls back to ClamAV.
 */
export async function scanWithIcapOrClamav(buffer: Buffer): Promise<ScanResult> {
  if (process.env.ICAP_HOST) {
    return icapScan(buffer);
  }
  const { scanBuffer } = await import('./scan.js');
  return scanBuffer(buffer);
}
