import type { StyleSpecification } from "maplibre-gl";

export const MAP_STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";

const ROAD_SHIELD_LAYER_IDS = new Set([
  "highway-shield-non-us",
  "highway-shield-us-interstate",
  "road_shield_us",
]);

export function patchMapStyle(style: StyleSpecification): StyleSpecification {
  return {
    ...style,
    layers: style.layers.map((layer) => {
      if (
        !ROAD_SHIELD_LAYER_IDS.has(layer.id) ||
        !("filter" in layer) ||
        !Array.isArray(layer.filter)
      ) {
        return layer;
      }
      const filter = structuredClone(layer.filter) as unknown[];
      const refLengthFilter = filter[1];
      if (
        Array.isArray(refLengthFilter) &&
        refLengthFilter[0] === "<=" &&
        Array.isArray(refLengthFilter[1]) &&
        refLengthFilter[1][0] === "get" &&
        refLengthFilter[1][1] === "ref_length"
      ) {
        refLengthFilter[1] = ["number", ["get", "ref_length"], 999];
      }
      return { ...layer, filter } as typeof layer;
    }),
  };
}

export async function loadMapStyle(signal?: AbortSignal) {
  const response = await fetch(MAP_STYLE_URL, { signal });
  if (!response.ok) {
    throw new Error(`Map style request failed with ${response.status}`);
  }
  return patchMapStyle(await response.json() as StyleSpecification);
}
