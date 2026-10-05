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
  DISCOVERY_RADIUS_M,
  discoveryCellCenter,
  metersToPixels,
  splitRoute,
} from "../geo";
import { loadMapStyle, MAP_STYLE_URL } from "../mapStyle";
import type { Coordinate, DiscoveryCell, MapMode } from "../types";

maplibregl.setWorkerUrl(mapWorkerUrl);

type Props = {
  mode: MapMode;
  points: Coordinate[];
  cells: DiscoveryCell[];
  currentPoint?: Coordinate;
  locationState?: "idle" | "located" | "tracking";
  onMapClick?: () => void;
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
  mapRef: React.MutableRefObject<MapLibreMap | null>;
  initialCenter?: [number, number];
  initialZoom?: number;
};

type MistGeometry = {
  routeSegments: Coordinate[][];
  cellCenters: [number, number][];
};

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

function drawMist(
  canvas: HTMLCanvasElement,
  map: MapLibreMap,
  geometry: MistGeometry,
  mode: MapMode,
  pixelRatio: number,
  viewportSize: { width: number; height: number },
) {
  const moving = map.isMoving();
  const width = Math.round(viewportSize.width * pixelRatio);
  const height = Math.round(viewportSize.height * pixelRatio);
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }

  const context = canvas.getContext("2d");
  if (!context) return;
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  context.clearRect(0, 0, viewportSize.width, viewportSize.height);

  const zoomFade = Math.max(0, Math.min(1, (map.getZoom() - 5.5) / 2.5));
  if (mode !== "discover" || zoomFade === 0) return;

  const fogColor = `rgba(239, 240, 234, ${0.9 * zoomFade})`;
  context.fillStyle = fogColor;
  context.fillRect(0, 0, viewportSize.width, viewportSize.height);

  if (
    geometry.routeSegments.length === 0 &&
    geometry.cellCenters.length === 0
  ) {
    context.fillStyle = `rgba(35, 58, 49, ${0.12 * zoomFade})`;
    context.font = "600 13px system-ui";
    context.textAlign = "center";
    context.fillText(
      "Your first discovery will reveal the map",
      viewportSize.width / 2,
      viewportSize.height / 2 - 36,
    );
    return;
  }

  const bounds = map.getBounds();
  const longitudeSpan = bounds.getEast() - bounds.getWest();
  const latitudeSpan = bounds.getNorth() - bounds.getSouth();
  const filterToViewport = map.getZoom() >= 5 && longitudeSpan > 0;
  const west = bounds.getWest() - longitudeSpan * 0.2;
  const east = bounds.getEast() + longitudeSpan * 0.2;
  const south = bounds.getSouth() - latitudeSpan * 0.2;
  const north = bounds.getNorth() + latitudeSpan * 0.2;
  const isNearViewport = ([lng, lat]: [number, number]) =>
    !filterToViewport ||
    (lng >= west && lng <= east && lat >= south && lat <= north);
  const projectedSegments = geometry.routeSegments
    .map((segment) =>
      segment
        .filter((point) => isNearViewport([point.lng, point.lat]))
        .map((point) => map.project([point.lng, point.lat])),
    )
    .filter((segment) => segment.length > 0);
  const projectedCells = geometry.cellCenters
    .filter(isNearViewport)
    .map((center) => map.project(center))
    .filter(
      (point) =>
        point.x > -200 &&
        point.x < viewportSize.width + 200 &&
        point.y > -200 &&
        point.y < viewportSize.height + 200,
    );
  const path = new Path2D();
  projectedSegments.forEach((projected) =>
    projected.forEach((point, index) => {
      if (index === 0) {
        path.moveTo(point.x, point.y);
        if (projected.length === 1) path.lineTo(point.x + 0.01, point.y);
      } else path.lineTo(point.x, point.y);
    }),
  );
  projectedCells.forEach((point) => {
    path.moveTo(point.x, point.y);
    path.lineTo(point.x + 0.01, point.y);
  });

  context.lineCap = "round";
  context.lineJoin = "round";

  // Canvas strokes use pixels, but discovery has a fixed real-world radius.
  // Recalculate every frame so zooming changes its pixel size, not its ground area.
  const widthForMeters = (meters: number) =>
    Math.max(0.5, metersToPixels(meters, map.getCenter().lat, map.getZoom()));
  const revealDiameterM = DISCOVERY_RADIUS_M * 2;

  // Thin nested boundaries make the surrounding mist read like topographic
  // contours instead of a generic blur. Their spacing stays constant on earth.
  const contourScales = moving
    ? [2.6, 1.8]
    : [3, 2.8, 2.6, 2.4, 2.2, 2, 1.8, 1.6, 1.4, 1.2];
  contourScales
    .map((scale) => revealDiameterM * scale)
    .forEach((widthM, index) => {
      const outerWidth = widthForMeters(widthM);
      if (outerWidth < 1.5) return;
      context.globalCompositeOperation = "source-over";
      context.lineWidth = outerWidth;
      context.strokeStyle = `rgba(66, 81, 74, ${(0.09 + index * 0.004) * zoomFade})`;
      context.stroke(path);

      // Cut out the middle of the broad stroke and restore fog there, leaving
      // only a fine boundary on each side of the explored shape.
      const innerWidth = Math.max(
        0.5,
        outerWidth - Math.min(1.4, outerWidth * 0.2),
      );
      context.globalCompositeOperation = "destination-out";
      context.lineWidth = innerWidth;
      context.strokeStyle = "#000";
      context.stroke(path);
      context.globalCompositeOperation = "source-over";
      context.lineWidth = innerWidth;
      context.strokeStyle = fogColor;
      context.stroke(path);
    });

  // A layered erase exposes the actual map with a luminous, feathered edge.
  context.globalCompositeOperation = "destination-out";
  const revealLayers = moving
    ? [
        { widthM: revealDiameterM * 1.28, alpha: 0.48 },
        { widthM: revealDiameterM, alpha: 0.94 },
      ]
    : [
        { widthM: revealDiameterM * 1.87, alpha: 0.12 },
        { widthM: revealDiameterM * 1.62, alpha: 0.2 },
        { widthM: revealDiameterM * 1.38, alpha: 0.32 },
        { widthM: revealDiameterM * 1.18, alpha: 0.54 },
        { widthM: revealDiameterM, alpha: 0.94 },
      ];
  revealLayers.forEach((layer) => {
    context.lineWidth = widthForMeters(layer.widthM);
    context.strokeStyle = `rgba(0, 0, 0, ${layer.alpha * zoomFade})`;
    context.stroke(path);
  });

  // The reference carries a subtle yellow-green glow in explored territory,
  // while streets and labels remain the map's own artwork underneath.
  context.globalCompositeOperation = "source-over";
  context.lineWidth = widthForMeters(revealDiameterM * 0.97);
  context.strokeStyle = `rgba(190, 224, 74, ${0.13 * zoomFade})`;
  context.stroke(path);
}

