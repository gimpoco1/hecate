import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { App as CapacitorApp } from "@capacitor/app";
import { ActionSheet, ActionSheetButtonStyle } from "@capacitor/action-sheet";
import { AppLauncher } from "@capacitor/app-launcher";
import { Browser } from "@capacitor/browser";
import { Keyboard } from "@capacitor/keyboard";
import { LocalNotifications } from "@capacitor/local-notifications";
import type { Map as MapLibreMap } from "maplibre-gl";
import {
  evaluatePersonalAchievements,
  isPersonalAchievementId,
  PERSONAL_ACHIEVEMENTS,
  personalAchievementDefinition,
  type PersonalAchievementId,
} from "./achievements";
import {
  acknowledgeAchievementUnlock,
  dismissAchievementUnlock,
  isAchievementUnlockPending,
  loadAchievementUnlocks,
  reconcileAchievementUnlocks,
  syncAchievementUnlocks,
} from "./achievementUnlocks";
import { reconcileDiscoveryAchievementUnlocks } from "./achievementDelivery";
import { cityMilestoneProgress, earnedCityMilestones } from "./badges";
import {
  canonicalCityForStoredBoundary,
  cityForMapCenter,
  discoveredCityDistanceKm,
  discoveredCityPercentage,
  fetchCityBoundary,
  isPointInCity,
  preferredCityForView,
  type CityBoundary,
} from "./city";
import { DiscoveryMap } from "./components/DiscoveryMap";
import { requestDeviceHeadingPermission } from "./deviceHeading";
import { AchievementCard } from "./components/AchievementCard";
import { AchievementCelebration } from "./components/AchievementCelebration";
import { AccountLoadingScreen } from "./components/AccountLoadingScreen";
import { FavoritePlaceEditor } from "./components/FavoritePlaceEditor";
import { CityLevelStars } from "./components/CityLevelStars";
import { SyncSheet } from "./components/SyncSheet";
import {
  HecateMark,
  InfoIcon,
  LocateIcon,
  MapIcon,
  PerspectiveIcon,
  SaveIcon,
  UserIcon,
  XIcon,
} from "./components/Icons";
import {
  discoveredDistanceKm,
  discoveryCellCenter,
  discoveryCellKey,
  discoveryCellsFromPoints,
  distanceKm,
  isUsableGpsPoint,
  mergeDiscoveryCells,
  mergeRoutePoints,
  pointToDiscoveryCell,
  routeDistanceKm,
  shouldRecordPoint,
} from "./geo";
import {
  ExplorationReminder,
  isUnmappedArea,
  loadReminderPreference,
  pauseReminderAfterTap,
  REMINDER_COOLDOWN_MS,
  REMINDER_DISTANCE_M,
  REMINDER_MINUTES,
  saveReminderPreference,
  simulateUnmappedWalk,
  type ReminderKind,
} from "./explorationReminder";
import {
  createFavoritePlace,
  deleteFavoritePlacesFromDatabase,
  favoriteDirectionsUrl,
  favoritePlacesFromUnknown,
  favoriteNativeDirectionsUrl,
  loadFavoritePlaces,
  loadFavoritePlacesFromDatabase,
  saveFavoritePlaces,
  upsertFavoritePlacesInDatabase,
  type FavoritePlace,
} from "./favoritePlaces";
import { InactivityReminder, isDiscoveredArea } from "./inactivityReminder";
import {
  AUTOMATIC_UPDATE_PENDING_EVENT,
  isAutomaticUpdatePending,
  isAutomaticUpdatesEnabled,
  setAutomaticUpdatePending,
} from "./automaticUpdates";
import {
  buildLeaderboardSnapshot,
  refreshPublishedLeaderboardSnapshot,
  type LeaderboardSnapshot,
} from "./leaderboard";
import { ensureNotificationPermission } from "./notificationPermissions";
import {
  isInSystemGestureZone,
  journeySheetOffsetPx,
  shouldAllowHeaderGesture,
  shouldExpandJourneySheet,
  shouldShowExplorationRecap,
  shouldStartJourneyDrag,
} from "./journeyUi";
import {
  createForegroundLocationTracker,
  createLocationTracker,
  createReminderLocationTracker,
  isNativeApp,
  openLocationSettings,
  passiveLocationMode,
  type LocationTracker,
} from "./location";
import {
  isSyncConfigured,
  loadDiscoveredCities,
  loadSyncedDiscovery,
  purgeLegacyDiscoveryCache,
  replaceDiscoveredCities,
  saveCompletedWalk,
  supabase,
  syncDiscoveredCity,
  syncDiscoveryCells,
} from "./storage";
import type {
  Coordinate,
  DiscoveryCell,
  MapMode,
  PendingWalk,
  TrackingState,
} from "./types";
import { loadWalkJournal, saveWalkJournal } from "./walkJournal";

type ActiveWalk = Omit<PendingWalk, "finishedAt"> & { isTest?: boolean };
type ExplorationSummary = {
  walkId: string;
  points: Coordinate[];
  cells: DiscoveryCell[];
  startedAt: number;
  finishedAt: number;
  newGroundKm: number;
  travelledKm: number;
  cityName?: string;
  cityPercentageAdded?: number;
};

type PassiveLocationStatus =
  | "idle"
  | "requesting"
  | "located"
  | "denied"
  | "unavailable";
const PASSIVE_LOCATION_MAX_AGE_MS = 5 * 60_000;
const PASSIVE_LOCATION_ACQUISITION_TIMEOUT_MS = 12_000;
const PASSIVE_LOCATION_RETRY_MS = 5_000;
const REMINDER_NOTIFICATION_ID = 1042;
const INACTIVITY_NOTIFICATION_ID = 1043;
const INACTIVITY_TEST_NOTIFICATION_ID = 1044;
const REMINDER_TEST_NOTIFICATION_ID = 1045;
const ACHIEVEMENT_NOTIFICATION_ID_START = 1100;
const DEV_TOOLS_VISIBILITY_KEY = "hecate:dev-tools-visible";
const JOURNEY_SETTLE_DURATION_MS = 220;
const JOURNEY_MAP_TAP_CLOSE_DURATION_MS = 70;

function reminderMessage() {
  return "You have been moving through new areas for 5 minutes. Start recording your journey?";
}

async function sendReminderNotification(
  userId: string,
  delayMs = 1_000,
  test = false,
) {
  await LocalNotifications.schedule({
    notifications: [
      {
        id: test ? REMINDER_TEST_NOTIFICATION_ID : REMINDER_NOTIFICATION_ID,
        title: "Discovering somewhere new?",
        body: reminderMessage(),
        schedule: { at: new Date(Date.now() + delayMs) },
        extra: { kind: test ? "test-unmapped" : "unmapped", userId },
      },
    ],
  });
}

async function sendAchievementNotification(
  achievementId: PersonalAchievementId,
  userId: string,
  test = false,
) {
  if (!(await ensureNotificationPermission())) return false;
  const achievement = personalAchievementDefinition(achievementId);
  const notificationIndex = Math.max(
    0,
    PERSONAL_ACHIEVEMENTS.findIndex(({ id }) => id === achievementId),
  );
  await LocalNotifications.schedule({
    notifications: [
      {
        id: test
          ? ACHIEVEMENT_NOTIFICATION_ID_START + PERSONAL_ACHIEVEMENTS.length
          : ACHIEVEMENT_NOTIFICATION_ID_START + notificationIndex,
        title: `Achievement unlocked: ${achievement.title}`,
        body: achievement.description,
        sound: "default",
        schedule: { at: new Date(Date.now() + 500) },
        extra: {
          kind: test ? "achievement-test" : "achievement",
          achievementId,
          userId,
        },
        threadIdentifier: "hecate-achievements",
      },
    ],
  });
  return true;
}

function formatDistance(distance: number) {
  if (distance < 1) return `${Math.round(distance * 1000)} m`;
  return `${distance.toFixed(distance >= 10 ? 1 : 2)} km`;
}

function formatRemainingDistance(distance: number) {
  if (distance < 1) return `${Math.round(distance * 1000)} m`;
  return `${distance.toFixed(1)} km`;
}

function formatDiscoveryPercentage(
  percentage: number | null,
  loading: boolean,
) {
  if (loading) return "…";
  if (percentage === null) return "—";
  if (percentage > 0 && percentage < 0.1) return "<0.1%";
  if (percentage < 10) return `${percentage.toFixed(1)}%`;
  return `${Math.round(percentage)}%`;
}

function formatRecapPercentage(percentage: number) {
  if (percentage <= 0) return "0%";
  if (percentage < 0.01) return "<0.01%";
  if (percentage < 1) return `${percentage.toFixed(2)}%`;
  return formatDiscoveryPercentage(percentage, false);
}

