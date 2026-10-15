import type { ModuleId } from '@/config/modules';
import { useEntities } from '@/api/queries/core';
import { useUi } from '@/store/filters';
import { isLive } from '@/config/app';

/** What the page's selectable entity is called: live modules serve districts, the sample data stations. */
export const entityNoun = (module: ModuleId, sample = 'Station'): string => (isLive(module) ? 'District' : sample);

/** The page entity: the filter-bar / map selection, or the first (largest / most relevant) entity in scope. */
export function useSelectedEntity(module: ModuleId): {
  id: string | undefined;
  name: string | undefined;
  explicit: boolean;
  /** the entity list: panels that need an entity show its error instead of waiting forever */
  list: ReturnType<typeof useEntities>;
} {
  const entity = useUi((s) => s.filters.entity);
  const list = useEntities(module, { limit: 500 });
  const items = list.data?.items ?? [];
  const found = entity ? items.find((e) => e.id === entity) : undefined;
  if (entity) return { id: entity, name: found?.name, explicit: true, list };
  return { id: items[0]?.id, name: items[0]?.name, explicit: false, list };
}
