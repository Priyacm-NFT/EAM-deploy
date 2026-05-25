export type AdapterType =
  | 'REST'
  | 'SOAP'
  | 'KAFKA'
  | 'RABBITMQ'
  | 'SFTP'
  | 'JDBC'
  | 'WEBHOOK_OUTBOUND';

export interface TestResult {
  success: boolean;
  message?: string;
}

export interface AdapterResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

export interface IntegrationAdapter {
  type: AdapterType;
  test(config: unknown): Promise<TestResult>;
  execute(config: unknown, payload: unknown): Promise<AdapterResult>;
}

export function isDryRun(config: unknown): boolean {
  return Boolean((config as { dryRun?: boolean })?.dryRun);
}
