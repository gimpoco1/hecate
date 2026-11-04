import { mapRewardTheme, journeyHighlightColor, discoveryHighlightColor, navigationRouteHalo } from "../mapRewardPalette";
import type { MapReward } from "../goalRewards";
import { t, useAppTranslation } from "../i18n";
import { errorDiagnostic } from "../diagnostics";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import * as maplibregl from "maplibre-gl";
import type { Map as MapLibreMap } from "maplibre-gl";
import mapWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import "maplibre-gl/dist/maplibre-gl.css";
import {
  compassHeadingFromEvent,
  type CompassOrientationEvent,
} from "../deviceHeading";
import { favoritePlaceIconVector, type FavoritePlace } from "../favoritePlaces";
import {
  discoveryCellCenter,
  distanceKm,
  splitRoute,
} from "../geo";
import { DiscoveryFogLayer, type FogGeometry } from "../fogLayer";
import { loadMapStyle, MAP_STYLE_URL } from "../mapStyle";
import { useAppearance } from "../appearance";
import { applyMapAppearance } from "../mapAppearance";
import type { Coordinate, DiscoveryCell, MapMode } from "../types";

maplibregl.setWorkerUrl(mapWorkerUrl);

type Props = {
  reward?: MapReward;
  mode: MapMode;
  points: Coordinate[];
  cells: DiscoveryCell[];
  highlightedPoints: Coordinate[];
  highlightedNewGroundSegments: Coordinate[][];
  currentPoint?: Coordinate;
  navigationFollowing: boolean;
  onUserMarkerChange?: (marker: maplibregl.Marker | null) => void;
  locationState?: "idle" | "located" | "tracking";
  onMapClick?: () => void;
  onDestinationSelect?: (point: { lng: number; lat: number }) => void;
  onFavoritePlaceRequest?: (point: {
    lng: number;
    lat: number;
    suggestedName?: string;
  }) => void;
  onFavoriteSelect?: (favorite: FavoritePlace) => void;
  favoritePlacementActive?: boolean;
  favoritePlaces?: FavoritePlace[];
  selectedFavoritePlaceId?: string | null;
  onZoomChange: (zoom: number) => void;
  onViewChange?: (center: { lng: number; lat: number }, zoom: number) => void;
  onReady?: () => void;
  onUserNavigation?: () => void;
  onHeadingChange?: (heading: number) => void;
  onUserCenteredChange?: (centered: boolean) => void;
  mapRef: React.MutableRefObject<MapLibreMap | null>;
  fogLayerRef?: React.MutableRefObject<DiscoveryFogLayer | null>;
  initialBounds?: maplibregl.LngLatBoundsLike;
  initialCenter?: [number, number];
  initialZoom?: number;
};

type FollowCameraEvent = maplibregl.MapLibreEvent & {
  hecateFollowCamera?: boolean;
  hecateNavigationPoint?: { lng: number; lat: number };
};

function isUserCentered(map: MapLibreMap, point: Coordinate | undefined): boolean {
  if (!point) return false;
  const marker = map.project(point);
  const center = map.project(map.getCenter());
  return Math.hypot(marker.x - center.x, marker.y - center.y) <= 12;
}

function userMarkerClassName(
  locationState: NonNullable<Props["locationState"]>,
) {
  return `user-marker user-marker--${locationState}`;
}

function createUserMarkerElement(
  locationState: NonNullable<Props["locationState"]>,
) {
  const element = document.createElement("div");
  element.className = userMarkerClassName(locationState);
  element.innerHTML = `<span class="user-marker__direction" aria-hidden="true">
    <svg viewBox="0 0 44 44" focusable="false">
      <defs>
        <linearGradient id="user-direction-fill" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stop-color="#4285f4" stop-opacity="0.42" />
          <stop offset="0.58" stop-color="#637cff" stop-opacity="0.2" />
          <stop offset="1" stop-color="#7b73ff" stop-opacity="0" />
        </linearGradient>
        <filter id="user-direction-soften" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="0.65" />
        </filter>
      </defs>
      <path d="M22 43 L6 9 Q22 0 38 9 Z" fill="url(#user-direction-fill)" filter="url(#user-direction-soften)" />
      <path d="M22 42 L8 10 Q22 3 36 10 Z" fill="url(#user-direction-fill)" opacity="0.72" />
    </svg>
  </span><span class="user-marker__dot"></span>`;
  return element;
}

