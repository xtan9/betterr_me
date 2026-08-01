import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ProjectWrites,
  SupabaseProjectCreationPersistence,
  type ProjectCreationRecord,
} from "@/lib/projects/writes";

const projectRow = {
  id: "project-1",
  user_id: "user-1",
  name: "Roadmap",
  section: "personal",
  color: "blue",
  status: "active",
  sort_order: 65536,
  created_at: "2026-08-01T12:00:00.000Z",
  updated_at: "2026-08-01T12:00:00.000Z",
};

const creationRecord: ProjectCreationRecord = {
  userId: "user-1",
  name: "Roadmap",
  section: "personal",
  color: "blue",
  status: "active",
  sortOrder: null,
};

describe("SupabaseProjectCreationPersistence", () => {
  const rpc = vi.fn();
  let persistence: SupabaseProjectCreationPersistence;

  beforeEach(() => {
    vi.clearAllMocks();
    persistence = new SupabaseProjectCreationPersistence({ rpc } as never);
  });

  it("uses one atomic owner-scoped capability and maps the created row", async () => {
    rpc.mockResolvedValue({
      data: { type: "created", project: projectRow },
      error: null,
    });

    await expect(persistence.createProject(creationRecord)).resolves.toEqual({
      type: "created",
      project: {
        id: "project-1",
        userId: "user-1",
        name: "Roadmap",
        section: "personal",
        color: "blue",
        status: "active",
        sortOrder: 65536,
        createdAt: "2026-08-01T12:00:00.000Z",
        updatedAt: "2026-08-01T12:00:00.000Z",
      },
    });

    expect(rpc).toHaveBeenCalledWith("create_project_atomically", {
      p_user_id: "user-1",
      p_name: "Roadmap",
      p_section: "personal",
      p_color: "blue",
      p_status: "active",
      p_sort_order: null,
    });
  });

  it.each([
    ["conflict", { type: "conflict" }],
    [
      "invalid",
      { type: "invalid", field: "name", message: "Name is required" },
    ],
  ])("preserves the %s database outcome", async (_label, outcome) => {
    rpc.mockResolvedValue({ data: outcome, error: null });

    await expect(persistence.createProject(creationRecord)).resolves.toEqual(
      outcome,
    );
  });

  it("maps a unique constraint race to the typed conflict outcome", async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { code: "23505", message: "project ordering conflict" },
    });

    await expect(persistence.createProject(creationRecord)).resolves.toEqual({
      type: "conflict",
    });
  });

  it("throws infrastructure failures and malformed database outcomes", async () => {
    const failure = { code: "42P01", message: "function missing" };
    rpc.mockResolvedValue({ data: null, error: failure });

    await expect(persistence.createProject(creationRecord)).rejects.toBe(
      failure,
    );

    rpc.mockResolvedValue({
      data: { type: "created", project: { id: "project-1" } },
      error: null,
    });
    await expect(persistence.createProject(creationRecord)).rejects.toThrow(
      "Invalid project returned by the database",
    );

    rpc.mockResolvedValue({
      data: { type: "unexpected" },
      error: null,
    });
    await expect(persistence.createProject(creationRecord)).rejects.toThrow(
      "Invalid project creation outcome returned by the database",
    );
  });

  it("keeps concurrent creation calls on the same atomic persistence seam", async () => {
    const rows = [
      projectRow,
      { ...projectRow, id: "project-2", sort_order: 131072 },
    ];
    rpc.mockImplementation(async () => ({
      data: { type: "created", project: rows[rpc.mock.calls.length - 1] },
      error: null,
    }));
    const writes = new ProjectWrites(persistence);

    const outcomes = await Promise.all([
      writes.create({ userId: "user-1", name: "First" }),
      writes.create({ userId: "user-1", name: "Second" }),
    ]);

    expect(outcomes).toHaveLength(2);
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc.mock.calls).toEqual([
      [
        "create_project_atomically",
        {
          p_user_id: "user-1",
          p_name: "First",
          p_section: "personal",
          p_color: "blue",
          p_status: "active",
          p_sort_order: null,
        },
      ],
      [
        "create_project_atomically",
        {
          p_user_id: "user-1",
          p_name: "Second",
          p_section: "personal",
          p_color: "blue",
          p_status: "active",
          p_sort_order: null,
        },
      ],
    ]);
    expect(outcomes.map((outcome) => outcome.type)).toEqual([
      "created",
      "created",
    ]);
  });
});
