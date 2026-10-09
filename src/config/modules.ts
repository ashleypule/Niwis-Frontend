/** Navigation / module registry — single source for sidebar, routes, hero banner and search. */
import {
  AlertTriangle,
  BarChart3,
  BrainCircuit,
  CloudRain,
  Coins,
  Database,
  Droplets,
  FileText,
  FlaskConical,
  Gauge,
  GlassWater,
  House,
  Landmark,
  Layers,
  Leaf,
  Map as MapIcon,
  Mountain,
  Recycle,
  Route,
  ShieldCheck,
  Sun,
  Thermometer,
  Waves,
  Wrench,
  type LucideIcon,
} from 'lucide-react';

export type ModuleId =
  | 'overview'
  | 'drought'
  | 'climate'
  | 'vegetation'
  | 'rainfall'
  | 'runoff'
  | 'dams'
  | 'surface-water'
  | 'groundwater'
  | 'groundwater-reserve'
  | 'water-quality'
  | 'green-drop'
  | 'blue-drop'
  | 'rwqo'
  | 'iwrm'
  | 'water-quantity'
  | 'services'
  | 'tariffs'
  | 'settlements'
  | 'ai'
  | 'data-integration'
  | 'governance'
  | 'roadmap'
  | 'alerts'
  | 'reports';

export type PeriodPreset = 'latest' | '1M' | '3M' | '6M' | '12M' | '24M' | '5Y' | '10Y' | 'historical';

export type GroupId = 'Monitoring' | 'Water Quality & Compliance' | 'Resource Management' | 'Services & Economics' | 'Intelligence' | 'Platform';

/** Page-specific entity selector shown in the filter bar. */
export interface PageSelector {
  key: 'dam' | 'station' | 'borehole' | 'aquifer' | 'wwtw' | 'wss' | 'wqStation' | 'settlement' | 'rwqoSite' | 'municipality';
  label: string;
}

export interface ModuleDef {
  id: ModuleId;
  path: string;
  label: string;
  /** short label for the quick-access bar */
  short: string;
  group: GroupId | null;
  icon: LucideIcon;
  /** hero banner subtitle keywords */
  keywords: string[];
  hasForecast: boolean;
  presets: PeriodPreset[];
  selector?: PageSelector;
  /** spec sections this module implements */
  spec: string;
}

const STD: PeriodPreset[] = ['latest', '1M', '3M', '6M', '12M', '24M', 'historical'];
const CLIMATE: PeriodPreset[] = ['12M', '5Y', '10Y', 'historical'];

