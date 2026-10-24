import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { GeoJSONSource, Map as MapLibreMap } from "maplibre-gl";
import {
  findExplorationRoutes,
  calculateDirectRoute,
  DestinationTooCloseError,
  DestinationTooFarError,
  MAX_ROUTE_DISTANCE_KM,
  ROUTE_BUDGETS,
  routesForExtraTime,
  type PlannedRoute,
  type RoutePlan,
  type RoutePoint,
  type TransportMode,
} from "../explorationRouting";
import type { DiscoveryCell } from "../types";
import { DestinationSearch } from "./DestinationSearch";
import type { DestinationResult } from "../destinationSearch";
import { ArrowLeftIcon, CyclingIcon, InfoIcon, RouteIcon, WalkingIcon, XIcon } from "./Icons";

export type RouteDestination = RoutePoint & { name?: string };

type Props = {
  open: boolean;
  destination: RouteDestination | null;
  origin: RoutePoint | null;
  cells: DiscoveryCell[];
  ready: boolean;
  tracking: boolean;
  mapRef: React.MutableRefObject<MapLibreMap | null>;
  onDestinationSelect: (point: RoutePoint) => void;
  onClose: () => void;
  onReturnToJourney: () => void;
  onClear: () => void;
  onLocate: () => void;
  onStart: (route: PlannedRoute) => void;
};

const SOURCE = "hecate-exploration-plan";
const LAYERS = [
  "hecate-plan-base",
  "hecate-plan-halo",
  "hecate-plan-selected",
  "hecate-plan-destination",
];

