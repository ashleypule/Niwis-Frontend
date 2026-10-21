import { expect, test, type Page } from '@playwright/test';

/** Every routed page (spec screens) — rendered at desktop and phone widths, screenshots saved for review. */
const ROUTES = [
  '/',
  '/drought',
  '/drought/forecast',
  '/climate',
  '/climate/forecast',
  '/vegetation',
  '/vegetation/forecast',
  '/rainfall',
  '/rainfall/forecast',
  '/runoff',
  '/runoff/forecast',
  '/dams',
  '/dams/forecast',
  '/surface-water',
  '/surface-water/forecast',
  '/groundwater',
  '/groundwater-reserve',
  '/water-quality',
  '/water-quality/forecast',
  '/green-drop',
  '/blue-drop',
  '/rwqo',
  '/iwrm',
  '/water-quantity',
  '/services',
  '/services/forecast',
  '/tariffs',
  '/tariffs/forecast',
  '/settlements',
  '/settlements/forecast',
  '/ai',
  '/data-integration',
  '/data-integration/report',
  '/governance',
  '/roadmap',
  '/alerts',
  '/reports',
  '/reports/print?report=dam-status',
  '/dev/components',
];

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile', width: 390, height: 844 },
];

function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  // ERR_ABORTED = TanStack Query cancelling a superseded request (query key changed) — expected
  page.on('requestfailed', (r) => {
    if (!r.failure()?.errorText.includes('ERR_ABORTED'))
      errors.push(`requestfailed: ${r.url()} ${r.failure()?.errorText}`);
  });
  page.on('response', (r) => {
    if (r.status() >= 400 && !r.url().includes('tile.openstreetmap')) errors.push(`http ${r.status()}: ${r.url()}`);
  });
  return errors;
}

const slug = (p: string) => (p === '/' ? 'overview' : p.slice(1).replace(/[/?=&]/g, '_'));

for (const vp of VIEWPORTS) {
  test.describe(`${vp.name} ${vp.width}px`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    for (const route of ROUTES) {
      test(route, async ({ page }) => {
        const errors = watchErrors(page);
        await page.goto(route, { waitUntil: 'networkidle' });
        // shell renders a page title; print view renders its own cover heading
        await expect(page.locator('h1').first()).toBeVisible();
        await expect(page.getByText('Something went wrong')).toHaveCount(0);
        // all panels resolve (no skeletons left, no panel-level error states)
        await expect(page.locator('[aria-busy="true"]')).toHaveCount(0, { timeout: 30_000 });
        await expect(page.locator('[role="alert"]').filter({ hasText: /failed|error/i })).toHaveCount(0);
        // no horizontal page scroll
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        expect(overflow, 'horizontal overflow (px)').toBeLessThanOrEqual(1);
        await page.waitForTimeout(800); // chart animations
        await page.screenshot({ path: `tests/screenshots/${vp.width}/${slug(route)}.png`, fullPage: true });
        expect(errors).toEqual([]);
      });
    }
  });
}

test('Ctrl+K search navigates to a dam', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/', { waitUntil: 'networkidle' });
  await expect(page.locator('h1').first()).toBeVisible();
  await page.keyboard.press('Control+k');
  const dialog = page.getByRole('dialog', { name: 'Search' });
  await dialog.locator('input').fill('Gariep');
  await dialog
    .getByRole('option', { name: /Gariep/ })
    .first()
    .click();
  await expect(page).toHaveURL(/\/dams/);
});

test('filters are synced to the URL', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/drought?province=WC&period=24M', { waitUntil: 'networkidle' });
  await page.reload({ waitUntil: 'networkidle' });
  await expect(page).toHaveURL(/province=WC/);
  await expect(page).toHaveURL(/period=24M/);
});

test('public system: no user menu or sign-out, a theme toggle, read-only alerts', async ({ page }) => {
  await page.goto('/');
  const header = page.locator('header.hero');
  await expect(header).not.toContainText('DWS User');
  await expect(header.getByRole('button', { name: /sign out|account|user/i })).toHaveCount(0);
  const html = page.locator('html');
  const before = await html.getAttribute('data-theme');
  await header.getByRole('button', { name: /Switch to (dark|light) theme/ }).click();
  await expect(html).not.toHaveAttribute('data-theme', before ?? '');
  await page.goto('/alerts');
  await expect(page.getByRole('row').nth(1)).toBeVisible();
  await expect(page.getByRole('button', { name: /Acknowledge|Assign|Mark resolved/ })).toHaveCount(0);
  await expect(page.getByRole('columnheader', { name: 'Actions' })).toHaveCount(0);
});
