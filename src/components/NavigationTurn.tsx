import { formatNumber, t, useAppTranslation } from "../i18n";
import { useLayoutEffect, useState, type RefObject } from "react";
import type { NavigationCue, TurnSymbol } from "../navigationGuidance";
import { mdiFlagCheckered } from "@mdi/js";

function TurnArrow({ symbol }: { symbol: TurnSymbol }) {
  useAppTranslation();
  if (symbol === "arrive") return <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d={mdiFlagCheckered} /></svg>;
  const paths: Record<Exclude<TurnSymbol, "arrive">, string> = {
    straight: "M12 21V3m-6 6 6-6 6 6", left: "M17 21V12H4m6-6-6 6 6 6", right: "M7 21V12h13m-6-6 6 6-6 6",
    "slight-left": "M17 21v-9L5 3m0 8V3h8", "slight-right": "M7 21v-9L19 3m0 8V3h-8",
    "sharp-left": "M17 21V4L5 16m0-8v8h8", "sharp-right": "M7 21V4l12 12m0-8v8h-8",
    uturn: "M18 21V8a6 6 0 0 0-12 0v9m-4-4 4 4 4-4",
    roundabout: "M20 8a8 8 0 1 0 0 8M20 2v6h-6",
  };
  return <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[symbol]} /></svg>;
}

export function NavigationTurn({ cue, message, anchor }: { cue: NavigationCue | null; message: string; anchor: RefObject<HTMLElement | null> }) {
  useAppTranslation();
  const [bottom, setBottom] = useState(120);
  useLayoutEffect(() => {
    const panel = anchor.current;
    if (!panel) return;
    const measure = (): void => setBottom(Math.max(12, window.innerHeight - panel.getBoundingClientRect().top + 10));
    measure();
    const resize = new ResizeObserver(measure);
    const mutation = new MutationObserver(measure);
    resize.observe(panel);
    mutation.observe(panel, { attributes: true, attributeFilter: ["style", "class"] });
    window.addEventListener("resize", measure);
    return () => { resize.disconnect(); mutation.disconnect(); window.removeEventListener("resize", measure); };
  }, [anchor]);
  if (message) return <aside className="navigation-turn" style={{ bottom }} role="status"><div><strong>{t("Navigation")}</strong><span>{message}</span></div></aside>;
  if (!cue) return null;
  const distance = cue.distanceMeters <= 10 ? (cue.symbol === "arrive" ? t("Arrived") : t("Now")) : cue.distanceMeters < 1000 ? `${cue.distanceMeters} m` : `${formatNumber((cue.distanceMeters / 1000), 1)} km`;
  return <aside className="navigation-turn" style={{ bottom }} aria-label={t("Next navigation turn")}>
    <TurnArrow symbol={cue.symbol} /><div><strong>{cue.distanceMeters > 10 ? t("In {{value0}}", { value0: distance }) : distance}</strong><span>{cue.instruction}</span></div>
  </aside>;
}
