import { test, expect } from '@playwright/test';

test.describe('Phase 0 integration', () => {
  test('INT-E2E-001 home page loads', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /Enterprise Asset Management/i })).toBeVisible();
  });
});
