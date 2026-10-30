import i18next from "i18next";
import en from "./locales/en.json";
import { t, type TranslationKey } from "./i18n";

/** Legal-page markup comes exclusively from the bundled, reviewed translation catalogs. */
function translateLegalPage(): void {
  for (const element of document.querySelectorAll<HTMLElement>("[data-i18n]")) {
    const key = element.dataset.i18n;
    if (!key || !Object.hasOwn(en, key)) throw new TypeError(`Unrecognized legal-page translation key: ${key}`);
    element.innerHTML = t(key as TranslationKey);
  }
  for (const element of document.querySelectorAll<HTMLMetaElement>("[data-i18n-content]")) {
    const key = element.dataset.i18nContent;
    if (!key || !Object.hasOwn(en, key)) throw new TypeError(`Unrecognized legal-page metadata key: ${key}`);
    element.content = t(key as TranslationKey);
  }
}

translateLegalPage();
i18next.on("languageChanged", translateLegalPage);
