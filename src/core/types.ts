export type LatLon = {
  lat: number;
  lon: number;
};

export type Gate = {
  name: string;
  a: LatLon;
  b: LatLon;
};

export type Sample = {
  elapsed: number;
  lat: number;
  lon: number;
  speed: number;
  heading: number;
  height: number;
  longAcc: number;
  latAcc: number;
  vertAcc: number;
  gyroX: number;
  gyroY: number;
  gyroZ: number;
  sats: number;
};

export type Session = {
  venue: string;
  startedAt: string;
  serial: string;
  gate: Gate | null;
  samples: Sample[];
};

export type Lap = {
  id: number;
  startElapsed: number;
  endElapsed: number;
  lapTime: number;
  length: number;
  time: number[];
  dist: number[];
  lat: number[];
  lon: number[];
  speed: number[];
  latAcc: number[];
};

export type VideoClip = {
  path: string;
  syncDataTime: number | null;
  syncVideoTime: number | null;
};

export type ProjectFile = {
  version: 1;
  source: {
    path: string;
    name: string;
  };
  referenceLapId: number | null;
  hiddenLapIds: number[];
  videos: VideoClip[];
};
