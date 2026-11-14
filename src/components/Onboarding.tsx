import { Capacitor } from "@capacitor/core";
import { App as CapacitorApp } from "@capacitor/app";
import { resetGuideMotion } from "../guideMotion";
import { resetOnboardingTour } from "../onboardingTour";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { t, useAppTranslation } from "../i18n";
import { GuideMotionButton } from "./GuideMotionButton";
import { useGuideMotion } from "../guideMotion";
import { HecateMark } from "./Icons";
import { IntroArtwork, type IntroArtworkKind } from "./IntroArtwork";
import { OnboardingLocationContext } from "../onboardingLocation";
import type { Coordinate } from "../types";
import { acquireForegroundLocation, requestForegroundLocationPermission, requestReminderMotionPermission, readReminderMotionAuthorization, reminderMotionPermissionLabel, hasBackgroundLocationPermission, readForegroundLocationPermission, openLocationSettings } from "../location";
import { canRequestOnboardingNotifications, requestOnboardingNotifications, readOnboardingNotificationPermission } from "../onboardingPermissions";
import { errorDiagnostic } from "../diagnostics";
import { JourneyMotionMonitor, ONBOARDING_JOURNEY_MODE_KEY, type JourneyStartMode } from "../journeyAutomation";
import "./Onboarding.css";

const COMPLETION_KEY = "hecate.onboarding.v1";
const RESTART_EVENT = "hecate:restart-onboarding";

export function restartOnboarding(): void {
  resetOnboardingTour();
  resetGuideMotion();
  localStorage.removeItem(COMPLETION_KEY);
  window.dispatchEvent(new Event(RESTART_EVENT));
}
const introPages = [
  { kind: "discover", title: "Your world, waiting to be revealed", description: "Explore on foot or by bike. Reveal new streets with every journey.", caption: null },
  { kind: "journey", title: "Make your first discovery", description: "Tap Start on the map, head outside, then stop to see what you discovered.", caption: null },
  { kind: "features", title: "Follow your curiosity", description: "Plan routes, save favorite places, and celebrate your progress in your profile.", caption: null },
  { kind: "location", title: "Find your starting point", description: "onboarding.journeyChoice", caption: "Optional. You choose when to record." },
  { kind: "notifications", title: "A little nudge to explore", description: "Get a nudge to explore new ground, even with the app in the background.", caption: "Optional. Enable notifications now or later in Settings." },
  { kind: "motion", title: "onboarding.remindersTitle", description: "onboarding.remindersDescription", caption: null },
] as const satisfies readonly { kind: IntroArtworkKind; title: string; description: string; caption: string | null }[];

