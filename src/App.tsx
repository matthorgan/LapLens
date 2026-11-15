import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatLapTime } from "./core/format";
import { channelAtDistance, detectLaps, distanceAtTime, fastestLap, timeAtDistance } from "./core/laps";
import { createProject, parseProject, projectPathFor, serializeProject } from "./core/project";
import type { Lap, ProjectFile, Session } from "./core/types";
import { parseVbo } from "./core/vbo";
import { isFilesystemPath, openProjectFile, openVbo, readOptionalText, saveProjectFile } from "./lib/files";
import { Charts } from "./ui/Charts";
import { LapTable } from "./ui/LapTable";
import { MapView } from "./ui/MapView";
import { Transport } from "./ui/Transport";

type Loaded = {
  session: Session;
  laps: Lap[];
  project: ProjectFile;
};

type Notice = {
  kind: "error" | "info";
  text: string;
};

export function App() {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [cursor, setCursor] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const cursorRef = useRef(0);
  const domainRef = useRef(0);

  const hidden = useMemo(() => new Set(loaded?.project.hiddenLapIds ?? []), [loaded]);
  const reference = useMemo(
    () => (loaded ? resolveReference(loaded.laps, loaded.project) : null),
    [loaded],
  );
  const selected = loaded?.laps.find((lap) => lap.id === selectedId) ?? null;
  const comparison =
    selected && reference && selected.id !== reference.id && !hidden.has(selected.id) ? selected : null;
  const best = loaded ? fastestLap(loaded.laps, hidden) : null;
  const domain = Math.max(reference?.length ?? 0, comparison?.length ?? 0);
  domainRef.current = domain;

  const loadText = useCallback(async (text: string, path: string, name: string, readSidecar: boolean) => {
    const session = parseVbo(text);
    const laps = session.gate ? detectLaps(session.samples, session.gate) : [];
    let project = createProject({ path, name });
    let sidecarError = "";
    if (readSidecar && isFilesystemPath(path)) {
      try {
        const existing = await readOptionalText(projectPathFor(path));
        if (existing) project = { ...parseProject(existing), source: { path, name } };
      } catch {
        sidecarError = "The session file next to this VBO could not be read";
      }
    }
    cursorRef.current = 0;
    setCursor(0);
    setPlaying(false);
    setSelectedId(null);
    setLoaded({ session, laps, project });
    setNotice(sidecarError ? { kind: "error", text: sidecarError } : null);
  }, []);

  useEffect(() => {
    const param = new URLSearchParams(window.location.search).get("vbo");
    if (!param) return;
    let cancel = false;
    fetch(param)
      .then((response) => {
        if (!response.ok) throw new Error("Could not load that VBO");
        return response.text();
      })
      .then((text) => {
        if (cancel) return;
        const name = param.split("/").pop() || "session.vbo";
        return loadText(text, name, name, false);
      })
      .catch((err: unknown) => {
        if (!cancel) {
          setNotice({
            kind: "error",
            text: err instanceof Error ? err.message : "Could not load that VBO",
          });
        }
      });
    return () => {
      cancel = true;
    };
  }, [loadText]);

  useEffect(() => {
    if (!loaded) return;
    const hiddenIds = new Set(loaded.project.hiddenLapIds);
    const valid =
      selectedId != null &&
      loaded.laps.some((lap) => lap.id === selectedId && !hiddenIds.has(lap.id));
    if (valid) return;
    setSelectedId(pickComparison(loaded.laps, loaded.project));
  }, [loaded, selectedId]);

  useEffect(() => {
    if (!playing || !reference) return;
    let last = performance.now();
    let time = timeAtDistance(reference, Math.min(cursorRef.current, reference.length)) ?? 0;
    if (time >= reference.lapTime - 0.02) time = 0;
    let frame = 0;
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      time += dt;
      if (time >= reference.lapTime) {
        cursorRef.current = reference.length;
        setCursor(reference.length);
        setPlaying(false);
        return;
      }
      const distance = distanceAtTime(reference, time);
      cursorRef.current = distance;
      setCursor(distance);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, reference]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== " " && event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      const target = event.target;
      if (target instanceof HTMLElement && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) {
        return;
      }
      event.preventDefault();
      if (event.key === " ") {
        setPlaying((value) => (domainRef.current > 0 ? !value : false));
        return;
      }
      const next = Math.min(
        Math.max(0, cursorRef.current + (event.key === "ArrowLeft" ? -5 : 5)),
        domainRef.current,
      );
      cursorRef.current = next;
      setCursor(next);
      setPlaying(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const scrub = (distance: number) => {
    const next = Math.min(Math.max(0, distance), domain || 0);
    cursorRef.current = next;
    setCursor(next);
    setPlaying(false);
  };

  const toggleHidden = (id: number) => {
    const hiding = loaded != null && !hidden.has(id);
    setLoaded((prev) => {
      if (!prev) return prev;
      const hiddenIds = new Set(prev.project.hiddenLapIds);
      if (hiddenIds.has(id)) hiddenIds.delete(id);
      else hiddenIds.add(id);
      const referenceLapId =
        prev.project.referenceLapId === id && hiddenIds.has(id) ? null : prev.project.referenceLapId;
      return {
        ...prev,
        project: {
          ...prev.project,
          hiddenLapIds: [...hiddenIds].sort((a, b) => a - b),
          referenceLapId,
        },
      };
    });
    if (hiding) setSelectedId((current) => (current === id ? null : current));
  };

  const pinReference = (id: number) => {
    setLoaded((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        project: {
          ...prev.project,
          referenceLapId: id,
          hiddenLapIds: prev.project.hiddenLapIds.filter((hiddenId) => hiddenId !== id),
        },
      };
    });
  };

  async function openFile() {
    setNotice(null);
    try {
      const picked = await openVbo();
      if (!picked) return;
      await loadText(picked.text, picked.path, picked.name, true);
    } catch (err) {
      setNotice({
        kind: "error",
        text: err instanceof Error ? err.message : "Could not open that VBO",
      });
    }
  }

  async function saveSession() {
    if (!loaded) return;
    try {
      const downloadName = `${loaded.project.source.name.replace(/\.vbo$/i, "")}.laplens.json`;
      const dest = await saveProjectFile(
        loaded.project.source.path,
        serializeProject(loaded.project),
        downloadName,
      );
      const label = dest.split(/[/\\]/).pop() ?? dest;
      setNotice({ kind: "info", text: `Saved ${label}` });
    } catch (err) {
      setNotice({
        kind: "error",
        text: err instanceof Error ? err.message : "Could not save the session",
      });
    }
  }

  async function loadSession() {
    if (!loaded) {
      setNotice({ kind: "error", text: "Open a VBO before loading a session file" });
      return;
    }
    try {
      const picked = await openProjectFile();
      if (!picked) return;
      const project = parseProject(picked.text);
      setLoaded({ ...loaded, project: { ...project, source: loaded.project.source } });
      setSelectedId(null);
      setNotice({ kind: "info", text: `Loaded ${picked.name}` });
    } catch (err) {
      setNotice({
        kind: "error",
        text: err instanceof Error ? err.message : "Could not read that session file",
      });
    }
  }

  const refTime = reference ? timeAtDistance(reference, Math.min(cursor, reference.length)) : null;
  const cmpTime = comparison ? timeAtDistance(comparison, Math.min(cursor, comparison.length)) : null;
  const delta = refTime != null && cmpTime != null ? cmpTime - refTime : null;
  const refSpeed = reference
    ? channelAtDistance(reference, Math.min(cursor, reference.length), reference.speed)
    : null;
  const cmpSpeed = comparison
    ? channelAtDistance(comparison, Math.min(cursor, comparison.length), comparison.speed)
    : null;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">LapLens</div>
        <div className="session-meta">
          {loaded ? (
            <>
              <strong>{loaded.session.venue || loaded.project.source.name}</strong>
              <span>{loaded.session.startedAt}</span>
              <span>
                {loaded.laps.length} {loaded.laps.length === 1 ? "lap" : "laps"}
              </span>
              {best && <span>best {formatLapTime(best.lapTime)}</span>}
            </>
          ) : (
            <span>RaceBox lap comparison</span>
          )}
        </div>
        <div className="toolbar">
          <button type="button" onClick={() => void openFile()}>
            Open VBO
          </button>
          <button type="button" onClick={() => void saveSession()} disabled={!loaded}>
            Save session
          </button>
          <button type="button" onClick={() => void loadSession()} disabled={!loaded}>
            Load session
          </button>
        </div>
        {notice && <p className={notice.kind === "error" ? "banner error" : "banner"}>{notice.text}</p>}
      </header>
      <Transport
        playing={playing}
        canPlay={reference != null}
        cursor={cursor}
        domain={domain}
        refTime={refTime}
        delta={delta}
        refSpeed={refSpeed}
        cmpSpeed={cmpSpeed}
        onToggle={() => setPlaying((value) => !value)}
        onScrub={scrub}
      />
      {loaded ? (
        <main className="workspace">
          <section className="lap-panel">
            <div className="lap-scroll">
              {loaded.session.gate ? (
                <LapTable
                  laps={loaded.laps}
                  hidden={hidden}
                  reference={reference}
                  selectedId={selected?.id ?? null}
                  bestId={best?.id ?? null}
                  onToggle={toggleHidden}
                  onSelect={setSelectedId}
                  onPin={pinReference}
                />
              ) : (
                <p className="empty-copy">This VBO has no start/finish gate.</p>
              )}
            </div>
            <footer className="lap-foot">
              {reference
                ? `Reference lap ${reference.id} is ${formatLapTime(reference.lapTime)} over ${reference.length.toFixed(0)} m`
                : "Hide a lap to keep it out of the best lap"}
            </footer>
          </section>
          <MapView
            samples={loaded.session.samples}
            gate={loaded.session.gate}
            laps={loaded.laps}
            hidden={hidden}
            referenceId={reference?.id ?? null}
            comparisonId={comparison?.id ?? null}
            cursor={cursor}
          />
          {reference ? (
            <Charts
              reference={reference}
              comparison={comparison}
              cursor={Math.min(cursor, domain || reference.length)}
              onScrub={scrub}
            />
          ) : (
            <div className="charts empty-copy">Select a lap to plot speed and delta.</div>
          )}
        </main>
      ) : (
        <main className="welcome">
          <h1>Compare laps from a RaceBox VBO</h1>
          <p>Open a session to see lap times, the racing line, speed, and delta along the track.</p>
          <button type="button" onClick={() => void openFile()}>
            Open VBO
          </button>
        </main>
      )}
    </div>
  );
}

function resolveReference(laps: Lap[], project: ProjectFile): Lap | null {
  const hidden = new Set(project.hiddenLapIds);
  if (project.referenceLapId != null) {
    const pinned = laps.find((lap) => lap.id === project.referenceLapId && !hidden.has(lap.id));
    if (pinned) return pinned;
  }
  return fastestLap(laps, hidden);
}

function pickComparison(laps: Lap[], project: ProjectFile): number | null {
  const ref = resolveReference(laps, project);
  const hidden = new Set(project.hiddenLapIds);
  const ranked = laps
    .filter((lap) => !hidden.has(lap.id))
    .sort((a, b) => a.lapTime - b.lapTime);
  const other = ranked.find((lap) => lap.id !== ref?.id);
  return (other ?? ref)?.id ?? null;
}