export function ExplorationRoutePlanner({
  open,
  destination,
  origin,
  cells,
  ready,
  tracking,
  mapRef,
  onDestinationSelect,
  onClose,
  onReturnToJourney,
  onClear,
  onLocate,
  onStart,
}: Props) {
  const infoId = useId();
  const [infoOpen, setInfoOpen] = useState(false);
  const [searchRevision, setSearchRevision] = useState(0);
  const [step, setStep] = useState<"destination" | "options">("destination");
  const [mode, setMode] = useState<TransportMode>("pedestrian");
  const [budget, setBudget] = useState(0);
  const [explorationPlan, setExplorationPlan] = useState<RoutePlan | null>(null);
  const [directPlans, setDirectPlans] = useState<Record<TransportMode, RoutePlan | null>>({ pedestrian: null, bicycle: null });
  const [directErrors, setDirectErrors] = useState<Record<TransportMode, string>>({ pedestrian: "", bicycle: "" });
  const [directPending, setDirectPending] = useState(false);
  const [destinationError, setDestinationError] = useState<{ title: string; message: string } | null>(null);
  const [walkingRangeError, setWalkingRangeError] = useState("");
  const [directRevision, setDirectRevision] = useState(0);
  const [namedDestination, setNamedDestination] = useState<DestinationResult | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const controllerRef = useRef<AbortController | null>(null);
  const panelRef = useRef<HTMLElement>(null);
  const originRef = useRef(origin);
  const cellsRef = useRef(cells);
  originRef.current = origin;
  cellsRef.current = cells;
  const originAvailable = origin !== null;
  const directRoute = directPlans[mode]?.routes[0];
  const plan = explorationPlan ?? directPlans[mode];
  const routes = useMemo(() => {
    if (!plan) return [];
    return step === "destination" || budget === 0 ? [plan.routes[0]] : routesForExtraTime(plan);
  }, [plan, step, budget]);
  const selected = routes.find(({ id }) => id === selectedId) ?? routes[1] ?? routes[0];
  const destinationLabel = destination?.name ?? (namedDestination && destination && namedDestination.point.lng === destination.lng && namedDestination.point.lat === destination.lat
    ? namedDestination.name : "Selected destination");

  useEffect(() => {
    controllerRef.current?.abort();
    setExplorationPlan(null); setSelectedId(""); setPending(false); setError("");
    setStep("destination"); setBudget(0);
    setDirectPlans({ pedestrian: null, bicycle: null });
    setDirectErrors({ pedestrian: "", bicycle: "" });
    setDestinationError(null);
    setWalkingRangeError("");
    const start = originRef.current;
    if (!destination || !start || !ready) { setDirectPending(false); return; }
    const controller = new AbortController();
    setDirectPending(true);
    const load = async (profile: TransportMode): Promise<void> => {
      try {
        const result = await calculateDirectRoute(start, destination, cellsRef.current, profile, controller.signal);
        if (!controller.signal.aborted) setDirectPlans((current) => ({ ...current, [profile]: result }));
      } catch (cause) {
        if (controller.signal.aborted) return;
        if (cause instanceof DestinationTooCloseError) {
          setDestinationError({ title: "This destination is too close", message: cause.message });
          return;
        }
        if (cause instanceof DestinationTooFarError) {
          if (profile === "pedestrian") setWalkingRangeError(cause.message);
          else setDestinationError({ title: "This destination is too far", message: `Choose somewhere closer. Walking routes support destinations within ${MAX_ROUTE_DISTANCE_KM.pedestrian} km and cycling routes within ${MAX_ROUTE_DISTANCE_KM.bicycle} km.` });
          return;
        }
        console.error("Could not calculate direct route", { start, destination, profile, cause });
        setDirectErrors((current) => ({ ...current, [profile]: cause instanceof Error ? cause.message : "Could not calculate this direct route." }));
      }
    };
    void Promise.all([load("pedestrian"), load("bicycle")]).finally(() => {
      if (!controller.signal.aborted) setDirectPending(false);
    });
    return () => controller.abort();
  }, [destination, originAvailable, ready, directRevision]);

  useEffect(() => {
    if (!open) { controllerRef.current?.abort(); setPending(false); setInfoOpen(false); }
    return () => controllerRef.current?.abort();
  }, [open]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    let rendered = false;
    const render = (): void => {
      if (rendered || !map.isStyleLoaded()) return;
      rendered = true;
      const features: GeoJSON.Feature[] = [];
      if (destination && (open || plan))
        features.push({
          type: "Feature",
          properties: { kind: "destination" },
          geometry: {
            type: "Point",
            coordinates: [destination.lng, destination.lat],
          },
        });
      if (plan && selected) {
        for (const route of !open || plan.routes[0] === selected
          ? [selected]
          : [plan.routes[0], selected])
          features.push({
            type: "Feature",
            properties: { kind: route === selected ? "selected" : "baseline" },
            geometry: {
              type: "LineString",
              coordinates: route.points.map(({ lng, lat }) => [lng, lat]),
            },
          });
      }
      const data: GeoJSON.FeatureCollection = {
        type: "FeatureCollection",
        features,
      };
      const source = map.getSource(SOURCE) as GeoJSONSource | undefined;
      if (source) source.setData(data);
      else {
        map.addSource(SOURCE, { type: "geojson", data });
        map.addLayer({
          id: LAYERS[0],
          type: "line",
          source: SOURCE,
          filter: ["==", "kind", "baseline"],
          paint: {
            "line-color": "#758580",
            "line-width": 5,
            "line-opacity": 0.8,
            "line-dasharray": [2, 2],
          },
          layout: { "line-cap": "round", "line-join": "round" },
        });
        map.addLayer({
          id: LAYERS[1],
          type: "line",
          source: SOURCE,
          filter: ["==", "kind", "selected"],
          paint: { "line-color": "#f7f4ed", "line-width": 9 },
          layout: { "line-cap": "round", "line-join": "round" },
        });
        map.addLayer({
          id: LAYERS[2],
          type: "line",
          source: SOURCE,
          filter: ["==", "kind", "selected"],
          paint: { "line-color": "#738f28", "line-width": 5 },
          layout: { "line-cap": "round", "line-join": "round" },
        });
        map.addLayer({
          id: LAYERS[3],
          type: "circle",
          source: SOURCE,
          filter: ["==", "kind", "destination"],
          paint: {
            "circle-radius": 8,
            "circle-color": "#183c2f",
            "circle-stroke-width": 3,
            "circle-stroke-color": "#f7f4ed",
          },
        });
      }
    };
    const reload = (): void => {
      rendered = false;
      render();
    };
    render();
    map.on("load", render);
    map.on("idle", render);
    map.on("style.load", reload);
    return () => {
      map.off("load", render);
      map.off("idle", render);
      map.off("style.load", reload);
      for (const layer of [...LAYERS].reverse())
        if (map.getLayer(layer)) map.removeLayer(layer);
      if (map.getSource(SOURCE)) map.removeSource(SOURCE);
    };
  }, [destination, plan, selected, mapRef, open]);

  useEffect(() => {
    if (!open || !plan || !selected) return;
    const map = mapRef.current;
    if (!map) return;
    const points = [...plan.routes[0].points, ...selected.points];
    const height = map.getContainer().clientHeight;
    const top = Math.min(90, height * 0.2);
    const panelHeight =
      open && panelRef.current
        ? panelRef.current.getBoundingClientRect().height
        : 130;
    map.fitBounds(
      [
        [
          Math.min(...points.map(({ lng }) => lng)),
          Math.min(...points.map(({ lat }) => lat)),
        ],
        [
          Math.max(...points.map(({ lng }) => lng)),
          Math.max(...points.map(({ lat }) => lat)),
        ],
      ],
      {
        padding: {
          top,
          bottom: Math.min(panelHeight + 30, height - top - 80),
          left: 35,
          right: 70,
        },
        maxZoom: 16,
        duration: 650,
      },
    );
  }, [plan, selected, mapRef, open]);

  const calculate = async (extraMinutes: number): Promise<void> => {
    if (!origin || !destination || !ready || !directPlans[mode]) return;
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setPending(true);
    setError("");
    setExplorationPlan(null);
    try {
      const result = await findExplorationRoutes(
        directPlans[mode],
        cells,
        extraMinutes,
        controller.signal,
      );
      if (controller.signal.aborted) return;
      setExplorationPlan(result);
      setSelectedId("");
    } catch (cause) {
      if (controller.signal.aborted) return;
      console.error("Could not plan exploration route", {
        origin,
        destination,
        cause,
      });
      setError(
        cause instanceof Error
          ? cause.message
          : "The routing service returned an unexpected error. Try again.",
      );
    } finally {
      if (!controller.signal.aborted) setPending(false);
    }
  };

  const changeMode = (profile: TransportMode): void => {
    if (mode === profile) return;
    controllerRef.current?.abort();
    setMode(profile); setExplorationPlan(null); setSelectedId(""); setPending(false); setError("");
  };

  const changeBudget = (minutes: number): void => {
    if (minutes === budget) return;
    controllerRef.current?.abort();
    setBudget(minutes); setSelectedId(""); setError("");
    if (minutes === 0) { setExplorationPlan(null); setPending(false); }
    else if (explorationPlan || pending) void calculate(minutes);
  };
  const hasExploration = explorationPlan !== null && explorationPlan.extraMinutes === budget && explorationPlan.mode === mode;

  return open ? (
    <section ref={panelRef} className={`exploration-route-panel${step === "destination" ? " exploration-route-panel--destination" : ""}`} aria-label="Route suggestions" aria-busy={pending || directPending}>
      <div className="exploration-route-panel__heading">
        <div className="exploration-route-title">
          {step === "options" && <button className="exploration-route-back" type="button" aria-label="Back to destination" onClick={() => setStep("destination")}><ArrowLeftIcon size={18} /></button>}
          <strong>{step === "destination" ? "Choose a destination" : "Choose your route"}</strong>
        </div>
        <div className="exploration-route-heading-actions">
          <button className="exploration-route-close exploration-route-info-toggle" type="button" aria-label="About these routes" aria-expanded={infoOpen} aria-controls={infoId} onClick={() => setInfoOpen((current) => !current)}><InfoIcon size={14} strokeWidth={1.5} /></button>
          <button className="exploration-route-close" type="button" onClick={onClose} aria-label="Close route planner"><XIcon size={18} /></button>
        </div>
      </div>
      <div id={infoId} className="exploration-route-info" hidden={!infoOpen}>
        <p className="exploration-route-footnote">Travel times and new ground are estimates. Routes are map previews, without turn-by-turn guidance.</p>
        <a className="exploration-route-attribution" href="https://valhalla.openstreetmap.de/" target="_blank" rel="noreferrer">Routes: Valhalla · © OpenStreetMap contributors</a>
        <a className="exploration-route-attribution" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">Search: Photon · © OpenStreetMap contributors</a>
      </div>
      {step === "destination" ? <>
        <p className="exploration-route-help">Search, tap the map, or choose a saved place.</p>
        <DestinationSearch key={searchRevision} near={origin} onSelect={(result) => {
          setNamedDestination(result);
          onDestinationSelect(result.point);
          mapRef.current?.flyTo({ center: [result.point.lng, result.point.lat], zoom: 14, duration: 600 });
        }} />
        {destination && <div className="exploration-direct-summary">
          <div className="exploration-route-place"><RouteIcon size={20} /><strong>{destinationLabel}</strong><button className="exploration-route-clear" type="button" aria-label="Clear route" onClick={() => { setNamedDestination(null); setSearchRevision((revision) => revision + 1); onClear(); }}>Clear</button></div>
          {destinationError ? <div className="exploration-destination-error" role="alert"><strong>{destinationError.title}</strong><p>{destinationError.message}</p></div> : <div className="exploration-direct-estimates">
            {(["pedestrian", "bicycle"] as const).map((profile) => <div key={profile}>
              {profile === "pedestrian" ? <WalkingIcon size={18} /> : <CyclingIcon size={18} />}
              <div className="exploration-direct-estimate-copy"><span>{profile === "pedestrian" ? "Walking" : "Cycling"}</span>
              <strong>{directPlans[profile] ? `${Math.ceil(directPlans[profile].routes[0].durationSeconds / 60)} min` : profile === "pedestrian" && walkingRangeError ? "Too far" : directErrors[profile] ? "Unavailable" : "Calculating…"}</strong>
              {directPlans[profile] && <small> · {directPlans[profile].routes[0].distanceKm.toFixed(1)} km</small>}</div>
              {directErrors[profile] && <p className="exploration-route-error" role="alert">{directErrors[profile]}</p>}
            </div>)}
          </div>}
          {!destinationError && walkingRangeError && <div className="exploration-destination-error" role="alert"><strong>Too far for walking</strong><p>{walkingRangeError}{directPlans.bicycle ? " You can continue with cycling." : ""}</p></div>}
          {!directPending && (directPlans.pedestrian || directPlans.bicycle) && <button className="exploration-route-primary" type="button" onClick={() => setStep("options")}>Next: choose your route</button>}
          {!directPending && (directErrors.pedestrian || directErrors.bicycle) && <button className="exploration-route-clear" type="button" onClick={() => setDirectRevision((revision) => revision + 1)}>Retry direct routes</button>}
        </div>}
      </> : <>
        <div className="exploration-route-destination"><RouteIcon size={20} /><div><small>Destination</small><strong>{destinationLabel}</strong></div><button type="button" onClick={() => setStep("destination")} aria-label="Change destination">Change</button></div>
        <p className="exploration-route-budget-label" id="route-mode-label">Travel by</p>
        <div className="exploration-route-budgets" role="group" aria-labelledby="route-mode-label">
          {(["pedestrian", "bicycle"] as const).map((profile) => <button key={profile} type="button" aria-label={profile === "pedestrian" ? "Walking" : "Cycling"} aria-pressed={mode === profile} disabled={!directPlans[profile]} onClick={() => changeMode(profile)}>
            {profile === "pedestrian" ? "Walking" : "Cycling"}
            {directPlans[profile] && <small>{Math.ceil(directPlans[profile].routes[0].durationSeconds / 60)} min direct</small>}
          </button>)}
        </div>
        <p className="exploration-route-budget-label" id="exploration-budget-label">Add time to explore</p>
        <div className="exploration-route-budgets exploration-route-budgets--time" role="group" aria-labelledby="exploration-budget-label">
          {[0, ...ROUTE_BUDGETS].map((minutes) => <button key={minutes} type="button" aria-pressed={budget === minutes} aria-label={minutes === 0 ? "No extra time" : `+${minutes} min`} onClick={() => changeBudget(minutes)}>{minutes === 0 ? "No extra" : `+${minutes} min`}</button>)}
        </div>
        {budget === 0 && directRoute && <p className="exploration-route-caption"><strong>{Math.ceil(directRoute.durationSeconds / 60)} min total</strong> · {directRoute.distanceKm.toFixed(1)} km direct route · +{directRoute.newGroundKm < 1 ? `${Math.round(directRoute.newGroundKm * 1_000)} m` : `${directRoute.newGroundKm.toFixed(1)} km`} new ground</p>}
        {budget > 0 && !hasExploration && directPlans[mode] && <p className="exploration-route-caption">About <strong>{Math.ceil(directPlans[mode].routes[0].durationSeconds / 60) + budget} min total</strong>, with more undiscovered ground along the way.</p>}
        {pending && <p className="exploration-route-progress" role="status"><span />Comparing paths through undiscovered areas…</p>}
        {budget > 0 && !hasExploration && <button className="exploration-route-primary" type="button" disabled={!origin || !destination || !ready || pending || !directPlans[mode]} onClick={() => void calculate(budget)}>{pending ? "Finding routes…" : "Find routes"}</button>}
        {budget > 0 && hasExploration && selected && <>
          <div className="exploration-route-options" role="group" aria-label="Choose a route">
            {routes.map((route, index) => <button key={route.id} type="button" aria-pressed={route.id === selected.id} aria-label={index === 0 ? "Select direct route" : `Select discovery route ${index}`} onClick={() => setSelectedId(route.id)}>
              <span><strong>{index === 0 ? "Direct" : `Discover${routes.length > 2 ? ` ${index}` : ""}`}</strong><small>{route.distanceKm.toFixed(1)} km · about {route.newGroundKm.toFixed(1)} km new ground</small></span>
              <span><strong>{Math.ceil(route.durationSeconds / 60)} min</strong><small>{index === 0 ? "Baseline" : `+${Math.max(0, Math.ceil(route.durationSeconds / 60) - Math.ceil(explorationPlan.routes[0].durationSeconds / 60))} min`}</small></span>
            </button>)}
          </div>
          {routes.length === 1 && <p className="exploration-route-help" role="status">{`No additional new ground found within ${budget} extra minutes. Try adding more time or choosing another destination.`}</p>}
        </>}
        {(budget === 0 || hasExploration) && selected && <button className="exploration-route-primary" type="button" disabled={pending || !directPlans[mode]} onClick={tracking ? onReturnToJourney : () => onStart(selected)}>{tracking ? "Back to journey" : "Start journey"}</button>}

      </>}
      {!origin && <div className="exploration-route-notice"><p>Find your current location to plan a route.</p><button type="button" onClick={onLocate}>Find my location</button></div>}
      {!ready && <p role="status">Loading your discovery map…</p>}
      {error && <p className="exploration-route-error" role="alert">{error}</p>}
    </section>
  ) : null;
}
