import { test, expect } from '@playwright/test';

test.describe('SAML auth metadata', () => {
  test('SP metadata endpoint is reachable when API is up', async ({ request }) => {
    const api = process.env.VITE_API_URL ?? 'http://localhost:3000';
    const res = await request.get(`${api}/health`);
    if (res.status() !== 200) {
      test.skip();
      return;
    }
    const providerId = '00000000-0000-0000-0000-000000000001';
    const meta = await request.get(`${api}/auth/saml/${providerId}/metadata`);
    expect([200, 404]).toContain(meta.status());
  });
});
