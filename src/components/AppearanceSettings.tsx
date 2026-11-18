import type { PersonalAchievementId } from "../achievements";
import type { RewardState, MapReward } from "../goalRewards";
import { MapAppearanceSettings } from "./MapAppearanceSettings";
import { t, useAppTranslation } from "../i18n";
import { errorDiagnostic } from "../diagnostics";
import { useState } from "react";
import { mdiMonitorCellphone, mdiWeatherNight, mdiWhiteBalanceSunny } from "@mdi/js";
import { setAppearancePreference, useAppearance, type AppearancePreference } from "../appearance";
import { AppIconSettings } from "./AppIconSettings";
import { selectionHaptic, errorHaptic } from "../haptics";

const choices: { value: AppearancePreference; label: string; icon: string }[] = [
  { value: "system", get label() { return t("System"); }, icon: mdiMonitorCellphone },
  { value: "light", get label() { return t("Light"); }, icon: mdiWhiteBalanceSunny },
  { value: "dark", get label() { return t("Dark"); }, icon: mdiWeatherNight },
];

export function AppearanceSettings({ mapRewards, onSelectMapReward, onViewMapReward, onRequiredAchievementOpen, highlightedMapReward }: { highlightedMapReward: MapReward | null; onRequiredAchievementOpen: (id: PersonalAchievementId) => void; mapRewards: RewardState; onSelectMapReward: (reward: MapReward) => void; onViewMapReward: (reward: MapReward) => void }) {
  useAppTranslation();
  const { preference } = useAppearance();
  const [error, setError] = useState("");
  return <section className="appearance-settings" aria-label={t("App appearance")}>
    <p>{t("Choose light, dark, or follow your device settings.")}</p>
    <fieldset className="appearance-options" aria-label={t("App appearance")}>
      {choices.map((choice) => <label key={choice.value}>
        <input type="radio" name="appearance" value={choice.value} checked={preference === choice.value} data-testid={`appearance-${choice.value}`} onChange={() => {
          try { setAppearancePreference(choice.value); setError(""); selectionHaptic(); }
          catch (failure) {
            errorHaptic();
            console.error("Could not save appearance", { preference: choice.value, error: errorDiagnostic(failure) });
            setError(t("Could not save your appearance. Check that device storage is available and try again."));
          }
        }} />
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d={choice.icon} /></svg>
        <span>{choice.label}</span>
      </label>)}
    </fieldset>
    {error && <p role="alert">{error}</p>}
    <MapAppearanceSettings highlightedMapReward={highlightedMapReward} onRequiredAchievementOpen={onRequiredAchievementOpen} rewards={mapRewards} onView={onViewMapReward} onSelect={onSelectMapReward} />
    <AppIconSettings />
  </section>;
}