function updateUserMarkerHeading(
  element: HTMLElement,
  heading: number | undefined,
  mapBearing: number,
) {
  const validHeading =
    typeof heading === "number" && Number.isFinite(heading) && heading >= 0;
  if (element.classList.contains("user-marker--has-heading") !== validHeading)
    element.classList.toggle("user-marker--has-heading", validHeading);
  if (validHeading) {
    const value = `${heading - mapBearing}deg`;
    if (element.style.getPropertyValue("--user-heading") !== value)
      element.style.setProperty("--user-heading", value);
  } else {
    if (element.style.getPropertyValue("--user-heading"))
      element.style.removeProperty("--user-heading");
  }
}

function createFavoriteMarkerElement(
  favorite: FavoritePlace,
  selected: boolean,
  onSelect: (favorite: FavoritePlace) => void,
) {
  const element = document.createElement("button");
  element.type = "button";
  element.className = `favorite-marker${selected ? " favorite-marker--selected" : ""}`;
  element.setAttribute("aria-current", selected ? "true" : "false");
  element.setAttribute(
    "aria-label",
    favorite.name ? `Saved place: ${favorite.name}` : "Saved place",
  );
  element.dataset.favoriteId = favorite.id;
  const vector = favoritePlaceIconVector(favorite.icon);
  element.innerHTML = `<svg class="${vector.filled ? "favorite-icon--filled" : ""}" viewBox="${vector.viewBox}" preserveAspectRatio="xMidYMid meet" aria-hidden="true">${vector.markup}</svg>`;
  element.addEventListener("click", (event) => {
    event.stopPropagation();
    onSelect(favorite);
  });
  return element;
}

function suggestedPlaceName(map: MapLibreMap, point: maplibregl.PointLike) {
  const candidates = map
    .queryRenderedFeatures(point)
    .flatMap((feature) => {
      const name = feature.properties?.name;
      if (typeof name !== "string" || !name.trim()) return [];
      const layerId = feature.layer.id.toLowerCase();
      let priority = 0;
      if (/(poi|amenity|shop|restaurant|cafe)/.test(layerId)) priority += 50;
      if (/(park|landuse|building|landmark)/.test(layerId)) priority += 30;
      if (feature.geometry.type === "Point") priority += 20;
      return priority > 0 ? [{ name: name.trim(), priority }] : [];
    })
    .sort((first, second) => second.priority - first.priority);
  return candidates[0]?.name;
}

