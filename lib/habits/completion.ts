import type { SupabaseClient } from "@supabase/supabase-js";
import type { HabitLog } from "@/lib/db/types";
import { HabitMilestonesDB } from "@/lib/db/habit-milestones";
import {
  MILESTONE_THRESHOLDS,
  type MilestoneThreshold,
} from "@/lib/habits/milestones";
import { log } from "@/lib/logger";
import { getLocalDateString } from "@/lib/utils";

export interface HabitCompletionIntent {
  habitId: string;
  userId: string;
  date: string;
}

export type HabitMilestoneOutcome =
  | { status: "recorded"; threshold: MilestoneThreshold }
  | { status: "already_recorded"; threshold: MilestoneThreshold }
  | { status: "failed"; threshold: MilestoneThreshold };

export interface HabitCompletionOutcome {
  log: HabitLog;
  completed: boolean;
  currentStreak: number;
  bestStreak: number;
  milestones: HabitMilestoneOutcome[];
}

export interface HabitCompletionDependencies {
  setCompletionAtomically(
    intent: HabitCompletionIntent,
    completed: boolean,
  ): Promise<Omit<HabitCompletionOutcome, "milestones">>;
  recordMilestone(
    habitId: string,
    userId: string,
    milestone: MilestoneThreshold,
  ): Promise<boolean>;
  reportMilestoneFailure(error: unknown, habitId: string): void;
}

export class HabitCompletion {
  constructor(private readonly dependencies: HabitCompletionDependencies) {}

  complete(intent: HabitCompletionIntent): Promise<HabitCompletionOutcome> {
    return this.setCompletion(intent, true);
  }

  uncomplete(intent: HabitCompletionIntent): Promise<HabitCompletionOutcome> {
    return this.setCompletion(intent, false);
  }

  private async setCompletion(
    intent: HabitCompletionIntent,
    completed: boolean,
  ): Promise<HabitCompletionOutcome> {
    const criticalOutcome =
      await this.dependencies.setCompletionAtomically(intent, completed);

    return {
      ...criticalOutcome,
      milestones: await this.resolveMilestones(
        intent,
        criticalOutcome.completed,
        criticalOutcome.currentStreak,
      ),
    };
  }

  private async resolveMilestones(
    intent: HabitCompletionIntent,
    completed: boolean,
    currentStreak: number,
  ): Promise<HabitMilestoneOutcome[]> {
    if (!completed) return [];

    const reachedThresholds = MILESTONE_THRESHOLDS.filter(
      (threshold) => threshold <= currentStreak,
    );
    return Promise.all(
      reachedThresholds.map(async (threshold) => {
        try {
          const recorded = await this.dependencies.recordMilestone(
            intent.habitId,
            intent.userId,
            threshold,
          );
          return {
            status: recorded ? "recorded" : "already_recorded",
            threshold,
          };
        } catch (error) {
          this.dependencies.reportMilestoneFailure(error, intent.habitId);
          return { status: "failed", threshold };
        }
      }),
    );
  }
}

export function createHabitCompletion(
  supabase: SupabaseClient,
): HabitCompletion {
  const milestones = new HabitMilestonesDB(supabase);

  return new HabitCompletion({
    setCompletionAtomically: async (intent, completed) => {
      const { data, error } = await supabase.rpc(
        "set_habit_completion_atomically",
        {
          p_habit_id: intent.habitId,
          p_user_id: intent.userId,
          p_logged_date: intent.date,
          p_completed: completed,
          p_today: getLocalDateString(),
        },
      );

      if (error) throw new Error(error.message);
      const result = data as {
        log: HabitLog;
        completed: boolean;
        current_streak: number;
        best_streak: number;
      };
      return {
        log: result.log,
        completed: result.completed,
        currentStreak: result.current_streak,
        bestStreak: result.best_streak,
      };
    },
    recordMilestone: milestones.recordMilestone.bind(milestones),
    reportMilestoneFailure: (error, habitId) => {
      log.error("[habits] Milestone check failed", error, { habitId });
    },
  });
}
