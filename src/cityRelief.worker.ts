import i18next from "i18next";
import { createCityRelief, createReliefFootprint, type CityRelief } from "./cityRelief";
import { loadReliefBuildings } from "./reliefBuildings";
import type { CityBoundary } from "./city";
import type { DiscoveryCell } from "./types";
import type { Language } from "./i18n";

export type CityReliefRequest = {
  city: CityBoundary;
  cells: readonly DiscoveryCell[];
  sourceUrl: string;
  language: Language;
};
export type CityReliefResponse =
  | { kind: "ground"; relief: CityRelief; bounds: [[number, number], [number, number]] }
  | { kind: "buildings"; relief: CityRelief }
  | { kind: "error"; message: string; stack: string | undefined };

function sendRelief(response: Exclude<CityReliefResponse, { kind: "error" }>): void {
  const { relief } = response;
  self.postMessage(response, { transfer: [relief.positions.buffer, relief.normals.buffer, relief.occlusion.buffer] });
}

/** Keeps tile decoding, outline clipping and triangulation off the animation thread. */
async function createArtwork(request: CityReliefRequest): Promise<void> {
  await i18next.changeLanguage(request.language);
  const footprint = createReliefFootprint(request.cells, request.city);
  const corners = footprint.polygons.flat(2);
  const west = corners.reduce((value, [x]) => Math.min(value, x), Infinity) / footprint.gridScale;
  const east = corners.reduce((value, [x]) => Math.max(value, x), -Infinity) / footprint.gridScale;
  const north = corners.reduce((value, [, y]) => Math.min(value, y), Infinity) / footprint.gridScale;
  const south = corners.reduce((value, [, y]) => Math.max(value, y), -Infinity) / footprint.gridScale;
  const latitude = (y: number): number => Math.atan(Math.sinh(Math.PI * (1 - y * 2))) * 180 / Math.PI;
  sendRelief({ kind: "ground", relief: createCityRelief(footprint, []), bounds: [[west * 360 - 180, latitude(south)], [east * 360 - 180, latitude(north)]] });
  const buildings = await loadReliefBuildings(footprint, request.sourceUrl, new AbortController().signal);
  sendRelief({ kind: "buildings", relief: createCityRelief(footprint, buildings) });
}

self.addEventListener("message", (event: MessageEvent<CityReliefRequest>): void => {
  void createArtwork(event.data).catch((failure: Error) => {
    const response: CityReliefResponse = { kind: "error", message: failure.message, stack: failure.stack };
    self.postMessage(response);
  });
});
