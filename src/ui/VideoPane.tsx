import { useEffect, useRef, useState } from "react";
import { formatLapTime } from "../core/format";
import type { Lap, VideoClip } from "../core/types";
import { sessionElapsedAt, videoTimeFor } from "../core/video";

type Props = {
  clip: VideoClip | null;
  url: string | null;
  frameSeconds: number;
  usingPreview: boolean;
  laps: Lap[];
  reference: Lap | null;
  comparison: Lap | null;
  cursor: number;
  playing: boolean;
  onOpen: () => void;
  onMark: (syncVideoTime: number) => void;
  onNudge: (seconds: number) => void;
  onClear: () => void;
  onPause: () => void;
  onPlaybackError: (url: string) => void;
};

export function VideoPane({
  clip,
  url,
  frameSeconds,
  usingPreview,
  laps,
  reference,
  comparison,
  cursor,
  playing,
  onOpen,
  onMark,
  onNudge,
  onClear,
  onPause,
  onPlaybackError,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const holdRef = useRef(false);
  const [videoTime, setVideoTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [muted, setMuted] = useState(true);
  const first = laps[0] ?? null;
  const synced = clip?.syncDataTime != null && clip.syncVideoTime != null;
  const films = [reference, comparison].filter((lap): lap is Lap => lap != null);
  const fileName = clip ? (clip.path.split(/[/\\]/).pop() ?? clip.path) : "";

  useEffect(() => {
    setVideoTime(0);
    setDuration(0);
  }, [url]);

  function hold() {
    holdRef.current = true;
    onPause();
  }

  function release() {
    holdRef.current = false;
  }

  function step(seconds: number) {
    if (synced) {
      onPause();
      onNudge(seconds);
      return;
    }
    const video = videoRef.current;
    if (!video) return;
    onPause();
    video.pause();
    const end = Number.isFinite(video.duration) ? video.duration : Number.POSITIVE_INFINITY;
    video.currentTime = Math.min(end, Math.max(0, video.currentTime + seconds));
  }

  const note = describeSync(usingPreview, first, synced, reference, comparison);

  return (
    <section className="video-pane">
      <div className="video-head">
        <span>{fileName || "Video"}</span>
        <button type="button" onClick={onOpen}>
          Open video
        </button>
      </div>
      {url && synced ? (
        <div className="video-films">
          {films.map((lap, index) => (
            <LapFilm
              key={lap.id}
              url={url}
              lap={lap}
              role={lap.id === reference?.id ? "ref" : "cmp"}
              target={lapTarget(clip, lap, cursor)}
              playing={playing}
              muted={muted || lap.id !== reference?.id}
              onError={index === 0 ? () => onPlaybackError(url) : undefined}
            />
          ))}
        </div>
      ) : (
        <div className="video-stage">
          {url ? (
            <video
              key={url}
              ref={videoRef}
              src={url}
              muted={muted}
              playsInline
              preload="auto"
              onLoadedMetadata={(event) => {
                setDuration(event.currentTarget.duration || 0);
              }}
              onTimeUpdate={(event) => setVideoTime(event.currentTarget.currentTime)}
              onError={() => onPlaybackError(url)}
            />
          ) : (
            <p className="empty-copy">
              Open a GoPro MP4, then move to the frame where the car crosses the line for the first time.
            </p>
          )}
        </div>
      )}
      <div className="video-tools">
        {url && !synced && (
          <>
            <input
              type="range"
              min={0}
              max={duration || 0}
              step={0.01}
              value={Math.min(videoTime, duration || 0)}
              aria-label="Video time"
              onPointerDown={hold}
              onPointerUp={release}
              onChange={(event) => {
                const video = videoRef.current;
                if (!video) return;
                video.pause();
                video.currentTime = Number(event.target.value);
              }}
            />
            <div className="video-nudge">
              <span className="readout">{formatLapTime(videoTime)}</span>
              {nudgeButtons(step, frameSeconds)}
              <button type="button" onClick={() => setMuted((value) => !value)}>
                {muted ? "Sound" : "Mute"}
              </button>
            </div>
          </>
        )}
        {url && synced && (
          <div className="video-nudge">
            {nudgeButtons(step, frameSeconds)}
            <button type="button" onClick={() => setMuted((value) => !value)}>
              {muted ? "Sound" : "Mute"}
            </button>
            <button type="button" onClick={onClear}>
              Mark again
            </button>
          </div>
        )}
        {!synced && (
          <button
            type="button"
            className="video-mark"
            disabled={!url || !first}
            onClick={() => {
              const video = videoRef.current;
              if (!video) return;
              video.pause();
              onPause();
              onMark(video.currentTime);
            }}
          >
            This frame is the first line cross
          </button>
        )}
        <p className="video-note">{note}</p>
      </div>
    </section>
  );
}

function LapFilm({
  url,
  lap,
  role,
  target,
  playing,
  muted,
  onError,
}: {
  url: string;
  lap: Lap;
  role: "ref" | "cmp";
  target: number | null;
  playing: boolean;
  muted: boolean;
  onError?: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [ready, setReady] = useState(false);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    setReady(false);
    setDuration(0);
  }, [url, lap.id]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !ready || video.readyState < 1 || target == null) return;
    if (target < 0 || (Number.isFinite(video.duration) && target > video.duration + 0.05)) {
      video.pause();
      return;
    }
    const drift = Math.abs(video.currentTime - target);
    if (playing) {
      if (video.paused) void video.play().catch(() => undefined);
      if (drift > 0.12) video.currentTime = target;
      return;
    }
    video.pause();
    if (drift > 0.04) video.currentTime = target;
  }, [target, playing, ready]);

  const outside =
    target != null && duration > 0 && (target < 0 || target > duration + 0.05);
  return (
    <div className="video-stage">
      <span className={`video-lap ${role}`}>{role === "ref" ? `Lap ${lap.id} ref` : `Lap ${lap.id}`}</span>
      <video
        ref={videoRef}
        src={url}
        muted={muted}
        playsInline
        preload="auto"
        onLoadedMetadata={(event) => {
          setReady(true);
          setDuration(event.currentTarget.duration || 0);
        }}
        onError={onError}
      />
      {outside && <span className="video-lap outside">Outside this video</span>}
    </div>
  );
}

