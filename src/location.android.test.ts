import { beforeEach, describe, expect, it, vi } from "vitest";

const native = vi.hoisted(() => ({
  addWatcher: vi.fn(),
  removeWatcher: vi.fn(),
  removeAllWatchers: vi.fn(),
}));

vi.mock("@capacitor/core", () => ({
  Capacitor: { getPlatform: () => "android", isNativePlatform: () => true },
  registerPlugin: () => native,
}));

import { createForegroundLocationTracker, createReminderLocationTracker } from "./location";

describe("Android watcher ownership", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    native.removeAllWatchers.mockResolvedValue(undefined);
    native.removeWatcher.mockResolvedValue(undefined);
  });

  it("removes native orphans before starting motion-gated reminder monitoring", async () => {
    let cleaned!: () => void;
    native.removeAllWatchers.mockReturnValueOnce(new Promise<void>((resolve) => { cleaned = resolve; }));
    native.addWatcher.mockResolvedValueOnce("reminder");
    const tracker = createReminderLocationTracker();
    const starting = tracker.start(() => undefined, () => undefined);
    await vi.waitFor(() => expect(native.removeAllWatchers).toHaveBeenCalledOnce());
    expect(native.addWatcher).not.toHaveBeenCalled();
    cleaned();
    await starting;
    expect(native.addWatcher).toHaveBeenCalledWith(expect.objectContaining({ motionGated: true, journeyId: null }), expect.any(Function));
    await tracker.stop();
  });

  it("waits for native GPS and motion teardown before foreground positioning resumes", async () => {
    let removed!: () => void;
    native.addWatcher.mockResolvedValueOnce("outgoing-reminder").mockResolvedValueOnce("foreground");
    native.removeWatcher.mockReturnValueOnce(new Promise<void>((resolve) => { removed = resolve; }));
    const reminder = createReminderLocationTracker();
    await reminder.start(() => undefined, () => undefined);
    const stopping = reminder.stop();
    const foreground = createForegroundLocationTracker();
    const starting = foreground.start(() => undefined, () => undefined);
    await vi.waitFor(() => expect(native.removeWatcher).toHaveBeenCalledWith({ id: "outgoing-reminder" }));
    expect(native.addWatcher).toHaveBeenCalledTimes(1);
    removed();
    await Promise.all([stopping, starting]);
    expect(native.addWatcher).toHaveBeenLastCalledWith(expect.objectContaining({ motionGated: false }), expect.any(Function));
    await foreground.stop();
  });
});
