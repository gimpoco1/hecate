import { describe, expect, it } from "vitest";
import { assertFreshJourneyControlRequest, parseJourneyControlRequest } from "./journeyControl";

describe("iOS journey controls", () => {
  const request = { id: "44aa2693-126e-46b9-ad34-c18d3b42e4a3", requestedAt: 100_000 };
  it("accepts the native request and ignores unrelated fields", () => {
    expect(parseJourneyControlRequest({ ...request, extra: true })).toEqual(request);
    expect(parseJourneyControlRequest(null)).toBeNull();
  });
  it("rejects malformed native requests before starting or stopping a recording", () => {
    for (const value of [undefined, {}, { ...request, id: "invalid" }, { ...request, requestedAt: NaN }, { ...request, requestedAt: -1 }]) {
      expect(() => parseJourneyControlRequest(value)).toThrow(TypeError);
    }
  });
  it("allows fresh requests and rejects delayed or future actions", () => {
    expect(() => assertFreshJourneyControlRequest(request, 110_000)).not.toThrow();
    expect(() => assertFreshJourneyControlRequest(request, 220_001)).toThrow(RangeError);
    expect(() => assertFreshJourneyControlRequest(request, 99_999)).toThrow(RangeError);
  });
});
