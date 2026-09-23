import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { User } from "@supabase/supabase-js";
import {
  personalAchievementDefinition,
  type PersonalAchievementId,
} from "../achievements";
import { authRedirectUrl } from "../auth";
import { earnedCityBadges } from "../badges";
import { AchievementArtwork } from "./AchievementArtwork";
import { AchievementCard } from "./AchievementCard";
import {
  buildLeaderboardSnapshot,
  cityLeaderboardGroups,
  displayNameForUser,
  leaderboardSnapshotForCities,
  LEADERBOARD_CALCULATION_VERSION,
  loadLeaderboard,
  loadMyLeaderboardProfile,
  publishLeaderboardSnapshot,
  unpublishLeaderboardSnapshot,
  type LeaderboardEntry,
  type LeaderboardProfile,
  type LeaderboardSnapshot,
} from "../leaderboard";
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
  const cityBadges = entry.cities.flatMap((city) =>
    earnedCityBadges(
      city.cityId,
      city.cityName,
      city.discoveredKm,
    ),
  );
  const personalAchievements = entry.achievements.map(
    personalAchievementDefinition,
  );

  return (
    <div className="explorer-profile-backdrop" onClick={onClose}>
      <aside
        className="explorer-profile"
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
            <strong>{cityBadges.length + personalAchievements.length}</strong>
            <small>badges earned</small>
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
            <div className="eyebrow">City badges</div>
            <h3 id="passport-title">Places made personal.</h3>
          </div>
          {cityBadges.length ? (
            <ul>
              {cityBadges.map((badge) => (
                <li
                  key={`${badge.cityId}:${badge.id}`}
                  className={`passport-badge passport-badge--${badge.level}`}
                >
                  <span className="passport-badge__seal" aria-hidden="true">
                    <AchievementArtwork
                      image={badge.image}
                      title={badge.title}
                      size={48}
                    />
                    <small>{badge.level}</small>
                  </span>
                  <span>
                    <strong>{badge.title}</strong>
                    <small>{badge.cityName}</small>
                  </span>
                  <em>{formatDistance(badge.thresholdKm)}</em>
                </li>
              ))}
            </ul>
          ) : (
            <div className="explorer-passport__empty">
              The first badge unlocks after 1 km of new ground in a shared city.
            </div>
          )}
        </section>
        <p className="explorer-profile__privacy">
          Only accomplishments and city totals this explorer chose to publish
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
  publishedAchievementIds: PersonalAchievementId[];
  onClose: () => void;
  onPublished: () => Promise<void>;
};

