import {
  discoveredCityCellDistanceKm,
  discoveredCityPercentage,
  isPointInCity,
  type CityBoundary,
} from "./city";
import { discoveryCellCenter } from "./geo";
import type { DiscoveryCell } from "./types";

type SubdivisionGeometry = GeoJSON.Polygon | GeoJSON.MultiPolygon;

export type SubdivisionKind = "municipality" | "district" | "neighborhood";

export type SubdivisionArea = {
  id: string;
  parentId: string | null;
  kind: SubdivisionKind;
  name: string;
  geometry: SubdivisionGeometry;
};

export type SubdivisionPackage = {
  regionId: string;
  datasetVersion: string;
  attribution: string;
  areas: SubdivisionArea[];
};

export type SubdivisionProgress = {
  area: SubdivisionArea;
  percentage: number;
  distance: number;
};

export type SubdivisionFeatureProperties = {
  id: string;
  kind: SubdivisionKind;
  selected: boolean;
  percentage: number;
  intensity: number;
};

type SubdivisionModule = { default: unknown };

const subdivisionModules = import.meta.glob<SubdivisionModule>(
  "./subdivisionData/*.json",
);

function isGeometry(value: unknown): value is SubdivisionGeometry {
  if (!value || typeof value !== "object") return false;
  const geometry = value as { type?: unknown; coordinates?: unknown };
  return (
    (geometry.type === "Polygon" || geometry.type === "MultiPolygon") &&
    Array.isArray(geometry.coordinates)
  );
}

function subdivisionAreaFromUnknown(value: unknown): SubdivisionArea {
  if (!value || typeof value !== "object")
    throw new TypeError("Subdivision area must be an object");
  const area = value as Record<string, unknown>;
  if (typeof area.id !== "string" || area.id.length === 0)
    throw new TypeError("Subdivision area is missing a valid id");
  if (area.parentId !== null && typeof area.parentId !== "string")
    throw new TypeError(`Subdivision ${area.id} has an invalid parentId`);
  if (
    area.kind !== "municipality" &&
    area.kind !== "district" &&
    area.kind !== "neighborhood"
  )
    throw new TypeError(`Subdivision ${area.id} has an invalid kind`);
  if (typeof area.name !== "string" || area.name.length === 0)
    throw new TypeError(`Subdivision ${area.id} is missing a name`);
  if (!isGeometry(area.geometry))
    throw new TypeError(`Subdivision ${area.id} has invalid geometry`);
  return {
    id: area.id,
    parentId: area.parentId,
    kind: area.kind,
    name: area.name,
    geometry: area.geometry,
  };
}

export function subdivisionPackageFromUnknown(
  value: unknown,
): SubdivisionPackage {
  if (!value || typeof value !== "object")
    throw new TypeError("Subdivision package must be an object");
  const data = value as Record<string, unknown>;
  if (typeof data.regionId !== "string" || data.regionId.length === 0)
    throw new TypeError("Subdivision package is missing a regionId");
  if (
    typeof data.datasetVersion !== "string" ||
    data.datasetVersion.length === 0
  )
    throw new TypeError("Subdivision package is missing a datasetVersion");
  if (typeof data.attribution !== "string" || data.attribution.length === 0)
    throw new TypeError("Subdivision package is missing attribution");
  if (!Array.isArray(data.areas))
    throw new TypeError("Subdivision package areas must be an array");
  const areas = data.areas.map(subdivisionAreaFromUnknown);
  const areaIds = new Set(areas.map(({ id }) => id));
  const duplicateArea = areas.find(
    ({ id }, index) => areas.findIndex((area) => area.id === id) !== index,
  );
  if (duplicateArea)
    throw new TypeError(`Subdivision package repeats id ${duplicateArea.id}`);
  const orphan = areas.find(
    ({ parentId }) => parentId !== null && !areaIds.has(parentId),
  );
  if (orphan)
    throw new TypeError(`Subdivision ${orphan.id} references a missing parent`);
  return {
    regionId: data.regionId,
    datasetVersion: data.datasetVersion,
    attribution: data.attribution,
    areas,
  };
}

function packageFilename(regionId: string): string {
  return `./subdivisionData/${regionId.replaceAll(":", "-")}.json`;
}

