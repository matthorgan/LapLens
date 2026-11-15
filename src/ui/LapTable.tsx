import { formatDelta, formatLapTime } from "../core/format";
import type { Lap } from "../core/types";

type Props = {
  laps: Lap[];
  hidden: ReadonlySet<number>;
  reference: Lap | null;
  selectedId: number | null;
  bestId: number | null;
  onToggle: (id: number) => void;
  onSelect: (id: number) => void;
  onPin: (id: number) => void;
};

export function LapTable({
  laps,
  hidden,
  reference,
  selectedId,
  bestId,
  onToggle,
  onSelect,
  onPin,
}: Props) {
  if (laps.length === 0) {
    return <p className="empty-copy">No full laps crossed the start/finish gate.</p>;
  }

  return (
    <table className="lap-table">
      <thead>
        <tr>
          <th>Show</th>
          <th>Lap</th>
          <th>Time</th>
          <th>Delta</th>
          <th>Ref</th>
        </tr>
      </thead>
      <tbody>
        {laps.map((lap) => {
          const isHidden = hidden.has(lap.id);
          const isRef = reference?.id === lap.id;
          const isSelected = selectedId === lap.id;
          const delta = reference ? lap.lapTime - reference.lapTime : null;
          const deltaClass =
            delta == null || Math.abs(delta) < 0.005 ? "" : delta > 0 ? "delta-pos" : "delta-neg";
          return (
            <tr
              key={lap.id}
              className={[
                isHidden ? "is-hidden" : "",
                isSelected ? "is-selected" : "",
                isRef ? "is-ref" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              onClick={() => {
                if (!isHidden) onSelect(lap.id);
              }}
            >
              <td>
                <input
                  type="checkbox"
                  checked={!isHidden}
                  aria-label={`Show lap ${lap.id}`}
                  onClick={(event) => event.stopPropagation()}
                  onChange={() => onToggle(lap.id)}
                />
              </td>
              <td>
                {lap.id}
                {bestId === lap.id && <span className="chip">best</span>}
              </td>
              <td>{formatLapTime(lap.lapTime)}</td>
              <td className={deltaClass}>{delta == null ? "" : formatDelta(delta)}</td>
              <td>
                <button
                  type="button"
                  className={isRef ? "ref-btn is-on" : "ref-btn"}
                  aria-pressed={isRef}
                  aria-label={`Set lap ${lap.id} as reference`}
                  onClick={(event) => {
                    event.stopPropagation();
                    onPin(lap.id);
                  }}
                >
                  {isRef ? "ref" : "set"}
                </button>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
