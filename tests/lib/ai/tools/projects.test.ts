import { describe, it, expect, vi, beforeEach } from "vitest";
import { projectTools } from "@/lib/ai/tools/projects";
import type { ToolContext } from "@/lib/ai/tools/types";

const mockGetUserProjects = vi.fn();
const mockGetProject = vi.fn();
const mockCreateProject = vi.fn();
const mockUpdateProject = vi.fn();
const mockDeleteProject = vi.fn();

vi.mock("@/lib/db", () => ({
  ProjectsDB: class {
    getUserProjects = mockGetUserProjects;
    getProject = mockGetProject;
    createProject = mockCreateProject;
    updateProject = mockUpdateProject;
    deleteProject = mockDeleteProject;
  },
}));

function makeCtx(overrides?: Partial<ToolContext>): ToolContext {
  return {
    userId: "user-123",
    supabase: {} as ToolContext["supabase"],
    date: "2026-04-10",
    timezone: "America/Toronto",
    ...overrides,
  };
}

function findTool(name: string) {
  return projectTools().find((t) => t.name === name)!;
}

describe("projectTools", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 5 tool definitions", () => {
    const tools = projectTools();
    expect(tools).toHaveLength(5);
    expect(tools.map((t) => t.name)).toEqual([
      "getProjects",
      "getProject",
      "createProject",
      "updateProject",
      "deleteProject",
    ]);
  });

  it("getProject calls ProjectsDB.getProject", async () => {
    const ctx = makeCtx();
    mockGetProject.mockResolvedValue({ id: "p1", name: "Side hustle" });
    const result = await findTool("getProject").execute(
      { projectId: "p1" },
      ctx,
    );
    expect(mockGetProject).toHaveBeenCalledWith("p1", "user-123");
    expect(result).toEqual({ id: "p1", name: "Side hustle" });
  });

  it("createProject calls ProjectsDB.createProject with defaults", async () => {
    const ctx = makeCtx();
    mockCreateProject.mockResolvedValue({ id: "p2", name: "New proj" });
    await findTool("createProject").execute({ name: "New proj" }, ctx);
    expect(mockCreateProject).toHaveBeenCalledWith({
      user_id: "user-123",
      name: "New proj",
      section: "personal",
      color: "#3B82F6",
    });
  });

  it("updateProject removes undefined values", async () => {
    const ctx = makeCtx();
    mockUpdateProject.mockResolvedValue({ id: "p1", name: "Renamed" });
    await findTool("updateProject").execute(
      { projectId: "p1", name: "Renamed" },
      ctx,
    );
    expect(mockUpdateProject).toHaveBeenCalledWith("p1", "user-123", {
      name: "Renamed",
    });
  });

  it("deleteProject returns success", async () => {
    const ctx = makeCtx();
    mockDeleteProject.mockResolvedValue(undefined);
    const result = await findTool("deleteProject").execute(
      { projectId: "p1" },
      ctx,
    );
    expect(mockDeleteProject).toHaveBeenCalledWith("p1", "user-123");
    expect(result).toEqual({ success: true });
  });
});