function lapTarget(clip: VideoClip | null, lap: Lap, cursor: number): number | null {
  if (clip?.syncDataTime == null || clip.syncVideoTime == null) return null;
  const elapsed = sessionElapsedAt(lap, Math.min(cursor, lap.length));
  if (elapsed == null) return null;
  return videoTimeFor(clip.syncDataTime, clip.syncVideoTime, elapsed);
}

function nudgeButtons(step: (seconds: number) => void, frameSeconds: number) {
  return (
    <>
      <button type="button" onClick={() => step(-0.1)}>
        -0.1s
      </button>
      <button type="button" onClick={() => step(-frameSeconds)}>
        -1 frame
      </button>
      <button type="button" onClick={() => step(frameSeconds)}>
        +1 frame
      </button>
      <button type="button" onClick={() => step(0.1)}>
        +0.1s
      </button>
    </>
  );
}

function describeSync(
  usingPreview: boolean,
  first: Lap | null,
  synced: boolean,
  reference: Lap | null,
  comparison: Lap | null,
): string {
  const preview = usingPreview ? "Playing the low-resolution preview. " : "";
  if (!first) return `${preview}This session has no laps to sync to.`;
  if (!synced) return `${preview}Not synced yet. Mark the first start/finish crossing.`;
  if (reference && comparison) {
    return `${preview}Lap ${reference.id} and lap ${comparison.id} each play from their own start line.`;
  }
  if (reference) return `${preview}Lap ${reference.id} plays from its own start line.`;
  return `${preview}Synced.`;
}
