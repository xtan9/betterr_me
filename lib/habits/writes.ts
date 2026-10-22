/** Habit commands and their production composition; callers keep one mutation interface. */

import type { SupabaseClient } from "@supabase/supabase-js";

import { MAX_HABITS_PER_USER } from "@/lib/constants";

import { HabitsDB } from "@/lib/db/habits";

import { HabitGraduationsDB } from "@/lib/db/habit-graduations";

import type { HabitInsert, HabitUpdate } from "@/lib/db/types";

import { log } from "@/lib/logger";

import type {
  HabitWritesPersistence,
  Clock,
  HabitReminderConfigurationRequest,
  HabitReminderConfigurationPersistenceOutcome,
  HabitCreationRequest,
  HabitCreationOutcome,
  HabitUpdateRequest,
  HabitUpdateOutcome,
  HabitLifecycleRequest,
  HabitLifecycleOutcome,
  HabitGraduationRequest,
  HabitGraduationOutcome,
  HabitReactivationRequest,
  HabitReactivationOutcome,
  HabitDeletionRequest,
  HabitDeletionOutcome,
  HabitNudgeDismissalRequest,
  HabitNudgeDismissalOutcome,
  HabitLifecycleAction,
  HabitLifecycleChanges,
  HabitReminderRecord,
  HabitMutationRecord,
} from "./write-contract";

import { normalizeHabitReminderConfigurationRequest } from "./reminder-configuration";

import { normalizeRequest, normalizeUpdateRequest } from "./write-validation";

import {
  SupabaseHabitReminderConfigurationPersistence,
  toHabitMutationRecord,
  isNotFoundError,
  mapStoredHabitGraduationOutcome,
  mapStoredHabitReactivationOutcome,
  mapStoredHabitDeletionOutcome,
} from "./habit-persistence";

export type {
  HabitCreationFrequency,
  HabitLifecycleState,
  HabitReminderType,
  HabitReminderChannel,
  HabitReminderStatus,
  HabitReminderInput,
  HabitReminderConfigurationRequest,
  HabitReminderConfigurationRecord,
  HabitReminderRecord,
  HabitReminderConfigurationPersistenceOutcome,
  HabitReminderConfigurationPersistence,
  HabitCreationRequest,
  HabitUpdateRequest,
  HabitLifecycleAction,
  HabitLifecycleRequest,
  HabitCreationRecord,
  HabitMutationRecord,
  CreatedHabit,
  UpdatedHabit,
  HabitDetailChanges,
  HabitCreationPersistence,
  HabitUpdatePersistence,
  HabitLifecycleChanges,
  HabitLifecyclePersistence,
  HabitGraduationRequest,
  HabitGraduationPersistenceOutcome,
  HabitGraduationPersistence,
  HabitReactivationRequest,
  HabitReactivationPersistenceOutcome,
  HabitReactivationPersistence,
  HabitDeletionRequest,
  HabitDeletionPersistenceOutcome,
  HabitDeletionPersistence,
  HabitNudgeDismissalRequest,
  HabitNudgeDismissalOutcome,
  HabitNudgeDismissalPersistence,
  HabitCreationOutcome,
  HabitUpdateOutcome,
  HabitLifecycleOutcome,
  HabitGraduationOutcome,
  HabitReactivationOutcome,
  HabitDeletionOutcome,
} from "./write-contract";

export { SupabaseHabitReminderConfigurationPersistence } from "./habit-persistence";

export class HabitWrites {
  constructor(
    private readonly persistence: HabitWritesPersistence,
    private readonly now: Clock = () => new Date(),
  ) {}

  async configureReminder(
    request: HabitReminderConfigurationRequest,
  ): Promise<HabitReminderConfigurationPersistenceOutcome> {
    return this.configureReminders(request);
  }

  async configureReminders(
    request: HabitReminderConfigurationRequest,
  ): Promise<HabitReminderConfigurationPersistenceOutcome> {
    const normalized = normalizeHabitReminderConfigurationRequest(request);
    if (!normalized.ok) {
      if ("outcome" in normalized) return normalized.outcome;
      return {
        type: "invalid",
        field: normalized.field,
        message: normalized.message,
      };
    }
    if (!this.persistence.configureHabitReminders) {
      throw new Error("Habit reminder configuration persistence is not configured");
    }
    return this.persistence.configureHabitReminders(normalized.value);
  }

  async create(request: HabitCreationRequest): Promise<HabitCreationOutcome> {
    const normalized = normalizeRequest(request);
    if (!normalized.ok) {
      return {
        type: "invalid",
        field: normalized.field,
        message: normalized.message,
      };
    }

    if (!this.persistence.countActiveHabits || !this.persistence.createHabit) {
      throw new Error("Habit creation is not supported by this persistence");
    }

    const activeCount = await this.persistence.countActiveHabits(
      normalized.record.userId,
    );
    if (activeCount >= MAX_HABITS_PER_USER) {
      return {
        type: "limit-reached",
        activeCount,
        limit: MAX_HABITS_PER_USER,
      };
    }

    const habit = await this.persistence.createHabit(normalized.record);
    return { type: "created", habit };
  }

