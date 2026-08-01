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
});
