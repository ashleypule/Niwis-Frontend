import { expect, test, type Page } from '@playwright/test';

/**
 * Database category charts on the five live pages (recorded backend responses). The expectations are read from the
 * recorded catalogue (`/{module}/categories`), so a table or column the data team adds is covered without editing
 * this file. Chart internals are checked on the options each chart was drawn with (EChart's `data-chart` summary).
 * Charts load lazily: `open()` scrolls every placeholder into view first.
 */
const MODULES = ['drought', 'rainfall', 'climate', 'vegetation', 'runoff'] as const;

interface Variable {
  column: string;
  label: string;
  unit?: string;
  status: string;
  group?: string;
  chart?: string;
  isStale?: boolean;
  periodEnd?: string;
}
interface Group {
  id: string;
  label: string;
  unit?: string;
  columns: string[];
  defaultVisible: string[];
  chart?: string;
  band?: string[];
}
interface Table {
  id: string;
  table: string;
  label: string;
  specTag?: string;
  groups: Group[];
  variables: Variable[];
}
interface ChartSummary {
  y: { name: string; type: string; min: number | null; scale: boolean }[];
  s: { name: string; type: string; axis: number }[];
  divider: boolean;
}

async function catalogue(page: Page, module: string): Promise<Table[]> {
  const res = await page.request.get(`/__fixtures/${module}_categories.json`);
  expect(res.ok(), `recorded catalogue for ${module} (npm run fixtures:record)`).toBe(true);
  return ((await res.json()) as { body: { tables: Table[] } }).body.tables;
}

async function open(page: Page, route: string) {
  await page.goto(route, { waitUntil: 'networkidle' });
  await expect(page.getByTestId('database-variables')).toBeVisible({ timeout: 45_000 });
  await expect(page.locator('[data-category-chart]').first()).toBeVisible({ timeout: 45_000 });
  await loadAll(page);
}

/** Bring every lazily loaded chart into view until none is waiting, then wait for the data. */
async function loadAll(page: Page) {
  const deferred = page.locator('[data-state="deferred"]');
  for (let i = 0; i < 120 && (await deferred.count()); i++) {
    await deferred
      .first()
      .scrollIntoViewIfNeeded({ timeout: 2_000 })
      .catch(() => undefined); // replaced by the chart while scrolling
    await page.waitForTimeout(100);
  }
  await expect(deferred).toHaveCount(0);
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0, { timeout: 60_000 });
}

const unitOf = (v: Variable | undefined, g: Group) => {
  const u = v?.unit ?? g.unit ?? '';
  return u === '—' || u === '-' ? '' : u;
};

test.use({ viewport: { width: 1440, height: 900 } });

