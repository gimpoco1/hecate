import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Capacitor } from "@capacitor/core";
import { t } from "../i18n";
import type { JourneyPreferences, JourneyStartMode } from "../journeyAutomation";
import { openLocationSettings } from "../location";
import { ArrowLeftIcon, XIcon } from "./Icons";
import { mdiAutoMode, mdiGestureTap, mdiMotionPlayOutline } from "@mdi/js";

type Props = {
  preferences: JourneyPreferences;
  onChange: (preferences: JourneyPreferences) => Promise<void>;
  monitoringError: string;
  onBack: () => void;
  onClose: () => void;
};

export function JourneySettings({ preferences, onChange, monitoringError, onBack, onClose }: Props) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const panel = useRef<HTMLElement>(null);
  const native = Capacitor.isNativePlatform();
  useEffect(() => {
    const previous = document.activeElement;
    panel.current?.focus();
    const handleKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") { event.stopPropagation(); onBack(); }
      if (event.key !== "Tab") return;
      const items = panel.current?.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled)");
      if (!items?.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", handleKey);
    return () => { document.removeEventListener("keydown", handleKey); if (previous instanceof HTMLElement) previous.focus(); };
  }, []);
  async function save(next: JourneyPreferences): Promise<void> {
    setPending(true);
    setError("");
    try { await onChange(next); }
    catch (failure) { setError(failure instanceof Error ? failure.message : t("Could not save journey settings.")); }
    finally { setPending(false); }
  }
  const choices: { mode: JourneyStartMode; title: string; description: string; icon: string }[] = [
    { mode: "manual", icon: mdiGestureTap, title: t("Manual Start"), description: t("Tap Start when you want to explore.") },
    { mode: "assisted", icon: mdiMotionPlayOutline, title: t("Manual + Automatic"), description: t("Start yourself, or let Hecate detect your walk.") },
    { mode: "automatic", icon: mdiAutoMode, title: t("Fully Automatic"), description: t("Hecate starts journeys for you and hides Start.") },
  ];
  return createPortal(<div className="sheet-backdrop gpx-import-backdrop" onClick={event => { event.stopPropagation(); onBack(); }}>
    <section ref={panel} tabIndex={-1} className="sheet profile-collection-sheet journey-settings-sheet" role="dialog" aria-modal="true" aria-labelledby="journey-settings-title" data-testid="journey-settings" onClick={event => event.stopPropagation()}>
      <button type="button" className="icon-button walking-stats-back" data-testid="journey-settings-back" aria-label={t("Back to profile")} onClick={onBack}><ArrowLeftIcon /></button>
      <button type="button" className="icon-button sheet__close" data-testid="journey-settings-close" aria-label={t("Close")} onClick={onClose}><XIcon /></button>
      <div className="eyebrow">{t("Preferences")}</div>
      <h2 id="journey-settings-title">{t("Journey recording")}</h2>
      <p>{t("Spend more time exploring. Let Hecate take care of recording.")}</p>
      {!native && <p role="status">{t("Automatic journeys require the iOS or Android app.")}</p>}
      <fieldset className="language-options journey-mode-options" disabled={pending}>
        <legend className="account-settings-panel__header">{t("Start journeys")}</legend>
        {choices.map(choice => <label key={choice.mode}>
          <svg className="journey-mode-symbol" width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d={choice.icon} /></svg>
          <span className="journey-mode-copy"><strong>{choice.title}</strong><small>{choice.description}</small></span>
          <input type="radio" name="journey-start-mode" checked={preferences.mode === choice.mode} disabled={!native && choice.mode !== "manual"} data-testid={`journey-mode-${choice.mode}`} onChange={() => void save({ ...preferences, mode: choice.mode })} />
        </label>)}
      </fieldset>
      {preferences.mode !== "manual" && <p className="journey-settings-note">{t("After five continuous minutes of walking, Hecate saves a journey including those first five minutes. Shorter walks are discarded. Automatic starts wait 30 minutes after you stop a journey manually.")}</p>}
      <section className="account-settings-panel" aria-label={t("Pause and resume")}>
        <div className="account-setting">
          <div><strong id="journey-auto-pause-label">{t("Pause automatically")}</strong><p id="journey-auto-pause-description">{t("Pause after two minutes without walking or cycling. Resume the same journey when you move again.")}</p></div>
          <button type="button" role="switch" aria-labelledby="journey-auto-pause-label" aria-describedby="journey-auto-pause-description" aria-checked={preferences.autoPause} disabled={pending || !native} data-testid="journey-auto-pause" onClick={() => void save({ ...preferences, autoPause: !preferences.autoPause })}>{preferences.autoPause ? t("On") : t("Off")}</button>
        </div>
      </section>
      {preferences.mode !== "manual" && <section className="account-settings-panel appearance-settings journey-end-options" aria-labelledby="journey-end-title">
        <h3 id="journey-end-title" className="account-settings-panel__header">{t("End automatic journeys")}</h3>
        <p>{t("Finish after staying in one place for this long. Journeys you start manually only end when you stop them.")}</p>
        <fieldset className="appearance-options" aria-label={t("End automatic journeys")} disabled={pending}>
          {([7, 10, 15] as const).map(minutes => <label key={minutes}><input type="radio" name="journey-stop-delay" data-testid={`journey-stop-${minutes}`} checked={preferences.stopMinutes === minutes} onChange={() => void save({ ...preferences, stopMinutes: minutes })} /><span>{t("{{value0}} min", { value0: minutes })}</span></label>)}
        </fieldset>
      </section>}
      {native && (preferences.mode !== "manual" || monitoringError) && <section className="account-settings-panel"><p className="journey-settings-note">{t("Automatic recording needs Always location and motion access. A temporary route is collected while walking is being detected. Background detection may be delayed by your phone.")}</p><button className="streak-reminder-time" type="button" data-testid="journey-permission-settings" onClick={() => { void openLocationSettings().catch(failure => setError(failure instanceof Error ? failure.message : t("Could not open device Settings."))); }}>{t("Open Settings")}</button></section>}
      {(error || monitoringError) && <div className="form-message form-message--error" role="alert"><p>{error || monitoringError}</p><button className="streak-reminder-time" type="button" data-testid="journey-settings-retry" disabled={pending} onClick={() => void save(preferences)}>{t("Retry")}</button></div>}
    </section>
  </div>, document.body);
}
