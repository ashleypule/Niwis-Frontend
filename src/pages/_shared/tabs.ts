import type { PanelTab } from '@/components/charts/panels';

/** "South Africa | province …" tabs used by forecast charts; params override the global scope filter. */
export const PROVINCE_TABS: PanelTab[] = [
  { value: 'za', label: 'South Africa', params: { province: '' } },
  { value: 'WC', label: 'Western Cape', params: { province: 'WC' } },
  { value: 'EC', label: 'Eastern Cape', params: { province: 'EC' } },
  { value: 'NC', label: 'Northern Cape', params: { province: 'NC' } },
  { value: 'FS', label: 'Free State', params: { province: 'FS' } },
  { value: 'GP', label: 'Gauteng', params: { province: 'GP' } },
  { value: 'KZN', label: 'KwaZulu-Natal', params: { province: 'KZN' } },
];
