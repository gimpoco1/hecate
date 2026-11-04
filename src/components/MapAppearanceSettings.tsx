import { StandardMapCard } from "./StandardMapCard";
import type { PersonalAchievementId } from "../achievements";
import { useLayoutEffect, useRef, useState } from "react";
import { t } from "../i18n";
import { MAP_REWARDS, type MapReward, type RewardState } from "../goalRewards";
import { MapRewardCard } from "./MapRewardCard";
import { MapRewardPreview } from "./MapRewardPreview";

type Props = {
  highlightedMapReward: MapReward | null;
  onRequiredAchievementOpen: (id: PersonalAchievementId) => void;
  rewards: RewardState;
  onView: (reward: MapReward) => void;
  onSelect: (reward: MapReward) => void;
};

export function MapAppearanceSettings({ rewards, onView, onSelect, onRequiredAchievementOpen, highlightedMapReward }: Props) {
  const [preview, setPreview] = useState<MapReward | null>(null);
  const targetRef = useRef<HTMLLIElement>(null);
  const [highlightVisible, setHighlightVisible] = useState(false);
  useLayoutEffect(() => {
    const target = targetRef.current;
    const sheet = target?.closest<HTMLElement>(".sheet");
    if (highlightedMapReward === null || !target || !sheet) return;
    const targetBounds = target.getBoundingClientRect();
    const sheetBounds = sheet.getBoundingClientRect();
    sheet.scrollTo({ top: sheet.scrollTop + targetBounds.top - sheetBounds.top - (sheet.clientHeight - targetBounds.height) / 2, behavior: "auto" });
    target.focus({ preventScroll: true });
    setHighlightVisible(true);
    const timeout = window.setTimeout(() => setHighlightVisible(false), 3_000);
    return () => window.clearTimeout(timeout);
  }, [highlightedMapReward]);
  return <section className="map-appearance-settings" aria-labelledby="map-appearances-title" data-testid="map-appearance-settings">
    <h3 id="map-appearances-title">{t("Map appearances")}</h3>
    <ul className="map-appearance-catalog">
      <li className="map-appearance-catalog__standard">
        <StandardMapCard selected={rewards.selected === "standard"} expanded={preview === "standard"} onSelect={() => onSelect("standard")} onPreview={() => setPreview(preview === "standard" ? null : "standard")} />
      </li>
      {MAP_REWARDS.map(reward => <li key={reward.id}
        ref={highlightedMapReward === reward.id ? targetRef : undefined}
        tabIndex={highlightedMapReward === reward.id ? -1 : undefined}
        className={highlightedMapReward === reward.id ? `map-appearance-target${highlightVisible ? " map-appearance-target--highlight" : ""}` : undefined}
      >
        <MapRewardCard
          reward={reward}
          isNew={rewards.unlocked.includes(reward.id) && !(rewards.viewed ?? []).includes(reward.id)}
          onRequiredAchievementOpen={onRequiredAchievementOpen}
          unlocked={rewards.unlocked.includes(reward.id)}
          selected={rewards.selected === reward.id}
          onSelect={reward => { onView(reward); onSelect(reward); }}
          expanded={preview === reward.id}
          onPreview={() => { if (rewards.unlocked.includes(reward.id)) onView(reward.id); setPreview(preview === reward.id ? null : reward.id); }}
        />
      </li>)}
    </ul>
    {preview === "standard" && <MapRewardPreview reward={{ id: "standard", title: "Standard map" }} />}
    {MAP_REWARDS.filter(reward => reward.id === preview).map(reward => <MapRewardPreview key={reward.id} reward={reward} />)}
  </section>;
}
