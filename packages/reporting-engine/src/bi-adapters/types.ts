import type { BiAdapterType } from '../types.js';

export interface BiAdapterContext {
  tenantId: string;
  config: Record<string, unknown>;
}

export interface BiAdapterResult {
  success: boolean;
  message: string;
  data?: Record<string, unknown>;
}

export interface BiAdapter {
  type: BiAdapterType;
  testConnection(ctx: BiAdapterContext): Promise<BiAdapterResult>;
}
