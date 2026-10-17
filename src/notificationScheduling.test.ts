import { describe, expect, it } from "vitest";
import { replaceNotificationSchedules } from "./notificationScheduling";
import type { LocalNotificationSchema } from "@capacitor/local-notifications";

const notification: LocalNotificationSchema = {
  id: 1200,
  title: "Walk",
  body: "Explore",
  isExactNotification: false,
};

describe("native notification schedule replacement", () => {
  it("clears schedules on sign-out without adding new notifications", async () => {
    const cancelled: number[] = [];
    let scheduled = false;
    await replaceNotificationSchedules({
      cancel: async ({ notifications }) => {
        cancelled.push(...notifications.map(({ id }) => id));
      },
      schedule: async ({ notifications }) => {
        scheduled = true;
        return { notifications };
      },
    }, [1200, 1201, 1202], [], () => true);
    expect(cancelled).toEqual([1200, 1201, 1202]);
    expect(scheduled).toBe(false);
  });

  it("does not schedule an account update invalidated during cancellation", async () => {
    let current = true;
    let scheduled = false;
    await replaceNotificationSchedules({
      cancel: async () => { current = false; },
      schedule: async ({ notifications }) => {
        scheduled = true;
        return { notifications };
      },
    }, [1200], [notification], () => current);
    expect(scheduled).toBe(false);
  });

  it("rolls back a schedule invalidated while the native call was running", async () => {
    let current = true;
    const cancellations: number[][] = [];
    await replaceNotificationSchedules({
      cancel: async ({ notifications }) => {
        cancellations.push(notifications.map(({ id }) => id));
      },
      schedule: async ({ notifications }) => {
        current = false;
        return { notifications };
      },
    }, [1200, 1201], [notification], () => current);
    expect(cancellations).toEqual([[1200, 1201], [1200]]);
  });
});