export const DiscoveryMap = memo(function DiscoveryMap({
  reward,
  mode,
  points,
  cells,
  highlightedPoints,
  highlightedNewGroundSegments,
  currentPoint,
  navigationFollowing,
  onUserMarkerChange,
  locationState = "idle",
  onMapClick,
  onDestinationSelect,
  onFavoritePlaceRequest,
  onFavoriteSelect,
  favoritePlacementActive = false,
  favoritePlaces = [],
  selectedFavoritePlaceId = null,
  onZoomChange,
  onViewChange,
  onReady,
  onUserNavigation,
  onHeadingChange,
  onUserCenteredChange,
  mapRef,
  fogLayerRef: externalFogLayerRef,
  initialBounds,
  initialCenter = [7, 24],
  initialZoom = 1.35,
}: Props) {
  useAppTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const onUserMarkerChangeRef = useRef(onUserMarkerChange);
  useEffect(() => { onUserMarkerChangeRef.current = onUserMarkerChange; }, [onUserMarkerChange]);
  const favoriteMarkersRef = useRef<maplibregl.Marker[]>([]);
  const fogLayerRef = useRef<DiscoveryFogLayer | null>(null);
  const currentPointRef = useRef(currentPoint);
  const locationStateRef = useRef(locationState);
  const onMapClickRef = useRef(onMapClick);
  const onDestinationSelectRef = useRef(onDestinationSelect);
  onDestinationSelectRef.current = onDestinationSelect;
  const onFavoritePlaceRequestRef = useRef(onFavoritePlaceRequest);
  const onFavoriteSelectRef = useRef(onFavoriteSelect);
  const favoritePlacementActiveRef = useRef(favoritePlacementActive);
  const highlightedPointsRef = useRef(highlightedPoints);
  const highlightedNewGroundSegmentsRef = useRef(highlightedNewGroundSegments);
  const onViewChangeRef = useRef(onViewChange);
  const onReadyRef = useRef(onReady);
  useEffect(() => { onReadyRef.current = onReady; }, [onReady]);
  const onUserNavigationRef = useRef(onUserNavigation);
  const onHeadingChangeRef = useRef(onHeadingChange);
  onHeadingChangeRef.current = onHeadingChange;
  const onUserCenteredChangeRef = useRef(onUserCenteredChange);
  onUserCenteredChangeRef.current = onUserCenteredChange;
  const compassHeadingRef = useRef<number | undefined>(undefined);
  const [mapStyle, setMapStyle] = useState<
    Awaited<ReturnType<typeof loadMapStyle>> | string | null
  >(null);
  const { theme: appTheme } = useAppearance();
  const theme = mapRewardTheme(reward ?? "standard", appTheme);
  const rewardRef = useRef(reward);
  rewardRef.current = reward;
  const themeRef = useRef(theme);
  themeRef.current = theme;
  const baseStyleRef = useRef<maplibregl.StyleSpecification | null>(null);
  useEffect(() => {
    if (mapRef.current && baseStyleRef.current) applyMapAppearance(mapRef.current, baseStyleRef.current, theme, reward ?? "standard");
    fogLayerRef.current?.setTheme(reward === "paper" ? "monochrome" : reward === "midnight" ? "celestial" : theme);
  }, [theme, reward, mapRef]);
  const geometry = useMemo<FogGeometry>(
    () => ({
      routeSegments: splitRoute(points),
      cellCenters: cells.map((cell) => discoveryCellCenter(cell)),
    }),
    [points, cells],
  );
  const stateRef = useRef({ mode, geometry });

  useEffect(() => {
    stateRef.current = { mode, geometry };
    fogLayerRef.current?.setMode(mode);
    fogLayerRef.current?.setGeometry(geometry);
  }, [mode, geometry]);
  useEffect(() => {
    currentPointRef.current = currentPoint;
  }, [currentPoint]);
  useEffect(() => {
    onMapClickRef.current = onMapClick;
  }, [onMapClick]);
  useEffect(() => {
    onFavoritePlaceRequestRef.current = onFavoritePlaceRequest;
  }, [onFavoritePlaceRequest]);
  useEffect(() => {
    onFavoriteSelectRef.current = onFavoriteSelect;
  }, [onFavoriteSelect]);
  useEffect(() => {
    favoritePlacementActiveRef.current = favoritePlacementActive;
  }, [favoritePlacementActive]);
  useEffect(() => {
    highlightedPointsRef.current = highlightedPoints;
    const map = mapRef.current;
    const fogLayer = fogLayerRef.current;
    if (map && fogLayer)
      syncHighlightedRoute(map, highlightedPoints, fogLayer.id, reward ?? "standard");
  }, [highlightedPoints, mapRef, reward]);
  useEffect(() => {
    highlightedNewGroundSegmentsRef.current = highlightedNewGroundSegments;
    const map = mapRef.current;
    const fogLayer = fogLayerRef.current;
    if (map && fogLayer)
      syncHighlightedDiscoveries(map, highlightedNewGroundSegments, fogLayer.id, reward ?? "standard");
  }, [highlightedNewGroundSegments, highlightedPoints, mapRef, theme, reward]);
  useEffect(() => {
    onViewChangeRef.current = onViewChange;
  }, [onViewChange]);
  useEffect(() => {
    onUserNavigationRef.current = onUserNavigation;
  }, [onUserNavigation]);
  useEffect(() => {
    const controller = new AbortController();
    void loadMapStyle(controller.signal)
      .then(setMapStyle)
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError")
          return;
        console.warn(
          "Map style could not be patched; using the original style",
          errorDiagnostic(error),
        );
        setMapStyle(MAP_STYLE_URL);
      });
    return () => controller.abort();
  }, []);
  useEffect(() => {
    locationStateRef.current = locationState;
    const element = markerRef.current?.getElement();
    const map = mapRef.current;
    if (element) {
      element.className = userMarkerClassName(locationState);
      updateUserMarkerHeading(
        element,
        compassHeadingRef.current ?? currentPointRef.current?.heading,
        map?.getBearing() ?? 0,
      );
    }
  }, [locationState]);

  useEffect(() => {
    let headingFrame: number | null = null;
    let pendingHeading: number | undefined;
    const updateHeading = (rawEvent: Event) => {
      const heading = compassHeadingFromEvent(
        rawEvent as CompassOrientationEvent,
      );
      if (heading === undefined) return;
      pendingHeading = heading;
      compassHeadingRef.current = heading;
      onHeadingChangeRef.current?.(heading);
      if (headingFrame !== null) return;
      headingFrame = requestAnimationFrame(() => {
        headingFrame = null;
        const element = markerRef.current?.getElement();
        const map = mapRef.current;
        if (element && map)
          updateUserMarkerHeading(element, pendingHeading, map.getBearing());
      });
    };
    window.addEventListener("deviceorientationabsolute", updateHeading, true);
    window.addEventListener("deviceorientation", updateHeading, true);
    return () => {
      if (headingFrame !== null) cancelAnimationFrame(headingFrame);
      window.removeEventListener(
        "deviceorientationabsolute",
        updateHeading,
        true,
      );
      window.removeEventListener("deviceorientation", updateHeading, true);
    };
  }, [mapRef]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || mapRef.current || !mapStyle) return;
    const nativeApp = Capacitor.isNativePlatform();
    const map = new maplibregl.Map({
      container,
      style: mapStyle,
      bounds: initialBounds,
      fitBoundsOptions: { padding: 28, maxZoom: 16 },
      center: initialCenter,
      zoom: initialZoom,
      pitch: 0,
      bearing: 0,
      attributionControl: false,
      maxZoom: 19,
      pixelRatio: Math.min(window.devicePixelRatio || 1, nativeApp ? 1.5 : 2),
      renderWorldCopies: false,
      fadeDuration: 0,
    });
    mapRef.current = map;

    if (import.meta.env.DEV)
      (window as Window & { __hecateMap?: MapLibreMap }).__hecateMap = map;
    map.addControl(
      new maplibregl.AttributionControl({ compact: true }),
      "bottom-right",
    );
    map.on("error", (event) =>
      console.error("Map rendering error", errorDiagnostic(event.error)),
    );
    map.on("style.load", () => {
      baseStyleRef.current = map.getStyle();
      applyMapAppearance(map, baseStyleRef.current, themeRef.current, rewardRef.current ?? "standard");
      map.setProjection({ type: "globe" });
      const fogLayer = new DiscoveryFogLayer(
        stateRef.current.geometry,
        stateRef.current.mode,
      );
      fogLayer.setTheme(rewardRef.current === "paper" ? "monochrome" : rewardRef.current === "midnight" ? "celestial" : themeRef.current);
      fogLayerRef.current = fogLayer;
      if (externalFogLayerRef) externalFogLayerRef.current = fogLayer;
      map.addLayer(fogLayer);
      if (highlightedNewGroundSegmentsRef.current.length > 0)
        syncHighlightedDiscoveries(map, highlightedNewGroundSegmentsRef.current, fogLayer.id, rewardRef.current ?? "standard");
      if (highlightedPointsRef.current.length > 0) {
        syncHighlightedRoute(
          map,
          highlightedPointsRef.current,
          fogLayer.id,
          rewardRef.current ?? "standard",
        );
      }
      const point = currentPointRef.current;
      if (point && !markerRef.current) {
        const element = createUserMarkerElement(locationStateRef.current);
        updateUserMarkerHeading(
          element,
          compassHeadingRef.current ?? point.heading,
          map.getBearing(),
        );
        markerRef.current = new maplibregl.Marker({ element, anchor: "center" })
          .setLngLat([point.lng, point.lat])
          .addTo(map);
        onUserMarkerChangeRef.current?.(markerRef.current);
      }
    });

    const handleRotate = () => {
      const point = currentPointRef.current;
      const element = markerRef.current?.getElement();
      if (point && element)
        updateUserMarkerHeading(
          element,
          compassHeadingRef.current ?? point.heading,
          map.getBearing(),
        );
    };
    let touchGestureActive = false;
    const handleTouchStart = (): void => {
      touchGestureActive = true;
    };
    const handleTouchEnd = (event: maplibregl.MapTouchEvent): void => {
      touchGestureActive = event.originalEvent.touches.length > 0;
    };
    const handleTouchCancel = (): void => {
      touchGestureActive = false;
    };
    const interruptCamera = (): void => {
      onUserNavigationRef.current?.();
    };
    const handlePointerDown = (event: PointerEvent): void => {
      if (event.pointerType === "touch") touchGestureActive = true;
      interruptCamera();
    };
    const canvas = map.getCanvas();
    canvas.addEventListener("pointerdown", handlePointerDown, { capture: true });
    canvas.addEventListener("wheel", interruptCamera, { capture: true, passive: true });
    const handleMoveEnd = (event: FollowCameraEvent) => {
      onUserCenteredChangeRef.current?.(isUserCentered(map, currentPointRef.current));
      if (touchGestureActive) return;
      const settledZoom = map.getZoom();
      onZoomChange(settledZoom);
      if (event.hecateFollowCamera) return;
      const center = map.getCenter();
      onViewChangeRef.current?.(
        { lng: center.lng, lat: center.lat },
        settledZoom,
      );
    };
    const handleViewMove = (event: FollowCameraEvent): void => {
      if (event.hecateFollowCamera) return;
      const center = map.getCenter();
      onViewChangeRef.current?.({ lng: center.lng, lat: center.lat }, map.getZoom());
    };
    const handleNavigationMove = (event: FollowCameraEvent): void => {
      if (event.hecateNavigationPoint) markerRef.current?.setLngLat(event.hecateNavigationPoint);
    };
    map.on("move", handleNavigationMove);
    map.on("touchstart", handleTouchStart);
    map.on("touchend", handleTouchEnd);
    map.on("touchcancel", handleTouchCancel);
    map.on("rotate", handleRotate);
    const handleUserNavigation = (event: maplibregl.MapMovementEvent): void => {
      if (event.originalEvent) onUserNavigationRef.current?.();
    };
    map.on("movestart", handleUserNavigation);
    map.on("rotatestart", handleUserNavigation);
    map.on("zoomstart", handleUserNavigation);
    map.on("click", (event) => {
      if (onDestinationSelectRef.current) {
        onDestinationSelectRef.current({ lng: event.lngLat.lng, lat: event.lngLat.lat });
        return;
      }
      if (favoritePlacementActiveRef.current) {
        onFavoritePlaceRequestRef.current?.({
          lng: event.lngLat.lng,
          lat: event.lngLat.lat,
          suggestedName: suggestedPlaceName(map, event.point),
        });
        return;
      }
      onMapClickRef.current?.();
    });
    map.on("moveend", handleMoveEnd);
    map.on("move", handleViewMove);
    onReadyRef.current?.();
    return () => {
      canvas.removeEventListener("pointerdown", handlePointerDown, true);
      canvas.removeEventListener("wheel", interruptCamera, true);
      baseStyleRef.current = null;
      fogLayerRef.current = null;
      if (externalFogLayerRef) externalFogLayerRef.current = null;
      markerRef.current?.remove();
      markerRef.current = null;
      onUserCenteredChangeRef.current?.(false);
      onUserMarkerChangeRef.current?.(null);
      favoriteMarkersRef.current.forEach((marker) => marker.remove());
      favoriteMarkersRef.current = [];
      map.remove();
      mapRef.current = null;
    };
  }, [externalFogLayerRef, mapRef, mapStyle, onZoomChange]);

  useEffect(() => {
    const map = mapRef.current;
    const start = highlightedPoints[0];
    const finish = highlightedPoints.at(-1);
    if (!map || !start || !finish) return;
    const nearStart = distanceKm(start, finish) < 0.02;
    const endpoints = [
      { point: start, label: t("Journey start"), className: "journey-endpoint--start", offset: nearStart ? -15 : 0 },
      { point: finish, label: t("Journey finish"), className: "journey-endpoint--finish", offset: nearStart ? 15 : 0 },
    ];
    const markers = endpoints.map(endpoint => {
      const element = document.createElement("div");
      element.className = `journey-endpoint ${endpoint.className}`;
      element.setAttribute("role", "img");
      element.setAttribute("aria-label", endpoint.label);
      element.title = endpoint.label;
      return new maplibregl.Marker({ element, anchor: "center", offset: [endpoint.offset, 0] })
        .setLngLat([endpoint.point.lng, endpoint.point.lat]).addTo(map);
    });
    return () => markers.forEach(marker => marker.remove());
  }, [highlightedPoints, mapRef, mapStyle]);

  useEffect(() => {
    const map = mapRef.current;
    if (!currentPoint) {
      onUserCenteredChangeRef.current?.(false);
      markerRef.current?.remove();
      markerRef.current = null;
      onUserMarkerChangeRef.current?.(null);
      compassHeadingRef.current = undefined;
      return;
    }
    if (!map) return;
    onUserCenteredChangeRef.current?.(isUserCentered(map, currentPoint));
    if (!markerRef.current) {
      const element = createUserMarkerElement(locationStateRef.current);
      updateUserMarkerHeading(
        element,
        compassHeadingRef.current ?? currentPoint.heading,
        map.getBearing(),
      );
      markerRef.current = new maplibregl.Marker({ element, anchor: "center" })
        .setLngLat([currentPoint.lng, currentPoint.lat])
        .addTo(map);
      onUserMarkerChangeRef.current?.(markerRef.current);
    } else {
      if (!navigationFollowing) markerRef.current.setLngLat([currentPoint.lng, currentPoint.lat]);
      updateUserMarkerHeading(
        markerRef.current.getElement(),
        compassHeadingRef.current ?? currentPoint.heading,
        map.getBearing(),
      );
    }
  }, [currentPoint, mapRef, navigationFollowing]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    favoriteMarkersRef.current.forEach((marker) => marker.remove());
    favoriteMarkersRef.current = favoritePlaces.map((favorite) => {
      const element = createFavoriteMarkerElement(
        favorite,
        favorite.id === selectedFavoritePlaceId,
        (selected) => onFavoriteSelectRef.current?.(selected),
      );
      return new maplibregl.Marker({ element, anchor: "bottom" })
        .setLngLat([favorite.lng, favorite.lat])
        .addTo(map);
    });
    return () => {
      favoriteMarkersRef.current.forEach((marker) => marker.remove());
      favoriteMarkersRef.current = [];
    };
  }, [favoritePlaces, mapRef, mapStyle, onZoomChange]);

  useEffect(() => {
    favoriteMarkersRef.current.forEach((marker) => {
      const element = marker.getElement();
      const selected = element.dataset.favoriteId === selectedFavoritePlaceId;
      element.classList.toggle("favorite-marker--selected", selected);
      element.setAttribute("aria-current", selected ? "true" : "false");
    });
  }, [selectedFavoritePlaceId]);

  return (
    <div
      data-testid="discovery-map"
      className={`map-stage${reward === "paper" ? " map-stage--monochrome" : ""}${favoritePlacementActive ? " map-stage--placing-favorite" : ""}`}
    >
      <div
        ref={containerRef}
        className="map"
        aria-label={t("Interactive discovery map")}
      />
      {(highlightedPoints.length > 0 || highlightedNewGroundSegments.length > 0) && (
        <aside className="map-highlight-legend" data-testid="map-highlight-legend" aria-label={t("Map legend")}>
          {highlightedPoints.length > 0 && <span><i className="map-highlight-legend__journey" style={{ background: journeyHighlightColor(reward ?? "standard") }} aria-hidden="true" />{t("Travelled")}</span>}
          {highlightedNewGroundSegments.length > 0 && <span><i className="map-highlight-legend__new" style={{ background: reward === "paper" ? "transparent" : discoveryHighlightColor(reward ?? "standard"), borderTop: reward === "paper" ? `2px dashed ${discoveryHighlightColor("paper")}` : undefined }} aria-hidden="true" />{t("New ground")}</span>}
        </aside>
      )}
    </div>
  );
});

