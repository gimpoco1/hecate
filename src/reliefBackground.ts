import { canvasRGB } from "stackblur-canvas";
import { Map as MapLibreMap } from "maplibre-gl";
import { loadMapStyle } from "./mapStyle";
import { t } from "./i18n";

export type ReliefBackground = {
  image: HTMLCanvasElement;
  center: { lng: number; lat: number };
  centerPixel: { x: number; y: number };
  width: number;
  height: number;
  zoom: number;
  pitch: number;
  bearing: number;
  fov: number;
};

/** Artwork uses its own open vector basemap so Apple tiles are never copied into an exported image. */
export async function createReliefBackground(map: MapLibreMap, signal: AbortSignal): Promise<ReliefBackground> {
  signal.throwIfAborted();
  const style = await loadMapStyle(signal);
  signal.throwIfAborted();
  const container = document.createElement("div");
  const { clientWidth: width, clientHeight: height } = map.getContainer();
  Object.assign(container.style, { position: "fixed", left: "-100000px", top: "0", width: `${width}px`, height: `${height}px` });
  document.body.appendChild(container);
  const artwork = new MapLibreMap({
    container, style, center: map.getCenter(), zoom: map.getZoom(), bearing: map.getBearing(), pitch: 0,
    interactive: false, attributionControl: false, renderWorldCopies: false, fadeDuration: 0,
    canvasContextAttributes: { preserveDrawingBuffer: true },
  });
  artwork.setPadding(map.getPadding());
  try {
    return await captureReliefBackground(artwork, signal);
  } finally {
    artwork.remove();
    container.remove();
  }
}

/** Captures and blurs map pixels once; preview and export never depend on WebKit canvas/CSS filters. */
async function captureReliefBackground(map: MapLibreMap, signal: AbortSignal): Promise<ReliefBackground> {
  return new Promise<ReliefBackground>((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Map snapshot was cancelled.", "AbortError"));
      return;
    }
    const cancel = (): void => {
      window.clearTimeout(timeout);
      map.off("render", capture);
      reject(new DOMException("Map snapshot was cancelled.", "AbortError"));
    };
    const capture = (): void => {
      if (!map.isStyleLoaded() || !map.areTilesLoaded()) {
        map.once("render", capture);
        return;
      }
      window.clearTimeout(timeout);
      signal.removeEventListener("abort", cancel);
      try {
        const source = map.getCanvas();
        const image = document.createElement("canvas");
        image.width = source.width;
        image.height = source.height;
        const context = image.getContext("2d");
        if (!context) throw new Error(t("The 3D image could not be encoded as PNG. Close and reopen your 3D map."));
        context.drawImage(source, 0, 0);
        const width = map.getContainer().clientWidth;
        const height = map.getContainer().clientHeight;
        const center = map.getCenter();
        const centerPixel = map.project(center);
        canvasRGB(image, 0, 0, image.width, image.height, Math.max(1, Math.round(8 * image.width / width)));
        resolve({ image, center: { lng: center.lng, lat: center.lat }, centerPixel: { x: centerPixel.x, y: centerPixel.y },
          width, height, zoom: map.getZoom(), pitch: map.getPitch(), bearing: map.getBearing(), fov: map.getVerticalFieldOfView() });
      } catch (failure) { reject(failure); }
    };
    const timeout = window.setTimeout(() => {
      map.off("render", capture);
      signal.removeEventListener("abort", cancel);
      reject(new Error(t("The map is still loading. Check your connection and reopen the 3D view.")));
    }, 20_000);
    signal.addEventListener("abort", cancel, { once: true });
    map.once("render", capture);
    map.triggerRepaint();
  });
}

/** Frames the actual discovered area before capturing the matching lift-off view. */
export function frameReliefMap(map: MapLibreMap, bounds: [[number, number], [number, number]], signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Map framing was cancelled.", "AbortError"));
      return;
    }
    map.stop();
    const finish = (): void => {
      clearTimeout(timeout);
      signal.removeEventListener("abort", cancel);
      resolve();
    };
    const cancel = (): void => {
      clearTimeout(timeout);
      map.off("moveend", finish);
      map.stop();
      reject(new DOMException("Map framing was cancelled.", "AbortError"));
    };
    const timeout = window.setTimeout(() => {
      signal.removeEventListener("abort", cancel);
      map.off("moveend", finish);
      reject(new Error("The map did not finish framing the discovered area within 3 seconds."));
    }, 3000);
    signal.addEventListener("abort", cancel, { once: true });
    map.once("moveend", finish);
    const { clientWidth: width, clientHeight: height } = map.getContainer();
    map.fitBounds(bounds, { duration: 450, pitch: 0, bearing: map.getBearing(),
      padding: { left: width * .18, right: width * .18, top: height * .30, bottom: height * .30 } });
  });
}
