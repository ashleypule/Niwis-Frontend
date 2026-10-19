import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

/**
 * Opt-in smoke against the running backend (npm run test:live; backend on BACKEND_URL, default http://localhost:8000).
 * For each live module, three KPI values are read from the UI and compared with a direct API call; the results are
 * written to docs/backend/UI_VERIFICATION.md and full-page screenshots to tests/screenshots/live/ for a visual check.
 */
const BACKEND = (process.env.BACKEND_URL ?? 'http://localhost:8000').replace(/\/$/, '');
const MODULES = ['rainfall', 'drought', 'climate', 'vegetation', 'runoff'];

interface Kpi {
  id: string;
  label: string;
  value: number | null;
  text?: string;
  unit?: string;
  asOf?: string;
}
interface Row {
  module: string;
  kpi: string;
  api: string;
  ui: string;
  ok: boolean;
}
const rows: Row[] = [];
interface CatRow {
  module: string;
  chart: string;
  column: string;
  date: string;
  api: string;
  ui: string;
  ok: boolean;
}
const catRows: CatRow[] = [];

interface CatVar {
  column: string;
  label: string;
  unit?: string;
  status: string;
}
interface CatGroup {
  id: string;
  label: string;
  unit?: string;
  columns: string[];
  defaultVisible: string[];
}
interface CatTable {
  id: string;
  label: string;
  specTag?: string;
  groups: CatGroup[];
  variables: CatVar[];
}

/** "1 175 mm" / "−0.83" / "No drought" → number or text, as the UI formats it (NBSP groups, U+2212 minus). */
const parseUi = (s: string) => {
  const n = s
    .replace(/[\s\u00a0\u202f]/g, '')
    .replace('\u2212', '-')
    .match(/^-?\d+(\.\d+)?/);
  return n ? Number(n[0]) : s.trim();
};

test.describe.configure({ mode: 'serial' });
test.use({ viewport: { width: 1440, height: 900 } });

for (const module of MODULES) {
  test(`${module}: UI values equal the API`, async ({ page, request }) => {
    const res = await request.get(`${BACKEND}/api/v1/${module}/summary?period=12M`, { timeout: 60_000 });
    expect(res.ok()).toBe(true);
    const kpis = ((await res.json()) as { kpis: Kpi[] }).kpis.filter((k) => k.value != null || k.text).slice(0, 3);

    await page.goto(`/${module}`, { waitUntil: 'load' });
    // first loads after a backend restart can take ~20 s per request
    await expect(page.getByTestId('kpi-strip').getByRole('article').first()).toBeVisible({ timeout: 120_000 });
    await expect(page.locator('[aria-busy="true"]')).toHaveCount(0, { timeout: 120_000 });
    await expect(page.locator('[data-marker="live"]').first()).toBeVisible();

    for (const k of kpis) {
      const card = page.getByRole('article', { name: new RegExp(`^${k.label.replace(/[()]/g, '\\$&')}:`) });
      const label = (await card.getAttribute('aria-label')) ?? '';
      const shown = label.slice(k.label.length + 1).trim();
      const ui = parseUi(shown);
      let ok: boolean;
      if (typeof ui === 'number' && k.value != null && !k.text) {
        const dec = (shown.split(/\s/)[0].split('.')[1] ?? '').length;
        ok = Math.abs(ui - k.value) <= 0.5 * 10 ** -dec + 1e-9;
      } else ok = shown.startsWith(k.text ?? String(k.value));
      rows.push({ module, kpi: k.label, api: k.text ?? `${k.value} ${k.unit ?? ''}`.trim(), ui: shown, ok });
      expect(ok, `${module} ${k.label}: UI "${shown}" vs API ${k.text ?? k.value}`).toBe(true);
    }
  });
}

