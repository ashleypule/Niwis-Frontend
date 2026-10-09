import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

/** Page components by path, for the print / report renderer. */
export const PAGE_COMPONENTS: Record<string, LazyExoticComponent<ComponentType>> = {
  '/': lazy(() => import('@/pages/overview/OverviewPage')),
  '/drought': lazy(() => import('@/pages/drought/DroughtPage')),
  '/drought/forecast': lazy(() => import('@/pages/drought/DroughtForecastPage')),
  '/climate': lazy(() => import('@/pages/climate/ClimatePage')),
  '/climate/forecast': lazy(() => import('@/pages/climate/ClimateForecastPage')),
  '/vegetation': lazy(() => import('@/pages/vegetation/VegetationPage')),
  '/vegetation/forecast': lazy(() => import('@/pages/vegetation/VegetationForecastPage')),
  '/rainfall': lazy(() => import('@/pages/rainfall/RainfallPage')),
  '/rainfall/forecast': lazy(() => import('@/pages/rainfall/RainfallForecastPage')),
  '/runoff': lazy(() => import('@/pages/runoff/RunoffPage')),
  '/runoff/forecast': lazy(() => import('@/pages/runoff/RunoffForecastPage')),
  '/dams': lazy(() => import('@/pages/dams/DamsPage')),
  '/dams/forecast': lazy(() => import('@/pages/dams/DamsForecastPage')),
  '/surface-water': lazy(() => import('@/pages/surface-water/SurfaceWaterPage')),
  '/surface-water/forecast': lazy(() => import('@/pages/surface-water/SurfaceWaterForecastPage')),
  '/groundwater': lazy(() => import('@/pages/groundwater/GroundwaterPage')),
  '/groundwater-reserve': lazy(() => import('@/pages/groundwater-reserve/GroundwaterReservePage')),
  '/water-quality': lazy(() => import('@/pages/water-quality/WaterQualityPage')),
  '/water-quality/forecast': lazy(() => import('@/pages/water-quality/WaterQualityForecastPage')),
  '/green-drop': lazy(() => import('@/pages/green-drop/GreenDropPage')),
  '/blue-drop': lazy(() => import('@/pages/blue-drop/BlueDropPage')),
  '/rwqo': lazy(() => import('@/pages/rwqo/RwqoPage')),
  '/iwrm': lazy(() => import('@/pages/iwrm/IwrmPage')),
  '/water-quantity': lazy(() => import('@/pages/water-quantity/WaterQuantityPage')),
  '/services': lazy(() => import('@/pages/services/ServicesPage')),
  '/services/forecast': lazy(() => import('@/pages/services/ServicesForecastPage')),
  '/tariffs': lazy(() => import('@/pages/tariffs/TariffsPage')),
  '/tariffs/forecast': lazy(() => import('@/pages/tariffs/TariffsForecastPage')),
  '/settlements': lazy(() => import('@/pages/settlements/SettlementsPage')),
  '/settlements/forecast': lazy(() => import('@/pages/settlements/SettlementsForecastPage')),
  '/ai': lazy(() => import('@/pages/ai/AiPage')),
  '/data-integration': lazy(() => import('@/pages/data-integration/DataIntegrationPage')),
  '/governance': lazy(() => import('@/pages/governance/GovernancePage')),
  '/roadmap': lazy(() => import('@/pages/roadmap/RoadmapPage')),
  '/alerts': lazy(() => import('@/pages/alerts/AlertsPage')),
};

export interface StandardReport {
  id: string;
  title: string;
  description: string;
  pages: string[];
  cadence: string;
}

export const STANDARD_REPORTS: StandardReport[] = [
  { id: 'drought-bulletin', title: 'Monthly National Drought Bulletin', description: 'Drought classification (D0–D4), SPI/SPEI, cascade, outlook and affected settlements.', pages: ['/drought', '/drought/forecast', '/settlements'], cadence: 'Monthly' },
  { id: 'dam-status', title: 'Weekly Dam Status Report', description: 'Storage of the 151 major dams, inflows/outflows, alerts and 12-month outlook.', pages: ['/dams', '/dams/forecast'], cadence: 'Weekly (Monday)' },
  { id: 'hydro-climate', title: 'Hydro-Climate Situation Report', description: 'Rainfall, runoff, surface water and vegetation condition.', pages: ['/rainfall', '/runoff', '/surface-water', '/vegetation'], cadence: 'Monthly' },
  { id: 'groundwater', title: 'Groundwater Status & Reserve Report', description: 'Borehole levels, SGI, recharge vs abstraction and aquifer reserve accounting.', pages: ['/groundwater', '/groundwater-reserve'], cadence: 'Quarterly' },
  { id: 'green-drop', title: 'Green Drop Summary (Wastewater)', description: 'WWTW compliance bands, effluent quality and receiving water impact.', pages: ['/green-drop'], cadence: 'Quarterly' },
  { id: 'blue-drop', title: 'Blue Drop Summary (Drinking Water)', description: 'Water supply system compliance against SANS 241.', pages: ['/blue-drop'], cadence: 'Quarterly' },
  { id: 'water-quality', title: 'Resource Water Quality Report', description: 'WQI, hotspots and RWQO compliance.', pages: ['/water-quality', '/rwqo'], cadence: 'Quarterly' },
  { id: 'iwrm', title: 'National Water Balance & IWRM Report', description: 'Water balance, availability vs demand, transfers and stressed catchments.', pages: ['/iwrm', '/water-quantity'], cadence: 'Annual' },
  { id: 'services', title: 'Water Services & Tariffs Report', description: 'Access, NRW, reliability, tariffs and affordability by municipality.', pages: ['/services', '/tariffs'], cadence: 'Annual' },
  { id: 'climate', title: 'Climate Change Indicators Report', description: 'Long-term trends, extremes and RCP projections to 2100.', pages: ['/climate', '/climate/forecast'], cadence: 'Annual' },
  { id: 'platform', title: 'NIWIS Platform Status Report', description: 'Data integration, quality, governance and programme progress.', pages: ['/data-integration', '/governance', '/roadmap'], cadence: 'Quarterly' },
];
