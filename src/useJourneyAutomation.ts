import { useEffect, useRef, useState } from "react";
import { Capacitor, type PluginListenerHandle } from "@capacitor/core";
import { App as CapacitorApp } from "@capacitor/app";
import type { CityBoundary } from "./city";
import { errorDiagnostic } from "./diagnostics";
import { t } from "./i18n";
import { createCandidateLocationTracker, readLocationAuthorization, readReminderMotionAuthorization, requestReminderMotionPermission, type LocationTracker } from "./location";
import { createJourneyRecordingTracker } from "./journeyRecording";
import { CANDIDATE_STOP_GRACE_MS, automaticPauseTiming, automaticPauseOutcome, type AutomaticPause, journeyElapsedMs, advanceCandidateWalkingClock, candidateWalkingDuration, type CandidateWalkingClock, JourneyMotionMonitor, defaultJourneyPreferences, inactivityDeadlineBeforeMovement, isJourneyMovement, loadJourneyPreferences, reconcileJourneyMotion, saveJourneyPreferences, type JourneyMotionObservation, type JourneyPreferences, type JourneySeed, type JourneySource } from "./journeyAutomation";
import type { Coordinate } from "./types";
import { selectionHaptic } from "./haptics";


import type { JourneyPauseRequest } from "./journeyActivity";

type PauseMode = "manual" | "automatic" | null;
type Session = { id: string | null; source: JourneySource; cooldownUntil: number; idleSince: number | null; pausedAt: number | null; pausedMs: number; pauseMode: PauseMode; automaticPause: AutomaticPause | null; resumedAt: number | null };
type Options = {
  ownerId: string | null;
  walkId: string | null;
  startedAt: number | null;
  ready: boolean;
  cities: CityBoundary[];
  onStart: (seed: JourneySeed) => Promise<void>;
  onPause: () => Promise<void>;
  onAutomaticPause: (walkId: string) => Promise<void>;
  onResume: () => void;
  onStop: (finishedAt: number) => Promise<void>;
};

function emptySession(): Session {
  return { id: null, source: "manual", cooldownUntil: 0, idleSince: null, pausedAt: null, pausedMs: 0, pauseMode: null, automaticPause: null, resumedAt: null };
}

function sessionKey(ownerId: string): string { return `hecate:journey-automation:v1:${ownerId}`; }

function loadSession(ownerId: string, preferences: JourneyPreferences): Session {
  const raw = localStorage.getItem(sessionKey(ownerId));
  if (raw === null) return emptySession();
  const value: Omit<Session, "automaticPause"> & { automaticPause?: AutomaticPause | null } = JSON.parse(raw);
  if (!value || (value.id !== null && typeof value.id !== "string") || !["manual", "automatic"].includes(value.source)
    || !Number.isFinite(value.cooldownUntil) || !Number.isFinite(value.pausedMs)
    || (value.resumedAt !== undefined && value.resumedAt !== null && !Number.isFinite(value.resumedAt))
    || (value.automaticPause != null && (value.pauseMode !== "automatic" || value.pausedAt === null
      || !Number.isFinite(value.automaticPause.startsAt) || !Number.isFinite(value.automaticPause.endsAt)
      || value.automaticPause.startsAt < value.pausedAt || value.automaticPause.endsAt <= value.automaticPause.startsAt))
    || ![null, "manual", "automatic"].includes((value as { pauseMode?: PauseMode }).pauseMode ?? null)
    || (value.idleSince !== null && !Number.isFinite(value.idleSince)) || (value.pausedAt !== null && !Number.isFinite(value.pausedAt))) {
    throw new TypeError(t("Saved automatic journey state is invalid. Reopen journey settings and try again."));
  }
  const pauseMode = value.pauseMode ?? null;
  const automaticPause = pauseMode === "automatic" && value.pausedAt !== null
    ? value.automaticPause ?? automaticPauseTiming(value.pausedAt, preferences.pauseMinutes, preferences.stopMinutes)
    : null;
  return { ...value, resumedAt: value.resumedAt ?? null, pauseMode, automaticPause };
}

