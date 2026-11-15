import { describe, expect, it } from "vitest";
import { haversine } from "./geo";
import { channelAtDistance, detectLaps, distanceAtTime, timeAtDistance } from "./laps";
import type { Gate, Sample } from "./types";

const gate: Gate = {
  name: "Start",
  a: { lat: 45.9997, lon: -0.999 },
  b: { lat: 46.0003, lon: -0.999 },
};

function sample(
  elapsed: number,
  lat: number,
  lon: number,
  speed: number,
): Sample {
  return {
    elapsed,
    lat,
    lon,
    speed,
    heading: 90,
    height: 20,
    longAcc: 0,
    latAcc: 0.2,
    vertAcc: 1,
    gyroX: 0,
    gyroY: 0,
    gyroZ: 0,
    sats: 16,
  };
}

function pushLine(
  samples: Sample[],
  from: { lat: number; lon: number },
  to: { lat: number; lon: number },
  speedKmh: number,
  elapsed: number,
): number {
  const steps = 12;
  const distance = haversine(from, to);
  const seconds = distance / (speedKmh / 3.6);
  for (let step = 1; step <= steps; step += 1) {
    const u = step / steps;
    samples.push(
      sample(
        elapsed + seconds * u,
        from.lat + (to.lat - from.lat) * u,
        from.lon + (to.lon - from.lon) * u,
        speedKmh,
      ),
    );
  }
  return elapsed + seconds;
}

function circuit(speedKmh: number, loops: number, reverseAtEnd = false): Sample[] {
  const samples: Sample[] = [];
  let elapsed = 0;
  const before = { lat: 46, lon: -0.9996 };
  const se = { lat: 46, lon: -0.998 };
  const ne = { lat: 46.001, lon: -0.998 };
  const nw = { lat: 46.001, lon: -1 };
  const sw = { lat: 46, lon: -1 };
  samples.push(sample(0, before.lat, before.lon, speedKmh));
  for (let loop = 0; loop < loops + 1; loop += 1) {
    elapsed = pushLine(samples, before, se, speedKmh, elapsed);
    if (loop === loops) break;
    elapsed = pushLine(samples, se, ne, speedKmh, elapsed);
    elapsed = pushLine(samples, ne, nw, speedKmh, elapsed);
    elapsed = pushLine(samples, nw, sw, speedKmh, elapsed);
    elapsed = pushLine(samples, sw, before, speedKmh, elapsed);
  }
  if (reverseAtEnd) {
    pushLine(samples, se, before, speedKmh, elapsed);
  }
  return samples;
}

describe("detectLaps", () => {
  it("counts one lap per return to the gate and ignores the reverse pass", () => {
    const laps = detectLaps(circuit(100, 2, true), gate, {
      minSpeedKmh: 10,
      minLapSeconds: 5,
    });
    expect(laps.map((lap) => lap.id)).toEqual([1, 2]);
    expect(laps[0].lapTime).toBeGreaterThan(10);
    expect(laps[1].lapTime).toBeCloseTo(laps[0].lapTime, 1);
    expect(laps[0].length).toBeGreaterThan(400);
  });

  it("drops a crossing below the speed floor", () => {
    const samples = circuit(100, 1);
    const slow = circuit(5, 1).map((point) => ({ ...point, speed: 5 }));
    const laps = detectLaps([...samples, ...slow], gate, {
      minSpeedKmh: 10,
      minLapSeconds: 5,
    });
    expect(laps).toHaveLength(1);
  });

  it("builds a positive delta when the comparison lap is slower", () => {
    const fast = detectLaps(circuit(100, 1), gate, { minSpeedKmh: 10, minLapSeconds: 5 });
    const slow = detectLaps(circuit(80, 1), gate, { minSpeedKmh: 10, minLapSeconds: 5 });
    expect(fast).toHaveLength(1);
    expect(slow).toHaveLength(1);
    const atEnd = timeAtDistance(slow[0], fast[0].length)! - timeAtDistance(fast[0], fast[0].length)!;
    const atMid =
      timeAtDistance(slow[0], fast[0].length / 2)! -
      timeAtDistance(fast[0], fast[0].length / 2)!;
    expect(atEnd).toBeGreaterThan(1);
    expect(atMid).toBeGreaterThan(0);
    expect(atMid).toBeLessThan(atEnd);
    expect(distanceAtTime(fast[0], fast[0].lapTime / 2)).toBeCloseTo(fast[0].length / 2, 0);
    expect(channelAtDistance(fast[0], 0, fast[0].speed)).toBeCloseTo(100, 0);
  });
});