  async update(request: HabitUpdateRequest): Promise<HabitUpdateOutcome> {
    const normalized = normalizeUpdateRequest(request);
    if (!normalized.ok) {
      if (normalized.type === "conflict") return { type: "conflict" };
      return {
        type: "invalid",
        field: normalized.field,
        message: normalized.message,
      };
    }
    if (!this.persistence.updateHabit) {
      throw new Error("Habit updates are not supported by this persistence");
    }

    const habit = await this.persistence.updateHabit(
      normalized.habitId,
      normalized.userId,
      normalized.changes,
    );
    if (!habit) return { type: "not-found" };
    return { type: "updated", habit };
  }

  async pause(
    request: HabitLifecycleRequest,
  ): Promise<HabitLifecycleOutcome> {
    return this.transition("pause", request);
  }

  async resume(
    request: HabitLifecycleRequest,
  ): Promise<HabitLifecycleOutcome> {
    return this.transition("resume", request);
  }

  async graduate(
    request: HabitGraduationRequest,
  ): Promise<HabitGraduationOutcome> {
    if (!this.persistence.graduateHabit) {
      throw new Error("Habit graduation is not supported by this persistence");
    }

    const outcome = await this.persistence.graduateHabit(
      request.habitId,
      request.userId,
      this.now().toISOString(),
    );
    if (
      outcome.type === "graduated" ||
      outcome.type === "already-formed" ||
      outcome.type === "not-found"
    ) {
      return outcome;
    }

    return {
      type: "invalid-transition",
      action: "graduate",
      currentStatus: outcome.currentStatus,
      message: `Habit cannot be graduated from ${outcome.currentStatus} state`,
    };
  }

  async reactivate(
    request: HabitReactivationRequest,
  ): Promise<HabitReactivationOutcome> {
    if (!this.persistence.reactivateHabit) {
      throw new Error("Habit reactivation is not supported by this persistence");
    }

    const outcome = await this.persistence.reactivateHabit(
      request.habitId,
      request.userId,
    );
    if (
      outcome.type === "reactivated" ||
      outcome.type === "already-active" ||
      outcome.type === "not-found"
    ) {
      if (outcome.type === "reactivated" && this.persistence.markReactivated) {
        try {
          await this.persistence.markReactivated(
            request.habitId,
            request.userId,
            this.now().toISOString(),
          );
        } catch (error: unknown) {
          log.error(
            "[habits] reactivation history reaction failed after core commit",
            error,
            { habitId: request.habitId, userId: request.userId },
          );
        }
      }
      return outcome;
    }

    return {
      type: "invalid-transition",
      action: "reactivate",
      currentStatus: outcome.currentStatus,
      message: `Habit cannot be reactivated from ${outcome.currentStatus} state`,
    };
  }

  async delete(
    request: HabitDeletionRequest,
  ): Promise<HabitDeletionOutcome> {
    if (!this.persistence.deleteHabit) {
      throw new Error("Habit deletion is not supported by this persistence");
    }

    return this.persistence.deleteHabit(request.habitId, request.userId);
  }

  async dismissGraduationNudge(
    request: HabitNudgeDismissalRequest,
  ): Promise<HabitNudgeDismissalOutcome> {
    if (!this.persistence.dismissGraduationNudge) {
      throw new Error(
        "Habit graduation-nudge dismissal is not supported by this persistence",
      );
    }

    const habit = await this.persistence.dismissGraduationNudge(
      request.habitId,
      request.userId,
    );
    if (!habit) return { type: "not-found" };
    return { type: "dismissed", habit };
  }

  private async transition(
    action: HabitLifecycleAction,
    request: HabitLifecycleRequest,
  ): Promise<HabitLifecycleOutcome> {
    if (!this.persistence.getHabit || !this.persistence.updateHabitLifecycle) {
      throw new Error("Habit lifecycle transitions are not supported by this persistence");
    }

    const habit = await this.persistence.getHabit(
      request.habitId,
      request.userId,
    );
    if (!habit) return { type: "not-found" };

    const targetStatus = action === "pause" ? "paused" : "active";
    const sourceStatus = action === "pause" ? "active" : "paused";
    if (habit.status === targetStatus) {
      return { type: "already-applied", habit };
    }
    if (habit.status !== sourceStatus) {
      return {
        type: "invalid-transition",
        action,
        currentStatus: habit.status,
        message: `Habit cannot be ${action === "pause" ? "paused" : "resumed"} from ${habit.status} state`,
      };
    }

    const changes: HabitLifecycleChanges = action === "pause"
      ? { status: "paused", pausedAt: this.now().toISOString() }
      : { status: "active", pausedAt: null };
    const updated = await this.persistence.updateHabitLifecycle(
      request.habitId,
      request.userId,
      changes,
    );
    if (!updated) return { type: "not-found" };
    return { type: "transitioned", habit: updated };
  }
}

