import { t } from "./i18n";

export function formatElapsedDuration(durationMs: number): string {
  const minutes = Math.max(0, Math.round(durationMs / 60_000));
  if (minutes < 60) return t("{{value0}} min", { value0: minutes });
  const hours = Math.floor(minutes / 60);
  return t("{{hours}} hr {{minutes}}", { hours, minutes: minutes % 60 ? t("{{value0}} min", { value0: minutes % 60 }) : "" }).trim();
}