export const DiscoveryMap = memo(function DiscoveryMap({
  mode,
  points,
  cells,
  currentPoint,
  locationState = "idle",
  onMapClick,
  onFavoritePlaceRequest,
  onFavoriteSelect,
  favoritePlacementActive = false,
  favoritePlaces = [],
  selectedFavoritePlaceId = null,
  onZoomChange,
  onViewChange,
  mapRef,
  initialCenter = [7, 24],
  initialZoom = 1.35,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const favoriteMarkersRef = useRef<maplibregl.Marker[]>([]);
  const currentPointRef = useRef(currentPoint);
  const locationStateRef = useRef(locationState);
  const onMapClickRef = useRef(onMapClick);
  const onFavoritePlaceRequestRef = useRef(onFavoritePlaceRequest);
  const onFavoriteSelectRef = useRef(onFavoriteSelect);
  const favoritePlacementActiveRef = useRef(favoritePlacementActive);
  const onViewChangeRef = useRef(onViewChange);
  const compassHeadingRef = useRef<number | undefined>(undefined);
  const redrawRef = useRef<((force?: boolean) => void) | null>(null);
  const [mapStyle, setMapStyle] = useState<
    Awaited<ReturnType<typeof loadMapStyle>> | string | null
  >(null);
  const geometry = useMemo<MistGeometry>(
    () => ({
      routeSegments: splitRoute(points),
      cellCenters: cells.map((cell) => discoveryCellCenter(cell)),
    }),
    [points, cells],
  );
  const stateRef = useRef({ mode, geometry });

  useEffect(() => {
    stateRef.current = { mode, geometry };
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
    onViewChangeRef.current = onViewChange;
  }, [onViewChange]);
  useEffect(() => {
    const controller = new AbortController();
    void loadMapStyle(controller.signal)
      .then(setMapStyle)
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError")
          return;
        console.warn(
          "Map style could not be patched; using the original style",
          error,
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
      if (headingFrame !== null) return;
      headingFrame = requestAnimationFrame(() => {
        headingFrame = null;
        compassHeadingRef.current = pendingHeading;
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
    const mistPixelRatio = Math.min(
      window.devicePixelRatio || 1,
      nativeApp ? 1 : 1.5,
    );
    const map = new maplibregl.Map({
      container,
      style: mapStyle,
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
      "bottom-left",
    );
    map.on("error", (event) =>
      console.error("Map rendering error", event.error),
    );

    map.on("style.load", () => {
      map.setProjection({ type: "globe" });
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
      }
    });

    let lastInteractionDrawAt = 0;
    let viewportSize = {
      width: container.clientWidth,
      height: container.clientHeight,
    };
    const redraw = (force = false) => {
      if (!canvasRef.current) return;
      const now = performance.now();
      if (!force && map.isMoving() && now - lastInteractionDrawAt < 34) return;
      lastInteractionDrawAt = now;
      drawMist(
        canvasRef.current,
        map,
        stateRef.current.geometry,
        stateRef.current.mode,
        mistPixelRatio,
        viewportSize,
      );
    };
    redrawRef.current = redraw;
    const handleMove = () => {
      redraw();
      const point = currentPointRef.current;
      const element = markerRef.current?.getElement();
      if (point && element)
        updateUserMarkerHeading(
          element,
          compassHeadingRef.current ?? point.heading,
          map.getBearing(),
        );
    };
    const handleMoveEnd = () => {
      redraw(true);
      const center = map.getCenter();
      const settledZoom = map.getZoom();
      onZoomChange(settledZoom);
      onViewChangeRef.current?.(
        { lng: center.lng, lat: center.lat },
        settledZoom,
      );
    };
    const handleResize = () => {
      viewportSize = {
        width: container.clientWidth,
        height: container.clientHeight,
      };
      redraw(true);
    };
    map.on("move", handleMove);
    map.on("click", (event) => {
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
    map.on("resize", handleResize);
    return () => {
      redrawRef.current = null;
      markerRef.current?.remove();
      favoriteMarkersRef.current.forEach((marker) => marker.remove());
      favoriteMarkersRef.current = [];
      map.remove();
      mapRef.current = null;
    };
  }, [mapRef, mapStyle, onZoomChange]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    stateRef.current = { mode, geometry };
    redrawRef.current?.(true);
  }, [mapRef, mode, geometry]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !currentPoint) return;
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
    } else {
      markerRef.current.setLngLat([currentPoint.lng, currentPoint.lat]);
      updateUserMarkerHeading(
        markerRef.current.getElement(),
        compassHeadingRef.current ?? currentPoint.heading,
        map.getBearing(),
      );
    }
  }, [currentPoint, mapRef]);

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
  }, [favoritePlaces, mapRef]);

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
      className={`map-stage${favoritePlacementActive ? " map-stage--placing-favorite" : ""}`}
    >
      <div
        ref={containerRef}
        className="map"
        aria-label="Interactive discovery map"
      />
      <canvas
        ref={canvasRef}
        className={`mist mist--${mode}`}
        aria-hidden="true"
      />
    </div>
  );
});