/** Owns temporary route buffering; only the normal journey recorder can commit discoveries. */
export function useJourneyAutomation(options: Options) {
  const latest = useRef(options);
  latest.current = options;
  const [preferences, setPreferences] = useState<JourneyPreferences>(defaultJourneyPreferences);
  const preferencesRef = useRef(preferences);
  preferencesRef.current = preferences;
  const [error, setError] = useState("");
  const [errorDismissed, setErrorDismissed] = useState(false);
  useEffect(() => { setErrorDismissed(false); }, [error]);
  function dismissError(): void { setErrorDismissed(true); }
  const [settingsReady, setSettingsReady] = useState(false);
  const [motionAllowed, setMotionAllowed] = useState<boolean | null>(null);
  const [paused, setPaused] = useState(false);
  const [pausedMs, setPausedMs] = useState(0);
  const [pausedAt, setPausedAt] = useState<number | null>(null);
  const [revision, setRevision] = useState(0);
  const previousWalkId = useRef<string | null>(options.walkId);
  const session = useRef<Session>(emptySession());
  const motion = useRef<JourneyMotionObservation | null>(null);
  const candidate = useRef<{ startedAt: number; clock: CandidateWalkingClock; startsNewSegment: boolean; points: Coordinate[] } | null>(null);
  const candidateTracker = useRef<LocationTracker | null>(null);
  const busy = useRef(false);
  const motionQueue = useRef<Promise<void>>(Promise.resolve());
  const lifecycleQueue = useRef<Promise<void>>(Promise.resolve());
  const pausedRecorderId = useRef<string | null>(null);
  const locationTick = useRef<(() => void) | null>(null);

  function persist(): void {
    const ownerId = latest.current.ownerId;
    if (ownerId) localStorage.setItem(sessionKey(ownerId), JSON.stringify(session.current));
  }

  async function discardCandidate(): Promise<void> {
    const tracker = candidateTracker.current;
    candidateTracker.current = null;
    candidate.current = null;
    await tracker?.stop();
  }

  function markStarted(id: string, source: JourneySource, initialPausedMs: number): void {
    session.current = { ...session.current, id, source, idleSince: null, pausedAt: null, pausedMs: initialPausedMs, pauseMode: null, automaticPause: null, resumedAt: null };
    setPaused(false);
    setPausedMs(initialPausedMs);
    setPausedAt(null);
    pausedRecorderId.current = null;
    persist();
    void discardCandidate().catch((failure) => {
      console.error("Could not release temporary journey tracking", { error: errorDiagnostic(failure) });
      setError(failure instanceof Error ? failure.message : t("Could not stop temporary journey tracking."));
    });
  }

  function manualStop(): void {
    session.current = { ...session.current, cooldownUntil: Date.now() + preferencesRef.current.restartMinutes * 60_000 };
    persist();
  }

  useEffect(() => {
    const ownerId = options.ownerId;
    motion.current = null;
    previousWalkId.current = null;
    session.current = emptySession();
    setPreferences(defaultJourneyPreferences());
    setSettingsReady(false);
    setMotionAllowed(null);
    setPaused(false);
    setPausedMs(0);
    setPausedAt(null);
    setError("");
    if (!ownerId) { session.current = emptySession(); setPreferences(defaultJourneyPreferences()); return; }
    try {
      const nextPreferences = loadJourneyPreferences(ownerId);
      session.current = loadSession(ownerId, nextPreferences);
      persist();
      setPreferences(nextPreferences);
      setSettingsReady(true);
      setPaused(session.current.pausedAt !== null);
      setPausedMs(session.current.pausedMs);
      setPausedAt(session.current.pausedAt);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : t("Could not read journey settings."));
    }
  }, [options.ownerId]);

  useEffect(() => {
    if (previousWalkId.current && !options.walkId) {
      session.current = { ...emptySession(), cooldownUntil: session.current.cooldownUntil };
      setPaused(false);
      setPausedMs(0);
      setPausedAt(null);
      pausedRecorderId.current = null;
      persist();
    }
    previousWalkId.current = options.walkId;
  }, [options.walkId]);

  useEffect(() => {
    if (!Capacitor.isNativePlatform() || !settingsReady || !options.ownerId) return;
    const ownerId = options.ownerId;
    let active = true;
    const refresh = (): void => {
      void Promise.all([readReminderMotionAuthorization(), JourneyMotionMonitor.getAvailability(), readLocationAuthorization()]).then(([status, { available }, location]) => {
        if (!active || latest.current.ownerId !== ownerId) return;
        setMotionAllowed(status === "authorized" && available);
        const motionMessage = t("Journey recording switched to Manual because motion access is off. You can still start journeys yourself.");
        const locationMessage = t("Journey recording switched to Manual because Always location access is off. You can still start journeys yourself.");
        const current = preferencesRef.current;
        const motionUnavailable = !available || (status !== "authorized" && status !== "notDetermined");
        const locationUnavailable = location !== "always" && current.mode !== "manual";
        if (motionUnavailable || locationUnavailable) {
          const manual: JourneyPreferences = { ...current, mode: "manual", autoPause: !motionUnavailable && location === "whenInUse" && current.autoPause };
          if (current.mode !== manual.mode || current.autoPause !== manual.autoPause) {
            saveJourneyPreferences(ownerId, manual);
            preferencesRef.current = manual;
            motion.current = null;
            setPreferences(manual);
            if (!manual.autoPause && session.current.pauseMode === "automatic") resumeJourney();
            setError(!available ? t("Automatic journey detection requires iOS 17 or later on iPhone, and motion support on Android.")
              : motionUnavailable ? motionMessage : locationMessage);
          }
          return;
        }
        if (status === "authorized" && available) {
          setError(currentError => currentError === motionMessage || (location === "always" && currentError === locationMessage) ? "" : currentError);
        }
      }).catch((failure: Error) => { if (active) setError(failure.message); });
    };
    refresh();
    const listener = CapacitorApp.addListener("appStateChange", ({ isActive }) => { if (isActive) refresh(); });
    return () => { active = false; void listener.then(handle => handle.remove()); };
  }, [settingsReady, options.ownerId]);

  async function changePreferences(next: JourneyPreferences): Promise<void> {
    const ownerId = latest.current.ownerId;
    if (!ownerId) throw new Error(t("Sign in before changing journey settings."));
    if (!Capacitor.isNativePlatform() && (next.mode !== "manual" || next.autoPause)) {
      throw new Error(t("Automatic journeys require the iOS or Android app."));
    }
    const previous = preferencesRef.current;
    if (next.mode !== "manual" || next.autoPause) {
      const { available } = await JourneyMotionMonitor.getAvailability();
      if (!available) throw new Error(t("Automatic journey detection requires iOS 17 or later on iPhone, and motion support on Android."));
      let motion = await readReminderMotionAuthorization();
      if (motion === "notDetermined") {
        if (!await requestReminderMotionPermission()) throw new Error(t("Allow motion access in Settings to detect walking and cycling."));
        motion = await readReminderMotionAuthorization();
      }
      if (motion !== "authorized") throw new Error(t("Allow motion access in Settings to detect walking and cycling."));
      setMotionAllowed(true);
    }
    if (next.mode !== "manual" && next.mode !== previous.mode && await readLocationAuthorization() !== "always") {
      throw new Error(t("Allow Always location access in Settings to start journeys in the background."));
    }
    if (latest.current.ownerId !== ownerId) throw new Error(t("Your account changed. Reopen journey settings."));
    saveJourneyPreferences(ownerId, next);
    if (session.current.cooldownUntil > 0 && next.restartMinutes !== previous.restartMinutes) {
      session.current = { ...session.current, cooldownUntil: session.current.cooldownUntil + (next.restartMinutes - previous.restartMinutes) * 60_000 };
      persist();
    }
    if (!next.autoPause && session.current.pauseMode === "automatic") resumeJourney();
    setPreferences(next);
    setSettingsReady(true);
    setRevision(value => value + 1);
    setError("");
    selectionHaptic();
  }

  const monitorNeeded = Boolean(settingsReady && options.ownerId && options.ready && (preferences.mode !== "manual" || (preferences.autoPause && options.walkId)));
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    if (!monitorNeeded) return;
    const ownerId = options.ownerId;
    let disposed = false;
    let listener: PluginListenerHandle | null = null;
    let errorListener: PluginListenerHandle | null = null;
    let failed = false;
    let started = false;
    let finishedWalkId: string | null = null;
    let expiryCheckPending = false;
    const valid = (): boolean => !disposed && !failed && latest.current.ownerId === ownerId;
    const fail = (failure: Error): void => {
      if (disposed) return;
      failed = true;
      console.error("Automatic journey monitoring failed", { ownerId, error: errorDiagnostic(failure) });
      setError(failure.message);
      void discardCandidate().catch((cause) => console.error("Could not discard automatic journey buffer", { error: errorDiagnostic(cause) }));
    };

    const pauseTiming = (idleSince: number): AutomaticPause =>
      automaticPauseTiming(idleSince, preferencesRef.current.pauseMinutes, preferencesRef.current.stopMinutes);

    const markAutomaticPause = (idleSince: number, automaticPause: AutomaticPause): void => {
      session.current = { ...session.current, pausedAt: idleSince, pauseMode: "automatic", automaticPause };
      persist();
      setPaused(true);
      setPausedAt(idleSince);
    };

    const finishAutomaticJourney = async (walkId: string, pausedAt: number): Promise<void> => {
      if (busy.current || finishedWalkId === walkId) return;
      busy.current = true;
      try {
        await latest.current.onStop(pausedAt);
        finishedWalkId = walkId;
      }
      finally { busy.current = false; }
    };

    const tick = async (): Promise<void> => {
      if (!started || !valid() || busy.current || !latest.current.ready) return;
      const now = Date.now();
      const activeId = latest.current.walkId;
      if (activeId) {
        if (finishedWalkId === activeId) return;
        if (session.current.id !== activeId) {
          session.current = { ...emptySession(), id: activeId };
          persist();
        }
        const { idleSince, pausedAt, pauseMode, automaticPause } = session.current;
        if (pauseMode === "manual" || !preferencesRef.current.autoPause) return;
        const timing = automaticPause ?? (idleSince !== null && motion.current &&
          motion.current.activity !== "unknown" ? pauseTiming(idleSince) : null);
        const pauseStart = pausedAt ?? idleSince;
        if (!timing || pauseStart === null || now < timing.startsAt) return;

        if (automaticPauseOutcome(timing, now, null) === "end") {
          if (expiryCheckPending) return;
          expiryCheckPending = true;
          const before = session.current;
          // Let motion events received during the native read run before its result.
          void JourneyMotionMonitor.getState().then(({ motion: sample }) => {
            enqueueMotion(async () => {
              try {
                if (!sample || !canFinish()) return;
                await observe(sample);
                if (!canFinish()) return;
                if (!automaticPause) markAutomaticPause(pauseStart, timing);
                await finishAutomaticJourney(activeId, pauseStart);
              } finally { expiryCheckPending = false; }
            });
          }).catch(fail);

          function canFinish(): boolean {
            return valid() && latest.current.ready && latest.current.walkId === activeId &&
              session.current === before && finishedWalkId !== activeId;
          }
          return;
        }
        if (!automaticPause) markAutomaticPause(pauseStart, timing);
        if (pausedRecorderId.current !== activeId) {
          pausedRecorderId.current = activeId;
          busy.current = true;
          try {
            await latest.current.onPause();
            if (!automaticPause) await latest.current.onAutomaticPause(activeId);
          } finally { busy.current = false; }
        }
        return;
      }
      if (!started || !valid()) return;
      const interruptedAt = candidate.current?.clock.interruptedAt;
      if (interruptedAt !== undefined && interruptedAt !== null && now - interruptedAt > CANDIDATE_STOP_GRACE_MS) {
        await discardCandidate();
      }
      if (preferencesRef.current.mode === "manual") return;
      if (now < session.current.cooldownUntil) return;
      if (motion.current?.activity !== "walking") return;
      if (!candidateTracker.current) {
        candidate.current = { startedAt: now, clock: { walkingMs: 0, walkingSince: now, interruptedAt: null }, startsNewSegment: false, points: [] };
        const tracker = createJourneyRecordingTracker(createCandidateLocationTracker(), latest.current.cities);
        candidateTracker.current = tracker;
        await tracker.start((point) => {
          if (!valid() || candidateTracker.current !== tracker || !candidate.current || latest.current.walkId || motion.current?.activity !== "walking") return;
          const recordedPoint = candidate.current.startsNewSegment ? { ...point, segmentBreakBefore: true } : point;
          candidate.current = { ...candidate.current, startsNewSegment: false, points: [...candidate.current.points, recordedPoint] };
          checkTime();
        }, (failure) => {
          fail(new Error(failure.message));
        });
      }
      const buffer = candidate.current;
      if (!buffer || buffer.points.length < 2 || now - buffer.points[buffer.points.length - 1].recordedAt > 30_000) {
        return;
      }
      if (candidateWalkingDuration(buffer.clock, now) < preferencesRef.current.startMinutes * 60_000) {
        return;
      }
      busy.current = true;
      try {
        await discardCandidate();
        if (!valid() || motion.current?.activity !== "walking" || latest.current.walkId) return;
        await latest.current.onStart({ source: "automatic", startedAt: buffer.startedAt, pausedMs: Math.max(0, now - buffer.startedAt - candidateWalkingDuration(buffer.clock, now)), points: buffer.points });
      } finally { busy.current = false; }
    };

    const observe = async (sample: JourneyMotionObservation): Promise<void> => {
      if (!valid()) return;
      const next = reconcileJourneyMotion(motion.current, sample);
      if (next === motion.current || (next.observedAt === motion.current?.observedAt &&
        next.activity === motion.current.activity && next.since === motion.current.since)) return;
      motion.current = next;
      if (candidate.current) {
        const clock = advanceCandidateWalkingClock(candidate.current.clock, next);
        if (clock === null) await discardCandidate();
        else candidate.current = { ...candidate.current, clock,
          startsNewSegment: candidate.current.startsNewSegment || clock.interruptedAt !== null };
      }
      if (!valid()) return;
      const walkId = latest.current.walkId;
      if (walkId && session.current.id === walkId && finishedWalkId !== walkId && latest.current.ready) {
        if (isJourneyMovement(next)) {
          if (session.current.pauseMode === "manual") return;
          const pausedAt = session.current.pausedAt ?? (preferencesRef.current.autoPause
            ? inactivityDeadlineBeforeMovement(session.current.idleSince, next, preferencesRef.current.pauseMinutes) : null);
          const wasPaused = pausedAt !== null;
          if (wasPaused) {
            const timing = session.current.automaticPause ?? pauseTiming(pausedAt);
            if (automaticPauseOutcome(timing, Date.now(), next.since) === "end") {
              if (!session.current.automaticPause) markAutomaticPause(pausedAt, timing);
              await finishAutomaticJourney(walkId, pausedAt);
              return;
            }
          }
          session.current = { ...session.current, idleSince: null, pausedAt: null,
            pausedMs: session.current.pausedMs + (pausedAt === null ? 0 : Math.max(0, next.since - pausedAt)),
            pauseMode: null, automaticPause: null, resumedAt: wasPaused ? next.since : session.current.resumedAt };
          persist();
          setPaused(false);
          pausedRecorderId.current = null;
          setPausedMs(session.current.pausedMs);
          setPausedAt(null);
          if (wasPaused) latest.current.onResume();
        } else if (session.current.pauseMode !== "manual" && next.activity !== "unknown" && session.current.idleSince === null) {
          const startedAt = latest.current.startedAt;
          if (startedAt === null) throw new Error("An active journey is missing its start time.");
          session.current = { ...session.current, idleSince: Math.max(next.since, startedAt, session.current.resumedAt ?? startedAt) };
          persist();
        }
      }
    };
    const enqueueMotion = (task: () => Promise<void>): void => {
      motionQueue.current = motionQueue.current.then(task).catch(fail);
    };
    const queueObservation = (sample: JourneyMotionObservation): void => {
      enqueueMotion(async () => {
        await observe(sample);
        await tick();
      });
    };
    let tickQueued = false;
    const checkTime = (): void => {
      if (tickQueued || !valid()) return;
      tickQueued = true;
      enqueueMotion(async () => {
        try { await tick(); }
        finally { tickQueued = false; }
      });
    };
    const refresh = (): void => {
      if (disposed) return;
      if (failed) { setRevision(value => value + 1); return; }
      if (!started) return;
      enqueueMotion(async () => {
        if (!valid()) return;
        const { motion: sample } = await JourneyMotionMonitor.getState();
        if (sample) await observe(sample);
        await tick();
      });
    };
    const refreshOnVisibility = (): void => {
      if (document.visibilityState === "visible") refresh();
    };
    locationTick.current = checkTime;
    const setup = async (): Promise<void> => {
      let motionAuthorization = await readReminderMotionAuthorization();
      if (motionAuthorization === "notDetermined") {
        if (await requestReminderMotionPermission()) {
          motionAuthorization = await readReminderMotionAuthorization();
        }
      }
      if (motionAuthorization !== "authorized") {
        if (!valid() || !ownerId) return;
        const manual: JourneyPreferences = { ...preferencesRef.current, mode: "manual", autoPause: false };
        saveJourneyPreferences(ownerId, manual);
        preferencesRef.current = manual;
        motion.current = null;
        setPreferences(manual);
        if (session.current.pauseMode === "automatic") resumeJourney();
        setError(t("Journey recording switched to Manual because motion access is off. You can still start journeys yourself."));
        return;
      }
      if (preferencesRef.current.mode !== "manual" && await readLocationAuthorization() !== "always") {
        throw new Error(t("Allow Always location access in Settings to start journeys in the background."));
      }
      if (!valid()) return;
      if (Capacitor.getPlatform() === "ios") {
        errorListener = await JourneyMotionMonitor.addListener("monitorError", failure => {
          fail(new Error(`Journey background location failed (${failure.code}): ${failure.message}`));
        });
      }
      if (!valid()) { await errorListener?.remove(); return; }
      listener = await JourneyMotionMonitor.addListener("motion", queueObservation);
      if (!valid()) { await listener.remove(); return; }
      await JourneyMotionMonitor.start();
      started = true;
      if (!valid()) { await JourneyMotionMonitor.stop(); return; }
      setError("");
      refresh();
    };
    const setupTask = lifecycleQueue.current.then(setup);
    void setupTask.catch(fail);
    const timer = window.setInterval(checkTime, 1_000);
    document.addEventListener("visibilitychange", refreshOnVisibility);
    const nativeResume = CapacitorApp.addListener("appStateChange", ({ isActive }) => { if (isActive) refresh(); })
      .catch((failure: Error) => { fail(failure); return null; });
    return () => {
      disposed = true;
      if (locationTick.current === checkTime) locationTick.current = null;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refreshOnVisibility);
      void nativeResume.then(handle => handle?.remove()).catch(error => {
        console.error("Could not remove journey foreground listener", { error: errorDiagnostic(error) });
      });
      lifecycleQueue.current = setupTask.catch((cause) => {
        console.error("Journey motion setup did not complete", { error: errorDiagnostic(cause) });
      }).then(async () => {
        await listener?.remove();
        await errorListener?.remove();
        await discardCandidate();
        if (started) await JourneyMotionMonitor.stop();
      }).catch((cause) => {
        console.error("Could not stop journey motion monitoring", { error: errorDiagnostic(cause) });
        setError(cause instanceof Error ? cause.message : t("Could not stop automatic journey monitoring."));
      });
    };
  }, [monitorNeeded, options.ownerId, preferences.mode, revision]);

  function acceptPoint(): boolean {
    return session.current.pausedAt === null && (!preferencesRef.current.autoPause || !motion.current || motion.current.activity === "unknown" || isJourneyMovement(motion.current));
  }

  async function pauseJourney(): Promise<void> {
    const activeId = latest.current.walkId;
    if (!activeId || session.current.pausedAt !== null) return;
    const pausedAt = Date.now();
    session.current = {
      ...session.current,
      id: activeId,
      pausedAt,
      idleSince: session.current.idleSince ?? pausedAt,
      pauseMode: "manual",
      automaticPause: null,
    };
    persist();
    setPaused(true);
    setPausedMs(session.current.pausedMs);
    setPausedAt(pausedAt);
    pausedRecorderId.current = activeId;
    await latest.current.onPause();
  }

  function resumeJourney(): void {
    const activeId = latest.current.walkId;
    const pausedAt = session.current.pausedAt;
    if (!activeId || pausedAt === null) return;
    const resumedAt = Date.now();
    session.current = {
      ...session.current,
      id: activeId,
      pausedAt: null,
      idleSince: null,
      pausedMs: session.current.pausedMs + Math.max(0, resumedAt - pausedAt),
      pauseMode: null,
      automaticPause: null,
      resumedAt,
    };
    persist();
    setPaused(false);
    setPausedMs(session.current.pausedMs);
    setPausedAt(null);
    pausedRecorderId.current = null;
    latest.current.onResume();
  }

  function applyWidgetPause(request: JourneyPauseRequest): void {
    if (request.walkId !== latest.current.walkId || request.ownerId !== latest.current.ownerId || latest.current.startedAt === null) return;
    session.current = { ...session.current, id: request.walkId, pausedAt: request.paused ? request.requestedAt : null,
      idleSince: request.paused ? request.requestedAt : null, resumedAt: request.paused ? session.current.resumedAt : request.requestedAt, pauseMode: request.paused ? "manual" : null, automaticPause: null,
      pausedMs: Math.max(0, request.activeStartedAt - latest.current.startedAt) };
    persist();
    setPaused(request.paused);
    setPausedAt(session.current.pausedAt);
    setPausedMs(session.current.pausedMs);
    pausedRecorderId.current = request.paused ? request.walkId : null;
  }

  function hasPendingSegmentBreak(walkId: string, lastRecordedAt: number | undefined): boolean {
    const { id, resumedAt } = session.current;
    return id === walkId && resumedAt !== null && (lastRecordedAt === undefined || lastRecordedAt < resumedAt);
  }

  function activityState(now: number): { paused: boolean; elapsedMs: number } {
    const current = session.current;
    return { paused: current.pausedAt !== null, elapsedMs: journeyElapsedMs(latest.current.startedAt ?? now, current.pausedMs, current.pausedAt, now) };
  }

  function isManualPause(): boolean { return session.current.pauseMode === "manual"; }
  function isAutomaticJourney(): boolean { return session.current.source === "automatic" && session.current.id !== null; }
  function observeLocation(): void { locationTick.current?.(); }

  return {
    preferences,
    motionAllowed,
    applyWidgetPause,
    activityState,
    isManualPause,
    changePreferences,
    paused,
    pausedMs,
    pausedAt,
    error,
    errorDismissed,
    dismissError,
    markStarted,
    manualStop,
    acceptPoint,
    hasPendingSegmentBreak,
    pauseJourney,
    resumeJourney,
    isAutomaticJourney,
    observeLocation,
  };
}
