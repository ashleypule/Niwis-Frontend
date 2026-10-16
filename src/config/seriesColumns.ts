/**
 * Summary-panel series that plot one database column as it is stored (same values, same unit), by panel
 * (`module/metric`) and series key → `table.column`. Their legend and axis use the column's catalogue label and unit
 * (fetched from `/{module}/categories` at runtime), not the mockup wording. Derived series (annual sums, anomalies, area
 * shares, long-term means) are not columns and keep the backend's names.
 */
const SAT = 'satellite_remote_sensing';
const HYD = 'hydrological_drought_master';
const IDX = '6.2_rainfall_derived_drought_indices_master';
const MET = 'meteorological_drought_master';

const SPI: Record<string, string> = {
  spi1: `${IDX}.SPI_1_Meteorological_Drought_Onset`,
  spi3: `${IDX}.SPI_3_Short_Term_Agricultural_Drought`,
  spi6: `${IDX}.SPI_6_Medium_Term_Hydrological_Impacts`,
  spi12: `${IDX}.SPI_12_Long_Term_Groundwater_Impacts`,
  spi24: `${IDX}.SPI_24_Very_Long_Term_Drought`,
};

export const SERIES_COLUMNS: Record<string, Record<string, string>> = {
  'drought/spi': SPI,
  'drought/soil-moisture': {
    surface: `${SAT}.surface_soil_moisture`,
    rootzone: `${SAT}.rootzone_soil_moisture`,
  },
  'drought/gw-sgi': { sgi: `${HYD}.sgi_dimensionless`, level: `${HYD}.borehole_water_level_m_bgl` },
  'drought/vegetation': { ndvi: `${SAT}.ndvi`, vci: `${SAT}.vci`, vhi: `${SAT}.vhi` },
  'rainfall/spi-spei': { ...SPI, spei6: `${MET}.spei_6`, spei12: `${MET}.spei_12` },
  'vegetation/indices': {
    ndvi: `${SAT}.ndvi`,
    vci: `${SAT}.vci`,
    vhi: `${SAT}.vhi`,
    tci: `${SAT}.tci`,
    ndwi: `${SAT}.ndwi`,
    lst: `${SAT}.lst`,
  },
};

/** Catalogues that hold the tables above (the drought page lists all four of its source tables). */
export const LABEL_CATALOGUES = ['drought'] as const;
