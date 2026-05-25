import axios from 'axios';
import type { IntegrationAdapter, AdapterResult, TestResult } from './base.js';

export class RestAdapter implements IntegrationAdapter {
  type = 'REST' as const;

  async test(config: unknown): Promise<TestResult> {
    const c = config as { url?: string };
    if (!c.url) return { success: false, message: 'url required' };
    try {
      await axios.get(c.url, { timeout: 5000, validateStatus: () => true });
      return { success: true };
    } catch (e) {
      return { success: false, message: e instanceof Error ? e.message : 'failed' };
    }
  }

  async execute(config: unknown, payload: unknown): Promise<AdapterResult> {
    const c = config as {
      url: string;
      method?: string;
      headers?: Record<string, string>;
      retryAttempts?: number;
    };
    let lastError: string | undefined;
    const attempts = c.retryAttempts ?? 1;
    for (let i = 0; i < attempts; i++) {
      try {
        const res = await axios({
          url: c.url,
          method: (c.method ?? 'POST') as 'GET' | 'POST' | 'PUT',
          headers: c.headers,
          data: payload,
          timeout: 10000,
        });
        return { success: true, data: res.data };
      } catch (e) {
        lastError = e instanceof Error ? e.message : 'request failed';
        if (i < attempts - 1) await new Promise((r) => setTimeout(r, 1000 * 2 ** i));
      }
    }
    return { success: false, error: lastError };
  }
}
