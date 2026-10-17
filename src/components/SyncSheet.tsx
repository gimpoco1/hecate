import { useEffect, useState } from "react";
import { Browser } from "@capacitor/browser";
import { Capacitor } from "@capacitor/core";
import type { User } from "@supabase/supabase-js";
import { authRedirectUrl } from "../auth";
import {
  isAutomaticUpdatesEnabled,
  setAutomaticUpdatesEnabled,
} from "../automaticUpdates";
import { clearReminderPreference } from "../explorationReminder";
import {
  INACTIVITY_RADIUS_M,
  INACTIVITY_REMINDER_MINUTES,
} from "../inactivityReminder";
import { openLocationSettings } from "../location";
import { isSyncConfigured, supabase } from "../storage";
import { currentWorldMilestone } from "../badges";
import { displayNameForUser, loadMyLeaderboardProfile } from "../leaderboard";
import type { FavoritePlace } from "../favoritePlaces";
import { hostedLeaderboardUrl, publicLeaderboardUrl } from "../routes";
import { WorldMilestoneIcon } from "./WorldMilestones";
import {
  AchievementsIcon,
  ArrowLeftIcon,
  BellIcon,
  CoffeeIcon,
  CitiesIcon,
  ChevronIcon,
  InfoIcon,
  LeaderboardIcon,
  RouteIcon,
  SaveIcon,
  SignOutIcon,
  XIcon,
} from "./Icons";
import type { Coordinate } from "../types";
import type {
  ActivityNotificationCategory,
  ActivityNotificationPreferences,
} from "../activityNotifications";

type Props = {
  open: boolean;
  initialAuthIntent?: PasswordIntent;
  onClose: () => void;
  reminderEnabled: boolean;
  keyboardInset: number;
  travelledDistance: number;
  discoveredCityCount: number;
  earnedAchievementCount: number;
  achievementCount: number;
  favoritePlaces: FavoritePlace[];
  onReminderChange: (enabled: boolean) => Promise<string | null>;
  activityNotificationPreferences: ActivityNotificationPreferences;
  onActivityNotificationChange: (
    category: ActivityNotificationCategory,
    enabled: boolean,
  ) => Promise<string | null>;
  onAllNotificationsChange: (enabled: boolean) => Promise<string | null>;
  onGpxImport: (file: File) => Promise<GpxImportResult>;
  onShowGpxImport: (points: Coordinate[]) => void;
  onShowGpxImportRoute: (routeId: string) => void;
  onWalkingStatsOpen: () => void;
  onCitiesOpen: () => void;
  onAchievementsOpen: () => void;
  onSavedPlacesOpen: () => void;
};
type SignInMethod = "password" | "link";
type PasswordIntent = "signin" | "signup";
type MessageTone = "success" | "error";
type ToastTone = MessageTone | "info";
export type GpxImportedRoute = {
  id: string;
  title: string;
  addedAt: number;
  addedKm: number;
};
export type GpxImportResult = {
  message: string;
  tone: Exclude<ToastTone, "error">;
  points?: Coordinate[];
  importedRoutes?: GpxImportedRoute[];
};

function gpxImportHistoryKey(userId: string) {
  return `hecate.gpx-import-history.v1.${userId}`;
}

