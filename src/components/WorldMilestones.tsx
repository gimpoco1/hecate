import { t, useAppTranslation, currentLanguage } from "../i18n";
import { useLayoutEffect, useRef, useState } from "react";
import {
  mdiAccessPoint,
  mdiAirplane,
  mdiEarth,
  mdiEarthArrowDown,
  mdiHomeOutline,
  mdiMapOutline,
  mdiMoonWaningCrescent,
  mdiOrbitVariant,
  mdiRun,
  mdiWalk,
} from "@mdi/js";
import {
  currentWorldMilestone,
  nextWorldMilestone,
  WORLD_MILESTONE_TIERS,
  worldMilestoneProgress,
  type WorldMilestoneTier,
} from "../badges";
import { ArrowLeftIcon, XIcon } from "./Icons";
import type { WalkingStats } from "../walkingStats";

type WorldMilestoneIconProps = {
  icon: WorldMilestoneTier["icon"];
};

export function WorldMilestoneIcon({ icon }: WorldMilestoneIconProps) {
  useAppTranslation();
  const paths: Record<WorldMilestoneTier["icon"], string> = {
    step: mdiWalk,
    map: mdiMapOutline,
    home: mdiHomeOutline,
    run: mdiRun,
    plane: mdiAirplane,
    signal: mdiAccessPoint,
    moon: mdiMoonWaningCrescent,
    "earth-depth": mdiEarthArrowDown,
    globe: mdiEarth,
    "moon-stars": mdiOrbitVariant,
  };
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d={paths[icon]} />
    </svg>
  );
}

function formatWorldMilestoneDistance(distanceKm: number): string {
  const fractionDigits = Number.isInteger(distanceKm) ? 0 : 1;
  return `${distanceKm.toLocaleString(currentLanguage(), {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  })} km`;
}

function formatWalkingStatDistance(distanceKm: number): string {
  return `${distanceKm.toLocaleString(currentLanguage(), {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })} km`;
}

