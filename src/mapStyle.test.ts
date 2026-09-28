import { describe, expect, it } from "vitest";
import type { StyleSpecification } from "maplibre-gl";
import { patchMapStyle } from "./mapStyle";

describe("map style compatibility", () => {
  it("gives nullable road shield lengths a numeric fallback", () => {
    const style = {
      version: 8,
      sources: {},
      layers: [{
        id: "highway-shield-non-us",
        type: "symbol",
        filter: ["all", ["<=", ["get", "ref_length"], 6]],
        layout: {},
      }],
    } as unknown as StyleSpecification;

    const patched = patchMapStyle(style);

    expect("filter" in patched.layers[0] ? patched.layers[0].filter : undefined).toEqual([
      "all",
      ["<=", ["number", ["get", "ref_length"], 999], 6],
    ]);
    expect("filter" in style.layers[0] ? style.layers[0].filter : undefined).toEqual([
      "all",
      ["<=", ["get", "ref_length"], 6],
    ]);
  });

  it("does not modify unrelated filters", () => {
    const style = {
      version: 8,
      sources: {},
      layers: [{
        id: "other-layer",
        type: "symbol",
        filter: ["<=", ["get", "ref_length"], 6],
        layout: {},
      }],
    } as unknown as StyleSpecification;

    expect(patchMapStyle(style)).toEqual(style);
  });
});
