import { afterEach, describe, expect, it, vi } from "vitest";
import { metropolitanCityForPoint, type CityBoundary } from "./city";
import { createJourneyRecordingTracker, isJourneyTooFast } from "./journeyRecording";
import type { LocationTracker, LocationTrackerError } from "./location";
import type { Coordinate } from "./types";

const start: Coordinate = { lng: 2.17, lat: 41.38, recordedAt: 1_000, accuracy: 5 };

async function barcelona(): Promise<CityBoundary> {
  const city = await metropolitanCityForPoint(start);
  if (!city) throw new Error("Barcelona test position must be inside the bundled city boundary");
  return city;
}

// Drive the real recording validator through the location connector interface.
function source(): { tracker: LocationTracker; emit: (point: Coordinate) => void; stop: ReturnType<typeof vi.fn> } {
  let receive: (point: Coordinate) => void = () => { throw new Error("Tracker has not started"); };
  const stop = vi.fn(async (): Promise<void> => undefined);
  return {
    tracker: {
      async start(onPoint): Promise<void> { receive = onPoint; },
      stop,
    },
    emit: (point) => receive(point),
    stop,
  };
}

afterEach(() => vi.restoreAllMocks());

describe("journey recording validation", () => {
  it("records walking offline inside an existing city without requesting a boundary", async () => {
    const fetch = vi.spyOn(globalThis, "fetch");
    const input = source();
    const tracker = createJourneyRecordingTracker(input.tracker, [await barcelona()]);
    const points = vi.fn();
    const errors = vi.fn();
    await tracker.start(points, errors);
    input.emit(start);
    input.emit({ ...start, lng: 2.1702, recordedAt: 20_000 });
    await vi.waitFor(() => expect(points).toHaveBeenCalledTimes(2));
    expect(errors).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    await tracker.stop();
  });

  it("stops before aircraft fixes can enter the route and ignores subsequent fixes", async () => {
    const input = source();
    const tracker = createJourneyRecordingTracker(input.tracker, [await barcelona()]);
    const points = vi.fn();
    const errors = vi.fn();
    await tracker.start(points, errors);
    input.emit(start);
    await vi.waitFor(() => expect(points).toHaveBeenCalledOnce());
    input.emit({ ...start, lng: 2.18, recordedAt: 2_000 });
    input.emit({ ...start, recordedAt: 20_000 });
    await vi.waitFor(() => expect(errors).toHaveBeenCalledOnce());
    expect(errors.mock.calls[0][0].code).toBe("speed-exceeded");
    expect(points).toHaveBeenCalledOnce();
    await tracker.stop();
  });

  it("verifies a new city before recording its first position", async () => {
    const input = source();
    const tracker = createJourneyRecordingTracker(input.tracker, []);
    const points = vi.fn();
    const errors = vi.fn();
    await tracker.start(points, errors);
    input.emit(start);
    expect(points).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(points).toHaveBeenCalledWith(start));
    expect(errors).not.toHaveBeenCalled();
    await tracker.stop();
  });

  it("retries a failed city service and stops without recording unverified locations", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("City service unavailable", { status: 503 }));
    const input = source();
    const tracker = createJourneyRecordingTracker(input.tracker, []);
    const points = vi.fn();
    const errors = vi.fn();
    await tracker.start(points, errors);
    input.emit({ ...start, lng: 0, lat: 0 });
    await vi.waitFor(() => expect(errors).toHaveBeenCalledOnce(), { timeout: 2_000 });
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(errors.mock.calls[0][0].message).toContain("could not be verified");
    expect(points).not.toHaveBeenCalled();
    await tracker.stop();
  });

  it("rejects a first fix with aircraft speed and allows ordinary walking and GPS uncertainty", () => {
    expect(isJourneyTooFast(undefined, { ...start, speed: 15 })).toBe(false);
    expect(isJourneyTooFast(undefined, { ...start, speed: 15.1 })).toBe(true);
    expect(isJourneyTooFast(undefined, { ...start, speed: 230 })).toBe(true);
    expect(isJourneyTooFast(start, { ...start, lng: 2.1702, recordedAt: 20_000 })).toBe(false);
    expect(isJourneyTooFast(start, { ...start, lng: 2.1702, recordedAt: 2_000, accuracy: 20 })).toBe(false);
  });

  it("does not record outside a city when lookup confirms no municipal boundary", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ features: [] }), { status: 200 }));
    const input = source();
    const tracker = createJourneyRecordingTracker(input.tracker, [await barcelona()]);
    const points = vi.fn();
    const errors = vi.fn();
    await tracker.start(points, errors);
    input.emit({ ...start, lng: 0, lat: 0 });
    await vi.waitFor(() => expect(errors).toHaveBeenCalledOnce());
    expect(errors.mock.calls[0][0].message).toContain("outside a recognized city");
    expect(points).not.toHaveBeenCalled();
    await tracker.stop();
  });

  it("does not append a late city lookup result after the journey is stopped", async () => {
    let resolveResponse!: (response: Response) => void;
    const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(() => new Promise<Response>((resolve) => { resolveResponse = resolve; }));
    const input = source();
    const tracker = createJourneyRecordingTracker(input.tracker, []);
    const points = vi.fn();
    const errors = vi.fn<(error: LocationTrackerError) => void>();
    await tracker.start(points, errors);
    input.emit({ ...start, lng: 0, lat: 0 });
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    await tracker.stop();
    resolveResponse(new Response(JSON.stringify({ features: [] }), { status: 200 }));
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(input.stop).toHaveBeenCalledOnce();
    expect(points).not.toHaveBeenCalled();
    expect(errors).not.toHaveBeenCalled();
  });
});
