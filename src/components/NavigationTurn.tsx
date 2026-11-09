import { currentLanguage, formatNumber, t, useAppTranslation } from "../i18n";
import { useEffect, useState } from "react";
import type { NavigationCue, NavigationRemaining, TurnSymbol } from "../navigationGuidance";
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

export function NavigationTurn({ cue, message, remaining }: { cue: NavigationCue | null; message: string; remaining: NavigationRemaining | null }) {
  useAppTranslation();
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const update = (): void => { if (document.visibilityState === "visible") setNow(Date.now()); };
    const timer = window.setInterval(update, 15_000);
    document.addEventListener("visibilitychange", update);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", update); };
  }, []);
  const distance = cue ? cue.distanceMeters <= 10 ? (cue.symbol === "arrive" ? t("Arrived") : t("Now")) : cue.distanceMeters < 1000 ? `${cue.distanceMeters} m` : `${formatNumber((cue.distanceMeters / 1000), 1)} km` : "";
  const arrivalTime = remaining ? new Intl.DateTimeFormat(currentLanguage(), { hour: "numeric", minute: "2-digit" }).format(now + remaining.durationSeconds * 1000) : "";
  const remainingDistance = remaining ? remaining.distanceKm < 1 ? `${Math.round(remaining.distanceKm * 1000 / 10) * 10} m` : `${formatNumber(remaining.distanceKm, 1)} km` : "";
  const remainingMinutes = remaining ? remaining.durationSeconds === 0 ? 0 : Math.max(1, Math.ceil(remaining.durationSeconds / 60)) : 0;
  const hasGuidance = Boolean(cue || message);
  const eta = remaining && (
    <div className="navigation-turn__eta" data-testid="navigation-eta">
      <span>{t("{{value0}} min", { value0: remainingMinutes })} · {remainingDistance}</span>
      <span>{t("Arrive {{value0}}", { value0: arrivalTime })}</span>
    </div>
  );
  if (!hasGuidance && !eta) return null;
  return <aside className="navigation-turn" data-testid="navigation-guidance" aria-label={t("Navigation")}>
    {hasGuidance && <div className="navigation-turn__maneuver">
      {!message && cue && <TurnArrow symbol={cue.symbol} />}
      <div className="navigation-turn__instruction"><strong>{message || !cue ? t("Navigation") : cue.distanceMeters > 10 ? t("In {{value0}}", { value0: distance }) : distance}</strong><span role={message ? "status" : undefined}>{message || cue?.instruction}</span></div>
      {eta}
    </div>}
    {!hasGuidance && eta}
  </aside>;
}
