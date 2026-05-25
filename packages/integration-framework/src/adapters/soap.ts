import axios from 'axios';
import { XMLParser } from 'fast-xml-parser';
import type { IntegrationAdapter, AdapterResult, TestResult } from './base.js';
import { isDryRun } from './base.js';

export interface SoapConfig {
  endpoint: string;
  soapAction?: string;
  envelopeTemplate?: string;
  headers?: Record<string, string>;
  timeoutMs?: number;
  dryRun?: boolean;
}

function buildEnvelope(template: string | undefined, payload: unknown): string {
  const body = typeof payload === 'string' ? payload : JSON.stringify(payload);
  if (template) return template.replace('{{payload}}', body);
  return `<?xml version="1.0"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body>${body}</soap:Body></soap:Envelope>`;
}

export class SoapAdapter implements IntegrationAdapter {
  type = 'SOAP' as const;

  async test(config: unknown): Promise<TestResult> {
    const c = config as SoapConfig;
    if (!c.endpoint) return { success: false, message: 'endpoint required' };
    if (isDryRun(config)) return { success: true, message: 'dry run' };
    try {
      const res = await axios.post(c.endpoint, buildEnvelope(c.envelopeTemplate, {}), {
        headers: {
          'Content-Type': 'text/xml; charset=utf-8',
          ...(c.soapAction ? { SOAPAction: c.soapAction } : {}),
          ...c.headers,
        },
        timeout: c.timeoutMs ?? 5000,
        validateStatus: () => true,
      });
      return res.status < 500
        ? { success: true }
        : { success: false, message: `HTTP ${res.status}` };
    } catch (e) {
      return { success: false, message: e instanceof Error ? e.message : 'failed' };
    }
  }

  async execute(config: unknown, payload: unknown): Promise<AdapterResult> {
    const c = config as SoapConfig;
    if (!c.endpoint) return { success: false, error: 'endpoint required' };
    if (isDryRun(config)) return { success: true, data: { dryRun: true } };

    try {
      const res = await axios.post(c.endpoint, buildEnvelope(c.envelopeTemplate, payload), {
        headers: {
          'Content-Type': 'text/xml; charset=utf-8',
          ...(c.soapAction ? { SOAPAction: c.soapAction } : {}),
          ...c.headers,
        },
        timeout: c.timeoutMs ?? 30000,
      });
      const parser = new XMLParser({ ignoreAttributes: false });
      const parsed = typeof res.data === 'string' ? parser.parse(res.data) : res.data;
      return { success: true, data: parsed };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : 'SOAP request failed' };
    }
  }
}