function readGpxImportHistory(userId: string): GpxImportedRoute[] {
  try {
    const raw = localStorage.getItem(gpxImportHistoryKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .flatMap((item) => {
        if (
          !item ||
          typeof item.id !== "string" ||
          typeof item.title !== "string" ||
          !Number.isFinite(item.addedAt)
        ) {
          return [];
        }
        return [
          {
            id: item.id,
            title: item.title,
            addedAt: item.addedAt,
            addedKm:
              Number.isFinite(item.addedKm) && item.addedKm > 0
                ? item.addedKm
                : 0,
          },
        ];
      })
      .slice(0, 20);
  } catch {
    return [];
  }
}

function writeGpxImportHistory(userId: string, routes: GpxImportedRoute[]) {
  try {
    localStorage.setItem(
      gpxImportHistoryKey(userId),
      JSON.stringify(routes.slice(0, 20)),
    );
  } catch (error) {
    console.warn("Could not persist GPX import history", {
      userId,
      error:
        error instanceof Error
          ? error.message
          : "Web Storage failed with an unknown error.",
    });
  }
}

export function SyncSheet({
  open,
  initialAuthIntent = "signin",
  onClose,
  reminderEnabled,
  keyboardInset,
  travelledDistance,
  discoveredCityCount,
  earnedAchievementCount,
  achievementCount,
  favoritePlaces,
  onReminderChange,
  activityNotificationPreferences,
  onActivityNotificationChange,
  onAllNotificationsChange,
  onGpxImport,
  onShowGpxImport,
  onShowGpxImportRoute,
  onWalkingStatsOpen,
  onCitiesOpen,
  onAchievementsOpen,
  onSavedPlacesOpen,
}: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [signInMethod, setSignInMethod] = useState<SignInMethod>("password");
  const [passwordIntent, setPasswordIntent] =
    useState<PasswordIntent>("signin");
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState<MessageTone>("success");
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(isSyncConfigured);
  const [authPending, setAuthPending] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [reminderPending, setReminderPending] = useState(false);
  const [reminderError, setReminderError] = useState("");
  const [gpxImportPending, setGpxImportPending] = useState(false);
  const [gpxImportSheetOpen, setGpxImportSheetOpen] = useState(false);
  const [notificationSettingsSheetOpen, setNotificationSettingsSheetOpen] =
    useState(false);
  const [notificationPending, setNotificationPending] = useState(false);
  const [notificationError, setNotificationError] = useState("");
  const allNotificationsEnabled =
    reminderEnabled &&
    activityNotificationPreferences.morningInvite &&
    activityNotificationPreferences.weeklyRecap &&
    activityNotificationPreferences.streakReminder;
  const [gpxImportedRoutes, setGpxImportedRoutes] = useState<
    GpxImportedRoute[]
  >([]);
  const [gpxToast, setGpxToast] = useState<{
    message: string;
    tone: ToastTone;
    points?: Coordinate[];
  } | null>(null);
  const [autoUpdatesEnabled, setAutoUpdatesEnabled] = useState(
    isAutomaticUpdatesEnabled,
  );
  const [publishedDisplayName, setPublishedDisplayName] = useState<
    string | null
  >(null);

  useEffect(() => {
    if (!keyboardInset) return;
    const activeField = document.activeElement;
    if (!(activeField instanceof HTMLInputElement)) return;
    const timer = window.setTimeout(
      () => activeField.scrollIntoView({ block: "center", behavior: "smooth" }),
      80,
    );
    return () => window.clearTimeout(timer);
  }, [keyboardInset]);

  useEffect(() => {
    if (!open) return;
    setSignInMethod("password");
    setPasswordIntent(initialAuthIntent);
    setConfirmPassword("");
    setMessage("");
  }, [initialAuthIntent, open]);

  useEffect(() => {
    const userId = user?.id;
    if (!userId) {
      setGpxImportedRoutes([]);
      return;
    }
    setGpxImportedRoutes(readGpxImportHistory(userId));
  }, [user?.id]);

  useEffect(() => {
    const userId = user?.id;
    if (!userId) return;
    writeGpxImportHistory(userId, gpxImportedRoutes);
  }, [gpxImportedRoutes, user?.id]);

  useEffect(() => {
    if (!gpxToast) return;
    const timer = window.setTimeout(() => setGpxToast(null), 4_500);
    return () => window.clearTimeout(timer);
  }, [gpxToast]);

  useEffect(() => {
    if (!open) {
      setConfirmingDelete(false);
      setNotificationSettingsSheetOpen(false);
      return;
    }
    if (!supabase) {
      setAuthLoading(false);
      return;
    }

    let active = true;
    setAuthLoading(true);
    void supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      setUser(data.session?.user ?? null);
      setMessage(error?.message ?? "");
      setMessageTone(error ? "error" : "success");
      setAuthLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      setUser(session?.user ?? null);
      if (session?.user) setMessage("");
      setAuthLoading(false);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [open]);

  useEffect(() => {
    if (!open || !user) {
      setPublishedDisplayName(null);
      return;
    }

    let active = true;
    void loadMyLeaderboardProfile()
      .then((profile) => {
        if (!active) return;
        setPublishedDisplayName(profile?.displayName ?? null);
      })
      .catch(() => {
        if (!active) return;
        setPublishedDisplayName(null);
      });

    return () => {
      active = false;
    };
  }, [open, user]);

  if (!open) return null;

  const signIn = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!supabase) return;
    setAuthPending(true);
    setMessage("");
    setMessageTone("success");
    try {
      if (signInMethod === "password") {
        if (passwordIntent === "signup") {
          if (password.length < 8) {
            setMessage("Use at least 8 characters for your password.");
            setMessageTone("error");
            return;
          }
          if (password !== confirmPassword) {
            setMessage("The passwords do not match.");
            setMessageTone("error");
            return;
          }

          const { data, error } = await supabase.auth.signUp({
            email: email.trim(),
            password,
            options: { emailRedirectTo: authRedirectUrl() },
          });
          if (error) {
            setMessage(error.message);
            setMessageTone("error");
          } else if (data.session && data.user) setUser(data.user);
          else {
            setPasswordIntent("signin");
            setPassword("");
            setConfirmPassword("");
            setMessage(
              "Check your inbox to confirm your account. If you cannot see the email, check your spam folder. The link will bring you back to Hecate.",
            );
            setMessageTone("success");
          }
        } else {
          const { data, error } = await supabase.auth.signInWithPassword({
            email: email.trim(),
            password,
          });
          if (error) {
            setMessage(error.message);
            setMessageTone("error");
          } else setUser(data.user);
        }
      } else {
        const { error } = await supabase.auth.signInWithOtp({
          email: email.trim(),
          options: {
            emailRedirectTo: authRedirectUrl(),
            shouldCreateUser: false,
          },
        });
        setMessage(
          error
            ? error.message
            : "Check your inbox for a one-time sign-in link.",
        );
        setMessageTone(error ? "error" : "success");
      }
    } catch {
      setMessage(
        "Unable to reach your account right now. Check your connection and try again.",
      );
      setMessageTone("error");
    } finally {
      setAuthPending(false);
    }
  };

  const signOut = async () => {
    if (!supabase) return;
    setAuthPending(true);
    setMessage("");
    const { error } = await supabase.auth.signOut();
    if (error) {
      setMessage(error.message);
      setMessageTone("error");
    } else {
      setUser(null);
      setConfirmingDelete(false);
    }
    setAuthPending(false);
  };

  const deleteAccount = async () => {
    if (!supabase) return;
    setAuthPending(true);
    setMessage("");
    try {
      const { error } = await supabase.rpc("delete_account");
      if (error) {
        setMessage(error.message);
        setMessageTone("error");
        return;
      }

      if (user) clearReminderPreference(user.id);
      await supabase.auth.signOut({ scope: "local" });
      setUser(null);
      setConfirmingDelete(false);
      onClose();
    } catch {
      setMessage(
        "Unable to delete your account right now. Check your connection and try again.",
      );
      setMessageTone("error");
    } finally {
      setAuthPending(false);
    }
  };

  const accountDisplayName = user
    ? displayNameForUser(user, publishedDisplayName)
    : "";
  const accountEmail = user?.email ?? "Signed-in account";
  const accountInitial = (accountDisplayName || accountEmail)
    .trim()
    .charAt(0)
    .toUpperCase();
  const favoriteCollectionCount = new Set(
    favoritePlaces.map((place) => place.icon),
  ).size;
  const beginAccountCreation = () => {
    setSignInMethod("password");
    setPasswordIntent("signup");
    setPassword("");
    setConfirmPassword("");
    setMessage("");
  };
  const currentWorldRank = currentWorldMilestone(travelledDistance);

  const openLeaderboard = async () => {
    const nativePlatform = Capacitor.isNativePlatform();
    const leaderboardUrl = nativePlatform
      ? hostedLeaderboardUrl()
      : publicLeaderboardUrl(window.location.origin);

    if (nativePlatform) {
      try {
        await Browser.open({ url: leaderboardUrl });
        return;
      } catch {
        // Fall back to a browser tab if the native browser plugin is unavailable.
      }
    }

    window.open(leaderboardUrl, "_blank", "noopener,noreferrer");
  };

  const openCoffeeSupport = async () => {
    const coffeeUrl = "https://buymeacoffee.com/devgiaco";

    if (Capacitor.isNativePlatform()) {
      try {
        await Browser.open({ url: coffeeUrl });
        return;
      } catch {
        // Fall back to a browser tab if the native browser plugin is unavailable.
      }
    }

    window.open(coffeeUrl, "_blank", "noopener,noreferrer");
  };

  const keepAuthFieldVisible = (event: React.FocusEvent<HTMLInputElement>) => {
    const field = event.currentTarget;
    window.setTimeout(() => {
      field.scrollIntoView({ block: "center", behavior: "smooth" });
    }, 80);
  };

  const formatGpxImportDate = (addedAt: number) =>
    new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(addedAt);
  const formatGpxImportDistance = (distanceKm: number) =>
    `${distanceKm < 10 ? distanceKm.toFixed(2) : distanceKm.toFixed(1)} km`;

  const handleGpxFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    setGpxImportPending(true);
    setGpxToast(null);
    void onGpxImport(file)
      .then((result) => {
        setGpxToast(result);
        const importedRoutes = result.importedRoutes;
        if (importedRoutes && importedRoutes.length > 0) {
          setGpxImportedRoutes((current) => {
            const existing = new Set(importedRoutes.map((route) => route.id));
            const merged = [
              ...importedRoutes,
              ...current.filter((route) => !existing.has(route.id)),
            ];
            return merged.slice(0, 20);
          });
        }
      })
      .catch((error) => {
        setGpxToast({
          tone: "error",
          message:
            error instanceof Error
              ? error.message
              : "The GPX import failed for an unknown reason.",
        });
      })
      .finally(() => setGpxImportPending(false));
  };

  return (
    <div
      className={`sheet-backdrop${keyboardInset ? " sheet-backdrop--keyboard" : ""}`}
      style={keyboardInset ? { bottom: `${keyboardInset}px` } : undefined}
      onClick={onClose}
    >
      {gpxToast && (
        <div
          className={`account-toast account-toast--${gpxToast.tone}`}
          role={gpxToast.tone === "error" ? "alert" : "status"}
          aria-live={gpxToast.tone === "error" ? "assertive" : "polite"}
          onClick={(event) => event.stopPropagation()}
        >
          <span className="account-toast__mark" aria-hidden="true">
            {gpxToast.tone === "success"
              ? "✓"
              : gpxToast.tone === "error"
                ? "!"
                : "i"}
          </span>
          <span className="account-toast__message">{gpxToast.message}</span>
          {gpxToast.points && gpxToast.points.length > 0 && (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                const points = gpxToast.points;
                if (!points || points.length === 0) return;
                onShowGpxImport(points);
                setGpxToast(null);
              }}
            >
              Show on map
            </button>
          )}
        </div>
      )}
      <section
        className="sheet"
        onClick={(event) => event.stopPropagation()}
        aria-modal="true"
        role="dialog"
        aria-labelledby="sync-title"
      >
        <button
          className="icon-button sheet__close"
          onClick={onClose}
          aria-label="Close"
        >
          <XIcon />
        </button>
        <div className="eyebrow">
          {user ? "Account & sync" : "Private by design"}
        </div>
        {!user && (
          <div className="sync-privacy-subtitle">
            <span /> Your recorded discoveries stay private to your account.
          </div>
        )}
        <h2 id="sync-title">
          {user ? "Profile" : "Carry your map everywhere."}
        </h2>
        <p>
          {user
            ? "Your private discoveries, progress, and account settings in one place."
            : "Sign in to start discovering. Your paths belong to your account and stay in sync across your devices."}
        </p>
        {authLoading ? (
          <div className="account-loading" role="status">
            Checking your account…
          </div>
        ) : user ? (
          <>
            <div className="account-card">
              <div className="account-profile-card">
                <div className="account-card__identity">
                  <span className="account-card__avatar" aria-hidden="true">
                    {accountInitial}
                  </span>
                  <span>
                    <strong>{accountDisplayName}</strong>
                    <small>{accountEmail}</small>
                  </span>
                </div>
              </div>
              <nav className="account-navigation" aria-label="Profile features">
                <div className="account-navigation__heading">
                  <strong>Your activity</strong>
                  <small>Progress, discoveries, and collections</small>
                </div>
                <div className="account-activity-grid">
                  <button
                    type="button"
                    className="account-feature-tile"
                    aria-label={`Open walking stats. Current global rank: ${currentWorldRank.title}.`}
                    onClick={onWalkingStatsOpen}
                  >
                    <span
                      className="account-feature-tile__mark"
                      aria-hidden="true"
                    >
                      <WorldMilestoneIcon icon={currentWorldRank.icon} />
                    </span>
                    <strong>Walking stats</strong>
                    <small>Stats and milestones</small>
                    <ChevronIcon size={15} strokeWidth={2.3} />
                  </button>
                  <button
                    type="button"
                    className="account-feature-tile"
                    aria-label={`Open cities explored. ${discoveredCityCount} ${discoveredCityCount === 1 ? "city" : "cities"}.`}
                    onClick={onCitiesOpen}
                  >
                    <span
                      className="account-feature-tile__mark"
                      aria-hidden="true"
                    >
                      <CitiesIcon size={18} />
                    </span>
                    <strong>Cities</strong>
                    <small>{discoveredCityCount} explored</small>
                    <ChevronIcon size={15} strokeWidth={2.3} />
                  </button>
                  <button
                    type="button"
                    className="account-feature-tile"
                    aria-label={`Open achievements. ${earnedAchievementCount} of ${achievementCount} earned.`}
                    onClick={onAchievementsOpen}
                  >
                    <span
                      className="account-feature-tile__mark"
                      aria-hidden="true"
                    >
                      <AchievementsIcon size={18} />
                    </span>
                    <strong>Achievements</strong>
                    <small>
                      {earnedAchievementCount} of {achievementCount} earned
                    </small>
                    <ChevronIcon size={15} strokeWidth={2.3} />
                  </button>
                  <button
                    type="button"
                    className="account-feature-tile"
                    onClick={onSavedPlacesOpen}
                    aria-label={`Open saved places. ${favoritePlaces.length} saved across ${favoriteCollectionCount} collections.`}
                  >
                    <span
                      className="account-feature-tile__mark"
                      aria-hidden="true"
                    >
                      <SaveIcon size={18} strokeWidth={2} />
                    </span>
                    <strong>Saved places</strong>
                    <small>
                      {favoritePlaces.length}{" "}
                      {favoritePlaces.length === 1 ? "place" : "places"}
                    </small>
                    <ChevronIcon size={15} strokeWidth={2.3} />
                  </button>
                </div>
                <div className="account-navigation__heading account-navigation__heading--community">
                  <strong>Community</strong>
                  <small>
                    Compare your progress and keep your public snapshot current
                  </small>
                </div>
                <section
                  className="account-community-card"
                  aria-label="Community"
                >
                  <button
                    type="button"
                    className="account-community-link account-community-link--grouped"
                    aria-label="Open the public leaderboard"
                    onClick={() => {
                      void openLeaderboard();
                    }}
                  >
                    <span
                      className="account-community-link__mark"
                      aria-hidden="true"
                    >
                      <LeaderboardIcon size={18} />
                    </span>
                    <span>
                      <strong>Leaderboard</strong>
                      <small>Compare your city and worldwide ranking</small>
                    </span>
                    <span
                      className="account-community-link__action"
                      aria-hidden="true"
                    >
                      <small>Open</small>
                      <ChevronIcon size={16} strokeWidth={2.3} />
                    </span>
                  </button>
                  <section
                    className="account-community-settings"
                    aria-label="Community settings"
                  >
                    <div className="account-setting">
                      <div>
                        <strong>Live data</strong>
                        <p>
                          Refresh your leaderboard, badges, and public snapshot
                          after each completed tracking session unless you
                          switch this off.
                        </p>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={autoUpdatesEnabled}
                        aria-label="Automatic updates"
                        onClick={() => {
                          const next = !autoUpdatesEnabled;
                          setAutoUpdatesEnabled(next);
                          setAutomaticUpdatesEnabled(next);
                        }}
                      >
                        {autoUpdatesEnabled ? "On" : "Off"}
                      </button>
                    </div>
                  </section>
                </section>
              </nav>
              <div className="account-navigation__heading account-navigation__heading--settings">
                <strong>Settings</strong>
                <small>Manage your alerts, imports, and app preferences</small>
              </div>
              <section
                className="account-settings-panel account-settings-panel--links"
                aria-label="Account settings"
              >
                <button
                  type="button"
                  className="account-settings-link"
                  aria-label="Open notification settings"
                  onClick={() => setNotificationSettingsSheetOpen(true)}
                >
                  <span
                    className="account-settings-link__mark"
                    aria-hidden="true"
                  >
                    <BellIcon size={18} />
                  </span>
                  <span>
                    <strong>Notifications</strong>
                    <small>Choose the discovery nudges you want to receive</small>
                  </span>
                  <ChevronIcon size={16} strokeWidth={2.3} />
                </button>
                <button
                  type="button"
                  className="account-settings-link"
                  aria-label="Open GPX import"
                  onClick={() => setGpxImportSheetOpen(true)}
                >
                  <span
                    className="account-settings-link__mark"
                    aria-hidden="true"
                  >
                    <RouteIcon size={18} strokeWidth={2} />
                  </span>
                  <span>
                    <strong>Import GPX</strong>
                    <small>
                      Add past routes from Strava or other services
                    </small>
                  </span>
                  <ChevronIcon size={16} strokeWidth={2.3} />
                </button>
                {Capacitor.getPlatform() === "ios" && (
                  <details className="tracking-help">
                    <summary>
                      <span>
                        <strong>Location & tracking</strong>
                        <small>
                          Permissions, background use, and the blue clock
                        </small>
                      </span>
                      <ChevronIcon size={18} strokeWidth={2.4} />
                    </summary>
                    <div className="tracking-help__content">
                      <p>
                        <strong>While Using:</strong> Hecate can check for new
                        areas in the background, but iPhone may show a blue
                        clock for Hecate.
                      </p>
                      <p>
                        <strong>Always:</strong> Hecate can send background
                        reminders without showing the blue clock. Recording a
                        walk may still show it.
                      </p>
                      <p>
                        <strong>Never:</strong> Location features and discovery
                        reminders cannot work.
                      </p>
                      <p>
                        Only walks you start recording are saved to your map.
                        Reminder locations are not saved.
                      </p>
                      <p>
                        While recording, Hecate can suggest stopping after{" "}
                        {INACTIVITY_REMINDER_MINUTES} minutes within{" "}
                        {INACTIVITY_RADIUS_M} m of one spot already on your map.
                        Areas revealed during the current recording count too.
                        The reminder is a suggestion; recording never stops
                        automatically.
                      </p>
                      <figure className="tracking-help__example">
                        <img
                          src="/blue-location-clock.svg"
                          alt="Example of the blue clock on an iPhone"
                          width="122"
                          height="42"
                        />
                        <figcaption>
                          A blue clock means an app is using location in the
                          background. It may be Hecate or another app.
                        </figcaption>
                      </figure>
                      <button
                        type="button"
                        onClick={() =>
                          void openLocationSettings().catch(() => undefined)
                        }
                      >
                        Open iPhone Settings
                      </button>
                      <small>Then tap Location → Always.</small>
                    </div>
                  </details>
                )}
              </section>
              <button
                className="sign-out-button"
                type="button"
                onClick={signOut}
                disabled={authPending}
              >
                <SignOutIcon size={18} />
                Sign out
              </button>
              {!confirmingDelete ? (
                <button
                  className="delete-account-button"
                  type="button"
                  onClick={() => {
                    setConfirmingDelete(true);
                    setMessage("");
                  }}
                  disabled={authPending}
                >
                  Delete account
                </button>
              ) : (
                <div
                  className="delete-confirmation"
                  role="alertdialog"
                  aria-labelledby="delete-account-title"
                  aria-describedby="delete-account-description"
                >
                  <strong id="delete-account-title">
                    Delete your account?
                  </strong>
                  <p id="delete-account-description">
                    All your discoveries, routes, and account data will be
                    permanently deleted. This cannot be recovered.
                  </p>
                  <div className="delete-confirmation__actions">
                    <button
                      type="button"
                      onClick={() => setConfirmingDelete(false)}
                      disabled={authPending}
                    >
                      Cancel
                    </button>
                    <button
                      className="delete-confirmation__confirm"
                      type="button"
                      onClick={deleteAccount}
                      disabled={authPending}
                    >
                      {authPending ? "Deleting…" : "Delete permanently"}
                    </button>
                  </div>
                </div>
              )}
              {message && (
                <div
                  className={`form-message form-message--${messageTone}`}
                  role={messageTone === "error" ? "alert" : "status"}
                >
                  {message}
                </div>
              )}
            </div>
            {gpxImportSheetOpen && (
              <div
                className="sheet-backdrop gpx-import-backdrop"
                onClick={(event) => {
                  event.stopPropagation();
                  setGpxImportSheetOpen(false);
                }}
              >
                <section
                  className="sheet profile-collection-sheet gpx-import-sheet"
                  onClick={(event) => event.stopPropagation()}
                  aria-modal="true"
                  role="dialog"
                  aria-labelledby="gpx-import-sheet-title"
                >
                  <button
                    className="icon-button walking-stats-back"
                    type="button"
                    onClick={() => setGpxImportSheetOpen(false)}
                    aria-label="Back to profile"
                  >
                    <ArrowLeftIcon />
                  </button>
                  <button
                    className="icon-button sheet__close"
                    type="button"
                    onClick={() => {
                      setGpxImportSheetOpen(false);
                      onClose();
                    }}
                    aria-label="Close GPX import"
                  >
                    <XIcon />
                  </button>
                  <div className="eyebrow">Your data</div>
                  <h2 id="gpx-import-sheet-title">Import GPX</h2>
                  <div className="gpx-import-sheet__content">
                    <p className="gpx-import-sheet__file-description">
                      Export a GPX file from Strava or most activity apps, then
                      add it to your map here.
                    </p>
                    <section className="gpx-import-sheet__privacy">
                      <strong>Your import stays private</strong>
                      <p>
                        Imported routes add new ground to your map but don’t
                        unlock achievements. Cities from an import are only
                        added to the leaderboard when you add them to your
                        public snapshot.
                      </p>
                      <a
                        className="account-import-help"
                        href="https://www.youtube.com/watch?v=zpBD1PVCqhY"
                        target="_blank"
                        rel="noreferrer"
                      >
                        <InfoIcon size={13} strokeWidth={2} />
                        Exporting from Strava
                      </a>
                    </section>
                    <section
                      className="gpx-import-sheet__file"
                      aria-label="Import a GPX file from your device"
                    >
                      <span
                        className="gpx-import-sheet__file-mark"
                        aria-hidden="true"
                      >
                        <RouteIcon size={20} strokeWidth={2} />
                      </span>
                      <span>
                        <strong>Choose a GPX file</strong>
                      </span>
                      <label
                        className={
                          gpxImportPending
                            ? "account-import account-import--pending"
                            : "account-import"
                        }
                        htmlFor="gpx-file-input"
                      >
                        {gpxImportPending ? "Importing…" : "Select file"}
                        <input
                          id="gpx-file-input"
                          className="account-import-input"
                          type="file"
                          accept=".gpx,application/gpx+xml,application/xml,text/xml"
                          disabled={gpxImportPending}
                          onChange={handleGpxFileChange}
                        />
                      </label>
                    </section>

                    <section
                      className="gpx-import-sheet__history"
                      aria-labelledby="gpx-import-history-title"
                    >
                      <strong id="gpx-import-history-title">
                        Imported routes
                      </strong>
                      {gpxImportedRoutes.length === 0 ? (
                        <p>
                          No GPX routes imported yet. Routes you import will
                          appear here.
                        </p>
                      ) : (
                        <ul>
                          {gpxImportedRoutes.map((route) => (
                            <li key={route.id}>
                              <button
                                type="button"
                                className="gpx-import-sheet__history-route"
                                onClick={() => onShowGpxImportRoute(route.id)}
                                aria-label={`Show imported route ${route.title} on the map`}
                              >
                                <strong>{route.title}</strong>
                                <span className="gpx-import-sheet__history-meta">
                                  <time
                                    dateTime={new Date(
                                      route.addedAt,
                                    ).toISOString()}
                                  >
                                    Added {formatGpxImportDate(route.addedAt)}
                                  </time>
                                  {route.addedKm > 0 && (
                                    <span>
                                      +{formatGpxImportDistance(route.addedKm)}{" "}
                                      added
                                    </span>
                                  )}
                                </span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </section>
                  </div>
                </section>
              </div>
            )}
            {notificationSettingsSheetOpen && (
              <div
                className="sheet-backdrop gpx-import-backdrop"
                onClick={(event) => {
                  event.stopPropagation();
                  setNotificationSettingsSheetOpen(false);
                }}
              >
                <section
                  className="sheet profile-collection-sheet notification-settings-sheet"
                  onClick={(event) => event.stopPropagation()}
                  aria-modal="true"
                  role="dialog"
                  aria-labelledby="notification-settings-sheet-title"
                >
                  <button
                    className="icon-button walking-stats-back"
                    type="button"
                    onClick={() => setNotificationSettingsSheetOpen(false)}
                    aria-label="Back to profile"
                  >
                    <ArrowLeftIcon />
                  </button>
                  <button
                    className="icon-button sheet__close"
                    type="button"
                    onClick={() => {
                      setNotificationSettingsSheetOpen(false);
                      onClose();
                    }}
                    aria-label="Close notification settings"
                  >
                    <XIcon />
                  </button>
                    <div className="eyebrow">
                      Your reminders
                  </div>
                  <h2 id="notification-settings-sheet-title">Notifications</h2>
                  <div className="notification-settings-sheet__content">
                    <p>
                      Choose the discovery nudges you want to receive. You can
                      change these at any time.
                    </p>
                    {notificationError && (
                      <div
                        className="form-message form-message--error"
                        role="alert"
                      >
                        {notificationError}
                      </div>
                    )}
                    <section
                      className="account-settings-panel"
                      aria-label="Notification settings"
                    >
                      <div className="account-setting account-setting--all">
                        <div>
                          <strong>All notifications</strong>
                          <p>Turn all notifications on or off at once.</p>
                        </div>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={allNotificationsEnabled}
                          aria-label={
                            allNotificationsEnabled
                              ? "Turn all notifications off"
                              : "Turn all notifications on"
                          }
                          disabled={reminderPending || notificationPending}
                          onClick={() => {
                            setNotificationPending(true);
                            setNotificationError("");
                            setReminderError("");
                            void onAllNotificationsChange(
                              !allNotificationsEnabled,
                            )
                              .then((error) =>
                                setNotificationError(error ?? ""),
                              )
                              .finally(() => setNotificationPending(false));
                          }}
                        >
                          {allNotificationsEnabled
                            ? "Turn all off"
                            : "Turn all on"}
                        </button>
                      </div>
                      <div className="account-setting">
                        <div>
                          <strong>Discovery reminders</strong>
                          <p>
                            Get notified after five minutes of exploring through
                            an unmapped area. While tracking, Hecate also
                            suggests stopping after{" "}
                            {INACTIVITY_REMINDER_MINUTES} minutes in one place.
                            Reminder locations are never saved or synced.
                          </p>
                        </div>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={reminderEnabled}
                          aria-label="Walking reminders"
                          disabled={reminderPending}
                          onClick={() => {
                            setReminderPending(true);
                            setReminderError("");
                            void onReminderChange(!reminderEnabled)
                              .then((error) => setReminderError(error ?? ""))
                              .finally(() => setReminderPending(false));
                          }}
                        >
                          {reminderEnabled ? "On" : "Off"}
                        </button>
                      </div>
                      {reminderError && (
                        <div
                          className="form-message form-message--error"
                          role="alert"
                        >
                          {reminderError}
                        </div>
                      )}
                      {[
                        [
                          "morningInvite",
                          "Daily discovery reminder",
                          "Receive a friendly morning reminder to get outside and add distance to your map.",
                        ] as const,
                        [
                          "weeklyRecap",
                          "Weekly progress summary",
                          "Receive a Sunday evening summary of your new ground, distance walked, current streak, and next milestone.",
                        ] as const,
                        [
                          "streakReminder",
                          "Streak reminder",
                          "Receive a 6 PM reminder when you have not walked that day and your current streak is at risk.",
                        ] as const,
                      ].map(([category, title, description]) => (
                        <div className="account-setting" key={category}>
                          <div>
                            <strong>{title}</strong>
                            <p>{description}</p>
                          </div>
                          <button
                            type="button"
                            role="switch"
                            aria-checked={
                              activityNotificationPreferences[category]
                            }
                            aria-label={title}
                            disabled={notificationPending}
                            onClick={() => {
                              setNotificationPending(true);
                              setNotificationError("");
                              void onActivityNotificationChange(
                                category,
                                !activityNotificationPreferences[category],
                              )
                                .then((error) =>
                                  setNotificationError(error ?? ""),
                                )
                                .finally(() => setNotificationPending(false));
                            }}
                          >
                            {activityNotificationPreferences[category]
                              ? "On"
                              : "Off"}
                          </button>
                        </div>
                      ))}
                    </section>
                  </div>
                </section>
              </div>
            )}
          </>
        ) : isSyncConfigured ? (
          <div className="auth-panel">
            <div
              className="auth-methods"
              role="tablist"
              aria-label={
                passwordIntent === "signup"
                  ? "Account action"
                  : "Sign-in method"
              }
            >
              {passwordIntent === "signup" ? (
                <>
                  <button
                    type="button"
                    role="tab"
                    aria-selected="true"
                    className="active"
                    onClick={beginAccountCreation}
                  >
                    Sign up
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected="false"
                    onClick={() => {
                      setPasswordIntent("signin");
                      setPassword("");
                      setConfirmPassword("");
                      setMessage("");
                    }}
                  >
                    Log in
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={signInMethod === "password"}
                    className={signInMethod === "password" ? "active" : ""}
                    onClick={() => {
                      setSignInMethod("password");
                      setMessage("");
                    }}
                  >
                    Password
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={signInMethod === "link"}
                    className={signInMethod === "link" ? "active" : ""}
                    onClick={() => {
                      setSignInMethod("link");
                      setMessage("");
                    }}
                  >
                    Email link
                  </button>
                </>
              )}
            </div>
            <form className="auth-form" onSubmit={signIn}>
              <label htmlFor="email">Email address</label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                onFocus={keepAuthFieldVisible}
                required
              />
              {signInMethod === "password" && (
                <>
                  <label htmlFor="password">Password</label>
                  <input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder={
                      passwordIntent === "signup"
                        ? "At least 8 characters"
                        : "Your password"
                    }
                    autoComplete={
                      passwordIntent === "signup"
                        ? "new-password"
                        : "current-password"
                    }
                    onFocus={keepAuthFieldVisible}
                    minLength={passwordIntent === "signup" ? 8 : undefined}
                    required
                  />
                  {passwordIntent === "signup" && (
                    <>
                      <label htmlFor="confirm-password">Confirm password</label>
                      <input
                        id="confirm-password"
                        type="password"
                        value={confirmPassword}
                        onChange={(event) =>
                          setConfirmPassword(event.target.value)
                        }
                        placeholder="Type your password again"
                        autoComplete="new-password"
                        onFocus={keepAuthFieldVisible}
                        minLength={8}
                        required
                      />
                    </>
                  )}
                </>
              )}
              <button
                className="auth-submit"
                type="submit"
                disabled={authPending}
              >
                {authPending
                  ? passwordIntent === "signup" && signInMethod === "password"
                    ? "Creating account…"
                    : signInMethod === "password"
                      ? "Signing in…"
                      : "Sending…"
                  : signInMethod === "link"
                    ? "Send sign-in link"
                    : passwordIntent === "signup"
                      ? "Create account"
                      : "Sign in"}
              </button>
              {signInMethod === "password" && passwordIntent === "signin" && (
                <div className="auth-switch">
                  <span>New to Hecate?</span>
                  <button type="button" onClick={beginAccountCreation}>
                    Create account
                  </button>
                </div>
              )}
              {signInMethod === "link" && (
                <div className="auth-switch">
                  <span>New to Hecate?</span>
                  <button type="button" onClick={beginAccountCreation}>
                    Create account
                  </button>
                </div>
              )}
              {message && (
                <div
                  className={`form-message form-message--${messageTone}`}
                  role={messageTone === "error" ? "alert" : "status"}
                >
                  {message}
                </div>
              )}
            </form>
          </div>
        ) : (
          <div className="setup-note">
            <span>Sync preview</span>
            Add Supabase keys from <code>.env.example</code> to enable private
            account sync.
          </div>
        )}
        <section className="account-project-support" aria-label="Support Hecate">
          <strong>Enjoying Hecate?</strong>
          <p>
            If Hecate adds a little discovery to your day, consider buying me a
            coffee to support its development.
          </p>
          <button
            type="button"
            onClick={() => void openCoffeeSupport()}
          >
            <CoffeeIcon size={18} />
            Buy me a coffee
          </button>
        </section>
        <nav className="account-legal-links" aria-label="Legal and support">
          <a href="/privacy-policy.html">Privacy Policy</a>
          <span aria-hidden="true">·</span>
          <a href="/support.html">Support</a>
        </nav>
      </section>
    </div>
  );
}