/** Keep discoveries above the journey trace regardless of overlay creation order. */
function orderJourneyHighlights(map: MapLibreMap, beforeLayerId: string): void {
  const layerIds = ["hecate-highlighted-route-halo", "hecate-highlighted-route-line", "hecate-highlighted-discoveries-shadow", "hecate-highlighted-discoveries-streets"];
  const layers = map.getStyle().layers.map(layer => layer.id);
  const expected = layerIds.filter(id => layers.includes(id));
  const anchorIndex = layers.indexOf(beforeLayerId);
  if (expected.every((id, index) => layers[anchorIndex - expected.length + index] === id)) return;
  for (const id of expected) map.moveLayer(id, beforeLayerId);
}

function syncHighlightedDiscoveries(
  map: MapLibreMap,
  segments: Coordinate[][],
  beforeLayerId: string,
  reward: MapReward,
): void {
  const sourceId = "hecate-highlighted-discoveries";
  const layerId = "hecate-highlighted-discoveries-streets";
  const shadowLayerId = "hecate-highlighted-discoveries-shadow";
  const source = map.getSource(sourceId) as maplibregl.GeoJSONSource | undefined;
  if (segments.length === 0) {
    if (map.getLayer(layerId)) map.removeLayer(layerId);
    if (map.getLayer(shadowLayerId)) map.removeLayer(shadowLayerId);
    if (source) map.removeSource(sourceId);
    return;
  }
  const data: GeoJSON.Feature<GeoJSON.MultiLineString> = {
    type: "Feature",
    properties: {},
    geometry: { type: "MultiLineString", coordinates: segments.map(segment => segment.map(point => [point.lng, point.lat])) },
  };
  if (source) source.setData(data);
  else map.addSource(sourceId, { type: "geojson", data });
  if (map.getLayer(shadowLayerId)) {
    map.setPaintProperty(shadowLayerId, "line-color", navigationRouteHalo(reward));
  } else map.addLayer({
    id: shadowLayerId,
    type: "line",
    source: sourceId,
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": navigationRouteHalo(reward), "line-width": 9, "line-opacity": 1 },
  }, beforeLayerId);
  if (!map.getLayer(layerId)) map.addLayer({
    id: layerId,
    type: "line",
    source: sourceId,
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": discoveryHighlightColor(reward), "line-width": 5, "line-opacity": 1 },
  }, beforeLayerId);
  map.setPaintProperty(layerId, "line-color", discoveryHighlightColor(reward));
  map.setPaintProperty(layerId, "line-dasharray", reward === "paper" ? [2, 1.5] : undefined);
  orderJourneyHighlights(map, beforeLayerId);
}

