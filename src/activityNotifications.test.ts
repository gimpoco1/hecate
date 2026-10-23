import { afterEach, describe, expect, it, vi } from "vitest";
import {
  enabledActivityNotificationPreferences,
  hasSavedActivityNotificationPreferences,
  morningInviteMessage,
  loadActivityNotificationPreferences,
  nextWeeklyRecapDate,
  weeklyRecapFromPoints,
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
    expect(streakReminderDate(new Date(2026, 9, 17, 9).getTime(), 0, "18:00")).toEqual(
      new Date(2026, 9, 17, 18),
    );
    expect(streakReminderDate(new Date(2026, 9, 17, 19).getTime(), 0, "18:00")).toBeNull();
    expect(streakReminderDate(new Date(2026, 9, 17, 18).getTime(), 0, "18:00")).toBeNull();
    expect(streakReminderDate(new Date(2026, 9, 17, 19).getTime(), 1, "18:00")).toEqual(
      new Date(2026, 9, 18, 18),
    );
  });

  it("uses the selected hour and minute and skips elapsed reminders", () => {
    expect(streakReminderDate(new Date(2026, 9, 17, 20, 29).getTime(), 0, "20:30"))
      .toEqual(new Date(2026, 9, 17, 20, 30));
    expect(streakReminderDate(new Date(2026, 9, 17, 20, 30).getTime(), 0, "20:30"))
      .toBeNull();
    expect(streakReminderDate(new Date(2026, 11, 31, 22).getTime(), 1, "08:15"))
      .toEqual(new Date(2027, 0, 1, 8, 15));
    expect(() => streakReminderDate(Date.now(), 0, "24:00")).toThrow(RangeError);
  });

  it("keeps the weekly recap concise and motivational", () => {
    expect(weeklyRecapMessage(1.25, 4.5, 3)).toBe(
      "1.3 km of new ground, 4.5 km travelled, and a 3-day streak.",
    );
  });

  it("schedules Sunday evening across week and year boundaries", () => {
    expect(nextWeeklyRecapDate(new Date(2026, 9, 18, 17).getTime())).toEqual(
      new Date(2026, 9, 18, 18),
    );
    expect(nextWeeklyRecapDate(new Date(2026, 9, 18, 18).getTime())).toEqual(
      new Date(2026, 9, 25, 18),
    );
    expect(nextWeeklyRecapDate(new Date(2026, 11, 31, 12).getTime())).toEqual(
      new Date(2027, 0, 3, 18),
    );
  });

  it("uses weekly distance without milestones or dates", () => {
    const now = new Date(2026, 9, 18, 12).getTime();
    const finishedAt = new Date(2026, 9, 13, 12).getTime();
    const points = [
      { lat: 41, lng: 2, accuracy: 5, recordedAt: finishedAt - 60_000, walkId: "walk" },
      { lat: 41.01, lng: 2, accuracy: 5, recordedAt: finishedAt, walkId: "walk" },
    ];
    const recap = weeklyRecapFromPoints(points, now);
    expect(recap).toContain("1.1 km travelled");
    expect(recap).not.toContain("Next:");
    expect(recap).not.toContain("Progress as of");
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
    const preferences = { ...enabledActivityNotificationPreferences(), streakReminderTime: "21:45", dailyReminderTime: "08:15", discoveryReminderMinutes: 10, inactivityReminderMinutes: 30, discoveredAreaReminders: true };
    saveActivityNotificationPreferences("new-user", preferences);
    expect(loadActivityNotificationPreferences("new-user")).toEqual(preferences);
    saveActivityNotificationPreferences("new-user", { ...preferences, dailyReminderTime: "09:30" });
    expect(loadActivityNotificationPreferences("new-user")).toEqual({
      ...preferences, dailyReminderTime: "09:30",
    });
    values.set("hecate:activity-notifications:v1:streak-user", JSON.stringify({
      morningInvite: true, weeklyRecap: false, streakReminder: true, streakReminderTime: "22:15",
    }));
    expect(loadActivityNotificationPreferences("streak-user")).toEqual({
      morningInvite: true, weeklyRecap: false, streakReminder: true,
      streakReminderTime: "22:15", dailyReminderTime: "10:00",
      discoveryReminderMinutes: 5, inactivityReminderMinutes: 15, discoveredAreaReminders: false,
    });
    values.set("hecate:activity-notifications:v1:legacy-user", JSON.stringify({
      morningInvite: false, weeklyRecap: true, streakReminder: true,
    }));
    expect(loadActivityNotificationPreferences("legacy-user")).toEqual({
      morningInvite: false, weeklyRecap: true, streakReminder: true, streakReminderTime: "18:00", dailyReminderTime: "10:00",
      discoveryReminderMinutes: 5, inactivityReminderMinutes: 15, discoveredAreaReminders: false,
    });
  });
});
