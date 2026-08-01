import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  RecurringTasksDB,
  type RecurringTaskLifecycleAdapter,
} from "@/lib/db/recurring-tasks";
import { mockSupabaseClient } from "../../setup";
import {
  queueThenResponses,
  restoreMockSupabaseThen,
} from "../../helpers/mock-supabase";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  RecurringTask,
  RecurringTaskInsert,
  TaskUpdate,
} from "@/lib/db/types";
import {
  InMemoryRecurringTaskLifecyclePersistence,
  RecurringTaskLifecycle,
} from "@/lib/recurring-tasks/lifecycle";

// Mock external dependencies used by RecurringTasksDB.
// `ensureRecurringInstances` (from @/lib/recurring-tasks) and `getNextOccurrence`
// (from @/lib/recurring-tasks/recurrence) are boundary calls — mocking them
// isolates the DB class under test without exercising recurrence math.
const { mockEnsureRecurringInstances, mockGetNextOccurrence } = vi.hoisted(
  () => ({
    mockEnsureRecurringInstances: vi.fn(),
    mockGetNextOccurrence: vi.fn(),
  }),
);

vi.mock("@/lib/recurring-tasks", () => ({
  ensureRecurringInstances: mockEnsureRecurringInstances,
}));

vi.mock("@/lib/recurring-tasks/recurrence", async (importOriginal) => ({
  ...(await importOriginal()),
  getNextOccurrence: mockGetNextOccurrence,
}));

const USER_ID = "user-123";
const RT_ID = "rt-1";
const TASK_ID = "task-1";

function makeTemplate(over: Partial<RecurringTask> = {}): RecurringTask {
  return {
    id: RT_ID,
    user_id: USER_ID,
    title: "Daily standup",
    description: "Morning standup meeting",
    priority: 1,
    category_id: null,
    due_time: "09:00",
    recurrence_rule: { frequency: "daily", interval: 1 },
    start_date: "2026-01-01",
    end_type: "never",
    end_date: null,
    end_count: null,
    status: "active",
    next_generate_date: "2026-01-15",
    instances_generated: 14,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-15T00:00:00Z",
    ...over,
  };
}

function makeLifecycleAdapter() {
  const persistence = new InMemoryRecurringTaskLifecyclePersistence();
  const lifecycle = new RecurringTaskLifecycle(persistence, {
    clock: () => new Date("2026-08-01T12:00:00.000Z"),
  });
  const adapter: RecurringTaskLifecycleAdapter = {
    createSeries: lifecycle.createSeries.bind(lifecycle),
    ensureCoverage: lifecycle.ensureCoverage.bind(lifecycle),
    ensureUserCoverage: lifecycle.ensureUserCoverage.bind(lifecycle),
    reviseSeries: lifecycle.reviseSeries.bind(lifecycle),
    editOccurrence: lifecycle.editOccurrence.bind(lifecycle),
    skipOccurrence: lifecycle.skipOccurrence.bind(lifecycle),
    completeOccurrence: lifecycle.completeOccurrence.bind(lifecycle),
    reopenOccurrence: lifecycle.reopenOccurrence.bind(lifecycle),
    pauseSeries: lifecycle.pauseSeries.bind(lifecycle),
    resumeSeries: lifecycle.resumeSeries.bind(lifecycle),
    endSeries: lifecycle.endSeries.bind(lifecycle),
    getSeries: lifecycle.getSeries.bind(lifecycle),
    listSeries: async (userId, status) => ({
      series: [...persistence.snapshot().series.values()].filter(
        (series) => series.userId === userId && (!status || series.status === status),
      ),
    }),
  };
  return { adapter, lifecycle };
}

