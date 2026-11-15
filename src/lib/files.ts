import { projectPathFor } from "../core/project";
import { frameSecondsFromMoov } from "../core/video";

export function inTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export function isFilesystemPath(path: string): boolean {
  return /^[a-zA-Z]:[\\/]/.test(path) || path.startsWith("\\\\");
}

export async function readOptionalText(path: string): Promise<string | null> {
  if (!inTauri() || !isFilesystemPath(path)) return null;
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<string | null>("read_text_file", { path });
}

export async function openVbo(): Promise<{ path: string; name: string; text: string } | null> {
  if (inTauri()) {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const picked = await open({
      multiple: false,
      filters: [{ name: "RaceBox VBO", extensions: ["vbo"] }],
    });
    if (typeof picked !== "string") return null;
    const { invoke } = await import("@tauri-apps/api/core");
    const text = await invoke<string | null>("read_text_file", { path: picked });
    if (!text) throw new Error("Could not read that VBO");
    return { path: picked, name: fileName(picked), text };
  }
  const file = await pickFile(".vbo");
  if (!file) return null;
  return { path: file.name, name: file.name, text: await file.text() };
}

export async function openVideo(): Promise<{ path: string; url: string; file: File | null } | null> {
  if (inTauri()) {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const picked = await open({
      multiple: false,
      filters: [{ name: "GoPro video", extensions: ["mp4", "mov", "lrv"] }],
    });
    if (typeof picked !== "string") return null;
    const { convertFileSrc } = await import("@tauri-apps/api/core");
    return { path: picked, url: convertFileSrc(picked), file: null };
  }
  const file = await pickFile("video/mp4,video/quicktime,.mp4,.mov,.lrv");
  if (!file) return null;
  return { path: file.name, url: URL.createObjectURL(file), file };
}

export function lrvCandidates(path: string): string[] {
  if (/\.lrv$/i.test(path)) return [];
  const stem = path.replace(/\.[^./\\]+$/, "");
  if (stem === path) return [];
  return [`${stem}.LRV`, `${stem}.lrv`];
}

export async function frameSecondsForPath(path: string): Promise<number | null> {
  if (!inTauri() || !isFilesystemPath(path)) return null;
  const { invoke } = await import("@tauri-apps/api/core");
  const encoded = await invoke<string | null>("read_moov_base64", { path });
  if (!encoded) return null;
  return frameSecondsFromMoov(decodeBase64(encoded));
}

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export async function fileExists(path: string): Promise<boolean> {
  if (!inTauri() || !isFilesystemPath(path)) return false;
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<boolean>("file_exists", { path });
}

export async function openProjectFile(): Promise<{ name: string; text: string } | null> {
  if (inTauri()) {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const picked = await open({
      multiple: false,
      filters: [{ name: "LapLens session", extensions: ["json"] }],
    });
    if (typeof picked !== "string") return null;
    const { invoke } = await import("@tauri-apps/api/core");
    const text = await invoke<string | null>("read_text_file", { path: picked });
    if (!text) throw new Error("Could not read that session file");
    return { name: fileName(picked), text };
  }
  const file = await pickFile(".json,application/json");
  if (!file) return null;
  return { name: file.name, text: await file.text() };
}

export async function saveProjectFile(
  vboPath: string,
  contents: string,
  downloadName: string,
): Promise<string> {
  if (inTauri() && isFilesystemPath(vboPath)) {
    const dest = projectPathFor(vboPath);
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("write_text_file", { path: dest, contents });
    return dest;
  }
  download(downloadName, contents);
  return downloadName;
}

function fileName(path: string): string {
  return path.split(/[/\\]/).pop() ?? path;
}

function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.click();
  });
}

function download(name: string, contents: string): void {
  const url = URL.createObjectURL(new Blob([contents], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}