function highlightedRouteData(points: Coordinate[]) {
  return {
    type: "Feature" as const,
    properties: {},
    geometry: {
      type: "MultiLineString" as const,
      coordinates: splitRoute(points)
        .filter((segment) => segment.length >= 2)
        .map(segment => segment.map(point => [point.lng, point.lat])),
    },
  };
}

function syncHighlightedRoute(
  map: MapLibreMap,
  points: Coordinate[],
  beforeLayerId: string,
  reward: MapReward,
): void {
  const sourceId = "hecate-highlighted-route";
  const haloLayerId = "hecate-highlighted-route-halo";
  const lineLayerId = "hecate-highlighted-route-line";
  const source = map.getSource(sourceId) as
    | maplibregl.GeoJSONSource
    | undefined;

  if (points.length === 0) {
    if (map.getLayer(lineLayerId)) map.removeLayer(lineLayerId);
    if (map.getLayer(haloLayerId)) map.removeLayer(haloLayerId);
    if (source) map.removeSource(sourceId);
    return;
  }
  if (!map.getLayer(beforeLayerId)) return;
  if (source) source.setData(highlightedRouteData(points));
  else map.addSource(sourceId, {
    type: "geojson",
    data: highlightedRouteData(points),
  });
  if (!map.getLayer(haloLayerId)) map.addLayer(
    {
      id: haloLayerId,
      type: "line",
      source: sourceId,
      paint: {
        "line-color": reward === "standard" ? "rgba(255, 255, 255, 0.94)" : navigationRouteHalo(reward),
        "line-width": 10,
        "line-opacity": 0.9,
      },
      layout: { "line-cap": "round", "line-join": "round" },
    },
    beforeLayerId,
  );
  if (!map.getLayer(lineLayerId)) map.addLayer(
    {
      id: lineLayerId,
      type: "line",
      source: sourceId,
      paint: {
        "line-color": journeyHighlightColor(reward),
        "line-width": 6,
        "line-opacity": reward === "standard" ? 0.85 : 1,
      },
      layout: { "line-cap": "round", "line-join": "round" },
    },
    beforeLayerId,
  );
  map.setPaintProperty(haloLayerId, "line-color", reward === "standard" ? "rgba(255, 255, 255, 0.94)" : navigationRouteHalo(reward));
  map.setPaintProperty(lineLayerId, "line-color", journeyHighlightColor(reward));
  map.setPaintProperty(lineLayerId, "line-opacity", reward === "standard" ? 0.85 : 1);
  orderJourneyHighlights(map, beforeLayerId);
}
