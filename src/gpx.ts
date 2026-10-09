import type { Coordinate, DiscoveryCell, PendingWalk } from "./types";
import { distanceKm } from "./geo";

const MAX_GPX_POINTS_PER_SEGMENT = 20_000;

function sameRoute(first: Coordinate[], second: Coordinate[]): boolean {
  return (
    first.length === second.length &&
    first.every(
      (point, index) =>
        Math.abs(point.lat - second[index].lat) < 0.0000001 &&
        Math.abs(point.lng - second[index].lng) < 0.0000001,
    )
  );
}

export function storedWalkRoutes(
  points: Coordinate[],
): Map<string, Coordinate[]> {
  const routes = new Map<string, Coordinate[]>();
  for (const point of points) {
    if (!point.walkId) continue;
    const route = routes.get(point.walkId);
    if (route) route.push(point);
    else routes.set(point.walkId, [point]);
  }
  return routes;
}

export function walkIsAlreadyStored(
  walk: PendingWalk,
  routes: Map<string, Coordinate[]>,
): boolean {
  if (routes.has(walk.id)) return true;
  return [...routes.values()].some((route) => sameRoute(route, walk.points));
}

export async function persistImportedDiscovery(
  cells: DiscoveryCell[],
  walks: PendingWalk[],
  syncCells: (cellsToSync: DiscoveryCell[]) => Promise<void>,
  saveWalk: (walkToSave: PendingWalk) => Promise<void>,
): Promise<void> {
  await syncCells(cells);
  for (const walk of walks) await saveWalk(walk);
}

export function compactImportedRoute(
  points: Coordinate[],
  minimumDistanceM: number,
): Coordinate[] {
  if (points.length <= 2) return [...points];
  const compacted = [points[0]];
  for (const point of points.slice(1, -1)) {
    const previous = compacted.at(-1)!;
    if (distanceKm(previous, point) * 1_000 >= minimumDistanceM) {
      compacted.push(point);
    }
  }
  const finalPoint = points.at(-1)!;
  if (compacted.at(-1) !== finalPoint) compacted.push(finalPoint);
  return compacted;
}

function parseCoordinate(point: Element, recordedAt: number): Coordinate {
  const lat = Number(point.getAttribute("lat"));
  const lng = Number(point.getAttribute("lon"));
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
    throw new RangeError("The GPX file contains an invalid latitude.");
  }
  if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
    throw new RangeError("The GPX file contains an invalid longitude.");
  }
  const timeText = point.querySelector("time")?.textContent?.trim();
  const parsedTime = timeText ? Date.parse(timeText) : Number.NaN;
  return {
    lat,
    lng,
    recordedAt: Number.isFinite(parsedTime) ? parsedTime : recordedAt,
    achievementEligible: false,
  };
}

function parseSegment(
  points: Element[],
  fallbackRecordedAt: number,
): Coordinate[] {
  if (points.length < 2) {
    throw new Error("Each GPX track segment must contain at least two points.");
  }
  if (points.length > MAX_GPX_POINTS_PER_SEGMENT) {
    throw new Error(
      `A GPX track segment cannot contain more than ${MAX_GPX_POINTS_PER_SEGMENT.toLocaleString()} points.`,
    );
  }
  return points.map((point, index) =>
    parseCoordinate(point, fallbackRecordedAt + index * 1_000),
  );
}

export function parseGpx(
  xml: string,
  fallbackRecordedAt: number,
  createWalkId: (segmentIndex: number) => string,
): PendingWalk[] {
  const document = new DOMParser().parseFromString(xml, "application/xml");
  if (document.getElementsByTagName("parsererror").length > 0) {
    throw new Error("The selected file is not valid GPX XML.");
  }

  const trackSegments = [
    ...document.getElementsByTagNameNS("*", "trkseg"),
  ].map(
    (segment) =>
      [...segment.children].filter((child) => child.localName === "trkpt"),
  );
  const routeSegments = [...document.getElementsByTagNameNS("*", "rte")].map(
    (route) =>
      [...route.children].filter((child) => child.localName === "rtept"),
  );
  const segments = trackSegments.length > 0 ? trackSegments : routeSegments;
  if (segments.length === 0) {
    throw new Error("The GPX file does not contain a track or route.");
  }

  let fallbackOffset = 0;
  return segments.map((segment, segmentIndex) => {
    const points = parseSegment(segment, fallbackRecordedAt + fallbackOffset);
    fallbackOffset += segment.length * 1_000;
    if (
      points.some(
        (point, index) =>
          index > 0 && point.recordedAt < points[index - 1].recordedAt,
      )
    ) {
      throw new Error("The GPX track points are not in chronological order.");
    }
    return {
      id: createWalkId(segmentIndex),
      startedAt: points[0].recordedAt,
      finishedAt: points.at(-1)!.recordedAt,
      points,
      achievementEligible: false,
    };
  });
}