function formatDuration(startedAt: number, finishedAt: number) {
  const minutes = Math.max(1, Math.round((finishedAt - startedAt) / 60_000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return `${hours} hr ${minutes % 60 ? `${minutes % 60} min` : ""}`.trim();
}

function createWalkId() {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export default function App() {
  const [mode, setMode] = useState<MapMode>("discover");
  const [points, setPoints] = useState<Coordinate[]>([]);
  const [cells, setCells] = useState<DiscoveryCell[]>([]);
  const [currentPoint, setCurrentPoint] = useState<Coordinate | undefined>();
  const [passiveLocationStatus, setPassiveLocationStatus] =
    useState<PassiveLocationStatus>("idle");
  const [
    passiveLocationRefreshGeneration,
    setPassiveLocationRefreshGeneration,
  ] = useState(0);
  const [reminderEnabled, setReminderEnabled] = useState(false);
  const [notificationPermissionReady, setNotificationPermissionReady] =
    useState<boolean | null>(() => (isNativeApp() ? null : true));
  const [reminderPrompt, setReminderPrompt] = useState<ReminderKind | null>(
    null,
  );
  const [inactivityPrompt, setInactivityPrompt] = useState(false);
  const [reminderDebug, setReminderDebug] = useState({
    elapsedMs: 0,
    distanceM: 0,
    status: "Waiting for location",
  });
  const [reminderTestMessage, setReminderTestMessage] = useState("");
  const [achievementTestMessage, setAchievementTestMessage] = useState("");
  const [devToolsVisible, setDevToolsVisible] = useState(() => {
    if (!(import.meta.env.DEV || import.meta.env.VITE_ENABLE_DEV_TOOLS === "1"))
      return false;
    try {
      return localStorage.getItem(DEV_TOOLS_VISIBILITY_KEY) !== "false";
    } catch {
      return true;
    }
  });
  const [accountUserId, setAccountUserId] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(!isSyncConfigured);
  const [tracking, setTracking] = useState<TrackingState>("idle");
  const trackingStateRef = useRef<TrackingState>(tracking);
  trackingStateRef.current = tracking;
  const [zoom, setZoom] = useState(1.35);
  const [syncOpen, setSyncOpen] = useState(false);
  const [syncInitialIntent, setSyncInitialIntent] = useState<
    "signin" | "signup"
  >("signin");
  const [coverageInfoOpen, setCoverageInfoOpen] = useState(false);
  const [discoveryLoading, setDiscoveryLoading] = useState(false);
  const [authoritativeSnapshot, setAuthoritativeSnapshot] =
    useState<LeaderboardSnapshot | null>(null);
  const [perspectiveView, setPerspectiveView] = useState(false);
  const [favoritePlaces, setFavoritePlaces] = useState<FavoritePlace[]>([]);
  const [selectedFavoritePlaceId, setSelectedFavoritePlaceId] = useState<
    string | null
  >(null);
  const [favoritePlacementActive, setFavoritePlacementActive] = useState(false);
  const [favoriteDraft, setFavoriteDraft] = useState<FavoritePlace | null>(null);
  const [favoriteEditorMode, setFavoriteEditorMode] = useState<"view" | "edit">("view");
  const [keyboardInset, setKeyboardInset] = useState(0);
  const [cityBoundary, setCityBoundary] = useState<CityBoundary | null>(null);
  const [viewCenter, setViewCenter] = useState<{
    lng: number;
    lat: number;
  } | null>(null);
  const [viewedCity, setViewedCity] = useState<CityBoundary | null>(null);
  const [viewCityLoading, setViewCityLoading] = useState(false);
  const [discoveredCities, setDiscoveredCities] = useState<CityBoundary[]>([]);
  const [citiesLoadedUserId, setCitiesLoadedUserId] = useState<string | null>(
    null,
  );
  const [citiesExpanded, setCitiesExpanded] = useState(false);
  const [journeyContentVisible, setJourneyContentVisible] = useState(false);
  const [cityBackfillLoading, setCityBackfillLoading] = useState(false);
  const [explorationSummary, setExplorationSummary] =
    useState<ExplorationSummary | null>(null);
  const [achievementCelebrations, setAchievementCelebrations] = useState<
    PersonalAchievementId[]
  >([]);
  const [achievementTestPreview, setAchievementTestPreview] =
    useState<PersonalAchievementId | null>(null);
  const [testRouteRunning, setTestRouteRunning] = useState(false);
  const mapRef = useRef<MapLibreMap | null>(null);
  const trackerRef = useRef<LocationTracker | null>(null);
  const foregroundTrackerRef = useRef<LocationTracker | null>(null);
  const latestPassivePointRef = useRef<Coordinate | null>(null);
  const focusFirstTrackingPointRef = useRef(false);
  const reminderRef = useRef(new ExplorationReminder());
  const inactivityReminderRef = useRef(new InactivityReminder());
  const inactivityDueAtRef = useRef<number | null>(null);
  const inactivityTimerRef = useRef<number | null>(null);
  const inactivityGenerationRef = useRef(0);
  const inactivityNotificationQueueRef = useRef<Promise<void>>(
    Promise.resolve(),
  );
  const achievementTestIndexRef = useRef(0);
  const achievementCitiesRef = useRef<CityBoundary[]>([]);
  const citiesLoadedUserIdRef = useRef<string | null>(null);
  const testRouteRunningRef = useRef(false);
  const lastBackgroundAchievementCheckRef = useRef(0);
  const lastCityLookupRef = useRef<{ point: Coordinate; at: number } | null>(
    null,
  );
  const cityLookupAbortRef = useRef<AbortController | null>(null);
  const lastPointRef = useRef<Coordinate | undefined>(undefined);
  const activeWalkRef = useRef<ActiveWalk | null>(null);
  const trackingUserRef = useRef<string | null>(null);
  const pendingWalksRef = useRef<PendingWalk[]>([]);
  const walkUploadPromiseRef = useRef<Promise<void> | null>(null);
  const accountUserIdRef = useRef(accountUserId);
  accountUserIdRef.current = accountUserId;
  const refreshAuthoritativeSnapshot = useCallback(async (userId: string) => {
    const snapshot = await buildLeaderboardSnapshot(userId);
    if (accountUserIdRef.current === userId) setAuthoritativeSnapshot(snapshot);
    return snapshot;
  }, []);
  const journeyCardRef = useRef<HTMLElement | null>(null);
  const journeyDragRef = useRef<{
    pointerId: number;
    startY: number;
    startHeight: number;
    currentHeight: number;
    collapsedHeight: number;
    expandedHeight: number;
    moved: boolean;
    startedExpanded: boolean;
  } | null>(null);
  const journeyDragFrameRef = useRef<number | null>(null);
  const journeySettleFrameRef = useRef<number | null>(null);
  const journeyAnimationRef = useRef<Animation | null>(null);
  const journeyExpandedRef = useRef(false);
  const initialMapFocusUserRef = useRef<string | null>(null);
  const suppressJourneyClickRef = useRef(false);
  const previewMapRef = useRef<MapLibreMap | null>(null);
  const cellsRef = useRef<DiscoveryCell[]>([]);
  const cellKeysRef = useRef<Set<string>>(new Set());
  const discoveryHistoryReadyRef = useRef(false);
  const pointsRef = useRef<Coordinate[]>([]);
  const deferredLocationUiRef = useRef(false);
  const explorationStartRef = useRef<{
    cells: Set<string>;
    points: Coordinate[];
    discoveryDistance: number;
  } | null>(null);
  // A cell is a revealed area, not a piece of route. The saved walks preserve
  // the real route boundaries, then this function credits only portions that
  // unlock new cells.
  const discoveryDistance = useMemo(
    () => discoveredDistanceKm(points),
    [points],
  );
  const authoritativeCitiesById = useMemo(
    () =>
      new Map(
        (authoritativeSnapshot?.cities ?? []).map((city) => [city.cityId, city]),
      ),
    [authoritativeSnapshot],
  );
  const activeCity =
    currentPoint && cityBoundary && isPointInCity(currentPoint, cityBoundary)
      ? cityBoundary
      : null;
  const isCityScale = zoom >= 6;
  const cachedViewCity = useMemo(
    () =>
      viewCenter && isCityScale
        ? cityForMapCenter(
            viewCenter,
            [cityBoundary, ...discoveredCities, viewedCity].filter(
              (city): city is CityBoundary => city !== null,
            ),
          )
        : null,
    [cityBoundary, discoveredCities, isCityScale, viewCenter, viewedCity],
  );

  const summaryCity = useMemo(() => {
    if (!isCityScale || !viewCenter) return activeCity ?? null;
    const knownCities = [cityBoundary, ...discoveredCities].filter(
      (city): city is CityBoundary => city !== null,
    );
    const selected = preferredCityForView(
      viewCenter,
      activeCity,
      viewedCity,
      knownCities,
    );
    return selected ?? viewedCity ?? activeCity ?? null;
  }, [
    activeCity,
    cityBoundary,
    discoveredCities,
    isCityScale,
    viewCenter,
    viewedCity,
  ]);

  const currentCityDistance = useMemo(
    () =>
      summaryCity
        ? accountUserId
          ? (authoritativeCitiesById.get(summaryCity.id)?.discoveredKm ?? 0)
          : discoveredCityDistanceKm(points, summaryCity)
        : accountUserId
          ? (authoritativeSnapshot?.totalDiscoveredKm ?? 0)
          : discoveryDistance,
    [
      accountUserId,
      authoritativeCitiesById,
      authoritativeSnapshot,
      discoveryDistance,
      points,
      summaryCity,
    ],
  );
  const currentCityMilestone = cityMilestoneProgress(currentCityDistance);
  const currentCityMilestoneRemaining = currentCityMilestone.next
    ? Math.max(0, currentCityMilestone.next.thresholdKm - currentCityDistance)
    : 0;
  const currentCityMilestoneLevel = currentCityMilestone.next
    ? currentCityMilestone.next.level - 1
    : 3;
  const summaryCityPercentage = useMemo(
    () =>
      summaryCity
        ? accountUserId
          ? (authoritativeCitiesById.get(summaryCity.id)
              ?.discoveredPercentage ?? 0)
          : discoveredCityPercentage(cells, summaryCity)
        : null,
    [accountUserId, authoritativeCitiesById, cells, summaryCity],
  );
  const discoveryLabel = accountUserId
    ? formatDiscoveryPercentage(
        summaryCityPercentage,
        viewCityLoading && !summaryCity,
      )
    : "—";
  const nativeApp = isNativeApp();
  const devToolsEnabled =
    import.meta.env.DEV || import.meta.env.VITE_ENABLE_DEV_TOOLS === "1";

  const setDevToolsOpen = (visible: boolean) => {
    setDevToolsVisible(visible);
    try {
      localStorage.setItem(DEV_TOOLS_VISIBILITY_KEY, String(visible));
    } catch {
      /* The control still works for this session when storage is unavailable. */
    }
  };

  const updateInactivitySchedule = useCallback(
    (dueAt: number | null) => {
      if (inactivityDueAtRef.current === dueAt) return;
      inactivityDueAtRef.current = dueAt;
      const generation = ++inactivityGenerationRef.current;
      if (inactivityTimerRef.current !== null)
        window.clearTimeout(inactivityTimerRef.current);
      inactivityTimerRef.current = null;

      const showInAppReminder = () => {
        if (
          generation !== inactivityGenerationRef.current ||
          trackingStateRef.current !== "tracking"
        )
          return;
        inactivityReminderRef.current.markReminded();
        setInactivityPrompt(true);
      };
      if (!nativeApp) {
        if (dueAt !== null)
          inactivityTimerRef.current = window.setTimeout(
            showInAppReminder,
            Math.max(0, dueAt - Date.now()),
          );
        return;
      }

      // Serialize cancellation and scheduling so an older GPS update cannot
      // leave a stale notification queued after the recording moves or stops.
      inactivityNotificationQueueRef.current =
        inactivityNotificationQueueRef.current
          .catch(() => undefined)
          .then(async () => {
            await LocalNotifications.cancel({
              notifications: [{ id: INACTIVITY_NOTIFICATION_ID }],
            });
            if (
              dueAt === null ||
              generation !== inactivityGenerationRef.current
            )
              return;
            const notificationAllowed = await ensureNotificationPermission();
            if (generation !== inactivityGenerationRef.current) return;
            if (!notificationAllowed) {
              inactivityTimerRef.current = window.setTimeout(
                showInAppReminder,
                Math.max(0, dueAt - Date.now()),
              );
              return;
            }
            await LocalNotifications.schedule({
              notifications: [
                {
                  id: INACTIVITY_NOTIFICATION_ID,
                  title: "Still recording your discovery?",
                  body: "If you have finished exploring near one spot, you can stop recording. Your recording will continue until you stop it.",
                  schedule: {
                    at: new Date(Math.max(dueAt, Date.now() + 1_000)),
                  },
                  extra: { kind: "inactivity" },
                },
              ],
            });
          })
          .catch((error) => {
            console.warn("Could not schedule inactivity reminder", error);
            if (
              dueAt !== null &&
              generation === inactivityGenerationRef.current
            ) {
              inactivityTimerRef.current = window.setTimeout(
                showInAppReminder,
                Math.max(0, dueAt - Date.now()),
              );
            }
          });
    },
    [nativeApp],
  );

  const resetInactivityReminder = useCallback(() => {
    inactivityReminderRef.current.reset();
    updateInactivitySchedule(null);
    if (nativeApp)
      void LocalNotifications.cancel({
        notifications: [{ id: INACTIVITY_TEST_NOTIFICATION_ID }],
      }).catch(() => undefined);
    setInactivityPrompt(false);
  }, [nativeApp, updateInactivitySchedule]);

  useEffect(() => {
    cellsRef.current = cells;
  }, [cells]);
  useEffect(() => {
    pointsRef.current = points;
  }, [points]);
  useEffect(
    () => () => {
      if (journeyDragFrameRef.current !== null)
        cancelAnimationFrame(journeyDragFrameRef.current);
      if (journeySettleFrameRef.current !== null)
        cancelAnimationFrame(journeySettleFrameRef.current);
      journeyAnimationRef.current?.cancel();
    },
    [],
  );
  useEffect(() => {
    const card = journeyCardRef.current;
    if (!card || journeyAnimationRef.current) return;
    journeyExpandedRef.current = citiesExpanded;
    card.dataset.expanded = String(citiesExpanded);
  }, [citiesExpanded, isCityScale]);
  const cityProgresses = useMemo(() => {
    const unique = new Map(discoveredCities.map((city) => [city.id, city]));
    if (cityBoundary) unique.set(cityBoundary.id, cityBoundary);
    return [...unique.values()]
      .map((city) => ({
        city,
        percentage: accountUserId
          ? (authoritativeCitiesById.get(city.id)?.discoveredPercentage ?? 0)
          : discoveredCityPercentage(cells, city),
        distance: accountUserId
          ? (authoritativeCitiesById.get(city.id)?.discoveredKm ?? 0)
          : discoveredCityDistanceKm(points, city),
      }))
      .sort(
        (a, b) =>
          b.percentage - a.percentage || a.city.name.localeCompare(b.city.name),
      );
  }, [
    authoritativeCitiesById,
    accountUserId,
    cityBoundary,
    discoveredCities,
    cells,
    points,
  ]);
  achievementCitiesRef.current = cityProgresses.map(({ city }) => city);
  citiesLoadedUserIdRef.current = citiesLoadedUserId;
  testRouteRunningRef.current = testRouteRunning;
  const totalCityDistance = useMemo(
    () =>
      cityProgresses.reduce((total, progress) => total + progress.distance, 0),
    [cityProgresses],
  );
  const accountCityProgress = activeCity
    ? {
        cityId: activeCity.id,
        cityName: activeCity.name,
        discoveredKm: discoveredCityDistanceKm(points, activeCity),
      }
    : null;
  const achievementEvaluations = useMemo(
    () =>
      evaluatePersonalAchievements(
        points,
        cityProgresses.map(({ city }) => city),
        cityProgresses.map(({ city, distance }) => ({
          cityId: city.id,
          discoveredKm: distance,
        })),
      ),
    [cityProgresses, points],
  );
  const activeAchievementCelebration = achievementTestPreview
    ? personalAchievementDefinition(achievementTestPreview)
    : achievementCelebrations[0]
      ? personalAchievementDefinition(achievementCelebrations[0])
      : null;

  useEffect(() => {
    if (!accountUserId) {
      setAchievementCelebrations([]);
      return;
    }
    if (
      testRouteRunning ||
      activeWalkRef.current?.isTest ||
      !discoveryHistoryReadyRef.current ||
      citiesLoadedUserId !== accountUserId
    )
      return;
    const earned = achievementEvaluations
      .filter(({ earned: isEarned }) => isEarned)
      .map(({ definition }) => definition.id);
    const localBeforeReconcile = loadAchievementUnlocks(accountUserId);
    const unlocks = reconcileAchievementUnlocks(accountUserId, earned);
    setAchievementCelebrations(unlocks.pending);
    void syncAchievementUnlocks(
      accountUserId,
      earned,
      localBeforeReconcile,
      unlocks.newlyEarned,
    )
      .then((synced) => {
        if (accountUserIdRef.current === accountUserId && synced) {
          setAchievementCelebrations(synced.pending);
          if (nativeApp) {
            synced.newlyEarned.forEach((achievementId) => {
              void sendAchievementNotification(
                achievementId,
                accountUserId,
              ).catch((error) =>
                console.warn("Could not show achievement notification", error),
              );
            });
          }
        }
      })
      .catch((error) => {
        console.warn("Could not sync achievement unlocks", error);
        if (nativeApp) {
          unlocks.newlyEarned.forEach((achievementId) => {
            void sendAchievementNotification(
              achievementId,
              accountUserId,
            ).catch((notificationError) =>
              console.warn(
                "Could not show achievement notification",
                notificationError,
              ),
            );
          });
        }
      });
  }, [
    accountUserId,
    achievementEvaluations,
    citiesLoadedUserId,
    nativeApp,
    testRouteRunning,
  ]);

  useEffect(() => {
    if (
      !accountUserId ||
      !discoveryHistoryReadyRef.current ||
      citiesLoadedUserId !== accountUserId
    )
      return;
    const retry = () => {
      if (document.visibilityState !== "visible" || !navigator.onLine) return;
      const earned = achievementEvaluations
        .filter(({ earned: isEarned }) => isEarned)
        .map(({ definition }) => definition.id);
      const local = loadAchievementUnlocks(accountUserId);
      void syncAchievementUnlocks(accountUserId, earned, local)
        .then((synced) => {
          if (accountUserIdRef.current === accountUserId && synced)
            setAchievementCelebrations(synced.pending);
        })
        .catch(() => undefined);
    };
    window.addEventListener("online", retry);
    document.addEventListener("visibilitychange", retry);
    return () => {
      window.removeEventListener("online", retry);
      document.removeEventListener("visibilitychange", retry);
    };
  }, [accountUserId, achievementEvaluations, citiesLoadedUserId]);

  useEffect(() => {
    purgeLegacyDiscoveryCache();
    if (!supabase) return;
    let active = true;
    const client = supabase;
    void client.auth.getSession().then(({ data }) => {
      if (!active) return;
      const nextUserId = data.session?.user.id ?? null;
      if (nextUserId !== accountUserIdRef.current)
        setDiscoveryLoading(Boolean(nextUserId));
      setAccountUserId(nextUserId);
      setAuthReady(true);
    });
    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      const nextUserId = session?.user.id ?? null;
      if (nextUserId !== accountUserIdRef.current)
        setDiscoveryLoading(Boolean(nextUserId));
      setAccountUserId(nextUserId);
      setAuthReady(true);
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!nativeApp) return;
    let active = true;
    void ensureNotificationPermission()
      .then((allowed) => {
        if (active) setNotificationPermissionReady(allowed);
      })
      .catch(() => {
        if (active) setNotificationPermissionReady(false);
      });
    return () => {
      active = false;
    };
  }, [nativeApp]);

  useEffect(() => {
    const preference = accountUserId
      ? loadReminderPreference(accountUserId)
      : { enabled: false, promptedAt: 0, pausedUntil: 0 };
    reminderRef.current = new ExplorationReminder(
      preference.promptedAt,
      preference.pausedUntil,
    );
    const enabled = preference.enabled && notificationPermissionReady !== false;
    setReminderEnabled(enabled);
    if (accountUserId && preference.enabled && !enabled) {
      saveReminderPreference(
        accountUserId,
        false,
        preference.promptedAt,
        preference.pausedUntil,
      );
    }
    setReminderPrompt(null);
  }, [accountUserId, notificationPermissionReady]);

  useEffect(() => {
    if (!nativeApp) return;
    let disposed = false;
    let listener: { remove: () => Promise<void> } | undefined;
    // A recording is never resumed automatically after a fresh app launch.
    void LocalNotifications.cancel({
      notifications: [
        { id: INACTIVITY_NOTIFICATION_ID },
        { id: INACTIVITY_TEST_NOTIFICATION_ID },
      ],
    }).catch(() => undefined);
    void LocalNotifications.addListener(
      "localNotificationActionPerformed",
      (event) => {
        if (
          event.notification.extra?.kind === "achievement-test" &&
          isPersonalAchievementId(event.notification.extra.achievementId)
        ) {
          setAchievementTestPreview(event.notification.extra.achievementId);
          return;
        }
        if (
          event.notification.extra?.kind === "achievement" &&
          isPersonalAchievementId(event.notification.extra.achievementId)
        ) {
          const notifiedUserId = event.notification.extra.userId;
          if (
            typeof notifiedUserId === "string" &&
            notifiedUserId !== accountUserIdRef.current
          )
            return;
          const achievementId = event.notification.extra.achievementId;
          const userId =
            typeof notifiedUserId === "string"
              ? notifiedUserId
              : accountUserIdRef.current;
          if (!userId || !isAchievementUnlockPending(userId, achievementId))
            return;
          setAchievementCelebrations((current) =>
            current.includes(achievementId)
              ? current
              : [achievementId, ...current],
          );
          return;
        }
        if (
          event.notification.id === INACTIVITY_NOTIFICATION_ID ||
          event.notification.id === INACTIVITY_TEST_NOTIFICATION_ID
        ) {
          if (trackingStateRef.current === "tracking") {
            inactivityReminderRef.current.markReminded();
            setInactivityPrompt(true);
          }
          return;
        }
        if (event.notification.id === REMINDER_TEST_NOTIFICATION_ID) {
          return;
        }
        if (event.notification.id !== REMINDER_NOTIFICATION_ID) return;
        const tappedAt = Date.now();
        const notifiedUserId = event.notification.extra?.userId;
        const userId =
          typeof notifiedUserId === "string"
            ? notifiedUserId
            : accountUserIdRef.current;
        if (userId) {
          const preference = pauseReminderAfterTap(userId, tappedAt);
          if (userId === accountUserIdRef.current && preference.enabled) {
            reminderRef.current.pauseAfterTap(tappedAt);
          }
        }
        if (
          trackingStateRef.current === "tracking" ||
          trackingStateRef.current === "requesting"
        )
          return;
        setReminderPrompt(null);
      },
    )
      .then((handle) => {
        if (disposed) void handle.remove();
        else listener = handle;
      })
      .catch(() => undefined);
    return () => {
      disposed = true;
      if (listener) void listener.remove();
    };
  }, [nativeApp]);

  useEffect(() => {
    let active = true;
    let retryTimer: number | null = null;
    let finishFrame: number | null = null;
    setPoints([]);
    setCells([]);
    setAuthoritativeSnapshot(null);
    setDiscoveredCities([]);
    setCitiesLoadedUserId(null);
    setCitiesExpanded(false);
    setCityBackfillLoading(false);
    setCoverageInfoOpen(false);
    setExplorationSummary(null);
    initialMapFocusUserRef.current = null;
    setDiscoveryLoading(Boolean(accountUserId));
    lastPointRef.current = undefined;
    cellsRef.current = [];
    cellKeysRef.current = new Set();
    discoveryHistoryReadyRef.current = false;
    pointsRef.current = [];
    pendingWalksRef.current = accountUserId
      ? loadWalkJournal(accountUserId)
      : [];
    deferredLocationUiRef.current = false;
    if (!accountUserId) return;

    // An interrupted active recording is a completed route up to its last
    // accepted sample. Keep it locally until the database accepts it.
    saveWalkJournal(accountUserId, pendingWalksRef.current);
    const recoveredPoints = pendingWalksRef.current.flatMap(
      (walk) => walk.points,
    );
    pointsRef.current = mergeRoutePoints(recoveredPoints);
    cellsRef.current = discoveryCellsFromPoints(recoveredPoints);
    cellKeysRef.current = new Set(cellsRef.current.map(discoveryCellKey));
    setPoints(pointsRef.current);
    setCells(cellsRef.current);

    const loadRemote = () =>
      void loadSyncedDiscovery(accountUserId)
        .then((remote) => {
          if (!active || accountUserIdRef.current !== accountUserId) return;
          const persistedWalkIds = new Set(
            remote.points.flatMap((point) =>
              point.walkId ? [point.walkId] : [],
            ),
          );
          if (persistedWalkIds.size) {
            pendingWalksRef.current = pendingWalksRef.current.filter(
              (walk) => !persistedWalkIds.has(walk.id),
            );
            saveWalkJournal(
              accountUserId,
              pendingWalksRef.current,
              activeWalkRef.current && !activeWalkRef.current.isTest
                ? {
                    ...activeWalkRef.current,
                    finishedAt: Math.max(
                      activeWalkRef.current.startedAt,
                      activeWalkRef.current.points.at(-1)?.recordedAt ??
                        activeWalkRef.current.startedAt,
                    ),
                  }
                : null,
            );
          }
          const mergedPoints = mergeRoutePoints(
            pointsRef.current,
            remote.points,
          );
          const mergedCells = mergeDiscoveryCells(
            cellsRef.current,
            remote.cells,
          );
          pointsRef.current = mergedPoints;
          cellsRef.current = mergedCells;
          setPoints(mergedPoints);
          setCells(mergedCells);
          cellKeysRef.current = new Set(mergedCells.map(discoveryCellKey));
          discoveryHistoryReadyRef.current = true;
          if (!activeWalkRef.current)
            lastPointRef.current = mergedPoints.at(-1);
          void flushPendingWalks(accountUserId);
          void refreshAuthoritativeSnapshot(accountUserId).catch((error) => {
            console.warn("Could not refresh account totals", error);
          });
          finishFrame = window.requestAnimationFrame(() => {
            finishFrame = window.requestAnimationFrame(() => {
              if (active && accountUserIdRef.current === accountUserId)
                setDiscoveryLoading(false);
            });
          });
        })
        .catch((error) => {
          if (!active) return;
          console.warn("Could not load discovery history; retrying", error);
          retryTimer = window.setTimeout(loadRemote, 15_000);
        });
    loadRemote();
    return () => {
      active = false;
      if (retryTimer !== null) window.clearTimeout(retryTimer);
      if (finishFrame !== null) window.cancelAnimationFrame(finishFrame);
    };
  }, [accountUserId, refreshAuthoritativeSnapshot]);

  const flushPendingWalks = async (userId: string) => {
    if (walkUploadPromiseRef.current) await walkUploadPromiseRef.current;
    if (accountUserIdRef.current !== userId || !pendingWalksRef.current.length)
      return;
    const upload = (async () => {
      for (const walk of [...pendingWalksRef.current]) {
        if (accountUserIdRef.current !== userId) break;
        try {
          await saveCompletedWalk(walk, userId);
        } catch {
          break;
        }
        if (accountUserIdRef.current !== userId) break;
        pendingWalksRef.current = pendingWalksRef.current.filter(
          (item) => item.id !== walk.id,
        );
        saveWalkJournal(
          userId,
          pendingWalksRef.current,
          activeWalkRef.current && !activeWalkRef.current.isTest
            ? {
                ...activeWalkRef.current,
                finishedAt: Math.max(
                  activeWalkRef.current.startedAt,
                  activeWalkRef.current.points.at(-1)?.recordedAt ??
                    activeWalkRef.current.startedAt,
                ),
              }
            : null,
        );
      }
    })();
    walkUploadPromiseRef.current = upload;
    try {
      await upload;
    } finally {
      if (walkUploadPromiseRef.current === upload)
        walkUploadPromiseRef.current = null;
    }
  };

  const refreshLiveLeaderboard = async (userId: string) => {
    if (!isAutomaticUpdatesEnabled()) {
      setAutomaticUpdatePending(userId, false);
      return true;
    }
    try {
      await refreshPublishedLeaderboardSnapshot(userId);
      setAutomaticUpdatePending(userId, false);
      return true;
    } catch (error) {
      // Discovery syncing is the source of truth. A later completed session or
      // online retry can safely rebuild the public aggregate snapshot.
      console.warn("Could not refresh live leaderboard data", error);
      return false;
    }
  };

  useEffect(() => {
    if (!accountUserId) return;
    let retrying = false;
    let attemptedInitialRefresh = false;
    let retryTimer: number | null = null;
    const scheduleRetry = () => {
      if (retryTimer !== null) window.clearTimeout(retryTimer);
      retryTimer = window.setTimeout(retry, 15_000);
    };
    const retry = () => {
      if (document.visibilityState !== "visible" || !navigator.onLine) return;
      // Reconcile the recovery journal with persisted walk IDs before any
      // upload can overwrite an already-complete server route.
      if (!discoveryHistoryReadyRef.current) {
        scheduleRetry();
        return;
      }
      if (!isAutomaticUpdatesEnabled()) {
        setAutomaticUpdatePending(accountUserId, false);
        return;
      }
      const pending = isAutomaticUpdatePending(accountUserId);
      if (!pending && attemptedInitialRefresh) return;
      if (retrying) return;
      attemptedInitialRefresh = true;
      retrying = true;
      if (!pending) setAutomaticUpdatePending(accountUserId, true);
      void (async () => {
        await flushPendingWalks(accountUserId);
        if (pendingWalksRef.current.length) return;
        if (cellsRef.current.length && !activeWalkRef.current?.isTest) {
          await syncDiscoveryCells(cellsRef.current, accountUserId);
        }
        await refreshLiveLeaderboard(accountUserId);
      })()
        .catch(() => undefined)
        .finally(() => {
          retrying = false;
          if (isAutomaticUpdatePending(accountUserId)) scheduleRetry();
        });
    };
    retry();
    window.addEventListener("online", retry);
    window.addEventListener(AUTOMATIC_UPDATE_PENDING_EVENT, retry);
    document.addEventListener("visibilitychange", retry);
    return () => {
      if (retryTimer !== null) window.clearTimeout(retryTimer);
      window.removeEventListener("online", retry);
      window.removeEventListener(AUTOMATIC_UPDATE_PENDING_EVENT, retry);
      document.removeEventListener("visibilitychange", retry);
    };
  }, [accountUserId]);

  useEffect(() => {
    if (!accountUserId || citiesLoadedUserId === accountUserId) return;
    let active = true;
    let retryTimer: number | null = null;
    const load = () =>
      void loadDiscoveredCities(accountUserId)
        .then(async (cities) => {
          if (!active) return;
          const canonicalCities = new Map<string, CityBoundary>();
          const obsoleteIds = new Map<string, string[]>();
          for (const oldCity of cities) {
            if (!active) return;
            const city = await canonicalCityForStoredBoundary(oldCity);
            const existing = canonicalCities.get(city.id);
            canonicalCities.set(
              city.id,
              existing
                ? {
                    ...city,
                    firstDiscoveredAt: Math.min(
                      existing.firstDiscoveredAt ?? Infinity,
                      city.firstDiscoveredAt ?? Infinity,
                    ),
                    lastDiscoveredAt: Math.max(
                      existing.lastDiscoveredAt ?? 0,
                      city.lastDiscoveredAt ?? 0,
                    ),
                  }
                : city,
            );
            if (city.id !== oldCity.id) {
              obsoleteIds.set(city.id, [
                ...(obsoleteIds.get(city.id) ?? []),
                oldCity.id,
              ]);
            }
          }
          for (const [cityId, ids] of obsoleteIds) {
            if (!active) return;
            try {
              await replaceDiscoveredCities(
                ids,
                canonicalCities.get(cityId)!,
                accountUserId,
              );
            } catch (error) {
              console.warn("Could not update stored cities", error);
            }
          }
          if (!active) return;
          setDiscoveredCities((current) => {
            const merged = new Map(current.map((city) => [city.id, city]));
            canonicalCities.forEach((city) => merged.set(city.id, city));
            return [...merged.values()];
          });
          setCitiesLoadedUserId(accountUserId);
        })
        .catch((error) => {
          if (!active) return;
          console.warn("Could not load discovered cities; retrying", error);
          retryTimer = window.setTimeout(load, 15_000);
        });
    load();
    return () => {
      active = false;
      if (retryTimer !== null) window.clearTimeout(retryTimer);
    };
  }, [accountUserId, citiesLoadedUserId]);

  useEffect(() => {
    if (
      !accountUserId ||
      cells.length === 0 ||
      testRouteRunning ||
      activeWalkRef.current?.isTest
    )
      return;
    const timer = window.setTimeout(
      () => syncDiscoveryCells(cells, accountUserId).catch(() => undefined),
      1200,
    );
    return () => window.clearTimeout(timer);
  }, [accountUserId, cells, testRouteRunning]);

  useEffect(() => {
    if (!trackingUserRef.current || trackingUserRef.current === accountUserId)
      return;
    const tracker = trackerRef.current;
    trackerRef.current = null;
    void Promise.resolve(tracker?.stop()).catch(() => undefined);
    activeWalkRef.current = null;
    trackingUserRef.current = null;
    pendingWalksRef.current = [];
    resetInactivityReminder();
    setTracking("idle");
    setPassiveLocationStatus("idle");
  }, [accountUserId, resetInactivityReminder]);

  useEffect(
    () => () => {
      void trackerRef.current?.stop();
      updateInactivitySchedule(null);
    },
    [updateInactivitySchedule],
  );

  useEffect(() => {
    const flushBackgroundLocations = () => {
      if (document.visibilityState !== "visible") return;
      if (deferredLocationUiRef.current) {
        deferredLocationUiRef.current = false;
        setPoints([...pointsRef.current]);
        setCells([...cellsRef.current]);
        if (lastPointRef.current) setCurrentPoint(lastPointRef.current);
      }
    };
    document.addEventListener("visibilitychange", flushBackgroundLocations);
    return () =>
      document.removeEventListener(
        "visibilitychange",
        flushBackgroundLocations,
      );
  }, []);

  useEffect(() => {
    if (tracking === "requesting" || tracking === "tracking") return;
    const backgroundReminder =
      nativeApp &&
      reminderEnabled &&
      Boolean(accountUserId) &&
      notificationPermissionReady === true;
    let disposed = false;
    let nativeActive = true;
    let trackerMode: "foreground" | "reminder" | null = null;
    let retryTimer: number | null = null;
    let acquisitionTimer: number | null = null;
    const clearTimers = () => {
      if (retryTimer !== null) window.clearTimeout(retryTimer);
      if (acquisitionTimer !== null) window.clearTimeout(acquisitionTimer);
      retryTimer = null;
      acquisitionTimer = null;
    };
    const stop = () => {
      clearTimers();
      const tracker = foregroundTrackerRef.current;
      foregroundTrackerRef.current = null;
      trackerMode = null;
      if (tracker) void Promise.resolve(tracker.stop()).catch(() => undefined);
    };
    const desiredMode = () =>
      passiveLocationMode(
        nativeActive && document.visibilityState === "visible",
        backgroundReminder,
      );
    const start = (mode: "foreground" | "reminder") => {
      if (disposed || desiredMode() !== mode) return;
      if (foregroundTrackerRef.current && trackerMode === mode) return;
      stop();
      const tracker =
        mode === "foreground"
          ? createForegroundLocationTracker()
          : createReminderLocationTracker();
      foregroundTrackerRef.current = tracker;
      trackerMode = mode;
      if (mode === "foreground") setPassiveLocationStatus("requesting");
      let receivedPoint = false;
      void tracker
        .start(
          (point) => {
            if (disposed || foregroundTrackerRef.current !== tracker) return;
            if (!Number.isFinite(point.lng) || !Number.isFinite(point.lat))
              return;
            if (
              mode === "foreground" &&
              Date.now() - point.recordedAt > PASSIVE_LOCATION_MAX_AGE_MS
            )
              return;
            receivedPoint = true;
            if (acquisitionTimer !== null)
              window.clearTimeout(acquisitionTimer);
            acquisitionTimer = null;
            latestPassivePointRef.current = point;
            const visible =
              nativeActive && document.visibilityState === "visible";
            if (visible) {
              setCurrentPoint(point);
              setPassiveLocationStatus("located");
              setTracking((current) =>
                current === "denied" || current === "unavailable"
                  ? "idle"
                  : current,
              );
            }
            if (!reminderEnabled || !accountUserId) return;
            if (!discoveryHistoryReadyRef.current) {
              reminderRef.current.reset();
              if (devToolsEnabled && visible)
                setReminderDebug({
                  elapsedMs: 0,
                  distanceM: 0,
                  status: "Waiting for discovery history",
                });
              return;
            }
            const unmapped = isUnmappedArea(point, cellKeysRef.current);
            const kind = reminderRef.current.observe(point, unmapped);
            if (devToolsEnabled && visible) {
              const progress = reminderRef.current.progress;
              const pauseMinutes = Math.ceil(
                (reminderRef.current.pausedUntil - point.recordedAt) / 60_000,
              );
              const cooldownMinutes = reminderRef.current.promptedAt
                ? Math.ceil(
                    (REMINDER_COOLDOWN_MS -
                      (point.recordedAt - reminderRef.current.promptedAt)) /
                      60_000,
                  )
                : 0;
              setReminderDebug({
                elapsedMs: progress.elapsedMs,
                distanceM: progress.distanceM,
                status: kind
                  ? "Reminder triggered"
                  : pauseMinutes > 0
                    ? `Paused after tap: ${pauseMinutes} min left`
                    : cooldownMinutes > 0
                      ? `Cooldown: ${cooldownMinutes} min left`
                      : unmapped
                        ? "New area"
                        : "Already discovered",
              });
            }
            if (!kind) return;
            saveReminderPreference(
              accountUserId,
              true,
              reminderRef.current.promptedAt,
              reminderRef.current.pausedUntil,
            );
            if (nativeApp)
              void sendReminderNotification(accountUserId).catch((error) =>
                console.warn("Could not show discovery reminder", error),
              );
            else if (visible) setReminderPrompt(kind);
          },
          (error) => {
            if (disposed || foregroundTrackerRef.current !== tracker) return;
            stop();
            setPassiveLocationStatus(
              error.code === "permission-denied" ? "denied" : "unavailable",
            );
            if (error.code !== "permission-denied") {
              retryTimer = window.setTimeout(
                () => start(mode),
                PASSIVE_LOCATION_RETRY_MS,
              );
            }
          },
        )
        .then(() => {
          if (
            disposed ||
            mode !== "foreground" ||
            receivedPoint ||
            foregroundTrackerRef.current !== tracker
          )
            return;
          acquisitionTimer = window.setTimeout(() => {
            if (disposed || foregroundTrackerRef.current !== tracker) return;
            stop();
            setPassiveLocationStatus("unavailable");
            retryTimer = window.setTimeout(
              () => start("foreground"),
              PASSIVE_LOCATION_RETRY_MS,
            );
          }, PASSIVE_LOCATION_ACQUISITION_TIMEOUT_MS);
        })
        .catch(() => {
          if (disposed || foregroundTrackerRef.current !== tracker) return;
          stop();
          setPassiveLocationStatus("unavailable");
          retryTimer = window.setTimeout(
            () => start(mode),
            PASSIVE_LOCATION_RETRY_MS,
          );
        });
    };
    const updateVisibility = () => {
      const mode = desiredMode();
      if (mode === "foreground") {
        if (
          latestPassivePointRef.current &&
          Date.now() - latestPassivePointRef.current.recordedAt <
            PASSIVE_LOCATION_MAX_AGE_MS
        ) {
          setCurrentPoint(latestPassivePointRef.current);
          setPassiveLocationStatus("located");
        }
        start("foreground");
      } else if (mode === "reminder") {
        start("reminder");
      } else {
        stop();
        setPassiveLocationStatus("idle");
      }
    };
    document.addEventListener("visibilitychange", updateVisibility);
    let appStateListener: { remove: () => Promise<void> } | undefined;
    if (nativeApp) {
      void CapacitorApp.addListener("appStateChange", (state) => {
        nativeActive = state.isActive;
        updateVisibility();
      })
        .then((listener) => {
          if (disposed) void listener.remove();
          else appStateListener = listener;
        })
        .catch(() => undefined);
    }
    updateVisibility();
    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", updateVisibility);
      if (appStateListener) void appStateListener.remove();
      stop();
    };
  }, [
    accountUserId,
    devToolsEnabled,
    nativeApp,
    notificationPermissionReady,
    passiveLocationRefreshGeneration,
    reminderEnabled,
    tracking,
  ]);

  useEffect(() => () => cityLookupAbortRef.current?.abort(), []);

  useEffect(() => {
    if (!currentPoint || activeCity) return;
    const previous = lastCityLookupRef.current;
    const now = Date.now();
    if (
      previous &&
      (now - previous.at < 15_000 ||
        (!cityBoundary &&
          now - previous.at < 300_000 &&
          distanceKm(previous.point, currentPoint) < 1))
    )
      return;
    lastCityLookupRef.current = { point: currentPoint, at: now };
    cityLookupAbortRef.current?.abort();
    const controller = new AbortController();
    cityLookupAbortRef.current = controller;
    fetchCityBoundary(currentPoint, controller.signal)
      .then(setCityBoundary)
      .catch((error) => {
        if (!controller.signal.aborted)
          console.warn("City boundary lookup failed", error);
      });
  }, [activeCity, currentPoint]);

  useEffect(() => {
    if (!isCityScale || !viewCenter) {
      setViewCityLoading(false);
      return;
    }
    if (cachedViewCity) {
      setViewedCity((current) =>
        current?.id === cachedViewCity.id ? current : cachedViewCity,
      );
      setViewCityLoading(false);
      return;
    }
    setViewedCity(null);
    setViewCityLoading(true);
    const controller = new AbortController();
    // A map pan should settle before asking for an uncached city boundary.
    const timer = window.setTimeout(() => {
      void fetchCityBoundary(viewCenter, controller.signal)
        .then((city) => {
          if (!controller.signal.aborted) setViewedCity(city);
        })
        .catch((error) => {
          if (!controller.signal.aborted)
            console.warn("Map city lookup failed", error);
        })
        .finally(() => {
          if (!controller.signal.aborted) setViewCityLoading(false);
        });
    }, 500);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [cachedViewCity, isCityScale, viewCenter]);

  useEffect(() => {
    if (!accountUserId || !cityBoundary) return;
    const hasDiscoveryInCity = cells.some((cell) => {
      const [lng, lat] = discoveryCellCenter(cell);
      return isPointInCity({ lng, lat }, cityBoundary);
    });
    if (!hasDiscoveryInCity) return;
    setDiscoveredCities((current) =>
      current.some((city) => city.id === cityBoundary.id)
        ? current
        : [...current, cityBoundary],
    );
    void syncDiscoveredCity(cityBoundary, accountUserId).catch(() => undefined);
  }, [accountUserId, cells, cityBoundary]);

  useEffect(() => {
    if (
      !journeyContentVisible ||
      !accountUserId ||
      citiesLoadedUserId !== accountUserId ||
      points.length === 0
    )
      return;
    let cancelled = false;
    const knownCityIds = new Set(discoveredCities.map((city) => city.id));
    const candidates: Coordinate[] = [];
    // A handful of widely spaced route samples identifies past cities without
    // issuing one reverse-geocoding request for every location update.
    for (const point of points) {
      if (candidates.every((candidate) => distanceKm(candidate, point) > 25))
        candidates.push(point);
      if (candidates.length === 8) break;
    }
    if (!candidates.length) return;

    void (async () => {
      setCityBackfillLoading(true);
      for (const point of candidates) {
        if (cancelled) break;
        try {
          const city = await fetchCityBoundary(point);
          if (!knownCityIds.has(city.id)) {
            const hasDiscoveryInCity = cells.some((cell) => {
              const [lng, lat] = discoveryCellCenter(cell);
              return isPointInCity({ lng, lat }, city);
            });
            if (hasDiscoveryInCity) {
              knownCityIds.add(city.id);
              setDiscoveredCities((current) =>
                current.some((saved) => saved.id === city.id)
                  ? current
                  : [...current, city],
              );
              await syncDiscoveredCity(city, accountUserId);
            }
          }
        } catch {
          // An individual reverse-geocoding lookup should not prevent the list.
        }
        // Respect Nominatim's public-service rate limit while backfilling.
        await new Promise((resolve) => window.setTimeout(resolve, 1_100));
      }
      if (!cancelled) setCityBackfillLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [accountUserId, cells, citiesLoadedUserId, journeyContentVisible, points]);

  const onZoomChange = useCallback((nextZoom: number) => setZoom(nextZoom), []);
  const onViewChange = useCallback((center: { lng: number; lat: number }) => {
    setViewCenter(center);
  }, []);

  const focusOnUserPoint = (point: Coordinate) => {
    setViewCenter({ lng: point.lng, lat: point.lat });
    mapRef.current?.flyTo({
      center: [point.lng, point.lat],
      zoom: 15,
      duration: 1400,
      essential: true,
    });
  };

  useEffect(() => {
    if (
      !accountUserId ||
      !discoveryHistoryReadyRef.current ||
      initialMapFocusUserRef.current === accountUserId
    )
      return;
    const latestPoint = points.at(-1);
    const latestCell = cells.reduce<DiscoveryCell | undefined>(
      (latest, cell) =>
        !latest || cell.discoveredAt > latest.discoveredAt ? cell : latest,
      undefined,
    );
    const latestDiscovery =
      latestPoint ??
      (latestCell
        ? (() => {
            const [lng, lat] = discoveryCellCenter(latestCell);
            return { lng, lat, recordedAt: latestCell.discoveredAt };
          })()
        : undefined);
    const focus = latestDiscovery ?? currentPoint;
    if (!focus) return;

    initialMapFocusUserRef.current = accountUserId;
    const targetZoom = latestDiscovery ? 14.3 : 15;
    setViewCenter({ lng: focus.lng, lat: focus.lat });
    setZoom(targetZoom);
    setViewedCity(null);
    mapRef.current?.jumpTo({
      center: [focus.lng, focus.lat],
      zoom: targetZoom,
      pitch: 0,
      bearing: 0,
    });
  }, [accountUserId, cells, currentPoint, discoveryLoading, points]);

  const addPoint = (point: Coordinate) => {
    if (!isUsableGpsPoint(point)) {
      if (
        trackingUserRef.current &&
        activeWalkRef.current &&
        !activeWalkRef.current.isTest
      ) {
        updateInactivitySchedule(
          inactivityReminderRef.current.observe(point, false, Date.now()),
        );
      }
      return;
    }
    if (focusFirstTrackingPointRef.current) {
      focusFirstTrackingPointRef.current = false;
      focusOnUserPoint(point);
    }
    const considerStopReminder = () => {
      if (
        !trackingUserRef.current ||
        !activeWalkRef.current ||
        activeWalkRef.current.isTest
      )
        return;
      const dueAt = inactivityReminderRef.current.observe(
        point,
        isDiscoveredArea(point, cellKeysRef.current),
        Date.now(),
      );
      updateInactivitySchedule(dueAt);
    };
    const appVisible = document.visibilityState === "visible";
    if (appVisible) setCurrentPoint(point);
    if (!shouldRecordPoint(lastPointRef.current, point)) {
      considerStopReminder();
      return;
    }
    const recordedPoint = { ...point, walkId: activeWalkRef.current?.id };
    lastPointRef.current = recordedPoint;
    activeWalkRef.current?.points.push(recordedPoint);
    pointsRef.current.push(recordedPoint);
    if (
      trackingUserRef.current &&
      activeWalkRef.current &&
      !activeWalkRef.current.isTest
    ) {
      saveWalkJournal(trackingUserRef.current, pendingWalksRef.current, {
        ...activeWalkRef.current,
        finishedAt: Math.max(
          activeWalkRef.current.startedAt,
          recordedPoint.recordedAt,
        ),
      });
    }
    const nextCell = pointToDiscoveryCell(recordedPoint);
    const key = discoveryCellKey(nextCell);
    let discoveredNewCell = false;
    if (!cellKeysRef.current.has(key)) {
      cellKeysRef.current.add(key);
      cellsRef.current.push(nextCell);
      discoveredNewCell = true;
    }
    // Check after adding this point to the map. A newly revealed spot also
    // qualifies if the recording then stays nearby for fifteen minutes.
    considerStopReminder();

    if (appVisible) {
      setPoints([...pointsRef.current]);
      if (discoveredNewCell) setCells([...cellsRef.current]);
      mapRef.current?.easeTo({
        center: [recordedPoint.lng, recordedPoint.lat],
        duration: 850,
        essential: true,
      });
    } else {
      // Native callbacks still record and persist the route in the background,
      // but React and MapLibre do not need to redraw for every GPS update.
      deferredLocationUiRef.current = true;
      const walkOwner = trackingUserRef.current;
      if (
        walkOwner &&
        nativeApp &&
        !activeWalkRef.current?.isTest &&
        !testRouteRunningRef.current &&
        discoveryHistoryReadyRef.current &&
        citiesLoadedUserIdRef.current === walkOwner &&
        recordedPoint.recordedAt - lastBackgroundAchievementCheckRef.current >=
          10_000
      ) {
        lastBackgroundAchievementCheckRef.current = recordedPoint.recordedAt;
        const unlocks = reconcileDiscoveryAchievementUnlocks(
          walkOwner,
          pointsRef.current,
          achievementCitiesRef.current,
        );
        unlocks.newlyEarned.forEach((achievementId) => {
          void sendAchievementNotification(achievementId, walkOwner).catch(
            (error) =>
              console.warn("Could not show achievement notification", error),
          );
        });
      }
    }
  };

  const finishActiveWalk = async () => {
    resetInactivityReminder();
    if (
      document.visibilityState === "visible" &&
      deferredLocationUiRef.current
    ) {
      deferredLocationUiRef.current = false;
      setPoints([...pointsRef.current]);
      setCells([...cellsRef.current]);
      if (lastPointRef.current) setCurrentPoint(lastPointRef.current);
    }
    const active = activeWalkRef.current;
    const walkOwner = trackingUserRef.current;
    activeWalkRef.current = null;
    trackingUserRef.current = null;
    if (active && walkOwner && active.points.length >= 2) {
      const started = explorationStartRef.current;
      const completed: PendingWalk = {
        ...active,
        finishedAt: Math.max(
          active.startedAt,
          active.points.at(-1)?.recordedAt ?? Date.now(),
        ),
      };
      if (!active.isTest) {
        if (isAutomaticUpdatesEnabled()) {
          setAutomaticUpdatePending(walkOwner, true);
        }
        pendingWalksRef.current.push(completed);
        saveWalkJournal(walkOwner, pendingWalksRef.current);
        await flushPendingWalks(walkOwner);
        // The recap and the next app launch must be based on the same completed
        // discovery. Do not rely only on the debounced background cell sync.
        let discoverySynced = false;
        try {
          await syncDiscoveryCells(cellsRef.current, walkOwner);
          discoverySynced = true;
        } catch {
          /* The existing debounced sync retries if this request fails. */
        }
        const completedWalkSynced = !pendingWalksRef.current.some(
          walk => walk.id === completed.id,
        );
        if (completedWalkSynced && discoverySynced) {
          await refreshAuthoritativeSnapshot(walkOwner).catch((error) =>
            console.warn("Could not refresh authoritative discovery totals", error),
          );
          await refreshLiveLeaderboard(walkOwner);
        }
      }
      if (started) {
        const completedCells = cellsRef.current;
        const newCells = completedCells.filter(
          (cell) => !started.cells.has(`${cell.z}/${cell.x}/${cell.y}`),
        );
        const previousCells = completedCells.filter((cell) =>
          started.cells.has(`${cell.z}/${cell.x}/${cell.y}`),
        );
        const newGroundKm = Math.max(
          0,
          discoveredDistanceKm(pointsRef.current) - started.discoveryDistance,
        );
        const summary: ExplorationSummary = {
          walkId: active.id,
          points: active.points,
          cells: newCells,
          startedAt: active.startedAt,
          finishedAt: completed.finishedAt,
          newGroundKm,
          travelledKm: routeDistanceKm(active.points),
        };
        setExplorationSummary(
          shouldShowExplorationRecap(newGroundKm) ? summary : null,
        );

        // React state can still describe the city where tracking began. Look
        // up the final recorded position instead, then compare its coverage
        // before and after this session. This also works for test routes that
        // finish in a different city.
        const finalPoint = active.points.at(-1);
        if (finalPoint) {
          void fetchCityBoundary(finalPoint)
            .then((city) => {
              const percentageAdded = Math.max(
                0,
                discoveredCityPercentage(completedCells, city) -
                  discoveredCityPercentage(previousCells, city),
              );
              if (!active.isTest) {
                setCityBoundary(city);
                setDiscoveredCities((current) =>
                  current.some((saved) => saved.id === city.id)
                    ? current
                    : [...current, city],
                );
                void syncDiscoveredCity(city, walkOwner).catch(() => undefined);
              }
              setExplorationSummary((current) =>
                current?.walkId === active.id
                  ? {
                      ...current,
                      cityName: city.name,
                      cityPercentageAdded: percentageAdded,
                    }
                  : current,
              );
            })
            .catch(() => {
              // A recap without a city is preferable to labelling it with a
              // stale one when reverse geocoding is temporarily unavailable.
            });
        }

        if (active.isTest) {
          // GPX routes are a visual test tool only. Restore the account's real
          // history before the recap is dismissed, so no test path can sync.
          pointsRef.current = started.points;
          cellsRef.current = previousCells;
          cellKeysRef.current = new Set(previousCells.map(discoveryCellKey));
          lastPointRef.current = started.points.at(-1);
          setPoints(started.points);
          setCells(previousCells);
        }
      }
    } else if (active && walkOwner && !active.isTest) {
      saveWalkJournal(walkOwner, pendingWalksRef.current);
    }
    explorationStartRef.current = null;
  };

  const runTestRoute = async (routeFile: string) => {
    if (!accountUserId) {
      setSyncOpen(true);
      return;
    }
    if (tracking !== "idle" || testRouteRunning) return;
    setTestRouteRunning(true);
    resetInactivityReminder();
    setExplorationSummary(null);
    setPassiveLocationStatus("idle");
    try {
      const response = await fetch(`/test-routes/${routeFile}`);
      if (!response.ok) throw new Error("Unable to load test route");
      const document = new DOMParser().parseFromString(
        await response.text(),
        "application/xml",
      );
      const route = [...document.querySelectorAll("trkpt")].flatMap(
        (point, index): Coordinate[] => {
          const lat = Number(point.getAttribute("lat"));
          const lng = Number(point.getAttribute("lon"));
          return Number.isFinite(lat) && Number.isFinite(lng)
            ? [
                {
                  lat,
                  lng,
                  accuracy: 5,
                  recordedAt: Date.now() + index * 20_000,
                },
              ]
            : [];
        },
      );
      if (route.length < 2)
        throw new Error("Test route needs at least two points");

      lastPointRef.current = undefined;
      const startingPoints = pointsRef.current;
      pointsRef.current = [...startingPoints];
      cellsRef.current = [...cellsRef.current];
      explorationStartRef.current = {
        cells: new Set(cellKeysRef.current),
        points: startingPoints,
        discoveryDistance: discoveredDistanceKm(startingPoints),
      };
      activeWalkRef.current = {
        id: createWalkId(),
        startedAt: route[0].recordedAt,
        points: [],
        isTest: true,
      };
      trackingUserRef.current = accountUserId;
      setTracking("tracking");
      for (const point of route) {
        addPoint(point);
        await new Promise((resolve) => window.setTimeout(resolve, 350));
      }
      await finishActiveWalk();
      setTracking("idle");
      setPassiveLocationStatus("idle");
    } catch (error) {
      console.error("Test route failed", error);
      activeWalkRef.current = null;
      trackingUserRef.current = null;
      explorationStartRef.current = null;
      setTracking("idle");
      setPassiveLocationStatus("idle");
    } finally {
      setTestRouteRunning(false);
    }
  };

  const updateReminderEnabled = async (
    enabled: boolean,
  ): Promise<string | null> => {
    if (!accountUserId) return "Sign in before enabling discovery reminders.";
    if (enabled && nativeApp) {
      try {
        const notificationAllowed = await ensureNotificationPermission();
        setNotificationPermissionReady(notificationAllowed);
        if (!notificationAllowed)
          return "Allow notifications in iPhone Settings to enable discovery reminders.";
      } catch {
        return "Notifications are unavailable right now. Try again later.";
      }
    }
    setReminderEnabled(enabled);
    reminderRef.current.reset();
    setReminderPrompt(null);
    saveReminderPreference(
      accountUserId,
      enabled,
      reminderRef.current.promptedAt,
      reminderRef.current.pausedUntil,
    );
    return null;
  };

  const simulateReminder = async () => {
    if (!accountUserId || !reminderEnabled) {
      setReminderTestMessage(
        "Sign in and enable Discovery reminders in Account & sync first.",
      );
      return;
    }
    if (!discoveryHistoryReadyRef.current) {
      setReminderTestMessage(
        "Wait for your discovery history to finish loading.",
      );
      return;
    }
    if (!simulateUnmappedWalk(cellKeysRef.current)) {
      setReminderTestMessage("Could not find an unmapped test route.");
      return;
    }
    if (nativeApp) {
      try {
        const permission = await LocalNotifications.checkPermissions();
        if (permission.display !== "granted") {
          setReminderTestMessage(
            "Allow notifications in iPhone Settings, then try again.",
          );
          return;
        }
        await sendReminderNotification(accountUserId, 5_000, true);
        setReminderTestMessage(
          "A local notification is scheduled in 5 seconds. Lock your phone to check background delivery.",
        );
      } catch {
        setReminderTestMessage("Could not schedule the local notification.");
      }
    } else {
      setReminderPrompt("unmapped");
      setReminderTestMessage(
        "The simulated route qualified. Browsers show the in-app reminder only.",
      );
    }
  };

  const simulateInactivityNotification = async () => {
    if (tracking !== "tracking") return;
    if (!nativeApp) {
      setInactivityPrompt(true);
      return;
    }
    try {
      if (!(await ensureNotificationPermission())) {
        setReminderTestMessage(
          "Allow notifications in iPhone Settings, then try the stop reminder test again.",
        );
        return;
      }
      await LocalNotifications.schedule({
        notifications: [
          {
            id: INACTIVITY_TEST_NOTIFICATION_ID,
            title: "Still recording your discovery?",
            body: "This is a test stop reminder. Your recording will keep running.",
            schedule: { at: new Date(Date.now() + 5_000) },
          },
        ],
      });
      setReminderTestMessage(
        "A test stop reminder will appear in 5 seconds. Lock your phone to check it.",
      );
    } catch {
      setReminderTestMessage("Could not schedule the test stop reminder.");
    }
  };

  const simulateAchievementUnlock = async () => {
    const achievement =
      PERSONAL_ACHIEVEMENTS[
        achievementTestIndexRef.current % PERSONAL_ACHIEVEMENTS.length
      ];
    achievementTestIndexRef.current += 1;
    setAchievementTestPreview(achievement.id);
    if (!nativeApp) {
      setAchievementTestMessage(
        `Showing ${achievement.title}. Native notifications are only available in the iPhone app.`,
      );
      return;
    }
    try {
      const scheduled = await sendAchievementNotification(
        achievement.id,
        accountUserId ?? "development-preview",
        true,
      );
      setAchievementTestMessage(
        scheduled
          ? `${achievement.title} notification scheduled. The next test uses another badge.`
          : "Celebration shown. Allow notifications in iPhone Settings to test the notification too.",
      );
    } catch {
      setAchievementTestMessage(
        "Celebration shown, but the test notification could not be scheduled.",
      );
    }
  };

  const toggleTracking = async () => {
    void requestDeviceHeadingPermission();
    if (tracking === "tracking") {
      resetInactivityReminder();
      const tracker = trackerRef.current;
      trackerRef.current = null;
      reminderRef.current.reset();
      setTracking("idle");
      setPassiveLocationStatus("idle");
      void Promise.resolve(tracker?.stop()).catch(() => undefined);
      void finishActiveWalk();
      return;
    }
    if (!accountUserId) {
      setSyncOpen(true);
      return;
    }
    if (discoveryLoading) return;
    reminderRef.current.reset();
    resetInactivityReminder();
    setReminderPrompt(null);
    setTracking("requesting");
    const recentPoint = latestPassivePointRef.current ?? currentPoint;
    if (recentPoint && isUsableGpsPoint(recentPoint)) {
      focusOnUserPoint(recentPoint);
      focusFirstTrackingPointRef.current = false;
    } else {
      focusFirstTrackingPointRef.current = true;
    }
    setPassiveLocationStatus("idle");
    lastBackgroundAchievementCheckRef.current = 0;
    const foregroundTracker = foregroundTrackerRef.current;
    foregroundTrackerRef.current = null;
    void Promise.resolve(foregroundTracker?.stop()).catch(() => undefined);
    const walkId = createWalkId();
    lastPointRef.current = undefined;
    const startingPoints = pointsRef.current;
    pointsRef.current = [...startingPoints];
    cellsRef.current = [...cellsRef.current];
    explorationStartRef.current = {
      cells: new Set(cellKeysRef.current),
      points: startingPoints,
      discoveryDistance,
    };
    activeWalkRef.current = { id: walkId, startedAt: Date.now(), points: [] };
    trackingUserRef.current = accountUserId;
    saveWalkJournal(accountUserId, pendingWalksRef.current, {
      ...activeWalkRef.current,
      finishedAt: activeWalkRef.current.startedAt,
    });
    const tracker = createLocationTracker();
    trackerRef.current = tracker;
    // The journey exists locally before the native watcher finishes starting,
    // so reflect the active session immediately and roll back on failure.
    setTracking("tracking");
    let trackerFailed = false;
    try {
      await tracker.start(addPoint, (error) => {
        trackerFailed = true;
        focusFirstTrackingPointRef.current = false;
        resetInactivityReminder();
        void Promise.resolve(tracker.stop()).catch(() => undefined);
        trackerRef.current = null;
        void finishActiveWalk();
        setPassiveLocationStatus(
          error.code === "permission-denied" ? "denied" : "idle",
        );
        setTracking(
          error.code === "permission-denied" ? "denied" : "unavailable",
        );
      });
      if (trackerFailed) return;
    } catch {
      focusFirstTrackingPointRef.current = false;
      resetInactivityReminder();
      trackerRef.current = null;
      void Promise.resolve(tracker.stop()).catch(() => undefined);
      activeWalkRef.current = null;
      trackingUserRef.current = null;
      saveWalkJournal(accountUserId, pendingWalksRef.current);
      setPassiveLocationStatus("idle");
      setTracking("unavailable");
    }
  };

  const locate = () => {
    void requestDeviceHeadingPermission();
    if (currentPoint) {
      setViewCenter({ lng: currentPoint.lng, lat: currentPoint.lat });
      setViewedCity(null);
      mapRef.current?.flyTo({
        center: [currentPoint.lng, currentPoint.lat],
        zoom: 15,
        duration: 1400,
        essential: true,
      });
    }
    if (!currentPoint || passiveLocationStatus !== "located") {
      setPassiveLocationStatus("requesting");
      setPassiveLocationRefreshGeneration((generation) => generation + 1);
    }
  };

  const journeyBounds = (card: HTMLElement) => {
    const collapsed =
      Number.parseFloat(window.getComputedStyle(card).minHeight) || 88;
    const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
    return { collapsed, expanded: viewportHeight * 0.7 };
  };

  const journeyVisibleHeight = (card: HTMLElement) => {
    const { collapsed, expanded } = journeyBounds(card);
    const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
    return Math.max(
      collapsed,
      Math.min(expanded, viewportHeight - card.getBoundingClientRect().top),
    );
  };

  const setJourneyVisibleHeight = (
    card: HTMLElement,
    height: number,
    expandedHeight?: number,
  ) => {
    const expanded = expandedHeight ?? journeyBounds(card).expanded;
    card.style.transform = `translate3d(0, ${journeySheetOffsetPx(expanded, height)}px, 0)`;
  };

  const settleJourneySheet = (
    expanded: boolean,
    fromHeight?: number,
    durationMs = JOURNEY_SETTLE_DURATION_MS,
  ) => {
    const card = journeyCardRef.current;
    if (!card) return;
    const { collapsed, expanded: expandedHeight } = journeyBounds(card);
    const targetHeight = expanded ? expandedHeight : collapsed;
    const startHeight = fromHeight ?? journeyVisibleHeight(card);
    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    if (journeySettleFrameRef.current !== null) {
      cancelAnimationFrame(journeySettleFrameRef.current);
      journeySettleFrameRef.current = null;
    }
    journeyAnimationRef.current?.cancel();
    journeyAnimationRef.current = null;
    const offsetForHeight = (height: number) =>
      `translate3d(0, ${journeySheetOffsetPx(expandedHeight, height)}px, 0)`;
    const startTransform = offsetForHeight(startHeight);
    const targetTransform = offsetForHeight(targetHeight);
    const setVisualExpanded = (nextExpanded: boolean) => {
      journeyExpandedRef.current = nextExpanded;
      card.dataset.expanded = String(nextExpanded);
    };
    card.style.transform = startTransform;

    if (reducedMotion) {
      setVisualExpanded(expanded);
      setCitiesExpanded(expanded);
      setJourneyContentVisible(expanded);
      card.style.transform = targetTransform;
      return;
    }

    // Change visual state without a React render. This keeps the MapLibre tree
    // and drawer lists out of the animation's critical path, and removes the
    // content divider immediately when closing begins.
    setVisualExpanded(expanded);

    journeySettleFrameRef.current = requestAnimationFrame(() => {
      journeySettleFrameRef.current = null;
      if (journeyCardRef.current !== card) return;
      card.style.transform = targetTransform;
      const animation = card.animate(
        [
          { transform: startTransform },
          { transform: targetTransform },
        ],
        {
          duration: durationMs,
          easing: "cubic-bezier(0.32, 0.72, 0, 1)",
          fill: "both",
        },
      );
      journeyAnimationRef.current = animation;
      animation.onfinish = () => {
        if (journeyAnimationRef.current !== animation) return;
        journeyAnimationRef.current = null;
        card.style.transform = targetTransform;
        animation.cancel();
        setCitiesExpanded(expanded);
        setJourneyContentVisible(expanded);
      };
      animation.oncancel = () => {
        if (journeyAnimationRef.current === animation) {
          journeyAnimationRef.current = null;
        }
      };
    });
  };

  const beginJourneyDrag = (event: React.PointerEvent<HTMLElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
    if (
      nativeApp &&
      event.pointerType !== "mouse" &&
      isInSystemGestureZone(viewportHeight, event.clientY)
    )
      return;
    const target = event.target as HTMLElement;
    const card = journeyCardRef.current;
    if (!card) return;
    const header = card.querySelector(
      ".journey-card__header",
    ) as HTMLElement | null;
    const headerRect = header?.getBoundingClientRect();
    const pointerOffsetFromHeaderTop =
      headerRect && event.clientY >= headerRect.top
        ? event.clientY - headerRect.top
        : 0;
    if (
      headerRect &&
      Boolean(target.closest(".journey-card__header")) &&
      !shouldAllowHeaderGesture(headerRect.height, pointerOffsetFromHeaderTop)
    ) {
      return;
    }
    if (
      !shouldStartJourneyDrag(
        journeyExpandedRef.current,
        Boolean(target.closest(".journey-card__header")),
        Boolean(target.closest(".discovery-control")),
      )
    )
      return;
    const { collapsed, expanded } = journeyBounds(card);
    const startHeight = journeyVisibleHeight(card);
    setJourneyVisibleHeight(card, startHeight, expanded);
    if (journeySettleFrameRef.current !== null) {
      cancelAnimationFrame(journeySettleFrameRef.current);
      journeySettleFrameRef.current = null;
    }
    journeyAnimationRef.current?.cancel();
    journeyAnimationRef.current = null;
    card.classList.add("journey-card--dragging");
    event.currentTarget.setPointerCapture(event.pointerId);
    journeyDragRef.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      startHeight,
      currentHeight: startHeight,
      collapsedHeight: collapsed,
      expandedHeight: expanded,
      moved: false,
      startedExpanded: journeyExpandedRef.current,
    };
  };

  const moveJourneyDrag = (event: React.PointerEvent<HTMLElement>) => {
    const drag = journeyDragRef.current;
    const card = journeyCardRef.current;
    if (!drag || !card || drag.pointerId !== event.pointerId) return;
    const { collapsedHeight: collapsed, expandedHeight: expanded } = drag;
    const rawHeight = drag.startHeight + drag.startY - event.clientY;
    const height =
      rawHeight < collapsed
        ? collapsed - (collapsed - rawHeight) * 0.22
        : rawHeight > expanded
          ? expanded + (rawHeight - expanded) * 0.22
          : rawHeight;
    drag.currentHeight = height;
    drag.moved ||= Math.abs(event.clientY - drag.startY) > 6;

    if (journeyDragFrameRef.current !== null) return;
    journeyDragFrameRef.current = requestAnimationFrame(() => {
      if (journeyDragRef.current)
        setJourneyVisibleHeight(
          card,
          journeyDragRef.current.currentHeight,
          journeyDragRef.current.expandedHeight,
        );
      journeyDragFrameRef.current = null;
    });
  };

  const endJourneyDrag = (event: React.PointerEvent<HTMLElement>) => {
    const drag = journeyDragRef.current;
    const card = journeyCardRef.current;
    if (!drag || !card || drag.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (journeyDragFrameRef.current !== null) {
      cancelAnimationFrame(journeyDragFrameRef.current);
      journeyDragFrameRef.current = null;
    }
    if (!drag.moved) {
      card.classList.remove("journey-card--dragging");
      journeyDragRef.current = null;
      settleJourneySheet(drag.startedExpanded, drag.currentHeight);
      return;
    }
    event.preventDefault();
    suppressJourneyClickRef.current = true;
    window.setTimeout(() => {
      suppressJourneyClickRef.current = false;
    }, 0);
    const { collapsedHeight: collapsed, expandedHeight } = drag;
    // Pointer-up can arrive before the final pointer-move frame. Apply that
    // last position so a single, deliberate swipe is never ignored.
    const rawEndHeight = drag.startHeight + drag.startY - event.clientY;
    drag.currentHeight =
      rawEndHeight < collapsed
        ? collapsed - (collapsed - rawEndHeight) * 0.22
        : rawEndHeight > expandedHeight
          ? expandedHeight + (rawEndHeight - expandedHeight) * 0.22
          : rawEndHeight;
    const totalDrag = event.clientY - drag.startY;
    const shouldExpand = shouldExpandJourneySheet(
      drag.startedExpanded,
      totalDrag,
    );
    card.classList.remove("journey-card--dragging");
    settleJourneySheet(shouldExpand, drag.currentHeight);
    journeyDragRef.current = null;
  };

  const cancelJourneyDrag = (event: React.PointerEvent<HTMLElement>) => {
    const drag = journeyDragRef.current;
    const card = journeyCardRef.current;
    if (!drag || !card || drag.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (journeyDragFrameRef.current !== null) {
      cancelAnimationFrame(journeyDragFrameRef.current);
      journeyDragFrameRef.current = null;
    }
    card.classList.remove("journey-card--dragging");
    settleJourneySheet(drag.startedExpanded, drag.currentHeight);
    journeyDragRef.current = null;
  };

  const suppressClickAfterJourneyDrag = (
    event: React.MouseEvent<HTMLElement>,
  ) => {
    if (!suppressJourneyClickRef.current) return;
    suppressJourneyClickRef.current = false;
    event.preventDefault();
    event.stopPropagation();
  };

  const focusDiscoveredCity = (city: CityBoundary) => {
    // Close even if an older account has no matching cell geometry to focus.
    settleJourneySheet(false);
    setViewedCity(city);

    const cityCells = cells.filter((cell) => {
      const [lng, lat] = discoveryCellCenter(cell);
      return isPointInCity({ lng, lat }, city);
    });

    const cityCenter = (() => {
      if (cityCells.length) {
        const coordinates = cityCells.map(discoveryCellCenter);
        const longitudes = coordinates.map(([lng]) => lng);
        const latitudes = coordinates.map(([, lat]) => lat);
        return {
          lng: (Math.min(...longitudes) + Math.max(...longitudes)) / 2,
          lat: (Math.min(...latitudes) + Math.max(...latitudes)) / 2,
        };
      }

      const polygons =
        city.geometry.type === "Polygon"
          ? city.geometry.coordinates
          : city.geometry.coordinates;
      let west = Infinity;
      let south = Infinity;
      let east = -Infinity;
      let north = -Infinity;
      for (const polygon of polygons) {
        for (const ring of polygon) {
          for (const point of ring) {
            const [lng, lat] = point as [number, number];
            west = Math.min(west, lng);
            south = Math.min(south, lat);
            east = Math.max(east, lng);
            north = Math.max(north, lat);
          }
        }
      }
      if (
        !Number.isFinite(west) ||
        !Number.isFinite(east) ||
        !Number.isFinite(south) ||
        !Number.isFinite(north)
      ) {
        return { lng: 0, lat: 0 };
      }
      return { lng: (west + east) / 2, lat: (south + north) / 2 };
    })();

    setViewCenter(cityCenter);

    if (!cityCells.length) {
      mapRef.current?.flyTo({
        center: [cityCenter.lng, cityCenter.lat],
        zoom: 14.2,
        duration: 900,
        essential: true,
      });
      return;
    }

    const coordinates = cityCells.map(discoveryCellCenter);
    if (coordinates.length === 1) {
      mapRef.current?.flyTo({
        center: coordinates[0],
        zoom: 14.2,
        duration: 900,
        essential: true,
      });
      return;
    }
    const longitudes = coordinates.map(([lng]) => lng);
    const latitudes = coordinates.map(([, lat]) => lat);
    mapRef.current?.fitBounds(
      [
        [Math.min(...longitudes), Math.min(...latitudes)],
        [Math.max(...longitudes), Math.max(...latitudes)],
      ],
      {
        padding: { top: 110, right: 44, bottom: 150, left: 44 },
        maxZoom: 14.2,
        duration: 900,
        essential: true,
      },
    );
  };

  const toggleMapPerspective = () => {
    const map = mapRef.current;
    if (!map) return;
    const nextPerspective = !perspectiveView;
    setPerspectiveView(nextPerspective);
    map.easeTo({
      pitch: nextPerspective ? 52 : 0,
      bearing: nextPerspective ? -24 : 0,
      duration: 900,
      essential: true,
    });
  };

  const showGlobe = () => {
    setPerspectiveView(false);
    mapRef.current?.flyTo({
      center: [7, 24],
      zoom: 1.35,
      pitch: 0,
      bearing: 0,
      duration: 2200,
    });
  };

  const locationIsCurrent =
    tracking === "tracking" || passiveLocationStatus === "located";
  const locationDisplayStatus: PassiveLocationStatus =
    tracking === "denied" ? "denied" : passiveLocationStatus;
  const locationStatusText =
    locationDisplayStatus === "denied"
      ? nativeApp
        ? "Location access disabled · Open Settings"
        : "Location access disabled · Check browser settings"
      : "Location temporarily unavailable";
  const accountDataLoading =
    !authReady || Boolean(accountUserId && discoveryLoading);
  const showFirstDiscoveryHint = Boolean(
    accountUserId &&
      !discoveryLoading &&
      points.length === 0 &&
      cells.length === 0 &&
      tracking === "idle",
  );

  useEffect(() => {
    if (!authReady) return;
    setFavoritePlacementActive(false);
    setFavoriteDraft(null);
    setFavoriteEditorMode("view");
    if (!accountUserId) {
      setFavoritePlaces([]);
      return;
    }

    let cancelled = false;
    const localPlaces = loadFavoritePlaces(accountUserId);
    setFavoritePlaces(localPlaces);
    const client = supabase;
    if (!client) return;
    void Promise.all([
      client.auth.getUser(),
      loadFavoritePlacesFromDatabase(client, accountUserId),
    ]).then(async ([{ data, error }, databasePlaces]) => {
      if (cancelled || error || data.user?.id !== accountUserId) return;
      let remotePlaces = databasePlaces;
      if (!remotePlaces.length) {
        const metadataPlaces = favoritePlacesFromUnknown(
          data.user.user_metadata?.favorite_places,
        );
        const migrated = [...metadataPlaces, ...localPlaces].reduce<FavoritePlace[]>(
          (places, place) => {
            const previous = places.find((candidate) => candidate.id === place.id);
            if (!previous) return [...places, place];
            return previous.updatedAt >= place.updatedAt
              ? places
              : [...places.filter((candidate) => candidate.id !== place.id), place];
          },
          [],
        );
        if (migrated.length) {
          await upsertFavoritePlacesInDatabase(client, accountUserId, migrated);
          remotePlaces = migrated;
        }
        if (metadataPlaces.length) {
          await client.auth.updateUser({ data: { favorite_places: null } });
        }
      }
      if (cancelled) return;
      saveFavoritePlaces(accountUserId, remotePlaces);
      setFavoritePlaces(remotePlaces);
    }).catch((error) => {
      console.warn("Saved places could not be loaded from the database", error);
    });
    return () => {
      cancelled = true;
    };
  }, [accountUserId, authReady]);

  useEffect(() => {
    if (!nativeApp) return;
    let disposed = false;
    const handles: Array<{ remove: () => Promise<void> }> = [];
    void Promise.all([
      Keyboard.addListener("keyboardWillShow", ({ keyboardHeight }) => {
        if (!disposed) setKeyboardInset(keyboardHeight);
      }),
      Keyboard.addListener("keyboardWillHide", () => {
        if (!disposed) setKeyboardInset(0);
      }),
    ]).then((listeners) => {
      if (disposed) listeners.forEach((listener) => void listener.remove());
      else handles.push(...listeners);
    }).catch(() => undefined);
    return () => {
      disposed = true;
      handles.forEach((listener) => void listener.remove());
    };
  }, [nativeApp]);

  const persistFavoritePlaces = (nextPlaces: FavoritePlace[]) => {
    if (!accountUserId) return;
    const changedPlaces = nextPlaces.filter((place) => {
      const previous = favoritePlaces.find((candidate) => candidate.id === place.id);
      return !previous || previous.updatedAt !== place.updatedAt;
    });
    const removedIds = favoritePlaces
      .filter((place) => !nextPlaces.some((candidate) => candidate.id === place.id))
      .map((place) => place.id);
    setFavoritePlaces(nextPlaces);
    saveFavoritePlaces(accountUserId, nextPlaces);
    if (!supabase) return;
    void Promise.all([
      upsertFavoritePlacesInDatabase(supabase, accountUserId, changedPlaces),
      deleteFavoritePlacesFromDatabase(supabase, accountUserId, removedIds),
    ]).catch((error) => {
      console.warn("Saved places will retry syncing later", error);
    });
  };

  const saveFavoriteDraft = (draft: FavoritePlace) => {
    if (!draft.name.trim() || !draft.comment.trim()) return;
    const saved = {
      ...draft,
      name: draft.name.trim(),
      comment: draft.comment.trim(),
      updatedAt: Date.now(),
    };
    persistFavoritePlaces([
      ...favoritePlaces.filter((place) => place.id !== saved.id),
      saved,
    ]);
    setFavoriteDraft(null);
  };

  const deleteFavoriteDraft = (draft: FavoritePlace) => {
    persistFavoritePlaces(
      favoritePlaces.filter((place) => place.id !== draft.id),
    );
    setSelectedFavoritePlaceId(null);
    setFavoriteDraft(null);
  };

  const openFavoriteDirections = async (provider: "apple" | "google", favorite: FavoritePlace) => {
    const url = favoriteDirectionsUrl(provider, favorite);
    if (nativeApp) {
      try {
        const result = await AppLauncher.openUrl({
          url: favoriteNativeDirectionsUrl(provider, favorite),
        });
        if (result.completed) return;
      } catch {
        // Fall back to web directions if the selected app is unavailable.
      }
      try {
        await Browser.open({ url });
        return;
      } catch {
        // Fall back to a regular browser tab if native plugins are unavailable.
      }
    }
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const chooseFavoriteDirections = async (favorite: FavoritePlace) => {
    if (!nativeApp) {
      await openFavoriteDirections("google", favorite);
      return;
    }
    try {
      const result = await ActionSheet.showActions({
        title: "Get directions",
        message: "Select a maps application",
        options: [
          { title: "Apple Maps" },
          { title: "Google Maps" },
          { title: "Cancel", style: ActionSheetButtonStyle.Cancel },
        ],
      });
      if (result.index === 0) await openFavoriteDirections("apple", favorite);
      if (result.index === 1) await openFavoriteDirections("google", favorite);
    } catch {
      await openFavoriteDirections("apple", favorite);
    }
  };

  const openFavoritePlace = (favorite: FavoritePlace) => {
    setSyncOpen(false);
    setFavoritePlacementActive(false);
    setFavoriteEditorMode("view");
    if (journeyExpandedRef.current) settleJourneySheet(false);
    const map = mapRef.current;
    if (!map) {
      setSelectedFavoritePlaceId(favorite.id);
      setFavoriteDraft({ ...favorite });
      return;
    }
    setSelectedFavoritePlaceId(null);
    map.once("moveend", () => {
      setSelectedFavoritePlaceId(favorite.id);
      setFavoriteDraft({ ...favorite });
    });
    map.flyTo({
      center: [favorite.lng, favorite.lat],
      zoom: Math.max(map.getZoom(), 15.5),
      pitch: 0,
      bearing: 0,
      duration: 650,
      essential: true,
    });
  };

  return (
    <main className="app-shell" aria-busy={accountDataLoading}>
      <AccountLoadingScreen visible={accountDataLoading} />
      <DiscoveryMap
        mode={mode}
        points={points}
        cells={cells}
        currentPoint={currentPoint}
        locationState={
          tracking === "tracking"
            ? "tracking"
            : locationIsCurrent
              ? "located"
              : "idle"
        }
        onMapClick={() => {
          setSelectedFavoritePlaceId(null);
          if (journeyExpandedRef.current)
            settleJourneySheet(
              false,
              undefined,
              JOURNEY_MAP_TAP_CLOSE_DURATION_MS,
            );
        }}
        favoritePlaces={favoritePlaces}
        selectedFavoritePlaceId={selectedFavoritePlaceId}
        favoritePlacementActive={favoritePlacementActive}
        onFavoritePlaceRequest={({ lat, lng, suggestedName }) => {
          setFavoritePlacementActive(false);
          setFavoriteEditorMode("edit");
          setFavoriteDraft(createFavoritePlace(lat, lng, suggestedName));
        }}
        onFavoriteSelect={openFavoritePlace}
        onZoomChange={onZoomChange}
        mapRef={mapRef}
      />
      {devToolsEnabled && devToolsVisible && (
        <aside
          className="test-route-controls"
          aria-label="Development test tools"
        >
          <div className="test-route-controls__heading">
            <strong>Test routes</strong>
            <button
              type="button"
              onClick={() => setDevToolsOpen(false)}
              aria-label="Hide development test tools"
              title="Hide development test tools"
            >
              <XIcon size={14} />
            </button>
          </div>
          <button
            type="button"
            onClick={() => void runTestRoute("barcelona-exploration.gpx")}
            disabled={testRouteRunning}
          >
            Barcelona
          </button>
          <button
            type="button"
            onClick={() => void runTestRoute("fells_loop.gpx")}
            disabled={testRouteRunning}
          >
            Test
          </button>
          <button
            type="button"
            onClick={() => void runTestRoute("barcelona-repeat.gpx")}
            disabled={testRouteRunning}
          >
            Repeat Barcelona
          </button>
          <button
            type="button"
            onClick={() => void runTestRoute("san-francisco-exploration.gpx")}
            disabled={testRouteRunning}
          >
            San Francisco
          </button>
          <strong>Discovery reminder</strong>
          <small>
            {reminderEnabled
              ? reminderDebug.status
              : "Enable Discovery reminders in Account & sync"}
          </small>
          {reminderEnabled && (
            <small>
              {(
                Math.min(reminderDebug.elapsedMs, REMINDER_MINUTES * 60_000) /
                60_000
              ).toFixed(1)}{" "}
              / {REMINDER_MINUTES} min in new areas
              <br />
              {Math.min(
                Math.round(reminderDebug.distanceM),
                REMINDER_DISTANCE_M,
              )}{" "}
              / {REMINDER_DISTANCE_M} m
            </small>
          )}
          <button
            type="button"
            onClick={() => void simulateReminder()}
            disabled={
              testRouteRunning ||
              tracking === "tracking" ||
              tracking === "requesting"
            }
          >
            Simulate 5-min discovery
          </button>
          {tracking === "tracking" && (
            <button
              type="button"
              onClick={() => void simulateInactivityNotification()}
            >
              Test stop reminder
            </button>
          )}
          <strong>Achievements</strong>
          <small>
            Opens the real celebration and, in the native app, schedules the
            same local notification. Each press cycles to another badge.
          </small>
          <button
            type="button"
            onClick={() => void simulateAchievementUnlock()}
          >
            Test achievement unlock
          </button>
          {achievementTestMessage && (
            <small role="status">{achievementTestMessage}</small>
          )}
          {reminderTestMessage && (
            <small role="status">{reminderTestMessage}</small>
          )}
        </aside>
      )}
      {devToolsEnabled && !devToolsVisible && (
        <button
          className="test-route-controls__restore"
          type="button"
          onClick={() => setDevToolsOpen(true)}
        >
          Dev tools
        </button>
      )}

      <header className="topbar">
        <button
          className="brand"
          onClick={showGlobe}
          aria-label="View the globe"
        >
          <span className="brand__mark">
            <HecateMark />
          </span>
          <span>Hecate</span>
        </button>
        <button
          className="avatar-button"
          onClick={() => {
            setSyncInitialIntent("signin");
            setSyncOpen(true);
          }}
          aria-label="Account and sync"
        >
          <UserIcon size={19} />
        </button>
      </header>

      {!accountUserId && !isCityScale && !accountDataLoading ? (
        <section className="guest-intro" aria-labelledby="guest-intro-title">
          <div className="eyebrow">Discover your world</div>
          <h1 id="guest-intro-title">Turn every walk into your map.</h1>
          <p>
            Hecate reveals new ground as you explore. Your routes and exact
            locations stay private.
          </p>
          <div className="guest-intro__actions">
            <button
              type="button"
              onClick={() => {
                setSyncInitialIntent("signup");
                setSyncOpen(true);
              }}
            >
              Create free account
            </button>
            <button
              className="guest-intro__sign-in"
              type="button"
              onClick={() => {
                setSyncInitialIntent("signin");
                setSyncOpen(true);
              }}
            >
              Sign in
            </button>
          </div>
        </section>
      ) : !isCityScale && !accountDataLoading ? (
        <div className="zoom-hint">
          <span /> Zoom closer to reveal discoveries
        </div>
      ) : null}

      {favoritePlacementActive && (
        <div className="favorite-placement-hint" role="status">
          Tap the place you want to remember
          <button type="button" onClick={() => setFavoritePlacementActive(false)}>
            Cancel
          </button>
        </div>
      )}

      {!nativeApp && reminderPrompt && tracking !== "tracking" && (
        <aside
          className="reminder-prompt"
          role="alert"
          aria-label="Discovery reminder"
        >
          <strong>Start recording your journey?</strong>
          <p>{reminderMessage()}</p>
          <div>
            <button
              type="button"
              onClick={() => {
                setReminderPrompt(null);
                void toggleTracking();
              }}
            >
              Start recording
            </button>
            <button type="button" onClick={() => setReminderPrompt(null)}>
              Not now
            </button>
          </div>
        </aside>
      )}

      {inactivityPrompt && tracking === "tracking" && (
        <aside
          className="reminder-prompt"
          role="alert"
          aria-label="Stop recording reminder"
        >
          <strong>Still recording?</strong>
          <p>
            If you're done exploring near this spot, you can stop recording.
            Your recording will continue until you stop it.
          </p>
          <div>
            <button type="button" onClick={() => void toggleTracking()}>
              Stop recording
            </button>
            <button type="button" onClick={() => setInactivityPrompt(false)}>
              Keep recording
            </button>
          </div>
        </aside>
      )}

      {tracking !== "tracking" &&
        tracking !== "requesting" &&
        (locationDisplayStatus === "denied" ||
          locationDisplayStatus === "unavailable") && (
          <button
            type="button"
            className={`location-status location-status--${locationDisplayStatus}`}
            onClick={() => void openLocationSettings().catch(() => undefined)}
            disabled={locationDisplayStatus !== "denied" || !nativeApp}
            aria-live="polite"
            aria-label={locationStatusText}
          >
            <span />
            {locationStatusText}
          </button>
        )}

      <nav className="map-actions" aria-label="Map controls">
        {accountUserId && summaryCity && isCityScale && (
          <button
            className="map-milestone"
            type="button"
            onClick={() => settleJourneySheet(true)}
            aria-label={
              currentCityMilestone.next
                ? `${currentCityMilestoneLevel} of 3 city stars earned in ${summaryCity.name}. ${formatRemainingDistance(currentCityMilestoneRemaining)} until the next star. Open city progress.`
                : `All 3 city stars earned in ${summaryCity.name}. Open city progress.`
            }
            title={
              currentCityMilestone.next
                ? `Next city star at ${formatDistance(currentCityMilestone.next.thresholdKm)}`
                : "All 3 city stars earned"
            }
          >
            <CityLevelStars level={currentCityMilestoneLevel} />
            <span className="map-milestone__track" aria-hidden="true">
              <span
                style={{ width: `${currentCityMilestone.progress * 100}%` }}
              />
            </span>
            <small>
              {currentCityMilestone.next
                ? `${formatRemainingDistance(currentCityMilestoneRemaining)} left`
                : "Complete"}
            </small>
          </button>
        )}
        {accountUserId && (
          <button
            className={favoritePlacementActive ? "active" : ""}
            type="button"
            onClick={() => {
              setFavoriteDraft(null);
              setFavoritePlacementActive((active) => !active);
              if (journeyExpandedRef.current) settleJourneySheet(false);
            }}
            aria-label={favoritePlacementActive ? "Cancel adding a saved place" : "Save a place"}
            aria-pressed={favoritePlacementActive}
            title="Save a place"
          >
            <SaveIcon size={21} />
          </button>
        )}
        <button
          className={`location-control${
            passiveLocationStatus === "requesting"
              ? " location-control--requesting"
              : ""
          }`}
          onClick={locate}
          aria-label={
            currentPoint ? "Center on my location" : "Find my location"
          }
          title={currentPoint ? "Center on my location" : "Find my location"}
        >
          <LocateIcon size={21} />
        </button>
        <button
          className={mode === "map" ? "active" : ""}
          onClick={() =>
            setMode((currentMode) =>
              currentMode === "discover" ? "map" : "discover",
            )
          }
          aria-label={
            mode === "map" ? "Show my uncovered map" : "Reveal the full map"
          }
          aria-pressed={mode === "map"}
          title={mode === "map" ? "Show uncovered map" : "Reveal full map"}
        >
          <MapIcon size={21} />
        </button>
        <button
          className={perspectiveView ? "active" : ""}
          onClick={toggleMapPerspective}
          aria-label={
            perspectiveView ? "Reset map orientation" : "Tilt and rotate map"
          }
          aria-pressed={perspectiveView}
        >
          <PerspectiveIcon size={21} />
        </button>
      </nav>

      {favoriteDraft && (
        <FavoritePlaceEditor
          key={`${favoriteDraft.id}:${favoriteEditorMode}`}
          favorite={favoriteDraft}
          initialMode={favoriteEditorMode}
          existing={favoritePlaces.some((place) => place.id === favoriteDraft.id)}
          keyboardInset={keyboardInset}
          onClose={() => {
            setFavoriteDraft(null);
          }}
          onSave={saveFavoriteDraft}
          onDelete={deleteFavoriteDraft}
          onDirections={(favorite) => void chooseFavoriteDirections(favorite)}
        />
      )}


      {isCityScale && (
        <section
          ref={journeyCardRef}
          className="journey-card"
          onPointerDown={beginJourneyDrag}
          onPointerMove={moveJourneyDrag}
          onPointerUp={endJourneyDrag}
          onPointerCancel={cancelJourneyDrag}
          onClickCapture={suppressClickAfterJourneyDrag}
        >
          {nativeApp && (
            <div
              className="journey-card__system-gesture-guard"
              aria-hidden="true"
              onPointerDown={(event) => event.stopPropagation()}
            />
          )}
          <div className="journey-card__header">
            <div className="journey-card__handle" aria-hidden="true">
              <span />
            </div>
            <div className="journey-card__summary">
              <div className="eyebrow">Your discovery</div>
              <div className="discovery-metrics">
                {showFirstDiscoveryHint ? (
                  <div className="first-discovery-hint" role="status">
                    <strong>Ready to explore?</strong>
                    <span>Tap play and start walking.</span>
                  </div>
                ) : accountUserId ? (
                  <>
                    <div className="distance">
                      {formatDistance(currentCityDistance)}
                    </div>
                    {summaryCity && (
                      <button
                        className="city-progress"
                        onClick={() => setCoverageInfoOpen(true)}
                        aria-label={`Explain discovery percentage for ${summaryCity.name}`}
                      >
                        <strong>{discoveryLabel}</strong>
                        <span>of {summaryCity.name}</span>
                        <span className="city-progress__info">
                          <InfoIcon size={18} strokeWidth={1.7} />
                        </span>
                      </button>
                    )}
                  </>
                ) : (
                  <p className="discovery-sign-in">Sign in to start tracking</p>
                )}
              </div>
            </div>
            <button
              className={`discovery-control discovery-control--${tracking}`}
              onClick={toggleTracking}
              onPointerDown={(event) => event.stopPropagation()}
              disabled={
                !authReady || discoveryLoading || tracking === "requesting"
              }
              aria-label={
                !accountUserId
                  ? "Sign in to start discovering"
                  : tracking === "tracking"
                    ? "Stop discovering"
                    : tracking === "requesting"
                      ? "Finding your location"
                      : "Start discovering"
              }
              title={
                !accountUserId
                  ? "Sign in to discover"
                  : tracking === "tracking"
                    ? "Stop discovering"
                    : "Start discovering"
              }
            >
              {tracking === "tracking" ? (
                <span className="stop-square" />
              ) : tracking === "requesting" ? (
                <span className="control-spinner" />
              ) : (
                <span className="play-triangle" />
              )}
            </button>
          </div>
          {tracking === "tracking" && (
            <div className="tracking-notice">
              <span />
              {nativeApp
                ? "Discovering in background"
                : "Keep this page open and your screen on"}
            </div>
          )}
          {tracking === "denied" && (
            <p className="location-error">
              {nativeApp
                ? "Location access is disabled. Open Settings above to allow Hecate to use your location."
                : "Location access is disabled. Allow Hecate to use your location in the browser settings."}
            </p>
          )}
          {tracking === "unavailable" && (
            <p className="location-error">
              Location is temporarily unavailable. Try again, or preview the
              sample discovery.
            </p>
          )}
          <div
            className="discovered-cities"
            aria-label="Discovered cities"
            aria-hidden={!citiesExpanded}
          >
              <div className="discovered-cities__heading">
                <span>Your cities</span>
                <small>
                  {citiesLoadedUserId !== accountUserId || cityBackfillLoading
                    ? "Finding past cities…"
                    : `${cityProgresses.length} ${cityProgresses.length === 1 ? "city" : "cities"} · ${formatDistance(totalCityDistance)} new ground`}
                </small>
              </div>
              {accountUserId ? (
                cityProgresses.length ? (
                  <ul>
                    {cityProgresses.map(({ city, percentage, distance }) => {
                      const earned = earnedCityMilestones(
                        city.id,
                        city.name,
                        distance,
                      );
                      const next = cityMilestoneProgress(distance).next;
                      return (
                        <li key={city.id}>
                          <button
                            type="button"
                            onClick={() => focusDiscoveredCity(city)}
                          >
                            <span className="discovered-cities__identity">
                              <span>{city.name}</span>
                              <small>
                                {next
                                  ? `${formatDistance(distance)} / ${formatDistance(next.thresholdKm)} · ${next.title}`
                                  : `${earned.at(-1)?.title} · all 3 stars earned`}
                              </small>
                            </span>
                            <span className="discovered-cities__metrics">
                              <CityLevelStars level={earned.length} />
                              <strong>
                                {formatDiscoveryPercentage(percentage, false)}
                              </strong>
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p>Start a walk to add your first city.</p>
                )
              ) : (
                <p>Sign in to see your cities and keep them in sync.</p>
              )}
              {accountUserId && (
                <section
                  className="personal-achievements"
                  aria-labelledby="personal-achievements-title"
                >
                  <div className="personal-achievements__heading">
                    <span id="personal-achievements-title">Achievements</span>
                    <small>
                      {
                        achievementEvaluations.filter(({ earned }) => earned)
                          .length
                      }
                      {" / "}
                      {achievementEvaluations.length} earned
                    </small>
                  </div>
                  <ul>
                    {achievementEvaluations.map(
                      ({ definition, earned, progress, progressLabel }) => (
                        <li
                          key={definition.id}
                          className={
                            earned ? "personal-achievements__earned" : ""
                          }
                        >
                          <AchievementCard
                            achievement={definition}
                            earned={earned}
                            progress={progress}
                            progressLabel={progressLabel}
                            compact
                          />
                        </li>
                      ),
                    )}
                  </ul>
                </section>
              )}
          </div>
        </section>
      )}

      <div className="attribution-note">Open map · Your paths stay yours</div>
      {coverageInfoOpen && summaryCity && (
        <div
          className="coverage-backdrop"
          onClick={() => setCoverageInfoOpen(false)}
        >
          <section
            className="coverage-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="coverage-title"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              className="coverage-sheet__close"
              onClick={() => setCoverageInfoOpen(false)}
              aria-label="Close explanation"
            >
              <XIcon size={19} />
            </button>
            <div className="eyebrow">City discovery</div>
            <h2 id="coverage-title">
              {discoveryLabel} of {summaryCity.name}
            </h2>
            <p>
              Based on the map focus and your current location, Hecate detected{" "}
              {summaryCity.name} as the city region for this view. This
              percentage shows how much of that region you’ve uncovered.
            </p>
            <div className="coverage-sheet__source">
              <span /> Municipal boundary from OpenStreetMap
            </div>
          </section>
        </div>
      )}
      <SyncSheet
        open={syncOpen}
        initialAuthIntent={syncInitialIntent}
        onClose={() => setSyncOpen(false)}
        reminderEnabled={reminderEnabled}
        nativeApp={nativeApp}
        keyboardInset={keyboardInset}
        cityProgress={accountCityProgress}
        favoritePlaces={favoritePlaces}
        onFavoriteSelect={openFavoritePlace}
        onReminderChange={updateReminderEnabled}
      />
      {explorationSummary && (
        <div className="exploration-recap-backdrop" role="presentation">
          <section
            className="exploration-recap"
            role="dialog"
            aria-modal="true"
            aria-labelledby="exploration-recap-title"
          >
            <div className="eyebrow">Exploration complete</div>
            <h2 id="exploration-recap-title">You made new ground yours.</h2>
            <div className="exploration-recap__map">
              <DiscoveryMap
                mode="discover"
                points={explorationSummary.points}
                cells={explorationSummary.cells}
                onZoomChange={() => undefined}
                mapRef={previewMapRef}
                initialCenter={[
                  explorationSummary.points.at(-1)!.lng,
                  explorationSummary.points.at(-1)!.lat,
                ]}
                initialZoom={14.2}
              />
            </div>
            <div className="exploration-recap__headline">
              <strong>{formatDistance(explorationSummary.newGroundKm)}</strong>
              <span>of new ground uncovered</span>
            </div>
            <div className="exploration-recap__insights">
              {explorationSummary.cityName &&
                explorationSummary.cityPercentageAdded !== undefined && (
                  <span>
                    +
                    {formatRecapPercentage(
                      explorationSummary.cityPercentageAdded,
                    )}{" "}
                    of {explorationSummary.cityName}
                  </span>
                )}
              <span>
                {explorationSummary.cells.length} new discovery{" "}
                {explorationSummary.cells.length === 1 ? "area" : "areas"}
              </span>
              <span>
                {formatDuration(
                  explorationSummary.startedAt,
                  explorationSummary.finishedAt,
                )}{" "}
                · {formatDistance(explorationSummary.travelledKm)} travelled
              </span>
            </div>
            <div className="exploration-recap__actions">
              <button type="button" onClick={() => setExplorationSummary(null)}>
                Done
              </button>
              <button
                className="exploration-recap__view"
                type="button"
                onClick={() => {
                  const latest = explorationSummary.points.at(-1);
                  setExplorationSummary(null);
                  if (latest)
                    mapRef.current?.flyTo({
                      center: [latest.lng, latest.lat],
                      zoom: 14.2,
                      duration: 900,
                      essential: true,
                    });
                }}
              >
                View on map
              </button>
            </div>
          </section>
        </div>
      )}
      {activeAchievementCelebration && !explorationSummary && (
        <AchievementCelebration
          achievement={activeAchievementCelebration}
          remaining={Math.max(0, achievementCelebrations.length - 1)}
          onDismiss={() => {
            if (achievementTestPreview) {
              setAchievementTestPreview(null);
              return;
            }
            if (accountUserId)
              dismissAchievementUnlock(
                accountUserId,
                activeAchievementCelebration.id,
              );
            if (accountUserId)
              void acknowledgeAchievementUnlock(
                accountUserId,
                activeAchievementCelebration.id,
              ).catch((error) =>
                console.warn("Could not sync achievement acknowledgement", error),
              );
            setAchievementCelebrations((current) => current.slice(1));
          }}
        />
      )}
    </main>
  );
}
