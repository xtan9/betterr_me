import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { HabitGraduationsDB } from "@/lib/db/habit-graduations";
import { mockSupabaseClient } from "../../setup";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { HabitGraduation, HabitGraduationInsert } from "@/lib/db/types";

// Silence the log.warn that markReactivated fires when no open graduation row
// exists. We still assert on call args for the warn-fires path.
vi.mock("@/lib/logger", () => ({
  log: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
import { log } from "@/lib/logger";

// Queue an ordered sequence of thenable responses for awaited query builders
// (destructured `{ data, error }`). Monkey-patches the prototype `then`; the
// top-level afterEach restores it between tests.
function queueThenResponses(
  responses: Array<{ data?: unknown; error?: unknown }>,
) {
  const origThen = mockSupabaseClient.then.bind(mockSupabaseClient);
  mockSupabaseClient.then = function (onFulfilled: unknown, onRejected?: unknown) {
    const next = responses.shift();
    if (next) {
      return Promise.resolve(next).then(
        onFulfilled as (value: unknown) => unknown,
        onRejected as ((reason: unknown) => unknown) | undefined,
      );
    }
    return origThen(
      onFulfilled as (value: unknown) => unknown,
      onRejected as ((reason: unknown) => unknown) | undefined,
    );
  };
}

const HABIT_ID = "habit-abc";
const USER_ID = "user-1";

function makeGraduation(over: Partial<HabitGraduation> = {}): HabitGraduation {
  return {
    id: "grad-1",
    habit_id: HABIT_ID,
    user_id: USER_ID,
    graduated_at: "2026-04-01T00:00:00Z",
    reactivated_at: null,
    graduated_streak: 30,
    created_at: "2026-04-01T00:00:00Z",
    ...over,
  };
}

describe("HabitGraduationsDB", () => {
  let db: HabitGraduationsDB;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabaseClient.setMockResponse(null);
    db = new HabitGraduationsDB(mockSupabaseClient as unknown as SupabaseClient);
  });

  afterEach(() => {
    delete (mockSupabaseClient as { then?: unknown }).then;
  });

  // ─── insertGraduation ─────────────────────────────────────────────────────
  describe("insertGraduation", () => {
    const insertRow: HabitGraduationInsert = {
      habit_id: HABIT_ID,
      user_id: USER_ID,
      graduated_at: "2026-04-01T00:00:00Z",
      graduated_streak: 30,
    };

    it("inserts a graduation row and returns the inserted record", async () => {
      const expected = makeGraduation();
      mockSupabaseClient.setMockResponse(expected);

      const result = await db.insertGraduation(insertRow);

      expect(result).toEqual(expected);

      // Full chain: from → insert(row) → select() → single()
      mockSupabaseClient.expectQuery({
        table: "habit_graduations",
        method: "from",
        args: ["habit_graduations"],
      });
      mockSupabaseClient.expectQuery({
        table: "habit_graduations",
        method: "insert",
        args: [insertRow],
      });
      mockSupabaseClient.expectQuery({
        table: "habit_graduations",
        method: "select",
        args: [],
      });
      mockSupabaseClient.expectQuery({
        table: "habit_graduations",
        method: "single",
        args: [],
      });
    });

    it("throws when the insert fails", async () => {
      mockSupabaseClient.setMockResponse(null, new Error("duplicate key"));

      await expect(db.insertGraduation(insertRow)).rejects.toThrow(
        "duplicate key",
      );
    });
  });

  // ─── markReactivated ──────────────────────────────────────────────────────
  describe("markReactivated", () => {
    it("finds the most-recent open graduation and stamps reactivated_at", async () => {
      // Freeze time so we can assert on the exact ISO timestamp written.
      const fixedNow = new Date("2026-04-17T10:00:00.000Z");
      vi.useFakeTimers();
      vi.setSystemTime(fixedNow);
      try {
        // SELECT: setMockResponse feeds maybeSingle() → { data, error: null }.
        // UPDATE: the .eq() terminal awaits the thenable, which also reads
        // mockData/mockError — since error is null, UPDATE succeeds.
        mockSupabaseClient.setMockResponse({ id: "grad-open" });

        await db.markReactivated(HABIT_ID, USER_ID);

        // Full ordered queryLog assertion. Using toEqual on the whole log
        // (rather than individual expectQuery calls) catches mutations to
        // ANY single arg — critical here because SELECT and UPDATE phases
        // both call `.from("habit_graduations")` and `.eq("user_id", userId)`,
        // so a mutation on just one copy would still satisfy a non-positional
        // `expectQuery` that finds the other, unmutated copy.
        expect(mockSupabaseClient.queryLog).toEqual([
          // SELECT
          { table: "habit_graduations", method: "from", args: ["habit_graduations"] },
          { table: "habit_graduations", method: "select", args: ["id"] },
          { table: "habit_graduations", method: "eq", args: ["habit_id", HABIT_ID] },
          { table: "habit_graduations", method: "eq", args: ["user_id", USER_ID] },
          { table: "habit_graduations", method: "is", args: ["reactivated_at", null] },
          { table: "habit_graduations", method: "order", args: ["graduated_at", { ascending: false }] },
          { table: "habit_graduations", method: "limit", args: [1] },
          { table: "habit_graduations", method: "maybeSingle", args: [] },
          // UPDATE
          { table: "habit_graduations", method: "from", args: ["habit_graduations"] },
          { table: "habit_graduations", method: "update", args: [{ reactivated_at: fixedNow.toISOString() }] },
          { table: "habit_graduations", method: "eq", args: ["id", "grad-open"] },
          { table: "habit_graduations", method: "eq", args: ["user_id", USER_ID] },
        ]);

        // Warn must NOT fire on the happy path.
        expect(log.warn).not.toHaveBeenCalled();
      } finally {
        vi.useRealTimers();
      }
    });

    it("logs a warning and returns early when no open graduation row exists", async () => {
      // SELECT returns null data → source logs warn and returns without UPDATE.
      mockSupabaseClient.setMockResponse(null);

      await db.markReactivated(HABIT_ID, USER_ID);

      expect(log.warn).toHaveBeenCalledTimes(1);
      expect(log.warn).toHaveBeenCalledWith(
        "[habits] markReactivated: no open graduation row found",
        { habitId: HABIT_ID, userId: USER_ID },
      );

      // Crucially: UPDATE was NOT called. The `update` method logs into
      // queryLog on every call, so checking for its absence is the assertion.
      const updateCalls = mockSupabaseClient.queryLog.filter(
        (e) => e.method === "update",
      );
      expect(updateCalls).toHaveLength(0);
    });

    it("throws when the SELECT query errors", async () => {
      mockSupabaseClient.setMockResponse(null, new Error("db unreachable"));

      await expect(db.markReactivated(HABIT_ID, USER_ID)).rejects.toThrow(
        "db unreachable",
      );

      // Should never attempt the UPDATE after a SELECT error.
      const updateCalls = mockSupabaseClient.queryLog.filter(
        (e) => e.method === "update",
      );
      expect(updateCalls).toHaveLength(0);
      // And no spurious warn.
      expect(log.warn).not.toHaveBeenCalled();
    });

    it("throws when the UPDATE query errors", async () => {
      // SELECT succeeds — mockData has the row. UPDATE's thenable is
      // overridden via queueThenResponses to return an error.
      mockSupabaseClient.setMockResponse({ id: "grad-open" });
      queueThenResponses([
        { data: null, error: new Error("write rejected") },
      ]);

      await expect(db.markReactivated(HABIT_ID, USER_ID)).rejects.toThrow(
        "write rejected",
      );
    });
  });

  // ─── getForHabit ──────────────────────────────────────────────────────────
  describe("getForHabit", () => {
    it("returns graduations ordered by graduated_at descending", async () => {
      const rows = [
        makeGraduation({ id: "g-2", graduated_at: "2026-04-10T00:00:00Z" }),
        makeGraduation({ id: "g-1", graduated_at: "2026-04-01T00:00:00Z" }),
      ];
      queueThenResponses([{ data: rows, error: null }]);

      const result = await db.getForHabit(HABIT_ID, USER_ID);

      expect(result).toEqual(rows);

      mockSupabaseClient.expectQuery({
        table: "habit_graduations",
        method: "from",
        args: ["habit_graduations"],
      });
      mockSupabaseClient.expectQuery({
        method: "select",
        args: ["*"],
      });
      mockSupabaseClient.expectQuery({
        method: "eq",
        args: ["habit_id", HABIT_ID],
      });
      mockSupabaseClient.expectQuery({
        method: "eq",
        args: ["user_id", USER_ID],
      });
      mockSupabaseClient.expectQuery({
        method: "order",
        args: ["graduated_at", { ascending: false }],
      });
    });

    it("returns an empty array when data is null (row not found)", async () => {
      queueThenResponses([{ data: null, error: null }]);

      const result = await db.getForHabit(HABIT_ID, USER_ID);

      expect(result).toEqual([]);
    });

    it("throws when the query errors", async () => {
      queueThenResponses([
        { data: null, error: new Error("select failed") },
      ]);

      await expect(db.getForHabit(HABIT_ID, USER_ID)).rejects.toThrow(
        "select failed",
      );
    });
  });
});
