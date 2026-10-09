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
