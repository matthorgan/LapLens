import { useEffect, useMemo, useRef } from "react";
import uPlot from "uplot";
import "uplot/dist/uPlot.min.css";
import { channelAtDistance, timeAtDistance } from "../core/laps";
import type { Lap } from "../core/types";

uPlot.sync("laplens");

type Props = {
  reference: Lap;
  comparison: Lap | null;
  cursor: number;
  onScrub: (distance: number) => void;
};

type Series = {
  distance: number[];
  refSpeed: (number | null)[];
  cmpSpeed: (number | null)[];
  delta: (number | null)[];
  refLat: (number | null)[];
  cmpLat: (number | null)[];
};

const REF = "#4c9dff";
const CMP = "#ff5d5d";

export function Charts({ reference, comparison, cursor, onScrub }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const speedRef = useRef<HTMLDivElement>(null);
  const deltaRef = useRef<HTMLDivElement>(null);
  const gRef = useRef<HTMLDivElement>(null);
  const plotsRef = useRef<uPlot[]>([]);
  const onScrubRef = useRef(onScrub);
  const silentRef = useRef(false);
  const cursorRef = useRef(cursor);
  onScrubRef.current = onScrub;
  cursorRef.current = cursor;
  const series = useMemo(() => buildSeries(reference, comparison), [reference, comparison]);

  useEffect(() => {
    const speedEl = speedRef.current;
    const deltaEl = deltaRef.current;
    const gEl = gRef.current;
    const host = hostRef.current;
    if (!speedEl || !deltaEl || !gEl || !host) return;

    const scrub = (plot: uPlot) => {
      if (silentRef.current) return;
      const idx = plot.cursor.idx;
      if (idx == null || idx < 0) return;
      const distance = plot.data[0][idx];
      if (typeof distance !== "number") return;
      if (Math.abs(distance - cursorRef.current) < 1.5) return;
      onScrubRef.current(distance);
    };

    const make = (
      el: HTMLElement,
      yLabel: (value: number) => string,
      names: string[],
      colors: string[],
      columns: (number | null)[][],
      showX: boolean,
    ) => {
      const height = Math.max(72, el.clientHeight || 120);
      return new uPlot(
        {
          width: el.clientWidth || host.clientWidth || 640,
          height,
          legend: { show: false },
          cursor: {
            x: true,
            y: false,
            drag: { x: false, y: false },
            points: { show: false },
            sync: { key: "laplens", setSeries: false },
          },
          scales: { x: { time: false } },
          axes: [axisX(showX), axisY(yLabel)],
          series: [
            {},
            ...names.map((label, index) => ({
              label,
              stroke: colors[index],
              width: 1.6,
              points: { show: false },
            })),
          ],
          hooks: { setCursor: [scrub] },
        },
        [series.distance, ...columns],
        el,
      );
    };

    const plots = [
      make(speedEl, (value) => value.toFixed(0), labels(comparison, "km/h"), colors(comparison), speedColumns(series, comparison), false),
      make(deltaEl, (value) => value.toFixed(2), ["Delta"], ["#f2f5fa"], [series.delta], false),
      make(gEl, (value) => value.toFixed(2), labels(comparison, "g"), colors(comparison), gColumns(series, comparison), true),
    ];
    plotsRef.current = plots;

    const observer = new ResizeObserver(() => {
      const blocks = [speedEl, deltaEl, gEl];
      plots.forEach((plot, index) => {
        const block = blocks[index];
        plot.setSize({
          width: Math.max(10, block.clientWidth),
          height: Math.max(72, block.clientHeight),
        });
      });
    });
    observer.observe(host);
    return () => {
      observer.disconnect();
      plots.forEach((plot) => plot.destroy());
      plotsRef.current = [];
    };
  }, [series, comparison]);

  useEffect(() => {
    silentRef.current = true;
    for (const plot of plotsRef.current) {
      const left = plot.valToPos(cursor, "x");
      if (Number.isFinite(left)) plot.setCursor({ left, top: 0 }, false);
    }
    silentRef.current = false;
  }, [cursor, series]);

  return (
    <div className="charts" ref={hostRef}>
      <div className="chart-key">
        <span>
          <i className="swatch ref" /> Lap {reference.id} ref
        </span>
        {comparison && (
          <span>
            <i className="swatch cmp" /> Lap {comparison.id}
          </span>
        )}
      </div>
      <div className="chart-block">
        <span className="chart-label">Speed</span>
        <div ref={speedRef} className="chart-plot" />
      </div>
      <div className="chart-block">
        <span className="chart-label">Delta-T</span>
        <div ref={deltaRef} className="chart-plot" />
      </div>
      <div className="chart-block">
        <span className="chart-label">Lateral g</span>
        <div ref={gRef} className="chart-plot" />
      </div>
    </div>
  );
}

function labels(comparison: Lap | null, unit: string): string[] {
  return comparison ? [`Ref ${unit}`, `Lap ${unit}`] : [`Ref ${unit}`];
}

function colors(comparison: Lap | null): string[] {
  return comparison ? [REF, CMP] : [REF];
}

function speedColumns(series: Series, comparison: Lap | null): (number | null)[][] {
  return comparison ? [series.refSpeed, series.cmpSpeed] : [series.refSpeed];
}

function gColumns(series: Series, comparison: Lap | null): (number | null)[][] {
  return comparison ? [series.refLat, series.cmpLat] : [series.refLat];
}

function axisX(showLabels: boolean): uPlot.Axis {
  return {
    stroke: "#8b93a7",
    grid: { stroke: "#262b36", width: 1 },
    ticks: { stroke: "#343b4a", width: 1 },
    size: showLabels ? 26 : 8,
    values: showLabels ? (_plot, values) => values.map((value) => `${Math.round(Number(value))}`) : () => [],
  };
}

function axisY(format: (value: number) => string): uPlot.Axis {
  return {
    stroke: "#8b93a7",
    grid: { stroke: "#262b36", width: 1 },
    ticks: { stroke: "#343b4a", width: 1 },
    size: 46,
    values: (_plot, values) => values.map((value) => format(Number(value))),
  };
}

function buildSeries(reference: Lap, comparison: Lap | null): Series {
  const max = Math.max(reference.length, comparison?.length ?? 0);
  const count = Math.max(2, Math.ceil(max) + 1);
  const distance: number[] = [];
  const refSpeed: (number | null)[] = [];
  const cmpSpeed: (number | null)[] = [];
  const delta: (number | null)[] = [];
  const refLat: (number | null)[] = [];
  const cmpLat: (number | null)[] = [];
  for (let index = 0; index < count; index += 1) {
    const meters = Math.min(max, index);
    distance.push(meters);
    const refTime = meters <= reference.length ? timeAtDistance(reference, meters) : null;
    const cmpTime =
      comparison && meters <= comparison.length ? timeAtDistance(comparison, meters) : null;
    refSpeed.push(refTime == null ? null : channelAtDistance(reference, meters, reference.speed));
    refLat.push(refTime == null ? null : channelAtDistance(reference, meters, reference.latAcc));
    cmpSpeed.push(
      comparison && cmpTime != null ? channelAtDistance(comparison, meters, comparison.speed) : null,
    );
    cmpLat.push(
      comparison && cmpTime != null ? channelAtDistance(comparison, meters, comparison.latAcc) : null,
    );
    delta.push(refTime != null && cmpTime != null ? cmpTime - refTime : null);
  }
  return { distance, refSpeed, cmpSpeed, delta, refLat, cmpLat };
}