export function Onboarding({ children }: { children: ReactNode }) {
  useAppTranslation();
  const motionControls = useGuideMotion();
  const nativeApp = Capacitor.isNativePlatform();

  const [complete, setComplete] = useState(() => localStorage.getItem(COMPLETION_KEY) === "complete");
  const [step, setStep] = useState(0);
  const [requesting, setRequesting] = useState(false);
  const [checkingPermission, setCheckingPermission] = useState(false);
  const [journeyMode, setJourneyMode] = useState<JourneyStartMode>("manual");
  const [motionAvailable, setMotionAvailable] = useState(true);
  const [initialLocation, setInitialLocation] = useState<Coordinate | undefined>();
  const [locationResult, setLocationResult] = useState<boolean | null>(null);
  const [notificationResult, setNotificationResult] = useState<boolean | null>(null);
  const [motionResult, setMotionResult] = useState<boolean | null>(null);
  const [backgroundAllowed, setBackgroundAllowed] = useState<boolean | null>(null);
  const [permissionError, setPermissionError] = useState("");
  const automaticReady = nativeApp && journeyMode === "automatic" && locationResult === true && motionResult === true && backgroundAllowed === true && motionAvailable;
  const pages = introPages.filter(page => page.kind !== "motion" || (nativeApp && journeyMode !== "automatic"));
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const restart = (): void => {
      setStep(0);
      setJourneyMode("manual");
      setCheckingPermission(false);
      setRequesting(false);
      setInitialLocation(undefined);
      setLocationResult(null);
      setNotificationResult(null);
      setMotionResult(null);
      setMotionAvailable(true);
      setBackgroundAllowed(null);
      setPermissionError("");
      setComplete(false);
    };
    window.addEventListener(RESTART_EVENT, restart);
    return () => window.removeEventListener(RESTART_EVENT, restart);
  }, []);
  useEffect(() => {
    if (!complete) heading.current?.focus();
  }, [step, complete]);

  function finish(): void {
    if (step >= pages.findIndex(page => page.kind === "location")) {
      localStorage.setItem(ONBOARDING_JOURNEY_MODE_KEY, automaticReady ? "automatic" : "manual");
    }
    localStorage.setItem(COMPLETION_KEY, "complete");
    setComplete(true);
  }

  async function enableLocation(): Promise<void> {
    setRequesting(true);
    setPermissionError("");
    try {
      const allowed = await requestForegroundLocationPermission();
      setLocationResult(allowed);
      if (allowed) setInitialLocation(await acquireForegroundLocation());
    }
    catch (cause) {
      console.error("Could not enable location during onboarding", { error: errorDiagnostic(cause) });
      setPermissionError(cause instanceof Error ? cause.message : t("Could not request location access. Please try again."));
    } finally { setRequesting(false); }
  }

  async function enableNotifications(): Promise<void> {
    setRequesting(true);
    setPermissionError("");
    try { setNotificationResult(await requestOnboardingNotifications()); }
    catch (cause) {
      console.error("Could not enable notifications during onboarding", { error: errorDiagnostic(cause) });
      setPermissionError(cause instanceof Error ? cause.message : t("Could not request notification access. Please try again."));
    } finally { setRequesting(false); }
  }

  async function enableMotion(): Promise<void> {
    setRequesting(true);
    setPermissionError("");
    try {
      setMotionResult(await requestReminderMotionPermission());
      setBackgroundAllowed(await hasBackgroundLocationPermission());
    } catch (cause) {
      console.error("Could not enable onboarding motion permission", { error: errorDiagnostic(cause) });
      setPermissionError(cause instanceof Error ? cause.message : t("Could not request motion access. Please try again."));
    } finally { setRequesting(false); }
  }

  async function openPermissionSettings(): Promise<void> {
    setPermissionError("");
    try { await openLocationSettings(); }
    catch (cause) {
      console.error("Could not open onboarding permission settings", { error: errorDiagnostic(cause) });
      setPermissionError(cause instanceof Error ? cause.message : t("Could not open device Settings."));
    }
  }

  useEffect(() => {
    if (complete || requesting) return;
    const kind = pages[step].kind;
    if (kind !== "notifications" && kind !== "motion" && kind !== "location") return;
    let active = true;
    const refresh = async (): Promise<void> => {
      setCheckingPermission(true);
      try {
        if (kind === "location") {
          const allowed = await readForegroundLocationPermission();
          if (nativeApp) {
            const [motion, background, { available }] = await Promise.all([readReminderMotionAuthorization(), hasBackgroundLocationPermission(), JourneyMotionMonitor.getAvailability()]);
            if (active) {
              setMotionAvailable(available);
              setMotionResult(motion === "notDetermined" ? null : motion === "authorized");
              setBackgroundAllowed(background);
            }
          }
          if (active) setLocationResult(allowed);
        }
        if (kind === "notifications") {
          const result = await readOnboardingNotificationPermission();
          if (active) setNotificationResult(result);
        }
        if (kind === "motion") {
          const status = await readReminderMotionAuthorization();
          const background = await hasBackgroundLocationPermission();
          const notifications = await readOnboardingNotificationPermission();
          if (active) {
            setNotificationResult(notifications);
            setMotionAvailable(status !== "unavailable");
            setMotionResult(status === "notDetermined" ? null : status === "authorized");
            setBackgroundAllowed(background);
            if (status === "unavailable") setPermissionError(t("Motion detection isn’t available on this device."));
          }
        }
      } catch (cause) {
        if (active) setPermissionError(cause instanceof Error ? cause.message : t("Could not check permission status."));
        console.error("Could not refresh onboarding permissions", { error: errorDiagnostic(cause) });
      } finally { if (active) setCheckingPermission(false); }
    };
    void refresh();
    const onVisible = (): void => { if (document.visibilityState === "visible") void refresh(); };
    document.addEventListener("visibilitychange", onVisible);
    let listener: { remove: () => Promise<void> } | undefined;
    if (nativeApp) {
      void CapacitorApp.addListener("appStateChange", ({ isActive }) => { if (isActive) void refresh(); })
        .then(handle => { if (active) listener = handle; else void handle.remove(); })
        .catch(cause => {
          console.error("Could not observe onboarding permission changes", { error: errorDiagnostic(cause) });
          if (active) setPermissionError(cause instanceof Error ? cause.message : t("Could not check permission status."));
        });
    }
    return () => { active = false; document.removeEventListener("visibilitychange", onVisible); if (listener) void listener.remove(); };
  }, [nativeApp, complete, step, requesting]);

  function advancePage(): void {
    setPermissionError("");
    if (step === pages.length - 1) finish();
    else setStep(step + 1);
  }

  async function next(): Promise<void> {
    if (pages[step].kind !== "location" || locationResult !== true || initialLocation) {
      advancePage();
      return;
    }
    setRequesting(true);
    setPermissionError("");
    try {
      setInitialLocation(await acquireForegroundLocation());
      advancePage();
    } catch (cause) {
      console.error("Could not locate user during onboarding", { error: errorDiagnostic(cause) });
      setPermissionError(cause instanceof Error ? cause.message : t("Location is unavailable."));
    } finally { setRequesting(false); }
  }

  if (complete) return <OnboardingLocationContext.Provider value={initialLocation}>{children}</OnboardingLocationContext.Provider>;
  const page = pages[step];
  const configuringAutomatic = page.kind === "location" && journeyMode === "automatic";
  const permissionPage = page.kind === "location" || page.kind === "notifications" || page.kind === "motion";
  const permissionResult = page.kind === "location" ? locationResult : page.kind === "motion" ? motionResult : notificationResult;
  const needsSettings = nativeApp && permissionPage && (page.kind !== "motion" || motionAvailable) && (permissionResult === false || (page.kind === "motion" && motionResult === true && backgroundAllowed === false));
  const notificationsSupported = canRequestOnboardingNotifications();
  const showPermissionButton = permissionPage && permissionResult === null && (page.kind !== "notifications" || notificationsSupported) && (page.kind !== "motion" || motionAvailable);
  const remindersNeedNotifications = page.kind === "motion" && motionAvailable && motionResult === true && notificationResult !== true;
  const remindersNeedLocation = page.kind === "motion" && motionAvailable && motionResult === true && notificationResult === true && backgroundAllowed !== true;
  const busy = requesting || checkingPermission;
  return (
    <main className="onboarding" data-testid="onboarding">
      <div className="onboarding-layout">
        <header className="onboarding-header">
          <span className="onboarding-brand"><HecateMark size={28} /> Hecate</span>
          <div className="guide-heading">
            {page.kind === "discover" && <GuideMotionButton controls={motionControls} />}
            <button type="button" data-testid="onboarding-skip" disabled={busy} onClick={finish}>{t("Skip intro")}</button>
          </div>
        </header>
        <IntroArtwork kind={page.kind} />
        <section className="onboarding-copy" aria-labelledby="onboarding-title">
          <h1 id="onboarding-title" tabIndex={-1} ref={heading}>{t(page.title)}</h1>
          <p className="onboarding-description">{t(page.description, { permission: reminderMotionPermissionLabel() })}</p>
          {page.kind === "location" && <fieldset className="onboarding-journey-modes" disabled={busy}>
            <legend>{t("Start journeys")}</legend>
            {(["manual", "automatic"] as const).map(mode => <label key={mode}>
              <input type="radio" name="onboarding-journey-mode" data-testid={`onboarding-journey-${mode}`} checked={journeyMode === mode} disabled={mode === "automatic" && (!nativeApp || !motionAvailable)} onChange={() => setJourneyMode(mode)} />
              <span><strong>{t(mode === "manual" ? "Manual" : "Automatic")}</strong><small>{t(mode === "manual" ? "You start each journey." : "onboarding.automaticDescription")}</small></span>
            </label>)}
          </fieldset>}
          {configuringAutomatic && <p className="onboarding-caption" role="status" data-testid="onboarding-automatic-guidance">{t(
            locationResult !== true
              ? locationResult === false ? "onboarding.locationSettings" : Capacitor.getPlatform() === "ios" ? "onboarding.locationFirstIOS" : "onboarding.locationFirst"
              : motionResult !== true
                ? motionResult === false ? "onboarding.motionSettings" : "onboarding.motionNext"
                : backgroundAllowed !== true
                  ? Capacitor.getPlatform() === "ios" ? "onboarding.alwaysSettingsIOS" : "onboarding.alwaysSettingsAndroid"
                  : "onboarding.automaticReady",
            { permission: reminderMotionPermissionLabel() },
          )}</p>}
          {page.kind === "location" && nativeApp && !motionAvailable && <p className="onboarding-caption">{t("Automatic journey detection requires iOS 17 or later on iPhone, and motion support on Android.")}</p>}
          {page.caption && !configuringAutomatic && permissionResult !== false && <p className="onboarding-caption">{t(page.caption)}</p>}
          {!configuringAutomatic && page.kind !== "motion" && permissionPage && permissionResult !== null && <p className={`onboarding-permission-status${permissionResult === false ? " onboarding-warning" : ""}`} role="status">{permissionResult === false && <PermissionWarningIcon />}{permissionResult
            ? page.kind === "location" ? t("Location is enabled.") : t("Notifications are enabled.")
            : page.kind === "notifications" ? t("Notifications are blocked. Enable them in Settings.") : t("You can enable this later in Settings.")}</p>}
          {page.kind === "notifications" && !notificationsSupported && <p className="onboarding-caption">{t("Notifications are available in the mobile app.")}</p>}
          {page.kind === "motion" && motionAvailable && <p className="onboarding-caption" role="status" data-testid="onboarding-reminder-guidance">{t(
            motionResult !== true ? motionResult === false ? "onboarding.motionSettings" : "onboarding.motionNext"
              : remindersNeedNotifications ? notificationResult === false ? "onboarding.notificationSettings" : "onboarding.notificationNext"
                : remindersNeedLocation ? Capacitor.getPlatform() === "ios" ? "onboarding.alwaysSettingsIOS" : "onboarding.alwaysSettingsAndroid"
                  : "onboarding.remindersReady",
            { permission: reminderMotionPermissionLabel() },
          )}</p>}
          {permissionError && <p className="onboarding-permission-error onboarding-warning" role="alert"><PermissionWarningIcon />{permissionError}</p>}
        </section>
        <footer className="onboarding-footer">
          <div className="onboarding-progress" aria-hidden="true">{pages.map((item, index) => <span key={item.title} className={index === step ? "is-current" : ""} />)}</div>
          <div className="onboarding-actions">
            {step > 0 && <button type="button" className="onboarding-back" data-testid="onboarding-back" disabled={busy} onClick={() => { setPermissionError(""); setStep(step - 1); }}>{t("Back")}</button>}
            {remindersNeedNotifications ? <button type="button" className="onboarding-next" data-testid="onboarding-reminder-notifications" disabled={busy} onClick={() => void (notificationResult === false ? openPermissionSettings() : enableNotifications())}>{notificationResult === false ? t("Open Settings") : t("Enable notifications")}</button>
              : remindersNeedLocation ? <button type="button" className="onboarding-next" data-testid="onboarding-reminder-location" disabled={busy} onClick={() => void openPermissionSettings()}>{t(Capacitor.getPlatform() === "ios" ? "onboarding.alwaysActionIOS" : "onboarding.alwaysActionAndroid")}</button>
                : configuringAutomatic && locationResult === true && motionResult !== true ? <button type="button" className="onboarding-next" data-testid="onboarding-automatic-motion" disabled={busy} onClick={() => void (motionResult === false ? openPermissionSettings() : enableMotion())}>{motionResult === false ? t("Open Settings") : t("Enable {{permission}}", { permission: reminderMotionPermissionLabel() })}</button>
                  : configuringAutomatic && locationResult === true && backgroundAllowed !== true ? <button type="button" className="onboarding-next" data-testid="onboarding-automatic-location" disabled={busy} onClick={() => void openPermissionSettings()}>{t(Capacitor.getPlatform() === "ios" ? "onboarding.alwaysActionIOS" : "onboarding.alwaysActionAndroid")}</button>
                    : showPermissionButton ? <button type="button" className="onboarding-next" data-testid="onboarding-permission" disabled={busy}
                      onClick={() => void (page.kind === "location" ? enableLocation() : page.kind === "motion" ? enableMotion() : enableNotifications())}>
                      {checkingPermission ? t("Checking permission…") : requesting ? t("Requesting permission…") : page.kind === "location" ? t("Enable location") : page.kind === "motion" ? t("Enable {{permission}}", { permission: reminderMotionPermissionLabel() }) : t("Enable notifications")}
                    </button> : needsSettings ? <button type="button" className="onboarding-next" data-testid="onboarding-settings" disabled={busy} onClick={() => void openPermissionSettings()}>{t("Open Settings")}</button>
                      : <button type="button" className="onboarding-next" data-testid="onboarding-next" disabled={busy} onClick={() => void next()}>
                        {requesting ? t("Finding your location") : step === pages.length - 1 ? t("Explore with Hecate") : t("Continue")}
                      </button>}
          </div>
          {(showPermissionButton || needsSettings || remindersNeedNotifications || remindersNeedLocation || (configuringAutomatic && !automaticReady) || (page.kind === "location" && locationResult === true && !initialLocation)) && <button type="button" className="onboarding-later" data-testid="onboarding-later" disabled={busy} onClick={() => { if (configuringAutomatic) setJourneyMode("manual"); advancePage(); }}>{configuringAutomatic ? t("onboarding.useManual") : t("Not now")}</button>}
        </footer>
      </div>
    </main>
  );
}

function PermissionWarningIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m10.3 4-8 14a2 2 0 0 0 1.7 3h16a2 2 0 0 0 1.7-3l-8-14a2 2 0 0 0-3.4 0Z" /><path d="M12 9v4m0 4h.01" /></svg>;
}
