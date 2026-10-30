import { Clipper64, ClipType, FillRule, PolyTree64, type Path64, type Paths64, type PolyPath64 } from "clipper2-ts";

export type Pair = [number, number];
export type Polygon = Pair[][];
export type MultiPolygon = Polygon[];

// Subdivide a zoom-20 map cell into centimetre-scale integer units before clipping.
const PRECISION = 4096;

function integerPaths(polygons: MultiPolygon, origin: Pair): Paths64 {
  return polygons.flatMap(polygon => polygon.map((ring, index) => {
    const points = ring.map(([x, y]) => ({ x: Math.round((x - origin[0]) * PRECISION), y: Math.round((y - origin[1]) * PRECISION) }));
    const area = points.reduce((sum, point, pointIndex) => {
      const next = points[(pointIndex + 1) % points.length];
      return sum + point.x * next.y - next.x * point.y;
    }, 0);
    return (area > 0) === (index === 0) ? points : [...points].reverse();
  }));
}

function polygonsFromTree(tree: PolyTree64, origin: Pair): MultiPolygon {
  const polygons: MultiPolygon = [];
  const ring = (path: Path64): Pair[] => {
    const points: Pair[] = path.map(point => [point.x / PRECISION + origin[0], point.y / PRECISION + origin[1]]);
    return [...points, [...points[0]]];
  };
  const visit = (node: PolyPath64): void => {
    if (node.poly && !node.isHole) {
      const holes: Pair[][] = [];
      for (let index = 0; index < node.count; index += 1) holes.push(ring(node.child(index).poly!));
      polygons.push([ring(node.poly), ...holes]);
    }
    for (let index = 0; index < node.count; index += 1) visit(node.child(index));
  };
  visit(tree);
  return polygons;
}

/** Clips in local integer coordinates, retaining nested holes without floating-point sweep-line failures. */
export function intersectReliefPolygons(subject: MultiPolygon, clip: MultiPolygon): MultiPolygon {
  if (subject.length === 0 || clip.length === 0) return [];
  const first = subject[0][0][0];
  const origin: Pair = [Math.floor(first[0]), Math.floor(first[1])];
  const engine = new Clipper64();
  engine.addSubject(integerPaths(subject, origin));
  engine.addClip(integerPaths(clip, origin));
  const tree = new PolyTree64();
  if (!engine.execute(ClipType.Intersection, FillRule.NonZero, tree)) throw new Error("Could not intersect the discovery and building outlines.");
  return polygonsFromTree(tree, origin);
}

/** Merges discovered ground in one integer operation; overlapping footprints remain solid. */
export function unionReliefPolygons(polygons: MultiPolygon): MultiPolygon {
  if (polygons.length === 0) return [];
  const first = polygons[0][0][0];
  const origin: Pair = [Math.floor(first[0]), Math.floor(first[1])];
  const engine = new Clipper64();
  engine.addSubject(integerPaths(polygons, origin));
  const tree = new PolyTree64();
  if (!engine.execute(ClipType.Union, FillRule.NonZero, tree)) throw new Error("Could not merge the discovered ground into an outline.");
  return polygonsFromTree(tree, origin);
}

/** Rounds the discovery grid's corners without rounding mapped building footprints. */
export function smoothReliefPolygons(polygons: MultiPolygon): MultiPolygon {
  let rounded = polygons;
  for (let pass = 0; pass < 3; pass += 1) {
    rounded = rounded.map(polygon => polygon.map(ring => {
      const points = ring.slice(0, -1);
      const curved: Pair[] = points.flatMap((point, index): Pair[] => {
        const next = points[(index + 1) % points.length];
        const dx = next[0] - point[0];
        const dy = next[1] - point[1];
        const fraction = Math.min(.25, .5 / Math.hypot(dx, dy));
        return [[point[0] + dx * fraction, point[1] + dy * fraction],
          [next[0] - dx * fraction, next[1] - dy * fraction]];
      });
      return [...curved, [...curved[0]]];
    }));
  }
  // Normalize any touching contours before extrusion and building clipping.
  return unionReliefPolygons(rounded);
}
