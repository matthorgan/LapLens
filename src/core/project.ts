import type { ProjectFile, VideoClip } from "./types";

export function createProject(source: { path: string; name: string }): ProjectFile {
  return {
    version: 1,
    source,
    referenceLapId: null,
    hiddenLapIds: [],
    videos: [],
  };
}

export function projectPathFor(vboPath: string): string {
  return `${vboPath.replace(/\.vbo$/i, "")}.laplens.json`;
}

export function serializeProject(project: ProjectFile): string {
  return `${JSON.stringify(project, null, 2)}\n`;
}

export function parseProject(text: string): ProjectFile {
  const data = JSON.parse(text) as Partial<ProjectFile>;
  if (data.version !== 1) throw new Error("Unsupported session file");
  const source = data.source;
  return {
    version: 1,
    source: {
      path: typeof source?.path === "string" ? source.path : "",
      name: typeof source?.name === "string" ? source.name : "",
    },
    referenceLapId: typeof data.referenceLapId === "number" ? data.referenceLapId : null,
    hiddenLapIds: Array.isArray(data.hiddenLapIds)
      ? data.hiddenLapIds.filter((id): id is number => typeof id === "number")
      : [],
    videos: Array.isArray(data.videos) ? data.videos.filter(isVideo) : [],
  };
}

function isVideo(value: unknown): value is VideoClip {
  if (!value || typeof value !== "object") return false;
  const clip = value as Partial<VideoClip>;
  return (
    typeof clip.path === "string" &&
    typeof clip.syncDataTime === "number" &&
    typeof clip.syncVideoTime === "number"
  );
}
