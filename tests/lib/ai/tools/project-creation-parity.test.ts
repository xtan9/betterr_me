import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/projects/route";
import { projectTools } from "@/lib/ai/tools/projects";
import type { ToolContext } from "@/lib/ai/tools/types";

const {
  mockCreate,
  mockLegacyCreateProject,
  httpSupabase,
  aiSupabase,
} = vi.hoisted(() => ({
  mockCreate: vi.fn(),
  mockLegacyCreateProject: vi.fn(),
  httpSupabase: {
    auth: {
      getUser: vi.fn(() => ({
        data: { user: { id: "user-123", email: "test@example.com" } },
      })),
    },
  },
  aiSupabase: {},
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => httpSupabase),
}));

vi.mock("@/lib/db/ensure-profile", () => ({
  ensureProfile: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  ProjectsDB: class {
    getUserProjects = vi.fn();
    createProject = mockLegacyCreateProject;
  },
}));

vi.mock("@/lib/projects/writes", () => ({
  createProjectWrites: vi.fn(() => ({ create: mockCreate })),
  toProjectResponse: (project: Record<string, unknown>) => ({
    id: project.id,
    user_id: project.userId,
    name: project.name,
    section: project.section,
    color: project.color,
    status: project.status,
    sort_order: project.sortOrder,
    created_at: project.createdAt,
    updated_at: project.updatedAt,
  }),
}));

const createdProject = {
  id: "project-1",
  userId: "user-123",
  name: "Roadmap",
  section: "personal" as const,
  color: "blue",
  status: "active" as const,
  sortOrder: 65536,
  createdAt: "2026-08-01T12:00:00.000Z",
  updatedAt: "2026-08-01T12:00:00.000Z",
};

const presentedProject = {
  id: "project-1",
  user_id: "user-123",
  name: "Roadmap",
  section: "personal",
  color: "blue",
  status: "active",
  sort_order: 65536,
  created_at: "2026-08-01T12:00:00.000Z",
  updated_at: "2026-08-01T12:00:00.000Z",
};

const aiContext: ToolContext = {
  userId: "user-123",
  supabase: aiSupabase as ToolContext["supabase"],
  date: "2026-08-01",
  timezone: "America/Toronto",
};

function createProjectTool() {
  return projectTools().find((tool) => tool.name === "createProject")!;
}

describe("AI and HTTP project creation parity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreate.mockResolvedValue({ type: "created", project: createdProject });
  });

  it("maps equivalent inputs through the shared behavior and preserves each response shape", async () => {
    const aiOutcome = await createProjectTool().execute(
      { name: "Roadmap", section: "personal", color: "blue" },
      aiContext,
    );
    const httpResponse = await POST(
      new NextRequest("http://localhost:3000/api/projects", {
        method: "POST",
        body: JSON.stringify({
          name: "Roadmap",
          section: "personal",
          color: "blue",
        }),
      }),
    );

    expect(aiOutcome).toEqual(presentedProject);
    expect(httpResponse.status).toBe(201);
    await expect(httpResponse.json()).resolves.toEqual({
      project: presentedProject,
    });
    expect(mockCreate).toHaveBeenCalledTimes(2);
    expect(mockCreate.mock.calls).toEqual([
      [
        {
          userId: "user-123",
          name: "Roadmap",
          section: "personal",
          color: "blue",
        },
      ],
      [
        {
          userId: "user-123",
          name: "Roadmap",
          section: "personal",
          color: "blue",
        },
      ],
    ]);
    expect(mockLegacyCreateProject).not.toHaveBeenCalled();
  });

  it("maps the shared conflict outcome to HTTP and conversational presentations", async () => {
    mockCreate.mockResolvedValue({ type: "conflict" });

    const aiOutcome = await createProjectTool().execute(
      { name: "Roadmap" },
      aiContext,
    );
    const httpResponse = await POST(
      new NextRequest("http://localhost:3000/api/projects", {
        method: "POST",
        body: JSON.stringify({
          name: "Roadmap",
          section: "personal",
          color: "blue",
        }),
      }),
    );

    expect(aiOutcome).toEqual({ error: "Project creation conflicted" });
    expect(httpResponse.status).toBe(409);
    await expect(httpResponse.json()).resolves.toEqual({
      error: "Project creation conflicted",
    });
  });

  it("maps shared invalid domain values without duplicating domain validation", async () => {
    mockCreate.mockResolvedValue({
      type: "invalid",
      field: "section",
      message: "Section is invalid",
    });

    const aiOutcome = await createProjectTool().execute(
      { name: "Roadmap", section: "home" },
      aiContext,
    );
    const httpResponse = await POST(
      new NextRequest("http://localhost:3000/api/projects", {
        method: "POST",
        body: JSON.stringify({
          name: "Roadmap",
          section: "personal",
          color: "blue",
        }),
      }),
    );

    expect(aiOutcome).toEqual({
      error: "Section is invalid",
      field: "section",
    });
    expect(httpResponse.status).toBe(400);
    await expect(httpResponse.json()).resolves.toEqual({
      error: "Section is invalid",
      field: "section",
    });
  });

  it("keeps the existing AI input contract while the domain owns defaults", async () => {
    expect(createProjectTool().parameters.safeParse({ name: "Roadmap" }).success).toBe(
      true,
    );
    expect(
      createProjectTool().parameters.safeParse({
        name: "Roadmap",
        section: "work",
        color: "#3B82F6",
      }).success,
    ).toBe(true);

    await createProjectTool().execute({ name: "Roadmap" }, aiContext);
    expect(mockCreate).toHaveBeenCalledWith({
      userId: "user-123",
      name: "Roadmap",
      section: undefined,
      color: undefined,
    });
  });

  it("leaves unexpected shared failures exceptional for AI and HTTP", async () => {
    const failure = new Error("project storage unavailable");
    mockCreate.mockRejectedValue(failure);

    await expect(
      createProjectTool().execute({ name: "Roadmap" }, aiContext),
    ).rejects.toBe(failure);

    const httpResponse = await POST(
      new NextRequest("http://localhost:3000/api/projects", {
        method: "POST",
        body: JSON.stringify({
          name: "Roadmap",
          section: "personal",
          color: "blue",
        }),
      }),
    );
    expect(httpResponse.status).toBe(500);
    await expect(httpResponse.json()).resolves.toEqual({
      error: "Failed to create project",
    });
  });
});
