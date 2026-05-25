export const EICAR_TEST_STRING =
  'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*';

export interface ScanResult {
  status: 'CLEAN' | 'INFECTED' | 'FAILED';
  signature?: string;
}

export async function scanBuffer(buffer: Buffer): Promise<ScanResult> {
  const content = buffer.toString('utf8');
  if (content.includes('EICAR-STANDARD-ANTIVIRUS-TEST-FILE')) {
    return { status: 'INFECTED', signature: 'Eicar-Test-Signature' };
  }
  return { status: 'CLEAN' };
}
