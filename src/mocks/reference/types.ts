export interface RegionRef {
  id: string;
  name: string;
  lon: number;
  lat: number;
  areaKm2: number;
}
export interface CatchmentRef extends RegionRef {
  wma: string | null;
  province: string | null;
}
export interface MunicipalityRef extends RegionRef {
  province: string;
  wma: string;
}
export interface PointRef {
  id: string;
  name: string;
  lat: number;
  lon: number;
  province: string;
  wma: string;
  municipality: string;
}
