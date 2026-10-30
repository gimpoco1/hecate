import { describe, expect, it } from "vitest";
import { combineCrossingManeuvers, type JunctionManeuver } from "./junctionManeuvers";
import { navigationCue, type TurnSymbol } from "./navigationGuidance";
import { parsePlannedRoutes, type PlannedRoute } from "./explorationRouting";

function step(symbol: TurnSymbol, roadName: string, fraction: number, before: number, after: number): JunctionManeuver {
  return { type: symbol === "arrive" ? "arrive" : symbol === "straight" ? "depart" : "turn", bearingBefore: before, bearingAfter: after,
    maneuver: { instruction: `Turn ${symbol} to stay on ${roadName}.`, symbol, roadName, fraction } };
}

describe("junction maneuver grouping", () => {
  it("reduces a multi-crossing walking route to its final street turn", () => {
    const response = {
      code: "Ok", routes: [{
        distance: 357.095, duration: 270.249,
        geometry: { type: "LineString", coordinates: [
          [0.0, 0.0],
          [2.6254e-05, 2.6e-05],
          [1.2752e-05, 3.9e-05],
          [2.25e-06, 4.9e-05],
          [-2.4004e-05, 7.5e-05],
          [0.000110267, 0.000214],
          [0.000282793, 0.000388],
          [0.000557335, 0.00067],
          [0.000682605, 0.000798],
          [0.000794372, 0.000907],
          [0.000943644, 0.001056],
          [0.00111317, 0.001223],
          [0.001074915, 0.001259],
          [0.001202434, 0.001385],
          [0.001599245, 0.001787],
          [0.001622498, 0.001836],
          [0.001607496, 0.001986],
          [0.001588743, 0.002017],
          [0.001599995, 0.002026],
          [0.001612747, 0.002037],
          [0.001663005, 0.00207],
          [0.001428969, 0.002315],
        ] },
        legs: [{ steps: [
          { "name": "Main Street", "distance": 4.095, "maneuver": { "instruction": "Walk northeast on Main Street.", "type": "depart", "bearing_after": 45, "bearing_before": 0 } },
          { "name": "Main Street", "distance": 8, "maneuver": { "modifier": "left", "instruction": "Turn left to stay on Main Street.", "type": "continue", "bearing_after": 314, "bearing_before": 45 } },
          { "name": "Main Street", "distance": 180, "maneuver": { "modifier": "right", "instruction": "Turn right to stay on Main Street.", "type": "continue", "bearing_after": 44, "bearing_before": 315 } },
          { "name": "Main Street", "distance": 6, "maneuver": { "modifier": "left", "instruction": "Turn left to stay on Main Street.", "type": "continue", "bearing_after": 313, "bearing_before": 45 } },
          { "name": "Main Street", "distance": 110, "maneuver": { "modifier": "right", "instruction": "Turn right to stay on Main Street.", "type": "continue", "bearing_after": 45, "bearing_before": 313 } },
          { "name": "Cross Street", "distance": 11, "maneuver": { "modifier": "right", "instruction": "Turn right onto Cross Street.", "type": "turn", "bearing_after": 51, "bearing_before": 348 } },
          { "name": "Cross Street", "distance": 38, "maneuver": { "modifier": "left", "instruction": "Turn left to stay on Cross Street.", "type": "continue", "bearing_after": 316, "bearing_before": 57 } },
          { "name": "Cross Street", "distance": 0, "maneuver": { "instruction": "You have arrived at your destination.", "type": "arrive", "bearing_after": 0, "bearing_before": 316 } },
        ] }],
      }],
    };
    const route = parsePlannedRoutes(response)[0];
    expect(route.maneuvers.filter(({ symbol }) => symbol !== "straight").map(({ symbol, instruction }) => ({ symbol, instruction }))).toEqual([
      { symbol: "left", instruction: "Turn left onto Cross Street." },
      { symbol: "arrive", instruction: "You have arrived at your destination." },
    ]);
    expect(route.maneuvers.some(({ instruction }) => /Turn (left|right) to stay on/.test(instruction))).toBe(false);
  });

  it("removes walking crossing micro-turns", () => {
    const steps: JunctionManeuver[] = [
      { "type": "depart", "bearingBefore": 0, "bearingAfter": 45, "maneuver": { "instruction": "Walk northeast on Main Street.", "symbol": "straight", "roadName": "Main Street", "fraction": 0.0 } },
      { "type": "continue", "bearingBefore": 45, "bearingAfter": 314, "maneuver": { "instruction": "Turn left to stay on Main Street.", "symbol": "left", "roadName": "Main Street", "fraction": 0.05838383433954026 } },
      { "type": "continue", "bearingBefore": 315, "bearingAfter": 44, "maneuver": { "instruction": "Turn right to stay on Main Street.", "symbol": "right", "roadName": "Main Street", "fraction": 0.06601022508338981 } },
      { "type": "continue", "bearingBefore": 45, "bearingAfter": 314, "maneuver": { "instruction": "Turn left to stay on Main Street.", "symbol": "left", "roadName": "Main Street", "fraction": 0.31672782078744394 } },
      { "type": "continue", "bearingBefore": 314, "bearingAfter": 7, "maneuver": { "instruction": "Turn right to stay on Main Street.", "symbol": "right", "roadName": "Main Street", "fraction": 0.3224476138453311 } },
      { "type": "turn", "bearingBefore": 348, "bearingAfter": 51, "maneuver": { "instruction": "Turn right onto Cross Street.", "symbol": "right", "roadName": "Cross Street", "fraction": 0.34818668260582336 } },
      { "type": "turn", "bearingBefore": 44, "bearingAfter": 102, "maneuver": { "instruction": "Turn right onto Main Street.", "symbol": "right", "roadName": "Main Street", "fraction": 0.36629936062246604 } },
      { "type": "continue", "bearingBefore": 45, "bearingAfter": 131, "maneuver": { "instruction": "Turn right to stay on Main Street.", "symbol": "right", "roadName": "Main Street", "fraction": 0.4711622333503974 } },
      { "type": "continue", "bearingBefore": 131, "bearingAfter": 45, "maneuver": { "instruction": "Turn left to stay on Main Street.", "symbol": "left", "roadName": "Main Street", "fraction": 0.47592872756530336 } },
      { "type": "continue", "bearingBefore": 47, "bearingAfter": 136, "maneuver": { "instruction": "Turn right to stay on Main Street.", "symbol": "right", "roadName": "Main Street", "fraction": 0.9001467126919348 } },
      { "type": "continue", "bearingBefore": 128, "bearingAfter": 44, "maneuver": { "instruction": "Turn left to stay on Main Street.", "symbol": "left", "roadName": "Main Street", "fraction": 0.9087264022787656 } },
      { "type": "turn", "bearingBefore": 47, "bearingAfter": 77, "maneuver": { "instruction": "Bear right onto Destination Road.", "symbol": "slight-right", "roadName": "Destination Road", "fraction": 0.993569999304092 } },
      { "type": "arrive", "bearingBefore": 77, "bearingAfter": 0, "maneuver": { "instruction": "You have arrived at your destination.", "symbol": "arrive", "roadName": "Destination Road", "fraction": 0.999999046701157 } },
    ];
    const grouped = combineCrossingManeuvers(steps, 1048.989);
    expect(grouped.map(({ maneuver }) => maneuver.instruction).filter((instruction) => /^Turn (left|right) to stay on Main Street/.test(instruction))).toEqual([]);
    expect(grouped.some(({ maneuver }) => maneuver.symbol === "straight" && maneuver.endFraction !== undefined)).toBe(true);
  });

  const crossing = [step("straight", "Main Street", 0, 0, 0), step("left", "Main Street", 0.3, 0, 270),
    step("right", "New Street", 0.32, 270, 0), step("left", "New Street", 0.35, 0, 270), step("arrive", "New Street", 1, 270, 0)];
  it("combines crossing connectors into one turn onto the final street without changing the input", () => {
    const before = structuredClone(crossing);
    const grouped = combineCrossingManeuvers(crossing, 1000);
    expect(grouped).toHaveLength(3);
    expect(grouped[1].maneuver).toMatchObject({ instruction: "Turn left onto New Street.", symbol: "left", fraction: 0.3, endFraction: 0.35 });
    expect(crossing).toEqual(before);
    const route: PlannedRoute = { id: "crossing", points: [{ lng: 2, lat: 41 }, { lng: 2.001, lat: 41 }], maneuvers: grouped.map(({ maneuver }) => maneuver), distanceKm: 1, durationSeconds: 600, newGroundKm: 0, backtrackedKm: 0, unproductiveLoopKm: 0 };
    const progress = { distanceKm: 0.32, fraction: 0.32, position: route.points[0], acceptedPosition: route.points[0], distanceFromRouteM: 0 };
    expect(navigationCue(route, progress)).toMatchObject({ symbol: "left", instruction: "Turn left onto New Street.", distanceMeters: 0 });
    expect(navigationCue(route, { ...progress, fraction: 0.36 })?.symbol).toBe("arrive");
  });
  it("preserves separate turns across blocks, additional named streets, forks, and unknown bearings", () => {
    expect(combineCrossingManeuvers(crossing, 2000)).toHaveLength(5);
    const otherStreet = crossing.map((value, index) => index === 2 ? { ...value, maneuver: { ...value.maneuver, roadName: "Third Street" } } : value);
    expect(combineCrossingManeuvers(otherStreet, 1000)).toHaveLength(5);
    expect(combineCrossingManeuvers(crossing.map((value, index) => index === 2 ? { ...value, type: "fork" } : value), 1000)).toHaveLength(5);
    expect(combineCrossingManeuvers(crossing.map((value) => ({ ...value, bearingBefore: null, bearingAfter: null })), 1000)).toHaveLength(5);
  });
  it("also combines the mirrored right-left-right crossing", () => {
    const mirrored = [crossing[0], step("right", "Main Street", 0.3, 0, 90), step("left", "New Street", 0.32, 90, 0), step("right", "New Street", 0.35, 0, 90), step("arrive", "New Street", 1, 90, 0)];
    expect(combineCrossingManeuvers(mirrored, 1000)[1].maneuver.instruction).toBe("Turn right onto New Street.");
  });
  it("groups the provider response before removing minor geometry turns", () => {
    const distances = [300, 20, 30, 650, 0];
    const parsed = parsePlannedRoutes({ code: "Ok", routes: [{ distance: 1000, duration: 600,
      geometry: { type: "LineString", coordinates: [[2, 0], [2, 0.0027], [1.99982, 0.0027], [1.99982, 0.00297], [1.99397, 0.00297]] },
      legs: [{ steps: crossing.map((value, index) => ({ name: value.maneuver.roadName, distance: distances[index], maneuver: {
        type: value.type, modifier: value.maneuver.symbol === "straight" || value.maneuver.symbol === "arrive" ? "" : value.maneuver.symbol,
        instruction: value.maneuver.instruction, bearing_before: value.bearingBefore, bearing_after: value.bearingAfter,
      } })) }],
    }] });
    expect(parsed[0].maneuvers).toHaveLength(3);
    expect(parsed[0].maneuvers[1]).toMatchObject({ instruction: "Turn left onto New Street.", endFraction: 0.35 });
  });
});
