import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  HabitWrites,
  type CreatedHabit,
  type HabitCreationPersistence,
  type HabitCreationRecord,
} from "@/lib/habits/writes";
import { log } from "@/lib/logger";

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

  it("pauses an active habit with a clock-controlled timestamp", async () => {
    const activeHabit = {
      id: "habit-1",
      userId: "trusted-user",
      status: "active",
      pausedAt: null,
    };
    const pausedHabit = {
      ...activeHabit,
      status: "paused",
      pausedAt: "2026-08-01T12:00:00.000Z",
    };
    const getHabit = vi.fn().mockResolvedValue(activeHabit);
    const updateHabitLifecycle = vi.fn().mockResolvedValue(pausedHabit);
    const writes = new HabitWrites({
      getHabit,
      updateHabitLifecycle,
    }, () => new Date("2026-08-01T12:00:00.000Z"));

    const outcome = await writes.pause({
      userId: "trusted-user",
      habitId: "habit-1",
    });

    expect(outcome).toEqual({ type: "transitioned", habit: pausedHabit });
    expect(getHabit).toHaveBeenCalledWith("habit-1", "trusted-user");
    expect(updateHabitLifecycle).toHaveBeenCalledWith(
      "habit-1",
      "trusted-user",
      {
        status: "paused",
        pausedAt: "2026-08-01T12:00:00.000Z",
      },
    );
  });

  it("returns already-applied for a repeated pause without rewriting its timestamp", async () => {
    const pausedHabit = {
      id: "habit-1",
      userId: "trusted-user",
      status: "paused",
      pausedAt: "2026-07-31T12:00:00.000Z",
    };
    const updateHabitLifecycle = vi.fn();
    const writes = new HabitWrites({
      getHabit: vi.fn().mockResolvedValue(pausedHabit),
      updateHabitLifecycle,
    });

    const outcome = await writes.pause({
      userId: "trusted-user",
      habitId: "habit-1",
    });

    expect(outcome).toEqual({ type: "already-applied", habit: pausedHabit });
    expect(updateHabitLifecycle).not.toHaveBeenCalled();
  });

  it("resumes a paused habit and clears its pause timestamp", async () => {
    const pausedHabit = {
      id: "habit-1",
      userId: "trusted-user",
      status: "paused",
      pausedAt: "2026-07-31T12:00:00.000Z",
    };
    const activeHabit = {
      ...pausedHabit,
      status: "active",
      pausedAt: null,
    };
    const updateHabitLifecycle = vi.fn().mockResolvedValue(activeHabit);
    const writes = new HabitWrites({
      getHabit: vi.fn().mockResolvedValue(pausedHabit),
      updateHabitLifecycle,
    });

    const outcome = await writes.resume({
      userId: "trusted-user",
      habitId: "habit-1",
    });

    expect(outcome).toEqual({ type: "transitioned", habit: activeHabit });
    expect(updateHabitLifecycle).toHaveBeenCalledWith(
      "habit-1",
      "trusted-user",
      { status: "active", pausedAt: null },
    );
  });

  it("returns already-applied for a repeated resume without changing the habit", async () => {
    const activeHabit = {
      id: "habit-1",
      userId: "trusted-user",
      status: "active",
      pausedAt: null,
    };
    const updateHabitLifecycle = vi.fn();
    const writes = new HabitWrites({
      getHabit: vi.fn().mockResolvedValue(activeHabit),
      updateHabitLifecycle,
    });

    const outcome = await writes.resume({
      userId: "trusted-user",
      habitId: "habit-1",
    });

    expect(outcome).toEqual({ type: "already-applied", habit: activeHabit });
    expect(updateHabitLifecycle).not.toHaveBeenCalled();
  });

  it.each([
    ["pause", "formed"],
    ["resume", "formed"],
  ] as const)(
    "returns invalid-transition when %s is requested for a %s habit",
    async (action, status) => {
      const habit = {
        id: "habit-1",
        userId: "trusted-user",
        status,
        pausedAt: null,
      };
      const updateHabitLifecycle = vi.fn();
      const writes = new HabitWrites({
        getHabit: vi.fn().mockResolvedValue(habit),
        updateHabitLifecycle,
      });

      const outcome = await writes[action]({
        userId: "trusted-user",
        habitId: "habit-1",
      });

      expect(outcome).toEqual({
        type: "invalid-transition",
        action,
        currentStatus: status,
        message: `Habit cannot be ${action === "pause" ? "paused" : "resumed"} from formed state`,
      });
      expect(updateHabitLifecycle).not.toHaveBeenCalled();
    },
  );

  it.each(["missing", "cross-owner"] as const)(
    "returns not-found for %s habits without a lifecycle write",
    async () => {
      const updateHabitLifecycle = vi.fn();
      const writes = new HabitWrites({
        getHabit: vi.fn().mockResolvedValue(null),
        updateHabitLifecycle,
      });

      await expect(
        writes.pause({ userId: "trusted-user", habitId: "habit-1" }),
      ).resolves.toEqual({ type: "not-found" });
      expect(updateHabitLifecycle).not.toHaveBeenCalled();
    },
  );

  it("propagates a lifecycle read failure instead of inventing an outcome", async () => {
    const persistenceError = new Error("habit read unavailable");
    const writes = new HabitWrites({
      getHabit: vi.fn().mockRejectedValue(persistenceError),
      updateHabitLifecycle: vi.fn(),
    });

    await expect(
      writes.pause({ userId: "trusted-user", habitId: "habit-1" }),
    ).rejects.toBe(persistenceError);
  });

  it("propagates a lifecycle update failure after validating the source state", async () => {
    const persistenceError = new Error("habit update unavailable");
    const writes = new HabitWrites({
      getHabit: vi.fn().mockResolvedValue({
        id: "habit-1",
        userId: "trusted-user",
        status: "active",
        pausedAt: null,
      }),
      updateHabitLifecycle: vi.fn().mockRejectedValue(persistenceError),
    });

    await expect(
      writes.pause({ userId: "trusted-user", habitId: "habit-1" }),
    ).rejects.toBe(persistenceError);
  });

  it("rejects lifecycle operations when the persistence adapter has no lifecycle seam", async () => {
    const writes = new HabitWrites({});

    await expect(
      writes.pause({ userId: "trusted-user", habitId: "habit-1" }),
    ).rejects.toThrow("Habit lifecycle transitions are not supported by this persistence");
  });

  describe("delete", () => {
    it("returns deleted through the typed owner-scoped persistence seam", async () => {
      const deleteHabit = vi.fn().mockResolvedValue({ type: "deleted" });
      const writes = new HabitWrites({ deleteHabit });

      await expect(
        writes.delete({ userId: "trusted-user", habitId: "habit-1" }),
      ).resolves.toEqual({ type: "deleted" });
      expect(deleteHabit).toHaveBeenCalledWith("habit-1", "trusted-user");
    });

    it.each(["missing", "cross-owner", "repeated"] as const)(
      "returns the same not-found outcome for %s requests",
      async () => {
        const deleteHabit = vi.fn().mockResolvedValue({ type: "not-found" });
        const writes = new HabitWrites({ deleteHabit });

        await expect(
          writes.delete({ userId: "trusted-user", habitId: "habit-1" }),
        ).resolves.toEqual({ type: "not-found" });
      },
    );

    it("propagates an unexpected deletion persistence failure", async () => {
      const persistenceError = new Error("deletion transaction unavailable");
      const writes = new HabitWrites({
        deleteHabit: vi.fn().mockRejectedValue(persistenceError),
      });

      await expect(
        writes.delete({ userId: "trusted-user", habitId: "habit-1" }),
      ).rejects.toBe(persistenceError);
    });

    it("rejects deletion when the persistence adapter has no deletion seam", async () => {
      const writes = new HabitWrites({});

      await expect(
        writes.delete({ userId: "trusted-user", habitId: "habit-1" }),
      ).rejects.toThrow("Habit deletion is not supported by this persistence");
    });
  });

  describe("graduate", () => {
    const formedHabit = {
      id: "habit-1",
      userId: "trusted-user",
      status: "formed" as const,
      currentStreak: 18,
      graduatedAt: "2026-08-01T12:00:00.000Z",
      graduatedStreak: 18,
      nudgeDismissedAt: null,
    };

    it("returns graduated and sends the trusted owner and timestamp to persistence", async () => {
      const graduateHabit = vi.fn().mockResolvedValue({
        type: "graduated",
        habit: formedHabit,
      });
      const writes = new HabitWrites(
        { graduateHabit },
        () => new Date("2026-08-01T12:00:00.000Z"),
      );

      await expect(
        writes.graduate({ userId: "trusted-user", habitId: "habit-1" }),
      ).resolves.toEqual({ type: "graduated", habit: formedHabit });
      expect(graduateHabit).toHaveBeenCalledWith(
        "habit-1",
        "trusted-user",
        "2026-08-01T12:00:00.000Z",
      );
    });

    it("preserves an already-formed outcome without issuing another write", async () => {
      const graduateHabit = vi.fn().mockResolvedValue({
        type: "already-formed",
        habit: formedHabit,
      });
      const writes = new HabitWrites({ graduateHabit });

      await expect(
        writes.graduate({ userId: "trusted-user", habitId: "habit-1" }),
      ).resolves.toEqual({ type: "already-formed", habit: formedHabit });
      expect(graduateHabit).toHaveBeenCalledTimes(1);
    });

    it.each(["missing", "cross-owner"] as const)(
      "returns the same not-found outcome for %s habits",
      async () => {
        const graduateHabit = vi.fn().mockResolvedValue({ type: "not-found" });
        const writes = new HabitWrites({ graduateHabit });

        await expect(
          writes.graduate({ userId: "trusted-user", habitId: "habit-1" }),
        ).resolves.toEqual({ type: "not-found" });
      },
    );

    it("maps a paused habit to an invalid transition without disclosing another row", async () => {
      const graduateHabit = vi.fn().mockResolvedValue({
        type: "invalid-transition",
        currentStatus: "paused",
      });
      const writes = new HabitWrites({ graduateHabit });

      await expect(
        writes.graduate({ userId: "trusted-user", habitId: "habit-1" }),
      ).resolves.toEqual({
        type: "invalid-transition",
        action: "graduate",
        currentStatus: "paused",
        message: "Habit cannot be graduated from paused state",
      });
    });

    it("propagates an unexpected graduation persistence failure", async () => {
      const persistenceError = new Error("graduation transaction unavailable");
      const writes = new HabitWrites({
        graduateHabit: vi.fn().mockRejectedValue(persistenceError),
      });

      await expect(
        writes.graduate({ userId: "trusted-user", habitId: "habit-1" }),
      ).rejects.toBe(persistenceError);
    });

    it("rejects graduation when the persistence adapter has no graduation seam", async () => {
      const writes = new HabitWrites({});

      await expect(
        writes.graduate({ userId: "trusted-user", habitId: "habit-1" }),
      ).rejects.toThrow("Habit graduation is not supported by this persistence");
    });
  });

  describe("reactivate", () => {
    const formedHabit = {
      id: "habit-1",
      userId: "trusted-user",
      status: "formed" as const,
      currentStreak: 87,
      bestStreak: 120,
      graduatedAt: "2026-07-31T12:00:00.000Z",
      graduatedStreak: 87,
      nudgeDismissedAt: null,
    };
    const activeHabit = {
      ...formedHabit,
      status: "active" as const,
      currentStreak: 0,
      graduatedAt: null,
      graduatedStreak: null,
      nudgeDismissedAt: null,
    };

    it("returns reactivated and runs history after the core commit", async () => {
      const events: string[] = [];
      const reactivateHabit = vi.fn().mockImplementation(async () => {
        events.push("core");
        return { type: "reactivated", habit: activeHabit };
      });
      const markReactivated = vi.fn().mockImplementation(async () => {
        events.push("history");
      });
      const writes = new HabitWrites(
        { reactivateHabit, markReactivated },
        () => new Date("2026-08-01T12:00:00.000Z"),
      );

      await expect(
        writes.reactivate({ userId: "trusted-user", habitId: "habit-1" }),
      ).resolves.toEqual({ type: "reactivated", habit: activeHabit });
      expect(reactivateHabit).toHaveBeenCalledWith(
        "habit-1",
        "trusted-user",
      );
      expect(markReactivated).toHaveBeenCalledWith(
        "habit-1",
        "trusted-user",
        "2026-08-01T12:00:00.000Z",
      );
      expect(events).toEqual(["core", "history"]);
    });

    it("returns already-active without running the history reaction again", async () => {
      const reactivateHabit = vi.fn().mockResolvedValue({
        type: "already-active",
        habit: activeHabit,
      });
      const markReactivated = vi.fn();
      const writes = new HabitWrites({ reactivateHabit, markReactivated });

      await expect(
        writes.reactivate({ userId: "trusted-user", habitId: "habit-1" }),
      ).resolves.toEqual({ type: "already-active", habit: activeHabit });
      expect(markReactivated).not.toHaveBeenCalled();
    });

    it.each(["missing", "cross-owner"] as const)(
      "returns the same not-found outcome for %s habits",
      async () => {
        const reactivateHabit = vi.fn().mockResolvedValue({ type: "not-found" });
        const markReactivated = vi.fn();
        const writes = new HabitWrites({ reactivateHabit, markReactivated });

        await expect(
          writes.reactivate({ userId: "trusted-user", habitId: "habit-1" }),
        ).resolves.toEqual({ type: "not-found" });
        expect(markReactivated).not.toHaveBeenCalled();
      },
    );

    it("returns invalid-transition without disclosing the paused habit", async () => {
      const reactivateHabit = vi.fn().mockResolvedValue({
        type: "invalid-transition",
        currentStatus: "paused",
      });
      const writes = new HabitWrites({ reactivateHabit });

      await expect(
        writes.reactivate({ userId: "trusted-user", habitId: "habit-1" }),
      ).resolves.toEqual({
        type: "invalid-transition",
        action: "reactivate",
        currentStatus: "paused",
        message: "Habit cannot be reactivated from paused state",
      });
    });

    it("propagates a core persistence failure and skips history", async () => {
      const persistenceError = new Error("reactivation transaction unavailable");
      const reactivateHabit = vi.fn().mockRejectedValue(persistenceError);
      const markReactivated = vi.fn();
      const writes = new HabitWrites({ reactivateHabit, markReactivated });

      await expect(
        writes.reactivate({ userId: "trusted-user", habitId: "habit-1" }),
      ).rejects.toBe(persistenceError);
      expect(markReactivated).not.toHaveBeenCalled();
    });

    it("logs a history reaction failure without changing a valid result", async () => {
      const historyError = new Error("history unavailable");
      const logError = vi.spyOn(log, "error").mockImplementation(() => {});
      const reactivateHabit = vi.fn().mockResolvedValue({
        type: "reactivated",
        habit: activeHabit,
      });
      const writes = new HabitWrites({
        reactivateHabit,
        markReactivated: vi.fn().mockRejectedValue(historyError),
      });

      await expect(
        writes.reactivate({ userId: "trusted-user", habitId: "habit-1" }),
      ).resolves.toEqual({ type: "reactivated", habit: activeHabit });
      expect(logError).toHaveBeenCalledWith(
        "[habits] reactivation history reaction failed after core commit",
        historyError,
        { habitId: "habit-1", userId: "trusted-user" },
      );
    });

    it("rejects reactivation when the persistence adapter has no core seam", async () => {
      const writes = new HabitWrites({});

      await expect(
        writes.reactivate({ userId: "trusted-user", habitId: "habit-1" }),
      ).rejects.toThrow("Habit reactivation is not supported by this persistence");
    });
  });

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
