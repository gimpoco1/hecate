import messages from "../../../src/locales/en.json" with { type: "json" };

export type TranslationKey = keyof typeof messages;

/** Server calculations use stable English diagnostics without browser language detection. */
export function t(key: TranslationKey, values?: Record<string, string | number>): string {
  const message = messages[key];
  if (!values) return message;
  return message.replace(/\{\{(\w+)\}\}/g, (match: string, name: string) => {
    const value = values[name];
    return value === undefined ? match : String(value);
  });
}

export function currentLanguage(): "en" { return "en"; }
