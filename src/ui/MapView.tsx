import maplibregl from "maplibre-gl";
import { useEffect, useRef } from "react";
import "maplibre-gl/dist/maplibre-gl.css";
import { positionAtDistance } from "../core/laps";
import type { Gate, Lap, Sample } from "../core/types";

type Props = {
  samples: Sample[];
  gate: Gate | null;
  laps: Lap[];
  hidden: ReadonlySet<number>;
  referenceId: number | null;
  comparisonId: number | null;
  cursor: number;
};

type FeatureCollection = {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    properties: Record<string, string>;
    geometry: { type: "LineString" | "Point"; coordinates: number[] | number[][] };
  }>;
};

const empty = { type: "FeatureCollection", features: [] } as GeoJSON.FeatureCollection;

const style: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    esri: {
      type: "raster",
      tiles: [
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      ],
      tileSize: 256,
      attribution: "Tiles © Esri",
      maxzoom: 19,
    },
  },
  layers: [
    { id: "bg", type: "background", paint: { "background-color": "#141820" } },
    { id: "esri", type: "raster", source: "esri" },
  ],
};

export function MapView(props: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const readyRef = useRef(false);
  const fittedRef = useRef("");
  const propsRef = useRef(props);
  propsRef.current = props;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const map = new maplibregl.Map({
      container,
      style,
      center: [0, 0],
      zoom: 2,
      attributionControl: { compact: true },
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    map.on("load", () => {
      map.addSource("laps", { type: "geojson", data: empty });
      map.addLayer({
        id: "laps-line",
        type: "line",
        source: "laps",
        paint: {
          "line-color": ["match", ["get", "role"], "ref", "#4c9dff", "cmp", "#ff5d5d", "#d5dbe6"],
          "line-width": ["match", ["get", "role"], "ref", 3.5, "cmp", 3, 1.6],
          "line-opacity": ["match", ["get", "role"], "other", 0.55, 0.95],
        },
      });
      map.addSource("gate", { type: "geojson", data: empty });
      map.addLayer({
        id: "gate-line",
        type: "line",
        source: "gate",
        paint: {
          "line-color": "#f5c451",
          "line-width": 4,
        },
      });
      map.addSource("cars", { type: "geojson", data: empty });
      map.addLayer({
        id: "cars",
        type: "circle",
        source: "cars",
        paint: {
          "circle-radius": 6,
          "circle-color": ["get", "color"],
          "circle-stroke-width": 2,
          "circle-stroke-color": "#ffffff",
        },
      });
      readyRef.current = true;
      drawLines();
      drawCars();
      map.resize();
    });
    const observer = new ResizeObserver(() => map.resize());
    observer.observe(container);
    mapRef.current = map;
    return () => {
      observer.disconnect();
      readyRef.current = false;
      map.remove();
      mapRef.current = null;
      fittedRef.current = "";
    };
  }, []);

  useEffect(() => {
    drawLines();
  }, [props.samples, props.laps, props.hidden, props.referenceId, props.comparisonId, props.gate]);

  useEffect(() => {
    drawCars();
  }, [props.cursor, props.laps, props.referenceId, props.comparisonId]);

  return <div ref={containerRef} className="map" />;

  function drawLines() {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    const current = propsRef.current;
    const lapsSource = map.getSource("laps") as maplibregl.GeoJSONSource | undefined;
    const gateSource = map.getSource("gate") as maplibregl.GeoJSONSource | undefined;
    if (!lapsSource || !gateSource) return;

    const visible = current.laps.filter((lap) => !current.hidden.has(lap.id));
    const features: FeatureCollection["features"] = [];
    if (visible.length === 0 && current.samples.length > 1) {
      features.push({
        type: "Feature",
        properties: { role: "other" },
        geometry: {
          type: "LineString",
          coordinates: current.samples.map((sample) => [sample.lon, sample.lat]),
        },
      });
    } else {
      const ordered = [
        ...visible.filter((lap) => lap.id !== current.referenceId && lap.id !== current.comparisonId),
        ...visible.filter((lap) => lap.id === current.comparisonId),
        ...visible.filter((lap) => lap.id === current.referenceId),
      ];
      for (const lap of ordered) {
        const role =
          lap.id === current.referenceId ? "ref" : lap.id === current.comparisonId ? "cmp" : "other";
        features.push({
          type: "Feature",
          properties: { role },
          geometry: {
            type: "LineString",
            coordinates: lap.lon.map((lon, index) => [lon, lap.lat[index]]),
          },
        });
      }
    }
    lapsSource.setData({ type: "FeatureCollection", features } as GeoJSON.FeatureCollection);

    gateSource.setData(
      current.gate
        ? {
            type: "FeatureCollection",
            features: [
              {
                type: "Feature",
                properties: {},
                geometry: {
                  type: "LineString",
                  coordinates: [
                    [current.gate.a.lon, current.gate.a.lat],
                    [current.gate.b.lon, current.gate.b.lat],
                  ],
                },
              },
            ],
          }
        : empty,
    );

    if (current.samples.length > 0) {
      const first = current.samples[0];
      const last = current.samples[current.samples.length - 1];
      const key = `${current.samples.length}:${first.lat}:${first.lon}:${last.lat}:${last.lon}`;
      if (fittedRef.current !== key) {
        const bounds = new maplibregl.LngLatBounds();
        for (const sample of current.samples) bounds.extend([sample.lon, sample.lat]);
        map.fitBounds(bounds, { padding: 36, animate: false, maxZoom: 17 });
        fittedRef.current = key;
      }
    }
  }

  function drawCars() {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    const current = propsRef.current;
    const source = map.getSource("cars") as maplibregl.GeoJSONSource | undefined;
    if (!source) return;
    const features: FeatureCollection["features"] = [];
    const ref = current.laps.find((lap) => lap.id === current.referenceId);
    const cmp = current.laps.find((lap) => lap.id === current.comparisonId);
    pushCar(features, ref, current.cursor, "#4c9dff");
    pushCar(features, cmp, current.cursor, "#ff5d5d");
    source.setData({ type: "FeatureCollection", features } as GeoJSON.FeatureCollection);
  }
}

function pushCar(
  features: FeatureCollection["features"],
  lap: Lap | undefined,
  cursor: number,
  color: string,
) {
  if (!lap) return;
  const position = positionAtDistance(lap, Math.min(cursor, lap.length));
  if (!position) return;
  features.push({
    type: "Feature",
    properties: { color },
    geometry: { type: "Point", coordinates: [position.lon, position.lat] },
  });
}
