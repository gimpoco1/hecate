import { t } from "./i18n";
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
      if (layer.id === "label_other" && layer.type === "symbol") {
        return {
          ...layer,
          layout: {
            ...layer.layout,
            "text-font": ["Noto Sans Regular"],
            "text-letter-spacing": 0.14,
            "text-size": ["interpolate", ["linear"], ["zoom"], 8, 10, 12, 13, 16, 15],
          },
          paint: {
            ...layer.paint,
            "text-color": "#596d65",
            "text-halo-color": "#dce2dc",
            "text-halo-blur": 0.4,
            "text-halo-width": 1,
          },
        };
      }
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

let sharedMapStyle: Promise<StyleSpecification> | null = null;

function requestMapStyle(): Promise<StyleSpecification> {
  return fetch(MAP_STYLE_URL).then(async (response) => {
    if (!response.ok) {
      throw new Error(t("Map style request failed with {{value0}}", { value0: response.status }));
    }
    return patchMapStyle(await response.json() as StyleSpecification);
  });
}

/** Start the style request as early as possible and share it with every map consumer. */
export function preloadMapStyle(): Promise<StyleSpecification> {
  if (!sharedMapStyle) {
    sharedMapStyle = requestMapStyle().catch((error) => {
      // Allow a later retry after a transient network failure.
      sharedMapStyle = null;
      throw error;
    });
  }
  return sharedMapStyle;
}

export function loadMapStyle(signal?: AbortSignal): Promise<StyleSpecification> {
  if (signal?.aborted) return Promise.reject(new DOMException("Aborted", "AbortError"));
  const style = preloadMapStyle();
  if (!signal) return style;
  return new Promise((resolve, reject) => {
    const abort = (): void => {
      signal.removeEventListener("abort", abort);
      reject(new DOMException("Aborted", "AbortError"));
    };
    signal.addEventListener("abort", abort, { once: true });
    style.then(
      (value) => { signal.removeEventListener("abort", abort); resolve(value); },
      (error) => { signal.removeEventListener("abort", abort); reject(error); },
    );
  });
}
