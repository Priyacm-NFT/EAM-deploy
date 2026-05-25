import { clamavInstreamScan } from './clamav.js';

export const EICAR_TEST_STRING =
  'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*';

export interface ScanResult {
  status: 'CLEAN' | 'INFECTED' | 'FAILED';
  signature?: string;
  engine?: string;
}

function scanEicarFallback(buffer: Buffer): ScanResult {
  const content = buffer.toString('utf8');
  if (content.includes('EICAR-STANDARD-ANTIVIRUS-TEST-FILE')) {
    return { status: 'INFECTED', signature: 'Eicar-Test-Signature', engine: 'eicar-fallback' };
  }
  return { status: 'CLEAN', engine: 'eicar-fallback' };
}

export async function scanBuffer(buffer: Buffer): Promise<ScanResult> {
  if (process.env.CLAMAV_DISABLED === 'true') {
    return scanEicarFallback(buffer);
  }

  try {
    const result = await clamavInstreamScan(buffer);
    return { ...result, engine: 'clamav' };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { status: 'FAILED', signature: message, engine: 'clamav' };
  }
}
