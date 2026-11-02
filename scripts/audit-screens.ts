/**
 * Audit step 2, part C: full-page screenshots of every page at 1440, 1024 and 390 px, light and dark, saved to
 * tests/screenshots/audit/{page}-{width}-{theme}.png, plus a layout report (JSON and a console summary) of what the
 * DOM can measure: horizontal page overflow, clipped (line-clamped) titles and labels, truncated context lines and
 * table cells, KPI cards of unequal height in one row, duplicate legend entries, chips rows that overflow on phones.
 *
 *   npx vite-node scripts/audit-screens.ts [--base=http://localhost:4176] [--only=/drought] [--widths=1440,390]
 *                                          [--themes=light,dark] [--out=tests/screenshots/audit]
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium, type Page } from '@playwright/test';
import { ROUTES, settle } from './lib/naming-walk';

export interface LayoutIssue {
  route: string;
  width: number;
  theme: string;
  rule: string;
  panel: string;
  text: string;
  detail?: string;
}

/** What the DOM can measure about the page's layout. */
export async function layoutIssues(page: Page, route: string, width: number, theme: string): Promise<LayoutIssue[]> {
  const raw = await page.evaluate(() => {
    const out: { rule: string; panel: string; text: string; detail?: string }[] = [];
    const txt = (el: Element | null | undefined) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
    const panelOf = (el: Element) =>
      txt(el.closest('section.card')?.querySelector(':scope > header h2')) ||
      txt(el.closest('article')?.querySelector('h3')) ||
      el.closest('section')?.getAttribute('aria-label') ||
      '';
    const visible = (el: Element) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none';
    };
    const overflow = document.documentElement.scrollWidth - window.innerWidth;
    if (overflow > 1)
      out.push({ rule: 'page-overflow', panel: '', text: `${overflow} px`, detail: 'horizontal page scroll' });
    // clamped titles / labels: the text needs more lines than the clamp allows
    document.querySelectorAll('.line-clamp-1, .line-clamp-2, .line-clamp-3').forEach((el) => {
      if (!visible(el)) return;
      if (el.scrollHeight > el.clientHeight + 2)
        out.push({
          rule: 'clipped',
          panel: panelOf(el),
          text: txt(el).slice(0, 120),
          detail: `${el.tagName.toLowerCase()}.${Array.from(el.classList).find((c) => c.startsWith('line-clamp'))}`,
        });
    });
    // truncated single-line text (context lines, cells, chips)
    document.querySelectorAll('.truncate').forEach((el) => {
      if (!visible(el)) return;
      if (el.scrollWidth > el.clientWidth + 2)
        out.push({
          rule: 'truncated',
          panel: panelOf(el),
          text: txt(el).slice(0, 120),
          detail: `${el.scrollWidth - el.clientWidth} px hidden`,
        });
    });
    // any element whose text overflows its box horizontally with overflow hidden (not a scroller)
    document.querySelectorAll('h1, h2, h3, th, [data-testid="map-legend"] li, [role="tab"], .num').forEach((el) => {
      if (!visible(el)) return;
      const cs = getComputedStyle(el);
      if (el.classList.contains('sr-only')) return;
      if (cs.overflowX === 'hidden' && !el.classList.contains('truncate') && el.scrollWidth > el.clientWidth + 2)
        out.push({
          rule: 'overflow-x',
          panel: panelOf(el),
          text: txt(el).slice(0, 120),
          detail: `${el.scrollWidth - el.clientWidth} px`,
        });
    });
    // tables whose body overflows sideways are allowed (they scroll with a hint); flag cells that wrap mid-word
    document.querySelectorAll('td').forEach((td) => {
      if (!visible(td)) return;
      const cs = getComputedStyle(td);
      if (cs.wordBreak === 'break-all' || cs.overflowWrap === 'anywhere') return;
      const words = txt(td).split(' ');
      const longest = Math.max(0, ...words.map((w) => w.length));
      if (longest > 18 && td.scrollWidth > td.clientWidth + 2)
        out.push({ rule: 'cell-overflow', panel: panelOf(td), text: txt(td).slice(0, 80) });
    });
    // KPI cards: equal heights per row
    const strips = document.querySelectorAll('[data-testid="kpi-strip"]');
    strips.forEach((strip) => {
      const cards = Array.from(strip.querySelectorAll(':scope > article, :scope > div')).filter(visible);
      const rows = new Map<number, Element[]>();
      for (const c of cards) {
        const top = Math.round(c.getBoundingClientRect().top);
        rows.set(top, [...(rows.get(top) ?? []), c]);
      }
      for (const [, els] of rows) {
        const hs = els.map((e) => Math.round(e.getBoundingClientRect().height));
        if (Math.max(...hs) - Math.min(...hs) > 2)
          out.push({
            rule: 'kpi-row-height',
            panel: strip.getAttribute('aria-label') ?? 'Key indicators',
            text: hs.join(' / '),
            detail: `${els.length} cards`,
          });
      }
    });
    // duplicate legend / series names in one chart
    document.querySelectorAll('[data-chart]').forEach((c) => {
      const o = JSON.parse(c.getAttribute('data-chart') ?? '{}') as { s?: { name: string }[] };
      const names = (o.s ?? []).map((s) => s.name);
      const dup = names.filter((n, i) => names.indexOf(n) !== i);
      if (dup.length) out.push({ rule: 'duplicate-series', panel: panelOf(c), text: [...new Set(dup)].join(', ') });
    });
    // chip rows that overflow their card on phones (they scroll sideways on < sm; on sm+ they wrap)
    if (window.innerWidth >= 640)
      document.querySelectorAll('[role="group"][aria-label$=": variables"]').forEach((g) => {
        if (visible(g) && g.scrollWidth > g.clientWidth + 2)
          out.push({ rule: 'chips-overflow', panel: panelOf(g), text: g.getAttribute('aria-label') ?? '' });
      });
    // database variables: one chart per row at phone width
    if (window.innerWidth < 1024) {
      const charts = Array.from(document.querySelectorAll('[data-category-chart]')).filter(visible);
      const tops = new Map<number, number>();
      for (const c of charts) {
        const top = Math.round(c.getBoundingClientRect().top);
        tops.set(top, (tops.get(top) ?? 0) + 1);
      }
      for (const [top, n] of tops)
        if (n > 1)
          out.push({ rule: 'dbvars-columns', panel: 'Database variables', text: `${n} charts in one row at y=${top}` });
    }
    // the forecast divider only where values follow the as-of date is checked by the chart builder; here: a band without a divider
    // legend / scale bar / attribution overlap inside maps
    document.querySelectorAll('[data-testid="map"]').forEach((m) => {
      if (!visible(m)) return;
      const boxes = [
        ['legend', m.querySelector('[data-testid="map-legend"]')],
        ['scale', m.querySelector('.leaflet-control-scale')],
        ['attribution', m.querySelector('.leaflet-control-attribution')],
        ['zoom', m.querySelector('.leaflet-top.leaflet-right, .leaflet-bar')],
      ].filter(([, el]) => el && visible(el as Element)) as [string, Element][];
      for (let i = 0; i < boxes.length; i++)
        for (let j = i + 1; j < boxes.length; j++) {
          const a = boxes[i][1].getBoundingClientRect();
          const b = boxes[j][1].getBoundingClientRect();
          const ov = a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
          if (ov) out.push({ rule: 'map-overlap', panel: panelOf(m), text: `${boxes[i][0]} overlaps ${boxes[j][0]}` });
        }
    });
    return out;
  });
  return raw.map((r) => ({ route, width, theme, ...r }));
}