export async function loadSubdivisionPackage(
  regionId: string,
): Promise<SubdivisionPackage | null> {
  const load = subdivisionModules[packageFilename(regionId)];
  if (!load) return null;
  const module = await load();
  const data = subdivisionPackageFromUnknown(module.default);
  if (data.regionId !== regionId)
    throw new Error(
      `Subdivision package ${packageFilename(regionId)} contains region ${data.regionId}`,
    );
  return data;
}

export function hasSubdivisionPackage(regionId: string): boolean {
  return Boolean(subdivisionModules[packageFilename(regionId)]);
}

function boundaryForArea(area: SubdivisionArea): CityBoundary {
  return {
    id: area.id,
    name: area.name,
    geometry: area.geometry,
    fetchedAt: 0,
  };
}

export function subdivisionProgress(
  data: SubdivisionPackage,
  cells: DiscoveryCell[],
): SubdivisionProgress[] {
  const progresses: SubdivisionProgress[] = [];
  const progressForArea = (
    area: SubdivisionArea,
    areaCells: DiscoveryCell[],
  ): SubdivisionProgress => {
    const boundary = boundaryForArea(area);
    return {
      area,
      percentage: discoveredCityPercentage(areaCells, boundary),
      distance: discoveredCityCellDistanceKm(areaCells, boundary),
    };
  };
  const cellsInside = (
    area: SubdivisionArea,
    candidates: DiscoveryCell[],
  ): DiscoveryCell[] => {
    const boundary = boundaryForArea(area);
    return candidates.filter((cell) => {
      const [lng, lat] = discoveryCellCenter(cell);
      return isPointInCity({ lng, lat }, boundary);
    });
  };
  for (const municipality of data.areas.filter(
    ({ kind }) => kind === "municipality",
  )) {
    const municipalityCells = cellsInside(municipality, cells);
    if (!municipalityCells.length) continue;
    progresses.push(progressForArea(municipality, municipalityCells));
    for (const district of data.areas.filter(
      ({ kind, parentId }) =>
        kind === "district" && parentId === municipality.id,
    )) {
      const districtCells = cellsInside(district, municipalityCells);
      progresses.push(progressForArea(district, districtCells));
      for (const neighborhood of data.areas.filter(
        ({ kind, parentId }) =>
          kind === "neighborhood" && parentId === district.id,
      )) {
        const neighborhoodCells = cellsInside(neighborhood, districtCells);
        progresses.push(progressForArea(neighborhood, neighborhoodCells));
      }
    }
  }
  return progresses;
}

export function subdivisionFeatureCollection(
  areas: SubdivisionArea[],
  selectedAreaId: string | null,
  progresses: SubdivisionProgress[],
): GeoJSON.FeatureCollection<
  SubdivisionGeometry,
  SubdivisionFeatureProperties
> {
  const percentageByAreaId = new Map(
    progresses.map(({ area, percentage }) => [area.id, percentage]),
  );
  const percentages = areas.map(
    ({ id }) => percentageByAreaId.get(id) ?? 0,
  );
  const minimum = percentages.length > 0 ? Math.min(...percentages) : 0;
  const maximum = percentages.length > 0 ? Math.max(...percentages) : 0;
  return {
    type: "FeatureCollection",
    features: areas.map((area) => {
      const percentage = percentageByAreaId.get(area.id) ?? 0;
      return {
        type: "Feature",
        id: area.id,
        properties: {
          id: area.id,
          kind: area.kind,
          selected: area.id === selectedAreaId,
          percentage,
          intensity:
            maximum === minimum ? 0 : (percentage - minimum) / (maximum - minimum),
        },
        geometry: area.geometry,
      };
    }),
  };
}

export function subdivisionAreaBounds(
  area: SubdivisionArea,
): [[number, number], [number, number]] {
  const polygons =
    area.geometry.type === "Polygon"
      ? [area.geometry.coordinates]
      : area.geometry.coordinates;
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  for (const polygon of polygons) {
    for (const ring of polygon) {
      for (const [lng, lat] of ring) {
        west = Math.min(west, lng);
        south = Math.min(south, lat);
        east = Math.max(east, lng);
        north = Math.max(north, lat);
      }
    }
  }
  if (
    !Number.isFinite(west) ||
    !Number.isFinite(south) ||
    !Number.isFinite(east) ||
    !Number.isFinite(north)
  )
    throw new TypeError(`Subdivision ${area.id} has no finite coordinates`);
  return [
    [west, south],
    [east, north],
  ];
}
