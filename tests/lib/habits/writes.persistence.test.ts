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
