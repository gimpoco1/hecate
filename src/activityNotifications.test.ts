import { afterEach, describe, expect, it, vi } from "vitest";
import {
  enabledActivityNotificationPreferences,
  hasSavedActivityNotificationPreferences,
  morningInviteMessage,
  saveActivityNotificationPreferences,
  streakReminderDate,
  weeklyRecapMessage,
} from "./activityNotifications";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("activity notifications", () => {
  it("uses progress without exposing location in the morning invite", () => {
    expect(morningInviteMessage(0.08)).toBe(
      "You have pioneered 0.08 km so far. Where to today?",
    );
  });

  it("schedules an at-risk streak for this evening or tomorrow", () => {
    expect(streakReminderDate(new Date(2026, 9, 17, 9).getTime(), 0)).toEqual(
      new Date(2026, 9, 17, 18),
    );
    expect(streakReminderDate(new Date(2026, 9, 17, 19).getTime(), 0)).toEqual(
      new Date(2026, 9, 18, 18),
    );
  });

  it("keeps the weekly recap concise and motivational", () => {
    expect(weeklyRecapMessage(1.25, 4.5, 3, "Marathon")).toBe(
      "1.3 km of new ground, 4.5 km travelled, and a 3-day streak. Next: Marathon.",
    );
  });

  it("distinguishes a new account from saved notification choices", () => {
    const values = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string): string | null => values.get(key) ?? null,
      setItem: (key: string, value: string): void => {
        values.set(key, value);
      },
    });

    expect(hasSavedActivityNotificationPreferences("new-user")).toBe(false);
    saveActivityNotificationPreferences(
      "new-user",
      enabledActivityNotificationPreferences(),
    );
    expect(hasSavedActivityNotificationPreferences("new-user")).toBe(true);
  });
});
