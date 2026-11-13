import type { LanguagePreference } from "./i18n";
import { registerPlugin, type PluginListenerHandle } from "@capacitor/core";
import { discoveredDistanceKm, routeDistanceKm } from "./geo";
import type { Coordinate } from "./types";
import type { NavigationCue, NavigationRemaining } from "./navigationGuidance";
import type { JourneyControlRequest } from "./journeyControl";
import type { AppearancePreference, ColorTheme } from "./appearance";

export type JourneyActivitySnapshot = {
  walkId: string;
  startedAt: number;
  distanceKm: number;
  newGroundMeters: number;
  paused: boolean;
  elapsedMs: number;
  navigation?: NavigationCue | null;
  navigationRemaining?: NavigationRemaining | null;
};

export type JourneyStopRequest = { walkId: string; ownerId: string; finishedAt: number };

export type JourneyPauseRequest = { id: string; walkId: string; ownerId: string; paused: boolean; requestedAt: number; activeStartedAt: number };

interface JourneyActivityPlugin {
  getPauseRequest(options: { ownerId: string; walkId: string }): Promise<{ request: JourneyPauseRequest | null }>;
  acknowledgePause(options: { ownerId: string; walkId: string; id: string }): Promise<void>;
  pauseLocation(options: { walkId: string }): Promise<void>;
  resumeLocation(options: { walkId: string }): Promise<void>;
  addListener(event: "pauseRequested", listener: (request: JourneyPauseRequest) => void): Promise<PluginListenerHandle>;
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
    paused: false,
    elapsedMs: 0,
  };
}

export function journeyActionFromUrl(value: string): { action: "open" | "stop" | "pause" | "resume"; walkId: string } | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "hecate:" || url.host !== "journey") return null;
  const walkId = url.searchParams.get("walkId");
  if (!walkId || !["/open", "/stop", "/pause", "/resume"].includes(url.pathname)) return null;
  const action = url.pathname.slice(1) as "open" | "stop" | "pause" | "resume";
  return { action, walkId };
}
