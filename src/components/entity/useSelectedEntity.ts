import type { ModuleId } from '@/config/modules';
import { useEntities } from '@/api/queries/core';
import { useUi } from '@/store/filters';

/** The page entity: the filter-bar / map selection, or the first (largest / most relevant) entity in scope. */
export function useSelectedEntity(module: ModuleId): { id: string | undefined; name: string | undefined; explicit: boolean } {
  const entity = useUi((s) => s.filters.entity);
  const list = useEntities(module, { limit: 500 });
  const items = list.data?.items ?? [];
  const found = entity ? items.find((e) => e.id === entity) : undefined;
  if (entity) return { id: entity, name: found?.name, explicit: true };
  return { id: items[0]?.id, name: items[0]?.name, explicit: false };
}
