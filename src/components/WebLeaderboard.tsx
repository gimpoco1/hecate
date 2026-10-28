import { AuthEntry } from "./AuthEntry";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import type { User } from "@supabase/supabase-js";
import { personalAchievementDefinition } from "../achievements";
import { authRedirectUrl } from "../auth";
import { setAppearancePreference } from "../appearance";
import {
  leaderboardCityHash,
  leaderboardCitySlug,
  leaderboardCitySlugFromHash,
} from "../routes";
import { earnedCityMilestones } from "../badges";
import { AchievementArtwork } from "./AchievementArtwork";
import { AchievementCard } from "./AchievementCard";
import { CityLevelStars } from "./CityLevelStars";
import { TopographyBackground } from "./TopographyBackground";
import {
  buildLeaderboardSnapshot,
  displayNameForUser,
  leaderboardSnapshotForCities,
  LEADERBOARD_CALCULATION_VERSION,
  loadLeaderboardCities,
  loadCityExplorers,
  loadLeaderboardEntry,
  type LeaderboardCitySummary,
  loadMyLeaderboardProfile,
  publishLeaderboardSnapshot,
  unpublishLeaderboardSnapshot,
  type LeaderboardEntry,
  type LeaderboardProfile,
  type LeaderboardSnapshot,
} from "../leaderboard";
import {
  isAutomaticUpdatesEnabled,
  setAutomaticUpdatesEnabled,
} from "../automaticUpdates";
import { createRequestGuard } from "../requestGuard";
import { isSyncConfigured, supabase } from "../storage";
import { ChevronIcon, HecateMark, UserIcon, XIcon } from "./Icons";

const APP_STORE_URL = "https://apps.apple.com/app/hecate-explore/id6811544963";
const APP_DEEP_LINK = "hecate://open";
const APP_STORE_BADGE_URL =
  "https://tools.applemediaservices.com/api/badges/download-on-the-app-store/black/en-us?size=250x83";

function formatDistance(value: number) {
  if (value < 1) return `${Math.round(value * 1_000)} m`;
  return `${value.toFixed(value >= 10 ? 1 : 2)} km`;
}

function formatPercentage(value: number) {
  if (value > 0 && value < 0.1) return "<0.1%";
  if (value < 10) return `${value.toFixed(1)}%`;
  return `${Math.round(value)}%`;
}

function relativeUpdate(value: string) {
  const elapsed = Math.max(0, Date.now() - new Date(value).getTime());
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 1) return "Just updated";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "Yesterday" : `${days}d ago`;
}

function ExplorerAvatar({ name, rank }: { name: string; rank?: number }) {
  return (
    <span
      className={`leaderboard-avatar leaderboard-avatar--${rank ?? "row"}`}
      aria-hidden="true"
    >
      {name.trim().charAt(0).toUpperCase()}
    </span>
  );
}

function ExplorerProfilePanel({
  entry,
  onClose,
}: {
  entry: LeaderboardEntry | null;
  onClose: () => void;
}) {
  if (!entry) return null;
  const cityMilestones = entry.cities.flatMap((city) =>
    earnedCityMilestones(city.cityId, city.cityName, city.discoveredKm),
  );
  const personalAchievements = entry.achievements.map(
    personalAchievementDefinition,
  );

  return (
    <div className="explorer-profile-backdrop" onClick={onClose}>
      <aside
        className="explorer-profile"
        data-testid="leaderboard-explorer-profile"
        role="dialog"
        aria-modal="true"
        aria-labelledby="explorer-profile-title"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          className="leaderboard-panel__close"
          type="button"
          onClick={onClose}
          aria-label="Close explorer profile"
        >
          <XIcon />
        </button>
        <div className="explorer-profile__identity">
          <ExplorerAvatar name={entry.displayName} />
          <div>
            <div className="eyebrow">Explorer passport</div>
            <h2 id="explorer-profile-title">{entry.displayName}</h2>
          </div>
        </div>
        <div className="explorer-profile__summary">
          <span>
            <strong>{formatDistance(entry.totalDiscoveredKm)}</strong>
            <small>shared ground</small>
          </span>
          <span>
            <strong>{entry.cities.length}</strong>
            <small>shared cities</small>
          </span>
          <span>
            <strong>{personalAchievements.length}</strong>
            <small>achievements earned</small>
          </span>
        </div>
        {personalAchievements.length > 0 && (
          <section
            className="explorer-achievements"
            aria-labelledby="achievements-title"
          >
            <div>
              <div className="eyebrow">Earned achievements</div>
              <h3 id="achievements-title">Stories from the map.</h3>
            </div>
            <ul>
              {personalAchievements.map((achievement) => (
                <li key={achievement.id}>
                  <AchievementCard achievement={achievement} />
                </li>
              ))}
            </ul>
          </section>
        )}
        <section className="explorer-passport" aria-labelledby="passport-title">
          <div>
            <div className="eyebrow">City stars</div>
            <h3 id="passport-title">Places made personal.</h3>
          </div>
          {cityMilestones.length ? (
            <ul>
              {cityMilestones.map((milestone) => (
                <li
                  key={`${milestone.cityId}:${milestone.id}`}
                  className={`passport-badge passport-badge--${milestone.level}`}
                >
                  <span className="passport-badge__seal" aria-hidden="true">
                    <AchievementArtwork
                      image={milestone.image}
                      title={milestone.title}
                      size={38}
                    />
                  </span>
                  <span>
                    <strong>{milestone.title}</strong>
                    <small>{milestone.cityName}</small>
                    <small className="passport-badge__meaning">
                      {milestone.thresholdKm} km of new ground
                    </small>
                  </span>
                  <CityLevelStars level={milestone.level} />
                </li>
              ))}
            </ul>
          ) : (
            <div className="explorer-passport__empty">
              The first star unlocks after 5 km of new ground in a shared city.
            </div>
          )}
        </section>
        <p className="explorer-profile__privacy">
          Earned achievements and the city totals this explorer chose to share
          are shown. Routes and locations remain private.
        </p>
      </aside>
    </div>
  );
}

