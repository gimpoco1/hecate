import { Capacitor } from "@capacitor/core";
import { load, type MapKit, type MapRectData } from "@apple/mapkit-loader";
import type { Map as OverlayMap, StyleSpecification } from "maplibre-gl";
import type { ColorTheme } from "./appearance";
import { currentLanguage } from "./i18n";

export const DISCOVERY_OVERLAY_STYLE: StyleSpecification = { version: 8, sources: {}, layers: [] };

let sharedMapKit: Promise<MapKit> | null = null;

function tokenEndpoint(): URL {
  const endpoint = import.meta.env.VITE_MAPKIT_TOKEN_ENDPOINT?.trim();
  const url = new URL(Capacitor.isNativePlatform()
    ? endpoint || "https://hecate-explore.vercel.app/api/mapkit-token"
    : "/api/mapkit-token", window.location.href);
  const origin = window.location.origin === "null"
    ? `${window.location.protocol}//${window.location.host}` : window.location.origin;
  url.searchParams.set("origin", origin);
  return url;
}

async function requestToken(): Promise<string> {
  const url = tokenEndpoint();
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(15_000) });
      const body = await response.text();
      if (!response.ok) throw new Error(`Apple Maps authorization failed: HTTP ${response.status}; URL ${url}; response ${body}`);
      const token = body.trim();
      if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) {
        throw new Error(`Apple Maps authorization returned an invalid token; URL ${url}`);
      }
      return token;
    } catch (error) {
      if (attempt === 3) throw error;
      console.warn("Apple Maps authorization failed; retrying", { url: url.href, attempt, error });
    }
  }
  throw new Error("Apple Maps authorization exhausted its attempts.");
}

/** Share the SDK and renew short-lived tokens through the server, including on native WebViews. */
export function preloadAppleMaps(): Promise<MapKit> {
  if (!sharedMapKit) {
    sharedMapKit = requestToken().then(async (token) => {
      const mapkit = await load({ token, libraries: ["map"], language: currentLanguage() });
      mapkit.init({ authorizationCallback: (done) => {
        void requestToken().then(done).catch((error: Error) => {
          window.dispatchEvent(new CustomEvent<Error>("hecate-mapkit-error", { detail: error }));
        });
      } });
      return mapkit;
    }).catch((error) => {
      sharedMapKit = null;
      throw error;
    });
  }
  return sharedMapKit;
}

function nextFrame(signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    signal.throwIfAborted();
    const cancel = (): void => { cancelAnimationFrame(frame); reject(signal.reason); };
    const frame = requestAnimationFrame(() => { signal.removeEventListener("abort", cancel); resolve(); });
    signal.addEventListener("abort", cancel, { once: true });
  });
}

export type AppleBasemap = {
  setTheme: (theme: ColorTheme) => void;
  remove: () => void;
};

type BasemapCamera = {
  lng: number;
  lat: number;
  zoom: number;
  bearing: number;
  width: number;
  height: number;
};

/** Establish the projected scale once; panning and zooming then use MapKit's camera operations. */
function cameraMapRect(mapkit: MapKit, camera: BasemapCamera): MapRectData {
  const worldSize = 512 * 2 ** camera.zoom;
  const projected = new mapkit.Coordinate(camera.lat, camera.lng).toMapPoint();
  const worldWidth = (new mapkit.Coordinate(0, 1).toMapPoint().x - new mapkit.Coordinate(0, 0).toMapPoint().x) * 360;
  const width = camera.width / worldSize * worldWidth;
  const height = camera.height / worldSize * worldWidth;
  return { origin: { x: projected.x - width / 2, y: projected.y - height / 2 }, size: { width, height } };
}

/** Apple supplies the basemap; the transparent renderer keeps discovery and navigation geometry. */
export async function createAppleBasemap(
  container: HTMLElement,
  overlay: OverlayMap,
  theme: ColorTheme,
  signal: AbortSignal,
  onError: (error: Error) => void,
): Promise<AppleBasemap> {
  signal.throwIfAborted();
  const mapkit = await preloadAppleMaps();
  signal.throwIfAborted();
  while (!container.isConnected || !container.clientWidth || !container.clientHeight) await nextFrame(signal);
  const readCamera = (): BasemapCamera => {
    const width = container.clientWidth;
    const height = container.clientHeight;
    const center = overlay.unproject([width / 2, height / 2]);
    return { lng: center.lng, lat: center.lat, zoom: overlay.getZoom(), bearing: overlay.getBearing(), width, height };
  };
  const initialCamera = readCamera();
  const map = new mapkit.Map(container, {
    visibleMapRect: cameraMapRect(mapkit, initialCamera),
    mapType: mapkit.MapType.Standard,
    colorScheme: theme === "dark" ? mapkit.ColorScheme.Dark : mapkit.ColorScheme.Light,
    isScrollEnabled: false,
    isZoomEnabled: false,
    isRotationEnabled: false,
    showsMapTypeControl: false,
    showsZoomControl: false,
    showsUserLocationControl: false,
    showsCompass: mapkit.FeatureVisibility.Hidden,
    showsScale: mapkit.FeatureVisibility.Hidden,
  });
  try {
    // Camera getters in MapKit are unsafe until its backing view has completed layout.
    await nextFrame(signal);
    await nextFrame(signal);
  } catch (error) {
    map.destroy();
    throw error;
  }
  let previous: BasemapCamera = { ...initialCamera, bearing: 0 };
  let cameraFrame: number | null = null;
  const syncCamera = (): void => {
    cameraFrame = null;
    const camera = readCamera();
    if (camera.width !== previous.width || camera.height !== previous.height) {
      map.setRotationAnimated(0, false);
      map.setVisibleMapRectAnimated(cameraMapRect(mapkit, camera), false);
      map.setRotationAnimated(-camera.bearing, false);
    } else {
      if (camera.lng !== previous.lng || camera.lat !== previous.lat) {
        // MapKit preserves the projected scale when moving the center, including across latitudes.
        map.setCenterAnimated({ latitude: camera.lat, longitude: camera.lng }, false);
      }
      if (camera.zoom !== previous.zoom) {
        map.setCameraDistanceAnimated(map.cameraDistance * 2 ** (previous.zoom - camera.zoom), false);
      }
      if (camera.bearing !== previous.bearing) map.setRotationAnimated(-camera.bearing, false);
    }
    previous = camera;
  };
  const scheduleCamera = (): void => {
    if (cameraFrame === null) cameraFrame = requestAnimationFrame(syncCamera);
  };
  const reportError = (event: Event): void => {
    onError(event instanceof CustomEvent && event.detail instanceof Error
      ? event.detail : new Error("Apple Maps could not authorize or render its basemap. Check the token API and allowed origins."));
  };
  window.addEventListener("hecate-mapkit-error", reportError);
  mapkit.addEventListener("error", reportError);
  overlay.on("move", scheduleCamera);
  overlay.on("resize", scheduleCamera);
  syncCamera();
  return {
    setTheme: (theme) => { map.colorScheme = theme === "dark" ? mapkit.ColorScheme.Dark : mapkit.ColorScheme.Light; },
    remove: () => {
      if (cameraFrame !== null) cancelAnimationFrame(cameraFrame);
      overlay.off("move", scheduleCamera);
      overlay.off("resize", scheduleCamera);
      window.removeEventListener("hecate-mapkit-error", reportError);
      mapkit.removeEventListener("error", reportError);
      map.destroy();
    },
  };
}
