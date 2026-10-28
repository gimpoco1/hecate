import { deviatingNavigationPlayback, type NavigationPlayback } from "./navigationSimulation";
import { cameraNeedsUpdate, mapCameraBearing, navigationCameraStep, type MapOrientation } from "./routeCamera";
import { NavigationSimulation } from "./components/NavigationSimulation";
import { NavigationTurn } from "./components/NavigationTurn";
import { FeedbackForm } from "./components/FeedbackForm";
import { setAppearancePreference, useAppearance } from "./appearance";
import { hasReachedRouteDestination, navigationCue, type NavigationCue } from "./navigationGuidance";
import { advanceRouteProgress, type RouteProgress } from "./routeProgress";
import { prepareRouteGeometry, type RouteGeometry } from "./routeGeometry";
import { calculateNavigationRoute, type PlannedRoute, type TransportMode } from "./explorationRouting";
import {
  ExplorationRoutePlanner,
  type RouteDestination,
} from "./components/ExplorationRoutePlanner";
import {
  DISCOVERY_REMINDER_DURATIONS,
  INACTIVITY_REMINDER_DURATIONS,
} from "./reminderDurations";
import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { App as CapacitorApp } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { ActionSheet, ActionSheetButtonStyle } from "@capacitor/action-sheet";
import { AppLauncher } from "@capacitor/app-launcher";
import { Browser } from "@capacitor/browser";
import { Keyboard } from "@capacitor/keyboard";
import {
  LocalNotifications,
  type LocalNotificationSchema,
} from "@capacitor/local-notifications";
import type { Map as MapLibreMap, Marker } from "maplibre-gl";
import type { DiscoveryFogLayer } from "./fogLayer";
import type {
  DiscoveryMetricsRequest,
  DiscoveryMetricsResponse,
  DiscoveryProgressResponse,
} from "./discoveryMetrics.worker";
import {
  isPersonalAchievementId,
  PERSONAL_ACHIEVEMENTS,
  personalAchievementDefinition,
  type AchievementEvaluation,
  type PersonalAchievementId,
} from "./achievements";
import {
  acknowledgeAchievementUnlock,
  confirmedPendingAchievementIds,
  dismissAchievementUnlock,
  isAchievementUnlockPending,
  loadAchievementUnlocks,
  reconcileAchievementUnlocks,
  syncAchievementUnlocks,
} from "./achievementUnlocks";
import { cityMilestoneProgress } from "./badges";
import { createJourneyRecordingTracker } from "./journeyRecording";
import {
  JOURNEY_SPEED_STOP_MESSAGE,
  JOURNEY_SPEED_STOP_NOTIFICATION_ID,
  openJourneySpeedStopReport,
  sendJourneySpeedStopNotification,
  type JourneySpeedStopReport,
} from "./journeyNotifications";
import {
  MORNING_INVITE_ACTION_TYPE_ID,
  START_WALK_ACTION_ID,
  REPORT_JOURNEY_SPEED_STOP_ACTION_ID,
  registerNotificationActions,
} from "./notificationActions";
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
import { AchievementCelebration } from "./components/AchievementCelebration";
import { AccountLoadingScreen } from "./components/AccountLoadingScreen";
import { FavoritePlaceEditor } from "./components/FavoritePlaceEditor";
import { CityLevelStars } from "./components/CityLevelStars";
import {
  CityMilestones,
  JOURNEY_CITY_MILESTONES_TITLE_ID,
  type CityMilestoneProgress,
} from "./components/CityMilestones";
import { GlobalMilestonesSheet } from "./components/WorldMilestones";
import { SavedPlacesSheet } from "./components/SavedPlaces";
import {
  AchievementsSheet,
  CitiesSheet,
} from "./components/ProfileCollections";
import { Counter, type CounterPlace } from "./components/Counter";
import { SyncSheet, type GpxImportResult } from "./components/SyncSheet";
import {
  ChevronIcon,
  HecateMark,
  InfoIcon,
  CompassIcon,
  LocateIcon,
  FogIcon,
  ViewDimensionIcon,
  SaveIcon,
  RouteIcon,
  UserIcon,
  XIcon,
} from "./components/Icons";
import {
  discoveredDistanceKm,
  discoveryJourneyMetrics,
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
  emptyWalkingStats,
  walkingStatsFromJourneys,
  type WalkingStats,
} from "./walkingStats";
import {
  ExplorationReminder,
  isUnmappedArea,
  loadReminderPreference,
  pauseReminderAfterTap,
  saveReminderPreference,
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
import { refreshPublishedLeaderboardSnapshot } from "./leaderboard";
import { ensureNotificationPermission } from "./notificationPermissions";
import {
  JourneyActivity,
  journeyActivitySnapshot,
  journeyNewGroundMeters,
  journeyActionFromUrl,
  type JourneyStopRequest,
} from "./journeyActivity";
import {
  assertFreshJourneyControlRequest,
  parseJourneyControlRequest,
  type JourneyControlRequest,
} from "./journeyControl";
import { replaceNotificationSchedules } from "./notificationScheduling";
import {
  defaultActivityNotificationPreferences,
  enabledActivityNotificationPreferences,
  hasSavedActivityNotificationPreferences,
  loadActivityNotificationPreferences,
  isReminderTime,
  morningInviteMessage,
  nextWeeklyRecapDate,
  saveActivityNotificationPreferences,
  streakReminderDate,
  streakReminderMessage,
  weeklyRecapFromPoints,
  type ActivityNotificationCategory,
  type ActivityNotificationPreferences,
} from "./activityNotifications";
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
  readLocationAuthorization,
  requestReminderMotionPermission,
  readReminderMotionAuthorization,
  reminderMotionPermissionLabel,
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
import {
  completeWalkJournal,
  loadWalkJournalState,
  saveWalkJournal,
} from "./walkJournal";
import {
  compactImportedRoute,
  parseGpx,
  persistImportedDiscovery,
  storedWalkRoutes,
  walkIsAlreadyStored,
} from "./gpx";

type ActiveWalk = Omit<PendingWalk, "finishedAt">;
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
const REMINDER_TEST_NOTIFICATION_ID = 1045;
const ACHIEVEMENT_NOTIFICATION_ID_START = 1100;
const MORNING_INVITE_NOTIFICATION_ID = 1200;
const WEEKLY_RECAP_NOTIFICATION_ID = 1201;
const STREAK_REMINDER_NOTIFICATION_ID = 1202;
const MORNING_INVITE_TEST_NOTIFICATION_ID = 1210;
const WEEKLY_RECAP_TEST_NOTIFICATION_ID = 1211;
const STREAK_REMINDER_TEST_NOTIFICATION_ID = 1212;
const DEV_TOOLS_VISIBILITY_KEY = "hecate:dev-tools-visible";
const DEV_TOOLS_ENABLED =
  import.meta.env.VITE_ENABLE_DEV_TOOLS === "1" ||
  (import.meta.env.DEV && import.meta.env.VITE_ENABLE_DEV_TOOLS !== "0");
const JOURNEY_SETTLE_DURATION_MS = 220;
const JOURNEY_MAP_TAP_CLOSE_DURATION_MS = 70;

function reminderMessage(minutes: number): string {
  return `You have been walking for ${minutes} minutes. Start recording your journey?`;
}

async function sendReminderNotification(
  userId: string,
  minutes: number,
  kind: ReminderKind,
) {
  await LocalNotifications.schedule({
    notifications: [
      {
        id: REMINDER_NOTIFICATION_ID,
        title: "Ready to record your journey?",
        body: reminderMessage(minutes),
        isExactNotification: false,
        schedule: { at: new Date(Date.now() + 1_000) },
        extra: { kind, userId },
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
        isExactNotification: false,
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

type CachedDiscoveryProgress = Omit<
  DiscoveryProgressResponse,
  "kind" | "generation"
> & {
  version: 5;
  userId: string;
};

const DISCOVERY_PROGRESS_CACHE_PREFIX = "hecate:discovery-progress:v5";

function isNullableFiniteNumber(value: unknown): value is number | null {
  return (
    value === null || (typeof value === "number" && Number.isFinite(value))
  );
}

function isWalkingStats(value: unknown): value is WalkingStats {
  if (!value || typeof value !== "object") return false;
  const stats = value as Partial<WalkingStats>;
  return (
    typeof stats.walkCount === "number" &&
    Number.isInteger(stats.walkCount) &&
    stats.walkCount >= 0 &&
    typeof stats.longestWalkKm === "number" &&
    Number.isFinite(stats.longestWalkKm) &&
    isNullableFiniteNumber(stats.longestWalkFinishedAt) &&
    typeof stats.averageWalkKm === "number" &&
    Number.isFinite(stats.averageWalkKm) &&
    typeof stats.currentStreakDays === "number" &&
    Number.isInteger(stats.currentStreakDays) &&
    stats.currentStreakDays >= 0 &&
    typeof stats.bestStreakDays === "number" &&
    Number.isInteger(stats.bestStreakDays) &&
    stats.bestStreakDays >= 0 &&
    isNullableFiniteNumber(stats.firstWalkAt)
  );
}

export function discoveryProgressCacheKey(userId: string): string {
  return `${DISCOVERY_PROGRESS_CACHE_PREFIX}:${userId}`;
}

export function loadCachedDiscoveryProgress(
  userId: string,
): Omit<DiscoveryProgressResponse, "kind" | "generation"> | null {
  try {
    const raw = localStorage.getItem(discoveryProgressCacheKey(userId));
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object") return null;
    const cached = value as Partial<CachedDiscoveryProgress>;
    if (
      cached.version !== 5 ||
      cached.userId !== userId ||
      typeof cached.discoveryDistance !== "number" ||
      !Number.isFinite(cached.discoveryDistance) ||
      typeof cached.travelledDistance !== "number" ||
      !Number.isFinite(cached.travelledDistance) ||
      typeof cached.todayDiscoveryDistance !== "number" ||
      !Number.isFinite(cached.todayDiscoveryDistance) ||
      typeof cached.todayTravelledDistance !== "number" ||
      !Number.isFinite(cached.todayTravelledDistance) ||
      typeof cached.todayActiveTimeMs !== "number" ||
      !Number.isFinite(cached.todayActiveTimeMs) ||
      typeof cached.weekDiscoveryDistance !== "number" ||
      !Number.isFinite(cached.weekDiscoveryDistance) ||
      typeof cached.weekActiveTimeMs !== "number" ||
      !Number.isFinite(cached.weekActiveTimeMs) ||
      typeof cached.weekDiscoveryDeltaDistance !== "number" ||
      !Number.isFinite(cached.weekDiscoveryDeltaDistance) ||
      typeof cached.weekActiveDeltaTimeMs !== "number" ||
      !Number.isFinite(cached.weekActiveDeltaTimeMs) ||
      !isWalkingStats(cached.walkingStats) ||
      !Array.isArray(cached.cityMetrics) ||
      !cached.cityMetrics.every(
        (metric) =>
          metric &&
          typeof metric.cityId === "string" &&
          typeof metric.percentage === "number" &&
          Number.isFinite(metric.percentage) &&
          typeof metric.distance === "number" &&
          Number.isFinite(metric.distance),
      )
    )
      return null;
    return {
      discoveryDistance: cached.discoveryDistance,
      travelledDistance: cached.travelledDistance,
      walkingStats: cached.walkingStats,
      todayDiscoveryDistance: cached.todayDiscoveryDistance,
      todayTravelledDistance: cached.todayTravelledDistance,
      todayActiveTimeMs: cached.todayActiveTimeMs,
      weekDiscoveryDistance: cached.weekDiscoveryDistance,
      weekActiveTimeMs: cached.weekActiveTimeMs,
      weekDiscoveryDeltaDistance: cached.weekDiscoveryDeltaDistance,
      weekActiveDeltaTimeMs: cached.weekActiveDeltaTimeMs,
      cityMetrics: cached.cityMetrics,
    };
  } catch {
    return null;
  }
}

export function saveCachedDiscoveryProgress(
  userId: string,
  progress: Omit<DiscoveryProgressResponse, "kind" | "generation">,
): void {
  const cached: CachedDiscoveryProgress = {
    version: 5,
    userId,
    ...progress,
  };
  try {
    localStorage.setItem(
      discoveryProgressCacheKey(userId),
      JSON.stringify(cached),
    );
  } catch (error) {
    console.warn("Could not cache discovery progress", {
      userId,
      error:
        error instanceof Error
          ? error.message
          : "Web Storage failed with an unknown error.",
    });
  }
}

type JourneyDetailsProps = {
  accountUserId: string | null;
  expanded: boolean;
  todayDiscoveryDistance: number;
  todayTravelledDistance: number;
  todayActiveTimeMs: number;
  currentStreakDays: number;
  weekDiscoveryDistance: number;
  weekActiveTimeMs: number;
  weekDiscoveryDeltaDistance: number;
  weekActiveDeltaTimeMs: number;
  cityProgress: CityMilestoneProgress | null;
  onWalkingStatsOpen: () => void;
};

const JourneyDetails = memo(function JourneyDetails({
  accountUserId,
  expanded,
  todayDiscoveryDistance,
  todayTravelledDistance,
  todayActiveTimeMs,
  currentStreakDays,
  weekDiscoveryDistance,
  weekActiveTimeMs,
  weekDiscoveryDeltaDistance,
  weekActiveDeltaTimeMs,
  cityProgress,
  onWalkingStatsOpen,
}: JourneyDetailsProps) {
  return (
    <div
      className="journey-overview"
      aria-label="Walking overview"
      aria-hidden={!expanded}
    >
      {accountUserId ? (
        <>
          <section
            className="journey-global-stats"
            aria-labelledby="journey-global-stats-title"
          >
            <div className="journey-global-stats__heading">
              <h3 id="journey-global-stats-title">Journey stats</h3>
              <button
                type="button"
                aria-label="Open full walking stats"
                onClick={onWalkingStatsOpen}
              >
                View all
                <ChevronIcon size={14} strokeWidth={2.3} />
              </button>
            </div>
            <dl>
              <div>
                <dt>New ground today</dt>
                <dd>{formatDistance(todayDiscoveryDistance)}</dd>
              </div>
              <div>
                <dt>Travelled today</dt>
                <dd>{formatDistance(todayTravelledDistance)}</dd>
              </div>
              <div>
                <dt>Time active today</dt>
                <dd>{formatElapsedDuration(todayActiveTimeMs)}</dd>
              </div>
              <div>
                <dt>Current streak</dt>
                <dd>{formatStreakDays(currentStreakDays)}</dd>
              </div>
              <div>
                <dt>New ground this week</dt>
                <dd>
                  <span>{formatDistance(weekDiscoveryDistance)}</span>
                  <small
                    className={weekDeltaClassName(weekDiscoveryDeltaDistance)}
                  >
                    {formatWeekDistanceDelta(weekDiscoveryDeltaDistance)}
                  </small>
                </dd>
              </div>
              <div>
                <dt>Time active this week</dt>
                <dd>
                  <span>{formatElapsedDuration(weekActiveTimeMs)}</span>
                  <small
                    className={weekDeltaClassName(
                      weekActiveDeltaTimeMs,
                      30_000,
                    )}
                  >
                    {formatWeekTimeDelta(weekActiveDeltaTimeMs)}
                  </small>
                </dd>
              </div>
            </dl>
          </section>
          {cityProgress && <CityMilestones progress={cityProgress} />}
        </>
      ) : (
        <p>Sign in to see your walking stats and keep them in sync.</p>
      )}
    </div>
  );
});

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

function formatElapsedDuration(durationMs: number) {
  const minutes = Math.max(0, Math.round(durationMs / 60_000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return `${hours} hr ${minutes % 60 ? `${minutes % 60} min` : ""}`.trim();
}

function formatStreakDays(days: number) {
  return `${days} ${days === 1 ? "day" : "days"}`;
}

function formatWeekDistanceDelta(deltaKm: number) {
  if (Math.abs(deltaKm) < 0.0005) return "No change vs last week";
  const sign = deltaKm > 0 ? "+" : "-";
  return `${sign}${formatDistance(Math.abs(deltaKm))} vs last week`;
}

function formatWeekTimeDelta(deltaMs: number) {
  if (Math.abs(deltaMs) < 30_000) return "No change vs last week";
  const sign = deltaMs > 0 ? "+" : "-";
  return `${sign}${formatElapsedDuration(Math.abs(deltaMs))} vs last week`;
}

function weekDeltaClassName(delta: number, deadZone = 0.0005) {
  if (Math.abs(delta) < deadZone) return "journey-global-stats__delta";
  return delta > 0
    ? "journey-global-stats__delta journey-global-stats__delta--up"
    : "journey-global-stats__delta journey-global-stats__delta--down";
}

type JourneyCounterDisplay = {
  value: number;
  places: CounterPlace[];
  prefix: string;
  suffix: string;
  label: string;
};

function integerCounterPlaces(value: number): CounterPlace[] {
  const digitCount = Math.max(
    1,
    Math.floor(Math.max(0, value)).toString().length,
  );
  return Array.from(
    { length: digitCount },
    (_, index) => 10 ** (digitCount - index - 1),
  );
}

function decimalCounterPlaces(
  value: number,
  decimalCount: number,
): CounterPlace[] {
  return [
    ...integerCounterPlaces(value),
    ".",
    ...Array.from({ length: decimalCount }, (_, index) => 10 ** -(index + 1)),
  ];
}

export function journeyDistanceCounter(
  distanceKm: number,
): JourneyCounterDisplay {
  if (distanceKm < 1) {
    const value = Math.round(distanceKm * 1_000);
    return {
      value,
      places: integerCounterPlaces(value),
      prefix: "",
      suffix: " m",
      label: `${value} metres`,
    };
  }
  const decimalCount = distanceKm < 10 ? 2 : 1;
  const value = Number(distanceKm.toFixed(decimalCount));
  return {
    value,
    places: decimalCounterPlaces(value, decimalCount),
    prefix: "",
    suffix: " km",
    label: `${value.toFixed(decimalCount)} kilometres`,
  };
}

export function journeyNewGroundCounter(meters: number): JourneyCounterDisplay {
  const value = Math.round(meters);
  return {
    value,
    places: integerCounterPlaces(value),
    prefix: "+",
    suffix: " m",
    label: `Plus ${value} metres of new ground`,
  };
}

export function journeyTimeCounter(elapsedMs: number): {
  text: string;
  label: string;
} {
  const totalSeconds = Math.max(0, Math.floor(elapsedMs / 1_000));
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor(totalSeconds / 60) % 60;
  const seconds = totalSeconds % 60;
  const pad = (value: number): string => String(value).padStart(2, "0");
  return {
    text:
      hours > 0
        ? `${hours}:${pad(minutes)}:${pad(seconds)}`
        : `${minutes}:${pad(seconds)}`,
    label: `${hours > 0 ? `${hours} ${hours === 1 ? "hour" : "hours"}, ` : ""}${minutes} ${minutes === 1 ? "minute" : "minutes"}, ${seconds} ${seconds === 1 ? "second" : "seconds"}`,
  };
}

type JourneyCounterValueProps = {
  display: JourneyCounterDisplay;
};

function JourneyCounterValue({ display }: JourneyCounterValueProps) {
  return (
    <strong className="active-journey-value" aria-label={display.label}>
      <span aria-hidden="true">{display.prefix}</span>
      <Counter
        value={display.value}
        places={display.places}
        fontSize={16}
        gap={0}
      />
      <span aria-hidden="true">{display.suffix}</span>
    </strong>
  );
}

function uuidFromBytes(source: Uint8Array): string {
  const bytes = source.slice(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function createWalkId() {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return uuidFromBytes(crypto.getRandomValues(new Uint8Array(16)));
}

async function importedWalkIdSeed(
  userId: string,
  xml: string,
): Promise<Uint8Array> {
  const content = new TextEncoder().encode(`${userId}\u0000${xml}`);
  return new Uint8Array(await crypto.subtle.digest("SHA-256", content));
}

function importedWalkId(seed: Uint8Array, segmentIndex: number): string {
  const bytes = seed.slice(0, 16);
  const suffix = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  suffix.setUint32(12, suffix.getUint32(12) ^ segmentIndex);
  return uuidFromBytes(bytes);
}

async function retryGpxImportOperation(
  operation: () => Promise<void>,
  operationName: string,
  fileName: string,
): Promise<void> {
  let lastError = new Error(`${operationName} did not run.`);
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      await operation();
      return;
    } catch (error) {
      lastError =
        error instanceof Error
          ? error
          : new Error(`${operationName} failed for an unknown reason.`);
      console.warn("GPX import operation failed", {
        operation: operationName,
        fileName,
        attempt,
        error: lastError.message,
      });
      if (attempt < 3) {
        await new Promise((resolve) =>
          window.setTimeout(resolve, attempt * 300),
        );
      }
    }
  }
  throw lastError;
}

export default function App() {
  const { preference: appearancePreference, theme: appearanceTheme } = useAppearance();
  const [journeyStopMessage, setJourneyStopMessage] = useState<string | null>(
    null,
  );
  const [pendingSpeedStopReport, setPendingSpeedStopReport] =
    useState<JourneySpeedStopReport | null>(null);
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
  const [discoveryLocationAllowed, setDiscoveryLocationAllowed] = useState(
    () => !isNativeApp(),
  );
  const [reminderMotionAllowed, setReminderMotionAllowed] = useState<boolean | null>(isNativeApp() ? null : true);
  const [reminderMotionError, setReminderMotionError] = useState("");
  const reminderEnabledRef = useRef(reminderEnabled);
  reminderEnabledRef.current = reminderEnabled;
  const activityNotificationQueueRef = useRef<Promise<void>>(Promise.resolve());
  const activityNotificationGenerationRef = useRef(0);
  const scheduledNotificationUserRef = useRef<string | null>(null);
  const [notificationClock, setNotificationClock] = useState(Date.now);
  const [activityNotificationPreferences, setActivityNotificationPreferences] =
    useState<ActivityNotificationPreferences>(
      defaultActivityNotificationPreferences,
    );
  const [notificationPermissionReady, setNotificationPermissionReady] =
    useState<boolean | null>(() => (isNativeApp() ? null : true));
  const [reminderPrompt, setReminderPrompt] = useState<ReminderKind | null>(
    null,
  );
  const [inactivityPrompt, setInactivityPrompt] = useState(false);
  const [activityNotificationTestMessage, setActivityNotificationTestMessage] =
    useState("");
  const [achievementTestMessage, setAchievementTestMessage] = useState("");
  const [devToolsVisible, setDevToolsVisible] = useState(() => {
    if (!DEV_TOOLS_ENABLED) return false;
    try {
      return localStorage.getItem(DEV_TOOLS_VISIBILITY_KEY) !== "false";
    } catch {
      return true;
    }
  });
  const [accountUserId, setAccountUserId] = useState<string | null>(null);
  const [accountUserEmail, setAccountUserEmail] = useState("");
  const [authReady, setAuthReady] = useState(!isSyncConfigured);
  const [tracking, setTracking] = useState<TrackingState>("idle");
  const [locationPermissionToastVisible, setLocationPermissionToastVisible] =
    useState(false);
  const [locationSettingsError, setLocationSettingsError] = useState("");
  useEffect(() => {
    setLocationPermissionToastVisible(tracking === "denied");
    setLocationSettingsError("");
  }, [tracking]);
  const [elapsedNow, setElapsedNow] = useState(0);
  const [documentVisible, setDocumentVisible] = useState(
    () => document.visibilityState === "visible",
  );
  const [iosAppActive, setIosAppActive] = useState(false);
  const trackingStateRef = useRef<TrackingState>(tracking);
  trackingStateRef.current = tracking;
  const [zoom, setZoom] = useState(1.35);
  const [syncOpen, setSyncOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  useEffect(() => {
    if (feedbackOpen && authReady && !accountUserId) setSyncOpen(true);
  }, [feedbackOpen, authReady, accountUserId]);
  const [globalMilestonesOpen, setGlobalMilestonesOpen] = useState(false);
  const [savedPlacesOpen, setSavedPlacesOpen] = useState(false);
  const [citiesOpen, setCitiesOpen] = useState(false);
  const [achievementsOpen, setAchievementsOpen] = useState(false);
  const [syncInitialIntent, setSyncInitialIntent] = useState<
    "signin" | "signup"
  >("signin");
  const [coverageInfoOpen, setCoverageInfoOpen] = useState(false);
  const [discoveryLoading, setDiscoveryLoading] = useState(false);
  const [perspectiveView, setPerspectiveView] = useState(false);
  const plannedJourneyRouteRef = useRef<PlannedRoute | null>(null);
  const [activeNavigationRoute, setActiveNavigationRoute] = useState<PlannedRoute | null>(null);
  const navigationModeRef = useRef<TransportMode>("pedestrian");
  const rerouteControllerRef = useRef<AbortController | null>(null);
  const [navigationRequestPending, setNavigationRequestPending] = useState(false);
  const nextRerouteAtRef = useRef(0);
  const [navigationMessage, setNavigationMessage] = useState("");
  useEffect(() => () => { rerouteControllerRef.current?.abort(); }, []);
  const simulationRouteRef = useRef<PlannedRoute | null>(null);
  const [simulationRoute, setSimulationRoute] = useState<PlannedRoute | null>(
    null,
  );
  const [simulationPoint, setSimulationPoint] = useState<Coordinate | null>(
    null,
  );
  const simulationPointRef = useRef<Coordinate | null>(null);
  const [simulationPlayback, setSimulationPlayback] = useState<NavigationPlayback | null>(null);
  const [navigationTestMessage, setNavigationTestMessage] = useState("");
  const simulationPanelRef = useRef<HTMLElement>(null);
  const guidanceRef = useRef<{
    route: PlannedRoute;
    geometry: RouteGeometry;
    progress: RouteProgress;
    cue: NavigationCue | null;
  } | null>(null);
  const [turnCue, setTurnCue] = useState<NavigationCue | null>(null);
  const arrivalRef = useRef<{ route: PlannedRoute; deadline: number } | null>(
    null,
  );
  const [arrival, setArrival] = useState<{
    route: PlannedRoute;
    deadline: number;
  } | null>(null);
  const lastTurnInstructionRef = useRef("");
  const updateNavigationCue = useCallback(
    (route: PlannedRoute, point: Coordinate): NavigationCue | null => {
      if (arrivalRef.current?.route === route) return guidanceRef.current?.cue ?? null;
      const previous =
        guidanceRef.current?.route === route
          ? guidanceRef.current.progress
          : {
              distanceKm: 0,
              fraction: 0,
              position: route.points[0],
              acceptedPosition: route.points[0],
              distanceFromRouteM: 0,
            };
      const geometry =
        guidanceRef.current?.route === route
          ? guidanceRef.current.geometry
          : prepareRouteGeometry(route.points);
      const progress = advanceRouteProgress(geometry, point, previous);
      const cue = hasReachedRouteDestination(route, point)
        ? { instruction: "You have arrived at your destination.", symbol: "arrive" as const, distanceMeters: 0 }
        : navigationCue(route, progress);
      guidanceRef.current = { route, geometry, progress, cue };
      if (
        cue?.symbol === "arrive" &&
        cue.distanceMeters <= 10 &&
        arrivalRef.current?.route !== route
      ) {
        rerouteControllerRef.current?.abort();
        rerouteControllerRef.current = null;
        setNavigationRequestPending(false);
        setNavigationMessage("");
        const reached = { route, deadline: Date.now() + 10_000 };
        arrivalRef.current = reached;
        setArrival(reached);
      }
      if (document.visibilityState === "visible")
        setTurnCue((current) =>
          current?.instruction === cue?.instruction &&
          current?.symbol === cue?.symbol &&
          current?.distanceMeters === cue?.distanceMeters
            ? current
            : cue,
        );
      return cue;
    },
    [],
  );
  const [routePlannerOpen, setRoutePlannerOpen] = useState(false);
  const [routePanelHeight, setRoutePanelHeight] = useState(0);
  const [routeDestination, setRouteDestination] =
    useState<RouteDestination | null>(null);
  useEffect(() => {
    rerouteControllerRef.current?.abort();
    rerouteControllerRef.current = null;
    setNavigationRequestPending(false);
    nextRerouteAtRef.current = 0;
    setNavigationMessage("");
    setActiveNavigationRoute(null);
    plannedJourneyRouteRef.current = null;
    simulationRouteRef.current = null;
    setSimulationRoute(null);
    setSimulationPlayback(null);
    simulationPointRef.current = null;
    setSimulationPoint(null);
    guidanceRef.current = null;
    arrivalRef.current = null;
    setArrival(null);
    setTurnCue(null);
    setRoutePlannerOpen(false);
    setRouteDestination(null);
  }, [accountUserId]);
  const [favoritePlaces, setFavoritePlaces] = useState<FavoritePlace[]>([]);
  const [selectedFavoritePlaceId, setSelectedFavoritePlaceId] = useState<
    string | null
  >(null);
  const [favoritePlacementActive, setFavoritePlacementActive] = useState(false);
  const [highlightedRoutePoints, setHighlightedRoutePoints] = useState<
    Coordinate[]
  >([]);
  const [favoriteDraft, setFavoriteDraft] = useState<FavoritePlace | null>(
    null,
  );
  const [favoriteEditorMode, setFavoriteEditorMode] = useState<"view" | "edit">(
    "view",
  );
  const [keyboardInset, setKeyboardInset] = useState(0);
  const topbarRef = useRef<HTMLElement>(null);
  const mapActionsRef = useRef<HTMLElement>(null);
  const [compactMapActions, setCompactMapActions] = useState(false);
  useLayoutEffect(() => {
    const topbar = topbarRef.current;
    const actions = mapActionsRef.current;
    if (!routePlannerOpen || !topbar || !actions) return;
    const measure = (): void => {
      const buttons = Array.from(actions.children);
      const columnHeight =
        buttons.reduce(
          (height, button) => height + button.getBoundingClientRect().height,
          0,
        ) +
        Math.max(0, buttons.length - 1) * 8;
      const availableHeight =
        actions.getBoundingClientRect().bottom -
        topbar.getBoundingClientRect().bottom -
        12;
      setCompactMapActions(columnHeight > availableHeight);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(topbar);
    observer.observe(actions);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [routePlannerOpen, routePanelHeight, keyboardInset]);
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
  const [discoveryProgress, setDiscoveryProgress] = useState<
    Omit<DiscoveryProgressResponse, "kind" | "generation">
  >({
    discoveryDistance: 0,
    travelledDistance: 0,
    walkingStats: emptyWalkingStats(),
    todayDiscoveryDistance: 0,
    todayTravelledDistance: 0,
    todayActiveTimeMs: 0,
    weekDiscoveryDistance: 0,
    weekActiveTimeMs: 0,
    weekDiscoveryDeltaDistance: 0,
    weekActiveDeltaTimeMs: 0,
    cityMetrics: [],
  });
  const [discoveryProgressReady, setDiscoveryProgressReady] = useState(false);
  const [achievementEvaluations, setAchievementEvaluations] = useState<
    AchievementEvaluation[]
  >([]);
  const discoveryMetricsGenerationRef = useRef(0);
  const [explorationSummary, setExplorationSummary] =
    useState<ExplorationSummary | null>(null);
  const [achievementCelebrations, setAchievementCelebrations] = useState<
    PersonalAchievementId[]
  >([]);
  const [walkFinalizing, setWalkFinalizing] = useState(false);
  const [journeySaveError, setJourneySaveError] = useState<string | null>(null);
  const journeyFinishedAtRef = useRef<number | null>(null);
  const [achievementTestPreview, setAchievementTestPreview] =
    useState<PersonalAchievementId | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const userMarkerRef = useRef<Marker | null>(null);
  const onUserMarkerChange = useCallback((marker: Marker | null): void => {
    userMarkerRef.current = marker;
  }, []);
  const fogLayerRef = useRef<DiscoveryFogLayer | null>(null);
  const trackerRef = useRef<LocationTracker | null>(null);
  const foregroundTrackerRef = useRef<LocationTracker | null>(null);
  const latestPassivePointRef = useRef<Coordinate | null>(null);
  const focusFirstTrackingPointRef = useRef(false);
  const reminderRef = useRef(new ExplorationReminder(0, 0, 5, "unmapped"));
  const inactivityReminderRef = useRef(new InactivityReminder(15));
  const inactivityDueAtRef = useRef<number | null>(null);
  const inactivityTimerRef = useRef<number | null>(null);
  const inactivityGenerationRef = useRef(0);
  const inactivityNotificationQueueRef = useRef<Promise<void>>(
    Promise.resolve(),
  );
  const achievementTestIndexRef = useRef(0);
  const earnedAchievementIdsRef = useRef<Set<PersonalAchievementId>>(new Set());
  const lastCityLookupRef = useRef<{ point: Coordinate; at: number } | null>(
    null,
  );
  const cityLookupAbortRef = useRef<AbortController | null>(null);
  const viewCityLookupAbortRef = useRef<AbortController | null>(null);
  const viewCityLookupGenerationRef = useRef(0);
  const lastPointRef = useRef<Coordinate | undefined>(undefined);
  const activeWalkRef = useRef<ActiveWalk | null>(null);
  const journeyActivityQueueRef = useRef<Promise<void>>(Promise.resolve());
  const lastJourneyActivityUpdateRef = useRef(0);
  const [requestedJourneyStopId, setRequestedJourneyStopId] = useState<
    string | null
  >(null);
  const [requestedJourneyControl, setRequestedJourneyControl] =
    useState<JourneyControlRequest | null>(null);
  const [journeyControlBusy, setJourneyControlBusy] = useState(false);
  const handledJourneyControlRef = useRef<JourneyControlRequest | null>(null);
  const controlMountedRef = useRef(true);
  useEffect(() => {
    controlMountedRef.current = true;
    return () => {
      controlMountedRef.current = false;
    };
  }, []);
  const widgetStopRef = useRef<JourneyStopRequest | null>(null);
  const trackingUserRef = useRef<string | null>(null);
  const pendingWalksRef = useRef<PendingWalk[]>([]);
  const walkUploadPromiseRef = useRef<Promise<void> | null>(null);
  const accountUserIdRef = useRef(accountUserId);
  accountUserIdRef.current = accountUserId;
  const pendingMorningWalkStartUserIdRef = useRef<string | null>(null);
  const [morningWalkStartRequest, setMorningWalkStartRequest] = useState(0);
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
  const resumeCenterFrameRef = useRef<number | null>(null);
  const followCameraFrameRef = useRef<number | null>(null);
  const followCameraTargetRef = useRef<Coordinate | null>(null);
  const followCameraBearingRef = useRef<number | null>(null);
  const followCameraTimestampRef = useRef<number | null>(null);
  const followCameraEnabledRef = useRef(true);
  const [followingUser, setFollowingUser] = useState(true);
  const compassHeadingRef = useRef<number | null>(null);
  const [mapOrientation, setMapOrientation] = useState<MapOrientation>("north-up");
  const mapOrientationRef = useRef<MapOrientation>("north-up");
  const [userCentered, setUserCentered] = useState(false);
  const userCenteredRef = useRef(false);
  const updateUserCentered = useCallback((centered: boolean): void => {
    if (userCenteredRef.current === centered) return;
    userCenteredRef.current = centered;
    setUserCentered(centered);
  }, []);
  const discoveryUiRefreshTimerRef = useRef<number | null>(null);
  const journeyAnimationRef = useRef<Animation | null>(null);
  const journeyExpandedRef = useRef(false);
  const journeyMilestonesScrollFrameRef = useRef<number | null>(null);
  const pendingMilestonesScrollRef = useRef(false);
  const initialMapFocusUserRef = useRef<string | null>(null);
  const suppressJourneyClickRef = useRef(false);
  const previewMapRef = useRef<MapLibreMap | null>(null);
  const cellsRef = useRef<DiscoveryCell[]>([]);
  const cellKeysRef = useRef<Set<string>>(new Set());
  const discoveryHistoryReadyRef = useRef(false);
  const pointsRef = useRef<Coordinate[]>([]);
  const deferredLocationUiRef = useRef(false);
  const centerOnNextPassivePointRef = useRef(false);
  const explorationStartRef = useRef<{
    cells: Set<string>;
    points: Coordinate[];
    discoveryDistance: number;
  } | null>(null);
  const stopFollowCameraAnimation = useCallback(() => {
    if (followCameraFrameRef.current !== null)
      cancelAnimationFrame(followCameraFrameRef.current);
    followCameraFrameRef.current = null;
    followCameraTargetRef.current = null;
    followCameraTimestampRef.current = null;
  }, []);
  const animateFollowCamera = useCallback((point: Coordinate) => {
    followCameraTargetRef.current = point;
    followCameraBearingRef.current = mapCameraBearing(mapOrientationRef.current, point, simulationRouteRef.current ? null : compassHeadingRef.current);
    if (
      !followCameraEnabledRef.current ||
      followCameraFrameRef.current !== null
    )
      return;
    const initialMap = mapRef.current;
    if (!initialMap || !cameraNeedsUpdate(initialMap.getCenter(), point, initialMap.getBearing(), followCameraBearingRef.current)) return;
    const animate = (timestamp: number): void => {
      const map = mapRef.current;
      const target = followCameraTargetRef.current;
      if (!map || !target || !followCameraEnabledRef.current || document.visibilityState !== "visible") {
        followCameraFrameRef.current = null;
        followCameraTimestampRef.current = null;
        return;
      }
      if (
        (simulationRouteRef.current || plannedJourneyRouteRef.current) &&
        map.isMoving()
      ) {
        followCameraFrameRef.current = requestAnimationFrame(animate);
        return;
      }
      const previousTimestamp = followCameraTimestampRef.current ?? timestamp;
      const elapsed = Math.min(50, Math.max(0, timestamp - previousTimestamp));
      followCameraTimestampRef.current = timestamp;
      const center = map.getCenter();
      const longitudeDelta = ((target.lng - center.lng + 540) % 360) - 180;
      const blend = 1 - Math.exp(-elapsed / 180);
      const plannedRoute =
        simulationRouteRef.current ?? plannedJourneyRouteRef.current;
      const targetBearing = followCameraBearingRef.current;
      const bearingDelta =
        targetBearing === null
          ? 0
          : ((targetBearing - map.getBearing() + 540) % 360) - 180;
      const next =
        targetBearing !== null
          ? navigationCameraStep(
              center,
              target,
              map.getBearing(),
              targetBearing,
              elapsed,
            )
          : {
              lng: center.lng + longitudeDelta * blend,
              lat: center.lat + (target.lat - center.lat) * blend,
              bearing: map.getBearing() + bearingDelta * blend,
            };
      map.jumpTo(
        {
          center: [next.lng, next.lat],
          ...(targetBearing === null ? {} : { bearing: next.bearing }),
          ...(plannedRoute
            ? { padding: { top: 0, bottom: 0, left: 0, right: 0 } }
            : {}),
        },
        {
          hecateFollowCamera: true,
          ...(plannedRoute ? { hecateNavigationPoint: next } : {}),
        },
      );
      if (
        distanceKm({ ...next, recordedAt: target.recordedAt }, target) <
          0.0005 &&
        Math.abs(bearingDelta) < 0.5
      ) {
        map.jumpTo(
          {
            center: [target.lng, target.lat],
            ...(targetBearing === null ? {} : { bearing: targetBearing }),
            ...(plannedRoute
              ? { padding: { top: 0, bottom: 0, left: 0, right: 0 } }
              : {}),
          },
          {
            hecateFollowCamera: true,
            ...(plannedRoute ? { hecateNavigationPoint: target } : {}),
          },
        );
        followCameraFrameRef.current = null;
        followCameraTimestampRef.current = null;
        return;
      }
      followCameraFrameRef.current = requestAnimationFrame(animate);
    };
    followCameraFrameRef.current = requestAnimationFrame(animate);
  }, []);
  const updateCameraHeading = useCallback((heading: number): void => {
    compassHeadingRef.current = heading;
    if (mapOrientationRef.current !== "heading-up" || !followCameraEnabledRef.current || simulationRouteRef.current || document.visibilityState !== "visible") return;
    const point = followCameraTargetRef.current ?? latestPassivePointRef.current;
    if (point) animateFollowCamera(point);
  }, [animateFollowCamera]);
  useEffect(() => {
    stopFollowCameraAnimation();
  }, [accountUserId, stopFollowCameraAnimation]);
  const suspendFollowCamera = useCallback(() => {
    const wasFollowing = followCameraEnabledRef.current;
    followCameraEnabledRef.current = false;
    focusFirstTrackingPointRef.current = false;
    setFollowingUser(false);
    if (resumeCenterFrameRef.current !== null) cancelAnimationFrame(resumeCenterFrameRef.current);
    resumeCenterFrameRef.current = null;
    stopFollowCameraAnimation();
    if (wasFollowing) mapRef.current?.stop();
    viewCityLookupGenerationRef.current += 1;
  }, [stopFollowCameraAnimation]);
  const scheduleDiscoveryUiRefresh = useCallback(() => {
    if (discoveryUiRefreshTimerRef.current !== null) return;
    discoveryUiRefreshTimerRef.current = window.setTimeout(() => {
      discoveryUiRefreshTimerRef.current = null;
      setPoints([...pointsRef.current]);
    }, 3_000);
  }, []);
  const flushDiscoveryUiRefresh = useCallback(() => {
    if (discoveryUiRefreshTimerRef.current !== null)
      window.clearTimeout(discoveryUiRefreshTimerRef.current);
    discoveryUiRefreshTimerRef.current = null;
    setPoints([...pointsRef.current]);
  }, []);
  const centerMapOnPoint = useCallback(
    (point: Coordinate) => {
      const route =
        simulationRouteRef.current ?? plannedJourneyRouteRef.current;
      if (route && guidanceRef.current?.route === route)
        setTurnCue(guidanceRef.current.cue);
      if (!followCameraEnabledRef.current) return;
      const displayPoint = simulationRouteRef.current ? simulationPointRef.current ?? point : point;
      stopFollowCameraAnimation();
      setViewCenter({ lng: displayPoint.lng, lat: displayPoint.lat });
      setViewedCity(null);
      if (resumeCenterFrameRef.current !== null)
        cancelAnimationFrame(resumeCenterFrameRef.current);
      resumeCenterFrameRef.current = requestAnimationFrame(() => {
        const map = mapRef.current;
        if (!map) {
          resumeCenterFrameRef.current = null;
          return;
        }
        map.resize();
        resumeCenterFrameRef.current = requestAnimationFrame(() => {
          resumeCenterFrameRef.current = null;
          map.stop();
          userMarkerRef.current?.setLngLat(displayPoint);
          map.jumpTo(
            {
              center: [displayPoint.lng, displayPoint.lat],
              bearing: mapCameraBearing(mapOrientationRef.current, displayPoint, simulationRouteRef.current ? null : compassHeadingRef.current) ?? map.getBearing(),
            },
            { hecateFollowCamera: true, hecateNavigationPoint: displayPoint },
          );
        });
      });
    },
    [stopFollowCameraAnimation],
  );
  // A cell is a revealed area, not a piece of route. The saved walks preserve
  // the real route boundaries, then this function credits only portions that
  // unlock new cells.
  const discoveryDistance = discoveryProgress.discoveryDistance;
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

  const summaryCityProgress = summaryCity
    ? (discoveryProgress.cityMetrics.find(
        ({ cityId }) => cityId === summaryCity.id,
      ) ?? null)
    : null;
  const currentCityDistance =
    summaryCityProgress?.distance ?? discoveryDistance;
  const currentCityMilestone = cityMilestoneProgress(currentCityDistance);
  const currentCityMilestoneRemaining = currentCityMilestone.next
    ? Math.max(0, currentCityMilestone.next.thresholdKm - currentCityDistance)
    : 0;
  const currentCityMilestoneLevel = currentCityMilestone.next
    ? currentCityMilestone.next.level - 1
    : 3;
  const summaryCityPercentage = summaryCityProgress?.percentage ?? null;
  const discoveryLabel = accountUserId
    ? formatDiscoveryPercentage(
        summaryCityPercentage,
        viewCityLoading && !summaryCity,
      )
    : "—";
  const activeWalkDistance = routeDistanceKm(
    activeWalkRef.current?.points ?? [],
  );
  const activeWalkElapsedMs = activeWalkRef.current
    ? Math.max(0, elapsedNow - activeWalkRef.current.startedAt)
    : 0;
  const showActiveJourneyMetrics = tracking === "tracking";
  const displayedDistanceCounter = journeyDistanceCounter(activeWalkDistance);
  const activeWalkNewGroundMeters = useMemo(() => {
    const started = explorationStartRef.current;
    return tracking === "tracking" && started
      ? journeyNewGroundMeters(points, started.discoveryDistance)
      : 0;
  }, [points, tracking]);
  const displayedNewGroundCounter = journeyNewGroundCounter(
    activeWalkNewGroundMeters,
  );
  const displayedTimeCounter = journeyTimeCounter(activeWalkElapsedMs);
  const nativeApp = isNativeApp();
  const devToolsEnabled = DEV_TOOLS_ENABLED;

  const enqueueJourneyActivity = useCallback(
    (operation: () => Promise<void>): void => {
      if (!Capacitor.isNativePlatform()) return;
      journeyActivityQueueRef.current = journeyActivityQueueRef.current
        .then(operation)
        .catch((error: Error) => {
          console.warn("Could not synchronize journey Live Activity", {
            error,
          });
        });
    },
    [],
  );

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    enqueueJourneyActivity(() =>
      JourneyActivity.setAppearance({ preference: appearancePreference, theme: appearanceTheme }),
    );
  }, [appearancePreference, appearanceTheme, enqueueJourneyActivity]);

  useEffect(() => {
    if (!authReady || discoveryLoading) return;
    if (!accountUserId) {
      enqueueJourneyActivity(() => JourneyActivity.clear());
      return;
    }
    const walkId =
      trackingUserRef.current === accountUserId
        ? (activeWalkRef.current?.id ?? null)
        : null;
    enqueueJourneyActivity(() =>
      JourneyActivity.reconcile({ ownerId: accountUserId, walkId }),
    );
  }, [accountUserId, authReady, discoveryLoading, tracking]);

  useEffect(() => {
    if (Capacitor.getPlatform() !== "ios") return;
    let active = true;
    const handleUrl = (value: string): void => {
      if (!active) return;
      if (value === "hecate://feedback") {
        setFeedbackOpen(true);
        return;
      }
      const action = journeyActionFromUrl(value);
      if (!action) return;
      if (action.action === "stop") setRequestedJourneyStopId(action.walkId);
    };
    const listener = CapacitorApp.addListener("appUrlOpen", ({ url }) =>
      handleUrl(url),
    );
    void CapacitorApp.getLaunchUrl()
      .then((result) => {
        if (result) handleUrl(result.url);
      })
      .catch((error: Error) =>
        console.warn("Could not read journey launch URL", { error }),
      );
    return () => {
      active = false;
      void listener.then((handle) => handle.remove());
    };
  }, []);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const listener = JourneyActivity.addListener("stopRequested", (request) => {
      if (
        request.ownerId !== accountUserIdRef.current ||
        request.walkId !== activeWalkRef.current?.id
      )
        return;
      widgetStopRef.current = request;
      setRequestedJourneyStopId(request.walkId);
    });
    return () => {
      void listener.then((handle) => handle.remove());
    };
  }, []);

  useEffect(() => {
    if (Capacitor.getPlatform() !== "ios") return;
    let active = true;
    let subscription: { remove: () => Promise<void> } | undefined;
    const load = async (): Promise<void> => {
      try {
        const result = await JourneyActivity.getControlRequest();
        const request = parseJourneyControlRequest(result.request);
        if (
          !active ||
          !request ||
          (handledJourneyControlRef.current &&
            request.requestedAt <= handledJourneyControlRef.current.requestedAt)
        )
          return;
        setRequestedJourneyControl((current) =>
          current && current.requestedAt > request.requestedAt
            ? current
            : request,
        );
      } catch (error) {
        if (!active) return;
        console.error("Could not read iOS journey control", { error });
        setJourneyStopMessage(
          error instanceof Error
            ? error.message
            : "Could not read the iOS journey control request.",
        );
      }
    };
    // Read the persisted request after registration so cold-launch taps cannot fall between the two.
    void JourneyActivity.addListener("controlRequested", () => {
      void load();
    })
      .then((handle) => {
        if (!active) {
          void handle.remove();
          return;
        }
        subscription = handle;
        void load();
      })
      .catch((error) => {
        if (!active) return;
        console.error("Could not register iOS journey control", { error });
        setJourneyStopMessage(
          error instanceof Error
            ? error.message
            : "Could not connect the iOS journey control.",
        );
      });
    return () => {
      active = false;
      void subscription?.remove();
    };
  }, []);

  useEffect(() => {
    const walk = activeWalkRef.current;
    if (
      !Capacitor.isNativePlatform() ||
      !accountUserId ||
      !walk ||
      !documentVisible
    )
      return;
    let active = true;
    void JourneyActivity.getStopRequest({
      ownerId: accountUserId,
      walkId: walk.id,
    })
      .then(({ request }) => {
        if (
          !active ||
          !request ||
          activeWalkRef.current?.id !== request.walkId ||
          accountUserIdRef.current !== request.ownerId
        )
          return;
        widgetStopRef.current = request;
        setRequestedJourneyStopId(request.walkId);
      })
      .catch((error: Error) =>
        console.error("Could not read widget journey stop", {
          error,
          walkId: walk.id,
        }),
      );
    return () => {
      active = false;
    };
  }, [accountUserId, documentVisible, tracking]);

  useEffect(() => {
    const walk = activeWalkRef.current;
    const started = explorationStartRef.current;
    if (tracking === "denied" || tracking === "unavailable") {
      enqueueJourneyActivity(() => JourneyActivity.clear());
      return;
    }
    if (
      !Capacitor.isNativePlatform() ||
      (Capacitor.getPlatform() === "ios" && !iosAppActive)
    )
      return;
    if (
      !accountUserId ||
      tracking !== "tracking" ||
      !walk ||
      !started ||
      trackingUserRef.current !== accountUserId
    )
      return;
    const snapshot = journeyActivitySnapshot(
      walk,
      started.discoveryDistance,
      pointsRef.current,
    );
    enqueueJourneyActivity(async () => {
      if (
        activeWalkRef.current?.id !== snapshot.walkId ||
        trackingUserRef.current !== accountUserId
      )
        return;
      await JourneyActivity.start({
        ...snapshot,
        navigation: guidanceRef.current?.cue ?? null,
        ownerId: accountUserId,
      });
    });
  }, [accountUserId, tracking, iosAppActive]);

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
                  isExactNotification: false,
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
    setInactivityPrompt(false);
  }, [updateInactivitySchedule]);

  useEffect(() => {
    cellsRef.current = cells;
  }, [cells]);
  useEffect(() => {
    pointsRef.current = points;
  }, [points]);
  useEffect(() => {
    if (Capacitor.getPlatform() !== "ios") return;
    let active = true;
    let receivedStateChange = false;
    let subscription: { remove: () => Promise<void> } | undefined;
    // WebView visibility can precede native activation when launched from a Lock Screen control.
    void CapacitorApp.addListener("appStateChange", ({ isActive }) => {
      receivedStateChange = true;
      if (active) setIosAppActive(isActive);
    })
      .then(async (handle) => {
        if (!active) {
          await handle.remove();
          return;
        }
        subscription = handle;
        const state = await CapacitorApp.getState();
        if (active && !receivedStateChange) setIosAppActive(state.isActive);
      })
      .catch((error) => {
        console.error(
          "Could not observe iOS foreground state for journey Live Activities",
          { error },
        );
        if (active)
          setJourneyStopMessage(
            "Could not check whether Hecate is active. Reopen Hecate to start the journey Live Activity.",
          );
      });
    return () => {
      active = false;
      void subscription?.remove();
    };
  }, []);
  useEffect(() => {
    const updateDocumentVisibility = (): void =>
      setDocumentVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", updateDocumentVisibility);
    return () =>
      document.removeEventListener(
        "visibilitychange",
        updateDocumentVisibility,
      );
  }, []);
  useEffect(() => {
    if (tracking !== "tracking") {
      setElapsedNow(0);
      return;
    }
    const updateElapsedNow = (): void => {
      if (document.visibilityState === "visible") setElapsedNow(Date.now());
    };
    updateElapsedNow();
    const timer = window.setInterval(updateElapsedNow, 1_000);
    document.addEventListener("visibilitychange", updateElapsedNow);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", updateElapsedNow);
    };
  }, [tracking]);
  useEffect(
    () => () => {
      if (journeyDragFrameRef.current !== null)
        cancelAnimationFrame(journeyDragFrameRef.current);
      if (journeySettleFrameRef.current !== null)
        cancelAnimationFrame(journeySettleFrameRef.current);
      if (journeyMilestonesScrollFrameRef.current !== null)
        cancelAnimationFrame(journeyMilestonesScrollFrameRef.current);
      if (resumeCenterFrameRef.current !== null)
        cancelAnimationFrame(resumeCenterFrameRef.current);
      stopFollowCameraAnimation();
      if (discoveryUiRefreshTimerRef.current !== null)
        window.clearTimeout(discoveryUiRefreshTimerRef.current);
      journeyAnimationRef.current?.cancel();
    },
    [stopFollowCameraAnimation],
  );
  useEffect(() => {
    const card = journeyCardRef.current;
    if (!card || journeyAnimationRef.current) return;
    journeyExpandedRef.current = citiesExpanded;
    card.dataset.expanded = String(citiesExpanded);
  }, [citiesExpanded, isCityScale]);
  const progressCities = useMemo(() => {
    const unique = new Map(discoveredCities.map((city) => [city.id, city]));
    if (cityBoundary) unique.set(cityBoundary.id, cityBoundary);
    return [...unique.values()];
  }, [cityBoundary, discoveredCities]);
  useEffect(() => {
    setDiscoveryProgressReady(false);
    if (!accountUserId) {
      setDiscoveryProgress({
        discoveryDistance: 0,
        travelledDistance: 0,
        walkingStats: emptyWalkingStats(),
        todayDiscoveryDistance: 0,
        todayTravelledDistance: 0,
        todayActiveTimeMs: 0,
        weekDiscoveryDistance: 0,
        weekActiveTimeMs: 0,
        weekDiscoveryDeltaDistance: 0,
        weekActiveDeltaTimeMs: 0,
        cityMetrics: [],
      });
      return;
    }
    const cached = loadCachedDiscoveryProgress(accountUserId);
    if (cached) setDiscoveryProgress(cached);
  }, [accountUserId]);
  useEffect(() => {
    if (accountUserId && !discoveryHistoryReadyRef.current) return;
    const generation = discoveryMetricsGenerationRef.current + 1;
    discoveryMetricsGenerationRef.current = generation;
    setDiscoveryProgressReady(false);
    const cities = [...progressCities];
    if (summaryCity && !cities.some(({ id }) => id === summaryCity.id))
      cities.push(summaryCity);
    const worker = new Worker(
      new URL("./discoveryMetrics.worker.ts", import.meta.url),
      { type: "module" },
    );
    worker.addEventListener(
      "message",
      (event: MessageEvent<DiscoveryMetricsResponse>): void => {
        if (event.data.generation !== discoveryMetricsGenerationRef.current)
          return;
        if (event.data.kind === "progress") {
          const progress = {
            discoveryDistance: event.data.discoveryDistance,
            travelledDistance: event.data.travelledDistance,
            walkingStats: event.data.walkingStats,
            todayDiscoveryDistance: event.data.todayDiscoveryDistance,
            todayTravelledDistance: event.data.todayTravelledDistance,
            todayActiveTimeMs: event.data.todayActiveTimeMs,
            weekDiscoveryDistance: event.data.weekDiscoveryDistance,
            weekActiveTimeMs: event.data.weekActiveTimeMs,
            weekDiscoveryDeltaDistance: event.data.weekDiscoveryDeltaDistance,
            weekActiveDeltaTimeMs: event.data.weekActiveDeltaTimeMs,
            cityMetrics: event.data.cityMetrics,
          };
          setDiscoveryProgress(progress);
          if (accountUserId)
            saveCachedDiscoveryProgress(accountUserId, progress);
          setDiscoveryProgressReady(true);
          return;
        }
        setAchievementEvaluations(event.data.achievementEvaluations);
      },
    );
    worker.addEventListener("error", (event) => {
      console.error("Discovery metrics worker failed", {
        message: event.message,
        filename: event.filename,
        line: event.lineno,
        column: event.colno,
      });
    });
    const request: DiscoveryMetricsRequest = {
      generation,
      points,
      cells,
      cities,
      achievementCityIds: progressCities.map(({ id }) => id),
    };
    worker.postMessage(request);
    return () => worker.terminate();
  }, [accountUserId, cells, points, progressCities, summaryCity]);
  const cityProgresses = useMemo(() => {
    const metrics = new Map(
      discoveryProgress.cityMetrics.map((progress) => [
        progress.cityId,
        progress,
      ]),
    );
    return progressCities
      .flatMap((city) => {
        const progress = metrics.get(city.id);
        return progress ? [{ city, ...progress }] : [];
      })
      .sort(
        (a, b) =>
          b.percentage - a.percentage || a.city.name.localeCompare(b.city.name),
      );
  }, [discoveryProgress.cityMetrics, progressCities]);
  const activeCityProgress = activeCity
    ? cityProgresses.find(({ city }) => city.id === activeCity.id)
    : null;
  const accountCityProgress = useMemo(
    () =>
      activeCity && activeCityProgress
        ? {
            cityId: activeCity.id,
            cityName: activeCity.name,
            discoveredKm: activeCityProgress.distance,
          }
        : null,
    [activeCity, activeCityProgress],
  );
  const earnedAchievementIds = useMemo(
    () =>
      achievementEvaluations
        .filter(({ earned }) => earned)
        .map(({ definition }) => definition.id),
    [achievementEvaluations],
  );
  earnedAchievementIdsRef.current = new Set(earnedAchievementIds);
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
      tracking === "requesting" ||
      tracking === "tracking" ||
      walkFinalizing ||
      !documentVisible ||
      !discoveryHistoryReadyRef.current ||
      citiesLoadedUserId !== accountUserId
    )
      return;
    const localBeforeReconcile = loadAchievementUnlocks(accountUserId);
    const unlocks = reconcileAchievementUnlocks(
      accountUserId,
      earnedAchievementIds,
    );
    setAchievementCelebrations(
      confirmedPendingAchievementIds(unlocks.pending, earnedAchievementIds),
    );
    void syncAchievementUnlocks(
      accountUserId,
      earnedAchievementIds,
      localBeforeReconcile,
      unlocks.newlyEarned,
    )
      .then((synced) => {
        if (
          accountUserIdRef.current === accountUserId &&
          document.visibilityState === "visible" &&
          synced
        ) {
          const confirmedPending = confirmedPendingAchievementIds(
            synced.pending,
            earnedAchievementIds,
          );
          setAchievementCelebrations(confirmedPending);
        }
      })
      .catch((error) => {
        console.warn("Could not sync achievement unlocks", error);
      });
  }, [
    accountUserId,
    citiesLoadedUserId,
    documentVisible,
    earnedAchievementIds,
    nativeApp,
    tracking,
    walkFinalizing,
  ]);

  useEffect(() => {
    if (
      !accountUserId ||
      tracking === "requesting" ||
      tracking === "tracking" ||
      walkFinalizing ||
      !discoveryHistoryReadyRef.current ||
      citiesLoadedUserId !== accountUserId
    )
      return;
    const retry = () => {
      if (document.visibilityState !== "visible" || !navigator.onLine) return;
      const local = loadAchievementUnlocks(accountUserId);
      void syncAchievementUnlocks(
        accountUserId,
        earnedAchievementIds,
        local,
        [],
      )
        .then((synced) => {
          if (accountUserIdRef.current === accountUserId && synced) {
            setAchievementCelebrations(
              confirmedPendingAchievementIds(
                synced.pending,
                earnedAchievementIds,
              ),
            );
          }
        })
        .catch(() => undefined);
    };
    window.addEventListener("online", retry);
    document.addEventListener("visibilitychange", retry);
    return () => {
      window.removeEventListener("online", retry);
      document.removeEventListener("visibilitychange", retry);
    };
  }, [
    accountUserId,
    citiesLoadedUserId,
    earnedAchievementIds,
    tracking,
    walkFinalizing,
  ]);

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
      setAccountUserEmail(data.session?.user.email ?? "");
      setAuthReady(true);
    });
    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      if (event === "SIGNED_OUT") setAppearancePreference("system");
      const nextUserId = session?.user.id ?? null;
      if (nextUserId !== accountUserIdRef.current)
        setDiscoveryLoading(Boolean(nextUserId));
      setAccountUserId(nextUserId);
      setAccountUserEmail(session?.user.email ?? "");
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
    const refreshPermission = (): void => {
      if (document.visibilityState !== "visible") return;
      if (nativeApp) {
        void readLocationAuthorization()
          .then((status) => {
            if (active) setDiscoveryLocationAllowed(status === "always");
          })
          .catch((error) => {
            if (active) setDiscoveryLocationAllowed(false);
            console.warn("Could not refresh background location permission", {
              error,
            });
          });
      }
      setNotificationClock(Date.now());
      void LocalNotifications.checkPermissions()
        .then((permission) => {
          if (active)
            setNotificationPermissionReady(permission.display === "granted");
        })
        .catch((error) =>
          console.warn("Could not refresh notification permission", { error }),
        );
    };
    refreshPermission();
    document.addEventListener("visibilitychange", refreshPermission);
    const appListener = CapacitorApp.addListener(
      "appStateChange",
      ({ isActive }) => {
        if (isActive) refreshPermission();
      },
    );
    const clockTimer = window.setInterval(refreshPermission, 60_000);
    return () => {
      active = false;
      document.removeEventListener("visibilitychange", refreshPermission);
      window.clearInterval(clockTimer);
      void appListener.then((handle) => handle.remove());
    };
  }, [nativeApp]);

  useEffect(() => {
    if (!pendingSpeedStopReport || !authReady) return;
    if (pendingSpeedStopReport.userId !== accountUserId) {
      setJourneyStopMessage(
        "Sign in to the account associated with this journey to report the incorrect speed stop.",
      );
      setSyncOpen(true);
      return;
    }
    setPendingSpeedStopReport(null);
    void openJourneySpeedStopReport(AppLauncher, pendingSpeedStopReport).catch(
      (error: Error) => {
        console.error("Could not open journey speed-stop report", {
          walkId: pendingSpeedStopReport.walkId,
          error,
        });
        if (accountUserIdRef.current === pendingSpeedStopReport.userId) {
          setJourneyStopMessage(
            `Could not open your email app. Contact supporthecate@gmail.com and include journey ID ${pendingSpeedStopReport.walkId}.`,
          );
        }
      },
    );
  }, [pendingSpeedStopReport, authReady, accountUserId]);

  useEffect(() => {
    const preference = accountUserId
      ? loadReminderPreference(accountUserId)
      : { enabled: false, promptedAt: 0, pausedUntil: 0 };
    reminderRef.current = new ExplorationReminder(
      preference.promptedAt,
      preference.pausedUntil,
      activityNotificationPreferences.discoveryReminderMinutes,
      activityNotificationPreferences.discoveredAreaReminders
        ? "all"
        : "unmapped",
    );
    const enabled =
      preference.enabled &&
      notificationPermissionReady === true &&
      discoveryLocationAllowed &&
      reminderMotionAllowed === true;
    setReminderEnabled(enabled);
    reminderEnabledRef.current = enabled;
    if (!enabled) resetInactivityReminder();
    setReminderPrompt(null);
  }, [
    accountUserId,
    notificationPermissionReady,
    discoveryLocationAllowed,
    reminderMotionAllowed,
    resetInactivityReminder,
    activityNotificationPreferences.discoveryReminderMinutes,
    activityNotificationPreferences.discoveredAreaReminders,
  ]);

  useEffect(() => {
    resetInactivityReminder();
    inactivityReminderRef.current = new InactivityReminder(
      activityNotificationPreferences.inactivityReminderMinutes,
    );
  }, [
    accountUserId,
    activityNotificationPreferences.inactivityReminderMinutes,
    resetInactivityReminder,
  ]);

  useEffect(() => {
    if (!accountUserId) {
      setActivityNotificationPreferences(
        defaultActivityNotificationPreferences(),
      );
      return;
    }
    setActivityNotificationPreferences(
      loadActivityNotificationPreferences(accountUserId),
    );
  }, [accountUserId]);

  useEffect(() => {
    if (
      !nativeApp ||
      !accountUserId ||
      notificationPermissionReady !== true ||
      hasSavedActivityNotificationPreferences(accountUserId)
    )
      return;
    const preferences = enabledActivityNotificationPreferences();
    setActivityNotificationPreferences(preferences);
    saveActivityNotificationPreferences(accountUserId, preferences);
  }, [accountUserId, nativeApp, notificationPermissionReady]);

  useEffect(() => {
    if (!nativeApp) return;
    const generation = ++activityNotificationGenerationRef.current;
    const preferences =
      accountUserId && notificationPermissionReady === true
        ? loadActivityNotificationPreferences(accountUserId)
        : defaultActivityNotificationPreferences();
    const journeys = discoveryJourneyMetrics(points);
    const now = Date.now();
    const stats = walkingStatsFromJourneys(journeys, now);
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    const todayDistance = journeys
      .filter((journey) => journey.finishedAt >= today.getTime())
      .reduce((total, journey) => total + journey.travelledKm, 0);
    const notifications: LocalNotificationSchema[] = [];
    if (preferences.morningInvite) {
      const [hour, minute] = preferences.dailyReminderTime
        .split(":")
        .map(Number);
      notifications.push({
        id: MORNING_INVITE_NOTIFICATION_ID,
        title: "Heading out today?",
        body: morningInviteMessage(
          citiesLoadedUserId === accountUserId &&
            discoveryHistoryReadyRef.current
            ? discoveryProgress.travelledDistance
            : null,
          citiesLoadedUserId === accountUserId &&
            discoveryHistoryReadyRef.current
            ? accountCityProgress
            : null,
        ),
        schedule: {
          on: { hour, minute, second: 0 },
          allowWhileIdle: false,
        },
        isExactNotification: false,
        actionTypeId: MORNING_INVITE_ACTION_TYPE_ID,
        extra: { kind: "morning-invite", userId: accountUserId },
      });
    }
    if (
      preferences.weeklyRecap &&
      citiesLoadedUserId === accountUserId &&
      discoveryHistoryReadyRef.current
    ) {
      notifications.push({
        id: WEEKLY_RECAP_NOTIFICATION_ID,
        title: "Your weekly walking summary",
        body: weeklyRecapFromPoints(points, now),
        schedule: {
          at: nextWeeklyRecapDate(now),
          allowWhileIdle: false,
        },
        isExactNotification: false,
        extra: { kind: "weekly-recap", userId: accountUserId },
      });
    }
    const streakDate = streakReminderDate(
      now,
      todayDistance,
      preferences.streakReminderTime,
    );
    if (
      preferences.streakReminder &&
      citiesLoadedUserId === accountUserId &&
      discoveryHistoryReadyRef.current &&
      stats.currentStreakDays > 0 &&
      streakDate
    ) {
      notifications.push({
        id: STREAK_REMINDER_NOTIFICATION_ID,
        title: "Your walking streak is at risk",
        body: streakReminderMessage(stats.currentStreakDays),
        schedule: {
          at: streakDate,
          allowWhileIdle: false,
        },
        isExactNotification: false,
        extra: { kind: "streak-reminder", userId: accountUserId },
      });
    }
    const update = async (): Promise<void> => {
      if (generation !== activityNotificationGenerationRef.current) return;
      const accountChanged =
        scheduledNotificationUserRef.current !== accountUserId;
      await registerNotificationActions(LocalNotifications);
      const ids = [
        MORNING_INVITE_NOTIFICATION_ID,
        WEEKLY_RECAP_NOTIFICATION_ID,
        STREAK_REMINDER_NOTIFICATION_ID,
        ...(!accountUserId ||
        accountChanged ||
        notificationPermissionReady === false
          ? [
              REMINDER_NOTIFICATION_ID,
              REMINDER_TEST_NOTIFICATION_ID,
              JOURNEY_SPEED_STOP_NOTIFICATION_ID,
              MORNING_INVITE_TEST_NOTIFICATION_ID,
              WEEKLY_RECAP_TEST_NOTIFICATION_ID,
              STREAK_REMINDER_TEST_NOTIFICATION_ID,
              ...Array.from(
                { length: PERSONAL_ACHIEVEMENTS.length + 1 },
                (_, index) => ACHIEVEMENT_NOTIFICATION_ID_START + index,
              ),
            ]
          : []),
      ];
      await replaceNotificationSchedules(
        LocalNotifications,
        ids,
        notifications,
        () => generation === activityNotificationGenerationRef.current,
      );
      scheduledNotificationUserRef.current = accountUserId;
    };
    activityNotificationQueueRef.current = activityNotificationQueueRef.current
      .catch((error) =>
        console.warn("Previous notification update failed", { error }),
      )
      .then(update)
      .catch((error) =>
        console.warn("Could not update activity notifications", { error }),
      );
    return () => {
      activityNotificationGenerationRef.current += 1;
    };
  }, [
    accountUserId,
    activityNotificationPreferences,
    discoveryProgress,
    accountCityProgress,
    nativeApp,
    notificationPermissionReady,
    notificationClock,
    points,
    citiesLoadedUserId,
  ]);

  useEffect(() => {
    if (!nativeApp) return;
    let disposed = false;
    let listener: { remove: () => Promise<void> } | undefined;
    // A recording is never resumed automatically after a fresh app launch.
    void LocalNotifications.cancel({
      notifications: [{ id: INACTIVITY_NOTIFICATION_ID }],
    }).catch(() => undefined);
    void LocalNotifications.addListener(
      "localNotificationActionPerformed",
      (event) => {
        if (event.notification.extra?.kind === "journey-speed-stop") {
          if (event.actionId === REPORT_JOURNEY_SPEED_STOP_ACTION_ID) {
            const { userId, walkId } = event.notification.extra;
            if (
              typeof userId !== "string" ||
              !userId.trim() ||
              typeof walkId !== "string" ||
              !walkId.trim()
            ) {
              setJourneyStopMessage(
                "This notification is missing its journey details. Contact supporthecate@gmail.com to report the incorrect speed stop.",
              );
              return;
            }
            setPendingSpeedStopReport({ userId, walkId });
            return;
          }
          if (
            typeof event.notification.extra.userId === "string" &&
            event.notification.extra.userId === accountUserIdRef.current &&
            trackingStateRef.current !== "tracking" &&
            trackingStateRef.current !== "requesting"
          ) {
            setJourneyStopMessage(JOURNEY_SPEED_STOP_MESSAGE);
          }
          return;
        }
        if (
          event.actionId === START_WALK_ACTION_ID &&
          event.notification.extra?.kind === "morning-invite" &&
          typeof event.notification.extra.userId === "string"
        ) {
          pendingMorningWalkStartUserIdRef.current =
            event.notification.extra.userId;
          setMorningWalkStartRequest((current) => current + 1);
          return;
        }
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
          if (
            !userId ||
            !earnedAchievementIdsRef.current.has(achievementId) ||
            !isAchievementUnlockPending(userId, achievementId)
          )
            return;
          setAchievementCelebrations((current) =>
            current.includes(achievementId)
              ? current
              : [achievementId, ...current],
          );
          return;
        }
        if (event.notification.id === INACTIVITY_NOTIFICATION_ID) {
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
    const activeWalkOwner = trackingUserRef.current;
    const activeWalk = activeWalkRef.current;
    if (activeWalkOwner && activeWalkOwner !== accountUserId) {
      const tracker = trackerRef.current;
      trackerRef.current = null;
      if (activeWalk) {
        saveWalkJournal(activeWalkOwner, pendingWalksRef.current, {
          ...activeWalk,
          finishedAt: Math.max(
            activeWalk.startedAt,
            activeWalk.points.at(-1)?.recordedAt ?? activeWalk.startedAt,
          ),
        });
      }
      activeWalkRef.current = null;
      trackingUserRef.current = null;
      focusFirstTrackingPointRef.current = false;
      resetInactivityReminder();
      setTracking("idle");
      setPassiveLocationStatus("idle");
      void Promise.resolve(tracker?.stop()).catch((error) => {
        console.error("Could not stop location tracking after account change", {
          error,
        });
      });
    }
    journeyFinishedAtRef.current = null;
    setJourneySaveError(null);
    setPoints([]);
    setCells([]);
    setDiscoveredCities([]);
    setCitiesLoadedUserId(null);
    setCitiesExpanded(false);
    setCoverageInfoOpen(false);
    setExplorationSummary(null);
    initialMapFocusUserRef.current = null;
    setDiscoveryLoading(Boolean(accountUserId));
    if (discoveryUiRefreshTimerRef.current !== null)
      window.clearTimeout(discoveryUiRefreshTimerRef.current);
    discoveryUiRefreshTimerRef.current = null;
    lastPointRef.current = undefined;
    cellsRef.current = [];
    cellKeysRef.current = new Set();
    discoveryHistoryReadyRef.current = false;
    pointsRef.current = [];
    const journal = accountUserId
      ? loadWalkJournalState(accountUserId)
      : { active: null, pending: [] };
    pendingWalksRef.current = journal.pending;
    deferredLocationUiRef.current = false;
    if (!accountUserId) return;

    if (journal.active) {
      activeWalkRef.current = {
        id: journal.active.id,
        startedAt: journal.active.startedAt,
        points: [...journal.active.points],
        achievementEligible: journal.active.achievementEligible,
      };
      trackingUserRef.current = accountUserId;
      lastPointRef.current = journal.active.points.at(-1);
      focusFirstTrackingPointRef.current = journal.active.points.length === 0;
      setElapsedNow(Date.now());
      setTracking("requesting");
    }
    const recoveredWalks = journal.active
      ? [...journal.pending, journal.active]
      : journal.pending;
    const recoveredPoints = recoveredWalks.flatMap((walk) => walk.points);
    const baselinePoints = journal.pending.flatMap((walk) => walk.points);
    const baselineCells = discoveryCellsFromPoints(baselinePoints);
    explorationStartRef.current = journal.active
      ? {
          cells: new Set(baselineCells.map(discoveryCellKey)),
          points: baselinePoints,
          discoveryDistance: discoveredDistanceKm(baselinePoints),
        }
      : null;
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
              activeWalkRef.current
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
          if (
            activeWalkRef.current &&
            trackingUserRef.current === accountUserId
          ) {
            const baseline = mergedPoints.filter(
              (point) => point.walkId !== activeWalkRef.current?.id,
            );
            const baselineDiscoveryCells = discoveryCellsFromPoints(baseline);
            explorationStartRef.current = {
              cells: new Set(baselineDiscoveryCells.map(discoveryCellKey)),
              points: baseline,
              discoveryDistance: discoveredDistanceKm(baseline),
            };
          }
          discoveryHistoryReadyRef.current = true;
          if (!activeWalkRef.current)
            lastPointRef.current = mergedPoints.at(-1);
          void flushPendingWalks(accountUserId);
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
          // Keep recording available offline. Upload/reconciliation remains
          // gated by discoveryHistoryReadyRef until a later retry succeeds.
          setDiscoveryLoading(false);
          retryTimer = window.setTimeout(loadRemote, 15_000);
        });
    loadRemote();
    return () => {
      active = false;
      if (retryTimer !== null) window.clearTimeout(retryTimer);
      if (finishFrame !== null) window.cancelAnimationFrame(finishFrame);
    };
  }, [accountUserId, resetInactivityReminder]);

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
          activeWalkRef.current
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
        if (cellsRef.current.length) {
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
    if (!accountUserId || cells.length === 0) return;
    const timer = window.setTimeout(
      () => syncDiscoveryCells(cells, accountUserId).catch(() => undefined),
      1200,
    );
    return () => window.clearTimeout(timer);
  }, [accountUserId, cells]);

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
      if (trackingStateRef.current === "tracking") setElapsedNow(Date.now());
      if (deferredLocationUiRef.current) {
        deferredLocationUiRef.current = false;
        flushDiscoveryUiRefresh();
        setCells([...cellsRef.current]);
      }
      const point = latestPassivePointRef.current ?? lastPointRef.current;
      if (!point) return;
      setCurrentPoint(point);
      centerMapOnPoint(point);
    };
    document.addEventListener("visibilitychange", flushBackgroundLocations);
    return () =>
      document.removeEventListener(
        "visibilitychange",
        flushBackgroundLocations,
      );
  }, [centerMapOnPoint, flushDiscoveryUiRefresh]);

  useEffect(() => {
    if (!nativeApp) return;
    let disposed = false;
    let wasActive = true;
    let listener: { remove: () => Promise<void> } | undefined;
    void CapacitorApp.addListener("appStateChange", (state) => {
      if (disposed) return;
      const resumed = state.isActive && !wasActive;
      wasActive = state.isActive;
      if (!resumed) return;
      if (trackingStateRef.current === "tracking") setElapsedNow(Date.now());
      centerOnNextPassivePointRef.current = true;
      const point = latestPassivePointRef.current ?? lastPointRef.current;
      if (point) {
        setCurrentPoint(point);
        centerMapOnPoint(point);
      }
      if (
        trackingStateRef.current !== "tracking" &&
        trackingStateRef.current !== "requesting"
      ) {
        setPassiveLocationRefreshGeneration((generation) => generation + 1);
      }
    })
      .then((handle) => {
        if (disposed) void handle.remove();
        else listener = handle;
      })
      .catch(() => undefined);
    return () => {
      disposed = true;
      if (listener) void listener.remove();
    };
  }, [centerMapOnPoint, nativeApp]);

  useEffect(() => {
    if (!nativeApp || !accountUserId || notificationPermissionReady !== true) return;
    let disposed = false;
    let requesting = false;
    const refreshMotionPermission = (): void => {
      if (disposed || requesting || document.visibilityState !== "visible") return;
      requesting = true;
      void readReminderMotionAuthorization().then(async (status) => {
        if (disposed) return;
        if (status === "notDetermined" && (!loadReminderPreference(accountUserId).enabled || !discoveryLocationAllowed)) {
          setReminderMotionAllowed(null);
          setReminderMotionError("");
          return;
        }
        const allowed = status === "notDetermined" ? await requestReminderMotionPermission() : status === "authorized";
        if (disposed) return;
        setReminderMotionAllowed(allowed);
        setReminderMotionError(allowed ? "" : status === "unavailable"
          ? "Motion detection isn’t available on this device."
          : `Allow ${reminderMotionPermissionLabel()} so Hecate can detect movement in the background and remind you to explore.`);
      }).catch((cause) => {
        if (disposed) return;
        setReminderMotionAllowed(false);
        const message = cause instanceof Error ? cause.message : `Could not check ${reminderMotionPermissionLabel()} permission.`;
        console.error("Could not enable motion-based discovery reminders", { cause });
        setReminderMotionError(message);
      }).finally(() => { requesting = false; });
    };
    refreshMotionPermission();
    document.addEventListener("visibilitychange", refreshMotionPermission);
    const listener = CapacitorApp.addListener("appStateChange", ({ isActive }) => {
      if (isActive) refreshMotionPermission();
    });
    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", refreshMotionPermission);
      void listener.then((handle) => handle.remove());
    };
  }, [accountUserId, notificationPermissionReady, discoveryLocationAllowed, nativeApp]);

  useEffect(() => {
    if (tracking === "requesting" || tracking === "tracking") return;
    const backgroundReminder =
      nativeApp &&
      reminderMotionAllowed === true &&
      reminderEnabled &&
      Boolean(accountUserId) &&
      notificationPermissionReady === true;
    let disposed = false;
    let nativeActive = !nativeApp;
    let nativeStateKnown = !nativeApp;
    let nativeStateRevision = 0;
    let trackerMode: "foreground" | "reminder" | null = null;
    let retryTimer: number | null = null;
    let acquisitionTimer: number | null = null;
    let wasForeground = nativeActive && document.visibilityState === "visible";
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
      nativeStateKnown ? passiveLocationMode(
        nativeActive && document.visibilityState === "visible",
        backgroundReminder,
      ) : null;
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
              if (!simulationRouteRef.current) animateFollowCamera(point);
              if (centerOnNextPassivePointRef.current) {
                centerOnNextPassivePointRef.current = false;
                centerMapOnPoint(point);
              }
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
              return;
            }
            const unmapped = isUnmappedArea(point, cellKeysRef.current);
            const kind = reminderRef.current.observe(point, unmapped);
            if (!kind) return;
            saveReminderPreference(
              accountUserId,
              true,
              reminderRef.current.promptedAt,
              reminderRef.current.pausedUntil,
            );
            if (nativeApp)
              void sendReminderNotification(
                accountUserId,
                reminderRef.current.durationMinutes,
                kind,
              ).catch((error) =>
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
      const foreground = mode === "foreground";
      const resumed = foreground && !wasForeground;
      wasForeground = foreground;
      if (mode === "foreground") {
        if (resumed) {
          centerOnNextPassivePointRef.current = true;
          stop();
        }
        if (
          latestPassivePointRef.current &&
          Date.now() - latestPassivePointRef.current.recordedAt <
            PASSIVE_LOCATION_MAX_AGE_MS
        ) {
          setCurrentPoint(latestPassivePointRef.current);
          if (resumed) centerMapOnPoint(latestPassivePointRef.current);
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
        nativeStateRevision += 1;
        nativeStateKnown = true;
        nativeActive = state.isActive;
        updateVisibility();
      })
        .then((listener) => {
          if (disposed) void listener.remove();
          else appStateListener = listener;
        })
        .catch((cause) => {
          console.error("Could not observe native app state for passive location", { cause });
          setPassiveLocationStatus("unavailable");
        });
      void CapacitorApp.getState().then((state) => {
        if (disposed || nativeStateRevision !== 0) return;
        nativeStateKnown = true;
        nativeActive = state.isActive;
        updateVisibility();
      }).catch((cause) => {
        console.error("Could not read native app state for passive location", { cause });
        if (!disposed) setPassiveLocationStatus("unavailable");
      });
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
    animateFollowCamera,
    centerMapOnPoint,
    devToolsEnabled,
    nativeApp,
    notificationPermissionReady,
    passiveLocationRefreshGeneration,
    reminderEnabled,
    reminderMotionAllowed,
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
    viewCityLookupGenerationRef.current += 1;
    const generation = viewCityLookupGenerationRef.current;
    viewCityLookupAbortRef.current?.abort();
    viewCityLookupAbortRef.current = null;
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
    viewCityLookupAbortRef.current = controller;
    // A map pan should settle before asking for an uncached city boundary.
    const timer = window.setTimeout(() => {
      if (viewCityLookupGenerationRef.current !== generation) return;
      void fetchCityBoundary(viewCenter, controller.signal)
        .then((city) => {
          if (
            !controller.signal.aborted &&
            viewCityLookupGenerationRef.current === generation
          )
            setViewedCity(city);
        })
        .catch((error) => {
          if (!controller.signal.aborted)
            console.warn("Map city lookup failed", error);
        })
        .finally(() => {
          if (
            !controller.signal.aborted &&
            viewCityLookupGenerationRef.current === generation
          )
            setViewCityLoading(false);
        });
    }, 500);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
      if (viewCityLookupAbortRef.current === controller)
        viewCityLookupAbortRef.current = null;
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
      !accountUserId ||
      citiesLoadedUserId !== accountUserId ||
      !discoveryProgressReady ||
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
    })();
    return () => {
      cancelled = true;
    };
  }, [
    accountUserId,
    cells,
    citiesLoadedUserId,
    discoveryProgressReady,
    points,
  ]);

  const onZoomChange = useCallback((nextZoom: number) => {
    setZoom((currentZoom) =>
      currentZoom >= 6 === nextZoom >= 6 ? currentZoom : nextZoom,
    );
  }, []);
  const onViewChange = useCallback((center: { lng: number; lat: number }) => {
    setViewCenter(center);
  }, []);

  const focusOnUserPoint = (point: Coordinate) => {
    followCameraEnabledRef.current = true;
    setFollowingUser(true);
    stopFollowCameraAnimation();
    setViewCenter({ lng: point.lng, lat: point.lat });
    const route = simulationRouteRef.current ?? plannedJourneyRouteRef.current;
    userMarkerRef.current?.setLngLat(point);
    mapRef.current?.flyTo(
      {
        center: [point.lng, point.lat],
        zoom: route ? 17 : 15,
        bearing: mapCameraBearing(mapOrientationRef.current, point, simulationRouteRef.current ? null : compassHeadingRef.current) ?? mapRef.current?.getBearing(),
        ...(route
          ? {
              padding: { top: 0, bottom: 0, left: 0, right: 0 },
            }
          : {}),
        duration: 1400,
        essential: true,
      },
      { hecateFollowCamera: true, hecateNavigationPoint: point },
    );
  };

  useEffect(() => {
    const focusIdentity = accountUserId ?? "__anonymous__";
    if (initialMapFocusUserRef.current === focusIdentity || !currentPoint || !followCameraEnabledRef.current)
      return;
    initialMapFocusUserRef.current = focusIdentity;
    const targetZoom = 14;
    setViewCenter({ lng: currentPoint.lng, lat: currentPoint.lat });
    setZoom(targetZoom);
    setViewedCity(null);
    mapRef.current?.jumpTo({
      center: [currentPoint.lng, currentPoint.lat],
      zoom: targetZoom,
      pitch: 0,
      bearing: 0,
    });
  }, [accountUserId, currentPoint]);

  const addPoint = (point: Coordinate) => {
    if (
      widgetStopRef.current &&
      widgetStopRef.current.walkId === activeWalkRef.current?.id
    )
      return;
    if (!isUsableGpsPoint(point)) {
      if (
        reminderEnabledRef.current &&
        trackingUserRef.current &&
        activeWalkRef.current
      ) {
        updateInactivitySchedule(
          inactivityReminderRef.current.observe(point, false, Date.now()),
        );
      }
      return;
    }
    latestPassivePointRef.current = point;
    const navigationRoute = plannedJourneyRouteRef.current;
    if (navigationRoute && !simulationRouteRef.current) {
      const cue = updateNavigationCue(navigationRoute, point);
      recalculateNavigation(navigationRoute, point);
      if (
        (cue?.instruction ?? "") !== lastTurnInstructionRef.current ||
        Date.now() - lastJourneyActivityUpdateRef.current >= 3000
      ) updateJourneyNavigation(cue);
    }
    if (focusFirstTrackingPointRef.current) {
      focusFirstTrackingPointRef.current = false;
      focusOnUserPoint(point);
    }
    const considerStopReminder = () => {
      if (
        !reminderEnabledRef.current ||
        !trackingUserRef.current ||
        !activeWalkRef.current
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
    if (appVisible) {
      setCurrentPoint(point);
      if (plannedJourneyRouteRef.current && !simulationRouteRef.current)
        animateFollowCamera(point);
      if (centerOnNextPassivePointRef.current) {
        centerOnNextPassivePointRef.current = false;
        centerMapOnPoint(point);
      }
    }
    if (!shouldRecordPoint(lastPointRef.current, point)) {
      considerStopReminder();
      return;
    }
    const recordedPoint = { ...point, walkId: activeWalkRef.current?.id };
    const previousRecordedPoint = lastPointRef.current ?? null;
    lastPointRef.current = recordedPoint;
    activeWalkRef.current?.points.push(recordedPoint);
    pointsRef.current.push(recordedPoint);
    fogLayerRef.current?.appendRoutePoint(previousRecordedPoint, recordedPoint);
    if (trackingUserRef.current && activeWalkRef.current) {
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
    const liveWalk = activeWalkRef.current;
    const liveStart = explorationStartRef.current;
    if (
      Capacitor.isNativePlatform() &&
      liveWalk &&
      liveStart &&
      Date.now() - lastJourneyActivityUpdateRef.current >= 10_000
    ) {
      lastJourneyActivityUpdateRef.current = Date.now();
      const snapshot = journeyActivitySnapshot(
        liveWalk,
        liveStart.discoveryDistance,
        pointsRef.current,
      );
      enqueueJourneyActivity(() =>
        JourneyActivity.update({
          ...snapshot,
          navigation: guidanceRef.current?.cue ?? null,
        }),
      );
    }
    // Check after adding this point to the map. A newly revealed spot also
    // qualifies if the recording then stays nearby for fifteen minutes.
    considerStopReminder();

    if (appVisible) {
      scheduleDiscoveryUiRefresh();
      if (discoveredNewCell) setCells([...cellsRef.current]);
      if (!plannedJourneyRouteRef.current && !simulationRouteRef.current)
        animateFollowCamera(recordedPoint);
    } else {
      // Native callbacks still record and persist the route in the background,
      // but React and MapLibre do not need to redraw for every GPS update.
      deferredLocationUiRef.current = true;
    }
  };

  const updateJourneyNavigation = useCallback((cue: NavigationCue | null): void => {
    const liveWalk = activeWalkRef.current;
    const liveStart = explorationStartRef.current;
    if (!Capacitor.isNativePlatform() || !liveWalk || !liveStart) return;
    lastTurnInstructionRef.current = cue?.instruction ?? "";
    lastJourneyActivityUpdateRef.current = Date.now();
    const snapshot = {
      ...journeyActivitySnapshot(liveWalk, liveStart.discoveryDistance, pointsRef.current),
      navigation: cue,
    };
    enqueueJourneyActivity(() => JourneyActivity.update(snapshot));
  }, [enqueueJourneyActivity]);

  const recalculateNavigation = useCallback((route: PlannedRoute, point: Coordinate): void => {
    if (arrivalRef.current || guidanceRef.current?.route !== route) return;
    const mode = navigationModeRef.current;
    const offRouteDistanceM = mode === "pedestrian" ? 20 : 50;
    if (guidanceRef.current.progress.distanceFromRouteM <= offRouteDistanceM) {
      rerouteControllerRef.current?.abort();
      rerouteControllerRef.current = null;
      setNavigationRequestPending(false);
      setNavigationMessage("");
      return;
    }
    if (rerouteControllerRef.current || Date.now() < nextRerouteAtRef.current) return;
    const controller = new AbortController();
    rerouteControllerRef.current = controller;
    setNavigationRequestPending(true);
    nextRerouteAtRef.current = Date.now() + 30_000;
    setNavigationMessage("Recalculating route…");
    const destination = route.points[route.points.length - 1];
    void calculateNavigationRoute(point, destination, cellsRef.current, mode, controller.signal)
      .then((plan) => {
        if (controller.signal.aborted || (simulationRouteRef.current ?? plannedJourneyRouteRef.current) !== route || arrivalRef.current) return;
        const replacement = plan.routes[0];
        const simulated = simulationRouteRef.current === route;
        if (simulated) {
          simulationRouteRef.current = replacement;
          setSimulationRoute(replacement);
          setSimulationPlayback(replacement);
        } else plannedJourneyRouteRef.current = replacement;
        setActiveNavigationRoute(replacement);
        setNavigationMessage("");
        const cue = updateNavigationCue(replacement, (simulated ? simulationPointRef.current : latestPassivePointRef.current) ?? point);
        if (!simulated) updateJourneyNavigation(cue);
      })
      .catch((cause) => {
        if (controller.signal.aborted) return;
        console.error("Could not recalculate navigation route", { origin: point, destination, mode, cause });
        setNavigationMessage(cause instanceof Error ? cause.message : "Could not recalculate the route. Check your connection.");
      })
      .finally(() => {
        if (rerouteControllerRef.current === controller) {
        rerouteControllerRef.current = null;
        setNavigationRequestPending(false);
      }
      });
  }, [updateJourneyNavigation, updateNavigationCue]);

  const previewNavigationFix = useCallback((point: Coordinate): void => {
    simulationPointRef.current = point;
    setSimulationPoint(point);
    const route = simulationRouteRef.current;
    if (route) {
      updateNavigationCue(route, point);
      recalculateNavigation(route, point);
    }
    animateFollowCamera(point);
  }, [animateFollowCamera, recalculateNavigation, updateNavigationCue]);

  const finishActiveWalk = async () => {
    resetInactivityReminder();
    stopFollowCameraAnimation();
    if (document.visibilityState === "visible") flushDiscoveryUiRefresh();
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
    const widgetStop =
      widgetStopRef.current?.walkId === active?.id
        ? widgetStopRef.current
        : null;
    const finishedAt = Math.max(
      active?.startedAt ?? 0,
      widgetStop?.finishedAt ?? journeyFinishedAtRef.current ?? Date.now(),
    );
    if (active && walkOwner) journeyFinishedAtRef.current = finishedAt;
    const liveStart = explorationStartRef.current;
    if (Capacitor.isNativePlatform() && active && liveStart) {
      const snapshot = journeyActivitySnapshot(
        active,
        liveStart.discoveryDistance,
        pointsRef.current,
      );
      enqueueJourneyActivity(() =>
        JourneyActivity.end({ ...snapshot, finishedAt }),
      );
    }
    if (active && walkOwner) {
      pendingWalksRef.current = completeWalkJournal(
        walkOwner,
        pendingWalksRef.current,
        { ...active, finishedAt },
      );
    }
    journeyFinishedAtRef.current = null;
    setJourneySaveError(null);
    activeWalkRef.current = null;
    trackingUserRef.current = null;
    if (active && walkOwner && active.points.length >= 2) {
      const started = explorationStartRef.current;
      const completed: PendingWalk = {
        ...active,
        finishedAt,
      };
      if (isAutomaticUpdatesEnabled()) {
        setAutomaticUpdatePending(walkOwner, true);
      }
      if (widgetStop) {
        enqueueJourneyActivity(() =>
          JourneyActivity.acknowledgeStop({
            ownerId: walkOwner,
            walkId: widgetStop.walkId,
          }),
        );
        widgetStopRef.current = null;
      }
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
        (walk) => walk.id === completed.id,
      );
      if (completedWalkSynced && discoverySynced) {
        await refreshLiveLeaderboard(walkOwner);
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
        // before and after this session.
        const finalPoint = active.points.at(-1);
        if (finalPoint) {
          void fetchCityBoundary(finalPoint)
            .then((city) => {
              const percentageAdded = Math.max(
                0,
                discoveredCityPercentage(completedCells, city) -
                  discoveredCityPercentage(previousCells, city),
              );
              setCityBoundary(city);
              setDiscoveredCities((current) =>
                current.some((saved) => saved.id === city.id)
                  ? current
                  : [...current, city],
              );
              void syncDiscoveredCity(city, walkOwner).catch(() => undefined);
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
      }
    } else if (active && walkOwner) {
      if (widgetStop) {
        enqueueJourneyActivity(() =>
          JourneyActivity.acknowledgeStop({
            ownerId: walkOwner,
            walkId: widgetStop.walkId,
          }),
        );
        widgetStopRef.current = null;
      }
    }
    explorationStartRef.current = null;
  };

  const clearRouteDestination = useCallback((): void => {
    guidanceRef.current = null;
    arrivalRef.current = null;
    setArrival(null);
    setTurnCue(null);
    lastTurnInstructionRef.current = "";
    const liveWalk = activeWalkRef.current;
    const liveStart = explorationStartRef.current;
    if (Capacitor.isNativePlatform() && liveWalk && liveStart) {
      const snapshot = {
        ...journeyActivitySnapshot(
          liveWalk,
          liveStart.discoveryDistance,
          pointsRef.current,
        ),
        navigation: null,
      };
      enqueueJourneyActivity(() => JourneyActivity.update(snapshot));
    }
    simulationRouteRef.current = null;
    setSimulationRoute(null);
    setSimulationPlayback(null);
    simulationPointRef.current = null;
    setSimulationPoint(null);
    stopFollowCameraAnimation();
    rerouteControllerRef.current?.abort();
    rerouteControllerRef.current = null;
    setNavigationRequestPending(false);
    nextRerouteAtRef.current = 0;
    setNavigationMessage("");
    setActiveNavigationRoute(null);
    plannedJourneyRouteRef.current = null;
    setRouteDestination(null);
    setNavigationTestMessage("");
    setSelectedFavoritePlaceId(null);
  }, [enqueueJourneyActivity, stopFollowCameraAnimation]);

  const clearPlannedRoute = useCallback((): void => {
    setRoutePlannerOpen(false);
    clearRouteDestination();
  }, [clearRouteDestination]);

  useEffect(() => {
    if (!arrival) return;
    const timer = window.setTimeout(
      () => {
        if (
          (simulationRouteRef.current ?? plannedJourneyRouteRef.current) ===
          arrival.route
        )
          clearPlannedRoute();
      },
      Math.max(0, arrival.deadline - Date.now()),
    );
    return () => window.clearTimeout(timer);
  }, [arrival, clearPlannedRoute]);

  const previewRouteRecalculation = async (): Promise<void> => {
    clearPlannedRoute();
    const controller = new AbortController();
    rerouteControllerRef.current = controller;
    setNavigationRequestPending(true);
    setNavigationTestMessage("Calculating sample route…");
    const origin = { lat: 41.3874, lng: 2.1686 };
    const destination = { lat: 41.4036, lng: 2.1744 };
    try {
      const plan = await calculateNavigationRoute(origin, destination, [], "pedestrian", controller.signal);
      if (controller.signal.aborted) return;
      const route = plan.routes[0];
      const playback = deviatingNavigationPlayback(route);
      navigationModeRef.current = "pedestrian";
      mapOrientationRef.current = "heading-up";
      setMapOrientation("heading-up");
      simulationRouteRef.current = route;
      setSimulationRoute(route);
      setSimulationPlayback(playback);
      setActiveNavigationRoute(route);
      setRouteDestination({ ...destination, name: "Mock navigation destination" });
      setNavigationTestMessage("");
      setDevToolsOpen(false);
      focusOnUserPoint({ ...route.points[0], recordedAt: Date.now() });
    } catch (cause) {
      if (controller.signal.aborted) return;
      console.error("Could not prepare route recalculation preview", { origin, destination, cause });
      setNavigationTestMessage(cause instanceof Error ? cause.message : "Could not calculate the sample route.");
    } finally {
      if (rerouteControllerRef.current === controller) {
        rerouteControllerRef.current = null;
        setNavigationRequestPending(false);
      }
    }
  };

  const finalizeRecordedWalk = (): void => {
    clearPlannedRoute();
    setWalkFinalizing(true);
    void finishActiveWalk()
      .catch((error) => {
        console.error("Could not finalize recorded walk", { error });
        if (
          activeWalkRef.current &&
          trackingUserRef.current === accountUserIdRef.current
        ) {
          setJourneySaveError(
            error instanceof Error
              ? error.message
              : "Could not save this journey. Keep Hecate open and retry saving.",
          );
        }
      })
      .finally(() => setWalkFinalizing(false));
  };

  const importGpxFile = async (file: File): Promise<GpxImportResult> => {
    const userId = accountUserIdRef.current;
    if (!userId) throw new Error("Sign in before importing a GPX file.");
    if (!discoveryHistoryReadyRef.current) {
      throw new Error("Wait for your discovery history to finish loading.");
    }
    if (trackingStateRef.current !== "idle" || activeWalkRef.current) {
      throw new Error(
        "Stop and save the current discovery before importing a GPX file.",
      );
    }
    if (file.size > 25 * 1024 * 1024) {
      throw new Error("The GPX file is larger than the 25 MB import limit.");
    }

    const xml = await file.text();
    const seed = await importedWalkIdSeed(userId, xml);
    const walks = parseGpx(xml, file.lastModified, (segmentIndex) =>
      importedWalkId(seed, segmentIndex),
    );
    const routes = storedWalkRoutes(pointsRef.current);
    const newWalks = walks.filter((walk) => !walkIsAlreadyStored(walk, routes));
    if (newWalks.length === 0) {
      return {
        tone: "info",
        message: "This route was already imported.",
      };
    }
    const compactWalks = newWalks.map((walk) => ({
      ...walk,
      points: compactImportedRoute(walk.points, 5),
    }));
    const importedPoints = compactWalks.flatMap((walk) =>
      walk.points.map((point) => ({ ...point, walkId: walk.id })),
    );
    const importedDiscoveryPoints = newWalks.flatMap((walk) => walk.points);
    const previousDistance = discoveredDistanceKm(pointsRef.current);
    const mergedPoints = mergeRoutePoints(pointsRef.current, importedPoints);
    const mergedCells = mergeDiscoveryCells(
      cellsRef.current,
      discoveryCellsFromPoints(importedDiscoveryPoints),
    );

    await persistImportedDiscovery(
      mergedCells,
      compactWalks,
      (cellsToSync) =>
        retryGpxImportOperation(
          () => syncDiscoveryCells(cellsToSync, userId),
          "Syncing imported discovery cells",
          file.name,
        ),
      (walkToSave) =>
        retryGpxImportOperation(
          () => saveCompletedWalk(walkToSave, userId),
          "Saving imported route",
          file.name,
        ),
    );
    if (accountUserIdRef.current !== userId) {
      throw new Error("The signed-in account changed during the GPX import.");
    }

    pointsRef.current = mergedPoints;
    cellsRef.current = mergedCells;
    cellKeysRef.current = new Set(mergedCells.map(discoveryCellKey));
    lastPointRef.current = mergedPoints.at(-1);
    setPoints(mergedPoints);
    setCells(mergedCells);
    await refreshLiveLeaderboard(userId);
    const addedKm = Math.max(
      0,
      discoveredDistanceKm(mergedPoints) - previousDistance,
    );
    const importedAt = Date.now();
    const baseTitle = file.name.replace(/\.gpx$/i, "").trim() || "GPX route";
    const importedRoutes = newWalks.map((walk, index) => ({
      id: walk.id,
      title:
        newWalks.length === 1
          ? baseTitle
          : `${baseTitle} · Segment ${index + 1}`,
      addedAt: importedAt,
      addedKm: routeDistanceKm(walk.points),
    }));
    return {
      tone: "success",
      message: `${newWalks.length === 1 ? "Route" : `${newWalks.length} routes`} imported · ${formatDistance(addedKm)} added.`,
      points: importedPoints,
      importedRoutes,
    };
  };

  const updateReminderEnabled = async (
    enabled: boolean,
  ): Promise<string | null> => {
    if (!accountUserId) return "Sign in before enabling discovery reminders.";
    if (enabled && !discoveryLocationAllowed)
      return "Allow background location for Hecate in device Settings to enable discovery reminders.";
    if (enabled && nativeApp) {
      try {
        const notificationAllowed = await ensureNotificationPermission();
        setNotificationPermissionReady(notificationAllowed);
        if (!notificationAllowed)
          return "Allow notifications in your device settings to enable discovery reminders.";
      } catch {
        return "Notifications are unavailable right now. Try again later.";
      }
    }
    if (enabled && nativeApp) {
      try {
        const allowed = await requestReminderMotionPermission();
        setReminderMotionAllowed(allowed);
        const message = allowed ? "" : `Allow ${reminderMotionPermissionLabel()} so Hecate can detect movement in the background and remind you to explore.`;
        setReminderMotionError(message);
        if (!allowed) return message;
      } catch (cause) {
        setReminderMotionAllowed(false);
        const message = cause instanceof Error ? cause.message : "Could not enable motion-based discovery reminders.";
        setReminderMotionError(message);
        return message;
      }
    }
    if (accountUserIdRef.current !== accountUserId)
      return "Your account changed. Reopen notification settings and try again.";
    setReminderEnabled(enabled);
    reminderEnabledRef.current = enabled;
    reminderRef.current.reset();
    if (!enabled) resetInactivityReminder();
    setReminderPrompt(null);
    saveReminderPreference(
      accountUserId,
      enabled,
      reminderRef.current.promptedAt,
      reminderRef.current.pausedUntil,
    );
    return null;
  };

  const updateActivityNotificationPreference = async (
    category: ActivityNotificationCategory,
    enabled: boolean,
  ): Promise<string | null> => {
    if (!accountUserId)
      return "Sign in before enabling activity notifications.";
    const preferencesHaveBeenSaved =
      hasSavedActivityNotificationPreferences(accountUserId);
    if (enabled && nativeApp) {
      const notificationAllowed = await ensureNotificationPermission();
      setNotificationPermissionReady(notificationAllowed);
      if (!notificationAllowed)
        return "Allow notifications in your device settings to enable this.";
    }
    if (accountUserIdRef.current !== accountUserId)
      return "Your account changed. Reopen notification settings and try again.";
    if (enabled && !preferencesHaveBeenSaved) {
      const initialPreferences = enabledActivityNotificationPreferences();
      setActivityNotificationPreferences(initialPreferences);
      saveActivityNotificationPreferences(accountUserId, initialPreferences);
      return null;
    }
    const next = { ...activityNotificationPreferences, [category]: enabled };
    setActivityNotificationPreferences(next);
    saveActivityNotificationPreferences(accountUserId, next);
    return null;
  };

  const updateDiscoveredAreaReminders = (enabled: boolean): string | null => {
    if (!accountUserId) return "Sign in before changing journey reminders.";
    const next = {
      ...activityNotificationPreferences,
      discoveredAreaReminders: enabled,
    };
    try {
      saveActivityNotificationPreferences(accountUserId, next);
    } catch (error) {
      console.error("Could not save discovered-area reminder preference", {
        accountUserId,
        enabled,
        error,
      });
      return "Could not save your reminder preference. Try again.";
    }
    setActivityNotificationPreferences(next);
    return null;
  };

  const updateReminderTime = (
    field: "streakReminderTime" | "dailyReminderTime",
    time: string,
  ): string | null => {
    if (!accountUserId) return "Sign in before changing the reminder time.";
    if (!isReminderTime(time)) return "Choose a valid reminder time.";
    const next = { ...activityNotificationPreferences, [field]: time };
    try {
      saveActivityNotificationPreferences(accountUserId, next);
    } catch (error) {
      console.error("Could not save reminder time", {
        accountUserId,
        field,
        time,
        error,
      });
      return "Could not save your reminder time. Try again.";
    }
    setActivityNotificationPreferences(next);
    return null;
  };

  const updateReminderDuration = (
    field: "discoveryReminderMinutes" | "inactivityReminderMinutes",
    minutes: number,
  ): string | null => {
    if (!accountUserId) return "Sign in before changing reminder durations.";
    const options =
      field === "discoveryReminderMinutes"
        ? DISCOVERY_REMINDER_DURATIONS
        : INACTIVITY_REMINDER_DURATIONS;
    if (!options.includes(minutes))
      return "Choose one of the available reminder durations.";
    const next = { ...activityNotificationPreferences, [field]: minutes };
    try {
      saveActivityNotificationPreferences(accountUserId, next);
    } catch (error) {
      console.error("Could not save reminder duration", {
        accountUserId,
        field,
        minutes,
        error,
      });
      return "Could not save your reminder duration. Try again.";
    }
    setActivityNotificationPreferences(next);
    return null;
  };

  const updateAllNotifications = async (
    enabled: boolean,
  ): Promise<string | null> => {
    if (!accountUserId) return "Sign in before changing notifications.";
    if (enabled && nativeApp) {
      try {
        const notificationAllowed = await ensureNotificationPermission();
        setNotificationPermissionReady(notificationAllowed);
        if (!notificationAllowed)
          return "Allow notifications in your device settings to enable this.";
      } catch {
        return "Notifications are unavailable right now. Try again later.";
      }
    }
    if (accountUserIdRef.current !== accountUserId)
      return "Your account changed. Reopen notification settings and try again.";
    const nextActivityPreferences = {
      ...(enabled
        ? enabledActivityNotificationPreferences()
        : defaultActivityNotificationPreferences()),
      streakReminderTime: activityNotificationPreferences.streakReminderTime,
      dailyReminderTime: activityNotificationPreferences.dailyReminderTime,
      discoveryReminderMinutes:
        activityNotificationPreferences.discoveryReminderMinutes,
      inactivityReminderMinutes:
        activityNotificationPreferences.inactivityReminderMinutes,
      discoveredAreaReminders:
        activityNotificationPreferences.discoveredAreaReminders,
    };
    let motionAllowed = reminderMotionAllowed;
    if (enabled && motionAllowed === null && discoveryLocationAllowed) {
      try {
        motionAllowed = await requestReminderMotionPermission();
        setReminderMotionAllowed(motionAllowed);
        setReminderMotionError(motionAllowed ? "" : `Allow ${reminderMotionPermissionLabel()} so Hecate can detect movement in the background and remind you to explore.`);
      } catch (cause) {
        motionAllowed = false;
        setReminderMotionAllowed(false);
        setReminderMotionError(cause instanceof Error ? cause.message : `Could not check ${reminderMotionPermissionLabel()} permission.`);
      }
    }
    if (accountUserIdRef.current !== accountUserId)
      return "Your account changed. Reopen notification settings and try again.";
    const remindersActive = enabled && discoveryLocationAllowed && motionAllowed === true;
    setReminderEnabled(remindersActive);
    reminderEnabledRef.current = remindersActive;
    reminderRef.current.reset();
    if (!remindersActive) resetInactivityReminder();
    setReminderPrompt(null);
    saveReminderPreference(
      accountUserId,
      enabled,
      reminderRef.current.promptedAt,
      reminderRef.current.pausedUntil,
    );
    setActivityNotificationPreferences(nextActivityPreferences);
    saveActivityNotificationPreferences(accountUserId, nextActivityPreferences);
    return null;
  };

  const scheduleActivityNotificationTest = async (
    notification: LocalNotificationSchema,
    notificationName: string,
  ): Promise<void> => {
    if (!nativeApp) {
      setActivityNotificationTestMessage(
        `${notificationName} is only available in the native app.`,
      );
      return;
    }
    if (!accountUserId) {
      setActivityNotificationTestMessage(
        `Sign in before testing ${notificationName.toLowerCase()}.`,
      );
      return;
    }
    try {
      if (!(await ensureNotificationPermission())) {
        setActivityNotificationTestMessage(
          "Allow notifications in your device settings, then try again.",
        );
        return;
      }
      await registerNotificationActions(LocalNotifications);
      await LocalNotifications.schedule({
        notifications: [
          {
            ...notification,
            isExactNotification: false,
            schedule: { at: new Date(Date.now() + 5_000) },
          },
        ],
      });
      setActivityNotificationTestMessage(
        `${notificationName} will appear in 5 seconds.`,
      );
    } catch (error) {
      console.warn("Could not schedule activity notification test", {
        notificationName,
        error,
      });
      setActivityNotificationTestMessage(
        `Could not schedule ${notificationName.toLowerCase()}.`,
      );
    }
  };

  const testMorningInviteNotification = async (): Promise<void> => {
    await scheduleActivityNotificationTest(
      {
        id: MORNING_INVITE_TEST_NOTIFICATION_ID,
        title: "Heading out today?",
        body: morningInviteMessage(
          citiesLoadedUserId === accountUserId &&
            discoveryHistoryReadyRef.current
            ? discoveryProgress.travelledDistance
            : null,
          citiesLoadedUserId === accountUserId &&
            discoveryHistoryReadyRef.current
            ? accountCityProgress
            : null,
        ),
        schedule: { at: new Date(Date.now() + 5_000) },
        actionTypeId: MORNING_INVITE_ACTION_TYPE_ID,
        extra: { kind: "morning-invite", userId: accountUserId },
      },
      "Daily walking reminder",
    );
  };

  const testUnmappedAreaNotification = async (): Promise<void> => {
    await scheduleActivityNotificationTest(
      {
        id: REMINDER_TEST_NOTIFICATION_ID,
        title: "Ready to record your journey?",
        body: reminderMessage(
          activityNotificationPreferences.discoveryReminderMinutes,
        ),
        schedule: { at: new Date(Date.now() + 5_000) },
        extra: { kind: "test-unmapped", userId: accountUserId },
      },
      "Unmapped area reminder",
    );
  };

  const testWeeklyRecapNotification = async (): Promise<void> => {
    await scheduleActivityNotificationTest(
      {
        id: WEEKLY_RECAP_TEST_NOTIFICATION_ID,
        title: "Your weekly walking summary",
        body: weeklyRecapFromPoints(points, Date.now()),
        schedule: { at: new Date(Date.now() + 5_000) },
        extra: { kind: "weekly-recap-test", userId: accountUserId },
      },
      "Weekly progress summary",
    );
  };

  const testStreakReminderNotification = async (): Promise<void> => {
    await scheduleActivityNotificationTest(
      {
        id: STREAK_REMINDER_TEST_NOTIFICATION_ID,
        title: "Your walking streak is at risk",
        body: streakReminderMessage(
          Math.max(1, discoveryProgress.walkingStats.currentStreakDays),
        ),
        schedule: { at: new Date(Date.now() + 5_000) },
        extra: { kind: "streak-reminder-test", userId: accountUserId },
      },
      "Streak reminder",
    );
  };

  const simulateJourneyRecap = (): void => {
    const finishedAt = Date.now();
    const startedAt = finishedAt - 18 * 60_000;
    const walkId = "dev-journey-recap";
    const route: [number, number][] = [
      [2.1604, 41.3902],
      [2.1624, 41.3917],
      [2.1644, 41.3932],
      [2.1664, 41.3917],
      [2.1684, 41.3902],
      [2.1664, 41.3887],
      [2.1644, 41.3872],
    ];
    const points: Coordinate[] = route.map(([lng, lat], index) => ({
      lng,
      lat,
      walkId,
      recordedAt: startedAt + index * 3 * 60_000,
    }));
    const previousPoints = points.slice(0, 3);
    const previousCells = new Set(
      discoveryCellsFromPoints(previousPoints).map(discoveryCellKey),
    );
    setExplorationSummary({
      walkId,
      points,
      cells: discoveryCellsFromPoints(points).filter(
        (cell) => !previousCells.has(discoveryCellKey(cell)),
      ),
      startedAt,
      finishedAt,
      newGroundKm: Math.max(
        0,
        discoveredDistanceKm(points) - discoveredDistanceKm(previousPoints),
      ),
      travelledKm: routeDistanceKm(points),
      cityName: "Barcelona",
      cityPercentageAdded: 0.03,
    });
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

  const notifyJourneySpeedStop = (walkId: string): void => {
    if (!nativeApp || !accountUserId) return;
    void sendJourneySpeedStopNotification(
      LocalNotifications,
      accountUserId,
      walkId,
      () => accountUserIdRef.current === accountUserId,
    ).catch((error) => {
      console.error("Could not notify user about journey speed stop", {
        walkId,
        error,
      });
    });
  };

  const toggleTracking = async () => {
    if (tracking === "tracking") {
      resetInactivityReminder();
      const tracker = trackerRef.current;
      trackerRef.current = null;
      reminderRef.current.reset();
      setTracking("idle");
      setPassiveLocationStatus("idle");
      void Promise.resolve(tracker?.stop()).catch(() => undefined);
      finalizeRecordedWalk();
      return;
    }
    void requestDeviceHeadingPermission();
    if (walkFinalizing || journeySaveError) return;
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
    const foregroundTracker = foregroundTrackerRef.current;
    foregroundTrackerRef.current = null;
    void Promise.resolve(foregroundTracker?.stop()).catch(() => undefined);
    const walkId = createWalkId();
    followCameraEnabledRef.current = true;
    setFollowingUser(true);
    lastPointRef.current = undefined;
    const startingPoints = pointsRef.current;
    pointsRef.current = [...startingPoints];
    cellsRef.current = [...cellsRef.current];
    explorationStartRef.current = {
      cells: new Set(cellKeysRef.current),
      points: startingPoints,
      discoveryDistance,
    };
    const startedAt = Date.now();
    activeWalkRef.current = { id: walkId, startedAt, points: [] };
    setElapsedNow(startedAt);
    trackingUserRef.current = accountUserId;
    saveWalkJournal(accountUserId, pendingWalksRef.current, {
      ...activeWalkRef.current,
      finishedAt: activeWalkRef.current.startedAt,
    });
    setJourneyStopMessage(null);
    const tracker = createJourneyRecordingTracker(
      createLocationTracker(walkId),
      progressCities,
    );
    trackerRef.current = tracker;
    // The journey exists locally before the native watcher finishes starting,
    // so reflect the active session immediately and roll back on failure.
    setTracking("tracking");
    let trackerFailed = false;
    try {
      await tracker.start(addPoint, (error) => {
        if (trackerRef.current !== tracker) return;
        trackerFailed = true;
        const journeyStopped =
          error.code === "journey-stopped" || error.code === "speed-exceeded";
        setJourneyStopMessage(journeyStopped ? error.message : null);
        if (error.code === "speed-exceeded") notifyJourneySpeedStop(walkId);
        focusFirstTrackingPointRef.current = false;
        resetInactivityReminder();
        void Promise.resolve(tracker.stop()).catch((stopError) => {
          console.error("Could not stop journey location tracking", {
            error: stopError,
          });
        });
        trackerRef.current = null;
        finalizeRecordedWalk();
        setPassiveLocationStatus(
          error.code === "permission-denied" ? "denied" : "idle",
        );
        setTracking(
          error.code === "permission-denied"
            ? "denied"
            : journeyStopped
              ? "idle"
              : "unavailable",
        );
      });
      if (trackerFailed || trackerRef.current !== tracker) return;
    } catch {
      // A user can stop while native watcher registration is still pending.
      // Do not let that stale rejection overwrite the idle state or clear a
      // newer walk that may already be starting.
      if (trackerRef.current !== tracker) return;
      focusFirstTrackingPointRef.current = false;
      resetInactivityReminder();
      trackerRef.current = null;
      void Promise.resolve(tracker.stop()).catch(() => undefined);
      activeWalkRef.current = null;
      trackingUserRef.current = null;
      saveWalkJournal(accountUserId, pendingWalksRef.current, null);
      setPassiveLocationStatus("idle");
      setTracking("unavailable");
    }
  };

  useEffect(() => {
    if (
      !requestedJourneyStopId ||
      !authReady ||
      discoveryLoading ||
      walkFinalizing ||
      tracking === "requesting"
    )
      return;
    const walk = activeWalkRef.current;
    if (
      walk &&
      walk.id === requestedJourneyStopId &&
      trackingUserRef.current === accountUserId &&
      tracking === "tracking"
    ) {
      setRequestedJourneyStopId(null);
      setSyncOpen(false);
      void toggleTracking();
      return;
    }
    if (!walk || walk.id !== requestedJourneyStopId)
      setRequestedJourneyStopId(null);
  }, [
    requestedJourneyStopId,
    accountUserId,
    authReady,
    discoveryLoading,
    tracking,
    walkFinalizing,
  ]);

  useEffect(() => {
    const request = requestedJourneyControl;
    if (
      !request ||
      !authReady ||
      !documentVisible ||
      discoveryLoading ||
      walkFinalizing ||
      journeyControlBusy ||
      tracking === "requesting" ||
      handledJourneyControlRef.current?.id === request.id
    )
      return;
    handledJourneyControlRef.current = request;
    setJourneyControlBusy(true);
    const ownerId = accountUserId;
    const expectedTracking = tracking;
    const perform = async (): Promise<void> => {
      try {
        await JourneyActivity.acknowledgeControlRequest({ id: request.id });
        if (!controlMountedRef.current || accountUserIdRef.current !== ownerId)
          return;
        assertFreshJourneyControlRequest(request, Date.now());
        if (trackingStateRef.current !== expectedTracking)
          throw new Error(
            "Your journey changed while Hecate was opening. Tap the control again.",
          );
        setSyncOpen(false);
        await toggleTracking();
      } catch (error) {
        console.error("Could not perform iOS journey control", {
          requestId: request.id,
          error,
        });
        if (controlMountedRef.current)
          setJourneyStopMessage(
            error instanceof Error
              ? error.message
              : "Could not start or stop the journey from the iOS control.",
          );
      } finally {
        if (controlMountedRef.current) {
          setRequestedJourneyControl((current) =>
            current?.id === request.id ? null : current,
          );
          setJourneyControlBusy(false);
        }
      }
    };
    void perform();
  }, [
    requestedJourneyControl,
    authReady,
    documentVisible,
    discoveryLoading,
    walkFinalizing,
    journeyControlBusy,
    tracking,
    accountUserId,
  ]);

  useEffect(() => {
    const requestedUserId = pendingMorningWalkStartUserIdRef.current;
    if (authReady && requestedUserId && requestedUserId !== accountUserId) {
      pendingMorningWalkStartUserIdRef.current = null;
      return;
    }
    if (
      !requestedUserId ||
      requestedUserId !== accountUserId ||
      !authReady ||
      discoveryLoading ||
      walkFinalizing
    )
      return;
    if (tracking !== "idle") {
      pendingMorningWalkStartUserIdRef.current = null;
      return;
    }
    pendingMorningWalkStartUserIdRef.current = null;
    void toggleTracking();
  }, [
    accountUserId,
    authReady,
    discoveryLoading,
    morningWalkStartRequest,
    tracking,
    walkFinalizing,
  ]);

  useEffect(() => {
    if (
      tracking !== "requesting" ||
      !accountUserId ||
      trackingUserRef.current !== accountUserId ||
      !activeWalkRef.current ||
      trackerRef.current
    )
      return;
    const restoredWalkId = activeWalkRef.current.id;
    const tracker = createJourneyRecordingTracker(
      createLocationTracker(restoredWalkId),
      progressCities,
    );
    trackerRef.current = tracker;
    let trackerFailed = false;
    const restore = async (): Promise<void> => {
      if (Capacitor.isNativePlatform()) {
        const { request } = await JourneyActivity.getStopRequest({
          ownerId: accountUserId,
          walkId: restoredWalkId,
        });
        if (trackerRef.current !== tracker) return;
        if (request) {
          widgetStopRef.current = request;
          setRequestedJourneyStopId(request.walkId);
          setTracking("tracking");
          return;
        }
      }
      await tracker.start(addPoint, (error) => {
        if (trackerRef.current !== tracker) return;
        trackerFailed = true;
        const journeyStopped =
          error.code === "journey-stopped" || error.code === "speed-exceeded";
        setJourneyStopMessage(journeyStopped ? error.message : null);
        if (error.code === "speed-exceeded")
          notifyJourneySpeedStop(restoredWalkId);
        focusFirstTrackingPointRef.current = false;
        resetInactivityReminder();
        trackerRef.current = null;
        void Promise.resolve(tracker.stop()).catch((stopError) => {
          console.error("Could not stop restored location tracking", {
            error: stopError,
          });
        });
        finalizeRecordedWalk();
        setPassiveLocationStatus(
          error.code === "permission-denied" ? "denied" : "idle",
        );
        setTracking(
          error.code === "permission-denied"
            ? "denied"
            : journeyStopped
              ? "idle"
              : "unavailable",
        );
      });
    };
    void restore()
      .then(() => {
        if (trackerFailed || trackerRef.current !== tracker) return;
        setTracking("tracking");
      })
      .catch((error) => {
        if (trackerRef.current !== tracker) return;
        focusFirstTrackingPointRef.current = false;
        resetInactivityReminder();
        trackerRef.current = null;
        void Promise.resolve(tracker.stop()).catch((stopError) => {
          console.error("Could not stop failed restored location tracking", {
            error: stopError,
          });
        });
        finalizeRecordedWalk();
        setPassiveLocationStatus("idle");
        setTracking("unavailable");
        console.error("Could not restore active location tracking", { error });
      });
  }, [accountUserId, resetInactivityReminder, tracking]);

  const locate = () => {
    followCameraEnabledRef.current = true;
    setFollowingUser(true);
    void requestDeviceHeadingPermission();
    if (currentPoint) {
      focusOnUserPoint(currentPoint);
      setViewedCity(null);
    }
    if (!currentPoint || passiveLocationStatus !== "located") {
      setPassiveLocationStatus("requesting");
      setPassiveLocationRefreshGeneration((generation) => generation + 1);
    }
  };

  const handleLocationControl = (): void => {
    const point = simulationPointRef.current ?? (locationIsCurrent ? currentPoint : null);
    if (!point || !userCenteredRef.current) {
      if (simulationPointRef.current) focusOnUserPoint(simulationPointRef.current);
      else locate();
      return;
    }
    const orientation: MapOrientation = mapOrientationRef.current === "north-up" ? "heading-up" : "north-up";
    mapOrientationRef.current = orientation;
    setMapOrientation(orientation);
    followCameraEnabledRef.current = true;
    setFollowingUser(true);
    void requestDeviceHeadingPermission();
    stopFollowCameraAnimation();
    animateFollowCamera(point);
  };

  const journeyBounds = (card: HTMLElement) => {
    const collapsed =
      Number.parseFloat(window.getComputedStyle(card).minHeight) || 88;
    return { collapsed, expanded: card.getBoundingClientRect().height };
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

  const settleJourneySheet = useCallback(
    (
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
          [{ transform: startTransform }, { transform: targetTransform }],
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
        };
        animation.oncancel = () => {
          if (journeyAnimationRef.current === animation) {
            journeyAnimationRef.current = null;
          }
        };
      });
    },
    [],
  );

  const scrollToCityMilestones = useCallback((behavior: ScrollBehavior) => {
    const overview = journeyCardRef.current?.querySelector(
      ".journey-overview",
    ) as HTMLElement | null;
    const title = overview?.querySelector(
      `#${JOURNEY_CITY_MILESTONES_TITLE_ID}`,
    );
    const section = title?.closest("section");
    if (!overview || !section) return false;
    const top =
      section.getBoundingClientRect().top -
      overview.getBoundingClientRect().top +
      overview.scrollTop;
    overview.scrollTo({
      behavior,
      top,
    });
    return true;
  }, []);

  const openJourneyAtCityMilestones = useCallback(() => {
    const scrollBehavior = window.matchMedia("(prefers-reduced-motion: reduce)")
      .matches
      ? "auto"
      : "smooth";
    pendingMilestonesScrollRef.current = true;
    settleJourneySheet(true);
    if (!journeyExpandedRef.current) return;
    if (journeyMilestonesScrollFrameRef.current !== null)
      cancelAnimationFrame(journeyMilestonesScrollFrameRef.current);
    journeyMilestonesScrollFrameRef.current = requestAnimationFrame(() => {
      journeyMilestonesScrollFrameRef.current = null;
      if (scrollToCityMilestones(scrollBehavior)) {
        pendingMilestonesScrollRef.current = false;
      }
    });
  }, [scrollToCityMilestones, settleJourneySheet]);

  useEffect(() => {
    if (!citiesExpanded || !pendingMilestonesScrollRef.current) return;
    const scrollBehavior = window.matchMedia("(prefers-reduced-motion: reduce)")
      .matches
      ? "auto"
      : "smooth";
    if (journeyMilestonesScrollFrameRef.current !== null)
      cancelAnimationFrame(journeyMilestonesScrollFrameRef.current);
    journeyMilestonesScrollFrameRef.current = requestAnimationFrame(() => {
      journeyMilestonesScrollFrameRef.current = null;
      scrollToCityMilestones(scrollBehavior);
      pendingMilestonesScrollRef.current = false;
    });
  }, [citiesExpanded, scrollToCityMilestones]);

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

  const focusDiscoveredCity = useCallback(
    (city: CityBoundary) => {
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
    },
    [cells, settleJourneySheet],
  );

  const toggleMapPerspective = () => {
    const map = mapRef.current;
    if (!map) return;
    const nextPerspective = !perspectiveView;
    setPerspectiveView(nextPerspective);
    map.easeTo({
      pitch: nextPerspective ? 52 : 0,
      duration: 900,
      essential: true,
    });
  };

  const showGlobe = () => {
    suspendFollowCamera();
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
    tracking !== "denied" &&
    passiveLocationStatus !== "denied" &&
    (tracking === "tracking" || passiveLocationStatus === "located");
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
    ])
      .then(async ([{ data, error }, databasePlaces]) => {
        if (cancelled || error || data.user?.id !== accountUserId) return;
        let remotePlaces = databasePlaces;
        if (!remotePlaces.length) {
          const metadataPlaces = favoritePlacesFromUnknown(
            data.user.user_metadata?.favorite_places,
          );
          const migrated = [...metadataPlaces, ...localPlaces].reduce<
            FavoritePlace[]
          >((places, place) => {
            const previous = places.find(
              (candidate) => candidate.id === place.id,
            );
            if (!previous) return [...places, place];
            return previous.updatedAt >= place.updatedAt
              ? places
              : [
                  ...places.filter((candidate) => candidate.id !== place.id),
                  place,
                ];
          }, []);
          if (migrated.length) {
            await upsertFavoritePlacesInDatabase(
              client,
              accountUserId,
              migrated,
            );
            remotePlaces = migrated;
          }
          if (metadataPlaces.length) {
            await client.auth.updateUser({ data: { favorite_places: null } });
          }
        }
        if (cancelled) return;
        saveFavoritePlaces(accountUserId, remotePlaces);
        setFavoritePlaces(remotePlaces);
      })
      .catch((error) => {
        console.warn(
          "Saved places could not be loaded from the database",
          error,
        );
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
    ])
      .then((listeners) => {
        if (disposed) listeners.forEach((listener) => void listener.remove());
        else handles.push(...listeners);
      })
      .catch(() => undefined);
    return () => {
      disposed = true;
      handles.forEach((listener) => void listener.remove());
    };
  }, [nativeApp]);

  const persistFavoritePlaces = (nextPlaces: FavoritePlace[]) => {
    if (!accountUserId) return;
    const changedPlaces = nextPlaces.filter((place) => {
      const previous = favoritePlaces.find(
        (candidate) => candidate.id === place.id,
      );
      return !previous || previous.updatedAt !== place.updatedAt;
    });
    const removedIds = favoritePlaces
      .filter(
        (place) => !nextPlaces.some((candidate) => candidate.id === place.id),
      )
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

  const openFavoriteDirections = async (
    provider: "apple" | "google",
    favorite: FavoritePlace,
  ) => {
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

  const closeProfileDialog = () => {
    if (!accountUserId) setFeedbackOpen(false);
    setGlobalMilestonesOpen(false);
    setSavedPlacesOpen(false);
    setCitiesOpen(false);
    setAchievementsOpen(false);
    setSyncOpen(false);
  };

  const openFavoritePlace = useCallback(
    (favorite: FavoritePlace) => {
      setSyncOpen(false);
      setFavoritePlacementActive(false);
      setFavoriteEditorMode("view");
      if (journeyExpandedRef.current) settleJourneySheet(false);
      setSelectedFavoritePlaceId(favorite.id);
      setFavoriteDraft({ ...favorite });
      const map = mapRef.current;
      if (!map) return;
      map.flyTo({
        center: [favorite.lng, favorite.lat],
        zoom: Math.max(map.getZoom(), 15.5),
        pitch: 0,
        bearing: 0,
        duration: 650,
        essential: true,
      });
    },
    [settleJourneySheet],
  );

  const showRouteOnMap = useCallback(
    (routePoints: Coordinate[]) => {
      setSyncOpen(false);
      setHighlightedRoutePoints(routePoints);
      setSelectedFavoritePlaceId(null);
      if (journeyExpandedRef.current) settleJourneySheet(false);
      const map = mapRef.current;
      if (!map || routePoints.length === 0) return;
      map.stop();
      const longitudes = routePoints.map((point) => point.lng);
      const latitudes = routePoints.map((point) => point.lat);
      map.fitBounds(
        [
          [Math.min(...longitudes), Math.min(...latitudes)],
          [Math.max(...longitudes), Math.max(...latitudes)],
        ],
        {
          padding: { top: 90, right: 38, bottom: 170, left: 38 },
          maxZoom: 15,
          duration: 0,
          essential: true,
        },
      );
    },
    [settleJourneySheet],
  );

  const showRouteById = useCallback(
    (routeId: string) => {
      const routePoints = pointsRef.current
        .filter((point) => point.walkId === routeId)
        .sort((first, second) => first.recordedAt - second.recordedAt);
      if (routePoints.length === 0) return;
      showRouteOnMap(routePoints);
    },
    [showRouteOnMap],
  );

  const handleMapClick = useCallback(() => {
    setSelectedFavoritePlaceId(null);
    setHighlightedRoutePoints([]);
    if (journeyExpandedRef.current)
      settleJourneySheet(false, undefined, JOURNEY_MAP_TAP_CLOSE_DURATION_MS);
  }, [settleJourneySheet]);

  const handleFavoritePlaceRequest = useCallback(
    ({
      lat,
      lng,
      suggestedName,
    }: {
      lat: number;
      lng: number;
      suggestedName?: string;
    }) => {
      setFavoritePlacementActive(false);
      setFavoriteEditorMode("edit");
      setFavoriteDraft(createFavoritePlace(lat, lng, suggestedName));
    },
    [],
  );

  const locationControlLabel = userCentered
    ? mapOrientation === "north-up" ? "Switch to heading-up" : "Switch to north-up"
    : (simulationPoint || locationIsCurrent) ? "Center on my location" : "Find my location";

  return (
    <main
      className={`app-shell${routePlannerOpen ? " app-shell--route-planner" : ""}${simulationRoute ? " app-shell--navigation-preview" : ""}`}
      style={
        routePlannerOpen
          ? ({
              "--route-panel-height": `${routePanelHeight}px`,
              "--route-panel-bottom":
                keyboardInset > 0 ? `${keyboardInset + 12}px` : undefined,
            } as React.CSSProperties)
          : undefined
      }
      aria-busy={accountDataLoading}
    >
      <AccountLoadingScreen visible={accountDataLoading} />
      <DiscoveryMap
        mode={mode}
        points={points}
        cells={cells}
        highlightedPoints={highlightedRoutePoints}
        currentPoint={
          simulationPoint ?? (locationIsCurrent ? currentPoint : undefined)
        }
        navigationFollowing={Boolean(
          (simulationRoute ||
            (tracking === "tracking" && plannedJourneyRouteRef.current)) &&
          followingUser,
        )}
        onUserMarkerChange={onUserMarkerChange}
        locationState={
          tracking === "tracking"
            ? "tracking"
            : locationIsCurrent
              ? "located"
              : "idle"
        }
        onMapClick={handleMapClick}
        onDestinationSelect={
          routePlannerOpen
            ? (point) => {
                setRouteDestination(point);
                setSelectedFavoritePlaceId(null);
              }
            : undefined
        }
        favoritePlaces={favoritePlaces}
        selectedFavoritePlaceId={selectedFavoritePlaceId}
        favoritePlacementActive={favoritePlacementActive}
        onFavoritePlaceRequest={handleFavoritePlaceRequest}
        onFavoriteSelect={
          routePlannerOpen
            ? (favorite) => {
                setRouteDestination({
                  lng: favorite.lng,
                  lat: favorite.lat,
                  name: favorite.name,
                });
                setSelectedFavoritePlaceId(favorite.id);
              }
            : openFavoritePlace
        }
        onZoomChange={onZoomChange}
        onViewChange={onViewChange}
        onUserNavigation={suspendFollowCamera}
        onHeadingChange={updateCameraHeading}
        onUserCenteredChange={updateUserCentered}
        mapRef={mapRef}
        fogLayerRef={fogLayerRef}
      />
      {(routePlannerOpen || routeDestination !== null) && (
        <ExplorationRoutePlanner
          key={accountUserId ?? "guest"}
          open={routePlannerOpen}
          keyboardInset={keyboardInset}
          previewEnabled={
            devToolsEnabled &&
            tracking !== "tracking" &&
            tracking !== "requesting"
          }
          onPreview={(route) => {
            mapOrientationRef.current = "heading-up";
            setMapOrientation("heading-up");
            stopFollowCameraAnimation();
            simulationRouteRef.current = route;
            setSimulationRoute(route);
            setSimulationPlayback(route);
            setActiveNavigationRoute(route);
            setRoutePlannerOpen(false);
            setDevToolsOpen(false);
            focusOnUserPoint({ ...route.points[0], recordedAt: Date.now() });
          }}
          userId={accountUserId}
          onDestinationSelect={(point) => {
            setRouteDestination(point);
            setSelectedFavoritePlaceId(null);
          }}
          destination={routeDestination}
          searchCity={activeCity}
          origin={locationIsCurrent && currentPoint ? currentPoint : null}
          activeRoute={activeNavigationRoute}
          navigationPoint={
            simulationPoint ??
            (plannedJourneyRouteRef.current && tracking === "tracking"
              ? (currentPoint ?? null)
              : null)
          }
          cells={cells}
          ready={
            !accountDataLoading &&
            (!accountUserId ||
              (citiesLoadedUserId === accountUserId &&
                discoveryHistoryReadyRef.current))
          }
          tracking={tracking === "tracking"}
          startingJourney={tracking === "requesting"}
          mapRef={mapRef}
          onPanelHeightChange={setRoutePanelHeight}
          onClose={clearPlannedRoute}
          onClear={clearRouteDestination}
          onLocate={locate}
          onStart={(route, mode) => {
            const point = latestPassivePointRef.current ?? currentPoint;
            if (!point)
              throw new Error("Find your current location before starting navigation.");
            mapOrientationRef.current = "heading-up";
            setMapOrientation("heading-up");
            void requestDeviceHeadingPermission();
            rerouteControllerRef.current?.abort();
            rerouteControllerRef.current = null;
            setNavigationRequestPending(false);
            nextRerouteAtRef.current = 0;
            setNavigationMessage("");
            navigationModeRef.current = mode;
            setActiveNavigationRoute(route);
            simulationRouteRef.current = null;
            setSimulationRoute(null);
            setSimulationPlayback(null);
            simulationPointRef.current = null;
            setSimulationPoint(null);
            guidanceRef.current = null;
            arrivalRef.current = null;
            setArrival(null);
            lastTurnInstructionRef.current = "";
            plannedJourneyRouteRef.current = route;
            setRoutePlannerOpen(false);
            const cue = updateNavigationCue(route, point);
            recalculateNavigation(route, point);
            if (trackingStateRef.current === "tracking") {
              focusOnUserPoint(point);
              const walk = activeWalkRef.current;
              const started = explorationStartRef.current;
              if (Capacitor.isNativePlatform() && walk && started) {
                const snapshot = {
                  ...journeyActivitySnapshot(
                    walk,
                    started.discoveryDistance,
                    pointsRef.current,
                  ),
                  navigation: cue,
                };
                enqueueJourneyActivity(() => JourneyActivity.update(snapshot));
              }
            } else {
              void toggleTracking();
            }
          }}
        />
      )}
      {simulationRoute && simulationPlayback && (
        <NavigationSimulation
          panelRef={simulationPanelRef}
          route={simulationPlayback}
          waitingForRoute={navigationRequestPending}
          onFix={previewNavigationFix}
          onStop={() => {
            simulationRouteRef.current = null;
            setSimulationRoute(null);
            setSimulationPlayback(null);
            simulationPointRef.current = null;
            setSimulationPoint(null);
            clearPlannedRoute();
            if (currentPoint) focusOnUserPoint(currentPoint);
          }}
        />
      )}
      {(turnCue || navigationMessage) &&
        !routePlannerOpen &&
        !citiesExpanded &&
        (simulationRoute || tracking === "tracking") && (
          <NavigationTurn
            cue={turnCue}
            message={navigationMessage}
            anchor={simulationRoute ? simulationPanelRef : journeyCardRef}
          />
        )}
      {devToolsEnabled && devToolsVisible && (
        <aside className="dev-tools" aria-label="Development test tools">
          <div className="dev-tools__heading">
            <strong>Dev tools</strong>
            <button
              type="button"
              onClick={() => setDevToolsOpen(false)}
              aria-label="Hide development test tools"
              title="Hide development test tools"
            >
              <XIcon size={14} />
            </button>
          </div>
          <strong>Notifications</strong>
          <small>
            Schedules each notification in 5 seconds using your current
            progress. These tests work even when the notification category is
            switched off.
          </small>
          <button
            type="button"
            onClick={() => void testUnmappedAreaNotification()}
          >
            Test unmapped area reminder
          </button>
          <button
            type="button"
            onClick={() => void testMorningInviteNotification()}
          >
            Test daily reminder
          </button>
          <button
            type="button"
            onClick={() => void testWeeklyRecapNotification()}
          >
            Test weekly summary
          </button>
          <button
            type="button"
            onClick={() => void testStreakReminderNotification()}
          >
            Test streak reminder
          </button>
          {activityNotificationTestMessage && (
            <small role="status">{activityNotificationTestMessage}</small>
          )}
          <strong>Navigation</strong>
          <small>Simulates a wrong turn, recalculates the route, then follows it to the destination. Uses the routing service; saves no progress.</small>
          <button
            type="button"
            data-testid="preview-route-recalculation"
            disabled={tracking === "tracking" || tracking === "requesting" || navigationRequestPending}
            onClick={() => void previewRouteRecalculation()}
          >
            Test route recalculation
          </button>
          {navigationTestMessage && <small role="status">{navigationTestMessage}</small>}
          <strong>Journey recap</strong>
          <small>Previews a sample journey without saving progress.</small>
          <button
            type="button"
            data-testid="preview-journey-recap"
            onClick={simulateJourneyRecap}
          >
            Show mock journey recap
          </button>
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
        </aside>
      )}
      {devToolsEnabled && !devToolsVisible && (
        <button
          className="dev-tools__restore"
          type="button"
          onClick={() => setDevToolsOpen(true)}
        >
          Dev tools
        </button>
      )}

      <header className="topbar" ref={topbarRef}>
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
        <div className="topbar-account">
          {accountUserId && summaryCity && isCityScale && (
            <button
              className="map-milestone"
              type="button"
              onClick={openJourneyAtCityMilestones}
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
          <button
            className="avatar-button"
            type="button"
            onClick={() => {
              setGlobalMilestonesOpen(false);
              setSyncInitialIntent("signin");
              setSyncOpen(true);
            }}
            aria-label="Account and sync"
          >
            <UserIcon size={19} />
          </button>
        </div>
      </header>

      {!accountUserId &&
      !isCityScale &&
      !accountDataLoading &&
      !routePlannerOpen ? (
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
          <button
            type="button"
            onClick={() => setFavoritePlacementActive(false)}
          >
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
          <p>
            {reminderMessage(
              activityNotificationPreferences.discoveryReminderMinutes,
            )}
          </p>
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

      {locationPermissionToastVisible && (
        <aside className="account-toast location-permission-toast" role="alert">
          <span className="account-toast__mark" aria-hidden="true">
            <InfoIcon size={18} strokeWidth={2} />
          </span>
          <span className="account-toast__message">
            {locationSettingsError ||
              "Allow location access in Settings to start your journey."}
          </span>
          <div className="location-permission-toast__actions">
            <button
              type="button"
              onClick={() => {
                void openLocationSettings()
                  .then(() => setLocationPermissionToastVisible(false))
                  .catch((error: Error) => {
                    console.warn("Could not open location settings", { error });
                    setLocationSettingsError(
                      "Could not open Settings. Enable location for Hecate in your device Settings.",
                    );
                  });
              }}
            >
              Open device settings
            </button>
            <button
              type="button"
              className="location-permission-toast__dismiss"
              aria-label="Dismiss location permission message"
              onClick={() => setLocationPermissionToastVisible(false)}
            >
              <XIcon size={16} strokeWidth={2} />
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
            disabled={locationDisplayStatus !== "denied"}
            onClick={() => {
              void openLocationSettings().catch((error: Error) => {
                console.warn("Could not open location settings", { error });
                setLocationSettingsError(
                  "Could not open Settings. Enable location for Hecate in device Settings.",
                );
                setLocationPermissionToastVisible(true);
              });
            }}
            aria-live="polite"
            aria-label={locationStatusText}
          >
            <span />
            {locationStatusText}
          </button>
        )}

      <nav
        ref={mapActionsRef}
        className={`map-actions${routePlannerOpen ? " map-actions--route-planner" : ""}${routePlannerOpen && compactMapActions ? " map-actions--compact" : ""}`}
        aria-label="Map controls"
      >
        <button
          type="button"
          className={routePlannerOpen ? "active" : ""}
          aria-label="Plan a discovery route"
          aria-pressed={routePlannerOpen}
          onClick={() => {
            if (simulationRouteRef.current) clearRouteDestination();
            if (routePlannerOpen) clearPlannedRoute();
            else setRoutePlannerOpen(true);
            setFavoritePlacementActive(false);
            setFavoriteDraft(null);
            setHighlightedRoutePoints([]);
            setSelectedFavoritePlaceId(null);
            suspendFollowCamera();
            if (journeyExpandedRef.current) settleJourneySheet(false);
          }}
        >
          <RouteIcon size={21} />
        </button>
        {accountUserId && (
          <button
            className={favoritePlacementActive ? "active" : ""}
            type="button"
            onClick={() => {
              if (routePlannerOpen) clearPlannedRoute();
              setFavoriteDraft(null);
              setFavoritePlacementActive((active) => !active);
              if (journeyExpandedRef.current) settleJourneySheet(false);
            }}
            aria-label={
              favoritePlacementActive
                ? "Cancel adding a saved place"
                : "Save a place"
            }
            aria-pressed={favoritePlacementActive}
            title="Save a place"
          >
            <SaveIcon size={21} />
          </button>
        )}
        <button
          className={`location-control${userCentered && mapOrientation === "heading-up" ? " active" : ""}${
            passiveLocationStatus === "requesting" && tracking !== "tracking"
              ? " location-control--requesting"
              : ""
          }`}
          onClick={handleLocationControl}
          aria-label={locationControlLabel}
          title={locationControlLabel}
          data-testid="map-location-control"
          data-orientation={mapOrientation}
          data-centered={userCentered}
        >
          {userCentered ? <CompassIcon size={21} /> : <LocateIcon size={21} />}
        </button>
        <button
          onClick={() =>
            setMode((currentMode) =>
              currentMode === "discover" ? "map" : "discover",
            )
          }
          aria-label={mode === "discover" ? "Turn fog off" : "Turn fog on"}
          aria-pressed={mode === "discover"}
          title={mode === "discover" ? "Turn fog off" : "Turn fog on"}
        >
          <FogIcon size={21} struck={mode === "discover"} />
        </button>
        <button
          className={perspectiveView ? "active" : ""}
          onClick={toggleMapPerspective}
          aria-label={
            perspectiveView ? "Switch to 2D view" : "Switch to 3D view"
          }
          aria-pressed={perspectiveView}
          title={perspectiveView ? "Switch to 2D view" : "Switch to 3D view"}
        >
          <ViewDimensionIcon
            size={21}
            dimension={perspectiveView ? "2d" : "3d"}
          />
        </button>
      </nav>

      {favoriteDraft && (
        <FavoritePlaceEditor
          key={`${favoriteDraft.id}:${favoriteEditorMode}`}
          favorite={favoriteDraft}
          initialMode={favoriteEditorMode}
          existing={favoritePlaces.some(
            (place) => place.id === favoriteDraft.id,
          )}
          keyboardInset={keyboardInset}
          onClose={() => {
            setFavoriteDraft(null);
          }}
          onSave={saveFavoriteDraft}
          onDelete={deleteFavoriteDraft}
          onDirections={(favorite) => void chooseFavoriteDirections(favorite)}
          onHecateDirections={(favorite) => {
            if (simulationRouteRef.current) clearPlannedRoute();
            setFavoriteDraft(null);
            setSavedPlacesOpen(false);
            setFavoritePlacementActive(false);
            setHighlightedRoutePoints([]);
            setSelectedFavoritePlaceId(favorite.id);
            setRouteDestination({
              lng: favorite.lng,
              lat: favorite.lat,
              name: favorite.name,
            });
            setRoutePlannerOpen(true);
            suspendFollowCamera();
            if (journeyExpandedRef.current) settleJourneySheet(false);
          }}
        />
      )}

      {isCityScale && !routePlannerOpen && !simulationRoute && (
        <section
          ref={journeyCardRef}
          className="journey-card"
          data-testid="journey-drawer"
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
            <div
              className={`journey-card__summary${showActiveJourneyMetrics ? " journey-card__summary--tracking" : ""}`}
            >
              <div className="eyebrow">
                {showActiveJourneyMetrics ? "Exploring…" : "Your discovery"}
              </div>
              <div className="discovery-metrics">
                {showActiveJourneyMetrics ? (
                  <div
                    className="active-journey-metrics"
                    aria-label="Current walk progress"
                  >
                    <div>
                      <JourneyCounterValue display={displayedDistanceCounter} />
                      <span>this walk</span>
                    </div>
                    <div>
                      <JourneyCounterValue
                        display={displayedNewGroundCounter}
                      />
                      <span>new area</span>
                    </div>
                    <div>
                      <strong
                        className="active-journey-value"
                        aria-label={displayedTimeCounter.label}
                      >
                        {displayedTimeCounter.text}
                      </strong>
                      <span>time</span>
                    </div>
                  </div>
                ) : showFirstDiscoveryHint ? (
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
                !authReady ||
                discoveryLoading ||
                tracking === "requesting" ||
                walkFinalizing ||
                Boolean(journeySaveError)
              }
              aria-label={
                !accountUserId
                  ? "Sign in to start discovering"
                  : tracking === "tracking"
                    ? "Stop discovering"
                    : walkFinalizing
                      ? "Finishing your discovery"
                      : tracking === "requesting"
                        ? "Finding your location"
                        : "Start discovering"
              }
              title={
                !accountUserId
                  ? "Sign in to discover"
                  : tracking === "tracking"
                    ? "Stop discovering"
                    : walkFinalizing
                      ? "Finishing your discovery"
                      : "Start discovering"
              }
            >
              {tracking === "tracking" ? (
                <span className="stop-square" />
              ) : tracking === "requesting" || walkFinalizing ? (
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
          {tracking === "unavailable" && (
            <p className="location-error">
              Location is temporarily unavailable. Try again, or preview the
              sample discovery.
            </p>
          )}
          {journeyStopMessage && (
            <p className="location-error" role="status">
              {journeyStopMessage}
            </p>
          )}
          {journeySaveError && (
            <div className="location-error" role="alert">
              <p>{journeySaveError}</p>
              <button
                type="button"
                data-testid="retry-journey-save"
                disabled={walkFinalizing}
                onClick={finalizeRecordedWalk}
              >
                Retry saving journey
              </button>
            </div>
          )}
          <JourneyDetails
            accountUserId={accountUserId}
            expanded={citiesExpanded}
            todayDiscoveryDistance={discoveryProgress.todayDiscoveryDistance}
            todayTravelledDistance={discoveryProgress.todayTravelledDistance}
            todayActiveTimeMs={discoveryProgress.todayActiveTimeMs}
            currentStreakDays={discoveryProgress.walkingStats.currentStreakDays}
            weekDiscoveryDistance={discoveryProgress.weekDiscoveryDistance}
            weekActiveTimeMs={discoveryProgress.weekActiveTimeMs}
            weekDiscoveryDeltaDistance={
              discoveryProgress.weekDiscoveryDeltaDistance
            }
            weekActiveDeltaTimeMs={discoveryProgress.weekActiveDeltaTimeMs}
            cityProgress={accountCityProgress}
            onWalkingStatsOpen={() => setGlobalMilestonesOpen(true)}
          />
        </section>
      )}

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
      <div
        aria-hidden={
          globalMilestonesOpen ||
          savedPlacesOpen ||
          citiesOpen ||
          achievementsOpen ||
          undefined
        }
        inert={
          globalMilestonesOpen ||
          savedPlacesOpen ||
          citiesOpen ||
          achievementsOpen ||
          undefined
        }
      >
        <SyncSheet
          open={syncOpen}
          initialAuthIntent={syncInitialIntent}
          onClose={closeProfileDialog}
          onFeedbackOpen={() => setFeedbackOpen(true)}
          reminderEnabled={reminderEnabled}
          reminderMotionError={reminderMotionError}
          reminderMotionAllowed={reminderMotionAllowed}
          notificationPermissionReady={notificationPermissionReady}
          keyboardInset={keyboardInset}
          travelledDistance={discoveryProgress.travelledDistance}
          discoveredCityCount={cityProgresses.length}
          earnedAchievementCount={earnedAchievementIds.length}
          achievementCount={achievementEvaluations.length}
          favoritePlaces={favoritePlaces}
          onReminderChange={updateReminderEnabled}
          activityNotificationPreferences={activityNotificationPreferences}
          onActivityNotificationChange={updateActivityNotificationPreference}
          onStreakReminderTimeChange={(time) =>
            updateReminderTime("streakReminderTime", time)
          }
          onDiscoveredAreaRemindersChange={updateDiscoveredAreaReminders}
          onDiscoveryReminderDurationChange={(minutes) =>
            updateReminderDuration("discoveryReminderMinutes", minutes)
          }
          onInactivityReminderDurationChange={(minutes) =>
            updateReminderDuration("inactivityReminderMinutes", minutes)
          }
          onDailyReminderTimeChange={(time) =>
            updateReminderTime("dailyReminderTime", time)
          }
          onAllNotificationsChange={updateAllNotifications}
          onGpxImport={importGpxFile}
          onShowGpxImport={showRouteOnMap}
          onShowGpxImportRoute={showRouteById}
          onWalkingStatsOpen={() => {
            setGlobalMilestonesOpen(true);
          }}
          onCitiesOpen={() => {
            setCitiesOpen(true);
          }}
          onAchievementsOpen={() => {
            setAchievementsOpen(true);
          }}
          onSavedPlacesOpen={() => {
            setSavedPlacesOpen(true);
          }}
        />
      </div>
      <GlobalMilestonesSheet
        open={Boolean(accountUserId && globalMilestonesOpen)}
        discoveryDistance={discoveryProgress.discoveryDistance}
        travelledKm={discoveryProgress.travelledDistance}
        walkingStats={discoveryProgress.walkingStats}
        discoveredCityCount={cityProgresses.length}
        backLabel={syncOpen ? "Back to profile" : "Back to journey"}
        onBack={() => {
          setGlobalMilestonesOpen(false);
        }}
        onClose={closeProfileDialog}
      />
      <SavedPlacesSheet
        open={Boolean(accountUserId && savedPlacesOpen)}
        favoritePlaces={favoritePlaces}
        onFavoriteSelect={(favorite) => {
          setSavedPlacesOpen(false);
          openFavoritePlace(favorite);
        }}
        onFavoriteDelete={deleteFavoriteDraft}
        onBack={() => setSavedPlacesOpen(false)}
        onClose={closeProfileDialog}
      />
      <CitiesSheet
        open={Boolean(accountUserId && citiesOpen)}
        loading={citiesLoadedUserId !== accountUserId}
        cityProgresses={cityProgresses}
        onCitySelect={(city) => {
          setCitiesOpen(false);
          setSyncOpen(false);
          focusDiscoveredCity(city);
        }}
        onBack={() => setCitiesOpen(false)}
        onClose={closeProfileDialog}
      />
      <AchievementsSheet
        open={Boolean(accountUserId && achievementsOpen)}
        achievementEvaluations={achievementEvaluations}
        onBack={() => setAchievementsOpen(false)}
        onClose={closeProfileDialog}
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
                navigationFollowing={false}
                mode="discover"
                points={explorationSummary.points}
                cells={explorationSummary.cells}
                highlightedPoints={[]}
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
              {explorationSummary.travelledKm > 0 && (
                <span>
                  {Math.round(
                    (explorationSummary.newGroundKm /
                      explorationSummary.travelledKm) *
                      100,
                  )}
                  % of this walk was new ground
                </span>
              )}
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
                data-testid="recap-view-on-map"
                onClick={() => {
                  showRouteOnMap(explorationSummary.points);
                  setExplorationSummary(null);
                }}
              >
                View on map
              </button>
            </div>
          </section>
        </div>
      )}
      {feedbackOpen && accountUserId && (
        <FeedbackForm
          key={accountUserId}
          userId={accountUserId}
          accountEmail={accountUserEmail}
          keyboardInset={keyboardInset}
          onClose={() => setFeedbackOpen(false)}
        />
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
                console.warn(
                  "Could not sync achievement acknowledgement",
                  error,
                ),
              );
            setAchievementCelebrations((current) => current.slice(1));
          }}
        />
      )}
    </main>
  );
}