function LeaderboardAccountPanel({
  open,
  user,
  entryId,
  publishedDisplayName,
  displayNameChanges,
  profileLoaded,
  publishedCityIds,
  publishedAchievementIds,
  onClose,
  onPublished,
}: AccountPanelProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [snapshot, setSnapshot] = useState<LeaderboardSnapshot | null>(null);
  const [selectedCityIds, setSelectedCityIds] = useState<string[]>([]);
  const [selectedAchievementIds, setSelectedAchievementIds] = useState<
    PersonalAchievementId[]
  >([]);
  const [loadingSnapshot, setLoadingSnapshot] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);
  const displayNameDirty = useRef(false);
  const citySelectionDirty = useRef(false);
  const achievementSelectionDirty = useRef(false);

  useEffect(() => {
    if (!open) {
      setSnapshot(null);
      displayNameDirty.current = false;
      citySelectionDirty.current = false;
      achievementSelectionDirty.current = false;
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
    if (
      !open ||
      !user ||
      snapshot?.calculationVersion === LEADERBOARD_CALCULATION_VERSION
    )
      return;
    setLoadingSnapshot(true);
    setMessage("");
    void buildLeaderboardSnapshot(user.id)
      .then(setSnapshot)
      .catch(() => {
        setError(true);
        setMessage(
          "Your private discovery data could not be loaded. Try again in a moment.",
        );
      })
      .finally(() => setLoadingSnapshot(false));
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

  useEffect(() => {
    if (!open || !snapshot || achievementSelectionDirty.current) return;
    setSelectedAchievementIds(
      entryId ? publishedAchievementIds : snapshot.achievements,
    );
  }, [entryId, open, publishedAchievementIds, snapshot]);

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
        emailRedirectTo: authRedirectUrl('/leaderboard'),
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
      await publishLeaderboardSnapshot(
        displayName,
        {
          ...leaderboardSnapshotForCities(currentSnapshot, selectedCityIds),
          achievements: currentSnapshot.achievements.filter((achievementId) =>
            selectedAchievementIds.includes(achievementId),
          ),
        },
      );
      await onPublished();
      displayNameDirty.current = false;
      citySelectionDirty.current = false;
      achievementSelectionDirty.current = false;
      setError(false);
      setMessage(
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
          <form className="leaderboard-signin" onSubmit={signIn}>
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
          </form>
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
                  setDisplayName(event.target.value.slice(0, 30))
                }}
                minLength={2}
                maxLength={30}
                disabled={!profileLoaded || displayNameChanges >= 1}
              />
              <small className="leaderboard-name-help">
                {!profileLoaded
                  ? "Loading your public profile…"
                  : displayNameChanges >= 1
                    ? "Your public name is locked."
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
                          (city) =>
                            Math.round(city.discoveredKm * 1_000) > 0,
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
                  .filter(
                    (city) => Math.round(city.discoveredKm * 1_000) > 0,
                  )
                  .map((city) => (
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
                      <span>{city.cityName}</span>
                      <strong>{formatDistance(city.discoveredKm)}</strong>
                    </label>
                  ))}
              </div>
            </fieldset>
            <fieldset className="leaderboard-achievement-sharing">
              <legend>Achievements to share</legend>
              <div className="leaderboard-city-sharing__actions">
                <span>Share only the accomplishments you want featured.</span>
                {snapshot?.achievements.length ? (
                  <button
                    type="button"
                    onClick={() => {
                      achievementSelectionDirty.current = true;
                      setSelectedAchievementIds(snapshot.achievements);
                    }}
                  >
                    Select all
                  </button>
                ) : null}
              </div>
              {snapshot?.achievements.length ? (
                <div className="leaderboard-achievement-sharing__grid">
                  {snapshot.achievements.map((achievementId) => {
                    const achievement =
                      personalAchievementDefinition(achievementId);
                    return (
                      <label key={achievementId}>
                        <input
                          type="checkbox"
                          checked={selectedAchievementIds.includes(
                            achievementId,
                          )}
                          onChange={(event) => {
                            achievementSelectionDirty.current = true;
                            setSelectedAchievementIds((current) =>
                              event.target.checked
                                ? [...current, achievementId]
                                : current.filter(
                                    (currentId) => currentId !== achievementId,
                                  ),
                            );
                          }}
                        />
                        <AchievementArtwork
                          image={achievement.image}
                          title={achievement.title}
                          size={42}
                        />
                        <span>{achievement.title}</span>
                      </label>
                    );
                  })}
                </div>
              ) : (
                <p className="leaderboard-achievement-sharing__empty">
                  Your first personal achievement will appear here after a
                  qualifying discovery.
                </p>
              )}
            </fieldset>
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
                <small>Shared</small>
                <strong>{selectedAchievementIds.length} badges</strong>
              </div>
            </div>
            <button
              className="leaderboard-primary-button"
              type="button"
              onClick={() => void publish()}
              disabled={
                pending || loadingSnapshot || !snapshot || !profileLoaded
              }
            >
              {pending
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
                Stop sharing
              </button>
            )}
            <button
              className="leaderboard-link-button"
              type="button"
              onClick={() => void supabase?.auth.signOut()}
              disabled={pending}
            >
              Sign out
            </button>
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
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [focusedCityId, setFocusedCityId] = useState<string | null>(null);
  const [focusedEntryId, setFocusedEntryId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [panelOpen, setPanelOpen] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [myProfile, setMyProfile] = useState<LeaderboardProfile | null>(null);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const boardRef = useRef<HTMLElement | null>(null);

  const refresh = async () => {
    try {
      setEntries(await loadLeaderboard());
      setLoadError("");
    } catch {
      setLoadError("The live leaderboard is temporarily unavailable.");
    } finally {
      setLoading(false);
    }
  };

  const refreshMine = async () => {
    const [, profile] = await Promise.all([
      refresh(),
      user ? loadMyLeaderboardProfile().catch(() => null) : null,
    ]);
    setMyProfile(profile);
    setProfileLoaded(true);
  };

  useEffect(() => {
    void refresh();
    const interval = window.setInterval(() => void refresh(), 20_000);
    if (!supabase) return () => window.clearInterval(interval);
    const client = supabase;
    const channel = client
      .channel("public-leaderboard")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "leaderboard_entries" },
        () => void refresh(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "leaderboard_city_stats" },
        () => void refresh(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "leaderboard_achievements" },
        () => void refresh(),
      )
      .subscribe();
    return () => {
      window.clearInterval(interval);
      void client.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (active) setUser(data.session?.user ?? null);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) setUser(session?.user ?? null);
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!user) {
      setMyProfile(null);
      setProfileLoaded(true);
      return;
    }
    setProfileLoaded(false);
    void loadMyLeaderboardProfile()
      .then(setMyProfile)
      .catch(() => setMyProfile(null))
      .finally(() => setProfileLoaded(true));
  }, [user]);

  useEffect(() => {
    if (!focusedCityId) return;
    boardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [focusedCityId]);

  const cityGroups = useMemo(() => cityLeaderboardGroups(entries), [entries]);
  const focusedCity =
    cityGroups.find((group) => group.cityId === focusedCityId) ?? null;
  const totalCities = cityGroups.length;
  const totalDistance = entries.reduce(
    (sum, entry) => sum + entry.totalDiscoveredKm,
    0,
  );
  const myEntryId = myProfile?.entryId ?? null;
  const myEntry = entries.find((entry) => entry.entryId === myEntryId) ?? null;
  const focusedEntry =
    entries.find((entry) => entry.entryId === focusedEntryId) ?? null;

  return (
    <main className="leaderboard-page">
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
          <button type="button" onClick={() => setPanelOpen(true)}>
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
          ground—and how your favorite cities compare.
        </p>
        <div className="leaderboard-app-actions" aria-label="Get or open Hecate">
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
          {focusedCity ? (
            <div className="city-detail-heading">
              <button type="button" onClick={() => setFocusedCityId(null)}>
                <ChevronIcon size={17} /> All cities
              </button>
              <div className="eyebrow">City leaderboard</div>
              <h2 id="ranking-title">{focusedCity.cityName}</h2>
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
                {focusedCity.explorers.length}{" "}
                {focusedCity.explorers.length === 1 ? "explorer" : "explorers"}{" "}
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

        {!focusedCity && cityGroups.length > 0 && (
          <div
            className={`city-treemap${cityGroups.length > 2 ? " city-treemap--stacked" : ""}`}
            aria-label="City rankings"
            style={
              {
                "--city-stack-size": Math.max(cityGroups.length - 1, 1),
              } as CSSProperties
            }
          >
            {cityGroups.map((group, index) => (
              <article
                key={group.cityId}
                className={`city-treemap__tile${index === 0 ? " city-treemap__tile--featured" : ""}`}
              >
                <button
                  className="city-treemap__open-card"
                  type="button"
                  aria-label={`View the ${group.cityName} ranking`}
                  onClick={() => setFocusedCityId(group.cityId)}
                />
                <span className="city-treemap__number">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className="city-treemap__content">
                  <span className="city-treemap__name">{group.cityName}</span>
                  <span className="city-treemap__meta">
                    {formatDistance(group.totalDiscoveredKm)} ·{" "}
                    {group.explorers.length}{" "}
                    {group.explorers.length === 1 ? "explorer" : "explorers"}
                  </span>
                </span>
                <ol className="city-treemap__leaders" aria-label={`Top explorers in ${group.cityName}`}>
                  {group.explorers.slice(0, 5).map(({ entry, city }, explorerIndex) => (
                    <li key={entry.entryId}>
                      <button
                        className="city-treemap__leader-button"
                        type="button"
                        onClick={() => setFocusedEntryId(entry.entryId)}
                        aria-label={`View ${entry.displayName}'s explorer passport`}
                      >
                        <span className="city-treemap__leader-rank">{explorerIndex + 1}</span>
                        <span className="city-treemap__leader-avatar" aria-hidden="true">{entry.displayName.trim().charAt(0).toUpperCase()}</span>
                        <span className="city-treemap__leader-name">{entry.displayName}</span>
                        <strong>{formatDistance(city.discoveredKm)}</strong>
                      </button>
                    </li>
                  ))}
                </ol>
                <span
                  className="city-treemap__view-all"
                  aria-hidden="true"
                >
                  View all <ChevronIcon size={15} />
                </span>
              </article>
            ))}
          </div>
        )}

        {focusedCity && (
          <ol
            className="city-detail-list"
            aria-label={`Top explorers in ${focusedCity.cityName}`}
          >
            {focusedCity.explorers.map(({ entry, city }, index) => (
              <li
                key={entry.entryId}
                className={
                  entry.entryId === myEntryId ? "city-detail-list__mine" : ""
                }
              >
                <button
                  type="button"
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
        open={panelOpen}
        user={user}
        entryId={myEntryId}
        publishedDisplayName={myProfile?.displayName ?? null}
        displayNameChanges={myProfile?.displayNameChanges ?? 0}
        profileLoaded={profileLoaded}
        publishedCityIds={myEntry?.cities.map((city) => city.cityId) ?? []}
        publishedAchievementIds={myEntry?.achievements ?? []}
        onClose={() => setPanelOpen(false)}
        onPublished={refreshMine}
      />
      <ExplorerProfilePanel
        entry={focusedEntry}
        onClose={() => setFocusedEntryId(null)}
      />
    </main>
  );
}
