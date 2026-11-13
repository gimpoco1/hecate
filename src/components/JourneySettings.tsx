import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Trans } from "react-i18next";
import { Capacitor } from "@capacitor/core";
import { App as CapacitorApp } from "@capacitor/app";
import { t } from "../i18n";
import { JOURNEY_PAUSE_DURATIONS, JOURNEY_STOP_DURATIONS, type JourneyPreferences, type JourneyStartMode } from "../journeyAutomation";
import { openLocationSettings, readLocationAuthorization, readReminderMotionAuthorization, requestReminderMotionPermission, reminderMotionPermissionLabel, type LocationAuthorization, type ReminderMotionAuthorization } from "../location";
import { ArrowLeftIcon, XIcon, WarningIcon, ChevronIcon } from "./Icons";
import { ReminderDuration } from "./ReminderDuration";
import { mdiAutoMode, mdiGestureTap } from "@mdi/js";

type Props = {
  preferences: JourneyPreferences;
  onChange: (preferences: JourneyPreferences) => Promise<void>;
  onBack: () => void;
  onClose: () => void;
};

export function JourneySettings({ preferences, onChange, onBack, onClose }: Props) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [permissions, setPermissions] = useState<{ location: LocationAuthorization; motion: ReminderMotionAuthorization } | null>(null);
  const [permissionError, setPermissionError] = useState("");
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
  useEffect(() => {
    if (!native) return;
    let active = true;
    const refresh = (): void => {
      void Promise.all([readLocationAuthorization(), readReminderMotionAuthorization()]).then(([location, motion]) => {
        if (!active) return;
        setPermissions({ location, motion });
        setPermissionError("");
      }).catch((failure: Error) => {
        if (active) { setPermissions(null); setPermissionError(failure.message); }
      });
    };
    refresh();
    const listener = CapacitorApp.addListener("appStateChange", ({ isActive }) => { if (isActive) refresh(); });
    return () => { active = false; void listener.then(handle => handle.remove()); };
  }, [native, pending]);
  async function save(next: JourneyPreferences): Promise<string | null> {
    setPending(true);
    setError("");
    try { await onChange(next); return null; }
    catch (failure) { const message = failure instanceof Error ? failure.message : t("Could not save journey settings."); setError(message); return message; }
    finally { setPending(false); }
  }
  async function enableMotion(): Promise<void> {
    setPending(true);
    setError("");
    try {
      await requestReminderMotionPermission();
      const [location, motion] = await Promise.all([readLocationAuthorization(), readReminderMotionAuthorization()]);
      setPermissions({ location, motion });
    } catch (failure) { setError(failure instanceof Error ? failure.message : t("Could not request motion access. Please try again.")); }
    finally { setPending(false); }
  }
  const choices: { mode: JourneyStartMode; title: string; description: string; icon: string }[] = [
    { mode: "manual", icon: mdiGestureTap, title: t("Manual"), description: t("You start each journey.") },
    { mode: "automatic", icon: mdiAutoMode, title: t("Automatic"), description: t("Hecate starts journeys for you when it detects walking.") },
  ];
  return createPortal(<div className="sheet-backdrop gpx-import-backdrop" onClick={event => { event.stopPropagation(); onBack(); }}>
    <section ref={panel} tabIndex={-1} className="sheet profile-collection-sheet journey-settings-sheet" role="dialog" aria-modal="true" aria-labelledby="journey-settings-title" data-testid="journey-settings" onClick={event => event.stopPropagation()}>
      <button type="button" className="icon-button walking-stats-back" data-testid="journey-settings-back" aria-label={t("Back to profile")} onClick={onBack}><ArrowLeftIcon /></button>
      <button type="button" className="icon-button sheet__close" data-testid="journey-settings-close" aria-label={t("Close")} onClick={onClose}><XIcon /></button>
      <div className="eyebrow">{t("Preferences")}</div>
      <h2 id="journey-settings-title">{t("Journey recording")}</h2>
      <p>{t("Spend more time exploring. Let Hecate take care of recording.")}</p>
      {native && permissions &&
        (permissions.location !== "always" || permissions.motion !== "authorized") && <div className="notification-permission-notice" role="status">
        <span className="notification-permission-notice__icon" aria-hidden="true"><WarningIcon size={22} /></span>
        <div>
          <strong>{permissions.motion !== "authorized" ? t("{{value0}} access is off", { value0: reminderMotionPermissionLabel() }) : t("Check location access")}</strong>
          <p>{t("Automatic recording needs Always location and motion access. A temporary route is collected while walking is being detected. Background detection may be delayed by your phone.")}</p>
          <button className="notification-permission-notice__action" type="button" data-testid="journey-permission-settings" disabled={pending} onClick={() => { if (permissions.motion === "notDetermined") void enableMotion(); else void openLocationSettings().catch(failure => setError(failure instanceof Error ? failure.message : t("Could not open device Settings."))); }}>{permissions.motion === "notDetermined" ? t("Allow {{value0}}", { value0: reminderMotionPermissionLabel() }) : t("Open Settings")} <ChevronIcon size={14} /></button>
        </div>
      </div>}
      {!native && <p role="status">{t("Automatic journeys require the iOS or Android app.")}</p>}
      <fieldset className="language-options journey-mode-options" disabled={pending}>
        <legend className="account-settings-panel__header">{t("Start journeys")}</legend>
        {choices.map(choice => <label key={choice.mode}>
          <svg className="journey-mode-symbol" width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d={choice.icon} /></svg>
          <span className="journey-mode-copy"><strong>{choice.title}</strong><small>{choice.description}</small></span>
          <input type="radio" name="journey-start-mode" checked={(native && permissions?.motion !== "authorized" ? "manual" : preferences.mode) === choice.mode} disabled={choice.mode !== "manual" && (!native || permissions?.motion !== "authorized")} data-testid={`journey-mode-${choice.mode}`} onChange={() => void save({ ...preferences, mode: choice.mode })} />
        </label>)}
      </fieldset>
      {preferences.mode !== "manual" && <p className="journey-settings-note">{t("After five continuous minutes of walking, Hecate saves a journey including those first five minutes. Shorter walks are discarded. Automatic starts wait 30 minutes after you stop a journey manually.")}</p>}
      <section className="account-settings-panel" aria-label={t("Pause and resume")}>
        <div className="account-setting">
          <div><strong id="journey-auto-pause-label">{t("Pause automatically")}</strong><p id="journey-auto-pause-description"><Trans i18nKey="settings.journeyPauseTiming" components={{ duration: <ReminderDuration title={t("Pause automatically")} description={t("Pause after staying in one place for this long. Resume the same journey when you move again.")} value={preferences.pauseMinutes} options={JOURNEY_PAUSE_DURATIONS} disabled={pending || !native || permissions?.motion !== "authorized" || !preferences.autoPause} onChange={minutes => save({ ...preferences, pauseMinutes: minutes })} /> }} /></p></div>
          <button type="button" role="switch" aria-labelledby="journey-auto-pause-label" aria-describedby="journey-auto-pause-description" aria-checked={preferences.autoPause && permissions?.motion === "authorized"} disabled={pending || !native || permissions?.motion !== "authorized"} data-testid="journey-auto-pause" onClick={() => void save({ ...preferences, autoPause: !preferences.autoPause })}>{preferences.autoPause && permissions?.motion === "authorized" ? t("On") : t("Off")}</button>
        </div>
      </section>
      {preferences.mode !== "manual" && <section className="account-settings-panel" aria-labelledby="journey-end-title">
        <div className="account-setting">
          <div>
            <strong id="journey-end-title">{t("End automatic journeys")}</strong>
            <p><Trans i18nKey="settings.journeyEndTiming" components={{ duration: <ReminderDuration title={t("End automatic journeys")} description={t("Finish after staying in one place for this long. Journeys you start manually only end when you stop them.")} value={preferences.stopMinutes} options={JOURNEY_STOP_DURATIONS} disabled={pending || !native || permissions?.motion !== "authorized"} onChange={minutes => save({ ...preferences, stopMinutes: minutes })} /> }} /></p>
          </div>
        </div>
      </section>}
      {(error || permissionError) && <p role="alert">{error || permissionError}</p>}
    </section>
  </div>, document.body);
}
