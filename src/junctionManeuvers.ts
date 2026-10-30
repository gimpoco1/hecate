import { t } from "./i18n";
import type { RouteManeuver } from "./navigationGuidance";

export type JunctionManeuver = { maneuver: RouteManeuver; type: string; bearingBefore: number | null; bearingAfter: number | null };
const CROSSING_TYPES: readonly string[] = ["turn", "continue", "end of road"];

/** Combines short crossing connectors using the incoming and established outgoing street directions. */
export function combineCrossingManeuvers(steps: readonly JunctionManeuver[], distanceMeters: number): JunctionManeuver[] {
  const result: JunctionManeuver[] = [];
  for (let index = 0; index < steps.length; index += 1) {
    const first = steps[index];
    const previous = steps[index - 1];
    let combined: JunctionManeuver | null = null;
    let lastIndex = index;
    if (previous && previous.maneuver.roadName !== "" &&
      (first.maneuver.roadName === previous.maneuver.roadName || (first.type === "turn" && steps[index + 1] && (steps[index + 1].maneuver.fraction - first.maneuver.fraction) * distanceMeters <= 25)) &&
      (first.maneuver.symbol === "left" || first.maneuver.symbol === "right") && first.bearingBefore !== null) {
      const incoming = first.maneuver.roadName !== previous.maneuver.roadName && (first.maneuver.fraction - previous.maneuver.fraction) * distanceMeters >= 40 && previous.bearingAfter !== null
        ? previous.bearingAfter : first.bearingBefore;
      for (let end = index + 1; end < Math.min(steps.length - 1, index + 6); end += 1) {
        const last = steps[end];
        const following = steps[end + 1];
        const cluster = steps.slice(index, end + 1);
        if (!cluster.every((step) => CROSSING_TYPES.includes(step.type)) || (last.maneuver.fraction - first.maneuver.fraction) * distanceMeters > 75) break;
        if (last.maneuver.roadName === "" || following.bearingBefore === null ||
          !cluster.every((step, offset) => step.bearingBefore !== null && step.bearingAfter !== null &&
            (step.maneuver.roadName === "" || step.maneuver.roadName === previous.maneuver.roadName || step.maneuver.roadName === last.maneuver.roadName ||
              (steps[index + offset + 1].maneuver.fraction - step.maneuver.fraction) * distanceMeters <= 25)) ||
          (following.maneuver.fraction - last.maneuver.fraction) * distanceMeters < (following.type === "arrive" ? 15 : 40)) continue;
        const entryTurn = last.bearingAfter === null ? Infinity : ((last.bearingAfter - incoming + 540) % 360) - 180;
        const outgoing = last.bearingAfter !== null && last.maneuver.roadName === previous.maneuver.roadName && Math.abs(entryTurn) < 25
          ? last.bearingAfter : following.bearingBefore;
        const turn = ((outgoing - incoming + 540) % 360) - 180;
        const straight = Math.abs(turn) < 25;
        if (straight && last.maneuver.roadName !== previous.maneuver.roadName) continue;
        if (!straight && (Math.abs(turn) < 45 || Math.abs(turn) > 135 || last.maneuver.roadName === previous.maneuver.roadName)) continue;
        if (!straight && first.maneuver.roadName === previous.maneuver.roadName &&
          ((turn < 0 && first.maneuver.symbol !== "left") || (turn > 0 && first.maneuver.symbol !== "right"))) continue;
        const symbol = straight ? "straight" : turn < 0 ? "left" : "right";
        combined = { ...first, bearingAfter: outgoing, maneuver: {
          ...first.maneuver, symbol, roadName: last.maneuver.roadName,
          instruction: straight ? t("Stay on {{value0}}.", { value0: last.maneuver.roadName }) : t(symbol === "left" ? "Turn left onto {{road}}." : "Turn right onto {{road}}.", { road: last.maneuver.roadName }), endFraction: last.maneuver.fraction,
        } };
        lastIndex = end;
        break;
      }
    }
    result.push(combined ?? first);
    index = lastIndex;
  }
  return result;
}
