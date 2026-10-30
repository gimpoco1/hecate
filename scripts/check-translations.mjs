import { readFileSync } from "node:fs";

const languages = ["en", "es", "it", "hr", "pt"];
const readCatalog = language => JSON.parse(readFileSync(new URL(`../src/locales/${language}.json`, import.meta.url), "utf8"));
const english = readCatalog("en");
const placeholders = value => (value.match(/\{\{[^}]+\}\}/g) ?? []).sort().join(",");
const markup = value => [...value.matchAll(/<(\/?)([a-z][\w]*)\b[^>]*?(\/?)>/gi)]
  .map(([, closing, name, selfClosing]) => `${closing}${name}${selfClosing}`).sort().join(",");
for (const language of languages) {
  const catalog = readCatalog(language);
  for (const [key, value] of Object.entries(english)) {
    if (typeof catalog[key] !== "string" || catalog[key].length === 0) throw new Error(`Missing ${language} translation: ${key}`);
    if (placeholders(value) !== placeholders(catalog[key])) throw new Error(`Mismatched ${language} interpolation: ${key}`);
    if (markup(value) !== markup(catalog[key])) throw new Error(`Mismatched ${language} markup: ${key}`);
  }
  for (const key of Object.keys(catalog)) {
    if (!(key in english) && !(language === "hr" && key.endsWith("_few") && key.replace(/_few$/, "_other") in english)) {
      throw new Error(`Unexpected ${language} translation key: ${key}`);
    }
  }
}
console.log(`Translation coverage and interpolation verified for ${languages.length} languages (${Object.keys(english).length} source messages).`);