for (const module of MODULES) {
  test(`${module}: every catalogue table and group is drawn, with the catalogue's labels and units`, async ({
    page,
  }) => {
    const tables = await catalogue(page, module);
    await open(page, `/${module}`);
    const section = page.getByTestId('database-variables');
    await expect(section.locator('[data-category-table]')).toHaveCount(tables.length);
    for (const t of tables) {
      const block = section.locator(`[data-category-table="${t.id}"]`);
      await expect(block.getByRole('heading', { level: 3 })).toContainText(t.label);
      await expect(block.locator('[data-category-chart]')).toHaveCount(t.groups.length);
      for (const g of t.groups) {
        const chart = block.locator(`[data-category-chart="${t.id}/${g.id}"]`);
        // title = table label · group label · spec tag, exactly as sent
        await expect(chart.locator('h2').first()).toHaveText(
          new RegExp(`^${esc(`${t.label} · ${g.label}${t.specTag ? ` · ${t.specTag}` : ''}`)}`),
        );
        // one chip per column, with the catalogue label
        const chips = chart.locator('[data-column]');
        await expect(chips).toHaveCount(g.columns.length);
        for (const col of g.columns) {
          const v = t.variables.find((x) => x.column === col)!;
          const chip = chart.locator(`[data-column="${col}"]`);
          await expect(chip).toHaveText(new RegExp(`^${esc(v.label)}`));
          // unavailable chips are listed but disabled
          if (v.status !== 'live') await expect(chip).toHaveAttribute('aria-disabled', 'true');
        }
        const live = g.columns.filter((c) => t.variables.find((v) => v.column === c)?.status === 'live');
        if (!live.length) {
          await expect(chart.locator('[data-state="unavailable"]')).toBeVisible();
          continue;
        }
        // axes: one per unit among the drawn columns, named with that unit
        const visible = ((await chart.getAttribute('data-visible')) ?? '').split(',').filter(Boolean);
        const units = [
          ...new Set(
            visible.map((c) =>
              unitOf(
                t.variables.find((v) => v.column === c),
                g,
              ),
            ),
          ),
        ];
        const summary = await chartSummary(chart);
        if (!summary) continue; // every visible column empty in this scope: listed under the chart instead
        expect(summary.y.length, `${t.id}/${g.id} axes`).toBe(Math.max(1, units.length));
        units.forEach((u, i) => expect(summary.y[i].name, `${t.id}/${g.id} axis ${i}`).toBe(u || 'no unit'));
        // chart types are the catalogue's: bar / diverging-bar → bars, line → lines, the band pair as one band
        const band = g.band?.length === 2 && g.band.every((c) => visible.includes(c)) ? g.band : [];
        if (band.length)
          expect(
            summary.s.some((x) => x.name.includes(' – ')),
            `${t.id}/${g.id} band`,
          ).toBe(true);
        for (const c of visible) {
          const v = t.variables.find((x) => x.column === c)!;
          const drawn = summary.s.find((x) => x.name === v.label);
          if (band.includes(c) || !v.chart || !drawn) continue; // in the band, or no values in this scope
          expect(drawn.type, `${t.id}/${g.id} ${c} (${v.chart})`).toBe(v.chart === 'line' ? 'line' : 'bar');
        }
      }
    }
  });
}

test('no chart axis mixes units', async ({ page }) => {
  for (const module of MODULES) {
    const tables = await catalogue(page, module);
    await open(page, `/${module}`);
    for (const t of tables)
      for (const g of t.groups) {
        const chart = page.locator(`[data-category-chart="${t.id}/${g.id}"]`);
        const axes = JSON.parse((await chart.getAttribute('data-axes')) ?? '[]') as { columns: string[] }[];
        for (const a of axes) {
          const units = new Set(
            a.columns.map((c) =>
              unitOf(
                t.variables.find((v) => v.column === c),
                g,
              ),
            ),
          );
          expect(units.size, `${module} ${t.id}/${g.id}: one unit per axis`).toBeLessThanOrEqual(1);
        }
        expect(axes.length, `${module} ${t.id}/${g.id}: at most two axes`).toBeLessThanOrEqual(2);
      }
  }
});

test('toggling a chip hides / shows its series and updates the URL', async ({ page }) => {
  const tables = await catalogue(page, 'drought');
  // a group with at least two live columns switched on by default
  const pick = tables
    .flatMap((t) => t.groups.map((g) => ({ t, g })))
    .find(
      ({ t, g }) =>
        g.defaultVisible.filter((c) => t.variables.find((v) => v.column === c)?.status === 'live').length >= 2,
    )!;
  await open(page, '/drought');
  const chart = page.locator(`[data-category-chart="${pick.t.id}/${pick.g.id}"]`);
  const col = pick.g.defaultVisible[0];
  const chip = chart.locator(`[data-column="${col}"]`);
  const label = pick.t.variables.find((v) => v.column === col)!.label;
  await expect(chip).toHaveAttribute('aria-pressed', 'true');
  const before = (await chartSummary(chart))!.s.map((s) => s.name);
  expect(before).toContain(label);

  await chip.click();
  await expect(chip).toHaveAttribute('aria-pressed', 'false');
  await expect.poll(async () => (await chartSummary(chart))?.s.map((s) => s.name)).not.toContain(label);
  const param = `drought.${pick.t.id}.${pick.g.id}`;
  await expect
    .poll(() => new URL(page.url()).searchParams.get(param))
    .toBe(pick.g.columns.filter((c) => c !== col && pick.g.defaultVisible.includes(c)).join(','));

  // a shared link restores the selection
  await open(page, page.url().replace(/^https?:\/\/[^/]+/, ''));
  await expect(
    page.locator(`[data-category-chart="${pick.t.id}/${pick.g.id}"] [data-column="${col}"]`),
  ).toHaveAttribute('aria-pressed', 'false');
  // keyboard: Space toggles it back on, and the default selection drops out of the URL
  const again = page.locator(`[data-category-chart="${pick.t.id}/${pick.g.id}"] [data-column="${col}"]`);
  await again.focus();
  await page.keyboard.press('Space');
  await expect(again).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => new URL(page.url()).searchParams.get(param)).toBeNull();
});

