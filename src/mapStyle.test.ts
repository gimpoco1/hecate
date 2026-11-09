import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StyleSpecification } from "maplibre-gl";
import { patchMapStyle } from "./mapStyle";

const emptyStyle = { version: 8, sources: {}, layers: [] } as StyleSpecification;

function styleResponse(): Response {
  return { ok: true, json: async () => emptyStyle } as Response;
}

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

describe("map style loading", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  it("shares one request between concurrent map consumers", async () => {
    const fetchMock = vi.fn().mockResolvedValue(styleResponse());
    vi.stubGlobal("fetch", fetchMock);
    const { preloadMapStyle } = await import("./mapStyle");

    const first = preloadMapStyle();
    const second = preloadMapStyle();

    expect(second).toBe(first);
    await expect(first).resolves.toEqual(emptyStyle);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("allows a retry after a failed style request", async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(styleResponse());
    vi.stubGlobal("fetch", fetchMock);
    const { preloadMapStyle } = await import("./mapStyle");

    await expect(preloadMapStyle()).rejects.toThrow("offline");
    await expect(preloadMapStyle()).resolves.toEqual(emptyStyle);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
