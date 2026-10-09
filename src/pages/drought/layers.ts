import type { PointLayerDef, ThematicLayer } from '@/components/map/MapPanel';

export const DROUGHT_LAYERS: ThematicLayer[] = [
  { id: 'drought-class', label: 'Drought classification (D0–D4, SPI-6)' },
  { id: 'municipal-class', label: 'Drought class by municipality' },
  { id: 'spi1', label: 'SPI-1' },
  { id: 'spi3', label: 'SPI-3' },
  { id: 'spi6', label: 'SPI-6' },
  { id: 'spi12', label: 'SPI-12' },
  { id: 'spi24', label: 'SPI-24' },
  { id: 'spei3', label: 'SPEI-3' },
  { id: 'spei12', label: 'SPEI-12' },
  { id: 'rain-anomaly', label: 'Rainfall anomaly (3 months)' },
  { id: 'soil-moisture', label: 'Surface soil moisture' },
  { id: 'ndvi', label: 'Vegetation (NDVI)' },
  { id: 'vci', label: 'Vegetation Condition Index' },
];

export const DROUGHT_POINTS: PointLayerDef[] = [
  { id: 'dams', label: 'Dams / reservoirs (% FSC)', module: 'drought', layer: 'dams' },
  { id: 'boreholes', label: 'Groundwater stations (SGI)', module: 'drought', layer: 'boreholes', shape: 'square' },
  { id: 'settlements', label: 'Drought-affected settlements', module: 'drought', layer: 'settlements', shape: 'triangle' },
];
