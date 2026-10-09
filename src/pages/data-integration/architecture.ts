import { BarChart3, Cloud, Cog, Database, Server } from 'lucide-react';
import type { FlowColumn } from '@/components/viz/FlowDiagram';

/** Five-stage data integration architecture (spec §21). */
export const PIPELINE: FlowColumn[] = [
  {
    title: 'Data sources',
    color: '#1565C0',
    icon: Cloud,
    items: [
      { title: 'Hydro-meteorological', lines: ['SAWS stations (800+)', 'DWS Hydstra / telemetry', 'Satellite rainfall (CHIRPS, TAMSAT)'] },
      { title: 'Surface & groundwater', lines: ['Rivers, dams, reservoirs', 'NGA boreholes', 'Water quality labs (NWQMS)'] },
      { title: 'Services & infrastructure', lines: ['Municipalities / WSAs (WSNIS)', 'Water boards, TCTA'] },
      { title: 'Socio-economic & spatial', lines: ['Stats SA census & GHS', 'SANBI, SANSA land cover'] },
      { title: 'External & research', lines: ['WRC, universities', 'NASA GRACE-FO, NOAA ENSO'] },
    ],
  },
  {
    title: 'Ingestion layer',
    color: '#2E7D32',
    icon: Server,
    items: [
      { title: 'Real-time streaming', lines: ['MQTT IoT broker, REST APIs', 'Telemetry (15-min)'] },
      { title: 'Batch ingestion', lines: ['CSV, FTP / THREDDS / S3', 'Municipal monthly returns'] },
      { title: 'Automated ETL / ELT', lines: ['Cleaning, transformation', 'Standardisation (WaterML, NetCDF)'] },
      { title: 'Metadata harvesting', lines: ['ISO 19115 catalogue', 'Lineage & provenance'] },
    ],
  },
  {
    title: 'Processing & fusion',
    color: '#7B1FA2',
    icon: Cog,
    items: [
      { title: 'Quality control', lines: ['Range, rate-of-change, spatial checks', 'Gap flagging (> 3 days)'] },
      { title: 'Harmonisation', lines: ['Units, datums, temporal resampling'] },
      { title: 'Data fusion', lines: ['Raster–vector (PostGIS)', 'Catchment aggregation'] },
      { title: 'Index computation', lines: ['SPI, SPEI, VCI, VHI, SSI, SGI'] },
    ],
  },
  {
    title: 'Central data platform',
    color: '#0D47A1',
    icon: Database,
    items: [
      { title: 'Data lake (S3 / HDFS)', lines: ['Versioned historical archive'] },
      { title: 'Time-series database', lines: ['Operational (2-year hot store)'] },
      { title: 'Spatial database (PostGIS)', lines: ['Boundaries, grids, assets'] },
      { title: 'Analytics & ML environment', lines: ['Model training and serving'] },
    ],
  },
  {
    title: 'Outputs & services',
    color: '#C74300',
    icon: BarChart3,
    items: [
      { title: 'Dashboards', lines: ['NIWIS portal (desktop & mobile)'] },
      { title: 'API gateway', lines: ['REST / GraphQL, OAuth 2.0'] },
      { title: 'Alerts & reports', lines: ['SMS, e-mail, PDF bulletins'] },
      { title: 'GIS services', lines: ['OGC WMS / WFS / WCS (GeoServer)'] },
    ],
  },
];

/** Eight-layer architecture view. */
export const LAYERS8 = [
  { n: 1, name: 'Data sources', desc: 'SAWS · SANSA · DWS Hydstra / Telemetry · laboratories · municipalities / WSAs · Stats SA · SANBI · NGA · water boards · global (GRACE-FO, NOAA, CHIRPS)', color: '#1565C0' },
  { n: 2, name: 'Connectivity & ingestion', desc: 'MQTT broker, REST connectors, FTP / THREDDS / S3 pulls, WSNIS API, NWQMS database links', color: '#1E88E5' },
  { n: 3, name: 'Quality assurance', desc: 'ML-based QC engine: range, spike, spatial consistency, duplicate detection, calibration tracking', color: '#00838F' },
  { n: 4, name: 'Processing & harmonisation', desc: 'ETL pipelines, unit conversion, datum alignment, gap filling (kriging / LSTM imputation)', color: '#2E7D32' },
  { n: 5, name: 'Storage', desc: 'Data lake (10 PB target), time-series DB, PostGIS, metadata registry (ISO 19115)', color: '#558B2F' },
  { n: 6, name: 'Analytics & AI', desc: 'Index pipelines (SPI, SPEI, VCI, SSI, SGI), forecasting models, digital-twin layer', color: '#7B1FA2' },
  { n: 7, name: 'Services & APIs', desc: 'API gateway (REST / GraphQL, OAuth 2.0), OGC services, alert engine, report generator', color: '#C74300' },
  { n: 8, name: 'Users & channels', desc: 'NIWIS dashboard, mobile app, open data portal, partner systems, public bulletins', color: '#C62828' },
];
