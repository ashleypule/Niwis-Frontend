import { useMemo } from 'react';
import { useUi } from '@/store/filters';
import { COLORS } from '@/config/palettes';

export interface ChartTheme {
  dark: boolean;
  text: string;
  text2: string;
  axis: string;
  grid: string;
  surface: string;
  border: string;
  primary: string;
  good: string;
  bad: string;
  series: readonly string[];
}

const LIGHT: ChartTheme = {
  dark: false,
  text: '#13233A',
  text2: '#3D4F66',
  axis: '#5B6B80',
  grid: '#E6ECF2',
  surface: '#FFFFFF',
  border: '#DBE3EC',
  primary: '#1565C0',
  good: '#1B7F3B',
  bad: '#C62828',
  series: COLORS.series,
};

const DARK: ChartTheme = {
  dark: true,
  text: '#E7EEF7',
  text2: '#C4D2E3',
  axis: '#93A6BF',
  grid: '#22334E',
  surface: '#132036',
  border: '#24395A',
  primary: '#5AA2F0',
  good: '#5CC786',
  bad: '#FF7B7B',
  series: ['#5AA2F0', '#FF8A65', '#5CC786', '#C792EA', '#FFD54F', '#4DD0E1', '#BCAAA4', '#F48FB1', '#90A4AE'],
};

export function useChartTheme(): ChartTheme {
  const theme = useUi((s) => s.theme);
  return useMemo(() => (theme === 'dark' ? DARK : LIGHT), [theme]);
}

export const chartThemes = { LIGHT, DARK };
