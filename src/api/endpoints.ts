/** Every backend endpoint path in one place. See docs/API_CONTRACT.md. */
export const API_PREFIX = '/api/v1';

export const endpoints = {
  summary: (module: string) => `${API_PREFIX}/${module}/summary`,
  timeseries: (module: string) => `${API_PREFIX}/${module}/timeseries`,
  forecast: (module: string) => `${API_PREFIX}/${module}/forecast`,
  breakdown: (module: string) => `${API_PREFIX}/${module}/breakdown`,
  table: (module: string) => `${API_PREFIX}/${module}/table`,
  matrix: (module: string) => `${API_PREFIX}/${module}/matrix`,
  map: (module: string) => `${API_PREFIX}/${module}/map`,
  entities: (module: string) => `${API_PREFIX}/${module}/entities`,
  entity: (module: string, id: string) => `${API_PREFIX}/${module}/entities/${encodeURIComponent(id)}`,
  /** database catalogue: tables → chart groups → columns */
  categories: (module: string) => `${API_PREFIX}/${module}/categories`,
  /** one chart group's series (`vars` = column names, `all`, or absent = the group's defaultVisible) */
  category: (module: string, tableId: string, groupId: string) =>
    `${API_PREFIX}/${module}/category/${encodeURIComponent(tableId)}/${encodeURIComponent(groupId)}`,
  alerts: () => `${API_PREFIX}/alerts`,
  reference: (type: 'provinces' | 'wmas' | 'catchments' | 'municipalities' | string) =>
    `${API_PREFIX}/reference/${type}`,
  search: () => `${API_PREFIX}/search`,
} as const;

export type DatasetKind = 'timeseries' | 'forecast' | 'breakdown' | 'table' | 'matrix';
