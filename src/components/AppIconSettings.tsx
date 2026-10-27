import { useEffect, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { mdiCheckCircle } from "@mdi/js";
import { AppIcon, parseAppIconState, type AppIconChoice, type AppIconState } from "../appIcon";

export function AppIconSettings() {
  const [state, setState] = useState<AppIconState | null>(null);
  const [pending, setPending] = useState(false);
  const changingRef = useRef(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let active = true;
    void AppIcon.getState().then(parseAppIconState).then((result) => {
      if (active) setState(result);
    }).catch((failure) => {
      console.error("Could not read app icon", { error: failure });
      if (active) setError(failure instanceof Error ? failure.message : "Could not read your app icon. Reopen Appearance to try again.");
    });
    return () => { active = false; };
  }, []);

  const changeIcon = async (icon: AppIconChoice): Promise<void> => {
    if (changingRef.current || state?.icon === icon) return;
    changingRef.current = true;
    setPending(true);
    setError("");
    try { setState(parseAppIconState(await AppIcon.setIcon({ icon }))); }
    catch (failure) {
      console.error("Could not change app icon", { icon, error: failure });
      setError(failure instanceof Error ? failure.message : "Could not change your app icon. Please try again.");
    } finally { changingRef.current = false; setPending(false); }
  };

  if (!Capacitor.isNativePlatform() || state?.supported === false) return null;
  return <section className="app-icon-settings" aria-labelledby="app-icon-title">
    <h3 id="app-icon-title">App icon</h3>
    <p>Choose your Home Screen icon, independently of the app theme.</p>
    <div className="app-icon-options" role="group" aria-label="App icon">
      {(["original", "dark"] as const).map((icon) => <button type="button" key={icon}
        className="app-icon-choice" data-testid={`app-icon-${icon}`} aria-pressed={state?.icon === icon}
        disabled={!state || pending} onClick={() => { void changeIcon(icon); }}>
        <img src={icon === "dark" ? "/app-icons/dark-mode.png" : "/app-icons/original.svg"} width="64" height="64" alt="" />
        <span>{icon === "original" ? "Original" : "Dark"}</span>
        <svg className="app-icon-choice__check" width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d={mdiCheckCircle} /></svg>
      </button>)}
    </div>
    {pending && <p role="status">Changing your app icon…</p>}
    {error && <p role="alert">{error}</p>}
  </section>;
}
