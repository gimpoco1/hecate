import i18next from "i18next";
import en from "../../../src/locales/en.json" with { type: "json" };

export type TranslationKey = keyof typeof en;

// Edge Functions report errors in English and do not initialize React or browser language detection.
const translation = i18next.createInstance();
await translation.init({ lng: "en", resources: { en: { translation: en } }, initAsync: false });

export function t(key: TranslationKey, values?: Record<string, string | number>): string {
  return translation.t(key, values);
}

export function currentLanguage(): "en" {
  return "en";
}
