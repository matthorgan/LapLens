import { latitudeDegrees, longitudeDegrees } from "./geo";
import type { Gate, Sample, Session } from "./types";

export function parseClockSeconds(token: string): number {
  const match = /^(\d+)(?:\.(\d+))?$/.exec(token.trim());
  if (!match) throw new Error(`Bad VBO time ${token}`);
  const digits = match[1].padStart(6, "0");
  const hours = Number(digits.slice(0, digits.length - 4));
  const minutes = Number(digits.slice(-4, -2));
  const seconds = Number(`${digits.slice(-2)}.${match[2] ?? "0"}`);
  if (minutes >= 60 || seconds >= 60) throw new Error(`Bad VBO time ${token}`);
  return hours * 3600 + minutes * 60 + seconds;
}

function findColumn(columns: string[], names: string[]): number {
  const lower = columns.map((column) => column.toLowerCase());
  for (const name of names) {
    const index = lower.indexOf(name.toLowerCase());
    if (index >= 0) return index;
  }
  return -1;
}

function parseGate(line: string): Gate | null {
  const numbers = line.match(/[+-]\d+(?:\.\d+)?/g);
  if (!numbers || numbers.length < 4) return null;
  const name = line.trim().split(/\s+/)[0] || "Start";
  return {
    name,
    a: {
      lat: latitudeDegrees(Number(numbers[0])),
      lon: longitudeDegrees(Number(numbers[1])),
    },
    b: {
      lat: latitudeDegrees(Number(numbers[2])),
      lon: longitudeDegrees(Number(numbers[3])),
    },
  };
}

function commentValue(comments: string[], label: string): string {
  const prefix = label.toLowerCase();
  for (const line of comments) {
    const split = line.indexOf(":");
    if (split < 0) continue;
    if (line.slice(0, split).trim().toLowerCase() !== prefix) continue;
    return line.slice(split + 1).trim();
  }
  return "";
}

function numberAt(parts: string[], index: number, fallback = 0): number {
  if (index < 0 || index >= parts.length) return fallback;
  const value = Number(parts[index]);
  return Number.isFinite(value) ? value : fallback;
}

export function parseVbo(text: string): Session {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const lines = text.split(/\r?\n/);
  let section = "";
  const comments: string[] = [];
  let columnLine = "";
  const dataLines: string[] = [];
  let gate: Gate | null = null;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const header = /^\[(.+)]$/.exec(line);
    if (header) {
      section = header[1].trim().toLowerCase();
      continue;
    }
    if (section === "comments") comments.push(line);
    else if (section === "laptiming") {
      gate ??= parseGate(line);
    } else if (section === "column names") {
      if (!columnLine) columnLine = line;
    } else if (section === "data") dataLines.push(line);
  }

  const columns = (columnLine || defaultColumns()).trim().split(/\s+/);
  const timeIndex = findColumn(columns, ["time"]);
  const latIndex = findColumn(columns, ["lat", "latitude"]);
  const lonIndex = findColumn(columns, ["lng", "lon", "longitude"]);
  const speedIndex = findColumn(columns, ["velocity", "speed"]);
  if (timeIndex < 0 || latIndex < 0 || lonIndex < 0 || speedIndex < 0) {
    throw new Error("VBO is missing time, lat, lng, or velocity columns");
  }
  const headingIndex = findColumn(columns, ["heading"]);
  const heightIndex = findColumn(columns, ["height"]);
  const longAccIndex = findColumn(columns, ["longacc"]);
  const latAccIndex = findColumn(columns, ["latacc"]);
  const vertAccIndex = findColumn(columns, ["vertacc"]);
  const gyroXIndex = findColumn(columns, ["x-rotation-gyroscope"]);
  const gyroYIndex = findColumn(columns, ["y-rotation-gyroscope"]);
  const gyroZIndex = findColumn(columns, ["z-rotation-gyroscope"]);
  const satsIndex = findColumn(columns, ["sats", "satellites"]);

  const samples: Sample[] = [];
  let dayOffset = 0;
  let previousClock: number | null = null;
  let origin = 0;
  let previousElapsed = 0;

  for (const line of dataLines) {
    const parts = line.split(/\s+/);
    if (parts.length <= Math.max(timeIndex, latIndex, lonIndex, speedIndex)) continue;
    let clock = parseClockSeconds(parts[timeIndex]) + dayOffset;
    if (previousClock !== null && clock < previousClock - 1) {
      dayOffset += 86_400;
      clock += 86_400;
    }
    if (previousClock === null) origin = clock;
    previousClock = clock;
    const elapsed = Math.max(previousElapsed, clock - origin);
    previousElapsed = elapsed;
    samples.push({
      elapsed,
      lat: latitudeDegrees(Number(parts[latIndex])),
      lon: longitudeDegrees(Number(parts[lonIndex])),
      speed: Number(parts[speedIndex]),
      heading: numberAt(parts, headingIndex),
      height: numberAt(parts, heightIndex),
      longAcc: numberAt(parts, longAccIndex),
      latAcc: numberAt(parts, latAccIndex),
      vertAcc: numberAt(parts, vertAccIndex, 1),
      gyroX: numberAt(parts, gyroXIndex),
      gyroY: numberAt(parts, gyroYIndex),
      gyroZ: numberAt(parts, gyroZIndex),
      sats: numberAt(parts, satsIndex),
    });
  }

  if (samples.length === 0) throw new Error("VBO has no data rows");

  return {
    venue: commentValue(comments, "Venue"),
    startedAt: commentValue(comments, "UTC Date Started"),
    serial: commentValue(comments, "Serial Number"),
    gate,
    samples,
  };
}

function defaultColumns(): string {
  return "time lat lng velocity heading height LongAcc LatAcc VertAcc x-rotation-gyroscope y-rotation-gyroscope z-rotation-gyroscope sats";
}
