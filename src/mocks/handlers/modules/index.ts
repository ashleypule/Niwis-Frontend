/** Module registry for the mock API, plus alert providers and search sources derived from module data. */
import { DROUGHT_RANK, droughtClassFromSpi } from '@/config/thresholds';
import { formatNumber } from '@/lib/format';
import type { ModuleHandlers } from '../build';
import { registerAlertProvider } from '../alerts';
import { registerSearchSource } from '../reference';
import { MUNICIPALITIES, provinceName } from '../../reference/regions';
import { DAMS, damNow } from '../../generators/dams';
import { BOREHOLES, boreholeNow } from '../../generators/groundwater';
import { SETTLEMENTS, settlementNow } from '../../generators/settlements';
import { WQ_STATIONS, wqNow } from '../../generators/quality';
import { LAST } from '../../generators/hydromet';
import { drought, muniSpi } from './drought';
import { dams } from './dams';
import { overview } from './overview';
import { EXTRA_MODULES } from './extra';

export const MODULE_HANDLERS: Record<string, ModuleHandlers> = {
  overview,
  drought,
  dams,
  ...EXTRA_MODULES,
};

// ------------------------------------------------------------------ alerts derived from data
registerAlertProvider(() =>
  DAMS.filter((d) => d.capacity >= 20)
    .map((d) => ({ d, n: damNow(d.id) }))
    .filter(({ n }) => n.alert !== 'None')
    .map(({ d, n }) => ({
      id: `dam-${d.id}-${n.alert}`,
      module: 'dams',
      severity: n.alert === 'L3' ? ('critical' as const) : n.alert === 'L2' ? ('high' as const) : ('moderate' as const),
      title: `${d.name} Dam at ${formatNumber(n.pct, 1)}% FSC (Level ${n.alert.slice(1)})`,
      message: `Storage below the Level ${n.alert.slice(1)} threshold (spec §8.2). ${n.daysToEmpty ? `≈ ${n.daysToEmpty} days to empty at current draw-down.` : 'Dam is currently filling.'}`,
      location: d.province === 'LS' ? 'Lesotho Highlands' : provinceName(d.province),
      province: d.province,
      entityId: d.id,
      lat: d.lat,
      lon: d.lon,
    })),
);

registerAlertProvider(() =>
  MUNICIPALITIES.map((m) => ({ m, spi: muniSpi(m.id, 6, LAST) ?? 0 }))
    .filter(({ spi }) => DROUGHT_RANK[droughtClassFromSpi(spi)] >= DROUGHT_RANK.D3)
    .sort((a, b) => a.spi - b.spi)
    .slice(0, 18)
    .map(({ m, spi }) => ({
      id: `drought-${m.id}-${droughtClassFromSpi(spi)}`,
      module: 'drought',
      severity: droughtClassFromSpi(spi) === 'D4' ? ('critical' as const) : ('high' as const),
      title: `${droughtClassFromSpi(spi)} drought in ${m.name}`,
      message: `SPI-6 = ${spi.toFixed(2)} (${droughtClassFromSpi(spi) === 'D4' ? 'exceptional' : 'extreme'} drought, spec §3.4).`,
      location: `${m.name}, ${provinceName(m.province)}`,
      province: m.province,
      lat: m.lat,
      lon: m.lon,
    })),
);

registerAlertProvider(() =>
  SETTLEMENTS.map((s) => ({ s, n: settlementNow(s.id) }))
    .filter(({ n }) => n.risk === 'Very High')
    .map(({ s, n }) => ({
      id: `set-${s.id}`,
      module: 'settlements',
      severity: 'high' as const,
      title: `Very high drought risk – ${s.name}`,
      message: `Exposure ${n.exposure.toFixed(2)}, supply reliability ${n.reliability}%. Response: ${n.status}.`,
      location: provinceName(s.province),
      province: s.province,
      entityId: s.id,
      lat: s.lat,
      lon: s.lon,
    })),
);

registerAlertProvider(() =>
  BOREHOLES.map((b) => ({ b, n: boreholeNow(b.id) }))
    .filter(({ n }) => n.status === 'Critical')
    .sort((a, b) => a.n.sgi - b.n.sgi)
    .slice(0, 10)
    .map(({ b, n }) => ({
      id: `gw-${b.id}`,
      module: 'groundwater',
      severity: 'moderate' as const,
      title: `Groundwater drought at ${b.id} (SGI ${n.sgi.toFixed(2)})`,
      message: `Level ${formatNumber(n.level, 1)} m bgl, ${formatNumber(Math.abs(n.anomaly), 1)} m ${n.anomaly < 0 ? 'deeper' : 'shallower'} than the long-term mean.`,
      location: `${b.aquifer.name}, ${provinceName(b.province)}`,
      province: b.province,
      entityId: b.id,
      lat: b.lat,
      lon: b.lon,
    })),
);

registerAlertProvider(() =>
  WQ_STATIONS.map((s) => ({ s, n: wqNow(s.id) }))
    .filter(({ n }) => n.latest.ecoli > 8000 || n.latest.ph < 5)
    .sort((a, b) => b.n.latest.ecoli - a.n.latest.ecoli)
    .slice(0, 12)
    .map(({ s, n }) => ({
      id: `wq-${s.id}`,
      module: 'water-quality',
      severity: n.latest.ph < 5 ? ('high' as const) : n.latest.ecoli > 20000 ? ('critical' as const) : ('high' as const),
      title: n.latest.ph < 5 ? `Acidic water (pH ${n.latest.ph}) – ${s.river}` : `E. coli ${formatNumber(n.latest.ecoli, 0)} cfu/100 mL – ${s.river}`,
      message: `${s.name}: ${n.exceedances.length} parameter(s) outside guideline. Source pressure: ${s.source}.`,
      location: provinceName(s.province),
      province: s.province,
      entityId: s.id,
      lat: s.lat,
      lon: s.lon,
    })),
);

// ------------------------------------------------------------------ search sources
registerSearchSource(() => DAMS.map((d) => ({ type: 'dam', id: d.id, label: `${d.name} Dam`, sublabel: `${d.river} River · ${d.province === 'LS' ? 'Lesotho' : provinceName(d.province)}`, path: '/dams', params: { entity: d.id } })));
registerSearchSource(() => BOREHOLES.map((b) => ({ type: 'borehole', id: b.id, label: b.id, sublabel: `${b.aquifer.name} · ${provinceName(b.province)}`, path: '/groundwater', params: { entity: b.id } })));
registerSearchSource(() => SETTLEMENTS.map((s) => ({ type: 'settlement', id: s.id, label: s.name, sublabel: provinceName(s.province), path: '/settlements', params: { entity: s.id } })));
