import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { simulationPosition } from "../navigationSimulation";
import { prepareRouteGeometry } from "../routeGeometry";
import type { PlannedRoute } from "../explorationRouting";
import type { Coordinate } from "../types";

type Props = { route: PlannedRoute; onFix: (point: Coordinate) => void; onStop: () => void; panelRef: RefObject<HTMLElement | null> };

export function NavigationSimulation({ route, onFix, onStop, panelRef }: Props) {
  const geometry = useMemo(() => prepareRouteGeometry(route.points), [route]);
  const elapsedRef = useRef(0);
  const [paused, setPaused] = useState(false);
  const [speed, setSpeed] = useState(5);
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    if (paused || elapsedRef.current >= route.durationSeconds) return;
    let previous = performance.now();
    const update = (): void => {
      const now = performance.now();
      if (document.visibilityState !== "visible") { previous = now; return; }
      elapsedRef.current = Math.min(route.durationSeconds, elapsedRef.current + (now - previous) / 1000 * speed);
      previous = now;
      const fraction = elapsedRef.current / route.durationSeconds;
      const point = simulationPosition(geometry, fraction);
      onFix({ ...point, recordedAt: Date.now(), accuracy: 5 });
      setProgress(fraction);
      if (fraction >= 1) window.clearInterval(timer);
    };
    const timer = window.setInterval(update, 1000 / speed);
    const resetClock = (): void => { previous = performance.now(); };
    document.addEventListener("visibilitychange", resetClock);
    update();
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", resetClock);
    };
  }, [onFix, paused, route.durationSeconds, geometry, speed]);
  return <section ref={panelRef} className="navigation-simulation" aria-label="Navigation preview">
    <strong>{progress >= 1 ? "Preview complete" : "Navigation preview"}</strong>
    <small>Simulated GPS · no journey or progress saved</small>
    <div>
      <button type="button" aria-label={paused ? "Resume navigation preview" : "Pause navigation preview"} disabled={progress >= 1} onClick={() => setPaused(!paused)}>{paused ? "Resume" : "Pause"}</button>
      <label>Speed <select aria-label="Navigation preview speed" value={speed} onChange={(event) => setSpeed(Number(event.target.value))}>{[5, 10, 15, 20, 25].map((value) => <option key={value} value={value}>{value}×</option>)}</select></label>
      <button type="button" aria-label="Stop navigation preview" onClick={onStop}>Stop preview</button>
    </div>
  </section>;
}
