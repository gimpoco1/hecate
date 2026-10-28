import { describe, expect, it, vi } from "vitest";
import { notificationSettingsWarning, type NotificationSettingsPermissionState, ensureNotificationPermission } from "./notificationPermissions";

describe("notification permission onboarding", () => {
  it("requests permission when the first-run status is undecided", async () => {
    const client = {
      checkPermissions: vi.fn().mockResolvedValue({ display: "prompt" }),
      requestPermissions: vi.fn().mockResolvedValue({ display: "granted" }),
    };

    await expect(ensureNotificationPermission(client)).resolves.toBe(true);
    expect(client.requestPermissions).toHaveBeenCalledOnce();
  });

  it("does not repeat a system prompt after permission was denied", async () => {
    const client = {
      checkPermissions: vi.fn().mockResolvedValue({ display: "denied" }),
      requestPermissions: vi.fn(),
    };

    await expect(ensureNotificationPermission(client)).resolves.toBe(false);
    expect(client.requestPermissions).not.toHaveBeenCalled();
  });
});

describe("notification settings warning priority", () => {
  const allowed: NotificationSettingsPermissionState = {
    notifications: true, location: "allowed", motionError: "", actionError: "",
  };

  it("shows only the next permission blocker as each higher-priority issue is resolved", () => {
    const blocked: NotificationSettingsPermissionState = { ...allowed, notifications: false, location: "blocked", motionError: "Motion denied" };
    expect(notificationSettingsWarning(blocked)).toBe("notifications");
    expect(notificationSettingsWarning({ ...blocked, notifications: true })).toBe("location");
    expect(notificationSettingsWarning({ ...blocked, notifications: true, location: "allowed" })).toBe("motion");
    expect(notificationSettingsWarning(allowed)).toBeNull();
  });

  it("prioritizes an actionable error without stacking permission notices", () => {
    expect(notificationSettingsWarning({ ...allowed, notifications: false, location: "blocked", motionError: "Motion denied", actionError: "Could not open Settings" })).toBe("error");
  });

  it("waits for permission checks instead of showing a lower-priority warning early", () => {
    expect(notificationSettingsWarning({ ...allowed, notifications: null, motionError: "Motion denied" })).toBeNull();
    expect(notificationSettingsWarning({ ...allowed, location: "pending", motionError: "Motion denied" })).toBeNull();
  });
});