export const MODULES: ModuleDef[] = [
  { id: 'overview', path: '/', label: 'National Overview', short: 'Overview', group: null, icon: House, keywords: ['National command centre', 'Real-time monitoring', 'Early warning', 'Forecasting', 'Decision support'], hasForecast: false, presets: STD, spec: '§1–2' },
  { id: 'drought', path: '/drought', label: 'Drought Status Monitoring', short: 'Drought', group: 'Monitoring', icon: Sun, keywords: ['National drought intelligence', 'D0–D4 classification', 'Drought cascade', 'Early warning'], hasForecast: true, presets: STD, spec: '§3' },
  { id: 'climate', path: '/climate', label: 'Climate Change Indicators', short: 'Climate', group: 'Monitoring', icon: Thermometer, keywords: ['Long-term climate trends', 'Extremes', 'Impacts on water resources', '1960 – present'], hasForecast: true, presets: CLIMATE, spec: '§4' },
  { id: 'vegetation', path: '/vegetation', label: 'Vegetation Condition', short: 'Vegetation', group: 'Monitoring', icon: Leaf, keywords: ['Vegetation health', 'Drought impact', 'Ecosystem status', 'Early warning'], hasForecast: true, presets: STD, spec: '§5' },
  { id: 'rainfall', path: '/rainfall', label: 'Rainfall Status Monitoring', short: 'Rainfall', group: 'Monitoring', icon: CloudRain, keywords: ['Real-time rainfall', 'Anomalies', 'Intensity', 'SPI / SPEI', 'Spatial distribution'], hasForecast: true, presets: STD, selector: { key: 'station', label: 'Select Station' }, spec: '§6' },
  { id: 'runoff', path: '/runoff', label: 'Runoff Status Monitoring', short: 'Runoff', group: 'Monitoring', icon: Waves, keywords: ['Catchment runoff', 'Streamflow response', 'Hydrological balance', 'Flood & drought risk'], hasForecast: true, presets: STD, selector: { key: 'station', label: 'Select Station' }, spec: '§7' },
  { id: 'dams', path: '/dams', label: 'Dam & Reservoir Status', short: 'Dams', group: 'Monitoring', icon: Landmark, keywords: ['Storage levels', 'Inflows & outflows', 'Operational status', 'Forecasts', 'National coverage'], hasForecast: true, presets: STD, selector: { key: 'dam', label: 'Select Dam / Reservoir' }, spec: '§8' },
  { id: 'surface-water', path: '/surface-water', label: 'Surface Water Monitoring', short: 'Surface Water', group: 'Monitoring', icon: Route, keywords: ['River flow', 'Water level', 'Gauging stations', 'Sediment', 'Real-time monitoring'], hasForecast: true, presets: STD, selector: { key: 'station', label: 'Select Gauging Station' }, spec: '§9' },
  { id: 'groundwater', path: '/groundwater', label: 'Groundwater Level Monitoring', short: 'Groundwater', group: 'Monitoring', icon: Droplets, keywords: ['Borehole levels', 'Aquifer status', 'Recharge', 'Abstraction', 'Water security'], hasForecast: false, presets: STD, selector: { key: 'borehole', label: 'Select Borehole' }, spec: '§10' },
  { id: 'groundwater-reserve', path: '/groundwater-reserve', label: 'Groundwater Reserve Assessment', short: 'GW Reserve', group: 'Monitoring', icon: Mountain, keywords: ['Aquifer reserves', 'Sustainable yield', 'Abstraction', 'Reserve categories', 'Water security'], hasForecast: false, presets: ['latest', '12M', '5Y', '10Y', 'historical'], selector: { key: 'aquifer', label: 'Select Aquifer' }, spec: '§11' },
  { id: 'water-quality', path: '/water-quality', label: 'Water Quality Monitoring', short: 'Water Quality', group: 'Water Quality & Compliance', icon: FlaskConical, keywords: ['Physical, chemical & biological parameters', 'Surface & groundwater', 'SANS 241 compliance'], hasForecast: true, presets: STD, selector: { key: 'wqStation', label: 'Select Station' }, spec: '§12' },
  { id: 'green-drop', path: '/green-drop', label: 'Wastewater Compliance (Green Drop)', short: 'Green Drop', group: 'Water Quality & Compliance', icon: Recycle, keywords: ['WWTW performance', 'Effluent quality', 'Treatment capacity', 'Receiving water impact'], hasForecast: false, presets: STD, selector: { key: 'wwtw', label: 'Select WWTW' }, spec: '§13' },
  { id: 'blue-drop', path: '/blue-drop', label: 'Drinking Water Compliance (Blue Drop)', short: 'Blue Drop', group: 'Water Quality & Compliance', icon: GlassWater, keywords: ['Water supply systems', 'Treatment plants', 'SANS 241', 'Public health'], hasForecast: false, presets: STD, selector: { key: 'wss', label: 'Select Water Supply System' }, spec: '§14' },
  { id: 'rwqo', path: '/rwqo', label: 'Resource Water Quality Objectives (RWQO)', short: 'RWQO', group: 'Water Quality & Compliance', icon: ShieldCheck, keywords: ['Ecological condition', 'Resource Directed Measures', 'Ecological Reserve', 'Catchment objectives'], hasForecast: false, presets: STD, selector: { key: 'rwqoSite', label: 'Select Site' }, spec: '§15' },
  { id: 'iwrm', path: '/iwrm', label: 'Water Resource Management (IWRM)', short: 'IWRM', group: 'Resource Management', icon: Layers, keywords: ['Availability', 'Demand', 'National water balance', 'Ecological reserve', 'Transfers'], hasForecast: false, presets: ['12M', '5Y', '10Y', 'historical'], spec: '§16' },
  { id: 'water-quantity', path: '/water-quantity', label: 'Water Quantity Assessment', short: 'Quantity', group: 'Resource Management', icon: Gauge, keywords: ['Surface storage', 'River flows', 'Groundwater', 'Inter-basin transfers', 'Allocation'], hasForecast: false, presets: STD, spec: '§17' },
  { id: 'services', path: '/services', label: 'Water Services & Infrastructure', short: 'Services', group: 'Services & Economics', icon: Wrench, keywords: ['Access & coverage', 'Infrastructure', 'Non-revenue water', 'Supply reliability'], hasForecast: true, presets: ['latest', '3M', '12M', '24M', '5Y'], selector: { key: 'municipality', label: 'Select Municipality / WSA' }, spec: '§18' },
  { id: 'tariffs', path: '/tariffs', label: 'Water Tariffs & Raw Water Pricing', short: 'Tariffs', group: 'Services & Economics', icon: Coins, keywords: ['Raw water pricing', 'Municipal tariffs', 'Affordability', 'Cost recovery'], hasForecast: true, presets: ['12M', '24M', '5Y', '10Y'], selector: { key: 'municipality', label: 'Select Municipality / WSA' }, spec: '§19' },
  { id: 'settlements', path: '/settlements', label: 'Drought-Affected Settlements', short: 'Settlements', group: 'Services & Economics', icon: AlertTriangle, keywords: ['Vulnerability', 'Supply reliability', 'Alternative supply', 'Response'], hasForecast: true, presets: STD, selector: { key: 'settlement', label: 'Select Settlement' }, spec: '§20' },
  { id: 'ai', path: '/ai', label: 'AI & Predictive Analytics', short: 'AI Analytics', group: 'Intelligence', icon: BrainCircuit, keywords: ['Machine learning', 'Forecasting', 'Early warning', 'Scenario analysis'], hasForecast: false, presets: ['3M', '6M', '12M', '24M'], spec: '§22' },
  { id: 'alerts', path: '/alerts', label: 'Alerts & Early Warnings', short: 'Alerts', group: 'Intelligence', icon: BarChart3, keywords: ['Unified alerts', 'All modules', 'Acknowledge & assign'], hasForecast: false, presets: ['latest', '1M', '3M', '12M'], spec: '§2.2' },
  { id: 'data-integration', path: '/data-integration', label: 'Data Integration', short: 'Integration', group: 'Platform', icon: Database, keywords: ['Data sources', 'Ingestion pipelines', 'Processing & fusion', 'Interoperability'], hasForecast: false, presets: ['latest', '1M', '3M', '12M'], spec: '§21' },
  { id: 'governance', path: '/governance', label: 'Data Governance & QA', short: 'Governance', group: 'Platform', icon: ShieldCheck, keywords: ['Quality assurance', 'Metadata', 'Standards', 'Access control', 'POPIA'], hasForecast: false, presets: ['latest', '1M', '3M', '12M'], spec: '§23' },
  { id: 'roadmap', path: '/roadmap', label: 'Implementation Roadmap', short: 'Roadmap', group: 'Platform', icon: MapIcon, keywords: ['36-month programme', 'Phases & milestones', 'Budget', 'Risks'], hasForecast: false, presets: ['latest'], spec: '§24' },
  { id: 'reports', path: '/reports', label: 'Reports & Downloads', short: 'Reports', group: 'Platform', icon: FileText, keywords: ['Standard reports', 'Report builder', 'Data export'], hasForecast: false, presets: ['latest', '1M', '3M', '12M'], spec: '§21.4' },
];

/** Sidebar order follows the build prompt; alerts sits with Intelligence. */
export const NAV_GROUPS: (GroupId | null)[] = [null, 'Monitoring', 'Water Quality & Compliance', 'Resource Management', 'Services & Economics', 'Intelligence', 'Platform'];

export function moduleById(id: ModuleId): ModuleDef {
  return MODULES.find((m) => m.id === id)!;
}

export function moduleForPath(pathname: string): ModuleDef {
  if (pathname === '/' || pathname === '') return MODULES[0];
  const seg = pathname.split('/')[1];
  return MODULES.find((m) => m.path === `/${seg}`) ?? MODULES[0];
}

export const PRESET_LABEL: Record<PeriodPreset, string> = {
  latest: 'Latest',
  '1M': '1M',
  '3M': '3M',
  '6M': '6M',
  '12M': '12M',
  '24M': '24M',
  '5Y': '5Y',
  '10Y': '10Y',
  historical: 'Historical',
};