test('unavailable chips are not clickable', async ({ page }) => {
  const tables = await catalogue(page, 'drought');
  await open(page, '/drought');
  const withheld = tables.flatMap((t) =>
    t.groups.flatMap((g) =>
      g.columns.filter((c) => t.variables.find((v) => v.column === c)?.status === 'withheld').map((c) => ({ t, g, c })),
    ),
  );
  expect(withheld.length).toBeGreaterThan(0);
  const { t, g, c } = withheld[0];
  const chip = page.locator(`[data-category-chart="${t.id}/${g.id}"] [data-column="${c}"]`);
  await expect(chip).toHaveAttribute('aria-disabled', 'true');
  await expect(chip).toHaveAttribute('title', /withheld/);
  const url = page.url();
  await chip.click({ force: true });
  await expect(chip).toHaveAttribute('aria-pressed', 'false');
  expect(page.url()).toBe(url);
});

for (const module of MODULES) {
  test(`${module}: bars start at 0 and status charts have no forecast divider`, async ({ page }) => {
    await open(page, `/${module}`);
    const charts = await page.locator('[data-chart]').evaluateAll((els) =>
      els.map((e) => ({
        label: e.getAttribute('aria-label') ?? '',
        // sample panels (e.g. climate projections) really hold forecast values
        live: e.closest('[data-provenance]')?.getAttribute('data-provenance') === 'live',
        summary: JSON.parse(e.getAttribute('data-chart') ?? '{}') as ChartSummary,
      })),
    );
    expect(charts.length).toBeGreaterThan(10);
    expect(charts.filter((c) => c.live).length).toBeGreaterThan(10);
    for (const { label, live, summary } of charts) {
      if (live) expect(summary.divider, `${label}: forecast divider on a live status chart`).toBe(false);
      summary.y.forEach((axis, i) => {
        const bars = summary.s.some((s) => s.axis === i && s.type === 'bar');
        if (!bars || axis.type === 'log') return;
        expect(axis.scale, `${label}: bar axis ${i} may not zoom away from 0`).toBe(false);
        if (axis.min != null) expect(axis.min, `${label}: bar axis ${i} min`).toBeLessThanOrEqual(0);
      });
    }
  });
}

test('vegetation classes use the spec names (§5.3)', async ({ page }) => {
  await open(page, '/vegetation');
  const text = await page.locator('main').innerText();
  expect(text).not.toMatch(/Very Healthy|Very Stressed|\bStressed\b/);
  expect(text).toMatch(/Excellent|Good|Fair|Poor|Very Poor/);
  await open(page, '/drought');
  await expect(page.locator('section[aria-label^="Drought Cascade"]')).not.toContainText(/Very Healthy|Stressed/);
});

test('Spec coverage counts the catalogue and lists every column', async ({ page }) => {
  const tables = await catalogue(page, 'drought');
  await open(page, '/drought');
  const vars = tables.flatMap((t) => t.variables);
  const n = (s: string) => vars.filter((v) => v.status === s).length;
  await expect(page.getByTestId('coverage-summary')).toContainText(
    `${tables.length} tables · ${vars.length} columns · ${n('live')} live · ${n('withheld')} withheld`,
  );
  await page.getByRole('button', { name: /Show every column/ }).click();
  await expect(
    page.getByRole('region', { name: 'Database variables: database columns' }).locator('tbody tr'),
  ).toHaveCount(vars.length);
});

