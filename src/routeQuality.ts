import type { Coordinate } from "./types";

type Point = { x: number; y: number };
type Segment = { start: Point; end: Point; length: number; dx: number; dy: number };
type Interval = { start: number; end: number };
const INDEX_SIZE_M = 50;
const SAME_PATH_TOLERANCE_M = 1;

function segmentCells(segment: Segment): string[] {
  const steps = Math.max(1, Math.ceil(segment.length / INDEX_SIZE_M));
  return [...new Set(Array.from({ length: steps + 1 }, (_, step) => {
    const progress = step / steps;
    const x = segment.start.x + (segment.end.x - segment.start.x) * progress;
    const y = segment.start.y + (segment.end.y - segment.start.y) * progress;
    return `${Math.floor(x / INDEX_SIZE_M)},${Math.floor(y / INDEX_SIZE_M)}`;
  }))];
}

function reversedOverlap(current: Segment, previous: Segment): Interval | null {
  if (current.dx * previous.dx + current.dy * previous.dy > -0.98) return null;
  const projected = [previous.start, previous.end].map((point) => {
    const x = point.x - current.start.x;
    const y = point.y - current.start.y;
    return { along: x * current.dx + y * current.dy, across: x * current.dy - y * current.dx };
  });
  if (projected.some(({ across }) => Math.abs(across) > SAME_PATH_TOLERANCE_M)) return null;
  const start = Math.max(0, Math.min(projected[0].along, projected[1].along));
  const end = Math.min(current.length, Math.max(projected[0].along, projected[1].along));
  return end > start ? { start, end } : null;
}

function coveredLength(intervals: Interval[]): number {
  const sorted = [...intervals].sort((a, b) => a.start - b.start);
  let end = 0;
  let covered = 0;
  for (const interval of sorted) {
    covered += Math.max(0, interval.end - Math.max(end, interval.start));
    end = Math.max(end, interval.end);
  }
  return covered;
}

/** Measures retraced street geometry even when the return leg has different vertices. Nearby parallel streets do not count. */
export function backtrackedDistanceKm(points: readonly Pick<Coordinate, "lng" | "lat">[]): number {
  if (points.length < 3) return 0;
  const origin = points[0];
  const longitudeScale = 111_320 * Math.cos(origin.lat * Math.PI / 180);
  const projected = points.map(({ lng, lat }): Point => ({
    x: (lng - origin.lng) * longitudeScale,
    y: (lat - origin.lat) * 111_320,
  }));
  const index = new Map<string, Segment[]>();
  let retracedM = 0;
  for (let position = 1; position < projected.length; position += 1) {
    const start = projected[position - 1];
    const end = projected[position];
    const length = Math.hypot(end.x - start.x, end.y - start.y);
    if (length === 0) continue;
    const segment: Segment = { start, end, length, dx: (end.x - start.x) / length, dy: (end.y - start.y) / length };
    const cells = segmentCells(segment);
    const candidates = new Set<Segment>();
    for (const cell of cells) {
      const [x, y] = cell.split(",").map(Number);
      for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
        for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
          for (const previous of index.get(`${x + offsetX},${y + offsetY}`) ?? []) candidates.add(previous);
        }
      }
    }
    const overlaps = [...candidates].flatMap((previous) => {
      const overlap = reversedOverlap(segment, previous);
      return overlap ? [overlap] : [];
    });
    retracedM += coveredLength(overlaps);
    for (const cell of cells) index.set(cell, [...(index.get(cell) ?? []), segment]);
  }
  return retracedM / 1_000;
}

export type RouteLoop = { startIndex: number; endIndex: number; distanceKm: number };

/** Finds closed street loops using provider vertices, ignoring consecutive duplicate coordinates. */
export function closedRouteLoops(points: readonly Pick<Coordinate, "lng" | "lat">[]): RouteLoop[] {
  const visits = new Map<string, { index: number; distanceKm: number }>();
  const loops: RouteLoop[] = [];
  let travelledKm = 0;
  for (let index = 0; index < points.length; index += 1) {
    const point = points[index];
    if (index > 0) {
      const previous = points[index - 1];
      const latitudeScale = Math.cos((point.lat + previous.lat) / 2 * Math.PI / 180);
      travelledKm += Math.hypot((point.lng - previous.lng) * latitudeScale, point.lat - previous.lat) * 111.32;
    }
    const key = `${point.lng.toFixed(6)},${point.lat.toFixed(6)}`;
    const previous = visits.get(key);
    if (previous && travelledKm - previous.distanceKm > 0.1) {
      loops.push({ startIndex: previous.index, endIndex: index, distanceKm: travelledKm - previous.distanceKm });
    }
    visits.set(key, { index, distanceKm: travelledKm });
  }
  return loops;
}
