import { Clipper64, ClipType, FillRule, type Paths64 } from "clipper2-ts";
import type { CityBoundary } from "./city";
import { distanceKm, splitRoute } from "./geo";
import type { Coordinate } from "./types";

const COORDINATE_SCALE = 10_000_000;

/** Counts recorded route distance inside one city, including revisits and excluding holes and journey gaps. */
export function travelledCityDistanceKm(points: Coordinate[], city: CityBoundary): number {
  const routes = splitRoute(points).filter(route => route.length > 1);
  if (!routes.length) return 0;
  const polygons = city.geometry.type === "Polygon" ? [city.geometry.coordinates] : city.geometry.coordinates;
  const boundary: Paths64 = polygons.flatMap(polygon => polygon.map((ring, index) => {
    const path = ring.map(([lng, lat]) => ({ x: Math.round(lng * COORDINATE_SCALE), y: Math.round(lat * COORDINATE_SCALE) }));
    const area = path.reduce((sum, point, pointIndex) => {
      const next = path[(pointIndex + 1) % path.length];
      return sum + point.x * next.y - next.x * point.y;
    }, 0);
    return (area > 0) === (index === 0) ? path : [...path].reverse();
  }));
  const engine = new Clipper64();
  engine.addOpenSubject(routes.map(route => route.map(point => ({
    x: Math.round(point.lng * COORDINATE_SCALE), y: Math.round(point.lat * COORDINATE_SCALE),
  }))));
  engine.addClip(boundary);
  const closed: Paths64 = [];
  const clipped: Paths64 = [];
  if (!engine.execute(ClipType.Intersection, FillRule.NonZero, closed, clipped)) {
    throw new Error("Could not calculate travelled distance inside the selected city boundary.");
  }
  return clipped.reduce((total, route) => total + route.slice(1).reduce((sum, point, index) => sum + distanceKm(
    { lng: route[index].x / COORDINATE_SCALE, lat: route[index].y / COORDINATE_SCALE, recordedAt: 0 },
    { lng: point.x / COORDINATE_SCALE, lat: point.y / COORDINATE_SCALE, recordedAt: 0 },
  ), 0), 0);
}
