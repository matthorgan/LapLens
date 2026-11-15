import { describe, expect, it } from "vitest";
import type { Lap } from "./types";
import { frameSecondsFromBlob, frameSecondsFromMoov, sessionElapsedAt, videoTimeFor } from "./video";

describe("video sync", () => {
  const lap: Lap = {
    id: 2,
    startElapsed: 100,
    endElapsed: 160,
    lapTime: 60,
    length: 100,
    time: [0, 60],
    dist: [0, 100],
    lat: [0, 0],
    lon: [0, 0],
    speed: [0, 0],
    latAcc: [0, 0],
  };

  it("maps a later lap back onto the same clip", () => {
    expect(sessionElapsedAt(lap, 50)).toBeCloseTo(130);
    expect(videoTimeFor(80, 12, 130)).toBeCloseTo(62);
  });

  it("lands on the marked frame at the first crossing", () => {
    expect(videoTimeFor(80, 12, 80)).toBeCloseTo(12);
  });

  it("starts each lap at that lap's own line crossing", () => {
    const first = { ...lap, id: 1, startElapsed: 80 };
    const later = { ...lap, id: 5, startElapsed: 400 };
    expect(videoTimeFor(80, 12, sessionElapsedAt(first, 0) ?? 0)).toBeCloseTo(12);
    expect(videoTimeFor(80, 12, sessionElapsedAt(later, 0) ?? 0)).toBeCloseTo(332);
  });
});

describe("mp4 frame duration", () => {
  it("reads the video track and ignores audio", () => {
    const moov = box(
      "moov",
      concat(
        box("trak", box("mdia", concat(mdhd(48000), hdlr("soun"), stbl(1024)))),
        box("trak", box("mdia", concat(mdhd(6000), hdlr("vide"), stbl(100)))),
      ),
    );
    expect(frameSecondsFromMoov(moovContent(moov))).toBeCloseTo(100 / 6000);
  });

  it("finds a moov box that follows the media data", async () => {
    const payload = moovContent(
      box("moov", box("trak", box("mdia", concat(mdhd(3000), hdlr("vide"), stbl(100))))),
    );
    const file = concat(box("ftyp", new Uint8Array(8)), box("mdat", new Uint8Array(32)), box("moov", payload));
    expect(await frameSecondsFromBlob(new Blob([file.buffer as ArrayBuffer]))).toBeCloseTo(100 / 3000);
  });
});

function moovContent(moov: Uint8Array): Uint8Array {
  return moov.slice(8);
}

function mdhd(timescale: number): Uint8Array {
  const body = new Uint8Array(20);
  new DataView(body.buffer).setUint32(12, timescale);
  return box("mdhd", body);
}

function hdlr(kind: string): Uint8Array {
  const body = new Uint8Array(12);
  body.set(ascii(kind), 8);
  return box("hdlr", body);
}

function stbl(sampleDelta: number): Uint8Array {
  const body = new Uint8Array(16);
  const view = new DataView(body.buffer);
  view.setUint32(4, 1);
  view.setUint32(8, 10);
  view.setUint32(12, sampleDelta);
  return box("minf", box("stbl", box("stts", body)));
}

function box(type: string, content: Uint8Array): Uint8Array {
  const out = new Uint8Array(8 + content.length);
  new DataView(out.buffer).setUint32(0, out.length);
  out.set(ascii(type), 4);
  out.set(content, 8);
  return out;
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function ascii(value: string): Uint8Array {
  return Uint8Array.from(value, (char) => char.charCodeAt(0));
}
