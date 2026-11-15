import { projectPathFor } from "../core/project";

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
