import { expect, test } from '@playwright/test';

/**
 * Hybrid build with the backend unreachable (the preview proxy points at a closed port). Live panels must show error
 * states with Retry — never sample numbers in their place.
 */
test.use({ viewport: { width: 1440, height: 900 } });

test('live panels show errors, not sample data, when the backend is down', async ({ page }) => {
  await page.goto('/rainfall', { waitUntil: 'load' });
  await expect(page.locator('h1').first()).toBeVisible();
  // network errors are retried twice with back-off before the error shows
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0, { timeout: 60_000 });
  expect(await page.locator('[data-state="error"]').count()).toBeGreaterThan(5);
  await expect(page.getByRole('button', { name: 'Try again' }).first()).toBeVisible();
  await expect(page.locator('[data-marker="live"]')).toHaveCount(0);
  await expect(page.getByTestId('live-summary')).toContainText('National database unreachable');

  // the rainfall panels are errors; only the modules that are sample anyway (alerts) show sample data
  const kpis = page.getByRole('alert').filter({ hasText: 'Key indicators could not be loaded' });
  await expect(kpis).toBeVisible();
  const monthly = page.getByRole('region', { name: 'Monthly Rainfall – Current vs Previous Years' });
  await expect(monthly.locator('[data-state="error"]')).toBeVisible();
  await expect(monthly.locator('[data-marker="sample"]')).toHaveCount(0);
  await expect(monthly.locator('canvas')).toHaveCount(0);
  await page.screenshot({ path: 'tests/screenshots/hybrid/backend-down-rainfall.png', fullPage: true });
});
