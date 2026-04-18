import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { WorkoutExercisesDB } from "@/lib/db/workout-exercises";
import { mockSupabaseClient } from "../../setup";
import { restoreMockSupabaseThen } from "../../helpers/mock-supabase";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SetType } from "@/lib/db/types";

// Mock logger so we can assert on log.error args (Rule 2 — explicit error paths).
vi.mock("@/lib/logger", () => ({
  log: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));
import { log } from "@/lib/logger";

/**
 * Rewires `.single()` so per-test phases can return distinct payloads AND
 * still show up in `queryLog`.
 *
 * The default mock records into `queryLog` but only returns one response
 * (from `setMockResponse`). Tests that need multiple distinct `.single()`
 * responses (e.g. addExercise: phase 1 max-lookup, phase 2 insert-returning)
 * usually reach for `mockResolvedValueOnce`, but that REPLACES the impl
 * entirely and skips the record() call — breaking the `queryLog`-based
 * assertions we want for mutation coverage.
 *
 * Solution: patch `.single()` so it both records AND drains a queue of
 * per-call responses. The queue is set via `queueSingleResponses(...)`
 * at test-setup time; when the queue is empty, we fall back to
 * `mockData`/`mockError` so tests that don't queue still work.
 */
interface SingleResponse {
  data: unknown;
  error: unknown;
}
let singleQueue: SingleResponse[] = [];
function queueSingleResponses(responses: SingleResponse[]) {
  singleQueue = [...responses];
}

function reinstallSingle() {
  const fn = mockSupabaseClient.single as unknown as ReturnType<typeof vi.fn>;
  fn.mockReset();
  fn.mockImplementation(() => {
    const self = mockSupabaseClient as unknown as {
      queryLog: Array<{ table: string | null; method: string; args: unknown[] }>;
      currentTable: string | null;
      mockData: unknown;
      mockError: unknown;
    };
    self.queryLog.push({
      table: self.currentTable ?? null,
      method: "single",
      args: [],
    });
    const next = singleQueue.shift();
    if (next) {
      return Promise.resolve({ data: next.data, error: next.error });
    }
    return Promise.resolve({ data: self.mockData, error: self.mockError });
  });
}

describe("WorkoutExercisesDB", () => {
  let db: WorkoutExercisesDB;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabaseClient.setMockResponse(null);
    singleQueue = [];
    reinstallSingle();
    db = new WorkoutExercisesDB(mockSupabaseClient as unknown as SupabaseClient);
  });

  afterEach(() => {
    restoreMockSupabaseThen();
  });

  // =========================================================================
  // addExercise
  // =========================================================================

  describe("addExercise", () => {
    const WORKOUT_ID = "w-1";
    const EXERCISE_ID = "ex-1";

    it("reads current max sort_order, inserts with max+65536 and forwards rest_timer_seconds", async () => {
      const insertedRow = { id: "we-1", workout_id: WORKOUT_ID };
      queueSingleResponses([
        { data: { sort_order: 65536 }, error: null },
        { data: insertedRow, error: null },
      ]);

      const result = await db.addExercise(WORKOUT_ID, EXERCISE_ID, 120);

      expect(result).toEqual(insertedRow);

      // Full ordered chain — two phases share table & eq keys, so use queryLog.
      expect(mockSupabaseClient.queryLog).toEqual([
        // Phase 1: max(sort_order) lookup
        { table: "workout_exercises", method: "from", args: ["workout_exercises"] },
        { table: "workout_exercises", method: "select", args: ["sort_order"] },
        { table: "workout_exercises", method: "eq", args: ["workout_id", WORKOUT_ID] },
        { table: "workout_exercises", method: "order", args: ["sort_order", { ascending: false }] },
        { table: "workout_exercises", method: "limit", args: [1] },
        { table: "workout_exercises", method: "single", args: [] },
        // Phase 2: insert
        { table: "workout_exercises", method: "from", args: ["workout_exercises"] },
        {
          table: "workout_exercises",
          method: "insert",
          args: [
            {
              workout_id: WORKOUT_ID,
              exercise_id: EXERCISE_ID,
              sort_order: 131072.0,
              rest_timer_seconds: 120,
            },
          ],
        },
        { table: "workout_exercises", method: "select", args: [] },
        { table: "workout_exercises", method: "single", args: [] },
      ]);

      expect(log.error).not.toHaveBeenCalled();
    });

    it("defaults sort_order to 65536 and rest_timer_seconds to 90 when no rows exist (PGRST116)", async () => {
      queueSingleResponses([
        { data: null, error: { code: "PGRST116" } },
        { data: { id: "we-1" }, error: null },
      ]);

      const result = await db.addExercise(WORKOUT_ID, EXERCISE_ID);

      expect(result).toEqual({ id: "we-1" });
      mockSupabaseClient.expectQuery({
        table: "workout_exercises",
        method: "insert",
        args: [
          {
            workout_id: WORKOUT_ID,
            exercise_id: EXERCISE_ID,
            sort_order: 65536.0,
            rest_timer_seconds: 90,
          },
        ],
      });
      expect(log.error).not.toHaveBeenCalled();
    });

    it("throws and logs on non-PGRST116 sort-query error and does NOT attempt insert", async () => {
      const dbError = { code: "500", message: "fail" };
      queueSingleResponses([{ data: null, error: dbError }]);

      await expect(db.addExercise(WORKOUT_ID, EXERCISE_ID)).rejects.toEqual(
        dbError,
      );

      // No insert happened because we bailed out on sortError.
      const inserts = mockSupabaseClient.queryLog.filter(
        (e) => e.method === "insert",
      );
      expect(inserts).toHaveLength(0);

      expect(log.error).toHaveBeenCalledTimes(1);
      expect(log.error).toHaveBeenCalledWith(
        "Failed to get workout exercise sort order",
        dbError,
      );
    });

    it("throws and logs when the insert fails after a successful sort lookup", async () => {
      const dbError = { code: "23505", message: "dup" };
      queueSingleResponses([
        { data: null, error: { code: "PGRST116" } },
        { data: null, error: dbError },
      ]);

      await expect(db.addExercise(WORKOUT_ID, EXERCISE_ID)).rejects.toEqual(
        dbError,
      );

      expect(log.error).toHaveBeenCalledTimes(1);
      expect(log.error).toHaveBeenCalledWith(
        "Failed to add exercise to workout",
        dbError,
      );
    });
  });

  // =========================================================================
  // removeExercise
  // =========================================================================

  describe("removeExercise", () => {
    const WE_ID = "we-1";

    it("deletes by id on workout_exercises", async () => {
      mockSupabaseClient.setMockResponse(null);

      await db.removeExercise(WE_ID);

      mockSupabaseClient.expectQuery({
        table: "workout_exercises",
        method: "from",
        args: ["workout_exercises"],
      });
      mockSupabaseClient.expectQuery({
        table: "workout_exercises",
        method: "delete",
        args: [],
      });
      mockSupabaseClient.expectQuery({
        table: "workout_exercises",
        method: "eq",
        args: ["id", WE_ID],
      });

      expect(log.error).not.toHaveBeenCalled();
    });

    it("throws and logs on delete error", async () => {
      const dbError = { code: "500", message: "fail" };
      mockSupabaseClient.setMockResponse(null, dbError);

      await expect(db.removeExercise(WE_ID)).rejects.toEqual(dbError);

      expect(log.error).toHaveBeenCalledTimes(1);
      expect(log.error).toHaveBeenCalledWith(
        "Failed to remove exercise from workout",
        dbError,
      );
    });
  });

  // =========================================================================
  // updateExercise
  // =========================================================================

  describe("updateExercise", () => {
    const WE_ID = "we-1";

    it("updates fields and returns the updated row, asserting full chain", async () => {
      const row = { id: WE_ID, notes: "hello" };
      mockSupabaseClient.setMockResponse(row);

      const updates = { notes: "hello", rest_timer_seconds: 60 };
      const result = await db.updateExercise(WE_ID, updates);

      expect(result).toEqual(row);
      mockSupabaseClient.expectQuery({
        table: "workout_exercises",
        method: "from",
        args: ["workout_exercises"],
      });
      mockSupabaseClient.expectQuery({
        table: "workout_exercises",
        method: "update",
        args: [updates],
      });
      mockSupabaseClient.expectQuery({
        table: "workout_exercises",
        method: "eq",
        args: ["id", WE_ID],
      });
      mockSupabaseClient.expectQuery({
        table: "workout_exercises",
        method: "select",
        args: [],
      });
      mockSupabaseClient.expectQuery({
        table: "workout_exercises",
        method: "single",
        args: [],
      });

      expect(log.error).not.toHaveBeenCalled();
    });

    it("throws and logs on update error", async () => {
      const dbError = { code: "500", message: "fail" };
      mockSupabaseClient.setMockResponse(null, dbError);

      await expect(db.updateExercise(WE_ID, { notes: "x" })).rejects.toEqual(
        dbError,
      );

      expect(log.error).toHaveBeenCalledTimes(1);
      expect(log.error).toHaveBeenCalledWith(
        "Failed to update workout exercise",
        dbError,
      );
    });
  });

  // =========================================================================
  // addSet
  // =========================================================================

  describe("addSet", () => {
    const WE_ID = "we-1";

    it("inserts with set_number = max+1 forwarding all provided fields", async () => {
      queueSingleResponses([
        { data: { set_number: 2 }, error: null },
        { data: { id: "s-1" }, error: null },
      ]);

      const result = await db.addSet(WE_ID, {
        set_type: "warmup" as SetType,
        weight_kg: 40,
        reps: 10,
        duration_seconds: 30,
        distance_meters: 100,
        is_completed: true,
      });

      expect(result).toEqual({ id: "s-1" });

      // Two phases — assert full ordered queryLog to catch mutations in
      // either. Both phases share `.from("workout_sets")` so a mutation on
      // one unique arg is invisible to `expectQuery` alone.
      expect(mockSupabaseClient.queryLog).toEqual([
        // Phase 1: max(set_number)
        { table: "workout_sets", method: "from", args: ["workout_sets"] },
        { table: "workout_sets", method: "select", args: ["set_number"] },
        { table: "workout_sets", method: "eq", args: ["workout_exercise_id", WE_ID] },
        { table: "workout_sets", method: "order", args: ["set_number", { ascending: false }] },
        { table: "workout_sets", method: "limit", args: [1] },
        { table: "workout_sets", method: "single", args: [] },
        // Phase 2: insert with set_number = 2 + 1 = 3
        { table: "workout_sets", method: "from", args: ["workout_sets"] },
        {
          table: "workout_sets",
          method: "insert",
          args: [
            {
              workout_exercise_id: WE_ID,
              set_number: 3,
              set_type: "warmup",
              weight_kg: 40,
              reps: 10,
              duration_seconds: 30,
              distance_meters: 100,
              is_completed: true,
            },
          ],
        },
        { table: "workout_sets", method: "select", args: [] },
        { table: "workout_sets", method: "single", args: [] },
      ]);

      expect(log.error).not.toHaveBeenCalled();
    });

    it("defaults set_number to 1 and fields to normal/null/false on PGRST116 + no args", async () => {
      queueSingleResponses([
        { data: null, error: { code: "PGRST116" } },
        { data: { id: "s-1" }, error: null },
      ]);

      const result = await db.addSet(WE_ID, {});

      expect(result).toEqual({ id: "s-1" });
      mockSupabaseClient.expectQuery({
        table: "workout_sets",
        method: "insert",
        args: [
          {
            workout_exercise_id: WE_ID,
            set_number: 1,
            set_type: "normal",
            weight_kg: null,
            reps: null,
            duration_seconds: null,
            distance_meters: null,
            is_completed: false,
          },
        ],
      });
      expect(log.error).not.toHaveBeenCalled();
    });

    it("throws and logs on non-PGRST116 set-number lookup error; does NOT attempt insert", async () => {
      const dbError = { code: "500", message: "fail" };
      queueSingleResponses([{ data: null, error: dbError }]);

      await expect(db.addSet(WE_ID, {})).rejects.toEqual(dbError);

      const inserts = mockSupabaseClient.queryLog.filter(
        (e) => e.method === "insert",
      );
      expect(inserts).toHaveLength(0);

      expect(log.error).toHaveBeenCalledTimes(1);
      expect(log.error).toHaveBeenCalledWith(
        "Failed to get set number",
        dbError,
      );
    });

    it("throws and logs when insert fails after successful set-number lookup", async () => {
      const dbError = { code: "500", message: "nope" };
      queueSingleResponses([
        { data: null, error: { code: "PGRST116" } },
        { data: null, error: dbError },
      ]);

      await expect(db.addSet(WE_ID, {})).rejects.toEqual(dbError);

      expect(log.error).toHaveBeenCalledTimes(1);
      expect(log.error).toHaveBeenCalledWith("Failed to add set", dbError);
    });
  });

  // =========================================================================
  // updateSet
  // =========================================================================

  describe("updateSet", () => {
    const SET_ID = "s-1";

    it("updates fields and returns the updated row, asserting full chain", async () => {
      const row = { id: SET_ID, reps: 12 };
      mockSupabaseClient.setMockResponse(row);

      const updates = { reps: 12, is_completed: true };
      const result = await db.updateSet(SET_ID, updates);

      expect(result).toEqual(row);
      mockSupabaseClient.expectQuery({
        table: "workout_sets",
        method: "from",
        args: ["workout_sets"],
      });
      mockSupabaseClient.expectQuery({
        table: "workout_sets",
        method: "update",
        args: [updates],
      });
      mockSupabaseClient.expectQuery({
        table: "workout_sets",
        method: "eq",
        args: ["id", SET_ID],
      });
      mockSupabaseClient.expectQuery({
        table: "workout_sets",
        method: "select",
        args: [],
      });
      mockSupabaseClient.expectQuery({
        table: "workout_sets",
        method: "single",
        args: [],
      });

      expect(log.error).not.toHaveBeenCalled();
    });

    it("throws and logs on update error", async () => {
      const dbError = { code: "500", message: "fail" };
      mockSupabaseClient.setMockResponse(null, dbError);

      await expect(db.updateSet(SET_ID, { reps: 1 })).rejects.toEqual(dbError);

      expect(log.error).toHaveBeenCalledTimes(1);
      expect(log.error).toHaveBeenCalledWith("Failed to update set", dbError);
    });
  });

  // =========================================================================
  // deleteSet
  // =========================================================================

  describe("deleteSet", () => {
    const SET_ID = "s-1";

    it("deletes by id on workout_sets", async () => {
      mockSupabaseClient.setMockResponse(null);

      await db.deleteSet(SET_ID);

      mockSupabaseClient.expectQuery({
        table: "workout_sets",
        method: "from",
        args: ["workout_sets"],
      });
      mockSupabaseClient.expectQuery({
        table: "workout_sets",
        method: "delete",
        args: [],
      });
      mockSupabaseClient.expectQuery({
        table: "workout_sets",
        method: "eq",
        args: ["id", SET_ID],
      });

      expect(log.error).not.toHaveBeenCalled();
    });

    it("throws and logs on delete error", async () => {
      const dbError = { code: "500", message: "fail" };
      mockSupabaseClient.setMockResponse(null, dbError);

      await expect(db.deleteSet(SET_ID)).rejects.toEqual(dbError);

      expect(log.error).toHaveBeenCalledTimes(1);
      expect(log.error).toHaveBeenCalledWith("Failed to delete set", dbError);
    });
  });
});
