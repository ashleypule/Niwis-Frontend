/**
 * The naming check's page walk (audit step 2): every title, context line, KPI label, axis name, chart series (legend),
 * table header, map / scale legend entry, chip, tab, map layer, pill, entity field, cascade stage, marker and note of a
 * rendered page, with the attributes the register check needs. Used by scripts/naming-check.ts (CLI) and
 * tests/e2e/hybrid/naming.spec.ts (Playwright, recorded fixtures).
 */
import { chromium, type Page } from '@playwright/test';
import { MODULES } from '../../src/config/modules';
import type { LabelItem } from '../../src/config/naming';

/** Every page of the system (module pages, their forecast views, the report views). */
export const ROUTES: string[] = [
  ...MODULES.flatMap((m) => (m.hasForecast ? [m.path, `${m.path}/forecast`] : [m.path])),
  '/data-integration/report',
];

/** Scroll through the page (panels, charts and maps load as they near the viewport), then wait for every panel. */
export async function settle(page: Page) {
  await page.waitForSelector('h1', { timeout: 60_000 });
  for (let pass = 0; pass < 2; pass++) {
    await page.evaluate(async () => {
      const step = Math.max(200, Math.round(window.innerHeight * 0.8));
      for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 90));
      }
      window.scrollTo(0, document.documentElement.scrollHeight);
      await new Promise((r) => setTimeout(r, 90));
    });
    await page.waitForLoadState('networkidle').catch(() => undefined);
    // category charts load lazily: bring every placeholder into view
    const deferred = page.locator('[data-state="deferred"]');
    for (let i = 0; i < 150 && (await deferred.count()); i++) {
      await deferred
        .first()
        .scrollIntoViewIfNeeded({ timeout: 2_000 })
        .catch(() => undefined);
      await page.waitForTimeout(100);
    }
    await page
      .waitForFunction(() => !document.querySelector('[aria-busy="true"]'), undefined, { timeout: 150_000 })
      .catch(() => undefined);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(500);
}

