import { t, useAppTranslation } from "../i18n";
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { simulationHeading, simulationPosition, type NavigationPlayback } from "../navigationSimulation";
import { prepareRouteGeometry } from "../routeGeometry";
import type { Coordinate } from "../types";

type Props = { route: NavigationPlayback; waitingForRoute: boolean; onFix: (point: Coordinate) => void; onStop: () => void; panelRef: RefObject<HTMLElement | null> };

export function NavigationSimulation({ route, waitingForRoute, onFix, onStop, panelRef }: Props) {
  useAppTranslation();
  const geometry = useMemo(() => prepareRouteGeometry(route.points), [route]);
  const elapsedRef = useRef(0);
  const [paused, setPaused] = useState(false);
  const [speed, setSpeed] = useState(5);
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    elapsedRef.current = 0;
    setProgress(0);
  }, [route]);
  useEffect(() => {
    if (paused || waitingForRoute || elapsedRef.current >= route.durationSeconds) return;
    let previous = performance.now();
    const update = (): void => {
      const now = performance.now();
      if (document.visibilityState !== "visible") { previous = now; return; }
      elapsedRef.current = Math.min(route.durationSeconds, elapsedRef.current + (now - previous) / 1000 * speed);
      previous = now;
      const fraction = elapsedRef.current / route.durationSeconds;
      const point = simulationPosition(geometry, fraction);
      onFix({ ...point, recordedAt: Date.now(), accuracy: 5, heading: simulationHeading(geometry, fraction) });
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
  }, [onFix, paused, route.durationSeconds, geometry, speed, waitingForRoute]);
  return <section ref={panelRef} className="navigation-simulation" aria-label={t("Navigation preview")}>
    <strong>{progress >= 1 ? t("Preview complete") : t("Navigation preview")}</strong>
    <small>{t("Simulated GPS · no journey or progress saved")}</small>
    <div>
      <button type="button" aria-label={paused ? t("Resume navigation preview") : t("Pause navigation preview")} disabled={progress >= 1} onClick={() => setPaused(!paused)}>{paused ? t("Resume") : t("Pause")}</button>
      <label>{t("Speed")} <select aria-label={t("Navigation preview speed")} value={speed} onChange={(event) => setSpeed(Number(event.target.value))}>{[5, 10, 15, 20, 25].map((value) => <option key={value} value={value}>{value}×</option>)}</select></label>
      <button type="button" aria-label={t("Stop navigation preview")} onClick={onStop}>{t("Stop preview")}</button>
    </div>
  </section>;
}
