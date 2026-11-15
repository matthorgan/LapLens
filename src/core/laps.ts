import { haversine, lerp, segmentHit } from "./geo";
import type { Gate, Lap, Sample } from "./types";

export type LapDetectOptions = {
  minSpeedKmh?: number;
  minLapSeconds?: number;
  maxStepMeters?: number;
};

const DEFAULTS = {
  minSpeedKmh: 10,
  minLapSeconds: 15,
  maxStepMeters: 30,
};

type Crossing = {
  index: number;
  fraction: number;
  elapsed: number;
  direction: number;
  speed: number;
  lat: number;
  lon: number;
  latAcc: number;
};

type Point = {
  elapsed: number;
  lat: number;
  lon: number;
  speed: number;
  latAcc: number;
};

export function detectLaps(
  samples: Sample[],
  gate: Gate,
  options: LapDetectOptions = {},
): Lap[] {
  const minSpeed = options.minSpeedKmh ?? DEFAULTS.minSpeedKmh;
  const minLap = options.minLapSeconds ?? DEFAULTS.minLapSeconds;
  const maxStep = options.maxStepMeters ?? DEFAULTS.maxStepMeters;
  const crossings = findCrossings(samples, gate, minSpeed, maxStep);
  const forward = lapsFromDirection(samples, crossings, 1, minLap);
  const reverse = lapsFromDirection(samples, crossings, -1, minLap);
  const chosen = better(forward, reverse);
  return chosen.map((lap, index) => ({ ...lap, id: index + 1 }));
}

export function timeAtDistance(lap: Lap, distance: number): number | null {
  return channelAtDistance(lap, distance, lap.time);
}

export function distanceAtTime(lap: Lap, time: number): number {
  if (lap.time.length === 0) return 0;
  if (time <= lap.time[0]) return lap.dist[0] ?? 0;
  if (time >= lap.lapTime) return lap.length;
  let lo = 0;
  let hi = lap.time.length - 1;
  while (lo + 1 < hi) {
    const mid = (lo + hi) >> 1;
    if (lap.time[mid] <= time) lo = mid;
    else hi = mid;
  }
  const span = lap.time[hi] - lap.time[lo];
  const u = span === 0 ? 0 : (time - lap.time[lo]) / span;
  return lerp(lap.dist[lo], lap.dist[hi], u);
}

export function channelAtDistance(
  lap: Lap,
  distance: number,
  values: number[],
): number | null {
  const bracket = locate(lap.dist, distance);
  if (!bracket) return null;
  return lerp(values[bracket.lo], values[bracket.hi], bracket.u);
}

export function positionAtDistance(
  lap: Lap,
  distance: number,
): { lat: number; lon: number } | null {
  const bracket = locate(lap.dist, distance);
  if (!bracket) return null;
  return {
    lat: lerp(lap.lat[bracket.lo], lap.lat[bracket.hi], bracket.u),
    lon: lerp(lap.lon[bracket.lo], lap.lon[bracket.hi], bracket.u),
  };
}

export function fastestLap(laps: Lap[], hidden: ReadonlySet<number>): Lap | null {
  let best: Lap | null = null;
  for (const lap of laps) {
    if (hidden.has(lap.id)) continue;
    if (!best || lap.lapTime < best.lapTime) best = lap;
  }
  return best;
}

function findCrossings(
  samples: Sample[],
  gate: Gate,
  minSpeed: number,
  maxStep: number,
): Crossing[] {
  const crossings: Crossing[] = [];
  for (let index = 0; index < samples.length - 1; index += 1) {
    const from = samples[index];
    const to = samples[index + 1];
    const step = haversine(from, to);
    if (step > maxStep) continue;
    const hit = segmentHit(from, to, gate.a, gate.b);
    if (!hit) continue;
    const speed = lerp(from.speed, to.speed, hit.t);
    if (speed < minSpeed) continue;
    crossings.push({
      index,
      fraction: hit.t,
      elapsed: lerp(from.elapsed, to.elapsed, hit.t),
      direction: hit.direction,
      speed,
      lat: lerp(from.lat, to.lat, hit.t),
      lon: lerp(from.lon, to.lon, hit.t),
      latAcc: lerp(from.latAcc, to.latAcc, hit.t),
    });
  }
  return crossings;
}

