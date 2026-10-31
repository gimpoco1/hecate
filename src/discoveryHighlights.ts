import { discoveryCellCenter, discoveryCellKey, discoveryFootprintCells } from "./geo";
import type { DiscoveryCell } from "./types";

/** Highlight only reveal footprints that were not already uncovered before the journey. */
export function newlyRevealedCells(
  previousCells: DiscoveryCell[],
  journeyCells: DiscoveryCell[],
): DiscoveryCell[] {
  const revealed = new Map<string, DiscoveryCell>();
  for (const cell of journeyCells) {
    for (const footprint of discoveryFootprintCells(cell)) {
      const key = discoveryCellKey(footprint);
      revealed.set(key, footprint);
    }
  }
  for (const cell of previousCells) {
    if (revealed.size === 0) break;
    for (const footprint of discoveryFootprintCells(cell)) {
      revealed.delete(discoveryCellKey(footprint));
    }
  }
  return [...revealed.values()];
}

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
