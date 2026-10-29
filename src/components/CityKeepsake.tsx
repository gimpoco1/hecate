import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { Map as MapLibreMap } from "maplibre-gl";
import type { CityBoundary } from "../city";
import type { CityRelief } from "../cityRelief";
import type { CityReliefRequest, CityReliefResponse } from "../cityRelief.worker";
import { createReliefScene, type ReliefScene } from "../reliefScene";
import { reliefBuildingSource } from "../reliefBuildings";
import { createReliefBackground, frameReliefMap } from "../reliefBackground";
import { saveReliefImage } from "../reliefExport";
import type { DiscoveryCell } from "../types";
import { currentLanguage, t, useAppTranslation } from "../i18n";
import { XIcon } from "./Icons";
import { mdiCursorMove, mdiDownload, mdiLoading, mdiRestore, mdiRotate3dVariant } from "@mdi/js";
import "./CityKeepsake.css";

type Props = {
  city: CityBoundary;
  discoveredKm: number;
  percentage: number;
  cells: readonly DiscoveryCell[];
  map: MapLibreMap;
  onClose: () => void;
};

function KeepsakeControlIcon({ path }: { path: string }) {
  return <svg width="21" height="21" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d={path} /></svg>;
}

export function CityKeepsake({ city, cells, map, discoveredKm, percentage, onClose }: Props) {
  useAppTranslation();
  const dialog = useRef<HTMLDialogElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const backgroundCanvas = useRef<HTMLCanvasElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number; button: number }>());
  const [interaction, setInteraction] = useState<"move" | "rotate">("move");
  const [touchControls, setTouchControls] = useState(() => matchMedia("(pointer: coarse)").matches);
  const [backgroundReady, setBackgroundReady] = useState(false);
  const scene = useRef<ReliefScene | null>(null);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const element = dialog.current!;
    const previouslyFocused = document.activeElement;
    element.showModal();
    closeButton.current?.focus({ preventScroll: true });
    return () => {
      element.close();
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus();
    };
  }, []);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    let worker: Worker | null = null;
    let completeRelief: CityRelief | null = null;
    const previousCamera = { center: map.getCenter(), zoom: map.getZoom(), bearing: map.getBearing(), pitch: map.getPitch(), padding: map.getPadding() };
    const failed = (failure: Error): void => {
      if (!active) return;
      worker?.terminate();
      controller.abort();
      console.error("City relief creation failed", { cityId: city.id, failure });
      setReady(false);
      setError(failure.message);
    };
    const prepareGround = async (response: Extract<CityReliefResponse, { kind: "ground" }>): Promise<void> => {
      await frameReliefMap(map, response.bounds, controller.signal);
      const background = await createReliefBackground(map, controller.signal);
      if (!active) return;
      const layer = backgroundCanvas.current!;
      layer.width = background.image.width;
      layer.height = background.image.height;
      const context = layer.getContext("2d");
      if (!context) throw new Error(t("The 3D image could not be encoded as PNG. Close and reopen your 3D map."));
      context.drawImage(background.image, 0, 0);
      setBackgroundReady(true);
      scene.current = createReliefScene(canvas.current!, response.relief, background,
        progress => {
          canvas.current?.style.setProperty("filter", `drop-shadow(0 ${progress * 16}px ${progress * 12}px rgb(0 0 0 / ${progress * .30}))`);
        },
        () => { if (active) setReady(true); },
        failed);
      if (completeRelief) scene.current.revealBuildings(completeRelief);
    };
    const build = (): void => {
      try {
        worker = new Worker(new URL("../cityRelief.worker.ts", import.meta.url), { type: "module" });
        worker.addEventListener("error", event => failed(new Error(`City artwork worker failed: ${event.message}; ${event.filename}:${event.lineno}:${event.colno}`)));
        worker.addEventListener("message", (event: MessageEvent<CityReliefResponse>): void => {
          if (!active) return;
          try {
            const response = event.data;
            if (response.kind === "error") {
              const failure = new Error(response.message);
              failure.stack = response.stack;
              throw failure;
            }
            if (response.kind === "ground") {
              void prepareGround(response).catch(failure => {
                if (!controller.signal.aborted) failed(failure instanceof Error ? failure : new Error(String(failure)));
              });
            } else {
              completeRelief = response.relief;
              scene.current?.revealBuildings(response.relief);
              worker?.terminate();
            }
          } catch (failure) {
            failed(failure instanceof Error ? failure : new Error(String(failure)));
          }
        });
        const request: CityReliefRequest = { cells, city, sourceUrl: reliefBuildingSource(map.getStyle()), language: currentLanguage() };
        worker.postMessage(request);
      } catch (failure) {
        failed(failure instanceof Error ? failure : new Error(String(failure)));
      }
    };
    const frame = requestAnimationFrame(build);
    return () => {
      active = false;
      controller.abort();
      worker?.terminate();
      cancelAnimationFrame(frame);
      scene.current?.dispose();
      scene.current = null;
      map.jumpTo(previousCamera);
    };
  }, [cells, city, map]);

  useEffect(() => {
    const element = canvas.current!;
    const zoom = (event: WheelEvent): void => {
      if (!ready || saving) return;
      event.preventDefault();
      scene.current?.zoom(Math.exp(event.deltaY * .001));
    };
    element.addEventListener("wheel", zoom, { passive: false });
    return () => element.removeEventListener("wheel", zoom);
  }, [ready, saving]);

  const movePointer = (event: ReactPointerEvent<HTMLCanvasElement>): void => {
    if (!ready || saving) return;
    const previous = pointers.current.get(event.pointerId);
    if (!previous) return;
    event.preventDefault();
    const before = [...pointers.current.values()];
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY, button: previous.button });
    const after = [...pointers.current.values()];
    if (after.length === 2) {
      const radiansPerPixel = 2 * Math.PI / event.currentTarget.clientHeight;
      scene.current?.rotate(-(after[0].x + after[1].x - before[0].x - before[1].x) / 2 * radiansPerPixel);
      scene.current?.tilt(-(after[0].y + after[1].y - before[0].y - before[1].y) / 2 * radiansPerPixel);
      const oldDistance = Math.hypot(before[0].x - before[1].x, before[0].y - before[1].y);
      const newDistance = Math.hypot(after[0].x - after[1].x, after[0].y - after[1].y);
      if (oldDistance > 0 && newDistance > 0) scene.current?.zoom(oldDistance / newDistance);
    } else if (after.length === 1) {
      const x = event.clientX - previous.x;
      const y = event.clientY - previous.y;
      if (interaction === "rotate" || previous.button === 2) {
        const radiansPerPixel = 2 * Math.PI / event.currentTarget.clientHeight;
        scene.current?.rotate(-x * radiansPerPixel);
        scene.current?.tilt(-y * radiansPerPixel);
      } else scene.current?.pan(x, y);
    }
  };
  const endPointer = (event: ReactPointerEvent<HTMLCanvasElement>): void => {
    pointers.current.delete(event.pointerId);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const save = async (): Promise<void> => {
    if (!scene.current || saving) return;
    setSaving(true);
    setError("");
    try {
      const blob = await scene.current.image({ cityName: city.name, discoveredKm, percentage, createdAt: Date.now() });
      await saveReliefImage(blob, city.name);
    } catch (failure) {
      console.error("City relief export failed", { cityId: city.id, failure });
      setError(failure instanceof Error ? failure.message : t("Could not save your 3D map. Check available storage and try again."));
    } finally {
      setSaving(false);
    }
  };

  return <dialog ref={dialog} className={`city-keepsake${backgroundReady ? " city-keepsake--background-ready" : ""}${ready ? " city-keepsake--ready" : ""}${error ? " city-keepsake--error" : ""}`}
    data-testid="city-keepsake" aria-labelledby="keepsake-title"
    onCancel={event => { event.preventDefault(); if (!saving) onClose(); }}>
    <div className="city-keepsake__map-backdrop" aria-hidden="true"><canvas ref={backgroundCanvas} /></div>
    <canvas ref={canvas} className="city-keepsake__artwork" data-testid="keepsake-canvas" tabIndex={0}
      aria-label={t("3D discovery map of {{city}}. Use arrow keys to rotate, Shift and arrow keys to move, and plus or minus to zoom.", { city: city.name })}
      onContextMenu={event => event.preventDefault()}
      onPointerDown={event => {
        if (!ready || saving) return;
        event.preventDefault();
        setTouchControls(event.pointerType === "touch");
        pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY, button: event.button });
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={movePointer} onPointerUp={endPointer} onPointerCancel={endPointer}
      onLostPointerCapture={event => pointers.current.delete(event.pointerId)}
      onKeyDown={event => {
        if (!ready || saving) return;
        if (event.shiftKey && ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
          event.preventDefault();
          scene.current?.pan(event.key === "ArrowLeft" ? -30 : event.key === "ArrowRight" ? 30 : 0,
            event.key === "ArrowUp" ? -30 : event.key === "ArrowDown" ? 30 : 0);
          return;
        }
        if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
          event.preventDefault();
          scene.current?.rotate(event.key === "ArrowLeft" ? -.15 : .15);
        }
        if (event.key === "ArrowUp" || event.key === "ArrowDown") {
          event.preventDefault();
          scene.current?.tilt(event.key === "ArrowUp" ? -.15 : .15);
        }
        if (["+", "=", "-"].includes(event.key)) {
          event.preventDefault();
          scene.current?.zoom(["+", "="].includes(event.key) ? .9 : 1.1);
        }
      }} />
    <header className="city-keepsake__header">
      <div><span className="city-keepsake__eyebrow">{t("Your city, as artwork")}</span><h2 id="keepsake-title">{city.name}</h2></div>
      <button ref={closeButton} type="button" className="icon-button" data-testid="keepsake-close" aria-label={t("Close 3D map")} disabled={saving} onClick={onClose}><XIcon /></button>
    </header>
    <div className="city-keepsake__tools" role="group" aria-label={t("Artwork controls")}>
      <button type="button" data-testid="keepsake-move" aria-pressed={interaction === "move"}
        aria-label={t("Move artwork")} title={t("Move artwork")}
        disabled={!ready || saving} onClick={() => setInteraction("move")}><KeepsakeControlIcon path={mdiCursorMove} /></button>
      <button type="button" data-testid="keepsake-rotate" aria-pressed={interaction === "rotate"}
        aria-label={t("Rotate artwork")} title={t("Rotate artwork")}
        disabled={!ready || saving} onClick={() => setInteraction("rotate")}><KeepsakeControlIcon path={mdiRotate3dVariant} /></button>
      <button type="button" data-testid="keepsake-reset" aria-label={t("Reset view")} title={t("Reset view")}
        disabled={!ready || saving} onClick={() => scene.current?.reset()}><KeepsakeControlIcon path={mdiRestore} /></button>
      <button type="button" className="city-keepsake__save" data-testid="keepsake-save" aria-busy={saving}
        aria-label={saving ? t("Saving…") : t("Save image")} title={saving ? t("Saving…") : t("Save image")}
        disabled={!ready || saving} onClick={() => void save()}><KeepsakeControlIcon path={saving ? mdiLoading : mdiDownload} /></button>
    </div>
    <details className="city-keepsake__credits">
      <summary data-testid="keepsake-credits" aria-label={t("Map credits")} title={t("Map credits")}>{t("Map credits")}</summary>
      <div><a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap</a> · <a href="https://openmaptiles.org" target="_blank" rel="noreferrer">OpenMapTiles</a> · <a href="https://openfreemap.org" target="_blank" rel="noreferrer">OpenFreeMap</a></div>
    </details>
    <footer className="city-keepsake__footer">
      <p role={!ready && !error ? "status" : undefined}>{!ready && !error ? t("Creating your artwork…") : t("A relief of the places you discovered. Yours to keep.")}</p>
      <small>{touchControls && interaction === "move" ? t("One finger to move · Two fingers to rotate · Pinch to zoom") : interaction === "move" ? t("Drag to move · Pinch to zoom") : t("Drag to rotate · Pinch to zoom")}</small>
      {error && <p role="alert">{error}</p>}

    </footer>
  </dialog>;
}
