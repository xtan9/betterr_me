import { describe, expect, it, vi } from "vitest";
import {
  ProjectWrites,
  toProjectResponse,
  type ProjectCreationPersistence,
  type ProjectCreationPersistenceOutcome,
  type ProjectMutationRecord,
} from "@/lib/projects/writes";

const createdProject: ProjectMutationRecord = {
  id: "project-1",
  userId: "user-1",
  name: "Roadmap",
  section: "personal",
  color: "blue",
  status: "active",
  sortOrder: 65536,
  createdAt: "2026-08-01T12:00:00.000Z",
  updatedAt: "2026-08-01T12:00:00.000Z",
};

function creationPersistence(
  outcome: ProjectCreationPersistenceOutcome = {
    type: "created",
    project: createdProject,
  },
): ProjectCreationPersistence {
  return {
    createProject: vi.fn().mockResolvedValue(outcome),
  };
}

describe("ProjectWrites.create", () => {
  it("normalizes the trusted owner and every creation field once", async () => {
    const persistence = creationPersistence();
    const writes = new ProjectWrites(persistence);

    await expect(
      writes.create({
        userId: " user-1 ",
        name: "  Roadmap  ",
        section: " work ",
        color: " #3B82F6 ",
        status: " archived ",
        sortOrder: 131072,
      }),
    ).resolves.toEqual({ type: "created", project: createdProject });

    expect(persistence.createProject).toHaveBeenCalledWith({
      userId: "user-1",
      name: "Roadmap",
      section: "work",
      color: "#3B82F6",
      status: "archived",
      sortOrder: 131072,
    });
  });

  it("applies the shared personal, blue, active, and append-order defaults", async () => {
    const persistence = creationPersistence();
    const writes = new ProjectWrites(persistence);

    await writes.create({ userId: " user-1 ", name: "  Roadmap  " });

    expect(persistence.createProject).toHaveBeenCalledWith({
      userId: "user-1",
      name: "Roadmap",
      section: "personal",
      color: "blue",
      status: "active",
      sortOrder: null,
    });
  });

  it("derives ownership from userId and ignores an untrusted user_id field", async () => {
    const persistence = creationPersistence();
    const writes = new ProjectWrites(persistence);

    await writes.create({
      userId: "trusted-user",
      name: "Roadmap",
      user_id: "attacker-user",
    } as never);

    expect(persistence.createProject).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "trusted-user" }),
    );
    expect(persistence.createProject).not.toHaveBeenCalledWith(
      expect.objectContaining({ userId: "attacker-user" }),
    );
  });

  it.each([
    ["userId", { userId: " ", name: "Roadmap" }],
    ["name", { userId: "user-1", name: "   " }],
    ["name length", { userId: "user-1", name: "x".repeat(51) }],
    ["section", { userId: "user-1", name: "Roadmap", section: "home" }],
    ["color", { userId: "user-1", name: "Roadmap", color: "chartreuse" }],
    ["status", { userId: "user-1", name: "Roadmap", status: "pending" }],
    ["sort order", { userId: "user-1", name: "Roadmap", sortOrder: -1 }],
    ["infinite sort order", { userId: "user-1", name: "Roadmap", sortOrder: Infinity }],
    ["NaN sort order", { userId: "user-1", name: "Roadmap", sortOrder: NaN }],
  ])("returns a typed invalid outcome for %s", async (_label, request) => {
    const persistence = creationPersistence();
    const writes = new ProjectWrites(persistence);

    const outcome = await writes.create(request as never);

    expect(outcome.type).toBe("invalid");
    expect(persistence.createProject).not.toHaveBeenCalled();
  });

  it("preserves an expected persistence conflict as a typed outcome", async () => {
    const persistence = creationPersistence({ type: "conflict" });

    await expect(
      new ProjectWrites(persistence).create({
        userId: "user-1",
        name: "Roadmap",
      }),
    ).resolves.toEqual({ type: "conflict" });
  });

  it("propagates unexpected persistence failures", async () => {
    const failure = new Error("project storage unavailable");
    const persistence: ProjectCreationPersistence = {
      createProject: vi.fn().mockRejectedValue(failure),
    };

    await expect(
      new ProjectWrites(persistence).create({
        userId: "user-1",
        name: "Roadmap",
      }),
    ).rejects.toBe(failure);
  });

  it("fails loudly when the creation persistence seam is missing", async () => {
    await expect(
      new ProjectWrites({} as ProjectCreationPersistence).create({
        userId: "user-1",
        name: "Roadmap",
      }),
    ).rejects.toThrow("Project creation persistence is not configured");
  });
});

describe("Project response mapping", () => {
  it("preserves the established HTTP and AI project shape", () => {
    expect(toProjectResponse(createdProject)).toEqual({
      id: "project-1",
      user_id: "user-1",
      name: "Roadmap",
      section: "personal",
      color: "blue",
      status: "active",
      sort_order: 65536,
      created_at: "2026-08-01T12:00:00.000Z",
      updated_at: "2026-08-01T12:00:00.000Z",
    });
  });
});
