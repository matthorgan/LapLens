import { formatDelta, formatLapTime, formatSpeed } from "../core/format";

type Props = {
  playing: boolean;
  canPlay: boolean;
  cursor: number;
  domain: number;
  refTime: number | null;
  delta: number | null;
  refSpeed: number | null;
  cmpSpeed: number | null;
  onToggle: () => void;
  onScrub: (distance: number) => void;
};

export function Transport({
  playing,
  canPlay,
  cursor,
  domain,
  refTime,
  delta,
  refSpeed,
  cmpSpeed,
  onToggle,
  onScrub,
}: Props) {
  return (
    <div className="transport">
      <button type="button" onClick={onToggle} disabled={!canPlay}>
        {playing ? "Pause" : "Play"}
      </button>
      <input
        type="range"
        min={0}
        max={domain || 0}
        step={0.5}
        value={domain ? Math.min(cursor, domain) : 0}
        disabled={!canPlay}
        aria-label="Distance along the lap"
        onChange={(event) => onScrub(Number(event.target.value))}
      />
      <span className="readout">{refTime == null ? "--" : formatLapTime(refTime)}</span>
      <span className={deltaClass(delta)}>{delta == null ? "" : formatDelta(delta)}</span>
      <span className="readout muted">{cursor.toFixed(0)} m</span>
      <span className="readout ref-ink">{refSpeed == null ? "" : formatSpeed(refSpeed)}</span>
      <span className="readout cmp-ink">{cmpSpeed == null ? "" : formatSpeed(cmpSpeed)}</span>
    </div>
  );
}

function deltaClass(delta: number | null): string {
  if (delta == null || Math.abs(delta) < 0.005) return "readout";
  return delta > 0 ? "readout delta-pos" : "readout delta-neg";
}
