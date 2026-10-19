import { expect, test, type Page } from '@playwright/test';

/**
 * Hybrid mode with recorded backend responses (tests/fixtures/backend, served through MSW): the five live pages render
 * live data with Live markers, sample data is always visibly marked, and the Overview agrees with the module pages.
 * Re-record the fixtures with `npm run fixtures:record` when the backend changes.
 */
const PAGES = ['/rainfall', '/drought', '/climate', '/vegetation', '/runoff'];
const VIEWPORTS = [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
];

function watch(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    const t = m.text();
    // the browser logs every non-2xx resource; 501 DATA_UNAVAILABLE is an expected answer, not an error
    if (m.type() === 'error' && !/status of 501/.test(t)) errors.push(`console: ${t}`);
    if (t.startsWith('[fixtures] missing')) errors.push(t);
  });
  return errors;
}

async function settle(page: Page, route: string) {
  await page.goto(route, { waitUntil: 'networkidle' });
  await expect(page.locator('h1').first()).toBeVisible();
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0, { timeout: 45_000 });
  if (await page.getByTestId('database-variables').count()) await loadAll(page);
  await page.waitForTimeout(800);
}

/** Category charts load lazily: bring every placeholder into view, then wait for the data. */
async function loadAll(page: Page) {
  const deferred = page.locator('[data-state="deferred"]');
  for (let i = 0; i < 120 && (await deferred.count()); i++) {
    await deferred
      .first()
      .scrollIntoViewIfNeeded({ timeout: 2_000 })
      .catch(() => undefined); // replaced by the chart while scrolling
    await page.waitForTimeout(100);
  }
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0, { timeout: 120_000 });
}

/** Every panel whose data is sample must say so (and be hatched); no sample panel may carry a Live marker. */
async function sampleAlwaysMarked(page: Page) {
  const bad = await page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-provenance="sample"]'))
      .filter((el) => !el.querySelector('[data-marker="sample"]') || el.querySelector('[data-marker="live"]'))
      .map((el) => el.getAttribute('aria-label') ?? el.textContent?.slice(0, 60)),
  );
  expect(bad, 'sample panels without a Sample marker').toEqual([]);
}

const slug = (p: string) => (p === '/' ? 'overview' : p.slice(1).replace(/[/?=&]/g, '_'));

for (const vp of VIEWPORTS) {
  test.describe(`hybrid ${vp.width}px`, () => {
    test.use({ viewport: vp });
    for (const route of PAGES) {
      test(route, async ({ page }) => {
        const errors = watch(page);
        await settle(page, route);
        await expect(page.locator('[data-marker="live"]').first()).toBeVisible();
        // at least one panel the database cannot serve is visibly marked (Sample) or says Not yet available
        expect(await page.locator('[data-marker="sample"], [data-state="unavailable"]').count()).toBeGreaterThan(0);
        await sampleAlwaysMarked(page);
        // live data never fails silently into an error state with recorded responses
        await expect(page.locator('[data-state="error"]')).toHaveCount(0);
        await expect(page.getByTestId('live-summary')).toContainText('5 of 24 modules live');
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        expect(overflow, 'horizontal overflow (px)').toBeLessThanOrEqual(1);
        await page.screenshot({ path: `tests/screenshots/hybrid/${vp.width}/${slug(route)}.png`, fullPage: true });
        expect(errors).toEqual([]);
      });
    }
  });
}

test.describe('hybrid behaviour', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('Overview national rainfall equals the Rainfall page KPI (one source of truth)', async ({ page }) => {
    await settle(page, '/rainfall');
    const onRainfall = await page.getByRole('article', { name: /^Total Rainfall:/ }).getAttribute('aria-label');
    await settle(page, '/');
    const onOverview = await page.getByRole('article', { name: /^Rainfall \(National\):/ }).getAttribute('aria-label');
    expect(onOverview?.split(':')[1]).toBe(onRainfall?.split(':')[1]);
    // the live cards say Live; the overview's own sample cards say Sample
    const strip = page.getByTestId('kpi-strip');
    await expect(strip.locator('[data-marker="live"]')).toHaveCount(2);
    expect(await strip.locator('[data-marker="sample"]').count()).toBeGreaterThan(0);
    await sampleAlwaysMarked(page);
  });

  test('a local municipality rolls up to its district on live pages', async ({ page }) => {
    // LM113 = Mbombela → Ehlanzeni (DC32); fixtures hold the district scope without a province
    await settle(page, '/drought?municipality=LM113');
    await expect(page.getByTestId('rollup-notice')).toContainText('Ehlanzeni District');
    await expect(page.locator('[data-marker="live"]').first()).toBeVisible();
    await expect(page.locator('[data-state="error"]')).toHaveCount(0);
  });

  test('a WMA filter is marked approximate', async ({ page }) => {
    await settle(page, '/rainfall?wma=WMA5');
    await expect(page.locator('[data-marker="approximate"]').first()).toBeVisible();
  });

  test('baselines: no 1981–2010 over live data', async ({ page }) => {
    await settle(page, '/rainfall');
    await expect(page.getByRole('heading', { name: /Rainfall Anomaly \(vs 2000–2026 mean\)/ })).toBeVisible();
    const live = await page.evaluate(() =>
      Array.from(document.querySelectorAll('[data-provenance="live"] h2')).map((h) => h.textContent ?? ''),
    );
    expect(live.filter((t) => /1981–2010|1961–1990/.test(t))).toEqual([]);
  });

  test('runoff values are labelled Modelled', async ({ page }) => {
    await settle(page, '/runoff');
    expect(await page.locator('[data-marker="modelled"]').count()).toBeGreaterThan(3);
    await expect(page.getByRole('note').filter({ hasText: 'Modelled values' })).toBeVisible();
  });

  test('Data Integration shows the national database tables', async ({ page }) => {
    await settle(page, '/data-integration');
    const panel = page.getByRole('region', { name: 'Data Integration Pipeline Status (National Database)' });
    await expect(panel.locator('[data-marker="live"]')).toBeVisible();
    await expect(panel.getByText('meteorological_drought_master')).toBeVisible();
    await sampleAlwaysMarked(page);
  });
});