// one database category chart per module: the newest value in the chart's data table equals the API's
for (const module of MODULES) {
  test(`${module}: a database category chart equals the API`, async ({ page, request }) => {
    const cat = (await (await request.get(`${BACKEND}/api/v1/${module}/categories`, { timeout: 60_000 })).json()) as {
      tables: CatTable[];
    };
    // the first group with a live column switched on by default
    const pick = cat.tables
      .flatMap((t) => t.groups.map((g) => ({ t, g })))
      .find(({ t, g }) => g.defaultVisible.some((c) => t.variables.find((v) => v.column === c)?.status === 'live'))!;
    const col = pick.g.defaultVisible.find((c) => pick.t.variables.find((v) => v.column === c)?.status === 'live')!;
    const v = pick.t.variables.find((x) => x.column === col)!;
    const api = (await (
      await request.get(`${BACKEND}/api/v1/${module}/category/${pick.t.id}/${pick.g.id}?vars=all&period=12M`, {
        timeout: 60_000,
      })
    ).json()) as { series: { key: string; data: [string, number | null][] }[] };
    const points = api.series.find((s) => s.key === col)!.data.filter((p) => p[1] != null);
    const [date, value] = points[points.length - 1];

    await page.goto(`/${module}`, { waitUntil: 'load' });
    const chart = page.locator(`[data-category-chart="${pick.t.id}/${pick.g.id}"]`);
    // charts load as they scroll into view
    await chart.scrollIntoViewIfNeeded({ timeout: 180_000 });
    await expect(chart.locator('[data-chart]')).toBeVisible({ timeout: 180_000 });
    const title = `${pick.t.label} · ${pick.g.label}${pick.t.specTag ? ` · ${pick.t.specTag}` : ''}`;
    await chart.getByRole('button', { name: `${title} options` }).click();
    await chart.getByRole('menuitem', { name: 'View data table' }).click();
    const table = chart.locator('table');
    const headers = await table.locator('th').allInnerTexts();
    const unit = v.unit ?? (pick.g.unit && pick.g.unit !== '—' ? pick.g.unit : '');
    const head = !unit || v.label.endsWith(`(${unit})`) ? v.label : `${v.label} (${unit})`;
    const ci = headers.indexOf(head);
    expect(ci, `column "${head}" in ${headers.join(' | ')}`).toBeGreaterThan(0);
    const row = table.locator('tbody tr').filter({ has: page.locator('td', { hasText: new RegExp(`^${date}$`) }) });
    const shown = (await row.locator('td').nth(ci).innerText()).trim();
    // the table view groups thousands with spaces and may print U+2212 for minus
    const ui = Number(shown.replace(/[\s\u00a0\u202f]/g, '').replace('\u2212', '-'));
    const ok = Math.abs(ui - value!) <= 0.0005 + 1e-9;
    catRows.push({ module, chart: title, column: col, date, api: String(value), ui: shown, ok });
    expect(ok, `${module} ${title} ${col} ${date}: UI ${shown} vs API ${value}`).toBe(true);
  });
}

// full pages, every database chart loaded, at desktop and phone width (checked by eye)
for (const width of [1440, 390]) {
  for (const module of MODULES) {
    test(`${module}: screenshot at ${width} px`, async ({ page }) => {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
      await page.goto(`/${module}`, { waitUntil: 'load' });
      await expect(page.getByTestId('database-variables')).toBeVisible({ timeout: 180_000 });
      await expect(page.locator('[data-category-chart]').first()).toBeAttached({ timeout: 180_000 });
      await loadAll(page);
      await expect(page.locator('[data-state="deferred"]')).toHaveCount(0);
      await expect(page.locator('[data-state="error"]')).toHaveCount(0);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, 'horizontal overflow (px)').toBeLessThanOrEqual(1);
      await page.waitForTimeout(1500);
      await page.screenshot({ path: `tests/screenshots/live/${module}-${width}.png`, fullPage: true });
    });
  }
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

test.afterAll(() => {
  if (!rows.length && !catRows.length) return;
  const md = [
    '# UI verification against the live backend',
    '',
    `Generated by \`npm run test:live\` on ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC against ${BACKEND}.`,
    'For each live module, the first three KPIs with a value are read from the dashboard (the KPI card as rendered) and',
    'compared with a direct call to `/api/v1/{module}/summary`. Numbers match when they agree to the decimals shown.',
    'Screenshots: `tests/screenshots/live/` (checked by eye; see PROGRESS.md).',
    '',
    '| Module | KPI | API | Dashboard | Match |',
    '| --- | --- | --- | --- | --- |',
    ...rows.map((r) => `| ${r.module} | ${r.kpi} | ${r.api} | ${r.ui} | ${r.ok ? '✔' : '✘'} |`),
    '',
    '## Database category charts',
    '',
    'For each live module, the first catalogue chart group with a live column switched on by default: the newest value',
    "in the chart's data table (⋮ → View data table, as rendered) is compared with",
    '`/api/v1/{module}/category/{table}/{group}?vars=all&period=12M`. Values match to 3 decimals (the table view rounds',
    'to 3).',
    '',
    '| Module | Chart | Column | Date | API | Dashboard | Match |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    ...catRows.map(
      (r) => `| ${r.module} | ${r.chart} | \`${r.column}\` | ${r.date} | ${r.api} | ${r.ui} | ${r.ok ? '✔' : '✘'} |`,
    ),
    '',
  ].join('\n');
  writeFileSync(resolve(import.meta.dirname, '../../../docs/backend/UI_VERIFICATION.md'), md);
});
