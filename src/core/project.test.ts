import { describe, expect, it } from "vitest";
import { createProject, parseProject, projectPathFor, serializeProject } from "./project";

describe("project file", () => {
  it("round trips lap visibility, the reference lap, and video sync", () => {
    const project = createProject({
      path: "C:/sessions/fontenay.vbo",
      name: "fontenay.vbo",
    });
    project.referenceLapId = 4;
    project.hiddenLapIds = [1, 2];
    project.videos = [{ path: "GOPR1234.MP4", syncDataTime: 412.8, syncVideoTime: 15.4 }];
    const parsed = parseProject(serializeProject(project));
    expect(parsed).toEqual(project);
    expect(projectPathFor(project.source.path)).toBe("C:/sessions/fontenay.laplens.json");
    expect(projectPathFor("C:\\sessions\\fontenay.VBO")).toBe(
      "C:\\sessions\\fontenay.laplens.json",
    );
  });

  it("rejects a future file version", () => {
    expect(() => parseProject('{"version":2}')).toThrow(/Unsupported/);
  });
});
