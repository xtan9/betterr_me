import { describe, it, expect, vi, beforeEach } from "vitest";
import { projectTools } from "@/lib/ai/tools/projects";
import type { ToolContext } from "@/lib/ai/tools/types";

const mockGetUserProjects = vi.fn();
const mockGetProject = vi.fn();
const mockCreateProject = vi.fn();
const mockProjectCreate = vi.fn();
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

vi.mock("@/lib/projects/writes", () => ({
  createProjectWrites: vi.fn(() => ({ create: mockProjectCreate })),
  toProjectResponse: vi.fn((project) => project),
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

  it("getProject returns error when not found", async () => {
    const ctx = makeCtx();
    mockGetProject.mockResolvedValue(null);
    const result = await findTool("getProject").execute(
      { projectId: "p999" },
      ctx,
    );
    expect(result).toEqual({ error: "Project not found" });
  });

  it("createProject delegates trusted identity and existing inputs", async () => {
    const ctx = makeCtx();
    const project = { id: "p2", name: "New proj" };
    mockProjectCreate.mockResolvedValue({ type: "created", project });
    await findTool("createProject").execute({ name: "New proj" }, ctx);
    expect(mockProjectCreate).toHaveBeenCalledWith({
      userId: "user-123",
      name: "New proj",
      section: undefined,
      color: undefined,
    });
    expect(mockCreateProject).not.toHaveBeenCalled();
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

  it("deleteProject verifies existence then deletes", async () => {
    const ctx = makeCtx();
    mockGetProject.mockResolvedValue({ id: "p1" });
    mockDeleteProject.mockResolvedValue(undefined);
    const result = await findTool("deleteProject").execute(
      { projectId: "p1" },
      ctx,
    );
    expect(mockGetProject).toHaveBeenCalledWith("p1", "user-123");
    expect(mockDeleteProject).toHaveBeenCalledWith("p1", "user-123");
    expect(result).toEqual({ success: true });
  });

  it("deleteProject returns error when not found", async () => {
    const ctx = makeCtx();
    mockGetProject.mockResolvedValue(null);
    const result = await findTool("deleteProject").execute(
      { projectId: "p999" },
      ctx,
    );
    expect(result).toEqual({ error: "Project not found" });
    expect(mockDeleteProject).not.toHaveBeenCalled();
  });
});
