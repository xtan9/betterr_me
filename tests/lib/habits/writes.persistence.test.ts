import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createHabitWrites } from "@/lib/habits/writes";
import type { Habit } from "@/lib/db/types";
import { mockSupabaseClient } from "../../setup";
import {
  queueThenResponses,
  restoreMockSupabaseThen,
} from "../../helpers/mock-supabase";

const storedHabit: Habit = {
  id: "habit-1",
  user_id: "trusted-user",
  name: "Morning Run",
  description: "Run five kilometers",
  category_id: "category-1",
  frequency: { type: "custom", days: [1, 5] },
  status: "active",
  current_streak: 0,
  best_streak: 0,
  paused_at: null,
  graduated_at: null,
  graduated_streak: null,
  nudge_dismissed_at: null,
  created_at: "2026-08-01T12:00:00.000Z",
  updated_at: "2026-08-01T12:00:00.000Z",
};

function queueSingleResponses(
  responses: Array<{ data: unknown; error: unknown }>,
): void {
  for (const response of responses) {
    mockSupabaseClient.single.mockImplementationOnce(() => {
      mockSupabaseClient.queryLog.push({
        table: "habits",
        method: "single",
        args: [],
      });
      return Promise.resolve(response);
    });
  }
}

describe("createHabitWrites persistence adapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabaseClient.setMockResponse(storedHabit);
  });

  afterEach(() => restoreMockSupabaseThen());

  it("counts only the trusted user's active and paused habits and maps the created row", async () => {
    queueThenResponses([{ count: 2, data: null, error: null }]);
    const writes = createHabitWrites(
      mockSupabaseClient as unknown as SupabaseClient,
    );

    const outcome = await writes.create({
      userId: "trusted-user",
      name: "  Morning Run  ",
      description: "Run five kilometers",
      categoryId: "category-1",
      frequency: { type: "custom", days: [5, 1, 5] },
    });

    expect(outcome).toEqual({
      type: "created",
      habit: {
        id: "habit-1",
        userId: "trusted-user",
        name: "Morning Run",
        description: "Run five kilometers",
        categoryId: "category-1",
        frequency: { type: "custom", days: [1, 5] },
        status: "active",
        currentStreak: 0,
        bestStreak: 0,
        pausedAt: null,
        graduatedAt: null,
        graduatedStreak: null,
        nudgeDismissedAt: null,
        createdAt: "2026-08-01T12:00:00.000Z",
        updatedAt: "2026-08-01T12:00:00.000Z",
      },
    });
    expect(mockSupabaseClient.queryLog).toEqual([
      { table: "habits", method: "from", args: ["habits"] },
      {
        table: "habits",
        method: "select",
        args: ["*", { count: "exact", head: true }],
      },
      { table: "habits", method: "eq", args: ["user_id", "trusted-user"] },
      {
        table: "habits",
        method: "in",
        args: ["status", ["active", "paused"]],
      },
      { table: "habits", method: "from", args: ["habits"] },
      {
        table: "habits",
        method: "insert",
        args: [
          {
            user_id: "trusted-user",
            name: "Morning Run",
            description: "Run five kilometers",
            category_id: "category-1",
            frequency: { type: "custom", days: [1, 5] },
            status: "active",
            current_streak: 0,
            best_streak: 0,
            paused_at: null,
          },
        ],
      },
      { table: "habits", method: "select", args: [] },
      { table: "habits", method: "single", args: [] },
    ]);
  });

  it("propagates an unexpected count failure", async () => {
    const persistenceError = new Error("count failed");
    queueThenResponses([{ data: null, error: persistenceError }]);
    const writes = createHabitWrites(
      mockSupabaseClient as unknown as SupabaseClient,
    );

    await expect(
      writes.create({
        userId: "trusted-user",
        name: "Morning Run",
        frequency: { type: "daily" },
      }),
    ).rejects.toBe(persistenceError);
  });

  it("propagates an unexpected insert failure", async () => {
    const persistenceError = new Error("insert failed");
    queueThenResponses([{ count: 0, data: null, error: null }]);
    mockSupabaseClient.setMockResponse(null, persistenceError);
    const writes = createHabitWrites(
      mockSupabaseClient as unknown as SupabaseClient,
    );

    await expect(
      writes.create({
        userId: "trusted-user",
        name: "Morning Run",
        frequency: { type: "daily" },
      }),
    ).rejects.toBe(persistenceError);
  });

  it("updates only normalized detail fields with owner scoping", async () => {
    const writes = createHabitWrites(
      mockSupabaseClient as unknown as SupabaseClient,
    );

    const outcome = await writes.update({
      userId: "trusted-user",
      habitId: "habit-1",
      name: "  Evening Run  ",
      description: "  Run after work  ",
      categoryId: " category-2 ",
      frequency: { type: "custom", days: [4, 2, 4] },
    });

    expect(outcome).toMatchObject({ type: "updated" });
    expect(outcome).toEqual({
      type: "updated",
      habit: {
        id: "habit-1",
        userId: "trusted-user",
        name: "Morning Run",
        description: "Run five kilometers",
        categoryId: "category-1",
        frequency: { type: "custom", days: [1, 5] },
        status: "active",
        currentStreak: 0,
        bestStreak: 0,
        pausedAt: null,
        graduatedAt: null,
        graduatedStreak: null,
        nudgeDismissedAt: null,
        createdAt: "2026-08-01T12:00:00.000Z",
        updatedAt: "2026-08-01T12:00:00.000Z",
      },
    });
    expect(mockSupabaseClient.queryLog).toEqual([
      { table: "habits", method: "from", args: ["habits"] },
      {
        table: "habits",
        method: "update",
        args: [
          {
            name: "Evening Run",
            description: "Run after work",
            category_id: "category-2",
            frequency: { type: "custom", days: [2, 4] },
          },
        ],
      },
      { table: "habits", method: "eq", args: ["id", "habit-1"] },
      { table: "habits", method: "eq", args: ["user_id", "trusted-user"] },
      { table: "habits", method: "select", args: [] },
      { table: "habits", method: "single", args: [] },
    ]);
  });

  describe("graduate", () => {
    const graduatedAt = "2026-08-01T12:00:00.000Z";

    it("uses one atomic RPC and maps a graduated habit", async () => {
      const graduatedHabit: Habit = {
        ...storedHabit,
        status: "formed",
        current_streak: 18,
        graduated_at: graduatedAt,
        graduated_streak: 18,
        nudge_dismissed_at: null,
      };
      mockSupabaseClient.setMockResponse({
        type: "graduated",
        habit: graduatedHabit,
      });
      vi.useFakeTimers();
      vi.setSystemTime(new Date(graduatedAt));
      try {
        const writes = createHabitWrites(
          mockSupabaseClient as unknown as SupabaseClient,
        );

        await expect(
          writes.graduate({ userId: "trusted-user", habitId: "habit-1" }),
        ).resolves.toEqual({
          type: "graduated",
          habit: {
            id: "habit-1",
            userId: "trusted-user",
            name: "Morning Run",
            description: "Run five kilometers",
            categoryId: "category-1",
            frequency: { type: "custom", days: [1, 5] },
            status: "formed",
            currentStreak: 18,
            bestStreak: 0,
            pausedAt: null,
            graduatedAt,
            graduatedStreak: 18,
            nudgeDismissedAt: null,
            createdAt: storedHabit.created_at,
            updatedAt: storedHabit.updated_at,
          },
        });
        expect(mockSupabaseClient.queryLog).toEqual([
          {
            table: null,
            method: "rpc",
            args: [
              "graduate_habit_atomically",
              {
                p_habit_id: "habit-1",
                p_user_id: "trusted-user",
                p_graduated_at: graduatedAt,
              },
            ],
          },
        ]);
      } finally {
        vi.useRealTimers();
      }
    });

    it.each([
      [{ type: "not-found" }, { type: "not-found" }],
      [
        { type: "invalid-transition", current_status: "paused" },
        {
          type: "invalid-transition",
          action: "graduate",
          currentStatus: "paused",
          message: "Habit cannot be graduated from paused state",
        },
      ],
    ] as const)("maps the %s database outcome", async (databaseOutcome, outcome) => {
      mockSupabaseClient.setMockResponse(databaseOutcome);
      const writes = createHabitWrites(
        mockSupabaseClient as unknown as SupabaseClient,
      );

      await expect(
        writes.graduate({ userId: "trusted-user", habitId: "habit-1" }),
      ).resolves.toEqual(outcome);
    });

    it("maps an already-formed database outcome with the existing habit", async () => {
      mockSupabaseClient.setMockResponse({
        type: "already-formed",
        habit: { ...storedHabit, status: "formed" },
      });
      const writes = createHabitWrites(
        mockSupabaseClient as unknown as SupabaseClient,
      );

      await expect(
        writes.graduate({ userId: "trusted-user", habitId: "habit-1" }),
      ).resolves.toMatchObject({
        type: "already-formed",
        habit: { id: "habit-1", status: "formed" },
      });
    });

    it("propagates an atomic RPC failure without attempting compensating writes", async () => {
      const persistenceError = new Error("history insert failed");
      mockSupabaseClient.setMockResponse(null, persistenceError);
      const writes = createHabitWrites(
        mockSupabaseClient as unknown as SupabaseClient,
      );

      await expect(
        writes.graduate({ userId: "trusted-user", habitId: "habit-1" }),
      ).rejects.toBe(persistenceError);
      expect(mockSupabaseClient.queryLog).toHaveLength(1);
      expect(mockSupabaseClient.queryLog[0]?.method).toBe("rpc");
    });

    it("rejects malformed database outcomes", async () => {
      mockSupabaseClient.setMockResponse({ type: "unexpected" });
      const writes = createHabitWrites(
        mockSupabaseClient as unknown as SupabaseClient,
      );

      await expect(
        writes.graduate({ userId: "trusted-user", habitId: "habit-1" }),
      ).rejects.toThrow("Invalid graduation outcome returned by the database");
    });
  });

  describe("reactivate", () => {
    const reactivatedAt = "2026-08-01T12:00:00.000Z";

    it("uses the core RPC, maps the reactivated habit, and reacts to history after it", async () => {
      const reactivatedHabit: Habit = {
        ...storedHabit,
        status: "active",
        current_streak: 0,
        best_streak: 120,
        graduated_at: null,
        graduated_streak: null,
        nudge_dismissed_at: null,
      };
      mockSupabaseClient.setMockResponse({
        type: "reactivated",
        habit: reactivatedHabit,
      });
      mockSupabaseClient.maybeSingle.mockResolvedValueOnce({
        data: { id: "graduation-1" },
        error: null,
      });
      vi.useFakeTimers();
      vi.setSystemTime(new Date(reactivatedAt));
      try {
        const writes = createHabitWrites(
          mockSupabaseClient as unknown as SupabaseClient,
        );

        await expect(
          writes.reactivate({ userId: "trusted-user", habitId: "habit-1" }),
        ).resolves.toEqual({
          type: "reactivated",
          habit: {
            id: "habit-1",
            userId: "trusted-user",
            name: "Morning Run",
            description: "Run five kilometers",
            categoryId: "category-1",
            frequency: { type: "custom", days: [1, 5] },
            status: "active",
            currentStreak: 0,
            bestStreak: 120,
            pausedAt: null,
            graduatedAt: null,
            graduatedStreak: null,
            nudgeDismissedAt: null,
            createdAt: storedHabit.created_at,
            updatedAt: storedHabit.updated_at,
          },
        });
        expect(mockSupabaseClient.queryLog[0]).toEqual({
          table: null,
          method: "rpc",
          args: [
            "reactivate_habit_atomically",
            {
              p_habit_id: "habit-1",
              p_user_id: "trusted-user",
            },
          ],
        });
        expect(mockSupabaseClient.queryLog.findIndex((entry) => entry.method === "rpc"))
          .toBeLessThan(
            mockSupabaseClient.queryLog.findIndex(
              (entry) => entry.table === "habit_graduations" && entry.method === "from",
            ),
          );
        expect(mockSupabaseClient.queryLog).toContainEqual({
          table: "habit_graduations",
          method: "update",
          args: [{ reactivated_at: reactivatedAt }],
        });
      } finally {
        vi.useRealTimers();
      }
    });

    it.each([
      [{ type: "already-active", habit: storedHabit }, { type: "already-active" }],
      [{ type: "not-found" }, { type: "not-found" }],
      [
        { type: "invalid-transition", current_status: "paused" },
        {
          type: "invalid-transition",
          action: "reactivate",
          currentStatus: "paused",
          message: "Habit cannot be reactivated from paused state",
        },
      ],
    ] as const)("maps the %s database outcome without a history reaction", async (databaseOutcome, expected) => {
      mockSupabaseClient.setMockResponse(databaseOutcome);
      const writes = createHabitWrites(
        mockSupabaseClient as unknown as SupabaseClient,
      );

      await expect(
        writes.reactivate({ userId: "trusted-user", habitId: "habit-1" }),
      ).resolves.toMatchObject(expected);
      expect(mockSupabaseClient.maybeSingle).not.toHaveBeenCalled();
    });

    it("propagates a core RPC failure without attempting history", async () => {
      const persistenceError = new Error("reactivation transaction failed");
      mockSupabaseClient.setMockResponse(null, persistenceError);
      const writes = createHabitWrites(
        mockSupabaseClient as unknown as SupabaseClient,
      );

      await expect(
        writes.reactivate({ userId: "trusted-user", habitId: "habit-1" }),
      ).rejects.toBe(persistenceError);
      expect(mockSupabaseClient.queryLog).toHaveLength(1);
      expect(mockSupabaseClient.queryLog[0]?.method).toBe("rpc");
      expect(mockSupabaseClient.maybeSingle).not.toHaveBeenCalled();
    });

    it("preserves reactivation when the post-commit history reaction fails", async () => {
      const reactivatedHabit: Habit = {
        ...storedHabit,
        current_streak: 0,
        best_streak: 120,
        graduated_at: null,
        graduated_streak: null,
        nudge_dismissed_at: null,
      };
      mockSupabaseClient.setMockResponse({
        type: "reactivated",
        habit: reactivatedHabit,
      });
      mockSupabaseClient.maybeSingle.mockResolvedValueOnce({
        data: null,
        error: new Error("history lookup failed"),
      });
      const writes = createHabitWrites(
        mockSupabaseClient as unknown as SupabaseClient,
      );

      await expect(
        writes.reactivate({ userId: "trusted-user", habitId: "habit-1" }),
      ).resolves.toMatchObject({ type: "reactivated" });
      expect(mockSupabaseClient.queryLog[0]?.method).toBe("rpc");
      expect(mockSupabaseClient.queryLog.some((entry) => entry.table === "habit_graduations")).toBe(true);
    });

    it("rejects malformed database outcomes", async () => {
      mockSupabaseClient.setMockResponse({ type: "unexpected" });
      const writes = createHabitWrites(
        mockSupabaseClient as unknown as SupabaseClient,
      );

      await expect(
        writes.reactivate({ userId: "trusted-user", habitId: "habit-1" }),
      ).rejects.toThrow("Invalid reactivation outcome returned by the database");
    });
  });

  describe("delete", () => {
    it("uses one atomic owner-scoped RPC and maps a deleted outcome", async () => {
      mockSupabaseClient.setMockResponse({ type: "deleted" });
      const writes = createHabitWrites(
        mockSupabaseClient as unknown as SupabaseClient,
      );

      await expect(
        writes.delete({ userId: "trusted-user", habitId: "habit-1" }),
      ).resolves.toEqual({ type: "deleted" });
      expect(mockSupabaseClient.queryLog).toEqual([
        {
          table: null,
          method: "rpc",
          args: [
            "delete_habit_atomically",
            {
              p_habit_id: "habit-1",
              p_user_id: "trusted-user",
            },
          ],
        },
      ]);
    });

    it.each(["missing", "cross-owner", "repeated"] as const)(
      "maps the same not-found database outcome for %s requests without other persistence calls",
      async () => {
        mockSupabaseClient.setMockResponse({ type: "not-found" });
        const writes = createHabitWrites(
          mockSupabaseClient as unknown as SupabaseClient,
        );

        await expect(
          writes.delete({ userId: "trusted-user", habitId: "habit-1" }),
        ).resolves.toEqual({ type: "not-found" });
        expect(mockSupabaseClient.queryLog).toHaveLength(1);
        expect(mockSupabaseClient.queryLog[0]?.method).toBe("rpc");
      },
    );

    it("propagates an atomic RPC failure without attempting compensating writes", async () => {
      const persistenceError = new Error("deletion transaction failed");
      mockSupabaseClient.setMockResponse(null, persistenceError);
      const writes = createHabitWrites(
        mockSupabaseClient as unknown as SupabaseClient,
      );

      await expect(
        writes.delete({ userId: "trusted-user", habitId: "habit-1" }),
      ).rejects.toBe(persistenceError);
      expect(mockSupabaseClient.queryLog).toHaveLength(1);
      expect(mockSupabaseClient.queryLog[0]?.method).toBe("rpc");
    });

    it("rejects malformed database outcomes", async () => {
      mockSupabaseClient.setMockResponse({ type: "unexpected" });
      const writes = createHabitWrites(
        mockSupabaseClient as unknown as SupabaseClient,
      );

      await expect(
        writes.delete({ userId: "trusted-user", habitId: "habit-1" }),
      ).rejects.toThrow("Invalid habit deletion outcome returned by the database");
    });
  });

  it("persists a pause through owner-scoped lifecycle reads and updates", async () => {
    const fixedNow = new Date("2026-08-01T12:00:00.000Z");
    vi.useFakeTimers();
    vi.setSystemTime(fixedNow);
    try {
      const pausedHabit: Habit = {
        ...storedHabit,
        status: "paused",
        paused_at: fixedNow.toISOString(),
      };
      queueSingleResponses([
        { data: storedHabit, error: null },
        { data: pausedHabit, error: null },
      ]);
      const writes = createHabitWrites(
        mockSupabaseClient as unknown as SupabaseClient,
      );

      const outcome = await writes.pause({
        userId: "trusted-user",
        habitId: "habit-1",
      });

      expect(outcome).toMatchObject({
        type: "transitioned",
        habit: {
          id: "habit-1",
          userId: "trusted-user",
          status: "paused",
          pausedAt: fixedNow.toISOString(),
        },
      });
      expect(mockSupabaseClient.queryLog).toEqual([
        { table: "habits", method: "from", args: ["habits"] },
        { table: "habits", method: "select", args: ["*"] },
        { table: "habits", method: "eq", args: ["id", "habit-1"] },
        { table: "habits", method: "eq", args: ["user_id", "trusted-user"] },
        { table: "habits", method: "single", args: [] },
        { table: "habits", method: "from", args: ["habits"] },
        {
          table: "habits",
          method: "update",
          args: [{ status: "paused", paused_at: fixedNow.toISOString() }],
        },
        { table: "habits", method: "eq", args: ["id", "habit-1"] },
        { table: "habits", method: "eq", args: ["user_id", "trusted-user"] },
        { table: "habits", method: "select", args: [] },
        { table: "habits", method: "single", args: [] },
      ]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("persists a resume by clearing the pause timestamp", async () => {
    const pausedHabit: Habit = {
      ...storedHabit,
      status: "paused",
      paused_at: "2026-07-31T12:00:00.000Z",
    };
    const activeHabit: Habit = {
      ...storedHabit,
      status: "active",
      paused_at: null,
    };
    queueSingleResponses([
      { data: pausedHabit, error: null },
      { data: activeHabit, error: null },
    ]);
    const writes = createHabitWrites(
      mockSupabaseClient as unknown as SupabaseClient,
    );

    const outcome = await writes.resume({
      userId: "trusted-user",
      habitId: "habit-1",
    });

    expect(outcome).toMatchObject({
      type: "transitioned",
      habit: {
        id: "habit-1",
        userId: "trusted-user",
        status: "active",
        pausedAt: null,
      },
    });
    expect(mockSupabaseClient.queryLog).toContainEqual({
      table: "habits",
      method: "update",
      args: [{ status: "active", paused_at: null }],
    });
    expect(mockSupabaseClient.queryLog).toContainEqual({
      table: "habits",
      method: "eq",
      args: ["user_id", "trusted-user"],
    });
  });

  it("maps a lifecycle update that lost its owner-scoped row to not-found", async () => {
    queueSingleResponses([
      { data: storedHabit, error: null },
      { data: null, error: { code: "PGRST116", message: "No rows found" } },
    ]);
    const writes = createHabitWrites(
      mockSupabaseClient as unknown as SupabaseClient,
    );

    const outcome = await writes.pause({
      userId: "trusted-user",
      habitId: "habit-1",
    });

    expect(outcome).toEqual({ type: "not-found" });
  });

  it("maps a missing or cross-owner lifecycle read to not-found", async () => {
    queueSingleResponses([
      { data: null, error: { code: "PGRST116", message: "No rows found" } },
    ]);
    const writes = createHabitWrites(
      mockSupabaseClient as unknown as SupabaseClient,
    );

    const outcome = await writes.resume({
      userId: "other-user",
      habitId: "habit-1",
    });

    expect(outcome).toEqual({ type: "not-found" });
    expect(mockSupabaseClient.queryLog).toContainEqual({
      table: "habits",
      method: "eq",
      args: ["user_id", "other-user"],
    });
    expect(mockSupabaseClient.queryLog).not.toContainEqual({
      table: "habits",
      method: "update",
      args: expect.anything(),
    });
  });

  it("propagates an unexpected lifecycle update failure", async () => {
    const persistenceError = new Error("lifecycle update failed");
    queueSingleResponses([{ data: storedHabit, error: null }]);
    mockSupabaseClient.setMockResponse(null, persistenceError);
    const writes = createHabitWrites(
      mockSupabaseClient as unknown as SupabaseClient,
    );

    await expect(
      writes.pause({ userId: "trusted-user", habitId: "habit-1" }),
    ).rejects.toBe(persistenceError);
  });

  it("maps a scoped missing row to not-found without disclosing ownership", async () => {
    mockSupabaseClient.setMockResponse(null, {
      code: "PGRST116",
      message: "No rows found",
    });
    const writes = createHabitWrites(
      mockSupabaseClient as unknown as SupabaseClient,
    );

    const outcome = await writes.update({
      userId: "other-user",
      habitId: "habit-1",
      name: "Private name",
    });

    expect(outcome).toEqual({ type: "not-found" });
    expect(mockSupabaseClient.queryLog).toContainEqual({
      table: "habits",
      method: "eq",
      args: ["user_id", "other-user"],
    });
  });

  it("propagates an unexpected update failure", async () => {
    const persistenceError = new Error("update failed");
    mockSupabaseClient.setMockResponse(null, persistenceError);
    const writes = createHabitWrites(
      mockSupabaseClient as unknown as SupabaseClient,
    );

    await expect(
      writes.update({
        userId: "trusted-user",
        habitId: "habit-1",
        name: "Evening Run",
      }),
    ).rejects.toBe(persistenceError);
  });
});
