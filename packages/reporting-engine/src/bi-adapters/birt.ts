import type { BiAdapter, BiAdapterContext, BiAdapterResult } from './types.js';
import { uploadReportOutput } from '../storage.js';

export async function storeBirtDesign(
  tenantId: string,
  designId: string,
  xml: string,
): Promise<string> {
  const key = `bi/birt/${tenantId}/${designId}.rptdesign`;
  await uploadReportOutput(key, xml, 'application/xml');
  return key;
}

export async function runBirtReport(
  designKey: string,
  format: 'PDF' | 'HTML' = 'PDF',
): Promise<BiAdapterResult> {
  const base = process.env.BIRT_RUNTIME_URL ?? 'http://localhost:8080/birt';
  const url = `${base}/run?design=${encodeURIComponent(designKey)}&format=${format}`;

  try {
    const res = await fetch(url, { method: 'GET' });
    if (!res.ok) {
      return {
        success: false,
        message: `BIRT runtime returned ${res.status} (is BIRT_RUNTIME_URL reachable?)`,
      };
    }
    return { success: true, message: 'BIRT report rendered', data: { format } };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      message: `BIRT runtime unavailable: ${msg}`,
    };
  }
}

export const birtAdapter: BiAdapter = {
  type: 'BIRT',
  async testConnection(ctx: BiAdapterContext): Promise<BiAdapterResult> {
    const base = process.env.BIRT_RUNTIME_URL;
    if (!base) {
      return { success: false, message: 'BIRT_RUNTIME_URL not configured' };
    }
    return runBirtReport(`bi/birt/${ctx.tenantId}/probe`, 'PDF');
  },
};
