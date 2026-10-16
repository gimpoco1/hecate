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
import {
  CITY_MILESTONE_TIERS,
  currentWorldMilestone,
  nextWorldMilestone,
  WORLD_MILESTONE_TIERS,
  worldMilestoneProgress,
} from "../badges";
import { displayNameForUser, loadMyLeaderboardProfile } from "../leaderboard";
import type { FavoritePlace } from "../favoritePlaces";
import { hostedLeaderboardUrl, publicLeaderboardUrl } from "../routes";
import { AchievementArtwork } from "./AchievementArtwork";
import { CityLevelStars } from "./CityLevelStars";
import { WorldMilestoneIcon } from "./WorldMilestones";
import {
  ChevronIcon,
  InfoIcon,
  LeaderboardIcon,
  SaveIcon,
  XIcon,
} from "./Icons";
import type { Coordinate } from "../types";
import type { WalkingStats } from "../walkingStats";

type Props = {
  open: boolean;
  initialAuthIntent?: PasswordIntent;
  onClose: () => void;
  reminderEnabled: boolean;
  nativeApp: boolean;
  keyboardInset: number;
  cityProgress: {
    cityId: string;
    cityName: string;
    discoveredKm: number;
  } | null;
  discoveryDistance: number;
  travelledDistance: number;
  walkingStats: WalkingStats;
  discoveredCityCount: number;
  favoritePlaces: FavoritePlace[];
  onReminderChange: (enabled: boolean) => Promise<string | null>;
  onGpxImport: (file: File) => Promise<GpxImportResult>;
  onShowGpxImport: (points: Coordinate[]) => void;
  onWalkingStatsOpen: () => void;
  onSavedPlacesOpen: () => void;
};
type SignInMethod = "password" | "link";
type PasswordIntent = "signin" | "signup";
type MessageTone = "success" | "error";
type ToastTone = MessageTone | "info";
export type GpxImportResult = {
  message: string;
  tone: Exclude<ToastTone, "error">;
  points?: Coordinate[];
};