test('sample alerts are not shown on live pages', async ({ page }) => {
  for (const route of ['/rainfall', '/vegetation']) {
    await open(page, route);
    await expect(page.locator('[data-state="alerts-pending"]')).toContainText(
      'Alerts will appear when the alert service is connected',
    );
  }
});

function esc(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function chartSummary(chart: ReturnType<Page['locator']>): Promise<ChartSummary | undefined> {
  const el = chart.locator('[data-chart]').first();
  if (!(await el.count())) return undefined;
  return JSON.parse((await el.getAttribute('data-chart')) ?? '{}') as ChartSummary;
}

test('category charts load lazily, as they scroll into view', async ({ page }) => {
  let requests = 0;
  page.on('request', (r) => /\/api\/v1\/[^/]+\/category\//.test(r.url()) && requests++);
  await page.goto('/climate', { waitUntil: 'networkidle' });
  await expect(page.locator('[data-category-chart]').first()).toBeAttached({ timeout: 45_000 });
  await page.waitForTimeout(1_000);
  // the section starts below the fold: nothing requested yet
  expect(requests).toBe(0);
  expect(await page.locator('[data-state="deferred"]').count()).toBeGreaterThan(5);
  await loadAll(page);
  expect(requests).toBeGreaterThan(5);
});

test('a column that ends before the period offers its last available months, for that chart only', async ({ page }) => {
  const tables = await catalogue(page, 'drought');
  const t = tables.find((x) => x.variables.some((v) => v.column === 'sgi_dimensionless'))!;
  const sgi = t.variables.find((v) => v.column === 'sgi_dimensionless')!;
  expect(sgi).toMatchObject({ status: 'live', isStale: true });
  await open(page, '/drought');
  const chart = page.locator(`[data-category-chart="${t.id}/${sgi.group}"]`);
  await expect(chart.getByTestId('data-ends')).toContainText('Data ends Aug 2024');
  const offer = chart.getByRole('button', { name: 'Show last available 12 months (Sep 2023 – Aug 2024)' });
  const before = page.url();
  await offer.click();
  await expect(chart.getByTestId('chart-own-period')).toContainText('Sep 2023 – Aug 2024');
  await expect(chart.locator('[data-chart]')).toBeVisible();
  await expect(chart.locator('[data-marker="stale"]')).toContainText('Data to Aug 2024');
  // the page keeps its own period: URL unchanged, the other charts untouched
  expect(page.url()).toBe(before);
  await expect(page.getByRole('radiogroup', { name: 'Period' }).getByRole('radio', { name: '12M' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await chart.getByRole('button', { name: 'Back to the page period' }).click();
  await expect(chart.getByTestId('data-ends')).toBeVisible();
});

test('drought: meteorological rainfall and temperature charts, SGI KPI and groundwater stage blank with a reason', async ({
  page,
}) => {
  const tables = await catalogue(page, 'drought');
  const met = tables.find((x) => x.table === 'meteorological_drought_master')!;
  const live = (re: RegExp) =>
    met.groups.filter(
      (g) => re.test(g.label) && g.columns.some((c) => met.variables.find((v) => v.column === c)?.status === 'live'),
    );
  expect(live(/rainfall/i).length).toBeGreaterThan(2);
  expect(live(/^temp/i).length).toBeGreaterThan(0);
  await open(page, '/drought');
  for (const g of [...live(/rainfall/i), ...live(/^temp/i)])
    await expect(page.locator(`[data-category-chart="${met.id}/${g.id}"] [data-chart]`), g.label).toBeVisible();
  const kpi = page.getByRole('article', { name: /^SGI:/ });
  await expect(kpi).toHaveAttribute('aria-label', /not available \(Latest valid SGI is Aug 2024/);
  await expect(page.locator('section[aria-label^="Drought Cascade"]')).toContainText('Latest valid SGI is Aug 2024');
});