function formatWalkingStatDate(timestamp: number | null): string {
  if (timestamp === null) return "—";
  return new Intl.DateTimeFormat(currentLanguage(), {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(timestamp));
}

function formatStreak(days: number): string {
  return t("day", { count: days });
}

type WorldMilestonesProps = {
  travelledKm: number;
};

export function WorldMilestones({ travelledKm }: WorldMilestonesProps) {
  useAppTranslation();
  const current = currentWorldMilestone(travelledKm);
  const next = nextWorldMilestone(travelledKm);
  const remainingKm = next ? Math.max(0, next.thresholdKm - travelledKm) : 0;

  return (
    <section className="world-milestones" aria-labelledby="world-milestones-title">
      <div className="world-milestones__heading">
        <span id="world-milestones-title">{t("Global milestones")}</span>
        <small>{t("{{value0}} travelled", { value0: formatWorldMilestoneDistance(travelledKm) })}</small>
      </div>
      <ol>
        {WORLD_MILESTONE_TIERS.map((tier) => {
          const earned = travelledKm >= tier.thresholdKm;
          const isCurrent = tier.id === current.id;
          return (
            <li
              key={tier.id}
              className={earned ? "world-milestones__earned" : ""}
              aria-current={isCurrent ? "step" : undefined}
            >
              <span className="world-milestones__track" aria-hidden="true">
                <span />
              </span>
              <span className="world-milestones__icon">
                <WorldMilestoneIcon icon={tier.icon} />
              </span>
              <span className="world-milestones__identity">
                <strong>{tier.title}</strong>
                <small>{formatWorldMilestoneDistance(tier.thresholdKm)}</small>
              </span>
              {isCurrent && next && (
                <small className="world-milestones__remaining">{t("{{value0}} to go", { value0: formatWorldMilestoneDistance(remainingKm) })}</small>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

type GlobalMilestonesSheetProps = {
  open: boolean;
  discoveryDistance: number;
  travelledKm: number;
  walkingStats: WalkingStats;
  discoveredCityCount: number;
  backLabel: string;
  onBack: () => void;
  onClose: () => void;
};

type WalkingStatsOverviewProps = {
  discoveryDistance: number;
  travelledKm: number;
  walkingStats: WalkingStats;
  discoveredCityCount: number;
};

type WalkingPersonalBestsProps = {
  walkingStats: WalkingStats;
  headingId: string;
};

export function WalkingStatsOverview({
  discoveryDistance,
  travelledKm,
  walkingStats,
  discoveredCityCount,
}: WalkingStatsOverviewProps) {
  useAppTranslation();
  const current = currentWorldMilestone(travelledKm);
  const next = nextWorldMilestone(travelledKm);
  const level = WORLD_MILESTONE_TIERS.findIndex(({ id }) => id === current.id) + 1;
  const remainingKm = next ? Math.max(0, next.thresholdKm - travelledKm) : 0;
  const progress = worldMilestoneProgress(travelledKm);
  const headerRef = useRef<HTMLDivElement>(null);
  const rankRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLElement>(null);
  const heroRef = useRef<HTMLDivElement>(null);
  const [heroFits, setHeroFits] = useState(false);
  const discoveryLabel = t("New ground");
  const discoveryValue = formatWalkingStatDistance(discoveryDistance);
  const levelLabel = t("Lv. {{value0}}", { value0: level });

  useLayoutEffect(() => {
    const header = headerRef.current;
    const rank = rankRef.current;
    const title = titleRef.current;
    const hero = heroRef.current;
    if (!header || !rank || !title || !hero) throw new Error("Journey overview layout elements are missing.");
    const measure = (): void => {
      const titleRow = title.parentElement;
      const icon = rank.firstElementChild;
      const badge = titleRow?.firstElementChild;
      if (!titleRow || !icon || !badge) throw new Error("Journey overview level title, icon, or badge is missing.");
      const requiredRankWidth = icon.getBoundingClientRect().width
        + Number.parseFloat(getComputedStyle(rank).columnGap)
        + badge.getBoundingClientRect().width
        + Number.parseFloat(getComputedStyle(titleRow).columnGap)
        + title.scrollWidth;
      const gap = Number.parseFloat(getComputedStyle(header).columnGap);
      setHeroFits(requiredRankWidth + gap + hero.getBoundingClientRect().width <= header.clientWidth);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(header);
    observer.observe(rank);
    observer.observe(hero);
    observer.observe(title);
    return () => observer.disconnect();
  }, [current.title, discoveryValue, discoveryLabel, levelLabel]);

  return (
    <section className={`walking-stats-overview${heroFits ? "" : " walking-stats-overview--compact"}`} aria-label={t("Walking overview")}>
      <div ref={headerRef} className="walking-stats-overview__header">
        <div ref={rankRef} className="walking-stats-overview__rank">
          <span className="walking-stats-overview__icon" aria-hidden="true">
            <WorldMilestoneIcon icon={current.icon} />
          </span>
          <span>
            <span>
              <small>{levelLabel}</small>
              <strong ref={titleRef}>{current.title}</strong>
            </span>
            <small>
              {next
                ? t("{{value0}} to the next rank", { value0: formatWalkingStatDistance(remainingKm) })
                : t("All global ranks complete")}
            </small>
          </span>
        </div>
        <div ref={heroRef} className="walking-stats-overview__hero" aria-hidden={!heroFits}>
          <strong>{discoveryValue}</strong>
          <small>{discoveryLabel}</small>
        </div>
      </div>
      <div className="walking-stats-overview__progress" aria-hidden="true">
        <span style={{ width: `${progress * 100}%` }} />
      </div>
      <div className="walking-stats-overview__metrics">
        {!heroFits && <span>
          <strong>{discoveryValue}</strong>
          <small>{discoveryLabel}</small>
        </span>}
        <span>
          <strong>{formatWalkingStatDistance(travelledKm)}</strong>
          <small>{t("Travelled")}</small>
        </span>
        <span>
          <strong>{walkingStats.walkCount}</strong>
          <small>{t("walkLabel", { count: walkingStats.walkCount })}</small>
        </span>
        <span>
          <strong>{discoveredCityCount}</strong>
          <small>{t("cityLabel", { count: discoveredCityCount })}</small>
        </span>
      </div>
    </section>
  );
}

export function WalkingPersonalBests({
  walkingStats,
  headingId,
}: WalkingPersonalBestsProps) {
  useAppTranslation();
  return (
    <section className="walking-personal-bests" aria-labelledby={headingId}>
      <h3 id={headingId}>{t("Personal bests")}</h3>
      <dl>
        <div>
          <dt>{t("Longest walk")}</dt>
          <dd>
            <strong>{formatWalkingStatDistance(walkingStats.longestWalkKm)}</strong>
            <small>{formatWalkingStatDate(walkingStats.longestWalkFinishedAt)}</small>
          </dd>
        </div>
        <div>
          <dt>{t("Average per walk")}</dt>
          <dd>{formatWalkingStatDistance(walkingStats.averageWalkKm)}</dd>
        </div>
        <div>
          <dt>{t("Current streak")}</dt>
          <dd>{formatStreak(walkingStats.currentStreakDays)}</dd>
        </div>
        <div>
          <dt>{t("Best streak")}</dt>
          <dd>{formatStreak(walkingStats.bestStreakDays)}</dd>
        </div>
        <div>
          <dt>{t("First walk")}</dt>
          <dd>{formatWalkingStatDate(walkingStats.firstWalkAt)}</dd>
        </div>
      </dl>
    </section>
  );
}

export function GlobalMilestonesSheet({
  open,
  discoveryDistance,
  travelledKm,
  walkingStats,
  discoveredCityCount,
  backLabel,
  onBack,
  onClose,
}: GlobalMilestonesSheetProps) {
  useAppTranslation();
  if (!open) return null;

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <section
        className="sheet global-milestones-sheet"
        onClick={(event) => event.stopPropagation()}
        aria-modal="true"
        role="dialog"
        aria-labelledby="walking-stats-title"
      >
        <button
          className="icon-button walking-stats-back"
          type="button"
          onClick={onBack}
          aria-label={backLabel}
        >
          <ArrowLeftIcon />
        </button>
        <button
          className="icon-button sheet__close"
          type="button"
          onClick={onClose}
          aria-label={t("Close walking stats")}
        >
          <XIcon />
        </button>
        <div className="eyebrow">{t("Your activity")}</div>
        <h2 id="walking-stats-title">{t("Walking stats")}</h2>
        <p>{t("Your recorded journeys, personal bests, and worldwide progress.")}</p>
        <WalkingStatsOverview
          discoveryDistance={discoveryDistance}
          travelledKm={travelledKm}
          walkingStats={walkingStats}
          discoveredCityCount={discoveredCityCount}
        />
        <WalkingPersonalBests
          walkingStats={walkingStats}
          headingId="walking-stats-personal-bests-title"
        />
        <WorldMilestones travelledKm={travelledKm} />
      </section>
    </div>
  );
}
