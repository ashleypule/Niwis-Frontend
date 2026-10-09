import { createBrowserRouter, type RouteObject } from 'react-router';
import { Layout } from './Layout';
import { RouteError } from '@/components/feedback/RouteError';

/** One lazily-loaded chunk per module. */
const page = (load: () => Promise<{ default: React.ComponentType }>): Pick<RouteObject, 'lazy'> => ({
  lazy: async () => ({ Component: (await load()).default }),
});

const children: RouteObject[] = [
  { index: true, ...page(() => import('@/pages/overview/OverviewPage')) },
  { path: 'drought', ...page(() => import('@/pages/drought/DroughtPage')) },
  { path: 'drought/forecast', ...page(() => import('@/pages/drought/DroughtForecastPage')) },
  { path: 'climate', ...page(() => import('@/pages/climate/ClimatePage')) },
  { path: 'climate/forecast', ...page(() => import('@/pages/climate/ClimateForecastPage')) },
  { path: 'vegetation', ...page(() => import('@/pages/vegetation/VegetationPage')) },
  { path: 'vegetation/forecast', ...page(() => import('@/pages/vegetation/VegetationForecastPage')) },
  { path: 'rainfall', ...page(() => import('@/pages/rainfall/RainfallPage')) },
  { path: 'rainfall/forecast', ...page(() => import('@/pages/rainfall/RainfallForecastPage')) },
  { path: 'runoff', ...page(() => import('@/pages/runoff/RunoffPage')) },
  { path: 'runoff/forecast', ...page(() => import('@/pages/runoff/RunoffForecastPage')) },
  { path: 'dams', ...page(() => import('@/pages/dams/DamsPage')) },
  { path: 'dams/forecast', ...page(() => import('@/pages/dams/DamsForecastPage')) },
  { path: 'surface-water', ...page(() => import('@/pages/surface-water/SurfaceWaterPage')) },
  { path: 'surface-water/forecast', ...page(() => import('@/pages/surface-water/SurfaceWaterForecastPage')) },
  { path: 'groundwater', ...page(() => import('@/pages/groundwater/GroundwaterPage')) },
  { path: 'groundwater-reserve', ...page(() => import('@/pages/groundwater-reserve/GroundwaterReservePage')) },
  { path: 'water-quality', ...page(() => import('@/pages/water-quality/WaterQualityPage')) },
  { path: 'water-quality/forecast', ...page(() => import('@/pages/water-quality/WaterQualityForecastPage')) },
  { path: 'green-drop', ...page(() => import('@/pages/green-drop/GreenDropPage')) },
  { path: 'blue-drop', ...page(() => import('@/pages/blue-drop/BlueDropPage')) },
  { path: 'rwqo', ...page(() => import('@/pages/rwqo/RwqoPage')) },
  { path: 'iwrm', ...page(() => import('@/pages/iwrm/IwrmPage')) },
  { path: 'water-quantity', ...page(() => import('@/pages/water-quantity/WaterQuantityPage')) },
  { path: 'services', ...page(() => import('@/pages/services/ServicesPage')) },
  { path: 'services/forecast', ...page(() => import('@/pages/services/ServicesForecastPage')) },
  { path: 'tariffs', ...page(() => import('@/pages/tariffs/TariffsPage')) },
  { path: 'tariffs/forecast', ...page(() => import('@/pages/tariffs/TariffsForecastPage')) },
  { path: 'settlements', ...page(() => import('@/pages/settlements/SettlementsPage')) },
  { path: 'settlements/forecast', ...page(() => import('@/pages/settlements/SettlementsForecastPage')) },
  { path: 'ai', ...page(() => import('@/pages/ai/AiPage')) },
  { path: 'data-integration', ...page(() => import('@/pages/data-integration/DataIntegrationPage')) },
  { path: 'data-integration/report', ...page(() => import('@/pages/data-integration/DataIntegrationReportPage')) },
  { path: 'governance', ...page(() => import('@/pages/governance/GovernancePage')) },
  { path: 'roadmap', ...page(() => import('@/pages/roadmap/RoadmapPage')) },
  { path: 'alerts', ...page(() => import('@/pages/alerts/AlertsPage')) },
  { path: 'reports', ...page(() => import('@/pages/reports/ReportsPage')) },
  { path: 'reports/print', ...page(() => import('@/pages/reports/PrintReportPage')) },
  { path: 'dev/components', ...page(() => import('@/pages/dev/ComponentGallery')) },
  { path: '*', ...page(() => import('@/pages/NotFoundPage')) },
];

export const router = createBrowserRouter([{ path: '/', element: <Layout />, errorElement: <RouteError />, children }]);
