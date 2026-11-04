import type { TranslationKey } from "./i18n";

export const CONTEXTUAL_GUIDES = {
  unlock: {
    title: "Celebrate your exploration",
    description: "This badge celebrates your recorded exploration. Open Profile, then Achievements to see your earned badges and what you can unlock next.",
  },
  achievements: {
    title: "Find your next challenge",
    description: "Earned badges mark completed challenges. Progress on locked badges shows what is still needed. Record journeys to work towards your next achievement.",
  },
  recap: {
    title: "See what this journey revealed",
    description: "Travelled distance includes your whole journey. New ground counts only places you had not revealed before. Revisiting familiar streets can mean no new ground. Use View on map to revisit your route.",
  },
} as const satisfies Record<string, { title: TranslationKey; description: TranslationKey }>;
export type ContextualGuideId = keyof typeof CONTEXTUAL_GUIDES;
export const CONTEXTUAL_GUIDE_RESET_EVENT = "hecate:contextual-guides-reset";

export function contextualGuideStorageKey(id: ContextualGuideId): string {
  return `hecate.contextual-guide.v1.${id}`;
}

export function contextualGuideDismissed(value: string | null): boolean {
  if (value === null) return false;
  if (value === "dismissed") return true;
  throw new TypeError(`Invalid Hecate contextual guide preference: ${value}`);
}

export function resetContextualGuides(): void {
  for (const id of Object.keys(CONTEXTUAL_GUIDES) as ContextualGuideId[]) {
    localStorage.removeItem(contextualGuideStorageKey(id));
  }
  window.dispatchEvent(new Event(CONTEXTUAL_GUIDE_RESET_EVENT));
}