/** Everything on the page that names a variable, with the attributes the check needs. */
export async function collectLabels(page: Page, route: string): Promise<LabelItem[]> {
  const items = await page.evaluate(() => {
    const out: Record<string, unknown>[] = [];
    const txt = (el: Element | null | undefined) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
    const ds = (el: Element) => (el as HTMLElement).dataset;
    const h1 = document.querySelector('h1');
    out.push({ kind: 'page-title', text: txt(h1) });
    const sub = h1?.parentElement?.nextElementSibling;
    if (sub) out.push({ kind: 'page-subtitle', text: txt(sub) });
    document.querySelectorAll('article[data-kpi]').forEach((a) => {
      const pill = a.querySelector('[data-pill]');
      out.push({
        kind: 'kpi',
        text: txt(a.querySelector('h3')),
        sub: txt(a.querySelector('h3 + p')),
        value: txt(a.querySelector('p.num')),
        delta: txt(a.querySelector('span.num')),
        unit: ds(a).unit,
        decimals: ds(a).decimals,
        metric: ds(a).metric,
        good: ds(a).good,
        tone: ds(a).deltaTone,
        prov: ds(a).provenance,
        pill: txt(pill),
        pillScale: pill ? ds(pill).pill : undefined,
        pillClass: pill ? ds(pill).class : undefined,
        markers: Array.from(a.querySelectorAll('[data-marker]')).map((m) => `${ds(m).marker}:${txt(m)}`),
      });
    });
    document.querySelectorAll('section[aria-label="Forecast indicators"] article').forEach((a) =>
      out.push({
        kind: 'kpi',
        text: txt(a.querySelector('h3')),
        value: txt(a.querySelector('p.num')),
        forecast: true,
      }),
    );
    document.querySelectorAll('section.card').forEach((sec) => {
      const h2 = sec.querySelector(':scope > header h2');
      const title = txt(h2);
      const prov = sec.getAttribute('data-provenance') ?? undefined;
      const base = { panel: title, prov };
      if (title) out.push({ kind: 'title', text: title, ...base });
      const ctx = sec.querySelector(':scope > header .truncate');
      if (ctx && txt(ctx)) out.push({ kind: 'context', text: txt(ctx), ...base });
      const info = h2?.querySelector('svg')?.getAttribute('aria-label');
      if (info) out.push({ kind: 'info', text: info, ...base });
      sec.querySelectorAll('[data-chart]').forEach((c) => {
        const o = JSON.parse(c.getAttribute('data-chart') ?? '{}') as {
          y: { name: string; type: string; min: number | null }[];
          s: { name: string; type: string; axis: number }[];
          divider: boolean;
        };
        (o.y ?? []).forEach((a) => out.push({ kind: 'axis', text: a.name, axisType: a.type, ...base }));
        (o.s ?? []).forEach((s) =>
          out.push({ kind: 'series', text: s.name, seriesType: s.type, axis: o.y?.[s.axis]?.name ?? '', ...base }),
        );
        if (o.divider) out.push({ kind: 'divider', text: 'Historical | Forecast', ...base });
      });
      sec.querySelectorAll('th[data-col]').forEach((th) =>
        out.push({
          kind: 'header',
          text: txt(th),
          col: ds(th).col,
          unit: ds(th).colUnit,
          type: ds(th).colType,
          decimals: ds(th).colDecimals,
          scale: ds(th).colScale,
          ...base,
        }),
      );
      sec
        .querySelectorAll('button[data-column]')
        .forEach((b) => out.push({ kind: 'chip', text: txt(b), column: ds(b).column, status: ds(b).status, ...base }));
      sec.querySelectorAll('[data-testid="map-legend"]').forEach((l) => {
        out.push({
          kind: 'legend-title',
          text: txt(l.querySelector('button span')),
          scale: ds(l).scale,
          unit: ds(l).unit,
          ...base,
        });
        l.querySelectorAll('li').forEach((li) =>
          out.push({ kind: 'legend', text: txt(li), scale: ds(l).scale, ...base }),
        );
      });
      sec
        .querySelectorAll('[data-testid="scale-legend"]')
        .forEach((l) =>
          l
            .querySelectorAll('li')
            .forEach((li) => out.push({ kind: 'legend', text: txt(li), scale: ds(l).scale, ...base })),
        );
      sec.querySelectorAll('[role="tab"]').forEach((t) => out.push({ kind: 'tab', text: txt(t), ...base }));
      sec.querySelectorAll('fieldset label').forEach((t) => out.push({ kind: 'layer', text: txt(t), ...base }));
      sec
        .querySelectorAll('[data-pill]')
        .forEach((p) => out.push({ kind: 'pill', text: txt(p), scale: ds(p).pill, cls: ds(p).class, ...base }));
      sec
        .querySelectorAll('dt[data-field]')
        .forEach((d) =>
          out.push({ kind: 'field', text: txt(d), unit: ds(d).unit, value: txt(d.nextElementSibling), ...base }),
        );
      sec.querySelectorAll('[data-stage]').forEach((d) => out.push({ kind: 'stage', text: txt(d), ...base }));
      sec.querySelectorAll('[data-marker]').forEach((m) =>
        out.push({
          kind: 'marker',
          text: txt(m),
          marker: ds(m).marker,
          title: m.getAttribute('title') ?? '',
          ...base,
        }),
      );
      sec
        .querySelectorAll('[data-state]')
        .forEach((m) => out.push({ kind: 'state', text: txt(m).slice(0, 200), state: ds(m).state, ...base }));
      sec
        .querySelectorAll(
          '[data-testid="missing-note"], [data-testid="duplicates-note"], [data-testid="forecast-note"]',
        )
        .forEach((n) => out.push({ kind: 'note', text: txt(n), ...base }));
      // donut legends and ranked bars: label + value
      sec.querySelectorAll('ul li > span.flex-1, ul li > span.truncate').forEach((s) => {
        const val = s.parentElement?.querySelector('.num');
        if (val) out.push({ kind: 'item', text: txt(s), value: txt(val), ...base });
      });
    });
    document
      .querySelectorAll('[data-category-table] h3')
      .forEach((h) => out.push({ kind: 'table-block', text: txt(h) }));
    return out;
  });
  return items.map((i) => ({ route, ...i }) as LabelItem);
}

export async function walk(base: string, routes: string[], onPage?: (route: string, items: LabelItem[]) => void) {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const all: LabelItem[] = [];
  try {
    for (const route of routes) {
      const page = await context.newPage();
      await page.goto(`${base}${route}`, { waitUntil: 'networkidle', timeout: 120_000 }).catch(() => undefined);
      await settle(page);
      const items = await collectLabels(page, route);
      onPage?.(route, items);
      all.push(...items);
      await page.close();
    }
  } finally {
    await browser.close();
  }
  return all;
}
