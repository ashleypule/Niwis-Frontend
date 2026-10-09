/** Module registries beyond the flagship pages. */
import type { ModuleHandlers } from '../build';
import { ai, dataIntegration, governance, roadmap } from './intel';
import { climate } from './climate';
import { rainfall, vegetation } from './vegrain';
import { runoff, surfaceWater } from './surface';
import { groundwater, groundwaterReserve } from './groundwater';
import { blueDrop, greenDrop, rwqo, waterQuality } from './quality';
import { iwrm, services, settlements, tariffs, waterQuantity } from './resources';

export const EXTRA_MODULES: Record<string, ModuleHandlers> = { roadmap, governance, ai, 'data-integration': dataIntegration, climate, vegetation, rainfall, runoff, 'surface-water': surfaceWater, groundwater, 'groundwater-reserve': groundwaterReserve, 'water-quality': waterQuality, 'green-drop': greenDrop, 'blue-drop': blueDrop, rwqo, iwrm, 'water-quantity': waterQuantity, services, tariffs, settlements };

// ------------------------------------------------------------------ alerts module (summary + location map)
import { allAlerts } from '../alerts';
import { kpi } from '../build';
import { pointsLayer } from '../common';

EXTRA_MODULES.alerts = {
  summary: () => {
    const a = allAlerts();
    const open = a.filter((x) => x.status === 'open');
    return [
      kpi('total', 'damAlerts', a.length, { label: 'Active Alerts', sublabel: 'All modules' }),
      kpi('critical', 'damAlerts', a.filter((x) => x.severity === 'critical').length, { label: 'Critical', sublabel: 'Immediate action' }),
      kpi('high', 'damAlerts', a.filter((x) => x.severity === 'high').length, { label: 'High' }),
      kpi('open', 'damAlerts', open.length, { label: 'Open', sublabel: 'Not yet acknowledged' }),
      kpi('modules', 'recordsIngested', new Set(a.map((x) => x.module)).size, { label: 'Modules Raising Alerts', unit: '' }),
      kpi('provinces', 'recordsIngested', new Set(a.map((x) => x.province)).size, { label: 'Provinces Affected', unit: '' }),
    ];
  },
  map: {
    locations: () => pointsLayer('locations', 'Alert severity', 'severity', '', allAlerts().filter((a) => a.lat != null).map((a) => ({ id: a.id, name: a.title, lat: a.lat!, lon: a.lon!, value: a.severity, size: a.severity === 'critical' ? 0.7 : 0.4, kind: a.module, sub: a.location }))),
  },
};
