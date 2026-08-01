import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ProjectsDB } from "@/lib/db/projects";
import { mockSupabaseClient } from "../../setup";
import {
  queueThenResponses,
  restoreMockSupabaseThen,
} from "../../helpers/mock-supabase";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Project } from "@/lib/db/types";

const USER_ID = "user-123";
const PROJECT_ID = "project-123";

function makeProject(over: Partial<Project> = {}): Project {
  return {
    id: PROJECT_ID,
    user_id: USER_ID,
    name: "My Project",
    section: "personal",
    color: "blue",
    status: "active",
    sort_order: 0,
    created_at: "2026-02-20T10:00:00Z",
    updated_at: "2026-02-20T10:00:00Z",
    ...over,
  };
}

describe("ProjectsDB", () => {
  let db: ProjectsDB;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabaseClient.setMockResponse(null);
    db = new ProjectsDB(mockSupabaseClient as unknown as SupabaseClient);
  });

  afterEach(() => {
    restoreMockSupabaseThen();
  });

  // ─── getUserProjects ──────────────────────────────────────────────────────
  describe("getUserProjects", () => {
    it("defaults to status='active' with no section filter and orders by sort_order asc", async () => {
      const rows = [makeProject()];
      queueThenResponses([{ data: rows, error: null }]);

      const result = await db.getUserProjects(USER_ID);

      expect(result).toEqual(rows);

      // Full chain for default path: from → select("*") → eq(user_id) →
      // order(sort_order asc) → eq(status, 'active'). Asserting the whole
      // ordered log kills mutations that drop the default 'active' branch
      // (the `?? 'active'` path) or flip the order direction.
      expect(mockSupabaseClient.queryLog).toEqual([
        { table: "projects", method: "from", args: ["projects"] },
        { table: "projects", method: "select", args: ["*"] },
        {
          table: "projects",
          method: "eq",
          args: ["user_id", USER_ID],
        },
        {
          table: "projects",
          method: "order",
          args: ["sort_order", { ascending: true }],
        },
        {
          table: "projects",
          method: "eq",
          args: ["status", "active"],
        },
      ]);
    });

    it("applies the provided status filter and the section filter together", async () => {
      queueThenResponses([{ data: [], error: null }]);

      await db.getUserProjects(USER_ID, {
        status: "archived",
        section: "work",
      });

      // Full log — catches: dropping section branch, swapping status with
      // hardcoded 'active', dropping either eq call.
      expect(mockSupabaseClient.queryLog).toEqual([
        { table: "projects", method: "from", args: ["projects"] },
        { table: "projects", method: "select", args: ["*"] },
        {
          table: "projects",
          method: "eq",
          args: ["user_id", USER_ID],
        },
        {
          table: "projects",
          method: "order",
          args: ["sort_order", { ascending: true }],
        },
        {
          table: "projects",
          method: "eq",
          args: ["status", "archived"],
        },
        {
          table: "projects",
          method: "eq",
          args: ["section", "work"],
        },
      ]);
    });

    it("falls back to 'active' when status is explicitly undefined but applies the section filter", async () => {
      queueThenResponses([{ data: [], error: null }]);

      // Passing { section } without status exercises the ?? 'active' default
      // while still entering the `if (filters?.section)` branch — covers
      // both logical-operator mutations at once.
      await db.getUserProjects(USER_ID, { section: "personal" });

      // Assert section filter applied AND default status still kicks in.
      mockSupabaseClient.expectQuery({
        method: "eq",
        args: ["status", "active"],
      });
      mockSupabaseClient.expectQuery({
        method: "eq",
        args: ["section", "personal"],
      });
    });

    it("does NOT apply a section filter when only status is supplied", async () => {
      queueThenResponses([{ data: [], error: null }]);

      await db.getUserProjects(USER_ID, { status: "archived" });

      // Prove no section eq was emitted. A mutation that replaces the
      // `if (filters?.section)` with `if (true)` would crash on undefined,
      // but a mutation flipping to always-emit would be caught here.
      const sectionCalls = mockSupabaseClient.queryLog.filter(
        (e) => e.method === "eq" && e.args[0] === "section",
      );
      expect(sectionCalls).toHaveLength(0);
    });

    it("returns empty array when data is null", async () => {
      queueThenResponses([{ data: null, error: null }]);

      const result = await db.getUserProjects(USER_ID);

      expect(result).toEqual([]);
    });

    it("throws on database error", async () => {
      const err = { message: "DB error" };
      queueThenResponses([{ data: null, error: err }]);

      await expect(db.getUserProjects(USER_ID)).rejects.toEqual(err);
    });
  });

  // ─── getProject ───────────────────────────────────────────────────────────
  describe("getProject", () => {
    it("fetches a single project by (id, user_id) with full chain", async () => {
      const expected = makeProject();
      mockSupabaseClient.setMockResponse(expected);

      const result = await db.getProject(PROJECT_ID, USER_ID);

      expect(result).toEqual(expected);

      mockSupabaseClient.expectQuery({
        table: "projects",
        method: "from",
        args: ["projects"],
      });
      mockSupabaseClient.expectQuery({
        table: "projects",
        method: "select",
        args: ["*"],
      });
      mockSupabaseClient.expectQuery({
        table: "projects",
        method: "eq",
        args: ["id", PROJECT_ID],
      });
      mockSupabaseClient.expectQuery({
        table: "projects",
        method: "eq",
        args: ["user_id", USER_ID],
      });
      mockSupabaseClient.expectQuery({
        table: "projects",
        method: "single",
        args: [],
      });
    });

    it("returns null when error.code === 'PGRST116' (not found)", async () => {
      mockSupabaseClient.setMockResponse(null, { code: "PGRST116" });

      const result = await db.getProject("nonexistent", USER_ID);

      expect(result).toBeNull();
    });

    it("throws when error.code is not 'PGRST116'", async () => {
      const err = { code: "OTHER_ERROR", message: "DB error" };
      mockSupabaseClient.setMockResponse(null, err);

      await expect(db.getProject(PROJECT_ID, USER_ID)).rejects.toEqual(err);
    });
  });

  // ─── deleteProject ────────────────────────────────────────────────────────
  describe("deleteProject", () => {
    it("deletes by (id, user_id) with full query chain", async () => {
      queueThenResponses([{ data: null, error: null }]);

      await db.deleteProject(PROJECT_ID, USER_ID);

      expect(mockSupabaseClient.queryLog).toEqual([
        { table: "projects", method: "from", args: ["projects"] },
        { table: "projects", method: "delete", args: [] },
        {
          table: "projects",
          method: "eq",
          args: ["id", PROJECT_ID],
        },
        {
          table: "projects",
          method: "eq",
          args: ["user_id", USER_ID],
        },
      ]);
    });

    it("throws when the delete errors", async () => {
      const err = { message: "FK constraint" };
      queueThenResponses([{ data: null, error: err }]);

      await expect(db.deleteProject(PROJECT_ID, USER_ID)).rejects.toEqual(err);
    });
  });
});
