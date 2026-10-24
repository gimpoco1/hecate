import { describe, expect, it } from "vitest";
import { parseRecentDestinations, recentDestinationFromSelection, withRecentDestination } from "./recentDestinations";
import type { DestinationResult } from "./destinationSearch";

function destination(id: string, lng: number): DestinationResult {
  return { id, name: id, detail: "Barcelona", point: { lng, lat: 41.4 } };
}

describe("recent destinations", () => {
  it("keeps three selections in recent order, moves duplicates to the front, and preserves previous history", () => {
    const previous = [destination("one", 2.1), destination("two", 2.2), destination("three", 2.3)];
    const before = structuredClone(previous);
    expect(withRecentDestination(previous, destination("four", 2.4)).map(({ id }) => id)).toEqual(["four", "one", "two"]);
    expect(withRecentDestination(previous, destination("two-again", 2.2)).map(({ id }) => id)).toEqual(["two-again", "one", "three"]);
    expect(previous).toEqual(before);
  });

  it("validates persisted history before displaying it", () => {
    const place = destination("one", 2.1);
    expect(parseRecentDestinations([place])).toEqual([place]);
    expect(() => parseRecentDestinations([{ ...place, point: { lng: NaN, lat: 41 } }])).toThrow(TypeError);
    expect(() => parseRecentDestinations({})).toThrow(TypeError);
  });
  it("remembers map picks and saved places without applying an old point's geocoded name", () => {
    const resolved = destination("Street 12", 2.1);
    expect(recentDestinationFromSelection(resolved.point, resolved)).toEqual(resolved);
    expect(recentDestinationFromSelection({ ...resolved.point, name: "My saved cafe" }, resolved).name).toBe("My saved cafe");
    const other = { lng: 2.4, lat: 41.4 };
    expect(recentDestinationFromSelection(other, resolved)).toMatchObject({ name: "Selected point", point: other });
    const original = recentDestinationFromSelection(resolved.point, null);
    expect(withRecentDestination([original], recentDestinationFromSelection(resolved.point, resolved))).toEqual([resolved]);
  });

});
