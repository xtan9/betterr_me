import { describe, it, expect, vi, beforeEach } from "vitest";
import { projectTools } from "@/lib/ai/tools/projects";
import type { ToolContext } from "@/lib/ai/tools/types";

const mockGetUserProjects = vi.fn();
const mockGetProject = vi.fn();
const mockCreateProject = vi.fn();
const mockProjectCreate = vi.fn();
const mockProjectUpdate = vi.fn();
const mockProjectDelete = vi.fn();

vi.mock("@/lib/db", () => ({
  ProjectsDB: class {
    getUserProjects = mockGetUserProjects;
    getProject = mockGetProject;
    createProject = mockCreateProject;
  },
}));

vi.mock("@/lib/projects/writes", () => ({
  createProjectWrites: vi.fn(() => ({
    create: mockProjectCreate,
    update: mockProjectUpdate,
    delete: mockProjectDelete,
  })),
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
    mockProjectUpdate.mockResolvedValue({
      type: "updated",
      project: { id: "p1", name: "Renamed" },
    });
    await findTool("updateProject").execute(
      { projectId: "p1", name: "Renamed" },
      ctx,
    );
    expect(mockProjectUpdate).toHaveBeenCalledWith({
      userId: "user-123",
      projectId: "p1",
      name: "Renamed",
    });
  });

  it("maps ordering through the shared update request", async () => {
    mockProjectUpdate.mockResolvedValue({
      type: "updated",
      project: { id: "p1", name: "Renamed", sort_order: 131072 },
    });

    await findTool("updateProject").execute(
      { projectId: "p1", sortOrder: 131072 },
      makeCtx(),
    );

    expect(mockProjectUpdate).toHaveBeenCalledWith({
      userId: "user-123",
      projectId: "p1",
      sortOrder: 131072,
    });
  });

  it("maps a shared invalid outcome through the AI contract", async () => {
    mockProjectUpdate.mockResolvedValue({
      type: "invalid",
      field: "color",
      message: "Color is invalid",
    });

    await expect(
      findTool("updateProject").execute(
        { projectId: "p1", color: "chartreuse" },
        makeCtx(),
      ),
    ).resolves.toEqual({ error: "Color is invalid", field: "color" });
  });

  it("maps missing and already-applied update outcomes through the AI contract", async () => {
    const ctx = makeCtx();
    mockProjectUpdate.mockResolvedValueOnce({ type: "not-found" });

    await expect(
      findTool("updateProject").execute({ projectId: "missing", status: "archived" }, ctx),
    ).resolves.toEqual({ error: "Project not found" });

    const project = { id: "p1", name: "Renamed", status: "archived" };
    mockProjectUpdate.mockResolvedValueOnce({
      type: "already-applied",
      project,
    });

    await expect(
      findTool("updateProject").execute({ projectId: "p1", status: "archived" }, ctx),
    ).resolves.toEqual(project);
  });

  it("deleteProject delegates to the mutation command and preserves confirmation", async () => {
    const ctx = makeCtx();
    mockProjectDelete.mockResolvedValue({ type: "deleted" });
    const tool = findTool("deleteProject");
    const result = await findTool("deleteProject").execute(
      { projectId: "p1" },
      ctx,
    );
    expect(tool.description).toContain("Always confirm with the user first");
    expect(mockProjectDelete).toHaveBeenCalledWith({
      projectId: "p1",
      userId: "user-123",
    });
    expect(mockGetProject).not.toHaveBeenCalled();
    expect(result).toEqual({ success: true });
  });

  it.each(["missing", "repeated", "cross-owner"] as const)(
    "deleteProject maps the mutation not-found outcome for %s requests",
    async () => {
      mockProjectDelete.mockResolvedValue({ type: "not-found" });
      const result = await findTool("deleteProject").execute(
        { projectId: "p999" },
        makeCtx(),
      );
      expect(result).toEqual({ error: "Project not found" });
    },
  );

  it("deleteProject propagates unexpected mutation failures", async () => {
    const persistenceError = new Error("database unavailable");
    mockProjectDelete.mockRejectedValue(persistenceError);

    await expect(
      findTool("deleteProject").execute({ projectId: "p1" }, makeCtx()),
    ).rejects.toBe(persistenceError);
  });

  it("does not query the generic Projects DB for deletion", async () => {
    mockProjectDelete.mockResolvedValue({ type: "not-found" });

    const result = await findTool("deleteProject").execute(
      { projectId: "p999" },
      makeCtx(),
    );

    expect(result).toEqual({ error: "Project not found" });
    expect(mockGetProject).not.toHaveBeenCalled();
  });
});
