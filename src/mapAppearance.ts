import type { Map as MapLibreMap, StyleSpecification } from "maplibre-gl";
import type { ColorTheme } from "./appearance";

function darkMapColor(layerId: string, property: string): string {
  const id = layerId.toLowerCase();
  if (property === "text-halo-color") return "#172333";
  if (property === "text-color" || property === "icon-color") {
    return /water|ocean|river/.test(id) ? "#8daecc" : "#c6d1df";
  }
  if (/water|ocean|river|stream/.test(id)) return "#090f1a";
  if (/park|wood|grass|forest|landcover|pitch|cemetery/.test(id)) return "#12383c";
  if (/building/.test(id)) return "#24364d";
  if (/casing/.test(id)) return "#172233";
  if (/motorway|trunk/.test(id)) return "#62738b";
  if (/road|highway|street|bridge|tunnel/.test(id)) return "#3d5069";
  if (/rail|boundary|border/.test(id)) return "#637a95";
  return "#1b293b";
}

/** Changes base-map colors only; discovery geometry, routes, sources and camera stay intact. */
export function mapStyleForTheme(style: StyleSpecification, theme: ColorTheme): StyleSpecification {
  if (theme === "light") return style;
  return {
    ...style,
    layers: style.layers.map((layer) => {
      if (!("paint" in layer) || !layer.paint) return layer;
      const paint = Object.fromEntries(Object.entries(layer.paint).filter(([property]) => property !== "fill-pattern").map(([property, value]) => [
        property, property.endsWith("color") ? darkMapColor(layer.id, property) : value,
      ]));
      if (layer.type === "fill" && layer.paint["fill-pattern"] !== undefined) {
        paint["fill-color"] = darkMapColor(layer.id, "fill-color");
      }
      return { ...layer, paint } as typeof layer;
    }),
  };
}

export function applyMapAppearance(map: MapLibreMap, baseStyle: StyleSpecification, theme: ColorTheme): void {
  for (const [index, layer] of mapStyleForTheme(baseStyle, theme).layers.entries()) {
    if (!("paint" in layer) || !layer.paint || !map.getLayer(layer.id)) continue;
    for (const [property, value] of Object.entries(layer.paint)) {
      if (property.endsWith("color")) map.setPaintProperty(layer.id, property as Parameters<MapLibreMap["setPaintProperty"]>[1], value);
    }
    const original = baseStyle.layers[index];
    if (original.type === "fill" && original.paint?.["fill-pattern"] !== undefined) {
      map.setPaintProperty(layer.id, "fill-pattern", theme === "dark" ? undefined : original.paint["fill-pattern"]);
      if (theme === "light") map.setPaintProperty(layer.id, "fill-color", original.paint["fill-color"]);
    }
    if (layer.type === "line" && "line-pattern" in layer.paint) {
      map.setPaintProperty(layer.id, "line-opacity", theme === "dark" ? 0.3 : layer.paint["line-opacity"]);
    }
    if (layer.type === "raster") {
      map.setPaintProperty(layer.id, "raster-opacity", theme === "dark" ? 0.18 : layer.paint["raster-opacity"]);
    }
  }
}
