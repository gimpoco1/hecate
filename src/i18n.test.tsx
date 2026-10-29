import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import i18next from "i18next";
import { Trans } from "react-i18next";
import { deviceLanguage, languagePreference, parseLanguagePreference, setLanguagePreference, t } from "./i18n";
import { LanguageButton } from "./components/LanguageSettings";
import { PERSONAL_ACHIEVEMENTS, evaluatePersonalAchievements } from "./achievements";
import { AchievementCard } from "./components/AchievementCard";

// Exercise the real i18next/React integration with the platform storage contract.
const values = new Map<string, string>();
function installDevice(languages: string[]): void {
  vi.stubGlobal("navigator", { languages });
  vi.stubGlobal("localStorage", {
    getItem: (key: string): string | null => values.get(key) ?? null,
    setItem: (key: string, value: string): void => { values.set(key, value); },
  });
}

afterEach(async () => {
  values.clear();
  vi.unstubAllGlobals();
  await i18next.changeLanguage("en");
});

describe("app localization", () => {
  it("preserves embedded controls and formatted values in complete translated messages", async () => {
    for (const language of ["en", "es", "it", "hr", "pt"]) {
      await i18next.changeLanguage(language);
      const reminder = renderToStaticMarkup(<Trans i18nKey="settings.reminderTiming" components={{
        discovery: <button data-testid="discovery-duration">5</button>,
        inactivity: <button data-testid="inactivity-duration">15</button>,
      }} />);
      expect(reminder).toContain('<button data-testid="discovery-duration">5</button>');
      expect(reminder).toContain('<button data-testid="inactivity-duration">15</button>');
      const recap = renderToStaticMarkup(<Trans i18nKey="app.newGroundRecap"
        values={{ distance: "1.5 km" }} components={{ distance: <strong />, caption: <span /> }} />);
      expect(recap).toContain("<strong>1.5 km</strong><span>");
      expect(recap).not.toContain("{{");
    }
  });

  it("matches regional device languages and uses the first supported preference", () => {
    expect(deviceLanguage(["de-DE", "hr-HR", "it-IT"])).toBe("hr");
    expect(deviceLanguage(["pt-BR"])).toBe("pt");
    expect(deviceLanguage(["es-MX"])).toBe("es");
    expect(deviceLanguage(["ja-JP"])).toBe("en");
    expect(parseLanguagePreference(null)).toBe("system");
    expect(() => parseLanguagePreference("invalid")).toThrow(TypeError);
  });

  it("persists a signed-out selection and resets to the device language on sign-out", async () => {
    installDevice(["it-IT"]);
    expect(languagePreference()).toBe("system");
    await setLanguagePreference("es");
    expect(languagePreference()).toBe("es");
    expect(renderToStaticMarkup(<LanguageButton onClick={() => undefined} />)).toContain("Español");
    expect(t("Sign in")).toBe("Iniciar sesión");
    await setLanguagePreference("system");
    expect(languagePreference()).toBe("system");
    expect(i18next.resolvedLanguage).toBe("it");
    expect(t("Sign in")).toBe("Accedi");
  });

  it("updates achievement text and worker-serialized progress after a language change", async () => {
    installDevice(["en"]);
    const result = evaluatePersonalAchievements([], []);
    const serialized = structuredClone(result);
    await setLanguagePreference("hr");
    const text = serialized[0].progressText;
    expect(t(text.key, text.values)).toContain("dodano");
    expect(renderToStaticMarkup(<AchievementCard achievement={PERSONAL_ACHIEVEMENTS[0]} />)).toContain("Dužim putem");
    expect(t("day", { count: 1 })).toBe("1 dan");
    expect(t("day", { count: 2 })).toBe("2 dana");
    expect(t("hour", { count: 2 })).toBe("2 sata");
  });
});
