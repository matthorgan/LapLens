import { timeAtDistance } from "./laps";
import type { Lap } from "./types";

export function videoTimeFor(
  syncDataTime: number,
  syncVideoTime: number,
  sessionElapsed: number,
): number {
  return syncVideoTime + (sessionElapsed - syncDataTime);
}

export function sessionElapsedAt(lap: Lap, distance: number): number | null {
  const along = timeAtDistance(lap, distance);
  if (along == null) return null;
  return lap.startElapsed + along;
}

type Box = {
  type: string;
  contentStart: number;
  contentEnd: number;
};

type Track = {
  video: boolean;
  timescale: number | null;
  sampleDelta: number | null;
};

export function frameSecondsFromMoov(moov: Uint8Array): number | null {
  for (const box of boxes(moov, 0, moov.length)) {
    if (box.type !== "trak") continue;
    const track: Track = { video: false, timescale: null, sampleDelta: null };
    readTrack(moov, box.contentStart, box.contentEnd, track);
    if (track.video && track.timescale && track.sampleDelta) {
      return track.sampleDelta / track.timescale;
    }
  }
  return null;
}

export async function frameSecondsFromBlob(file: Blob): Promise<number | null> {
  let pos = 0;
  while (pos + 8 <= file.size) {
    const header = new Uint8Array(await file.slice(pos, Math.min(file.size, pos + 16)).arrayBuffer());
    const box = boxHeader(header, file.size - pos);
    if (!box) return null;
    if (box.type === "moov") {
      if (box.total > 16 * 1024 * 1024) return null;
      const payload = new Uint8Array(
        await file.slice(pos + box.header, pos + box.total).arrayBuffer(),
      );
      return frameSecondsFromMoov(payload);
    }
    pos += box.total;
  }
  return null;
}

function readTrack(data: Uint8Array, start: number, end: number, track: Track) {
  for (const box of boxes(data, start, end)) {
    if (box.type === "mdhd") readMdhd(data, box, track);
    else if (box.type === "hdlr") readHdlr(data, box, track);
    else if (box.type === "stts") readStts(data, box, track);
    else if (box.type === "mdia" || box.type === "minf" || box.type === "stbl") {
      readTrack(data, box.contentStart, box.contentEnd, track);
    }
  }
}

function readMdhd(data: Uint8Array, box: Box, track: Track) {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const version = data[box.contentStart];
  if (version === 0 && box.contentEnd - box.contentStart >= 20) {
    track.timescale = view.getUint32(box.contentStart + 12);
  } else if (version === 1 && box.contentEnd - box.contentStart >= 32) {
    track.timescale = view.getUint32(box.contentStart + 20);
  }
}

function readHdlr(data: Uint8Array, box: Box, track: Track) {
  if (box.contentEnd - box.contentStart < 12) return;
  const handler = String.fromCharCode(
    data[box.contentStart + 8],
    data[box.contentStart + 9],
    data[box.contentStart + 10],
    data[box.contentStart + 11],
  );
  if (handler === "vide") track.video = true;
}

function readStts(data: Uint8Array, box: Box, track: Track) {
  if (box.contentEnd - box.contentStart < 16) return;
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const count = view.getUint32(box.contentStart + 4);
  if (count === 0) return;
  const delta = view.getUint32(box.contentStart + 12);
  if (delta > 0) track.sampleDelta = delta;
}

function boxes(data: Uint8Array, start: number, end: number): Box[] {
  const found: Box[] = [];
  let pos = start;
  const limit = Math.min(end, data.length);
  while (pos + 8 <= limit) {
    const header = boxHeader(data.subarray(pos, Math.min(limit, pos + 16)), limit - pos);
    if (!header || pos + header.total > limit) break;
    found.push({
      type: header.type,
      contentStart: pos + header.header,
      contentEnd: pos + header.total,
    });
    pos += header.total;
  }
  return found;
}

function boxHeader(
  data: Uint8Array,
  parentRemaining: number,
): { type: string; header: number; total: number } | null {
  if (data.length < 8) return null;
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const size = view.getUint32(0);
  const type = String.fromCharCode(data[4], data[5], data[6], data[7]);
  if (size === 1) {
    if (data.length < 16) return null;
    const total = Number(view.getBigUint64(8));
    if (!Number.isSafeInteger(total) || total < 16) return null;
    return { type, header: 16, total };
  }
  if (size === 0) {
    if (parentRemaining < 8) return null;
    return { type, header: 8, total: parentRemaining };
  }
  if (size < 8) return null;
  return { type, header: 8, total: size };
}
