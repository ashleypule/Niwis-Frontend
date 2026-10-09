/** Module registries beyond the flagship pages. */
import type { ModuleHandlers } from '../build';
import { governance, roadmap } from './platform';
import { climate } from './climate';
import { rainfall, vegetation } from './vegrain';
import { runoff, surfaceWater } from './surface';
import { groundwater, groundwaterReserve } from './groundwater';
import { blueDrop, greenDrop, rwqo, waterQuality } from './quality';

export const EXTRA_MODULES: Record<string, ModuleHandlers> = { roadmap, governance, climate, vegetation, rainfall, runoff, 'surface-water': surfaceWater, groundwater, 'groundwater-reserve': groundwaterReserve, 'water-quality': waterQuality, 'green-drop': greenDrop, 'blue-drop': blueDrop, rwqo };
