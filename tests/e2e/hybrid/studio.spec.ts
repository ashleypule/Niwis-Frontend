import { expect, test, type Page } from '@playwright/test';

/**
 * Forecasting Studio flow with recorded fixtures (tests/fixtures/backend: the POST that starts the default run and the
 * finished run), and the forecast tabs fed by the page forecasts. Re-record with `npm run fixtures:record`.
 */
function watch(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.text().startsWith('[fixtures] missing')) errors.push(m.text());
  });
  return errors;
}

test.describe('forecasting studio', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('runs the default forecast and shows the results', async ({ page }) => {
    const errors = watch(page);
    await page.goto('/ai', { waitUntil: 'networkidle' });
    await expect(page.getByRole('heading', { name: 'Forecasting Studio' }).first()).toBeVisible();
    await expect(page.getByTestId('target-info')).toContainText('History');
    await page.getByRole('button', { name: 'Run', exact: true }).click();
    const results = page.getByTestId('studio-results');
    await expect(results).toBeVisible({ timeout: 30_000 });
    await expect(page).toHaveURL(/run=1/);
    await expect(page).toHaveURL(/column=SPI_3/);
    // the chart, the metrics, the comparison with a highlighted winner and baselines, the disclaimer
    await expect(results.getByTestId('metrics')).toContainText('MASE');
    const table = results.getByTestId('comparison-table');
    await expect(table.locator('tr[data-winner]')).toHaveCount(1);
    await expect(table).toContainText('Climatology');
    await expect(table).toContainText('Seasonal naive');
    await expect(results).toContainText('not an official SAWS / DWS outlook');
    await expect(results.getByTestId('class-table')).toBeVisible(); // SPI: D0–D4 probabilities
    // sorting the comparison table
    await table.getByRole('button', { name: /Skill vs climatology/ }).click();
    await expect(table.locator('th[aria-sort]').filter({ hasText: 'Skill' })).toHaveAttribute(
      'aria-sort',
      /ascending|descending/,
    );
    expect(errors).toEqual([]);
  });

  test('a shared link reopens and re-runs the forecast', async ({ page }) => {
    const errors = watch(page);
    await page.goto(
      '/ai?table=6.2_rainfall_derived_drought_indices_master&column=SPI_3_Short_Term_Agricultural_Drought&level=province&area=WC&model=ets&horizon=6&run=1',
      { waitUntil: 'networkidle' },
    );
    await expect(page.getByTestId('studio-results')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('studio-results')).toContainText('Western Cape');
    await expect(page.getByTestId('studio-results')).toContainText('ETS');
    expect(errors).toEqual([]);
  });

  test('forecast tabs show the model, its skill and the data date', async ({ page }) => {
    const errors = watch(page);
    await page.goto('/drought/forecast', { waitUntil: 'networkidle' });
    const note = page.getByTestId('forecast-note').first();
    await expect(note).toBeVisible({ timeout: 30_000 });
    await expect(note).toContainText('Statistical forecast');
    await expect(note).toContainText('skill vs climatology');
    await expect(note).toContainText(/data to \w{3} \d{4}/);
    expect(errors).toEqual([]);
  });
});
