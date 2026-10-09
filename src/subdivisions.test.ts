import { describe, expect, it } from "vitest";
import { pointToDiscoveryCell } from "./geo";
import barcelonaRegionData from "./subdivisionData/region-barcelona-metropolitan.json";
import {
  subdivisionPackageFromUnknown,
  subdivisionFeatureCollection,
  subdivisionAreaBounds,
  subdivisionProgress,
  hasSubdivisionPackage,
  type SubdivisionPackage,
} from "./subdivisions";

const polygon: GeoJSON.Polygon = {
  type: "Polygon",
  coordinates: [
    [
      [-0.01, -0.01],
      [0.01, -0.01],
      [0.01, 0.01],
      [-0.01, 0.01],
      [-0.01, -0.01],
    ],
  ],
};

const data: SubdivisionPackage = {
  regionId: "region:test",
  datasetVersion: "test",
  attribution: "Test data",
  areas: [
    {
      id: "municipality:test",
      parentId: null,
      kind: "municipality",
      name: "Test Municipality",
      geometry: polygon,
    },
    {
      id: "district:test",
      parentId: "municipality:test",
      kind: "district",
      name: "Test District",
      geometry: polygon,
    },
  ],
};

describe("subdivision data", () => {
  it("calculates the same discovery inside each nested boundary", () => {
    const point = { lng: 0, lat: 0, recordedAt: 1 };
    const progress = subdivisionProgress(
      data,
      [pointToDiscoveryCell(point)],
    );
    expect(progress).toHaveLength(2);
    expect(progress[0].percentage).toBe(progress[1].percentage);
    expect(progress[0].distance).toBe(progress[1].distance);
  });

  it("rejects a subdivision with a missing parent", () => {
    expect(() =>
      subdivisionPackageFromUnknown({
        ...data,
        areas: [{ ...data.areas[1], parentId: "missing" }],
      }),
    ).toThrow("references a missing parent");
  });

  it("loads Barcelona districts and the ten Sant Martí neighborhoods", () => {
    expect(hasSubdivisionPackage("region:barcelona-metropolitan")).toBe(true);
    expect(hasSubdivisionPackage("region:unsupported")).toBe(false);
    const barcelonaRegion = subdivisionPackageFromUnknown(barcelonaRegionData);
    const barcelona = barcelonaRegion.areas.find(
      ({ kind, name }) => kind === "municipality" && name === "Barcelona",
    );
    expect(barcelona).toBeDefined();
    const districts = barcelonaRegion.areas.filter(
      ({ kind, parentId }) =>
        kind === "district" && parentId === barcelona?.id,
    );
    expect(districts).toHaveLength(10);
    const santMarti = districts.find(({ name }) => name === "Sant Martí");
    expect(santMarti).toBeDefined();
    expect(
      barcelonaRegion.areas.filter(
        ({ kind, parentId }) =>
          kind === "neighborhood" && parentId === santMarti?.id,
      ),
    ).toHaveLength(10);
  });

  it("marks only the selected boundary in map data", () => {
    const progresses = subdivisionProgress(data, [
      pointToDiscoveryCell({ lng: 0, lat: 0, recordedAt: 1 }),
    ]);
    const collection = subdivisionFeatureCollection(
      data.areas,
      "district:test",
      progresses,
    );
    expect(collection.features.map(({ properties }) => properties.selected)).toEqual([
      false,
      true,
    ]);
    expect(
      collection.features.map(({ properties }) => properties.intensity),
    ).toEqual([0, 0]);
  });

  it("returns the geographic extent of a subdivision", () => {
    expect(subdivisionAreaBounds(data.areas[1])).toEqual([
      [-0.01, -0.01],
      [0.01, 0.01],
    ]);
  });
});
