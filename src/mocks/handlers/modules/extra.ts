/** Remaining module registries are added here as they are built. */
import type { ModuleHandlers } from '../build';
import { governance, roadmap } from './platform';

export const EXTRA_MODULES: Record<string, ModuleHandlers> = { roadmap, governance };
