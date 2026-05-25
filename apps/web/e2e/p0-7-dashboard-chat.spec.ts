import { test, expect } from '@playwright/test';

test.describe('P0-7 Dashboard & Chat', () => {
  test('P0-7-D-001 dashboard page renders widget placeholders', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
    await expect(
      page.getByText(/Loading|Failed to load|My Open SRs|Open Work Orders/),
    ).toBeVisible();
  });

  test('P0-7-C-001 chat page renders collaboration UI', async ({ page }) => {
    await page.goto('/chat');
    await expect(page.getByRole('heading', { name: 'Chat' })).toBeVisible();
    await expect(page.getByTestId('socket-status')).toBeVisible();
    await expect(page.getByTestId('chat-partner-id')).toBeVisible();
  });
});
