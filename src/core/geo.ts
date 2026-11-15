import type { LatLon } from "./types";

const EARTH_RADIUS_M = 6_371_000;

export function latitudeDegrees(arcminutes: number): number {
  return arcminutes / 60;
}

// RaceBox writes longitude arcminutes with the opposite sign of WGS84.
// Circuits de Vendée is at 0.790 W. This export's raw longitude is about +0.794.
export function longitudeDegrees(arcminutes: number): number {
  return -arcminutes / 60;
}

export function haversine(a: LatLon, b: LatLon): number {
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export type SegmentHit = {
  t: number;
  u: number;
  direction: number;
};

// t is the fraction along the travel segment. u is the fraction along the gate.
// direction is the sign of the crossing, +1 or -1.
export function segmentHit(
  from: LatLon,
  to: LatLon,
  gateA: LatLon,
  gateB: LatLon,
): SegmentHit | null {
  const rx = to.lon - from.lon;
  const ry = to.lat - from.lat;
  const sx = gateB.lon - gateA.lon;
  const sy = gateB.lat - gateA.lat;
  const denom = rx * sy - ry * sx;
  if (Math.abs(denom) < 1e-14) return null;
  const qpx = gateA.lon - from.lon;
  const qpy = gateA.lat - from.lat;
  const t = (qpx * sy - qpy * sx) / denom;
  const u = (qpx * ry - qpy * rx) / denom;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { t, u, direction: denom > 0 ? 1 : -1 };
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
