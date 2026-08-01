import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  HabitWrites,
  type CreatedHabit,
  type HabitCreationPersistence,
  type HabitCreationRecord,
} from "@/lib/habits/writes";

function createPersistence(): HabitCreationPersistence {
  return {
    countActiveHabits: vi.fn().mockResolvedValue(0),
    createHabit: vi.fn(async (record: HabitCreationRecord) => ({
      id: "habit-1",
      ...record,
      createdAt: "2026-08-01T12:00:00.000Z",
      updatedAt: "2026-08-01T12:00:00.000Z",
    }) satisfies CreatedHabit),
  };
}

describe("HabitWrites", () => {
  beforeEach(() => vi.clearAllMocks());

  it("normalizes a creation request into an owned active habit", async () => {
    const persistence = createPersistence();
    const writes = new HabitWrites(persistence);

    const outcome = await writes.create({
      userId: "trusted-user",
      name: "  Morning Run  ",
      description: "  Run five kilometers  ",
      categoryId: " category-1 ",
      frequency: { type: "custom", days: [5, 1, 5] },
    });

    expect(persistence.createHabit).toHaveBeenCalledWith({
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
  });

  it("returns a typed invalid outcome without calling persistence", async () => {
    const persistence = createPersistence();
    const writes = new HabitWrites(persistence);

    const outcome = await writes.create({
      userId: "trusted-user",
      name: "Valid name",
      frequency: { type: "times_per_week", count: 1 } as never,
    });

    expect(outcome).toEqual({
      type: "invalid",
      field: "frequency",
      message: "Frequency is invalid",
    });
    expect(persistence.countActiveHabits).not.toHaveBeenCalled();
    expect(persistence.createHabit).not.toHaveBeenCalled();
  });

  it("returns a typed limit outcome without creating another habit", async () => {
    const persistence = createPersistence();
    vi.mocked(persistence.countActiveHabits).mockResolvedValue(20);
    const writes = new HabitWrites(persistence);

    const outcome = await writes.create({
      userId: "trusted-user",
      name: "Another habit",
      frequency: { type: "daily" },
    });

    expect(outcome).toEqual({
      type: "limit-reached",
      activeCount: 20,
      limit: 20,
    });
    expect(persistence.createHabit).not.toHaveBeenCalled();
  });

  it("propagates unexpected persistence failures", async () => {
    const persistence = createPersistence();
    const persistenceError = new Error("habit storage unavailable");
    vi.mocked(persistence.countActiveHabits).mockRejectedValue(persistenceError);
    const writes = new HabitWrites(persistence);

    await expect(
      writes.create({
        userId: "trusted-user",
        name: "Another habit",
        frequency: { type: "daily" },
      }),
    ).rejects.toBe(persistenceError);
    expect(persistence.createHabit).not.toHaveBeenCalled();
  });

  it("does not turn an unexpected insert failure into an expected outcome", async () => {
    const persistence = createPersistence();
    const persistenceError = new Error("insert failed");
    vi.mocked(persistence.createHabit).mockRejectedValue(persistenceError);
    const writes = new HabitWrites(persistence);

    await expect(
      writes.create({
        userId: "trusted-user",
        name: "Another habit",
        frequency: { type: "daily" },
      }),
    ).rejects.toBe(persistenceError);
  });

  it("normalizes partial detail changes through the update seam", async () => {
    const updatedHabit = {
      id: "habit-1",
      userId: "trusted-user",
      name: "Evening Run",
      description: "Run after work",
      categoryId: "category-2",
      frequency: { type: "custom", days: [2, 4] as number[] },
      status: "active" as const,
      currentStreak: 4,
      bestStreak: 12,
      pausedAt: null,
      graduatedAt: null,
      graduatedStreak: null,
      nudgeDismissedAt: null,
      createdAt: "2026-08-01T12:00:00.000Z",
      updatedAt: "2026-08-01T12:05:00.000Z",
    };
    const updateHabit = vi.fn().mockResolvedValue(updatedHabit);
    const writes = new HabitWrites({ updateHabit });

    const outcome = await writes.update({
      userId: " trusted-user ",
      habitId: " habit-1 ",
      name: "  Evening Run  ",
      description: "  Run after work  ",
      categoryId: " category-2 ",
      frequency: { type: "custom", days: [4, 2, 4] },
    });

    expect(updateHabit).toHaveBeenCalledWith("habit-1", "trusted-user", {
      name: "Evening Run",
      description: "Run after work",
      categoryId: "category-2",
      frequency: { type: "custom", days: [2, 4] },
    });
    expect(outcome).toEqual({ type: "updated", habit: updatedHabit });
  });

  it.each([
    ["missing", null],
    ["cross-owner", null],
  ])("returns the same not-found outcome for %s habits", async (_case, result) => {
    const updateHabit = vi.fn().mockResolvedValue(result);
    const writes = new HabitWrites({ updateHabit });

    const outcome = await writes.update({
      userId: "trusted-user",
      habitId: "habit-1",
      name: "Evening Run",
    });

    expect(outcome).toEqual({ type: "not-found" });
    expect(updateHabit).toHaveBeenCalledWith("habit-1", "trusted-user", {
      name: "Evening Run",
    });
  });

  it("returns a conflict for an empty detail change without writing", async () => {
    const updateHabit = vi.fn();
    const writes = new HabitWrites({ updateHabit });

    const outcome = await writes.update({
      userId: "trusted-user",
      habitId: "habit-1",
    });

    expect(outcome).toEqual({ type: "conflict" });
    expect(updateHabit).not.toHaveBeenCalled();
  });

  it.each([
    ["name", { name: "   " }],
    ["frequency", { frequency: { type: "times_per_week", count: 1 } }],
    ["description", { description: "a".repeat(501) }],
  ])("returns an invalid outcome for an invalid %s change", async (field, changes) => {
    const updateHabit = vi.fn();
    const writes = new HabitWrites({ updateHabit });

    const outcome = await writes.update({
      userId: "trusted-user",
      habitId: "habit-1",
      ...changes,
    } as never);

    expect(outcome.type).toBe("invalid");
    expect(outcome).toHaveProperty("field", field);
    expect(updateHabit).not.toHaveBeenCalled();
  });

  it("propagates an unexpected update failure", async () => {
    const persistenceError = new Error("update failed");
    const updateHabit = vi.fn().mockRejectedValue(persistenceError);
    const writes = new HabitWrites({ updateHabit });

    await expect(
      writes.update({
        userId: "trusted-user",
        habitId: "habit-1",
        name: "Evening Run",
      }),
    ).rejects.toBe(persistenceError);
  });
});
