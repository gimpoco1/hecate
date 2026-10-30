import i18next from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next, useTranslation } from "react-i18next";
import en from "./locales/en.json";
import es from "./locales/es.json";
import it from "./locales/it.json";
import hr from "./locales/hr.json";
import pt from "./locales/pt.json";

export const LANGUAGES = ["en", "es", "it", "hr", "pt"] as const;
export type Language = typeof LANGUAGES[number];
export type LanguagePreference = "system" | Language;
export const LANGUAGE_NAMES: Record<Language, string> = {
  en: "English", es: "Español", it: "Italiano", hr: "Hrvatski", pt: "Português",
};
const STORAGE_KEY = "hecate.language.v1";

export function parseLanguagePreference(value: string | null): LanguagePreference {
  if (value === null || value === "system") return "system";
  const language = LANGUAGES.find(language => language === value);
  if (!language) throw new TypeError(`Unsupported language preference: ${value}`);
  return language;
}

export function deviceLanguage(languages: readonly string[]): Language {
  for (const locale of languages) {
    const language = LANGUAGES.find(language => language === locale.toLowerCase().split("-")[0]);
    if (language) return language;
  }
  return "en";
}

export function languagePreference(): LanguagePreference {
  return parseLanguagePreference(typeof localStorage === "undefined" ? null : localStorage.getItem(STORAGE_KEY));
}

const preference = languagePreference();
void i18next.use(LanguageDetector).use(initReactI18next).init({
  resources: { en: { translation: en }, es: { translation: es }, it: { translation: it }, hr: { translation: hr }, pt: { translation: pt } },
  supportedLngs: [...LANGUAGES],
  fallbackLng: "en",
  ...(preference === "system" ? {} : { lng: preference }),
  detection: { order: ["navigator"], caches: [] },
  load: "languageOnly",
  keySeparator: false,
  nsSeparator: false,
  interpolation: { escapeValue: false },
  initAsync: false,
});

function applyDocumentLanguage(): void {
  if (typeof document !== "undefined") document.documentElement.lang = i18next.resolvedLanguage ?? "en";
}
i18next.on("languageChanged", applyDocumentLanguage);
applyDocumentLanguage();

export async function setLanguagePreference(preference: LanguagePreference): Promise<void> {
  localStorage.setItem(STORAGE_KEY, preference);
  await i18next.changeLanguage(preference === "system" ? deviceLanguage(navigator.languages) : preference);
}

if (typeof window !== "undefined") {
  window.addEventListener("languagechange", () => {
    if (languagePreference() === "system") void i18next.changeLanguage(deviceLanguage(navigator.languages));
  });
  window.addEventListener("storage", event => {
    if (event.key === STORAGE_KEY) {
      const preference = parseLanguagePreference(event.newValue);
      void i18next.changeLanguage(preference === "system" ? deviceLanguage(navigator.languages) : preference);
    }
  });
}

export function useAppTranslation(): void { useTranslation(); }
export type TranslationKey = keyof typeof en | "day" | "hour" | "minute" | "second" | "achievement" | "cityLabel" | "placeLabel" | "collectionLabel" | "walkLabel" | "recapNewAreas" | "explorersTogether" | "importedRoutes" | "moreAchievements";
export function t(key: TranslationKey, values?: Record<string, string | number>): string {
  return i18next.t(key, values);
}
export function currentLanguage(): Language {
  const language = LANGUAGES.find(language => language === i18next.resolvedLanguage);
  if (!language) throw new TypeError(`Unresolved app language: ${i18next.resolvedLanguage}`);
  return language;
}

export function formatNumber(value: number, fractionDigits: number): string {
  return new Intl.NumberFormat(currentLanguage(), {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
    useGrouping: false,
  }).format(value);
}

export function decimalSeparator(): string {
  return new Intl.NumberFormat(currentLanguage()).formatToParts(1.1).find(part => part.type === "decimal")!.value;
}
