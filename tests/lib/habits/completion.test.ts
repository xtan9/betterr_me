import { describe, expect, it, vi } from "vitest";
import {
  createHabitCompletion,
  HabitCompletion,
  type HabitCompletionDependencies,
} from "@/lib/habits/completion";
import type { HabitLog } from "@/lib/db/types";
import type { SupabaseClient } from "@supabase/supabase-js";

const habit = {
  id: "habit-1",
  user_id: "user-1",
};

const completedLog = {
  id: "log-1",
  habit_id: habit.id,
  user_id: habit.user_id,
  logged_date: "2026-07-29",
  completed: true,
} as HabitLog;

function makeDependencies(
  overrides: Partial<HabitCompletionDependencies> = {},
): HabitCompletionDependencies {
  return {
    setCompletionAtomically: vi.fn().mockResolvedValue({
      log: completedLog,
      completed: true,
      currentStreak: 7,
      bestStreak: 7,
    }),
    recordMilestone: vi.fn().mockResolvedValue(true),
    reportMilestoneFailure: vi.fn(),
    ...overrides,
  };
}

describe("HabitCompletion", () => {
  it("completes a habit and returns its log, streak, and milestone outcome", async () => {
    const dependencies = makeDependencies();
    const completion = new HabitCompletion(dependencies);

    const outcome = await completion.complete({
      habitId: habit.id,
      userId: habit.user_id,
      date: "2026-07-29",
    });

    expect(outcome).toEqual({
      log: completedLog,
      completed: true,
      currentStreak: 7,
      bestStreak: 7,
      milestones: [{ status: "recorded", threshold: 7 }],
    });
    expect(dependencies.setCompletionAtomically).toHaveBeenCalledWith(
      {
        habitId: habit.id,
        userId: habit.user_id,
        date: "2026-07-29",
      },
      true,
    );
    expect(dependencies.recordMilestone).toHaveBeenCalledWith(
      habit.id,
      habit.user_id,
      7,
    );
  });

  it("uncompletes a habit and recalculates its streak without a milestone", async () => {
    const uncompletedLog = { ...completedLog, completed: false };
    const dependencies = makeDependencies({
      setCompletionAtomically: vi.fn().mockResolvedValue({
        log: uncompletedLog,
        completed: false,
        currentStreak: 6,
        bestStreak: 7,
      }),
    });
    const completion = new HabitCompletion(dependencies);

    const outcome = await completion.uncomplete({
      habitId: habit.id,
      userId: habit.user_id,
      date: "2026-07-29",
    });

    expect(outcome).toEqual({
      log: uncompletedLog,
      completed: false,
      currentStreak: 6,
      bestStreak: 7,
      milestones: [],
    });
    expect(dependencies.setCompletionAtomically).toHaveBeenCalledWith(
      {
        habitId: habit.id,
        userId: habit.user_id,
        date: "2026-07-29",
      },
      false,
    );
    expect(dependencies.recordMilestone).not.toHaveBeenCalled();
  });

  it("keeps completion and milestone records unique when completion is retried", async () => {
    const milestones = new Set<number>();
    const dependencies = makeDependencies({
      recordMilestone: vi.fn(async (_habitId, _userId, threshold) => {
        const isNew = !milestones.has(threshold);
        milestones.add(threshold);
        return isNew;
      }),
    });
    const completion = new HabitCompletion(dependencies);
    const intent = {
      habitId: habit.id,
      userId: habit.user_id,
      date: "2026-07-29",
    };

    const first = await completion.complete(intent);
    const retry = await completion.complete(intent);

    expect([...milestones]).toEqual([7]);
    expect(dependencies.setCompletionAtomically).toHaveBeenCalledTimes(2);
    expect(dependencies.recordMilestone).toHaveBeenCalledTimes(2);
    expect(first.milestones).toEqual([
      { status: "recorded", threshold: 7 },
    ]);
    expect(retry.milestones).toEqual([
      { status: "already_recorded", threshold: 7 },
    ]);
  });

  it("reports milestone failure without failing the completed habit outcome", async () => {
    const milestoneError = new Error("milestone storage unavailable");
    const dependencies = makeDependencies({
      recordMilestone: vi.fn().mockRejectedValue(milestoneError),
    });
    const completion = new HabitCompletion(dependencies);

    const outcome = await completion.complete({
      habitId: habit.id,
      userId: habit.user_id,
      date: "2026-07-29",
    });

    expect(outcome.completed).toBe(true);
    expect(outcome.milestones).toEqual([
      { status: "failed", threshold: 7 },
    ]);
    expect(dependencies.reportMilestoneFailure).toHaveBeenCalledWith(
      milestoneError,
      habit.id,
    );
  });

  it("retries a milestone that previously failed without duplicating completion", async () => {
    const milestoneError = new Error("milestone storage unavailable");
    const dependencies = makeDependencies({
      recordMilestone: vi
        .fn()
        .mockRejectedValueOnce(milestoneError)
        .mockResolvedValueOnce(true),
    });
    const completion = new HabitCompletion(dependencies);
    const intent = {
      habitId: habit.id,
      userId: habit.user_id,
      date: "2026-07-29",
    };

    const failed = await completion.complete(intent);
    const retry = await completion.complete(intent);

    expect(dependencies.setCompletionAtomically).toHaveBeenCalledTimes(2);
    expect(dependencies.recordMilestone).toHaveBeenCalledTimes(2);
    expect(failed.milestones).toEqual([
      { status: "failed", threshold: 7 },
    ]);
    expect(retry.milestones).toEqual([
      { status: "recorded", threshold: 7 },
    ]);
  });

  it("does not re-record an existing threshold after a different completion", async () => {
    const dependencies = makeDependencies({
      recordMilestone: vi.fn().mockResolvedValue(false),
    });
    const completion = new HabitCompletion(dependencies);

    const outcome = await completion.complete({
      habitId: habit.id,
      userId: habit.user_id,
      date: "2026-07-28",
    });

    expect(dependencies.setCompletionAtomically).toHaveBeenCalledTimes(1);
    expect(dependencies.recordMilestone).toHaveBeenCalledTimes(1);
    expect(outcome.milestones).toEqual([
      { status: "already_recorded", threshold: 7 },
    ]);
  });

  it("records every reached threshold when a historical completion closes a gap", async () => {
    const dependencies = makeDependencies({
      setCompletionAtomically: vi.fn().mockResolvedValue({
        log: completedLog,
        completed: true,
        currentStreak: 15,
        bestStreak: 15,
      }),
      recordMilestone: vi
        .fn()
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(true),
    });
    const completion = new HabitCompletion(dependencies);

    const outcome = await completion.complete({
      habitId: habit.id,
      userId: habit.user_id,
      date: "2026-07-20",
    });

    expect(outcome).toEqual({
      log: completedLog,
      completed: true,
      currentStreak: 15,
      bestStreak: 15,
      milestones: [
        { status: "already_recorded", threshold: 7 },
        { status: "recorded", threshold: 14 },
      ],
    });
    expect(dependencies.recordMilestone).toHaveBeenNthCalledWith(
      1,
      habit.id,
      habit.user_id,
      7,
    );
    expect(dependencies.recordMilestone).toHaveBeenNthCalledWith(
      2,
      habit.id,
      habit.user_id,
      14,
    );
  });

  it("fails when the atomic lifecycle reports that the habit does not exist", async () => {
    const dependencies = makeDependencies({
      setCompletionAtomically: vi
        .fn()
        .mockRejectedValue(new Error("Habit not found")),
    });
    const completion = new HabitCompletion(dependencies);

    await expect(
      completion.complete({
        habitId: habit.id,
        userId: habit.user_id,
        date: "2026-07-29",
      }),
    ).rejects.toThrow("Habit not found");
    expect(dependencies.recordMilestone).not.toHaveBeenCalled();
  });

  it("does not record a milestone when uncompleting at a threshold", async () => {
    const dependencies = makeDependencies({
      setCompletionAtomically: vi.fn().mockResolvedValue({
        log: { ...completedLog, completed: false },
        completed: false,
        currentStreak: 7,
        bestStreak: 7,
      }),
    });
    const completion = new HabitCompletion(dependencies);

    const outcome = await completion.uncomplete({
      habitId: habit.id,
      userId: habit.user_id,
      date: "2026-07-29",
    });

    expect(outcome.milestones).toEqual([]);
    expect(dependencies.recordMilestone).not.toHaveBeenCalled();
  });

  it("does not attempt a milestone when the atomic lifecycle fails", async () => {
    const dependencies = makeDependencies({
      setCompletionAtomically: vi
        .fn()
        .mockRejectedValue(new Error("streak failed")),
    });
    const completion = new HabitCompletion(dependencies);

    await expect(
      completion.complete({
        habitId: habit.id,
        userId: habit.user_id,
        date: "2026-07-29",
      }),
    ).rejects.toThrow("streak failed");
    expect(dependencies.recordMilestone).not.toHaveBeenCalled();
  });

  it("serializes concurrent completion intents so the log and streak share the final intent", async () => {
    vi.useFakeTimers();
    vi.setSystemTime("2026-07-29T12:00:00-07:00");
    let transaction = Promise.resolve();
    let persisted = {
      log: { ...completedLog, completed: false },
      completed: false,
      current_streak: 5,
      best_streak: 7,
    };
    const rpc = vi.fn(
      (
        _name: string,
        args: { p_completed: boolean },
      ): Promise<{ data: typeof persisted; error: null }> => {
        const result = transaction.then(async () => {
          await Promise.resolve();
          persisted = {
            log: { ...completedLog, completed: args.p_completed },
            completed: args.p_completed,
            current_streak: args.p_completed ? 6 : 5,
            best_streak: 7,
          };
          return { data: persisted, error: null };
        });
        transaction = result.then(() => undefined);
        return result;
      },
    );
    const completion = createHabitCompletion({
      rpc,
    } as unknown as SupabaseClient);
    const intent = {
      habitId: habit.id,
      userId: habit.user_id,
      date: "2026-07-29",
    };

    try {
      const [completed, uncompleted] = await Promise.all([
        completion.complete(intent),
        completion.uncomplete(intent),
      ]);

      expect(completed).toEqual({
        log: { ...completedLog, completed: true },
        completed: true,
        currentStreak: 6,
        bestStreak: 7,
        milestones: [],
      });
      expect(uncompleted).toEqual({
        log: { ...completedLog, completed: false },
        completed: false,
        currentStreak: 5,
        bestStreak: 7,
        milestones: [],
      });
      expect(persisted).toEqual({
        log: { ...completedLog, completed: false },
        completed: false,
        current_streak: 5,
        best_streak: 7,
      });
      expect(rpc).toHaveBeenNthCalledWith(1, "set_habit_completion_atomically", {
        p_habit_id: habit.id,
        p_user_id: habit.user_id,
        p_logged_date: "2026-07-29",
        p_completed: true,
        p_today: "2026-07-29",
      });
      expect(rpc).toHaveBeenNthCalledWith(2, "set_habit_completion_atomically", {
        p_habit_id: habit.id,
        p_user_id: habit.user_id,
        p_logged_date: "2026-07-29",
        p_completed: false,
        p_today: "2026-07-29",
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("surfaces an atomic RPC error before attempting milestones", async () => {
    vi.useFakeTimers();
    vi.setSystemTime("2026-07-29T12:00:00-07:00");
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { message: "atomic completion unavailable" },
    });
    const completion = createHabitCompletion({
      rpc,
    } as unknown as SupabaseClient);

    try {
      await expect(
        completion.complete({
          habitId: habit.id,
          userId: habit.user_id,
          date: "2026-07-29",
        }),
      ).rejects.toThrow("atomic completion unavailable");
      expect(rpc).toHaveBeenCalledWith("set_habit_completion_atomically", {
        p_habit_id: habit.id,
        p_user_id: habit.user_id,
        p_logged_date: "2026-07-29",
        p_completed: true,
        p_today: "2026-07-29",
      });
    } finally {
      vi.useRealTimers();
    }
  });
});
