import { describe, expect, it, vi } from "vitest";
import {
  JOURNEY_SPEED_STOP_NOTIFICATION_ID,
  sendJourneySpeedStopNotification,
  openJourneySpeedStopReport,
} from "./journeyNotifications";

import {
  JOURNEY_SPEED_STOP_ACTION_TYPE_ID,
  REPORT_JOURNEY_SPEED_STOP_ACTION_ID,
  MORNING_INVITE_ACTION_TYPE_ID,
} from "./notificationActions";

describe("journey speed-stop notifications", () => {
  it("delivers an immediate notification tied to the stopped journey", async () => {
    const client = {
      checkPermissions: vi.fn().mockResolvedValue({ display: "granted" }),
      registerActionTypes: vi.fn().mockResolvedValue(undefined),
      schedule: vi.fn().mockResolvedValue({ notifications: [] }),
    };
    await sendJourneySpeedStopNotification(client, "user-1", "walk-1", () => true);
    expect(client.registerActionTypes).toHaveBeenCalledWith({
      types: expect.arrayContaining([
        expect.objectContaining({ id: MORNING_INVITE_ACTION_TYPE_ID }),
        expect.objectContaining({
          id: JOURNEY_SPEED_STOP_ACTION_TYPE_ID,
          actions: [expect.objectContaining({ id: REPORT_JOURNEY_SPEED_STOP_ACTION_ID, foreground: true })],
        }),
      ]),
    });
    expect(client.registerActionTypes.mock.invocationCallOrder[0]).toBeLessThan(client.schedule.mock.invocationCallOrder[0]);
    expect(client.schedule).toHaveBeenCalledOnce();
    expect(client.schedule).toHaveBeenCalledWith({
      notifications: [expect.objectContaining({
        id: JOURNEY_SPEED_STOP_NOTIFICATION_ID,
        isExactNotification: false,
        actionTypeId: JOURNEY_SPEED_STOP_ACTION_TYPE_ID,
        extra: { kind: "journey-speed-stop", userId: "user-1", walkId: "walk-1" },
      })],
    });
    expect(client.schedule.mock.calls[0][0].notifications[0].schedule).toBeUndefined();
  });

  it.each(["denied", "prompt"])("does not schedule or ask for permission when permission is %s", async (display) => {
    const client = {
      checkPermissions: vi.fn().mockResolvedValue({ display }),
      registerActionTypes: vi.fn().mockResolvedValue(undefined),
      schedule: vi.fn(),
    };
    await sendJourneySpeedStopNotification(client, "user-1", "walk-1", () => true);
    expect(client.schedule).not.toHaveBeenCalled();
  });

  it("does not notify a different account after permission checking completes", async () => {
    let current = true;
    const client = {
      checkPermissions: vi.fn().mockImplementation(async () => {
        current = false;
        return { display: "granted" };
      }),
      registerActionTypes: vi.fn().mockResolvedValue(undefined),
      schedule: vi.fn(),
    };
    await sendJourneySpeedStopNotification(client, "user-1", "walk-1", () => current);
    expect(client.schedule).not.toHaveBeenCalled();
  });

  it("retries delivery and reports the last native error if all attempts fail", async () => {
    const error = new Error("Native notification scheduling failed");
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const client = {
      checkPermissions: vi.fn().mockResolvedValue({ display: "granted" }),
      registerActionTypes: vi.fn().mockResolvedValue(undefined),
      schedule: vi.fn().mockRejectedValue(error),
    };
    try {
      await expect(sendJourneySpeedStopNotification(client, "user-1", "walk-1", () => true)).rejects.toBe(error);
      expect(client.schedule).toHaveBeenCalledTimes(3);
      expect(warning).toHaveBeenCalledTimes(2);
    } finally {
      warning.mockRestore();
    }
  });
});

describe("journey speed-stop reports", () => {
  it("opens an email draft with the account and journey context encoded safely", async () => {
    const client = { openUrl: vi.fn().mockResolvedValue({ completed: true }) };
    const report = { userId: "user-1", walkId: "walk & ? #1" };
    await openJourneySpeedStopReport(client, report);
    expect(client.openUrl).toHaveBeenCalledOnce();
    const url = new URL(client.openUrl.mock.calls[0][0].url);
    expect(url.protocol).toBe("mailto:");
    expect(url.pathname).toBe("supporthecate@gmail.com");
    expect(url.searchParams.get("body")).toContain(report.userId);
    expect(url.searchParams.get("body")).toContain(report.walkId);
    expect([...url.searchParams.keys()]).toEqual(["subject", "body"]);
  });

  it("reports failure when no email app accepts the draft", async () => {
    const client = { openUrl: vi.fn().mockResolvedValue({ completed: false }) };
    await expect(openJourneySpeedStopReport(client, { userId: "user-1", walkId: "walk-1" }))
      .rejects.toThrow("No email app accepted the speed-stop report for journey walk-1");
  });
});
