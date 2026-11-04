import { beforeEach, describe, expect, it, vi } from "vitest";

const platform = vi.hoisted(() => ({ name: "ios", request: vi.fn(), check: vi.fn() }));
vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => true, getPlatform: () => platform.name } }));
vi.mock("@capacitor/local-notifications", () => ({ LocalNotifications: { requestPermissions: platform.request, checkPermissions: platform.check } }));

import { readOnboardingNotificationPermission, requestOnboardingNotifications } from "./onboardingPermissions";

describe("explicit onboarding notification requests", () => {
  beforeEach(() => vi.clearAllMocks());

  it.each(["ios", "android"])("calls the %s system request directly from the explicit permission action", async name => {
    platform.name = name;
    platform.check.mockResolvedValue({ display: "denied" });
    platform.request.mockResolvedValue({ display: "granted" });
    await expect(requestOnboardingNotifications()).resolves.toBe(true);
    expect(platform.request).toHaveBeenCalledOnce();
    expect(platform.check).not.toHaveBeenCalled();
  });

  it.each(["ios", "android"])("reports blocked %s access so onboarding can offer Settings", async name => {
    platform.name = name;
    platform.request.mockResolvedValue({ display: "denied" });
    await expect(requestOnboardingNotifications()).resolves.toBe(false);
    expect(platform.request).toHaveBeenCalledOnce();
  });
});

describe("replayed onboarding permission state", () => {
  beforeEach(() => vi.clearAllMocks());
  it.each([
    ["ios", "granted", true], ["ios", "denied", false], ["ios", "prompt", null], ["ios", "prompt-with-rationale", null],
    ["android", "granted", true], ["android", "denied", false], ["android", "prompt", null], ["android", "prompt-with-rationale", null],
  ] as const)("restores %s %s without opening a prompt", async (name, display, expected) => {
    platform.name = name;
    platform.check.mockResolvedValue({ display });
    await expect(readOnboardingNotificationPermission()).resolves.toBe(expected);
    expect(platform.request).not.toHaveBeenCalled();
  });
  it("reports an invalid native state explicitly", async () => {
    platform.check.mockResolvedValue({ display: "invalid" });
    await expect(readOnboardingNotificationPermission()).rejects.toThrow("invalid");
  });
});