export function toHabitReminderResponse(reminder: HabitReminderRecord) {
  return {
    id: reminder.id,
    user_id: reminder.userId,
    source_type: "habit" as const,
    source_id: reminder.habitId,
    reminder_type: reminder.reminderType,
    relative_minutes: reminder.relativeMinutes,
    absolute_time: reminder.absoluteTime,
    channels: reminder.channels,
    status: reminder.status,
    fire_at: reminder.fireAt,
    sent_at: reminder.sentAt,
    created_at: reminder.createdAt,
  };
}

export function createHabitWrites(supabase: SupabaseClient): HabitWrites {
  const habitsDB = new HabitsDB(supabase);
  const habitReminderPersistence = new SupabaseHabitReminderConfigurationPersistence(
    supabase,
  );

  return new HabitWrites({
    countActiveHabits: habitsDB.getActiveHabitCount.bind(habitsDB),
    createHabit: async (record) => {
      const insert: HabitInsert = {
        user_id: record.userId,
        name: record.name,
        description: record.description,
        category_id: record.categoryId,
        frequency: record.frequency,
        status: record.status,
        current_streak: record.currentStreak,
        best_streak: record.bestStreak,
        paused_at: record.pausedAt,
      };
      const habit = await habitsDB.createHabit(insert);
      return toHabitMutationRecord(habit);
    },
    updateHabit: async (habitId, userId, changes) => {
      const updates: HabitUpdate = {};
      if (changes.name !== undefined) updates.name = changes.name;
      if (changes.description !== undefined) {
        updates.description = changes.description;
      }
      if (changes.categoryId !== undefined) {
        updates.category_id = changes.categoryId;
      }
      if (changes.frequency !== undefined) updates.frequency = changes.frequency;

      try {
        const habit = await habitsDB.updateHabit(habitId, userId, updates);
        return toHabitMutationRecord(habit);
      } catch (error: unknown) {
        if (isNotFoundError(error)) return null;
        throw error;
      }
    },
    getHabit: async (habitId, userId) => {
      const habit = await habitsDB.getHabit(habitId, userId);
      return habit ? toHabitMutationRecord(habit) : null;
    },
    updateHabitLifecycle: async (habitId, userId, changes) => {
      const updates: HabitUpdate = {
        status: changes.status,
        paused_at: changes.pausedAt,
      };

      try {
        const habit = await habitsDB.updateHabit(habitId, userId, updates);
        return toHabitMutationRecord(habit);
      } catch (error: unknown) {
        if (isNotFoundError(error)) return null;
        throw error;
      }
    },
    dismissGraduationNudge: async (habitId, userId) => {
      try {
        const habit = await habitsDB.dismissGraduationNudge(habitId, userId);
        return toHabitMutationRecord(habit);
      } catch (error: unknown) {
        if (isNotFoundError(error)) return null;
        throw error;
      }
    },
    graduateHabit: async (habitId, userId, graduatedAt) => {
      const { data, error } = await supabase.rpc("graduate_habit_atomically", {
        p_habit_id: habitId,
        p_user_id: userId,
        p_graduated_at: graduatedAt,
      });
      if (error) throw error;
      return mapStoredHabitGraduationOutcome(data);
    },
    reactivateHabit: async (habitId, userId) => {
      const { data, error } = await supabase.rpc("reactivate_habit_atomically", {
        p_habit_id: habitId,
        p_user_id: userId,
      });
      if (error) throw error;
      return mapStoredHabitReactivationOutcome(data);
    },
    deleteHabit: async (habitId, userId) => {
      const { data, error } = await supabase.rpc("delete_habit_atomically", {
        p_habit_id: habitId,
        p_user_id: userId,
      });
      if (error) throw error;
      return mapStoredHabitDeletionOutcome(data);
    },
    configureHabitReminders: habitReminderPersistence.configureHabitReminders.bind(
      habitReminderPersistence,
    ),
    markReactivated: async (habitId, userId, reactivatedAt) => {
      const graduations = new HabitGraduationsDB(supabase);
      await graduations.markReactivated(habitId, userId, reactivatedAt);
    },
  });
}

export function toHabitResponse(habit: HabitMutationRecord) {
  return {
    id: habit.id,
    user_id: habit.userId,
    name: habit.name,
    description: habit.description,
    category_id: habit.categoryId,
    frequency: habit.frequency,
    status: habit.status,
    current_streak: habit.currentStreak,
    best_streak: habit.bestStreak,
    paused_at: habit.pausedAt,
    graduated_at: habit.graduatedAt,
    graduated_streak: habit.graduatedStreak,
    nudge_dismissed_at: habit.nudgeDismissedAt,
    created_at: habit.createdAt,
    updated_at: habit.updatedAt,
  };
}