const slug = (p: string) => (p === '/' ? 'overview' : p.slice(1).replace(/[/?=&]/g, '_'));

async function main() {
  const arg = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
  const base = arg('base') ?? 'http://localhost:4176';
  const only = arg('only');
  const widths = (arg('widths') ?? '1440,1024,390').split(',').map(Number);
  const themes = (arg('themes') ?? 'light,dark').split(',');
  const outDir = resolve(arg('out') ?? 'tests/screenshots/audit');
  mkdirSync(outDir, { recursive: true });
  const routes = only ? ROUTES.filter((r) => r.startsWith(only)) : ROUTES;
  const browser = await chromium.launch();
  const issues: LayoutIssue[] = [];
  const errors: string[] = [];
  // one browser context per width × theme, three at a time (the backend answers from its cache)
  const combos = themes.flatMap((theme) => widths.map((width) => ({ theme, width })));
  const run = async ({ theme, width }: { theme: string; width: number }) => {
    const context = await browser.newContext({ viewport: { width, height: width < 600 ? 844 : 900 } });
    await context.addInitScript((t) => localStorage.setItem('niwis-theme', t), theme);
    for (const route of routes) {
      const page = await context.newPage();
      page.on('pageerror', (e) => errors.push(`${route}@${width}/${theme}: ${e.message}`));
      await page.goto(`${base}${route}`, { waitUntil: 'networkidle', timeout: 120_000 }).catch(() => undefined);
      await settle(page);
      const its = await layoutIssues(page, route, width, theme);
      issues.push(...its);
      await page.screenshot({ path: resolve(outDir, `${slug(route)}-${width}-${theme}.png`), fullPage: true });
      console.log(`${route} ${width} ${theme}: ${its.length} layout issues`);
      await page.close();
    }
    await context.close();
  };
  try {
    const queue = [...combos];
    await Promise.all(
      Array.from({ length: Math.min(2, queue.length) }, async () => {
        while (queue.length) await run(queue.shift()!);
      }),
    );
  } finally {
    await browser.close();
  }
  writeFileSync(resolve(outDir, 'layout-report.json'), JSON.stringify({ base, issues, errors }, null, 1));
  const byRule = new Map<string, number>();
  for (const i of issues) byRule.set(i.rule, (byRule.get(i.rule) ?? 0) + 1);
  console.log(`\n${issues.length} layout issues: ${[...byRule].map(([k, n]) => `${k} ${n}`).join(', ')}`);
  for (const i of issues)
    console.log(
      `${i.route} ${i.width} ${i.theme}  ${i.rule}  [${i.panel}] ${i.text}${i.detail ? ` — ${i.detail}` : ''}`,
    );
  if (errors.length) console.log(`page errors:\n  ${errors.join('\n  ')}`);
}

void main();