function lapsFromDirection(
  samples: Sample[],
  crossings: Crossing[],
  direction: number,
  minLap: number,
): Lap[] {
  const accepted: Crossing[] = [];
  for (const crossing of crossings) {
    if (crossing.direction !== direction) continue;
    const previous = accepted[accepted.length - 1];
    if (previous && crossing.elapsed - previous.elapsed < minLap) continue;
    accepted.push(crossing);
  }
  const laps: Lap[] = [];
  for (let index = 0; index + 1 < accepted.length; index += 1) {
    const lap = buildLap(samples, accepted[index], accepted[index + 1]);
    if (lap) laps.push(lap);
  }
  return laps;
}

function better(a: Lap[], b: Lap[]): Lap[] {
  if (a.length !== b.length) return a.length > b.length ? a : b;
  const lengthA = a.reduce((sum, lap) => sum + lap.length, 0);
  const lengthB = b.reduce((sum, lap) => sum + lap.length, 0);
  return lengthA >= lengthB ? a : b;
}

function buildLap(samples: Sample[], start: Crossing, end: Crossing): Lap | null {
  const lapTime = end.elapsed - start.elapsed;
  if (lapTime <= 0) return null;
  const points: Point[] = [crossingPoint(start)];
  for (let index = start.index + 1; index <= end.index; index += 1) {
    const sample = samples[index];
    points.push({
      elapsed: sample.elapsed,
      lat: sample.lat,
      lon: sample.lon,
      speed: sample.speed,
      latAcc: sample.latAcc,
    });
  }
  points.push(crossingPoint(end));

  const kept: Point[] = [points[0]];
  const dist = [0];
  for (let index = 1; index < points.length; index += 1) {
    const point = points[index];
    const step = haversine(kept[kept.length - 1], point);
    const isEnd = index === points.length - 1;
    if (step < 0.2 && !isEnd) {
      kept[kept.length - 1] = {
        ...kept[kept.length - 1],
        elapsed: point.elapsed,
        speed: point.speed,
        latAcc: point.latAcc,
      };
      continue;
    }
    kept.push(point);
    dist.push(dist[dist.length - 1] + step);
  }

  const length = dist[dist.length - 1] ?? 0;
  if (length < 50) return null;
  const startElapsed = start.elapsed;
  return {
    id: 0,
    startElapsed,
    endElapsed: end.elapsed,
    lapTime,
    length,
    time: kept.map((point, index) =>
      index === kept.length - 1 ? lapTime : point.elapsed - startElapsed,
    ),
    dist,
    lat: kept.map((point) => point.lat),
    lon: kept.map((point) => point.lon),
    speed: kept.map((point) => point.speed),
    latAcc: kept.map((point) => point.latAcc),
  };
}

function crossingPoint(crossing: Crossing): Point {
  return {
    elapsed: crossing.elapsed,
    lat: crossing.lat,
    lon: crossing.lon,
    speed: crossing.speed,
    latAcc: crossing.latAcc,
  };
}

function locate(
  dist: number[],
  distance: number,
): { lo: number; hi: number; u: number } | null {
  if (dist.length === 0) return null;
  if (distance < dist[0] - 1e-3 || distance > dist[dist.length - 1] + 1e-2) return null;
  const target = Math.min(Math.max(distance, dist[0]), dist[dist.length - 1]);
  let lo = 0;
  let hi = dist.length - 1;
  while (lo + 1 < hi) {
    const mid = (lo + hi) >> 1;
    if (dist[mid] <= target) lo = mid;
    else hi = mid;
  }
  const span = dist[hi] - dist[lo];
  const u = span === 0 ? 0 : (target - dist[lo]) / span;
  return { lo, hi, u };
}
