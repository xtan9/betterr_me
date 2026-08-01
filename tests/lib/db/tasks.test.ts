import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { TasksDB } from "@/lib/db/tasks";
import { mockSupabaseClient } from "../../setup";
import { restoreMockSupabaseThen } from "../../helpers/mock-supabase";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Task, TaskInsert, TaskUpdate } from "@/lib/db/types";

vi.mock("@/lib/logger", () => ({
  log: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

const USER_ID = "user-123";
const TASK_ID = "task-123";

function makeTask(over: Partial<Task> = {}): Task {
  return {
    id: TASK_ID,
    user_id: USER_ID,
    title: "Buy groceries",
    description: "Milk, eggs, bread",
    is_completed: false,
    priority: 2,
    category_id: null,
    due_date: "2026-01-31",
    due_time: "14:00:00",
    completion_difficulty: null,
    completed_at: null,
    status: "todo",
    section: "personal",
    sort_order: 65536.0,
    project_id: null,
    recurring_task_id: null,
    is_exception: false,
    original_date: null,
    created_at: "2026-01-30T10:00:00Z",
    updated_at: "2026-01-30T10:00:00Z",
    ...over,
  };
}

describe("TasksDB", () => {
  let db: TasksDB;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabaseClient.setMockResponse(null);
    // Restore default single/maybeSingle impl. `vi.clearAllMocks()` clears
    // call history but doesn't drain queued `mockResolvedValueOnce` values —
    // those can leak across tests. We explicitly reinstall a working impl.
    const restoreSingle = (method: "single" | "maybeSingle") => {
      const fn = mockSupabaseClient[method] as unknown as {
        mockReset: () => void;
        mockImplementation: (impl: () => Promise<unknown>) => void;
      };
      fn.mockReset();
      fn.mockImplementation(() => {
        const self = mockSupabaseClient as unknown as {
          queryLog: { table: string | null; method: string; args: unknown[] }[];
          currentTable: string | null;
          mockData: unknown;
          mockError: unknown;
        };
        self.queryLog.push({
          table: self.currentTable ?? null,
          method,
          args: [],
        });
        return Promise.resolve({
          data: self.mockData,
          error: self.mockError,
        });
      });
    };
    restoreSingle("single");
    restoreSingle("maybeSingle");
    db = new TasksDB(mockSupabaseClient as unknown as SupabaseClient);
  });

  afterEach(() => {
    restoreMockSupabaseThen();
  });

  // Queue a one-shot response for the next `.single()` call. Used by
  // multi-phase methods like toggleTaskCompletion which does
  //   SELECT .single() → UPDATE .single()
  // and each phase needs its own response. Wrapping the cast here keeps
  // the suite readable without changing the established template pattern.
  const mockSingleOnce = (data: unknown, error: unknown = null): void => {
    (
      mockSupabaseClient.single as unknown as {
        mockResolvedValueOnce: (v: unknown) => void;
      }
    ).mockResolvedValueOnce({ data, error });
  };

  // ─── getUserTasks ─────────────────────────────────────────────────────────
  describe("getUserTasks", () => {
    it("fetches all tasks ordered by created_at descending (no filters)", async () => {
      const tasks = [makeTask(), makeTask({ id: "task-2" })];
      mockSupabaseClient.setMockResponse(tasks);

      const result = await db.getUserTasks(USER_ID);

      expect(result).toEqual(tasks);
      // Full chain assertion. No filters, so exactly: from → select * → eq user_id → order created_at desc.
      expect(mockSupabaseClient.queryLog).toEqual([
        { table: "tasks", method: "from", args: ["tasks"] },
        { table: "tasks", method: "select", args: ["*"] },
        { table: "tasks", method: "eq", args: ["user_id", USER_ID] },
        {
          table: "tasks",
          method: "order",
          args: ["created_at", { ascending: false }],
        },
      ]);
    });

    it("returns empty array when data is null", async () => {
      mockSupabaseClient.setMockResponse(null);

      const result = await db.getUserTasks(USER_ID);

      expect(result).toEqual([]);
    });

    it("applies is_completed filter when defined (including false)", async () => {
      mockSupabaseClient.setMockResponse([]);

      await db.getUserTasks(USER_ID, { is_completed: false });

      mockSupabaseClient.expectQuery({
        table: "tasks",
        method: "eq",
        args: ["is_completed", false],
      });
    });

    it("applies is_completed=true filter", async () => {
      mockSupabaseClient.setMockResponse([]);

      await db.getUserTasks(USER_ID, { is_completed: true });

      mockSupabaseClient.expectQuery({
        method: "eq",
        args: ["is_completed", true],
      });
    });

    it("skips every inner filter branch when filter values are undefined", async () => {
      // Empty filters object — every inner `if (filters.X !== undefined)` guard
      // must evaluate false. If any guard mutates to `if (true)`, the code
      // would emit .eq('X', undefined) / .is('X', null) / .not('X', ...) calls
      // that we assert are absent here.
      mockSupabaseClient.setMockResponse([]);

      await db.getUserTasks(USER_ID, {});

      const filterColumns = [
        "is_completed",
        "priority",
        "due_date",
        "project_id",
      ] as const;
      for (const col of filterColumns) {
        const eqCalls = mockSupabaseClient.queryLog.filter(
          (e) => e.method === "eq" && (e.args[0] as string) === col,
        );
        expect(eqCalls, `no eq call for ${col}`).toHaveLength(0);
        const isCalls = mockSupabaseClient.queryLog.filter(
          (e) => e.method === "is" && (e.args[0] as string) === col,
        );
        expect(isCalls, `no is call for ${col}`).toHaveLength(0);
      }
      // `not(due_date, is, null)` must not appear either (has_due_date guard).
      const notCalls = mockSupabaseClient.queryLog.filter(
        (e) => e.method === "not",
      );
      expect(notCalls).toHaveLength(0);
    });

    it("applies priority filter when defined (including 0)", async () => {
      mockSupabaseClient.setMockResponse([]);

      await db.getUserTasks(USER_ID, { priority: 0 });

      mockSupabaseClient.expectQuery({
        method: "eq",
        args: ["priority", 0],
      });
    });

    it("applies priority=3 filter", async () => {
      mockSupabaseClient.setMockResponse([]);

      await db.getUserTasks(USER_ID, { priority: 3 });

      mockSupabaseClient.expectQuery({
        method: "eq",
        args: ["priority", 3],
      });
    });

    it("applies due_date filter", async () => {
      mockSupabaseClient.setMockResponse([]);

      await db.getUserTasks(USER_ID, { due_date: "2026-01-31" });

      mockSupabaseClient.expectQuery({
        method: "eq",
        args: ["due_date", "2026-01-31"],
      });
    });

    it("does not apply due_date filter when empty string (falsy)", async () => {
      mockSupabaseClient.setMockResponse([]);

      await db.getUserTasks(USER_ID, { due_date: "" });

      const eqDueDate = mockSupabaseClient.queryLog.filter(
        (e) => e.method === "eq" && (e.args[0] as string) === "due_date",
      );
      expect(eqDueDate).toHaveLength(0);
    });

    it("applies has_due_date=true → .not('due_date', 'is', null)", async () => {
      mockSupabaseClient.setMockResponse([]);

      await db.getUserTasks(USER_ID, { has_due_date: true });

      mockSupabaseClient.expectQuery({
        method: "not",
        args: ["due_date", "is", null],
      });
      // Negative: `is` should NOT be called on due_date when has_due_date=true
      const isDueDate = mockSupabaseClient.queryLog.filter(
        (e) => e.method === "is" && (e.args[0] as string) === "due_date",
      );
      expect(isDueDate).toHaveLength(0);
    });

    it("applies has_due_date=false → .is('due_date', null)", async () => {
      mockSupabaseClient.setMockResponse([]);

      await db.getUserTasks(USER_ID, { has_due_date: false });

      mockSupabaseClient.expectQuery({
        method: "is",
        args: ["due_date", null],
      });
      // Negative: `not` should NOT be called when has_due_date=false
      const notDueDate = mockSupabaseClient.queryLog.filter(
        (e) => e.method === "not",
      );
      expect(notDueDate).toHaveLength(0);
    });

    it("applies project_id=null → .is('project_id', null)", async () => {
      mockSupabaseClient.setMockResponse([]);

      await db.getUserTasks(USER_ID, { project_id: null });

      mockSupabaseClient.expectQuery({
        method: "is",
        args: ["project_id", null],
      });
      // Negative: `eq` should NOT be called with project_id when null
      const eqProjectId = mockSupabaseClient.queryLog.filter(
        (e) => e.method === "eq" && (e.args[0] as string) === "project_id",
      );
      expect(eqProjectId).toHaveLength(0);
    });

    it("applies project_id=<id> → .eq('project_id', <id>)", async () => {
      mockSupabaseClient.setMockResponse([]);

      await db.getUserTasks(USER_ID, { project_id: "proj-42" });

      mockSupabaseClient.expectQuery({
        method: "eq",
        args: ["project_id", "proj-42"],
      });
      // Negative: `is` should not be called for project_id when we have an id
      const isProjectId = mockSupabaseClient.queryLog.filter(
        (e) => e.method === "is" && (e.args[0] as string) === "project_id",
      );
      expect(isProjectId).toHaveLength(0);
    });

    it("does not apply project_id filter when undefined", async () => {
      mockSupabaseClient.setMockResponse([]);

      await db.getUserTasks(USER_ID, {});

      const projectIdCalls = mockSupabaseClient.queryLog.filter(
        (e) =>
          (e.method === "eq" || e.method === "is") &&
          (e.args[0] as string) === "project_id",
      );
      expect(projectIdCalls).toHaveLength(0);
    });

    it("applies ALL filters together", async () => {
      mockSupabaseClient.setMockResponse([]);

      await db.getUserTasks(USER_ID, {
        is_completed: true,
        priority: 2,
        due_date: "2026-01-31",
        has_due_date: true,
        project_id: "proj-9",
      });

      mockSupabaseClient.expectQuery({
        method: "eq",
        args: ["is_completed", true],
      });
      mockSupabaseClient.expectQuery({ method: "eq", args: ["priority", 2] });
      mockSupabaseClient.expectQuery({
        method: "eq",
        args: ["due_date", "2026-01-31"],
      });
      mockSupabaseClient.expectQuery({
        method: "not",
        args: ["due_date", "is", null],
      });
      mockSupabaseClient.expectQuery({
        method: "eq",
        args: ["project_id", "proj-9"],
      });
    });

    it("throws on database error", async () => {
      mockSupabaseClient.setMockResponse(null, new Error("connection refused"));

      await expect(db.getUserTasks(USER_ID)).rejects.toThrow(
        "connection refused",
      );
    });
  });

  // ─── getTaskCount ─────────────────────────────────────────────────────────
  describe("getTaskCount", () => {
    it("counts tasks using HEAD-only select and returns count", async () => {
      mockSupabaseClient.setMockResponse(null, null, 7);

      const count = await db.getTaskCount(USER_ID);

      expect(count).toBe(7);
      expect(mockSupabaseClient.queryLog).toEqual([
        { table: "tasks", method: "from", args: ["tasks"] },
        {
          table: "tasks",
          method: "select",
          args: ["*", { count: "exact", head: true }],
        },
        { table: "tasks", method: "eq", args: ["user_id", USER_ID] },
      ]);
    });

    it("returns 0 when count is null (?? 0 fallback)", async () => {
      mockSupabaseClient.setMockResponse(null, null, null);

      const count = await db.getTaskCount(USER_ID);

      expect(count).toBe(0);
    });

    it("returns 0 when count is undefined", async () => {
      // Simulate Supabase returning { count: undefined } — the `?? 0` fallback applies.
      const self = mockSupabaseClient as unknown as {
        mockData: unknown;
        mockError: unknown;
        mockCount: number | null;
      };
      self.mockData = null;
      self.mockError = null;
      // @ts-expect-error exercise the ?? 0 branch with an explicit undefined
      self.mockCount = undefined;

      const count = await db.getTaskCount(USER_ID);

      expect(count).toBe(0);
    });

    it("skips every inner filter branch when filter values are undefined", async () => {
      mockSupabaseClient.setMockResponse(null, null, 0);

      await db.getTaskCount(USER_ID, {});

      const filterColumns = ["is_completed", "priority", "due_date"] as const;
      for (const col of filterColumns) {
        const eqCalls = mockSupabaseClient.queryLog.filter(
          (e) => e.method === "eq" && (e.args[0] as string) === col,
        );
        expect(eqCalls, `no eq call for ${col}`).toHaveLength(0);
        const isCalls = mockSupabaseClient.queryLog.filter(
          (e) => e.method === "is" && (e.args[0] as string) === col,
        );
        expect(isCalls, `no is call for ${col}`).toHaveLength(0);
      }
      const notCalls = mockSupabaseClient.queryLog.filter(
        (e) => e.method === "not",
      );
      expect(notCalls).toHaveLength(0);
    });

    it("applies is_completed filter (including false)", async () => {
      mockSupabaseClient.setMockResponse(null, null, 2);

      await db.getTaskCount(USER_ID, { is_completed: false });

      mockSupabaseClient.expectQuery({
        method: "eq",
        args: ["is_completed", false],
      });
    });

    it("applies priority filter (including 0)", async () => {
      mockSupabaseClient.setMockResponse(null, null, 1);

      await db.getTaskCount(USER_ID, { priority: 0 });

      mockSupabaseClient.expectQuery({
        method: "eq",
        args: ["priority", 0],
      });
    });

    it("applies due_date filter", async () => {
      mockSupabaseClient.setMockResponse(null, null, 3);

      await db.getTaskCount(USER_ID, { due_date: "2026-02-01" });

      mockSupabaseClient.expectQuery({
        method: "eq",
        args: ["due_date", "2026-02-01"],
      });
    });

    it("applies has_due_date=true → .not('due_date', 'is', null)", async () => {
      mockSupabaseClient.setMockResponse(null, null, 4);

      await db.getTaskCount(USER_ID, { has_due_date: true });

      mockSupabaseClient.expectQuery({
        method: "not",
        args: ["due_date", "is", null],
      });
    });

    it("applies has_due_date=false → .is('due_date', null)", async () => {
      mockSupabaseClient.setMockResponse(null, null, 5);

      await db.getTaskCount(USER_ID, { has_due_date: false });

      mockSupabaseClient.expectQuery({
        method: "is",
        args: ["due_date", null],
      });
    });

    it("throws on database error", async () => {
      mockSupabaseClient.setMockResponse(null, new Error("count failed"));

      await expect(db.getTaskCount(USER_ID)).rejects.toThrow("count failed");
    });
  });

  // ─── getTask ──────────────────────────────────────────────────────────────
  describe("getTask", () => {
    it("fetches a single task by id and user_id", async () => {
      const task = makeTask();
      mockSupabaseClient.setMockResponse(task);

      const result = await db.getTask(TASK_ID, USER_ID);

      expect(result).toEqual(task);
      expect(mockSupabaseClient.queryLog).toEqual([
        { table: "tasks", method: "from", args: ["tasks"] },
        { table: "tasks", method: "select", args: ["*"] },
        { table: "tasks", method: "eq", args: ["id", TASK_ID] },
        { table: "tasks", method: "eq", args: ["user_id", USER_ID] },
        { table: "tasks", method: "single", args: [] },
      ]);
    });

    it("returns null when PGRST116 (not found)", async () => {
      mockSupabaseClient.setMockResponse(null, { code: "PGRST116" });

      const result = await db.getTask(TASK_ID, USER_ID);

      expect(result).toBeNull();
    });

    it("throws on non-PGRST116 errors", async () => {
      mockSupabaseClient.setMockResponse(null, {
        code: "23505",
        message: "other error",
      });

      await expect(db.getTask(TASK_ID, USER_ID)).rejects.toEqual({
        code: "23505",
        message: "other error",
      });
    });

    it("does not return null for a different error code that only matches a prefix", async () => {
      // Guard against a mutant like `error.code === "PGRST"`
      mockSupabaseClient.setMockResponse(null, { code: "PGRST117" });

      await expect(db.getTask(TASK_ID, USER_ID)).rejects.toEqual({
        code: "PGRST117",
      });
    });
  });

  // ─── createTask ───────────────────────────────────────────────────────────
  describe("createTask", () => {
    const insertRow: TaskInsert = {
      user_id: USER_ID,
      title: "New task",
      description: null,
      is_completed: false,
      priority: 1,
      due_date: null,
      due_time: null,
    };

    it("inserts a task and returns the created row", async () => {
      const created = makeTask({ id: "task-new" });
      mockSupabaseClient.setMockResponse(created);

      const result = await db.createTask(insertRow);

      expect(result).toEqual(created);
      expect(mockSupabaseClient.queryLog).toEqual([
        { table: "tasks", method: "from", args: ["tasks"] },
        { table: "tasks", method: "insert", args: [insertRow] },
        { table: "tasks", method: "select", args: [] },
        { table: "tasks", method: "single", args: [] },
      ]);
    });

    it("throws on insert error", async () => {
      mockSupabaseClient.setMockResponse(null, new Error("duplicate key"));

      await expect(db.createTask(insertRow)).rejects.toThrow("duplicate key");
    });
  });

  // ─── updateTask ───────────────────────────────────────────────────────────
  describe("updateTask", () => {
    it("updates a task and returns the updated row", async () => {
      const updates: TaskUpdate = { title: "Updated", priority: 3 };
      const updated = makeTask({ title: "Updated", priority: 3 });
      mockSupabaseClient.setMockResponse(updated);

      const result = await db.updateTask(TASK_ID, USER_ID, updates);

      expect(result).toEqual(updated);
      expect(mockSupabaseClient.queryLog).toEqual([
        { table: "tasks", method: "from", args: ["tasks"] },
        { table: "tasks", method: "update", args: [updates] },
        { table: "tasks", method: "eq", args: ["id", TASK_ID] },
        { table: "tasks", method: "eq", args: ["user_id", USER_ID] },
        { table: "tasks", method: "select", args: [] },
        { table: "tasks", method: "single", args: [] },
      ]);
    });

    it("throws on update error", async () => {
      mockSupabaseClient.setMockResponse(null, new Error("update failed"));

      await expect(
        db.updateTask(TASK_ID, USER_ID, { title: "x" }),
      ).rejects.toThrow("update failed");
    });
  });

  // ─── toggleTaskCompletion ────────────────────────────────────────────────
  describe("toggleTaskCompletion", () => {
    it("marks incomplete task as completed (status=done, completed_at set)", async () => {
      const fixedNow = new Date("2026-04-17T15:00:00.000Z");
      vi.useFakeTimers();
      vi.setSystemTime(fixedNow);
      try {
        const incomplete = makeTask({ is_completed: false, status: "todo" });
        const completed = makeTask({
          is_completed: true,
          status: "done",
          completed_at: fixedNow.toISOString(),
        });
        // Phase 1 (getTask): single() returns incomplete task
        // Phase 2 (updateTask): single() returns completed task
        mockSingleOnce(incomplete);
        mockSingleOnce(completed);

        const result = await db.toggleTaskCompletion(TASK_ID, USER_ID);

        expect(result).toEqual(completed);

        // Inspect the update() call args — source passes
        // syncTaskUpdate({ is_completed: true }) which returns
        // { is_completed: true, status: "done", completed_at: <now> }.
        const updateCall = mockSupabaseClient.queryLog.find(
          (e) => e.method === "update",
        );
        expect(updateCall).toBeDefined();
        expect(updateCall!.args[0]).toEqual({
          is_completed: true,
          status: "done",
          completed_at: fixedNow.toISOString(),
        });
      } finally {
        vi.useRealTimers();
      }
    });

    it("marks completed task as incomplete (status=todo, completed_at=null)", async () => {
      const completed = makeTask({
        is_completed: true,
        status: "done",
        completed_at: "2026-01-30T15:00:00Z",
      });
      const incomplete = makeTask({
        is_completed: false,
        status: "todo",
        completed_at: null,
      });
      mockSingleOnce(completed);
      mockSingleOnce(incomplete);

      const result = await db.toggleTaskCompletion(TASK_ID, USER_ID);

      expect(result).toEqual(incomplete);
      const updateCall = mockSupabaseClient.queryLog.find(
        (e) => e.method === "update",
      );
      expect(updateCall).toBeDefined();
      expect(updateCall!.args[0]).toEqual({
        is_completed: false,
        status: "todo",
        completed_at: null,
      });
    });

    it("throws when task is not found (PGRST116 → getTask returns null)", async () => {
      mockSingleOnce(null, { code: "PGRST116" });

      await expect(
        db.toggleTaskCompletion(TASK_ID, USER_ID),
      ).rejects.toThrow("Task not found");

      // Update must NOT fire after not-found.
      const updateCalls = mockSupabaseClient.queryLog.filter(
        (e) => e.method === "update",
      );
      expect(updateCalls).toHaveLength(0);
    });

    it("propagates getTask errors without attempting update", async () => {
      mockSingleOnce(null, { code: "FATAL", message: "select blew up" });

      await expect(db.toggleTaskCompletion(TASK_ID, USER_ID)).rejects.toEqual({
        code: "FATAL",
        message: "select blew up",
      });

      const updateCalls = mockSupabaseClient.queryLog.filter(
        (e) => e.method === "update",
      );
      expect(updateCalls).toHaveLength(0);
    });

    it("propagates updateTask errors from the second phase", async () => {
      const incomplete = makeTask({ is_completed: false, status: "todo" });
      mockSingleOnce(incomplete);
      mockSingleOnce(null, new Error("update rejected"));

      await expect(
        db.toggleTaskCompletion(TASK_ID, USER_ID),
      ).rejects.toThrow("update rejected");
    });
  });

  // ─── deleteTask ───────────────────────────────────────────────────────────
  describe("deleteTask", () => {
    it("deletes a task scoped to id and user_id", async () => {
      mockSupabaseClient.setMockResponse([{ id: TASK_ID }]);

      await expect(db.deleteTask(TASK_ID, USER_ID)).resolves.toBe(true);

      expect(mockSupabaseClient.queryLog).toEqual([
        { table: "tasks", method: "from", args: ["tasks"] },
        { table: "tasks", method: "delete", args: [] },
        { table: "tasks", method: "eq", args: ["id", TASK_ID] },
        { table: "tasks", method: "eq", args: ["user_id", USER_ID] },
        { table: "tasks", method: "select", args: ["id"] },
      ]);
    });

    it("returns false when the owner-scoped task does not exist", async () => {
      mockSupabaseClient.setMockResponse([]);

      await expect(db.deleteTask(TASK_ID, USER_ID)).resolves.toBe(false);
    });

    it("throws on delete error", async () => {
      mockSupabaseClient.setMockResponse(null, new Error("delete denied"));

      await expect(db.deleteTask(TASK_ID, USER_ID)).rejects.toThrow(
        "delete denied",
      );
    });
  });

  // ─── getTodayTasks ────────────────────────────────────────────────────────
  describe("getTodayTasks", () => {
    it("fetches today+overdue tasks ordered by due_date ascending", async () => {
      const tasks = [makeTask(), makeTask({ id: "task-2" })];
      mockSupabaseClient.setMockResponse(tasks);

      const result = await db.getTodayTasks(USER_ID, "2026-01-31");

      expect(result).toEqual(tasks);
      expect(mockSupabaseClient.queryLog).toEqual([
        { table: "tasks", method: "from", args: ["tasks"] },
        { table: "tasks", method: "select", args: ["*"] },
        { table: "tasks", method: "eq", args: ["user_id", USER_ID] },
        { table: "tasks", method: "lte", args: ["due_date", "2026-01-31"] },
        { table: "tasks", method: "not", args: ["due_date", "is", null] },
        {
          table: "tasks",
          method: "order",
          args: ["due_date", { ascending: true }],
        },
      ]);
    });

    it("returns empty array when data is null", async () => {
      mockSupabaseClient.setMockResponse(null);

      const result = await db.getTodayTasks(USER_ID, "2026-01-31");

      expect(result).toEqual([]);
    });

    it("uses the provided date exactly (no clock reads)", async () => {
      mockSupabaseClient.setMockResponse([]);

      await db.getTodayTasks(USER_ID, "2026-06-15");

      mockSupabaseClient.expectQuery({
        method: "lte",
        args: ["due_date", "2026-06-15"],
      });
    });

    it("throws on database error", async () => {
      mockSupabaseClient.setMockResponse(null, new Error("today failed"));

      await expect(
        db.getTodayTasks(USER_ID, "2026-01-31"),
      ).rejects.toThrow("today failed");
    });
  });

  // ─── getUpcomingTasks ─────────────────────────────────────────────────────
  describe("getUpcomingTasks", () => {
    it("fetches upcoming incomplete tasks between date+1 and date+days", async () => {
      // Freeze time: the method itself doesn't call `new Date()` directly
      // on `Date.now()`, but it constructs a Date from date-parts, and
      // `getLocalDateString(futureDate)` is timezone-sensitive. Freezing
      // keeps the test deterministic regardless of CI timezone.
      const fixedNow = new Date("2026-04-17T12:00:00.000Z");
      vi.useFakeTimers();
      vi.setSystemTime(fixedNow);
      try {
        const tasks = [makeTask({ due_date: "2026-02-03" })];
        mockSupabaseClient.setMockResponse(tasks);

        const result = await db.getUpcomingTasks(USER_ID, "2026-01-31", 7);

        expect(result).toEqual(tasks);
        // Jan 31 + 7 days = Feb 7. Time is frozen so this is TZ-deterministic.
        expect(mockSupabaseClient.queryLog).toEqual([
          { table: "tasks", method: "from", args: ["tasks"] },
          { table: "tasks", method: "select", args: ["*"] },
          { table: "tasks", method: "eq", args: ["user_id", USER_ID] },
          { table: "tasks", method: "eq", args: ["is_completed", false] },
          { table: "tasks", method: "gt", args: ["due_date", "2026-01-31"] },
          { table: "tasks", method: "lte", args: ["due_date", "2026-02-07"] },
          {
            table: "tasks",
            method: "order",
            args: ["due_date", { ascending: true }],
          },
        ]);
      } finally {
        vi.useRealTimers();
      }
    });

    it("defaults days to 7 when omitted", async () => {
      const fixedNow = new Date("2026-04-17T12:00:00.000Z");
      vi.useFakeTimers();
      vi.setSystemTime(fixedNow);
      try {
        mockSupabaseClient.setMockResponse([]);

        await db.getUpcomingTasks(USER_ID, "2026-01-31");

        // Default days=7 → lte is "2026-02-07" (Jan 31 + 7).
        mockSupabaseClient.expectQuery({
          method: "lte",
          args: ["due_date", "2026-02-07"],
        });
        mockSupabaseClient.expectQuery({
          method: "gt",
          args: ["due_date", "2026-01-31"],
        });
      } finally {
        vi.useRealTimers();
      }
    });

    it("respects custom days parameter (30)", async () => {
      const fixedNow = new Date("2026-04-17T12:00:00.000Z");
      vi.useFakeTimers();
      vi.setSystemTime(fixedNow);
      try {
        mockSupabaseClient.setMockResponse([]);

        await db.getUpcomingTasks(USER_ID, "2026-01-01", 30);

        // "2026-01-01" + 30 days = "2026-01-31" (January has 31 days).
        mockSupabaseClient.expectQuery({
          method: "lte",
          args: ["due_date", "2026-01-31"],
        });
      } finally {
        vi.useRealTimers();
      }
    });

    it("handles month rollover (Jan 28 + 7 → Feb 4)", async () => {
      const fixedNow = new Date("2026-04-17T12:00:00.000Z");
      vi.useFakeTimers();
      vi.setSystemTime(fixedNow);
      try {
        mockSupabaseClient.setMockResponse([]);

        await db.getUpcomingTasks(USER_ID, "2026-01-28", 7);

        mockSupabaseClient.expectQuery({
          method: "lte",
          args: ["due_date", "2026-02-04"],
        });
      } finally {
        vi.useRealTimers();
      }
    });

    it("returns empty array when data is null", async () => {
      const fixedNow = new Date("2026-04-17T12:00:00.000Z");
      vi.useFakeTimers();
      vi.setSystemTime(fixedNow);
      try {
        mockSupabaseClient.setMockResponse(null);

        const result = await db.getUpcomingTasks(USER_ID, "2026-01-31", 7);

        expect(result).toEqual([]);
      } finally {
        vi.useRealTimers();
      }
    });

    it("throws on database error", async () => {
      const fixedNow = new Date("2026-04-17T12:00:00.000Z");
      vi.useFakeTimers();
      vi.setSystemTime(fixedNow);
      try {
        mockSupabaseClient.setMockResponse(null, new Error("upcoming failed"));

        await expect(
          db.getUpcomingTasks(USER_ID, "2026-01-31", 7),
        ).rejects.toThrow("upcoming failed");
      } finally {
        vi.useRealTimers();
      }
    });
  });

  // ─── getOverdueTasks ──────────────────────────────────────────────────────
  describe("getOverdueTasks", () => {
    it("fetches overdue incomplete tasks ordered by due_date ascending", async () => {
      const overdue = [makeTask({ due_date: "2026-01-15" })];
      mockSupabaseClient.setMockResponse(overdue);

      const result = await db.getOverdueTasks(USER_ID, "2026-01-31");

      expect(result).toEqual(overdue);
      expect(mockSupabaseClient.queryLog).toEqual([
        { table: "tasks", method: "from", args: ["tasks"] },
        { table: "tasks", method: "select", args: ["*"] },
        { table: "tasks", method: "eq", args: ["user_id", USER_ID] },
        { table: "tasks", method: "eq", args: ["is_completed", false] },
        { table: "tasks", method: "lt", args: ["due_date", "2026-01-31"] },
        {
          table: "tasks",
          method: "order",
          args: ["due_date", { ascending: true }],
        },
      ]);
    });

    it("returns empty array when data is null", async () => {
      mockSupabaseClient.setMockResponse(null);

      const result = await db.getOverdueTasks(USER_ID, "2026-01-31");

      expect(result).toEqual([]);
    });

    it("uses the provided date exactly (no clock reads)", async () => {
      mockSupabaseClient.setMockResponse([]);

      await db.getOverdueTasks(USER_ID, "2026-06-15");

      mockSupabaseClient.expectQuery({
        method: "lt",
        args: ["due_date", "2026-06-15"],
      });
    });

    it("throws on database error", async () => {
      mockSupabaseClient.setMockResponse(null, new Error("overdue failed"));

      await expect(
        db.getOverdueTasks(USER_ID, "2026-01-31"),
      ).rejects.toThrow("overdue failed");
    });
  });
});