export function SyncSheet({
  open,
  initialAuthIntent = "signin",
  onClose,
  reminderEnabled,
  nativeApp,
  keyboardInset,
  cityProgress,
  discoveryDistance,
  travelledDistance,
  walkingStats,
  discoveredCityCount,
  favoritePlaces,
  onReminderChange,
  onGpxImport,
  onShowGpxImport,
  onWalkingStatsOpen,
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
  const [cityMilestoneInfoOpen, setCityMilestoneInfoOpen] = useState(false);

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
    if (!gpxToast) return;
    const timer = window.setTimeout(() => setGpxToast(null), 4_500);
    return () => window.clearTimeout(timer);
  }, [gpxToast]);

  useEffect(() => {
    if (!open) {
      setConfirmingDelete(false);
      setCityMilestoneInfoOpen(false);
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
  const cityMilestoneCount = cityProgress
    ? CITY_MILESTONE_TIERS.filter(
        (tier) => cityProgress.discoveredKm >= tier.thresholdKm,
      ).length
    : 0;
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
  const nextWorldRank = nextWorldMilestone(travelledDistance);
  const currentWorldRankLevel =
    WORLD_MILESTONE_TIERS.findIndex(({ id }) => id === currentWorldRank.id) + 1;
  const remainingWorldRankKm = nextWorldRank
    ? Math.max(0, nextWorldRank.thresholdKm - travelledDistance)
    : 0;
  const currentWorldRankProgress = worldMilestoneProgress(travelledDistance);

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

  const keepAuthFieldVisible = (event: React.FocusEvent<HTMLInputElement>) => {
    const field = event.currentTarget;
    window.setTimeout(() => {
      field.scrollIntoView({ block: "center", behavior: "smooth" });
    }, 80);
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
          {gpxToast.points && (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onShowGpxImport(gpxToast.points!);
                setGpxToast(null);
              }}
            >
              Show me in the map
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
            <button
              type="button"
              className="account-walking-stats"
              aria-label={`Open walking stats. Level ${currentWorldRankLevel}, ${currentWorldRank.title}. ${discoveryDistance.toFixed(1)} kilometers of new ground, ${travelledDistance.toFixed(1)} kilometers travelled across ${walkingStats.walkCount} walks and ${discoveredCityCount} cities.`}
              onClick={onWalkingStatsOpen}
            >
              <span className="account-walking-stats__rank-header">
                <span
                  className="account-walking-stats__rank-icon"
                  aria-hidden="true"
                >
                  <WorldMilestoneIcon icon={currentWorldRank.icon} />
                </span>
                <span className="account-walking-stats__rank">
                  <span>
                    <small>Lv. {currentWorldRankLevel}</small>
                    <strong>{currentWorldRank.title}</strong>
                  </span>
                  <small>
                    {nextWorldRank
                      ? `${remainingWorldRankKm.toFixed(1)} km to the next rank`
                      : "All global ranks complete"}
                  </small>
                </span>
              </span>
              <span className="account-walking-stats__hero">
                <strong>{discoveryDistance.toFixed(1)} km</strong>
                <small>Total new ground</small>
              </span>
              <span
                className="account-walking-stats__progress"
                aria-hidden="true"
              >
                <span style={{ width: `${currentWorldRankProgress * 100}%` }} />
              </span>
              <span className="account-walking-stats__metrics">
                <span>
                  <strong>{travelledDistance.toFixed(1)} km</strong>
                  <small>Total travelled</small>
                </span>
                <span>
                  <strong>{walkingStats.walkCount}</strong>
                  <small>
                    {walkingStats.walkCount === 1 ? "Walk" : "Walks"}
                  </small>
                </span>
                <span>
                  <strong>{discoveredCityCount}</strong>
                  <small>{discoveredCityCount === 1 ? "City" : "Cities"}</small>
                </span>
              </span>
              <span className="account-walking-stats__action">
                Walking stats
                <ChevronIcon size={16} strokeWidth={2.3} />
              </span>
            </button>
            <div className="account-profile-links">
              <button
                type="button"
                className="account-quick-link"
                aria-label="Open the public leaderboard"
                onClick={() => {
                  void openLeaderboard();
                }}
              >
                <span className="account-quick-link__identity">
                  <span className="account-quick-link__mark" aria-hidden="true">
                    <LeaderboardIcon size={17} />
                  </span>
                  <span>
                    <strong>Leaderboard</strong>
                    <small>City and overall ranking</small>
                  </span>
                </span>
                <span className="account-quick-link__action" aria-hidden="true">
                  Open
                  <ChevronIcon size={16} strokeWidth={2.3} />
                </span>
              </button>
              <button
                type="button"
                className="account-favorites"
                onClick={onSavedPlacesOpen}
                aria-label={`Open saved places. ${favoritePlaces.length} saved across ${favoriteCollectionCount} collections.`}
              >
                <span className="account-favorites__heading">
                  <span className="account-favorites__identity">
                    <span
                      className="account-favorites__mark"
                      aria-hidden="true"
                    >
                      <SaveIcon size={17} strokeWidth={2} />
                    </span>
                    <span>
                      <strong id="account-favorites-title">Saved places</strong>
                      <small>
                        {favoriteCollectionCount
                          ? `${favoriteCollectionCount} ${favoriteCollectionCount === 1 ? "collection" : "collections"}`
                          : "Your saved map collection"}
                      </small>
                    </span>
                  </span>
                  <span className="account-favorites__summary-meta">
                    <small>{favoritePlaces.length}</small>
                    <ChevronIcon size={16} strokeWidth={2.3} />
                  </span>
                </span>
              </button>
            </div>
            {reminderError && (
              <div className="form-message form-message--error" role="alert">
                {reminderError}
              </div>
            )}
            {cityProgress && (
              <section
                className="account-milestones"
                aria-labelledby="account-milestones-title"
              >
                <div className="account-milestones__heading">
                  <span>
                    <span className="account-milestones__title-row">
                      <strong id="account-milestones-title">
                        City milestones
                      </strong>
                      <button
                        type="button"
                        className="account-milestones__info-button"
                        aria-label="Why these city milestones are shown"
                        aria-expanded={cityMilestoneInfoOpen}
                        aria-controls="account-milestones-explanation"
                        onClick={() =>
                          setCityMilestoneInfoOpen((current) => !current)
                        }
                      >
                        <InfoIcon size={15} strokeWidth={1.9} />
                      </button>
                    </span>
                    <small>Your progress in {cityProgress.cityName}</small>
                  </span>
                  <small>
                    {cityMilestoneCount} / {CITY_MILESTONE_TIERS.length} earned
                  </small>
                </div>
                {cityMilestoneInfoOpen && (
                  <p
                    className="account-milestones__explanation"
                    id="account-milestones-explanation"
                    role="note"
                  >
                    This is the city you are currently in. Hecate shows one
                    city’s milestones at a time and updates this section when
                    your current city changes.
                  </p>
                )}
                <div className="account-milestones__list">
                  {CITY_MILESTONE_TIERS.map((milestone) => {
                    const earned =
                      cityProgress.discoveredKm >= milestone.thresholdKm;
                    const remainingKm = Math.max(
                      0,
                      milestone.thresholdKm - cityProgress.discoveredKm,
                    );
                    return (
                      <article
                        className={`account-milestone${earned ? "" : " account-milestone--locked"}`}
                        key={milestone.id}
                        aria-label={
                          earned
                            ? `${milestone.title} earned in ${cityProgress.cityName}`
                            : `${milestone.title} requires ${milestone.thresholdKm} kilometers in ${cityProgress.cityName}. ${remainingKm.toFixed(1)} kilometers remaining.`
                        }
                      >
                        <AchievementArtwork
                          image={milestone.image}
                          title={milestone.title}
                          size={48}
                        />
                        <strong>{milestone.title}</strong>
                        {earned ? (
                          <span className="account-milestone__goal">
                            Earned at {milestone.thresholdKm} km
                          </span>
                        ) : (
                          <span className="account-milestone__goal">
                            <strong>
                              {cityProgress.discoveredKm.toFixed(1)} /{" "}
                              {milestone.thresholdKm} km
                            </strong>
                            <small>{remainingKm.toFixed(1)} km left</small>
                          </span>
                        )}
                        <CityLevelStars level={milestone.level} decorative />
                      </article>
                    );
                  })}
                </div>
              </section>
            )}
            <section
              className="account-settings-panel"
              aria-label="Account settings"
            >
              <div className="account-settings-panel__header">Settings</div>
              <div className="account-setting">
                <div>
                  <strong>Live data</strong>
                  <p>
                    Refresh your leaderboard, badges, and public snapshot after
                    each completed tracking session unless you switch this off.
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
              <div className="account-setting">
                <div>
                  <strong>Discovery reminders</strong>
                  <p>
                    {nativeApp
                      ? "Get a reminder after five minutes moving through new areas. Opening it pauses reminders for 30 minutes. Reminder locations are not saved or synced."
                      : "Check for five minutes in unmapped areas while this page is open. Browsers cannot reliably monitor walks in the background."}
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={reminderEnabled}
                  aria-label="Discovery reminders"
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
              <section
                className="account-import-panel"
                aria-labelledby="account-import-title"
              >
                <div className="account-import-panel__row">
                  <div>
                  <strong id="account-import-title">Import GPX</strong>
                  <p>Add a past activity from Strava or another service.</p>
                  </div>
                  <label
                    className={
                      gpxImportPending
                        ? "account-import account-import--pending"
                        : "account-import"
                    }
                    htmlFor="gpx-file-input"
                  >
                    {gpxImportPending ? "Importing…" : "Choose file"}
                    <input
                      id="gpx-file-input"
                      className="account-import-input"
                      type="file"
                      accept=".gpx,application/gpx+xml,application/xml,text/xml"
                      disabled={gpxImportPending}
                      onChange={(event) => {
                        const file = event.currentTarget.files?.[0];
                        event.currentTarget.value = "";
                        if (!file) return;
                        setGpxImportPending(true);
                        setGpxToast(null);
                        void onGpxImport(file)
                          .then((result) => {
                            setGpxToast(result);
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
                      }}
                    />
                  </label>
                </div>
                <p className="account-import-panel__note">
                  Imported routes don’t unlock achievements. Progress from
                  imports in other cities is not added to the leaderboard
                  automatically; add those cities manually from your public
                  snapshot.
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
                      areas in the background, but iPhone may show a blue clock
                      for Hecate.
                    </p>
                    <p>
                      <strong>Always:</strong> Hecate can send background
                      reminders without showing the blue clock. Recording a walk
                      may still show it.
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
                      Areas revealed during the current recording count too. The
                      reminder is a suggestion; recording never stops
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
                <strong id="delete-account-title">Delete your account?</strong>
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
        <nav className="account-legal-links" aria-label="Legal and support">
          <a href="/privacy-policy.html">Privacy Policy</a>
          <span aria-hidden="true">·</span>
          <a href="/support.html">Support</a>
        </nav>
      </section>
    </div>
  );
}
