import { expect, it } from "vitest";
import type { StyleSpecification } from "maplibre-gl";
import { mapStyleForTheme } from "./mapAppearance";

it("changes map colors without changing sources, geometry, layers or the original day style", () => {
  const style: StyleSpecification = {
    version: 8,
    sources: { base: { type: "vector", tiles: ["https://example.com/{z}/{x}/{y}.pbf"] } },
    layers: [
      { id: "water", type: "fill", source: "base", "source-layer": "water", paint: { "fill-color": "#abcdef", "fill-opacity": 0.8 } },
      { id: "road", type: "line", source: "base", "source-layer": "roads", paint: { "line-color": "#ffffff", "line-width": ["interpolate", ["linear"], ["zoom"], 10, 1, 18, 6] } },
    ],
  };
  const original = structuredClone(style);
  const dark = mapStyleForTheme(style, "dark");
  expect(dark.sources).toBe(style.sources);
  expect(dark.layers.map(layer => layer.id)).toEqual(["water", "road"]);
  expect(dark.layers[0].paint).toEqual({ "fill-color": "#090f1a", "fill-opacity": 0.8 });
  expect(dark.layers[1].paint).toEqual({ "line-color": "#3d5069", "line-width": ["interpolate", ["linear"], ["zoom"], 10, 1, 18, 6] });
  expect(mapStyleForTheme(style, "light")).toBe(style);
  expect(style).toEqual(original);
});

it("replaces daytime bitmap hatching with solid night colors without changing the original pattern", () => {
  const style: StyleSpecification = {
    version: 8,
    sources: { base: { type: "vector", tiles: ["https://example.com/{z}/{x}/{y}.pbf"] } },
    layers: [{ id: "road_area_pattern", type: "fill", source: "base", "source-layer": "transportation", paint: { "fill-pattern": "pedestrian_polygon" } }],
  };
  expect(mapStyleForTheme(style, "dark").layers[0].paint).toEqual({ "fill-color": "#3d5069" });
  expect(mapStyleForTheme(style, "light").layers[0].paint).toEqual({ "fill-pattern": "pedestrian_polygon" });
});
