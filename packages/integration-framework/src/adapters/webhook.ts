import { createHmac } from 'node:crypto';
import axios from 'axios';
import type { IntegrationAdapter, AdapterResult, TestResult } from './base.js';

export class WebhookOutboundAdapter implements IntegrationAdapter {
  type = 'WEBHOOK_OUTBOUND' as const;

  async test(config: unknown): Promise<TestResult> {
    const c = config as { url?: string };
    return c.url ? { success: true } : { success: false, message: 'url required' };
  }

  async execute(config: unknown, payload: unknown): Promise<AdapterResult> {
    const c = config as { url: string; secret: string };
    const body = JSON.stringify(payload);
    const signature = createHmac('sha256', c.secret).update(body).digest('hex');
    const delays = [1000, 2000, 4000];
    let lastError: string | undefined;
    for (let attempt = 0; attempt <= delays.length; attempt++) {
      try {
        await axios.post(c.url, payload, {
          headers: {
            'Content-Type': 'application/json',
            'X-EAM-Signature': signature,
          },
          timeout: 10000,
        });
        return { success: true };
      } catch (e) {
        lastError = e instanceof Error ? e.message : 'delivery failed';
        if (attempt < delays.length) await new Promise((r) => setTimeout(r, delays[attempt]));
      }
    }
    return { success: false, error: lastError ?? 'dead letter' };
  }
}