type AccountPanelProps = {
  open: boolean;
  user: User | null;
  entryId: string | null;
  publishedDisplayName: string | null;
  displayNameChanges: number;
  profileLoaded: boolean;
  publishedCityIds: string[];
  onClose: () => void;
  onPublished: () => Promise<void>;
  onPublishSuccess: (message: string) => void;
};

function LeaderboardAccountPanel({
  open,
  user,
  entryId,
  publishedDisplayName,
  displayNameChanges,
  profileLoaded,
  publishedCityIds,
  onClose,
  onPublished,
  onPublishSuccess,
}: AccountPanelProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [snapshot, setSnapshot] = useState<LeaderboardSnapshot | null>(null);
  const [selectedCityIds, setSelectedCityIds] = useState<string[]>([]);
  const [loadingSnapshot, setLoadingSnapshot] = useState(false);
  const [pending, setPending] = useState(false);
  const [unpublishing, setUnpublishing] = useState(false);
  const [autoUpdatesEnabled, setAutoUpdatesEnabled] = useState(
    isAutomaticUpdatesEnabled,
  );
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);
  const displayNameDirty = useRef(false);
  const citySelectionDirty = useRef(false);
  const snapshotRequestGuard = useRef(createRequestGuard());

  useEffect(() => {
    if (!open) {
      snapshotRequestGuard.current.invalidate();
      setLoadingSnapshot(false);
      displayNameDirty.current = false;
      citySelectionDirty.current = false;
      return;
    }
    if (!user) {
      setDisplayName("");
      displayNameDirty.current = false;
      return;
    }
    if (!displayNameDirty.current) {
      setDisplayName(displayNameForUser(user, publishedDisplayName));
    }
  }, [open, publishedDisplayName, user]);

  useEffect(() => {
    if (!open || !user) return;
    const refreshSnapshot = () => {
      setLoadingSnapshot(
        snapshot?.calculationVersion !== LEADERBOARD_CALCULATION_VERSION,
      );
      setMessage("");
      const isCurrentRequest = snapshotRequestGuard.current.begin();
      void buildLeaderboardSnapshot(user.id)
        .then((nextSnapshot) => {
          if (isCurrentRequest()) setSnapshot(nextSnapshot);
        })
        .catch(() => {
          if (!isCurrentRequest()) return;
          setError(true);
          setMessage(
            "Your private discovery data could not be loaded. Try again in a moment.",
          );
        })
        .finally(() => {
          if (isCurrentRequest()) setLoadingSnapshot(false);
        });
    };

    if (snapshot?.calculationVersion !== LEADERBOARD_CALCULATION_VERSION) {
      refreshSnapshot();
    }

    return () => snapshotRequestGuard.current.invalidate();
  }, [open, snapshot?.calculationVersion, user]);

  useEffect(() => {
    if (!open || !snapshot || citySelectionDirty.current) return;
    const availableCityIds = snapshot.cities
      .filter((city) => Math.round(city.discoveredKm * 1_000) > 0)
      .map((city) => city.cityId);
    const previouslyPublished = new Set(publishedCityIds);
    const nextSelection = entryId
      ? availableCityIds.filter((cityId) => previouslyPublished.has(cityId))
      : availableCityIds;
    setSelectedCityIds(nextSelection);
  }, [entryId, open, publishedCityIds, snapshot]);

  if (!open) return null;

  const signIn = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!supabase) return;
    setPending(true);
    setMessage("");
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setError(Boolean(signInError));
    setMessage(signInError?.message ?? "");
    setPending(false);
  };

  const sendLink = async () => {
    if (!supabase || !email.trim()) {
      setError(true);
      setMessage("Enter your email address first.");
      return;
    }
    setPending(true);
    const { error: linkError } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: authRedirectUrl(),
        shouldCreateUser: false,
      },
    });
    setError(Boolean(linkError));
    setMessage(
      linkError?.message ?? "Check your inbox for your Hecate sign-in link.",
    );
    setPending(false);
  };

  const publish = async () => {
    if (!user || displayName.trim().length < 2) {
      setError(true);
      setMessage("Choose a public name with at least 2 characters.");
      return;
    }
    if (!selectedCityIds.length) {
      setError(true);
      setMessage("Choose at least one city to share.");
      return;
    }
    setPending(true);
    setMessage("");
    try {
      // Never trust a preview left in memory across a code update or a newly
      // synced walk. Rebuild the canonical snapshot at the moment of consent.
      const currentSnapshot = await buildLeaderboardSnapshot(user.id);
      setSnapshot(currentSnapshot);
      const selectedCities = currentSnapshot.cities.filter((city) =>
        selectedCityIds.includes(city.cityId),
      );
      if (!selectedCities.length) {
        throw new Error("Choose at least one city to share.");
      }
      await publishLeaderboardSnapshot(displayName, {
        ...leaderboardSnapshotForCities(currentSnapshot, selectedCityIds),
        achievements: currentSnapshot.achievements,
      }, user.id);
      await onPublished();
      displayNameDirty.current = false;
      citySelectionDirty.current = false;
      setError(false);
      onPublishSuccess(
        entryId
          ? "Your public ranking is up to date."
          : "You are now on the leaderboard.",
      );
    } catch (caught) {
      const detail =
        caught && typeof caught === "object" && "message" in caught
          ? String(caught.message)
          : "";
      setError(true);
      setMessage(
        detail.includes("already taken")
          ? "That public name is already taken. Choose another one."
          : detail.includes("only be changed once")
            ? "Your public name has already been changed once and is now locked."
            : detail === "Choose at least one city to share."
              ? detail
              : "Your ranking could not be published. Try again in a moment.",
      );
    } finally {
      setPending(false);
    }
  };

  const unpublish = async () => {
    setPending(true);
    setUnpublishing(true);
    setMessage("");
    try {
      await unpublishLeaderboardSnapshot();
      await onPublished();
      setError(false);
      setMessage(
        "Your public snapshot has been removed. Your private discoveries are unchanged.",
      );
    } catch {
      setError(true);
      setMessage("Unable to remove your public snapshot right now.");
    } finally {
      setUnpublishing(false);
      setPending(false);
    }
  };

  return (
    <div className="leaderboard-panel-backdrop" onClick={onClose}>
      <aside
        className="leaderboard-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="leaderboard-panel-title"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          className="leaderboard-panel__close"
          type="button"
          onClick={onClose}
          aria-label="Close"
        >
          <XIcon />
        </button>
        <div className="eyebrow">Your public snapshot</div>
        <h2 id="leaderboard-panel-title">Choose what you share.</h2>
        <p>
          Hecate only publishes totals for the cities you select below. Your
          routes, locations, and discovery map always stay private.
        </p>
        {!isSyncConfigured ? (
          <div className="leaderboard-message leaderboard-message--error">
            Account sync is not configured for this build.
          </div>
        ) : !user ? (
          <div className="auth-panel">
            <AuthEntry disabled={pending} onPendingChange={setPending}>
              <form className="leaderboard-signin" onSubmit={signIn}>
                <fieldset className="auth-form-fields" disabled={pending}>
                  <label htmlFor="leaderboard-email">Email</label>
                  <input
                    id="leaderboard-email"
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    autoComplete="email"
                    required
                    placeholder="you@example.com"
                  />
                  <label htmlFor="leaderboard-password">Password</label>
                  <input
                    id="leaderboard-password"
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    autoComplete="current-password"
                    required
                    placeholder="Your password"
                  />
                  <button
                    className="leaderboard-primary-button"
                    type="submit"
                    disabled={pending}
                  >
                    {pending ? "Signing in…" : "Sign in"}
                  </button>
                  <button
                    className="leaderboard-link-button"
                    type="button"
                    onClick={() => void sendLink()}
                    disabled={pending}
                  >
                    Email me a sign-in link
                  </button>
                </fieldset>
              </form>
            </AuthEntry>
          </div>
        ) : (
          <>
            <div className="leaderboard-account-line">
              <ExplorerAvatar name={displayName || user.email || "Explorer"} />
              <span>
                <strong>{user.email}</strong>
                <small>Private Hecate account</small>
              </span>
            </div>
            <label
              className="leaderboard-name-field"
              htmlFor="leaderboard-name"
            >
              Public name
              <input
                id="leaderboard-name"
                value={displayName}
                onChange={(event) => {
                  displayNameDirty.current = true;
                  setDisplayName(event.target.value.slice(0, 30));
                }}
                minLength={2}
                maxLength={30}
                disabled={!profileLoaded || displayNameChanges >= 1}
              />
              <small className="leaderboard-name-help">
                {!profileLoaded
                  ? "Loading your public profile…"
                  : displayNameChanges >= 1
                    ? "Your public name is locked. Contact support to request a change."
                    : publishedDisplayName
                      ? "You can change your public name one more time."
                      : "Choose carefully. You can change this name once later."}
              </small>
            </label>
            <fieldset className="leaderboard-city-sharing">
              <legend>Cities to share</legend>
              <div className="leaderboard-city-sharing__actions">
                <span>Only checked cities appear publicly.</span>
                <button
                  type="button"
                  onClick={() => {
                    citySelectionDirty.current = true;
                    setSelectedCityIds(
                      snapshot?.cities
                        .filter(
                          (city) => Math.round(city.discoveredKm * 1_000) > 0,
                        )
                        .map((city) => city.cityId) ?? [],
                    );
                  }}
                >
                  Select all
                </button>
              </div>
              <div className="leaderboard-city-sharing__list">
                {snapshot?.cities
                  .filter((city) => Math.round(city.discoveredKm * 1_000) > 0)
                  .map((city) => {
                    const milestones = earnedCityMilestones(
                      city.cityId,
                      city.cityName,
                      city.discoveredKm,
                    );
                    const latestMilestone = milestones.at(-1);
                    return (
                      <label key={city.cityId}>
                        <input
                          type="checkbox"
                          checked={selectedCityIds.includes(city.cityId)}
                          onChange={(event) => {
                            citySelectionDirty.current = true;
                            setSelectedCityIds((current) =>
                              event.target.checked
                                ? [...current, city.cityId]
                                : current.filter(
                                    (cityId) => cityId !== city.cityId,
                                  ),
                            );
                          }}
                        />
                        <span className="leaderboard-city-sharing__artwork">
                          {latestMilestone ? (
                            <>
                              <AchievementArtwork
                                image={latestMilestone.image}
                                title={latestMilestone.title}
                                size={28}
                              />
                              <CityLevelStars level={latestMilestone.level} />
                            </>
                          ) : (
                            <CityLevelStars level={0} />
                          )}
                        </span>
                        <span className="leaderboard-city-sharing__identity">
                          <span>{city.cityName}</span>
                          <small>
                            {latestMilestone?.title ??
                              "First Footprint at 5 km"}
                          </small>
                        </span>
                        <strong>{formatDistance(city.discoveredKm)}</strong>
                      </label>
                    );
                  })}
              </div>
            </fieldset>
            <section
              className="leaderboard-achievement-preview"
              aria-labelledby="public-achievements-title"
            >
              <div>
                <strong id="public-achievements-title">
                  Public achievements
                </strong>
                <span>All earned achievements appear automatically.</span>
              </div>
              {snapshot?.achievements.length ? (
                <ul>
                  {snapshot.achievements.map((achievementId) => {
                    const achievement =
                      personalAchievementDefinition(achievementId);
                    return (
                      <li key={achievementId}>
                        <AchievementArtwork
                          image={achievement.image}
                          title={achievement.title}
                          size={30}
                        />
                        <span>{achievement.title}</span>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p>Your first earned achievement will appear here.</p>
              )}
            </section>
            <div className="leaderboard-preview" aria-busy={loadingSnapshot}>
              <div>
                <small>Shared ground</small>
                <strong>
                  {loadingSnapshot
                    ? "—"
                    : formatDistance(
                        snapshot?.cities
                          .filter((city) =>
                            selectedCityIds.includes(city.cityId),
                          )
                          .reduce(
                            (total, city) => total + city.discoveredKm,
                            0,
                          ) ?? 0,
                      )}
                </strong>
              </div>
              <div>
                <small>Cities</small>
                <strong>
                  {loadingSnapshot ? "—" : selectedCityIds.length}
                </strong>
              </div>
              <div>
                <small>Achievements</small>
                <strong>{snapshot?.achievements.length ?? 0} earned</strong>
              </div>
            </div>
            <div className="leaderboard-settings-row">
              <div>
                <small>Live data</small>
                <strong>Automatic data updates</strong>
              </div>
              <button
                type="button"
                className={`leaderboard-toggle ${autoUpdatesEnabled ? "is-on" : ""}`}
                role="switch"
                aria-checked={autoUpdatesEnabled}
                onClick={() => {
                  const next = !autoUpdatesEnabled;
                  setAutoUpdatesEnabled(next);
                  setAutomaticUpdatesEnabled(next);
                }}
              >
                {autoUpdatesEnabled ? "On" : "Off"}
              </button>
            </div>
            <div className="leaderboard-publishing-actions">
              <button
                className="leaderboard-primary-button"
                type="button"
                onClick={() => void publish()}
                disabled={
                  pending || loadingSnapshot || !snapshot || !profileLoaded
                }
              >
                {pending && !unpublishing
                  ? "Updating…"
                  : entryId
                    ? "Update my ranking"
                    : "Publish my ranking"}
              </button>
              {entryId && (
                <button
                  className="leaderboard-unpublish"
                  type="button"
                  onClick={() => void unpublish()}
                  disabled={pending}
                >
                  {unpublishing
                    ? "Stopping sharing…"
                    : "Stop sharing my ranking"}
                </button>
              )}
            </div>
            <div className="leaderboard-footer-actions">
              <button
                className="leaderboard-link-button"
                type="button"
                onClick={() => void supabase?.auth.signOut()}
                disabled={pending}
              >
                Sign out
              </button>
            </div>
          </>
        )}
        {message && (
          <div
            className={`leaderboard-message ${error ? "leaderboard-message--error" : ""}`}
            role={error ? "alert" : "status"}
          >
            {message}
          </div>
        )}
      </aside>
    </div>
  );
}

export function WebLeaderboard() {
  const [cityGroups, setCityGroups] = useState<LeaderboardCitySummary[]>([]);
  const [linkedCity, setLinkedCity] = useState<LeaderboardCitySummary | null>(null);
  const [hasMoreCities, setHasMoreCities] = useState(false);
  const [cityExplorers, setCityExplorers] = useState<LeaderboardCitySummary['explorers']>([]);
  const [myEntry, setMyEntry] = useState<LeaderboardEntry | null>(null);
  const [focusedEntry, setFocusedEntry] = useState<LeaderboardEntry | null>(null);
  const [pagePending, setPagePending] = useState(false);
  const refreshPending = useRef(false);
  const cityPageCount = useRef(1);
  const [focusedCitySlug, setFocusedCitySlug] = useState<string | null>(() =>
    leaderboardCitySlugFromHash(window.location.hash),
  );
  const [focusedEntryId, setFocusedEntryId] = useState<string | null>(null);
  const [showingMoreCities, setShowingMoreCities] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [panelOpen, setPanelOpen] = useState(false);
  const [rankingToast, setRankingToast] = useState("");
  const [user, setUser] = useState<User | null>(null);
  const [myProfile, setMyProfile] = useState<LeaderboardProfile | null>(null);
  const [profileLoadedUserId, setProfileLoadedUserId] = useState<string | null>(
    null,
  );
  const boardRef = useRef<HTMLElement | null>(null);
  const userIdRef = useRef<string | null>(null);
  userIdRef.current = user?.id ?? null;

  const navigateToCity = (cityName: string | null): void => {
    setShowingMoreCities(false);
    const hash = leaderboardCityHash(cityName);
    if (window.location.hash !== hash) {
      window.history.pushState(
        null,
        "",
        `${window.location.pathname}${window.location.search}${hash}`,
      );
    }
    setFocusedCitySlug(leaderboardCitySlugFromHash(hash));
  };

  useEffect(() => {
    const syncCityFromUrl = (): void => {
      setShowingMoreCities(false);
      setFocusedCitySlug(leaderboardCitySlugFromHash(window.location.hash));
    };
    window.addEventListener("popstate", syncCityFromUrl);
    window.addEventListener("hashchange", syncCityFromUrl);
    return () => {
      window.removeEventListener("popstate", syncCityFromUrl);
      window.removeEventListener("hashchange", syncCityFromUrl);
    };
  }, []);

  const refresh = async () => {
    if (refreshPending.current) return;
    refreshPending.current = true;
    try {
      const pages: LeaderboardCitySummary[] = [];
      for (let page = 0; page < cityPageCount.current; page += 1) {
        const cities = await loadLeaderboardCities(page * 50, null);
        pages.push(...cities);
        if (cities.length < 50) break;
      }
      setCityGroups(pages);
      setHasMoreCities(pages.length === cityPageCount.current * 50);
      setLoadError("");
    } catch {
      setLoadError("The live leaderboard is temporarily unavailable.");
    } finally {
      refreshPending.current = false;
      setLoading(false);
    }
  };

  const refreshMine = async () => {
    const expectedUserId = userIdRef.current;
    const [, profile] = await Promise.all([
      refresh(),
      expectedUserId ? loadMyLeaderboardProfile().catch(() => null) : null,
    ]);
    if (userIdRef.current !== expectedUserId) return;
    setMyProfile(profile);
    setMyEntry(profile?.entryId ? await loadLeaderboardEntry(profile.entryId) : null);
    setProfileLoadedUserId(expectedUserId);
  };

  useEffect(() => {
    void refresh();
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", refreshWhenVisible);
    if (!supabase) {
      return () =>
        document.removeEventListener("visibilitychange", refreshWhenVisible);
    }
    const client = supabase;
    let disposed = false;
    let fallbackInterval: number | null = null;
    let refreshTimer: number | null = null;
    const scheduleRefresh = () => {
      if (disposed || refreshTimer !== null || document.visibilityState === "hidden") return;
      refreshTimer = window.setTimeout(() => { refreshTimer = null; void refresh(); }, 2000);
    };
    const stopFallbackPolling = () => {
      if (fallbackInterval === null) return;
      window.clearInterval(fallbackInterval);
      fallbackInterval = null;
    };
    const startFallbackPolling = () => {
      if (fallbackInterval !== null) return;
      void refresh();
      fallbackInterval = window.setInterval(() => void refresh(), 20_000);
    };
    const channel = client
      .channel("public-leaderboard")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "leaderboard_entries" },
        scheduleRefresh,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "leaderboard_city_stats" },
        scheduleRefresh,
      )
      .subscribe((status) => {
        if (disposed) return;
        if (status === "SUBSCRIBED") {
          stopFallbackPolling();
        } else if (
          status === "TIMED_OUT" ||
          status === "CHANNEL_ERROR" ||
          status === "CLOSED"
        ) {
          startFallbackPolling();
        }
      });
    return () => {
      disposed = true;
      stopFallbackPolling();
      if (refreshTimer !== null) window.clearTimeout(refreshTimer);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
      void client.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    if (!rankingToast) return;
    const timer = window.setTimeout(() => setRankingToast(""), 4_500);
    return () => window.clearTimeout(timer);
  }, [rankingToast]);

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (active) setUser(data.session?.user ?? null);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      if (event === "SIGNED_OUT") setAppearancePreference("system");
      setUser(session?.user ?? null);
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!user) {
      setMyProfile(null);
      setMyEntry(null);
      setProfileLoadedUserId(null);
      return;
    }
    const expectedUserId = user.id;
    let active = true;
    setMyProfile(null);
    setMyEntry(null);
    setProfileLoadedUserId(null);
    void loadMyLeaderboardProfile()
      .then(async (profile) => {
        const entry = profile?.entryId ? await loadLeaderboardEntry(profile.entryId) : null;
        if (active && userIdRef.current === expectedUserId) {
          setMyProfile(profile);
          setMyEntry(entry);
        }
      })
      .catch(() => {
        if (active && userIdRef.current === expectedUserId) setMyProfile(null);
      })
      .finally(() => {
        if (active && userIdRef.current === expectedUserId)
          setProfileLoadedUserId(expectedUserId);
      });
    return () => {
      active = false;
    };
  }, [user?.id]);

  const remainingCities = cityGroups.slice(9);
  const focusedCity =
    cityGroups.find(
      (group) => leaderboardCitySlug(group.cityName) === focusedCitySlug,
    ) ?? linkedCity;
  useEffect(() => {
    setLinkedCity(null);
    if (!focusedCitySlug || cityGroups.some(group => leaderboardCitySlug(group.cityName) === focusedCitySlug)) return;
    let active = true;
    void loadLeaderboardCities(0, focusedCitySlug).then(groups => { if (active) setLinkedCity(groups[0] ?? null); })
      .catch(() => { if (active) setLoadError("This city could not be loaded. Try again."); });
    return () => { active = false; };
  }, [focusedCitySlug, cityGroups]);
  useEffect(() => {
    if (!focusedCity && !showingMoreCities) return;
    boardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [focusedCity?.cityId, showingMoreCities]);
  const profileLoaded = !user || profileLoadedUserId === user.id;
  const currentProfile = profileLoaded ? myProfile : null;
  const myEntryId = currentProfile?.entryId ?? null;

  useEffect(() => {
    setFocusedEntry(null);
    if (!focusedEntryId) return;
    let active = true;
    void loadLeaderboardEntry(focusedEntryId).then(entry => { if (active) setFocusedEntry(entry); })
      .catch(() => { if (active) setLoadError("This explorer’s profile could not be loaded. Try again."); });
    return () => { active = false; };
  }, [focusedEntryId]);

  useEffect(() => {
    setCityExplorers([]);
    if (!focusedCity) return;
    let active = true;
    void loadCityExplorers(focusedCity, 0).then(explorers => { if (active) setCityExplorers(explorers); })
      .catch(() => { if (active) setLoadError("This city’s ranking could not be loaded. Try again."); });
    return () => { active = false; };
  }, [focusedCity]);

  const moreCities = async (): Promise<void> => {
    setPagePending(true);
    try {
      const page = await loadLeaderboardCities(cityPageCount.current * 50, null);
      cityPageCount.current += 1;
      setCityGroups(current => [...current, ...page]);
      setHasMoreCities(page.length === 50);
    } catch { setLoadError("More cities could not be loaded. Try again."); }
    finally { setPagePending(false); }
  };

  const moreExplorers = async (): Promise<void> => {
    if (!focusedCity) return;
    setPagePending(true);
    try {
      const page = await loadCityExplorers(focusedCity, cityExplorers.length);
      setCityExplorers(current => [...current, ...page]);
    } catch { setLoadError("More explorers could not be loaded. Try again."); }
    finally { setPagePending(false); }
  };

  return (
    <main className="leaderboard-page" data-testid="leaderboard-page">
      {rankingToast && (
        <div
          className="account-toast account-toast--success"
          role="status"
          aria-live="polite"
        >
          <span className="account-toast__mark" aria-hidden="true">
            ✓
          </span>
          <span className="account-toast__message">{rankingToast}</span>
        </div>
      )}
      <TopographyBackground />
      <header className="leaderboard-header">
        <a
          className="leaderboard-brand"
          href="/"
          aria-label="Hecate leaderboard home"
        >
          <span>
            <HecateMark size={26} />
          </span>
          Hecate
        </a>
        <nav aria-label="Leaderboard navigation">
          <span>Leaderboard</span>
          <button type="button" data-testid="leaderboard-account-open" onClick={() => setPanelOpen(true)}>
            <UserIcon size={17} />
            {myEntryId ? "My ranking" : "Join the board"}
          </button>
        </nav>
      </header>

      <section className="leaderboard-hero">
        <div className="leaderboard-live">
          <span /> Live leaderboard
        </div>
        <h1>
          How much of the world
          <br />
          have you made yours?
        </h1>
        <p>
          Every walk reveals a little more. See who has uncovered the most new
          ground and how your favorite cities compare.
        </p>
        <div
          className="leaderboard-app-actions"
          aria-label="Get or open Hecate"
        >
          <a
            className="leaderboard-app-store-badge"
            href={APP_STORE_URL}
            target="_blank"
            rel="noreferrer"
            aria-label="Download Hecate on the App Store"
          >
            <img
              src={APP_STORE_BADGE_URL}
              alt="Download on the App Store"
              width="133"
              height="44"
            />
          </a>
          <a
            className="leaderboard-open-app-badge"
            href={APP_DEEP_LINK}
            aria-label="Open Hecate app"
          >
            <span aria-hidden="true">
              <HecateMark size={22} />
            </span>
            <span>
              <small>OPEN IN</small>
              <strong>Hecate</strong>
            </span>
          </a>
        </div>
      </section>

      <section
        ref={boardRef}
        className="leaderboard-board"
        aria-labelledby="ranking-title"
      >
        <div className="leaderboard-board__header">
          {focusedCity || showingMoreCities ? (
            <div className="city-detail-heading">
              <button type="button" onClick={() => navigateToCity(null)}>
                <ChevronIcon size={17} /> All cities
              </button>
              <div className="eyebrow">City leaderboard</div>
              <h2 id="ranking-title">
                {focusedCity ? focusedCity.cityName : "More cities"}
              </h2>
            </div>
          ) : (
            <div>
              <div className="eyebrow">City leaderboards</div>
              <h2 id="ranking-title">Discovery, place by place.</h2>
            </div>
          )}
          {focusedCity ? (
            <div className="city-detail-total">
              <strong>{formatDistance(focusedCity.totalDiscoveredKm)}</strong>
              <span>
                {focusedCity.explorerCount}{" "}
                {focusedCity.explorerCount === 1 ? "explorer" : "explorers"}{" "}
                · discovered together
              </span>
            </div>
          ) : (
            <p></p>
          )}
        </div>

        {loadError && (
          <div
            className="leaderboard-empty leaderboard-empty--error"
            role="alert"
          >
            {loadError}
            <button type="button" onClick={() => void refresh()}>
              Try again
            </button>
          </div>
        )}
        {!loadError && loading && (
          <div className="leaderboard-loading" role="status">
            <span />
            <span />
            <span />
          </div>
        )}
        {!loadError && !loading && !cityGroups.length && (
          <div className="leaderboard-empty">
            <HecateMark size={38} />
            <h3>The first place is waiting.</h3>
            <p>
              Publish a discovery snapshot to add the first city. Nothing is
              shared until you choose to.
            </p>
            <button type="button" onClick={() => setPanelOpen(true)}>
              Join the leaderboard
            </button>
          </div>
        )}

        {!focusedCity && !showingMoreCities && cityGroups.length > 0 && (
          <div className="city-treemap" aria-label="City rankings">
            {cityGroups.slice(0, 9).map((group, index) => {
              const size = Math.sqrt(
                group.totalDiscoveredKm / cityGroups[0].totalDiscoveredKm,
              );
              const compact =
                index >= 6 &&
                group.totalDiscoveredKm < cityGroups[0].totalDiscoveredKm * 0.1;
              const visibleExplorerCount = compact || index >= 2 ? 2 : 5;
              const myRank = group.explorers.findIndex(
                ({ entry }) => entry.entryId === myEntryId,
              );
              const myCity = myEntry?.cities.some(
                (city) => city.cityId === group.cityId,
              );
              const cityCard = (
                <article
                  key={group.cityId}
                  className={`city-treemap__tile${compact ? " city-treemap__tile--compact" : ""}${myCity ? " city-treemap__tile--personal" : ""}`}
                  style={
                    {
                      "--city-size": `${50 * size}%`,
                      "--city-grow": 1 + size,
                      "--city-height": `${compact ? 126 + 35 * size : 180 + 100 * size}px`,
                      "--city-title-size": `${16 + 11 * size}px`,
                    } as CSSProperties
                  }
                >
                  <button
                    className="city-treemap__open-card"
                    data-testid={`leaderboard-city-${group.cityId}`}
                    type="button"
                    aria-label={`View the ${group.cityName} ranking`}
                    onClick={() => navigateToCity(group.cityName)}
                  />
                  <span className="city-treemap__top">
                    <span className="city-treemap__number">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    {myCity && (
                      <span className="city-treemap__personal">
                        {myRank >= 0 ? `Your rank #${myRank + 1}` : "Your city"}
                      </span>
                    )}
                  </span>
                  <span className="city-treemap__content">
                    <span className="city-treemap__headline">
                      <span className="city-treemap__name">
                        {group.cityName}
                      </span>
                      <span className="city-treemap__distance">
                        {formatDistance(group.totalDiscoveredKm)}
                        <small>total</small>
                      </span>
                    </span>
                  </span>
                  <ol
                    className="city-treemap__leaders"
                    aria-label={`Top explorers in ${group.cityName}`}
                  >
                    {group.explorers
                      .slice(0, visibleExplorerCount)
                      .map(({ entry, city }, explorerIndex) => (
                        <li key={entry.entryId}>
                          <button
                            className="city-treemap__leader-button"
                            type="button"
                            onClick={() => setFocusedEntryId(entry.entryId)}
                            aria-label={`View ${entry.displayName}'s explorer passport`}
                          >
                            <span className="city-treemap__leader-rank">
                              {explorerIndex + 1}
                            </span>
                            <span
                              className="city-treemap__leader-avatar"
                              aria-hidden="true"
                            >
                              {entry.displayName.trim().charAt(0).toUpperCase()}
                            </span>
                            <span className="city-treemap__leader-name">
                              {entry.displayName}
                            </span>
                            {group.explorers.length > 1 && (
                              <strong>
                                {formatDistance(city.discoveredKm)}
                              </strong>
                            )}
                          </button>
                        </li>
                      ))}
                  </ol>
                  <span className="city-treemap__action" aria-hidden="true">
                    View city ranking <ChevronIcon size={14} />
                  </span>
                </article>
              );
              return (remainingCities.length > 0 || hasMoreCities) && index === 8 ? (
                <div
                  key={group.cityId}
                  className="city-treemap__last"
                  style={
                    {
                      "--city-size": `${50 * size}%`,
                      "--city-grow": 1 + size,
                    } as CSSProperties
                  }
                >
                  {cityCard}
                  <button
                    type="button"
                    className="city-treemap__more"
                    onClick={() => setShowingMoreCities(true)}
                  >
                    <strong>More cities</strong>
                    <span>
                      {remainingCities.length}{hasMoreCities ? "+" : ""} more <ChevronIcon size={16} />
                    </span>
                  </button>
                </div>
              ) : (
                cityCard
              );
            })}
          </div>
        )}

        {showingMoreCities && (
          <ol
            className="city-directory"
            start={10}
            aria-label="More city rankings"
          >
            {remainingCities.map((group, index) => (
              <li key={group.cityId}>
                <a href={leaderboardCityHash(group.cityName)}>
                  <span className="city-detail-list__rank">{index + 10}</span>
                  <strong>{group.cityName}</strong>
                  <span>
                    {formatDistance(group.totalDiscoveredKm)}{" "}
                    <small>total</small>
                  </span>
                  <ChevronIcon size={16} />
                </a>
              </li>
            ))}
          </ol>
        )}

        {showingMoreCities && hasMoreCities && (
          <button type="button" data-testid="leaderboard-more-cities" disabled={pagePending} onClick={() => void moreCities()}>Load more cities</button>
        )}

        {focusedCity && (
          <ol
            className="city-detail-list"
            data-testid="leaderboard-city-explorers"
            aria-label={`Top explorers in ${focusedCity.cityName}`}
          >
            {cityExplorers.map(({ entry, city }, index) => (
              <li
                key={entry.entryId}
                className={
                  entry.entryId === myEntryId ? "city-detail-list__mine" : ""
                }
              >
                <button
                  type="button"
                  data-testid={`leaderboard-explorer-${entry.entryId}`}
                  onClick={() => setFocusedEntryId(entry.entryId)}
                  aria-label={`View ${entry.displayName}'s explorer passport`}
                >
                  <span className="city-detail-list__rank">{index + 1}</span>
                  <ExplorerAvatar name={entry.displayName} />
                  <span className="city-detail-list__identity">
                    <strong>{entry.displayName}</strong>
                    <small>{relativeUpdate(entry.updatedAt)}</small>
                  </span>
                  <span className="city-detail-list__metric">
                    <strong>{formatDistance(city.discoveredKm)}</strong>
                    <small>
                      {formatPercentage(city.discoveredPercentage)} of{" "}
                      {focusedCity.cityName}
                    </small>
                  </span>
                </button>
              </li>
            ))}
          </ol>
        )}
        {focusedCity && cityExplorers.length > 0 && cityExplorers.length < focusedCity.explorerCount && (
          <button type="button" data-testid="leaderboard-more-explorers" disabled={pagePending} onClick={() => void moreExplorers()}>Load more explorers</button>
        )}
      </section>

      <section className="leaderboard-privacy">
        <span className="leaderboard-privacy__icon">✓</span>
        <div>
          <strong>Private until you say otherwise.</strong>
          <p>
            Your position and paths never appear here. The board shows only the
            public name and totals you choose to publish, and you can remove
            them at any time.
          </p>
        </div>
        <button type="button" onClick={() => setPanelOpen(true)}>
          Manage my snapshot <ChevronIcon size={17} />
        </button>
      </section>

      <footer className="leaderboard-footer">
        <span>Hecate · Discover your world</span>
        <nav>
          <a href="/privacy-policy.html">Privacy</a>
          <a href="/support.html">Support</a>
        </nav>
      </footer>
      <LeaderboardAccountPanel
        key={user?.id ?? "signed-out"}
        open={panelOpen}
        user={user}
        entryId={myEntryId}
        publishedDisplayName={currentProfile?.displayName ?? null}
        displayNameChanges={currentProfile?.displayNameChanges ?? 0}
        profileLoaded={profileLoaded}
        publishedCityIds={myEntry?.cities.map((city) => city.cityId) ?? []}
        onClose={() => setPanelOpen(false)}
        onPublished={refreshMine}
        onPublishSuccess={(message) => {
          setPanelOpen(false);
          setRankingToast(message);
        }}
      />
      <ExplorerProfilePanel
        entry={focusedEntry}
        onClose={() => setFocusedEntryId(null)}
      />
    </main>
  );
}
