import { discoveryCellCenter } from "./geo";
import type { DiscoveryCell } from "./types";

export function discoveryHighlightData(
  cells: DiscoveryCell[],
): GeoJSON.Feature<GeoJSON.MultiPolygon> {
  return {
    type: "Feature",
    properties: {},
    geometry: {
      type: "MultiPolygon",
      coordinates: cells.map((cell) => {
        const [west, north] = discoveryCellCenter({ ...cell, x: cell.x - 0.5, y: cell.y - 0.5 });
        const [east, south] = discoveryCellCenter({ ...cell, x: cell.x + 0.5, y: cell.y + 0.5 });
        return [[[west, north], [west, south], [east, south], [east, north], [west, north]]];
      }),
    },
  };
}
