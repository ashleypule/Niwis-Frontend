import { expect, test, type Page } from '@playwright/test';
import { scrollThrough } from '../scroll';

/**
 * The production stack (nginx + the API, `deploy/docker-compose.prod.yml` in the backend repository): every page loads
 * with no sample data anywhere, live panels say Live, panels without data say "Not yet available", and nothing breaks
 * the Content Security Policy. Opt-in: `npm run test:release` with the stack running.
 */
const ROUTES = [
  '/',
  '/drought',
  '/climate',
  '/vegetation',
  '/rainfall',
  '/runoff',
  '/dams',
  '/surface-water',
  '/groundwater',
  '/groundwater-reserve',
  '/water-quality',
  '/green-drop',
  '/blue-drop',
  '/rwqo',
  '/iwrm',
  '/water-quantity',
  '/services',
  '/tariffs',
  '/settlements',
  '/ai',
  '/data-integration',
  '/governance',
  '/roadmap',
  '/alerts',
  '/reports',
];
const LIVE_PAGES = new Set([
  '/',
  '/drought',
  '/climate',
  '/vegetation',
  '/rainfall',
  '/runoff',
  '/dams',
  '/surface-water',
  '/groundwater',
  '/groundwater-reserve',
  '/water-quality',
]);

function watch(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    const t = m.text();
    if (/Content Security Policy|Refused to/i.test(t)) errors.push(`csp: ${t}`);
    // 501 DATA_UNAVAILABLE is the expected answer for panels without data
    else if (m.type() === 'error' && !/status of 501/.test(t)) errors.push(`console: ${t}`);
  });
  return errors;
}

for (const route of ROUTES) {
  test(`release ${route}`, async ({ page }) => {
    const errors = watch(page);
    await page.goto(route, { waitUntil: 'networkidle', timeout: 120_000 });
    await expect(page.locator('h1').first()).toBeVisible();
    await scrollThrough(page);
    await expect(page.locator('[data-marker="sample"]'), 'no sample data in production').toHaveCount(0);
    await expect(page.getByText('Sample data', { exact: false })).toHaveCount(0);
    // a panel without data says "Not yet available"; nothing fails into an error panel
    await expect(page.locator('[data-state="error"]')).toHaveCount(0);
    if (route === '/') await expect(page.getByTestId('kpi-strip').locator('[data-marker="live"]')).toHaveCount(6);
    if (LIVE_PAGES.has(route)) await expect(page.locator('[data-marker="live"]').first()).toBeVisible();
    else if (route !== '/reports')
      await expect(page.locator('[data-state="unavailable"]').first()).toBeVisible({ timeout: 30_000 });
    await page.screenshot({ path: `tests/screenshots/release/${route === '/' ? 'overview' : route.slice(1)}.png` });
    expect(errors).toEqual([]);
  });
}
