import { MAP_REWARD_PALETTES } from "../mapRewardPalette";
import { personalAchievementDefinition, type PersonalAchievementId } from "../achievements";
import { t } from "../i18n";
import type { MAP_REWARDS, MapReward } from "../goalRewards";

type MapRewardCardProps = {
  onRequiredAchievementOpen: (id: PersonalAchievementId) => void;
  reward: (typeof MAP_REWARDS)[number];
  unlocked: boolean;
  isNew: boolean;
  selected: boolean;
  onSelect: (reward: MapReward) => void;
  expanded: boolean;
  onPreview: () => void;
};

/** Show the required achievement while keeping locked appearances previewable. */
export function MapRewardCard({ reward, isNew, unlocked, selected, onSelect, expanded, onPreview, onRequiredAchievementOpen }: MapRewardCardProps) {
  const previewId = `reward-preview-${reward.id}`;
  const palette = MAP_REWARD_PALETTES[reward.id];
  const achievement = personalAchievementDefinition(reward.goal);
  return (
    <div className={`achievement-reward${unlocked ? "" : " achievement-reward--locked"}`} data-testid={`reward-${reward.id}`}>
      <button
        type="button"
        className="achievement-reward__swatch"
        style={{ background: palette.land }}
        data-testid={`preview-${reward.id}`}
        aria-label={`${t("Preview reward")}: ${t(reward.title)}${unlocked ? "" : ` · ${t("Locked")}`}`}
        aria-expanded={expanded}
        aria-controls={previewId}
        onClick={onPreview}
      >
        <MapRewardArtwork reward={reward} />
        {isNew && <span className="achievement-reward__new" data-testid={`new-${reward.id}`}>{t("New")}</span>}
        {!unlocked && <span className="achievement-reward__locked-badge" data-testid={`locked-${reward.id}`}>
          <svg viewBox="0 0 20 20" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><rect x="4" y="8" width="12" height="9" rx="2" /><path d="M7 8V5a3 3 0 0 1 6 0v3" /></svg>
          {t("Locked")}
        </span>}
        <span className="achievement-reward__zoom" aria-hidden="true"><MapPreviewIcon /></span>
      </button>
      <div className="achievement-reward__details">
        <strong>{t(reward.title)}</strong>
        <small>{t(unlocked ? "Unlocked with {{value0}}" : "Unlock with {{value0}}", { value0: achievement.title })}</small>
        <button
          className="achievement-reward__select"
          type="button"
          data-testid={unlocked ? `apply-${reward.id}` : `how-to-unlock-${reward.id}`}
          aria-pressed={unlocked ? selected : undefined}
          disabled={selected}
          onClick={() => unlocked ? onSelect(reward.id) : onRequiredAchievementOpen(reward.goal)}
        >
          <svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
            {selected ? <path d="m4 10 4 4 8-8" /> : unlocked ? <path d="M4 10h12m-5-5 5 5-5 5" /> : <><rect x="4" y="8" width="12" height="9" rx="2" /><path d="M7 8V5a3 3 0 0 1 6 0v3" /></>}
          </svg>
          {t(selected ? "Selected" : unlocked ? "Select" : "View achievement")}
        </button>
      </div>

    </div>
  );
}

export function MapRewardArtwork({ reward }: Pick<MapRewardCardProps, "reward">) {
  const palette = MAP_REWARD_PALETTES[reward.id];
  return (
    <svg viewBox="0 0 320 150" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <path fill={palette.water} d="M0 0H75C65 40 130 45 110 80S70 120 130 150H0Z" />
      {reward.id !== "paper" && <path fill={palette.building} d="M145 10h40v30h-40zM205 10h40v30h-40zM265 10h45v30h-45zM145 60h40v35h-40zM205 60h40v35h-40zM265 60h45v35h-45zM145 115h40v30h-40zM205 115h40v30h-40zM265 115h45v30h-45z" />}
      <path fill="none" stroke={palette.road} strokeWidth="3" d="M135 0V150M195 0V150M255 0V150M105 50H320M115 105H320M100 150L290 0" />
      <path d="M135 128V105H255V50H285" fill="none" stroke={palette.routeHalo} strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M135 128V105H255V50H285" fill="none" stroke={palette.route} strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
      {reward.id === "midnight" && <g fill={palette.text} opacity="0.75"><circle cx="22" cy="25" r="1" /><circle cx="55" cy="105" r="0.8" /><circle cx="116" cy="20" r="1.1" /><circle cx="195" cy="32" r="0.8" /><circle cx="290" cy="122" r="1" /></g>}
      <circle cx="135" cy="128" r="6" fill={reward.id === "paper" ? "#000000" : "#27aee8"} stroke="white" strokeWidth="2.5" />
    </svg>
  );
}

export function MapPreviewIcon() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></svg>;
}
