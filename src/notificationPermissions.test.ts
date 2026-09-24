import { describe, expect, it, vi } from "vitest";
import { ensureNotificationPermission } from "./notificationPermissions";

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
