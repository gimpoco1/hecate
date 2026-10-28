import { errorDiagnostic } from '../diagnostics'
import { useState } from "react";
import { mdiMonitorCellphone, mdiWeatherNight, mdiWhiteBalanceSunny } from "@mdi/js";
import { setAppearancePreference, useAppearance, type AppearancePreference } from "../appearance";
import { AppIconSettings } from "./AppIconSettings";

const choices: { value: AppearancePreference; label: string; icon: string }[] = [
  { value: "system", label: "System", icon: mdiMonitorCellphone },
  { value: "light", label: "Light", icon: mdiWhiteBalanceSunny },
  { value: "dark", label: "Dark", icon: mdiWeatherNight },
];

export function AppearanceSettings() {
  const { preference } = useAppearance();
  const [error, setError] = useState("");
  return <section className="appearance-settings" aria-label="App appearance">
    <p>Choose light, dark, or follow your device settings.</p>
    <fieldset className="appearance-options" aria-label="App appearance">
      {choices.map((choice) => <label key={choice.value}>
        <input type="radio" name="appearance" value={choice.value} checked={preference === choice.value} data-testid={`appearance-${choice.value}`} onChange={() => {
          try { setAppearancePreference(choice.value); setError(""); }
          catch (failure) {
            console.error("Could not save appearance", { preference: choice.value, error: errorDiagnostic(failure) });
            setError("Could not save your appearance. Check that device storage is available and try again.");
          }
        }} />
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d={choice.icon} /></svg>
        <span>{choice.label}</span>
      </label>)}
    </fieldset>
    {error && <p role="alert">{error}</p>}
    <AppIconSettings />
  </section>;
}
