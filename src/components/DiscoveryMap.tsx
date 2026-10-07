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
  splitRoute,
} from "../geo";
import { DiscoveryFogLayer, type FogGeometry } from "../fogLayer";
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
  onUserNavigation?: () => void;
  mapRef: React.MutableRefObject<MapLibreMap | null>;
  fogLayerRef?: React.MutableRefObject<DiscoveryFogLayer | null>;
  initialCenter?: [number, number];
  initialZoom?: number;
};

type FollowCameraEvent = maplibregl.MapLibreEvent & {
  hecateFollowCamera?: boolean;
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
  onUserNavigation,
  mapRef,
  fogLayerRef: externalFogLayerRef,
  initialCenter = [7, 24],
  initialZoom = 1.35,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const favoriteMarkersRef = useRef<maplibregl.Marker[]>([]);
  const fogLayerRef = useRef<DiscoveryFogLayer | null>(null);
  const currentPointRef = useRef(currentPoint);
  const locationStateRef = useRef(locationState);
  const onMapClickRef = useRef(onMapClick);
  const onFavoritePlaceRequestRef = useRef(onFavoritePlaceRequest);
  const onFavoriteSelectRef = useRef(onFavoriteSelect);
  const favoritePlacementActiveRef = useRef(favoritePlacementActive);
  const onViewChangeRef = useRef(onViewChange);
  const onUserNavigationRef = useRef(onUserNavigation);
  const compassHeadingRef = useRef<number | undefined>(undefined);
  const [mapStyle, setMapStyle] = useState<
    Awaited<ReturnType<typeof loadMapStyle>> | string | null
  >(null);
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
      const fogLayer = new DiscoveryFogLayer(
        stateRef.current.geometry,
        stateRef.current.mode,
      );
      fogLayerRef.current = fogLayer;
      if (externalFogLayerRef) externalFogLayerRef.current = fogLayer;
      map.addLayer(fogLayer);
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
    const handleMoveEnd = (event: FollowCameraEvent) => {
      if (event.hecateFollowCamera || touchGestureActive) return;
      const center = map.getCenter();
      const settledZoom = map.getZoom();
      onZoomChange(settledZoom);
      onViewChangeRef.current?.(
        { lng: center.lng, lat: center.lat },
        settledZoom,
      );
    };
    map.on("touchstart", handleTouchStart);
    map.on("touchend", handleTouchEnd);
    map.on("touchcancel", handleTouchCancel);
    map.on("rotate", handleRotate);
    map.on("dragstart", () => onUserNavigationRef.current?.());
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
    return () => {
      fogLayerRef.current = null;
      if (externalFogLayerRef) externalFogLayerRef.current = null;
      markerRef.current?.remove();
      favoriteMarkersRef.current.forEach((marker) => marker.remove());
      favoriteMarkersRef.current = [];
      map.remove();
      mapRef.current = null;
    };
  }, [externalFogLayerRef, mapRef, mapStyle, onZoomChange]);

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
    </div>
  );
});
