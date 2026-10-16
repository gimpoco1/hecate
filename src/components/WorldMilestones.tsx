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
  return `${distanceKm.toLocaleString(undefined, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  })} km`;
}

function formatWalkingStatDistance(distanceKm: number): string {
  return `${distanceKm.toLocaleString(undefined, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })} km`;
}

function formatWalkingStatDate(timestamp: number | null): string {
  if (timestamp === null) return "—";
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(timestamp));
}

function formatStreak(days: number): string {
  return `${days} ${days === 1 ? "day" : "days"}`;
}

type WorldMilestonesProps = {
  travelledKm: number;
};

export function WorldMilestones({ travelledKm }: WorldMilestonesProps) {
  const current = currentWorldMilestone(travelledKm);
  const next = nextWorldMilestone(travelledKm);
  const remainingKm = next ? Math.max(0, next.thresholdKm - travelledKm) : 0;

  return (
    <section className="world-milestones" aria-labelledby="world-milestones-title">
      <div className="world-milestones__heading">
        <span id="world-milestones-title">Global milestones</span>
        <small>{formatWorldMilestoneDistance(travelledKm)} travelled</small>
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
                <small className="world-milestones__remaining">
                  {formatWorldMilestoneDistance(remainingKm)} to go
                </small>
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
  onBack: () => void;
  onClose: () => void;
};

export function GlobalMilestonesSheet({
  open,
  discoveryDistance,
  travelledKm,
  walkingStats,
  discoveredCityCount,
  onBack,
  onClose,
}: GlobalMilestonesSheetProps) {
  if (!open) return null;
  const current = currentWorldMilestone(travelledKm);
  const next = nextWorldMilestone(travelledKm);
  const level = WORLD_MILESTONE_TIERS.findIndex(({ id }) => id === current.id) + 1;
  const remainingKm = next ? Math.max(0, next.thresholdKm - travelledKm) : 0;
  const progress = worldMilestoneProgress(travelledKm);

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
          aria-label="Back to profile"
        >
          <ArrowLeftIcon />
        </button>
        <button
          className="icon-button sheet__close"
          type="button"
          onClick={onClose}
          aria-label="Close walking stats"
        >
          <XIcon />
        </button>
        <div className="eyebrow">Walking stats</div>
        <h2 id="walking-stats-title">Walking stats</h2>
        <p>Your recorded journeys, personal bests, and worldwide progress.</p>
        <section className="walking-stats-overview" aria-label="Walking overview">
          <div className="walking-stats-overview__rank">
            <span className="walking-stats-overview__icon" aria-hidden="true">
              <WorldMilestoneIcon icon={current.icon} />
            </span>
            <span>
              <span>
                <small>Lv. {level}</small>
                <strong>{current.title}</strong>
              </span>
              <small>
                {next
                  ? `${formatWalkingStatDistance(remainingKm)} to the next rank`
                  : "All global ranks complete"}
              </small>
            </span>
          </div>
          <div className="walking-stats-overview__progress" aria-hidden="true">
            <span style={{ width: `${progress * 100}%` }} />
          </div>
          <div className="walking-stats-overview__metrics">
            <span>
              <strong>{formatWalkingStatDistance(discoveryDistance)}</strong>
              <small>New ground</small>
            </span>
            <span>
              <strong>{formatWalkingStatDistance(travelledKm)}</strong>
              <small>Travelled</small>
            </span>
            <span>
              <strong>{walkingStats.walkCount}</strong>
              <small>{walkingStats.walkCount === 1 ? "Walk" : "Walks"}</small>
            </span>
            <span>
              <strong>{discoveredCityCount}</strong>
              <small>{discoveredCityCount === 1 ? "City" : "Cities"}</small>
            </span>
          </div>
        </section>
        <section className="walking-personal-bests" aria-labelledby="personal-bests-title">
          <h3 id="personal-bests-title">Personal bests</h3>
          <dl>
            <div>
              <dt>Longest walk</dt>
              <dd>
                <strong>{formatWalkingStatDistance(walkingStats.longestWalkKm)}</strong>
                <small>{formatWalkingStatDate(walkingStats.longestWalkFinishedAt)}</small>
              </dd>
            </div>
            <div>
              <dt>Average per walk</dt>
              <dd>{formatWalkingStatDistance(walkingStats.averageWalkKm)}</dd>
            </div>
            <div>
              <dt>Current streak</dt>
              <dd>{formatStreak(walkingStats.currentStreakDays)}</dd>
            </div>
            <div>
              <dt>Best streak</dt>
              <dd>{formatStreak(walkingStats.bestStreakDays)}</dd>
            </div>
            <div>
              <dt>First walk</dt>
              <dd>{formatWalkingStatDate(walkingStats.firstWalkAt)}</dd>
            </div>
          </dl>
        </section>
        <WorldMilestones travelledKm={travelledKm} />
      </section>
    </div>
  );
}
