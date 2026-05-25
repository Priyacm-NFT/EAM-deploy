export type AdapterType = 'REST' | 'SFTP' | 'WEBHOOK_OUTBOUND' | 'KAFKA';

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
