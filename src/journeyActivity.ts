import type { LanguagePreference } from "./i18n";
import { registerPlugin, type PluginListenerHandle } from "@capacitor/core";
import { discoveredDistanceKm, routeDistanceKm } from "./geo";
import type { Coordinate } from "./types";
import type { NavigationCue } from "./navigationGuidance";
import type { JourneyControlRequest } from "./journeyControl";
import type { AppearancePreference, ColorTheme } from "./appearance";

export type JourneyActivitySnapshot = {
  walkId: string;
  startedAt: number;
  distanceKm: number;
  newGroundMeters: number;
  navigation?: NavigationCue | null;
};

export type JourneyStopRequest = { walkId: string; ownerId: string; finishedAt: number };

interface JourneyActivityPlugin {
  setAppearance(options: { preference: AppearancePreference; theme: ColorTheme; language: LanguagePreference }): Promise<void>;
  start(snapshot: JourneyActivitySnapshot & { ownerId: string }): Promise<void>;
  update(snapshot: JourneyActivitySnapshot): Promise<void>;
  end(snapshot: JourneyActivitySnapshot & { finishedAt: number }): Promise<void>;
  clear(): Promise<void>;
  reconcile(options: { ownerId: string; walkId: string | null }): Promise<void>;
  getStopRequest(options: { ownerId: string; walkId: string }): Promise<{ request: JourneyStopRequest | null }>;
  acknowledgeStop(options: { ownerId: string; walkId: string }): Promise<void>;
  getControlRequest(): Promise<{ request: JourneyControlRequest | null }>;
  acknowledgeControlRequest(options: { id: string }): Promise<void>;
  addListener(event: "stopRequested", listener: (request: JourneyStopRequest) => void): Promise<PluginListenerHandle>;
  addListener(event: "controlRequested", listener: () => void): Promise<PluginListenerHandle>;
}

export const JourneyActivity = registerPlugin<JourneyActivityPlugin>("JourneyActivity");

/** Uses the same new-ground distance calculation as the completed journey recap. */
export function journeyNewGroundMeters(points: Coordinate[], startingDistanceKm: number): number {
  return Math.max(0, discoveredDistanceKm(points) - startingDistanceKm) * 1_000;
}

export function journeyActivitySnapshot(
  walk: { id: string; startedAt: number; points: Coordinate[] },
  startingDistanceKm: number,
  points: Coordinate[],
): JourneyActivitySnapshot {
  return {
    walkId: walk.id,
    startedAt: walk.startedAt,
    distanceKm: routeDistanceKm(walk.points),
    newGroundMeters: journeyNewGroundMeters(points, startingDistanceKm),
  };
}

export function journeyActionFromUrl(value: string): { action: "open" | "stop"; walkId: string } | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "hecate:" || url.host !== "journey") return null;
  const walkId = url.searchParams.get("walkId");
  if (!walkId || (url.pathname !== "/open" && url.pathname !== "/stop")) return null;
  return { action: url.pathname === "/stop" ? "stop" : "open", walkId };
}