describe("RecurringTasksDB", () => {
  let db: RecurringTasksDB;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabaseClient.setMockResponse(null);
    db = new RecurringTasksDB(mockSupabaseClient as unknown as SupabaseClient);
  });

  afterEach(() => {
    restoreMockSupabaseThen();
  });

  // ─── getUserRecurringTasks ─────────────────────────────────────────────────
  describe("getUserRecurringTasks", () => {
    it("fetches all recurring tasks for a user, newest first, with no status filter", async () => {
      const rows = [makeTemplate()];
      mockSupabaseClient.setMockResponse(rows);

      const result = await db.getUserRecurringTasks(USER_ID);

      expect(result).toEqual(rows);

      // Full chain assertion for a single-query method.
      mockSupabaseClient.expectQuery({
        table: "recurring_tasks",
        method: "from",
        args: ["recurring_tasks"],
      });
      mockSupabaseClient.expectQuery({
        table: "recurring_tasks",
        method: "select",
        args: ["*"],
      });
      mockSupabaseClient.expectQuery({
        table: "recurring_tasks",
        method: "eq",
        args: ["user_id", USER_ID],
      });
      mockSupabaseClient.expectQuery({
        table: "recurring_tasks",
        method: "order",
        args: ["created_at", { ascending: false }],
      });

      // No status filter applied → `.eq("status", ...)` must not appear.
      const statusEq = mockSupabaseClient.queryLog.filter(
        (e) => e.method === "eq" && e.args[0] === "status",
      );
      expect(statusEq).toHaveLength(0);
    });

    it("applies status filter when provided", async () => {
      mockSupabaseClient.setMockResponse([]);

      await db.getUserRecurringTasks(USER_ID, { status: "paused" });

      mockSupabaseClient.expectQuery({
        table: "recurring_tasks",
        method: "eq",
        args: ["status", "paused"],
      });
    });

    it("does not apply status filter when filters is empty object (falsy status)", async () => {
      mockSupabaseClient.setMockResponse([]);

      await db.getUserRecurringTasks(USER_ID, {});

      const statusEq = mockSupabaseClient.queryLog.filter(
        (e) => e.method === "eq" && e.args[0] === "status",
      );
      expect(statusEq).toHaveLength(0);
    });

    it("returns an empty array when data is null", async () => {
      mockSupabaseClient.setMockResponse(null);

      const result = await db.getUserRecurringTasks(USER_ID);

      expect(result).toEqual([]);
    });

    it("throws when the query errors", async () => {
      mockSupabaseClient.setMockResponse(null, new Error("select failed"));

      await expect(db.getUserRecurringTasks(USER_ID)).rejects.toThrow(
        "select failed",
      );
    });
  });

  // ─── getRecurringTask ──────────────────────────────────────────────────────
  describe("getRecurringTask", () => {
    it("fetches a single recurring task by id + user_id", async () => {
      const row = makeTemplate();
      mockSupabaseClient.setMockResponse(row);

      const result = await db.getRecurringTask(RT_ID, USER_ID);

      expect(result).toEqual(row);

      mockSupabaseClient.expectQuery({
        table: "recurring_tasks",
        method: "from",
        args: ["recurring_tasks"],
      });
      mockSupabaseClient.expectQuery({
        table: "recurring_tasks",
        method: "select",
        args: ["*"],
      });
      mockSupabaseClient.expectQuery({
        table: "recurring_tasks",
        method: "eq",
        args: ["id", RT_ID],
      });
      mockSupabaseClient.expectQuery({
        table: "recurring_tasks",
        method: "eq",
        args: ["user_id", USER_ID],
      });
      mockSupabaseClient.expectQuery({
        table: "recurring_tasks",
        method: "single",
        args: [],
      });
    });

    it("returns null when error code is PGRST116 (not found)", async () => {
      mockSupabaseClient.setMockResponse(null, { code: "PGRST116" });

      const result = await db.getRecurringTask("missing", USER_ID);

      expect(result).toBeNull();
    });

    it("throws when error code is not PGRST116", async () => {
      const err = { code: "42P01", message: "relation does not exist" };
      mockSupabaseClient.setMockResponse(null, err);

      await expect(db.getRecurringTask(RT_ID, USER_ID)).rejects.toEqual(err);
    });
  });

  // ─── createRecurringTask ───────────────────────────────────────────────────
  describe("createRecurringTask", () => {
    const insertData: RecurringTaskInsert = {
      user_id: USER_ID,
      title: "New task",
      description: null,
      priority: 0,
      category_id: null,
      due_time: null,
      recurrence_rule: { frequency: "daily", interval: 1 },
      start_date: "2026-02-01",
      end_type: "never",
      end_date: null,
      end_count: null,
      status: "active",
    };

    it("inserts with next_generate_date=start_date and instances_generated=0, then triggers instance generation", async () => {
      const created = makeTemplate({ title: "New task" });
      mockSupabaseClient.setMockResponse(created);
      mockEnsureRecurringInstances.mockResolvedValue(undefined);

      const result = await db.createRecurringTask(insertData, "2026-02-08");

      expect(result).toEqual(created);

      // The insert payload must carry the bookkeeping fields the source adds.
      mockSupabaseClient.expectQuery({
        table: "recurring_tasks",
        method: "from",
        args: ["recurring_tasks"],
      });
      mockSupabaseClient.expectQuery({
        table: "recurring_tasks",
        method: "insert",
        args: [
          {
            ...insertData,
            next_generate_date: "2026-02-01",
            instances_generated: 0,
          },
        ],
      });
      mockSupabaseClient.expectQuery({
        table: "recurring_tasks",
        method: "select",
        args: [],
      });
      mockSupabaseClient.expectQuery({
        table: "recurring_tasks",
        method: "single",
        args: [],
      });

      // ensureRecurringInstances is called with (supabase, userId, throughDate)
      expect(mockEnsureRecurringInstances).toHaveBeenCalledTimes(1);
      expect(mockEnsureRecurringInstances).toHaveBeenCalledWith(
        mockSupabaseClient,
        USER_ID,
        "2026-02-08",
      );
    });

    it("throws when the insert fails and skips instance generation", async () => {
      mockSupabaseClient.setMockResponse(null, new Error("insert failed"));

      await expect(
        db.createRecurringTask(insertData, "2026-02-08"),
      ).rejects.toThrow("insert failed");

      expect(mockEnsureRecurringInstances).not.toHaveBeenCalled();
    });
  });

  // ─── updateRecurringTask ───────────────────────────────────────────────────
  describe("updateRecurringTask", () => {
    it("updates the recurring task and returns the new row", async () => {
      const updated = makeTemplate({ title: "Updated" });
      mockSupabaseClient.setMockResponse(updated);

      const result = await db.updateRecurringTask(RT_ID, USER_ID, {
        title: "Updated",
      });

      expect(result).toEqual(updated);

      mockSupabaseClient.expectQuery({
        table: "recurring_tasks",
        method: "from",
        args: ["recurring_tasks"],
      });
      mockSupabaseClient.expectQuery({
        table: "recurring_tasks",
        method: "update",
        args: [{ title: "Updated" }],
      });
      mockSupabaseClient.expectQuery({
        table: "recurring_tasks",
        method: "eq",
        args: ["id", RT_ID],
      });
      mockSupabaseClient.expectQuery({
        table: "recurring_tasks",
        method: "eq",
        args: ["user_id", USER_ID],
      });
      mockSupabaseClient.expectQuery({
        table: "recurring_tasks",
        method: "select",
        args: [],
      });
      mockSupabaseClient.expectQuery({
        table: "recurring_tasks",
        method: "single",
        args: [],
      });
    });

    it("throws when the update errors", async () => {
      mockSupabaseClient.setMockResponse(null, new Error("update failed"));

      await expect(
        db.updateRecurringTask(RT_ID, USER_ID, { title: "X" }),
      ).rejects.toThrow("update failed");
    });
  });

  // ─── archiveRecurringTask ──────────────────────────────────────────────────
  describe("archiveRecurringTask", () => {
    it("sets status to 'archived' on the template row", async () => {
      mockSupabaseClient.setMockResponse(null);

      await db.archiveRecurringTask(RT_ID, USER_ID);

      // Full ordered queryLog assertion — single phase with repeated eq args,
      // plus no terminal select/single, so we pin the whole chain.
      expect(mockSupabaseClient.queryLog).toEqual([
        { table: "recurring_tasks", method: "from", args: ["recurring_tasks"] },
        {
          table: "recurring_tasks",
          method: "update",
          args: [{ status: "archived" }],
        },
        { table: "recurring_tasks", method: "eq", args: ["id", RT_ID] },
        {
          table: "recurring_tasks",
          method: "eq",
          args: ["user_id", USER_ID],
        },
      ]);
    });

    it("throws when the update errors", async () => {
      mockSupabaseClient.setMockResponse(null, new Error("archive failed"));

      await expect(db.archiveRecurringTask(RT_ID, USER_ID)).rejects.toThrow(
        "archive failed",
      );
    });
  });

  // ─── deleteRecurringTask ──────────────────────────────────────────────────
  describe("deleteRecurringTask", () => {
    it("deletes all future incomplete instances first, then deletes the template", async () => {
      // Both awaited deletes consume from the thenable queue.
      queueThenResponses([
        { data: null, error: null }, // DELETE tasks (instances)
        { data: null, error: null }, // DELETE recurring_tasks (template)
      ]);

      await db.deleteRecurringTask(RT_ID, USER_ID);

      // Full ordered log — two phases with repeated eq("user_id", …) and
      // eq on id, so expectQuery alone would find the "other" unmutated
      // copy. toEqual pins every arg in every position.
      expect(mockSupabaseClient.queryLog).toEqual([
        // Phase 1: DELETE from `tasks` WHERE recurring_task_id=RT_ID
        //                                AND user_id=USER_ID
        //                                AND is_completed=false
        { table: "tasks", method: "from", args: ["tasks"] },
        { table: "tasks", method: "delete", args: [] },
        {
          table: "tasks",
          method: "eq",
          args: ["recurring_task_id", RT_ID],
        },
        { table: "tasks", method: "eq", args: ["user_id", USER_ID] },
        { table: "tasks", method: "eq", args: ["is_completed", false] },
        // Phase 2: DELETE from `recurring_tasks` WHERE id=RT_ID
        //                                           AND user_id=USER_ID
        { table: "recurring_tasks", method: "from", args: ["recurring_tasks"] },
        { table: "recurring_tasks", method: "delete", args: [] },
        { table: "recurring_tasks", method: "eq", args: ["id", RT_ID] },
        {
          table: "recurring_tasks",
          method: "eq",
          args: ["user_id", USER_ID],
        },
      ]);
    });

    it("throws and short-circuits when instance deletion fails", async () => {
      queueThenResponses([
        { data: null, error: new Error("instance delete failed") },
      ]);

      await expect(db.deleteRecurringTask(RT_ID, USER_ID)).rejects.toThrow(
        "instance delete failed",
      );

      // The second DELETE (template) must NOT run after the first errored.
      const fromCalls = mockSupabaseClient.queryLog.filter(
        (e) => e.method === "from",
      );
      expect(fromCalls).toHaveLength(1);
      expect(fromCalls[0].args).toEqual(["tasks"]);
    });

    it("throws when the template deletion fails", async () => {
      queueThenResponses([
        { data: null, error: null }, // instance delete OK
        { data: null, error: new Error("template delete failed") },
      ]);

      await expect(db.deleteRecurringTask(RT_ID, USER_ID)).rejects.toThrow(
        "template delete failed",
      );
    });
  });

  // ─── pauseRecurringTask ───────────────────────────────────────────────────
  describe("pauseRecurringTask", () => {
    it("delegates to updateRecurringTask with status='paused' and returns the result", async () => {
      const paused = makeTemplate({ status: "paused" });
      mockSupabaseClient.setMockResponse(paused);

      const result = await db.pauseRecurringTask(RT_ID, USER_ID);

      expect(result).toEqual(paused);
      mockSupabaseClient.expectQuery({
        table: "recurring_tasks",
        method: "update",
        args: [{ status: "paused" }],
      });
      mockSupabaseClient.expectQuery({
        table: "recurring_tasks",
        method: "eq",
        args: ["id", RT_ID],
      });
      mockSupabaseClient.expectQuery({
        table: "recurring_tasks",
        method: "eq",
        args: ["user_id", USER_ID],
      });
    });

    it("throws when the underlying update errors", async () => {
      mockSupabaseClient.setMockResponse(null, new Error("pause failed"));

      await expect(db.pauseRecurringTask(RT_ID, USER_ID)).rejects.toThrow(
        "pause failed",
      );
    });
  });

  // ─── resumeRecurringTask ──────────────────────────────────────────────────
  describe("resumeRecurringTask", () => {
    it("fetches the template, computes next occurrence, writes status+next_generate_date, then generates instances", async () => {
      // Both the SELECT (getRecurringTask → .single) and the UPDATE
      // (→ .select().single()) consume mockData. We set it to the template
      // before the SELECT; since the UPDATE also reads from it, the returned
      // row here is the same shape (fine for the happy path).
      const template = makeTemplate();
      mockSupabaseClient.setMockResponse(template);
      mockGetNextOccurrence.mockReturnValue("2026-02-22");
      mockEnsureRecurringInstances.mockResolvedValue(undefined);

      const result = await db.resumeRecurringTask(
        RT_ID,
        USER_ID,
        "2026-02-21",
        "2026-02-28",
      );

      expect(result).toEqual(template);

      // getNextOccurrence called with the template's rule + start_date + today.
      expect(mockGetNextOccurrence).toHaveBeenCalledTimes(1);
      expect(mockGetNextOccurrence).toHaveBeenCalledWith(
        template.recurrence_rule,
        template.start_date,
        "2026-02-21",
      );

      // Full queryLog assertion — this method does a SELECT (via getRecurringTask)
      // then an UPDATE, and BOTH phases call `.eq("user_id", userId)`. With
      // expectQuery alone, mutating one copy still matches the other, so we
      // pin every call in order.
      expect(mockSupabaseClient.queryLog).toEqual([
        // Phase 1: SELECT template (getRecurringTask)
        { table: "recurring_tasks", method: "from", args: ["recurring_tasks"] },
        { table: "recurring_tasks", method: "select", args: ["*"] },
        { table: "recurring_tasks", method: "eq", args: ["id", RT_ID] },
        {
          table: "recurring_tasks",
          method: "eq",
          args: ["user_id", USER_ID],
        },
        { table: "recurring_tasks", method: "single", args: [] },
        // Phase 2: UPDATE with computed next_generate_date
        { table: "recurring_tasks", method: "from", args: ["recurring_tasks"] },
        {
          table: "recurring_tasks",
          method: "update",
          args: [{ status: "active", next_generate_date: "2026-02-22" }],
        },
        { table: "recurring_tasks", method: "eq", args: ["id", RT_ID] },
        {
          table: "recurring_tasks",
          method: "eq",
          args: ["user_id", USER_ID],
        },
        { table: "recurring_tasks", method: "select", args: [] },
        { table: "recurring_tasks", method: "single", args: [] },
      ]);

      expect(mockEnsureRecurringInstances).toHaveBeenCalledTimes(1);
      expect(mockEnsureRecurringInstances).toHaveBeenCalledWith(
        mockSupabaseClient,
        USER_ID,
        "2026-02-28",
      );
    });

    it("falls back to todayDate when getNextOccurrence returns null", async () => {
      const template = makeTemplate();
      mockSupabaseClient.setMockResponse(template);
      mockGetNextOccurrence.mockReturnValue(null);
      mockEnsureRecurringInstances.mockResolvedValue(undefined);

      await db.resumeRecurringTask(
        RT_ID,
        USER_ID,
        "2026-02-21",
        "2026-02-28",
      );

      mockSupabaseClient.expectQuery({
        table: "recurring_tasks",
        method: "update",
        args: [
          { status: "active", next_generate_date: "2026-02-21" },
        ],
      });
    });

    it("throws 'Recurring task not found' when template fetch returns null (PGRST116)", async () => {
      mockSupabaseClient.setMockResponse(null, { code: "PGRST116" });

      await expect(
        db.resumeRecurringTask(
          "missing",
          USER_ID,
          "2026-02-21",
          "2026-02-28",
        ),
      ).rejects.toThrow("Recurring task not found");

      // Must short-circuit before calling getNextOccurrence and before any UPDATE.
      expect(mockGetNextOccurrence).not.toHaveBeenCalled();
      const updateCalls = mockSupabaseClient.queryLog.filter(
        (e) => e.method === "update",
      );
      expect(updateCalls).toHaveLength(0);
      expect(mockEnsureRecurringInstances).not.toHaveBeenCalled();
    });

    it("throws when the UPDATE errors (template loaded, update rejected)", async () => {
      // SELECT via .single() reads mockData. UPDATE terminal is also
      // .single() — same read. To differentiate: set mockData to the template,
      // run SELECT, then swap mockError before UPDATE. Simplest: keep both
      // passing the same read path but force the `.select().single()` UPDATE
      // path to error by setting mockError on the response.
      // However `.single()` reads BOTH data and error at call time — so if we
      // set error upfront, the SELECT would also fail (returns null/PGRST116-like).
      // The source's getRecurringTask only treats code:PGRST116 as null;
      // any other error throws. So a non-PGRST116 error would throw from SELECT
      // first — not hitting UPDATE.
      //
      // Workaround: spy on the supabase `.single` to toggle after the first call.
      const template = makeTemplate();
      mockSupabaseClient.setMockResponse(template);
      mockGetNextOccurrence.mockReturnValue("2026-02-22");

      let singleCall = 0;
      const singleSpy = vi.spyOn(mockSupabaseClient, "single");
      singleSpy.mockImplementation(() => {
        singleCall += 1;
        if (singleCall === 1) {
          return Promise.resolve({ data: template, error: null });
        }
        return Promise.resolve({
          data: null,
          error: new Error("resume update failed"),
        });
      });

      await expect(
        db.resumeRecurringTask(RT_ID, USER_ID, "2026-02-21", "2026-02-28"),
      ).rejects.toThrow("resume update failed");

      expect(mockEnsureRecurringInstances).not.toHaveBeenCalled();
      singleSpy.mockRestore();
    });
  });

  // ─── updateInstanceWithScope ──────────────────────────────────────────────
  describe("updateInstanceWithScope", () => {
    const taskRow = {
      id: TASK_ID,
      user_id: USER_ID,
      recurring_task_id: RT_ID,
      original_date: "2026-02-15",
      is_completed: false,
      is_exception: false,
      recurring_tasks: makeTemplate(),
    };

    it("scope='this': updates just this instance with is_exception=true flag", async () => {
      // SELECT via .single → mockData = taskRow.
      // UPDATE is awaited via `.eq().eq()` → consumes a then() response.
      mockSupabaseClient.setMockResponse(taskRow);
      queueThenResponses([{ data: null, error: null }]);

      const updates: TaskUpdate = { title: "Modified" };
      await db.updateInstanceWithScope(TASK_ID, USER_ID, "this", updates);

      // Full ordered log — one SELECT phase + one UPDATE phase, both on `tasks`.
      expect(mockSupabaseClient.queryLog).toEqual([
        // SELECT tasks (joined with recurring_tasks(*)) WHERE id=TASK_ID AND user_id=USER_ID
        { table: "tasks", method: "from", args: ["tasks"] },
        {
          table: "tasks",
          method: "select",
          args: ["*, recurring_tasks(*)"],
        },
        { table: "tasks", method: "eq", args: ["id", TASK_ID] },
        { table: "tasks", method: "eq", args: ["user_id", USER_ID] },
        { table: "tasks", method: "single", args: [] },
        // UPDATE with is_exception:true merged into updates
        { table: "tasks", method: "from", args: ["tasks"] },
        {
          table: "tasks",
          method: "update",
          args: [{ ...updates, is_exception: true }],
        },
        { table: "tasks", method: "eq", args: ["id", TASK_ID] },
        { table: "tasks", method: "eq", args: ["user_id", USER_ID] },
      ]);
    });

    it("scope='this': throws when the UPDATE errors", async () => {
      mockSupabaseClient.setMockResponse(taskRow);
      queueThenResponses([
        { data: null, error: new Error("this-update failed") },
      ]);

      await expect(
        db.updateInstanceWithScope(TASK_ID, USER_ID, "this", {
          title: "X",
        }),
      ).rejects.toThrow("this-update failed");
    });

    it("scope='following': updates template (filtered whitelist) AND future non-exception incomplete instances from original_date onward", async () => {
      // SELECT → .single (mockData = taskRow).
      // updateRecurringTask → .single (also reads mockData — for the return
      // value; we don't assert on it). Then UPDATE tasks → awaited .gte.
      mockSupabaseClient.setMockResponse(taskRow);
      queueThenResponses([{ data: null, error: null }]);

      const updates: TaskUpdate = {
        title: "New Title",
        description: "New desc",
        priority: 2,
        category_id: "cat-1",
        due_time: "10:00",
        // Should NOT be copied to the template:
        notes: "ignored",
      } as unknown as TaskUpdate;

      await db.updateInstanceWithScope(TASK_ID, USER_ID, "following", updates);

      // Full queryLog assertion — three phases (SELECT task, UPDATE template
      // via updateRecurringTask, UPDATE tasks) all use `.eq("user_id", …)`.
      // Without pinning the whole log, mutating just one copy would still
      // satisfy an expectQuery. Covers all whitelisted fields being copied
      // to the template (kills `if (false)` mutants on each `!== undefined`
      // check) AND every user_id assertion across all phases.
      expect(mockSupabaseClient.queryLog).toEqual([
        // Phase 1: SELECT tasks (joined)
        { table: "tasks", method: "from", args: ["tasks"] },
        {
          table: "tasks",
          method: "select",
          args: ["*, recurring_tasks(*)"],
        },
        { table: "tasks", method: "eq", args: ["id", TASK_ID] },
        { table: "tasks", method: "eq", args: ["user_id", USER_ID] },
        { table: "tasks", method: "single", args: [] },
        // Phase 2: UPDATE template (updateRecurringTask) — whitelist only.
        { table: "recurring_tasks", method: "from", args: ["recurring_tasks"] },
        {
          table: "recurring_tasks",
          method: "update",
          args: [
            {
              title: "New Title",
              description: "New desc",
              priority: 2,
              category_id: "cat-1",
              due_time: "10:00",
            },
          ],
        },
        { table: "recurring_tasks", method: "eq", args: ["id", RT_ID] },
        {
          table: "recurring_tasks",
          method: "eq",
          args: ["user_id", USER_ID],
        },
        { table: "recurring_tasks", method: "select", args: [] },
        { table: "recurring_tasks", method: "single", args: [] },
        // Phase 3: UPDATE future tasks — payload is FULL updates, not filtered.
        { table: "tasks", method: "from", args: ["tasks"] },
        { table: "tasks", method: "update", args: [updates] },
        {
          table: "tasks",
          method: "eq",
          args: ["recurring_task_id", RT_ID],
        },
        { table: "tasks", method: "eq", args: ["user_id", USER_ID] },
        { table: "tasks", method: "eq", args: ["is_completed", false] },
        { table: "tasks", method: "eq", args: ["is_exception", false] },
        {
          table: "tasks",
          method: "gte",
          args: ["original_date", "2026-02-15"],
        },
      ]);
    });

    it("scope='following': skips template UPDATE when no whitelisted field changes", async () => {
      mockSupabaseClient.setMockResponse(taskRow);
      queueThenResponses([{ data: null, error: null }]);

      // Only a non-whitelisted field (`notes`) in updates → template skipped,
      // but the task-instance update still runs.
      const updates = { notes: "only a note" } as unknown as TaskUpdate;
      await db.updateInstanceWithScope(TASK_ID, USER_ID, "following", updates);

      // The recurring_tasks table must NOT be touched.
      const rtCalls = mockSupabaseClient.queryLog.filter(
        (e) => e.table === "recurring_tasks",
      );
      expect(rtCalls).toHaveLength(0);

      // The instance UPDATE still runs.
      mockSupabaseClient.expectQuery({
        table: "tasks",
        method: "update",
        args: [updates],
      });
    });

    it("scope='following': skips instance UPDATE when task has no original_date", async () => {
      mockSupabaseClient.setMockResponse({
        ...taskRow,
        original_date: null,
      });
      // No queued response needed because no UPDATE will fire.

      await db.updateInstanceWithScope(TASK_ID, USER_ID, "following", {
        title: "New Title",
      });

      // No UPDATE on the `tasks` table (the template UPDATE does hit
      // `recurring_tasks`, not `tasks`).
      const taskUpdates = mockSupabaseClient.queryLog.filter(
        (e) => e.method === "update" && e.table === "tasks",
      );
      expect(taskUpdates).toHaveLength(0);

      // And no .gte() on original_date at all.
      const gteCalls = mockSupabaseClient.queryLog.filter(
        (e) => e.method === "gte",
      );
      expect(gteCalls).toHaveLength(0);
    });

    it("scope='following': throws when the future-instance UPDATE errors", async () => {
      mockSupabaseClient.setMockResponse(taskRow);
      queueThenResponses([
        { data: null, error: new Error("following tasks update failed") },
      ]);

      await expect(
        db.updateInstanceWithScope(TASK_ID, USER_ID, "following", {
          // Only a non-whitelisted field so template update is skipped, making
          // the queued response line up with the tasks UPDATE directly.
          notes: "note",
        } as unknown as TaskUpdate),
      ).rejects.toThrow("following tasks update failed");
    });

    it("scope='all': updates template (whitelist) AND all future non-exception incomplete instances (no date filter)", async () => {
      mockSupabaseClient.setMockResponse(taskRow);
      queueThenResponses([{ data: null, error: null }]);

      // Exercise every whitelisted field so conditional mutations
      // (`if (updates.<field> !== undefined)` → `if (false)`) are killed
      // for all five fields.
      const updates: TaskUpdate = {
        title: "All Updated",
        description: "All desc",
        priority: 3,
        category_id: "cat-all",
        due_time: "11:00",
        notes: "ignored",
      } as unknown as TaskUpdate;

      await db.updateInstanceWithScope(TASK_ID, USER_ID, "all", updates);

      // Full queryLog assertion — three phases, all repeating `.eq("user_id", …)`.
      expect(mockSupabaseClient.queryLog).toEqual([
        // Phase 1: SELECT tasks (joined)
        { table: "tasks", method: "from", args: ["tasks"] },
        {
          table: "tasks",
          method: "select",
          args: ["*, recurring_tasks(*)"],
        },
        { table: "tasks", method: "eq", args: ["id", TASK_ID] },
        { table: "tasks", method: "eq", args: ["user_id", USER_ID] },
        { table: "tasks", method: "single", args: [] },
        // Phase 2: UPDATE template (whitelist only)
        { table: "recurring_tasks", method: "from", args: ["recurring_tasks"] },
        {
          table: "recurring_tasks",
          method: "update",
          args: [
            {
              title: "All Updated",
              description: "All desc",
              priority: 3,
              category_id: "cat-all",
              due_time: "11:00",
            },
          ],
        },
        { table: "recurring_tasks", method: "eq", args: ["id", RT_ID] },
        {
          table: "recurring_tasks",
          method: "eq",
          args: ["user_id", USER_ID],
        },
        { table: "recurring_tasks", method: "select", args: [] },
        { table: "recurring_tasks", method: "single", args: [] },
        // Phase 3: UPDATE all incomplete non-exception instances —
        // NO .gte() filter (that's the 'following'-only bit).
        { table: "tasks", method: "from", args: ["tasks"] },
        { table: "tasks", method: "update", args: [updates] },
        {
          table: "tasks",
          method: "eq",
          args: ["recurring_task_id", RT_ID],
        },
        { table: "tasks", method: "eq", args: ["user_id", USER_ID] },
        { table: "tasks", method: "eq", args: ["is_completed", false] },
        { table: "tasks", method: "eq", args: ["is_exception", false] },
      ]);
    });

    it("scope='all': skips template UPDATE when no whitelisted field is provided", async () => {
      mockSupabaseClient.setMockResponse(taskRow);
      queueThenResponses([{ data: null, error: null }]);

      const updates = { notes: "only" } as unknown as TaskUpdate;
      await db.updateInstanceWithScope(TASK_ID, USER_ID, "all", updates);

      const rtCalls = mockSupabaseClient.queryLog.filter(
        (e) => e.table === "recurring_tasks",
      );
      expect(rtCalls).toHaveLength(0);
    });

    it("scope='all': throws when the instance UPDATE errors", async () => {
      mockSupabaseClient.setMockResponse(taskRow);
      queueThenResponses([
        { data: null, error: new Error("all tasks update failed") },
      ]);

      await expect(
        db.updateInstanceWithScope(TASK_ID, USER_ID, "all", {
          notes: "note",
        } as unknown as TaskUpdate),
      ).rejects.toThrow("all tasks update failed");
    });

    it("throws 'Task not found' when SELECT returns null (PGRST116)", async () => {
      mockSupabaseClient.setMockResponse(null, { code: "PGRST116" });

      await expect(
        db.updateInstanceWithScope("missing", USER_ID, "this", {
          title: "X",
        }),
      ).rejects.toThrow("Task not found or not part of a recurring series");
    });

    it("throws SELECT error when error code is not PGRST116", async () => {
      mockSupabaseClient.setMockResponse(null, {
        code: "42P01",
        message: "relation missing",
      });

      await expect(
        db.updateInstanceWithScope(TASK_ID, USER_ID, "this", {
          title: "X",
        }),
      ).rejects.toEqual({ code: "42P01", message: "relation missing" });
    });

    it("throws 'Task not found' when task has no recurring_task_id", async () => {
      mockSupabaseClient.setMockResponse({
        ...taskRow,
        recurring_task_id: null,
      });

      await expect(
        db.updateInstanceWithScope(TASK_ID, USER_ID, "this", {
          title: "X",
        }),
      ).rejects.toThrow("Task not found or not part of a recurring series");
    });
  });

  // ─── deleteInstanceWithScope ──────────────────────────────────────────────
  describe("deleteInstanceWithScope", () => {
    const taskRow = {
      id: TASK_ID,
      user_id: USER_ID,
      recurring_task_id: RT_ID,
      original_date: "2026-02-15",
      is_completed: false,
    };

    it("scope='this': deletes only this instance", async () => {
      mockSupabaseClient.setMockResponse(taskRow);
      queueThenResponses([{ data: null, error: null }]);

      await db.deleteInstanceWithScope(TASK_ID, USER_ID, "this");

      expect(mockSupabaseClient.queryLog).toEqual([
        // SELECT tasks WHERE id=TASK_ID AND user_id=USER_ID
        { table: "tasks", method: "from", args: ["tasks"] },
        { table: "tasks", method: "select", args: ["*"] },
        { table: "tasks", method: "eq", args: ["id", TASK_ID] },
        { table: "tasks", method: "eq", args: ["user_id", USER_ID] },
        { table: "tasks", method: "single", args: [] },
        // DELETE tasks WHERE id=TASK_ID AND user_id=USER_ID
        { table: "tasks", method: "from", args: ["tasks"] },
        { table: "tasks", method: "delete", args: [] },
        { table: "tasks", method: "eq", args: ["id", TASK_ID] },
        { table: "tasks", method: "eq", args: ["user_id", USER_ID] },
      ]);
    });

    it("scope='this': throws when the DELETE errors", async () => {
      mockSupabaseClient.setMockResponse(taskRow);
      queueThenResponses([
        { data: null, error: new Error("delete this failed") },
      ]);

      await expect(
        db.deleteInstanceWithScope(TASK_ID, USER_ID, "this"),
      ).rejects.toThrow("delete this failed");
    });

    it("scope='following': deletes future incomplete instances AND sets template end_date to the day before original_date", async () => {
      mockSupabaseClient.setMockResponse(taskRow);
      // First awaited call: DELETE tasks with .gte. Second: updateRecurringTask
      // ends with .single() — reads mockData directly, not from the queue.
      queueThenResponses([{ data: null, error: null }]);

      await db.deleteInstanceWithScope(TASK_ID, USER_ID, "following");

      // Full queryLog — three phases (SELECT, DELETE tasks, UPDATE template)
      // all call `.eq("user_id", …)`. Pin every call to kill user_id mutants
      // in every position.
      expect(mockSupabaseClient.queryLog).toEqual([
        // Phase 1: SELECT tasks
        { table: "tasks", method: "from", args: ["tasks"] },
        { table: "tasks", method: "select", args: ["*"] },
        { table: "tasks", method: "eq", args: ["id", TASK_ID] },
        { table: "tasks", method: "eq", args: ["user_id", USER_ID] },
        { table: "tasks", method: "single", args: [] },
        // Phase 2: DELETE future tasks from original_date onward
        { table: "tasks", method: "from", args: ["tasks"] },
        { table: "tasks", method: "delete", args: [] },
        {
          table: "tasks",
          method: "eq",
          args: ["recurring_task_id", RT_ID],
        },
        { table: "tasks", method: "eq", args: ["user_id", USER_ID] },
        { table: "tasks", method: "eq", args: ["is_completed", false] },
        {
          table: "tasks",
          method: "gte",
          args: ["original_date", "2026-02-15"],
        },
        // Phase 3: UPDATE template via updateRecurringTask with end_date =
        // day BEFORE original_date (2026-02-15 → 2026-02-14).
        { table: "recurring_tasks", method: "from", args: ["recurring_tasks"] },
        {
          table: "recurring_tasks",
          method: "update",
          args: [{ end_type: "on_date", end_date: "2026-02-14" }],
        },
        { table: "recurring_tasks", method: "eq", args: ["id", RT_ID] },
        {
          table: "recurring_tasks",
          method: "eq",
          args: ["user_id", USER_ID],
        },
        { table: "recurring_tasks", method: "select", args: [] },
        { table: "recurring_tasks", method: "single", args: [] },
      ]);
    });

    it("scope='following': end_date correctly handles month boundaries (March 1 → Feb 28 in leap year 2024, Feb 29 in 2024)", async () => {
      // original_date = 2026-03-01 → prev day = 2026-02-28.
      mockSupabaseClient.setMockResponse({
        ...taskRow,
        original_date: "2026-03-01",
      });
      queueThenResponses([{ data: null, error: null }]);

      await db.deleteInstanceWithScope(TASK_ID, USER_ID, "following");

      mockSupabaseClient.expectQuery({
        table: "recurring_tasks",
        method: "update",
        args: [{ end_type: "on_date", end_date: "2026-02-28" }],
      });
    });

    it("scope='following': end_date correctly handles year boundary (Jan 1 → Dec 31 of previous year)", async () => {
      mockSupabaseClient.setMockResponse({
        ...taskRow,
        original_date: "2026-01-01",
      });
      queueThenResponses([{ data: null, error: null }]);

      await db.deleteInstanceWithScope(TASK_ID, USER_ID, "following");

      mockSupabaseClient.expectQuery({
        table: "recurring_tasks",
        method: "update",
        args: [{ end_type: "on_date", end_date: "2025-12-31" }],
      });
    });

    it("scope='following': end_date zero-pads single-digit DAY correctly (Feb 10 → Feb 09, not Feb 9)", async () => {
      // original_date = 2026-02-10 → prev day = 2026-02-09.
      // The "09" is the whole point — kills padStart(2, '0') → padStart(2, '')
      // on the DAY formatter (source line 292).
      mockSupabaseClient.setMockResponse({
        ...taskRow,
        original_date: "2026-02-10",
      });
      queueThenResponses([{ data: null, error: null }]);

      await db.deleteInstanceWithScope(TASK_ID, USER_ID, "following");

      mockSupabaseClient.expectQuery({
        table: "recurring_tasks",
        method: "update",
        args: [{ end_type: "on_date", end_date: "2026-02-09" }],
      });
    });

    it("scope='following': throws when task has no original_date", async () => {
      mockSupabaseClient.setMockResponse({
        ...taskRow,
        original_date: null,
      });

      await expect(
        db.deleteInstanceWithScope(TASK_ID, USER_ID, "following"),
      ).rejects.toThrow(
        "Cannot delete following instances: task has no original_date",
      );

      // No DELETE should fire.
      const deleteCalls = mockSupabaseClient.queryLog.filter(
        (e) => e.method === "delete",
      );
      expect(deleteCalls).toHaveLength(0);
    });

    it("scope='following': throws when the DELETE errors", async () => {
      mockSupabaseClient.setMockResponse(taskRow);
      queueThenResponses([
        { data: null, error: new Error("delete following failed") },
      ]);

      await expect(
        db.deleteInstanceWithScope(TASK_ID, USER_ID, "following"),
      ).rejects.toThrow("delete following failed");
    });

    it("scope='all': deletes all incomplete instances AND archives the template", async () => {
      mockSupabaseClient.setMockResponse(taskRow);
      // First awaited: DELETE tasks. Second awaited: archiveRecurringTask's
      // UPDATE (no .single terminal) → also consumes from queue.
      queueThenResponses([
        { data: null, error: null }, // DELETE tasks
        { data: null, error: null }, // UPDATE recurring_tasks (archive)
      ]);

      await db.deleteInstanceWithScope(TASK_ID, USER_ID, "all");

      // Full queryLog — three phases (SELECT task, DELETE tasks, UPDATE archive)
      // all call `.eq("user_id", …)`. Pin every call.
      expect(mockSupabaseClient.queryLog).toEqual([
        // Phase 1: SELECT tasks
        { table: "tasks", method: "from", args: ["tasks"] },
        { table: "tasks", method: "select", args: ["*"] },
        { table: "tasks", method: "eq", args: ["id", TASK_ID] },
        { table: "tasks", method: "eq", args: ["user_id", USER_ID] },
        { table: "tasks", method: "single", args: [] },
        // Phase 2: DELETE all incomplete instances — NO .gte() filter.
        { table: "tasks", method: "from", args: ["tasks"] },
        { table: "tasks", method: "delete", args: [] },
        {
          table: "tasks",
          method: "eq",
          args: ["recurring_task_id", RT_ID],
        },
        { table: "tasks", method: "eq", args: ["user_id", USER_ID] },
        { table: "tasks", method: "eq", args: ["is_completed", false] },
        // Phase 3: UPDATE template → status archived (archiveRecurringTask)
        { table: "recurring_tasks", method: "from", args: ["recurring_tasks"] },
        {
          table: "recurring_tasks",
          method: "update",
          args: [{ status: "archived" }],
        },
        { table: "recurring_tasks", method: "eq", args: ["id", RT_ID] },
        {
          table: "recurring_tasks",
          method: "eq",
          args: ["user_id", USER_ID],
        },
      ]);
    });

    it("scope='all': throws when the DELETE errors", async () => {
      mockSupabaseClient.setMockResponse(taskRow);
      queueThenResponses([
        { data: null, error: new Error("delete all failed") },
      ]);

      await expect(
        db.deleteInstanceWithScope(TASK_ID, USER_ID, "all"),
      ).rejects.toThrow("delete all failed");
    });

    it("throws 'Task not found' when SELECT returns null (PGRST116)", async () => {
      mockSupabaseClient.setMockResponse(null, { code: "PGRST116" });

      await expect(
        db.deleteInstanceWithScope("missing", USER_ID, "this"),
      ).rejects.toThrow("Task not found or not part of a recurring series");
    });

    it("throws SELECT error when error code is not PGRST116", async () => {
      mockSupabaseClient.setMockResponse(null, {
        code: "XYZ",
        message: "some other failure",
      });

      await expect(
        db.deleteInstanceWithScope(TASK_ID, USER_ID, "this"),
      ).rejects.toEqual({ code: "XYZ", message: "some other failure" });
    });

    it("throws 'Task not found' when task has no recurring_task_id", async () => {
      mockSupabaseClient.setMockResponse({
        ...taskRow,
        recurring_task_id: null,
      });

      await expect(
        db.deleteInstanceWithScope(TASK_ID, USER_ID, "this"),
      ).rejects.toThrow("Task not found or not part of a recurring series");
    });
  });

  describe("lifecycle adapter", () => {
    it("maps lifecycle series and delegates create, list, get, and revisions", async () => {
      const { adapter } = makeLifecycleAdapter();
      const lifecycleDB = new RecurringTasksDB(
        mockSupabaseClient as unknown as SupabaseClient,
        {
          lifecycle: adapter,
          timeZone: "America/Los_Angeles",
          effectiveDate: () => "2026-08-02",
        },
      );
      const insertData: RecurringTaskInsert = {
        user_id: USER_ID,
        title: "Lifecycle task",
        description: null,
        priority: 1,
        category_id: null,
        due_time: "09:00",
        recurrence_rule: { frequency: "daily", interval: 1 },
        start_date: "2026-08-01",
        end_type: "never",
        end_date: null,
        end_count: null,
        status: "active",
      };

      const created = await lifecycleDB.createRecurringTask(insertData, "2026-08-03");
      expect(created).toMatchObject({
        id: expect.any(String),
        user_id: USER_ID,
        title: "Lifecycle task",
        end_type: "never",
        instances_generated: 3,
        next_generate_date: "2026-08-04",
      });

      const listed = await lifecycleDB.getUserRecurringTasks(USER_ID);
      expect(listed).toHaveLength(1);
      expect(listed[0]).toMatchObject({ id: created.id, title: created.title });
      expect(await lifecycleDB.getRecurringTask(created.id, USER_ID)).toMatchObject({
        id: created.id,
        title: "Lifecycle task",
      });

      const updated = await lifecycleDB.updateRecurringTask(created.id, USER_ID, {
        title: "Revised task",
        end_type: "on_date",
        end_date: "2026-08-05",
      });
      expect(updated).toMatchObject({
        id: created.id,
        title: "Revised task",
        end_type: "on_date",
        end_date: "2026-08-05",
      });

      const paused = await lifecycleDB.updateRecurringTask(created.id, USER_ID, {
        status: "paused",
      });
      expect(paused.status).toBe("paused");
      const resumed = await lifecycleDB.updateRecurringTask(created.id, USER_ID, {
        status: "active",
      });
      expect(resumed.status).toBe("active");
      const archived = await lifecycleDB.updateRecurringTask(created.id, USER_ID, {
        status: "archived",
      });
      expect(archived.status).toBe("archived");
      expect(await lifecycleDB.getUserRecurringTasks(USER_ID, { status: "archived" }))
        .toHaveLength(1);
    });

    it("delegates archive, delete, pause, and resume commands to the lifecycle", async () => {
      const { adapter } = makeLifecycleAdapter();
      const lifecycleDB = new RecurringTasksDB(
        mockSupabaseClient as unknown as SupabaseClient,
        {
          lifecycle: adapter,
          timeZone: "America/Los_Angeles",
          effectiveDate: () => "2026-08-02",
        },
      );
      const insertData: RecurringTaskInsert = {
        user_id: USER_ID,
        title: "Command task",
        description: null,
        priority: 0,
        category_id: null,
        due_time: null,
        recurrence_rule: { frequency: "daily", interval: 1 },
        start_date: "2026-08-01",
        end_type: "never",
        end_date: null,
        end_count: null,
        status: "active",
      };

      const first = await lifecycleDB.createRecurringTask(insertData, "2026-08-03");
      const paused = await lifecycleDB.pauseRecurringTask(first.id, USER_ID);
      expect(paused.status).toBe("paused");
      const resumed = await lifecycleDB.resumeRecurringTask(
        first.id,
        USER_ID,
        "2026-08-03",
        "2026-08-04",
      );
      expect(resumed.status).toBe("active");
      await lifecycleDB.archiveRecurringTask(first.id, USER_ID);

      const second = await lifecycleDB.createRecurringTask(insertData, "2026-08-03");
      await lifecycleDB.deleteRecurringTask(second.id, USER_ID);
      expect((await lifecycleDB.getRecurringTask(second.id, USER_ID))?.status).toBe("archived");
    });

    it("routes instance scopes through lifecycle occurrence and series commands", async () => {
      const { adapter, lifecycle } = makeLifecycleAdapter();
      const lifecycleDB = new RecurringTasksDB(
        mockSupabaseClient as unknown as SupabaseClient,
        { lifecycle: adapter, timeZone: "America/Los_Angeles" },
      );
      const created = await lifecycleDB.createRecurringTask({
        user_id: USER_ID,
        title: "Scoped task",
        description: null,
        priority: 0,
        category_id: null,
        due_time: null,
        recurrence_rule: { frequency: "daily", interval: 1 },
        start_date: "2026-08-01",
        end_type: "never",
        end_date: null,
        end_count: null,
        status: "active",
      }, "2026-08-03");
      const series = await lifecycle.getSeries(USER_ID, created.id);
      expect(series.status).toBe("complete");
      if (series.status !== "complete") return;
      const first = series.occurrences[0];
      const second = series.occurrences[1];
      const third = series.occurrences[2];

      mockSupabaseClient.setMockResponse({
        recurring_series_id: created.id,
        recurring_occurrence_id: first.id,
        scheduled_date: first.scheduledDate,
      });
      await lifecycleDB.updateInstanceWithScope(TASK_ID, USER_ID, "this", {
        title: "One occurrence",
        is_completed: true,
      });
      const afterThis = await lifecycle.getSeries(USER_ID, created.id);
      expect(afterThis.status).toBe("complete");
      if (afterThis.status !== "complete") return;
      expect(afterThis.occurrences[0]).toMatchObject({
        state: "completed",
        details: { title: "One occurrence" },
      });

      mockSupabaseClient.setMockResponse({
        recurring_series_id: created.id,
        recurring_occurrence_id: second.id,
        scheduled_date: second.scheduledDate,
      });
      await lifecycleDB.updateInstanceWithScope(TASK_ID, USER_ID, "following", {
        description: "Following details",
      });
      await lifecycleDB.updateInstanceWithScope(TASK_ID, USER_ID, "all", {
        priority: 2,
      });

      mockSupabaseClient.setMockResponse({
        recurring_series_id: created.id,
        recurring_occurrence_id: second.id,
        scheduled_date: second.scheduledDate,
      });
      await lifecycleDB.deleteInstanceWithScope(TASK_ID, USER_ID, "this");
      const afterSkip = await lifecycle.getSeries(USER_ID, created.id);
      expect(afterSkip.status).toBe("complete");
      if (afterSkip.status !== "complete") return;
      expect(afterSkip.occurrences.find((occurrence) => occurrence.id === second.id)?.state)
        .toBe("skipped");

      mockSupabaseClient.setMockResponse({
        recurring_series_id: created.id,
        recurring_occurrence_id: third.id,
        scheduled_date: third.scheduledDate,
      });
      await lifecycleDB.deleteInstanceWithScope(TASK_ID, USER_ID, "following");
      await lifecycleDB.deleteInstanceWithScope(TASK_ID, USER_ID, "all");
      const afterEnd = await lifecycle.getSeries(USER_ID, created.id);
      expect(afterEnd.status).toBe("complete");
      if (afterEnd.status !== "complete") return;
      expect(afterEnd.series.status).toBe("ended");
    });
  });
});
