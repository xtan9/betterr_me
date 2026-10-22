/** Maps habit and reminder persistence records to domain outcomes. */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Habit } from "@/lib/db/types";

import { isRecord, HABIT_REMINDER_CHANNELS } from "./write-validation";

import type {
  HabitMutationRecord,
  HabitLifecycleState,
  HabitGraduationPersistenceOutcome,
  HabitReactivationPersistenceOutcome,
  HabitDeletionPersistenceOutcome,
  HabitReminderConfigurationRecord,
  HabitReminderConfigurationPersistenceOutcome,
  HabitReminderRecord,
  HabitReminderChannel,
  HabitReminderStatus,
  HabitReminderConfigurationPersistence,
} from "./write-contract";

export function isNotFoundError(error: unknown): boolean {
  return isRecord(error) && error.code === "PGRST116";
}

export function toHabitMutationRecord(habit: Habit): HabitMutationRecord {
  return {
    id: habit.id,
    userId: habit.user_id,
    name: habit.name,
    description: habit.description,
    categoryId: habit.category_id,
    frequency: habit.frequency,
    status: habit.status,
    currentStreak: habit.current_streak,
    bestStreak: habit.best_streak,
    pausedAt: habit.paused_at,
    graduatedAt: habit.graduated_at,
    graduatedStreak: habit.graduated_streak,
    nudgeDismissedAt: habit.nudge_dismissed_at,
    createdAt: habit.created_at,
    updatedAt: habit.updated_at,
  };
}

function isHabitLifecycleState(value: unknown): value is HabitLifecycleState {
  return value === "active" || value === "paused" || value === "formed";
}

export function mapStoredHabitGraduationOutcome(
  value: unknown,
): HabitGraduationPersistenceOutcome {
  if (!isRecord(value) || typeof value.type !== "string") {
    throw new Error("Invalid graduation outcome returned by the database");
  }

  if (value.type === "not-found") return { type: "not-found" };

  if (
    (value.type === "graduated" || value.type === "already-formed") &&
    isRecord(value.habit)
  ) {
    return {
      type: value.type,
      habit: toHabitMutationRecord(value.habit as unknown as Habit),
    };
  }

  if (
    value.type === "invalid-transition" &&
    isHabitLifecycleState(value.current_status)
  ) {
    return {
      type: "invalid-transition",
      currentStatus: value.current_status,
    };
  }

  throw new Error("Invalid graduation outcome returned by the database");
}

export function mapStoredHabitReactivationOutcome(
  value: unknown,
): HabitReactivationPersistenceOutcome {
  if (!isRecord(value) || typeof value.type !== "string") {
    throw new Error("Invalid reactivation outcome returned by the database");
  }

  if (value.type === "not-found") return { type: "not-found" };

  if (
    (value.type === "reactivated" || value.type === "already-active") &&
    isRecord(value.habit)
  ) {
    return {
      type: value.type,
      habit: toHabitMutationRecord(value.habit as unknown as Habit),
    };
  }

  if (
    value.type === "invalid-transition" &&
    isHabitLifecycleState(value.current_status)
  ) {
    return {
      type: "invalid-transition",
      currentStatus: value.current_status,
    };
  }

  throw new Error("Invalid reactivation outcome returned by the database");
}

export function mapStoredHabitDeletionOutcome(
  value: unknown,
): HabitDeletionPersistenceOutcome {
  if (!isRecord(value) || typeof value.type !== "string") {
    throw new Error("Invalid habit deletion outcome returned by the database");
  }

  if (value.type === "deleted" || value.type === "not-found") {
    return { type: value.type };
  }

  throw new Error("Invalid habit deletion outcome returned by the database");
}

function toStoredHabitReminder(
  reminder: HabitReminderConfigurationRecord["reminders"][number],
): Record<string, unknown> {
  return {
    reminder_type: reminder.reminderType,
    relative_minutes: reminder.relativeMinutes,
    absolute_time: reminder.absoluteTime,
    channels: reminder.channels,
  };
}

function isHabitReminderConflictError(error: unknown): boolean {
  return isRecord(error) && error.code === "23505";
}

function isHabitReminderForeignKeyError(error: unknown): boolean {
  return isRecord(error) && error.code === "23503";
}

function mapStoredHabitReminderConfigurationOutcome(
  value: unknown,
): HabitReminderConfigurationPersistenceOutcome {
  if (!isRecord(value) || Array.isArray(value) || typeof value.type !== "string") {
    throw new Error("Invalid habit reminder configuration outcome returned by the database");
  }
  if (value.type === "not-found") return { type: "not-found" };
  if (value.type === "removed") return { type: "removed", reminders: [] };
  if (value.type === "conflict") {
    if (
      (value.resource === undefined || value.resource === "reminder") &&
      (value.reason === undefined || typeof value.reason === "string")
    ) {
      return {
        type: "conflict",
        ...(value.resource === undefined ? {} : { resource: value.resource }),
        ...(value.reason === undefined ? {} : { reason: value.reason }),
      };
    }
  }
  if (
    value.type === "invalid" &&
    typeof value.field === "string" &&
    typeof value.message === "string"
  ) {
    return { type: "invalid", field: value.field, message: value.message };
  }
  if (
    (value.type === "configured" || value.type === "already-applied") &&
    Array.isArray(value.reminders)
  ) {
    return {
      type: value.type,
      reminders: value.reminders.map(toHabitReminderRecord),
    };
  }
  throw new Error("Invalid habit reminder configuration outcome returned by the database");
}

function nullableHabitReminderString(value: unknown, field: string): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value;
  throw new Error(`Invalid habit ${field} returned by the database`);
}

function requiredHabitReminderString(value: unknown, field: string): string {
  if (typeof value === "string" && value) return value;
  throw new Error(`Invalid habit ${field} returned by the database`);
}

function toHabitReminderRecord(value: unknown): HabitReminderRecord {
  if (!isRecord(value) || Array.isArray(value)) {
    throw new Error("Invalid habit reminder returned by the database");
  }
  if (
    value.source_type !== "habit" ||
    (value.reminder_type !== "relative" && value.reminder_type !== "absolute") ||
    !Array.isArray(value.channels) ||
    value.channels.some((channel) => !HABIT_REMINDER_CHANNELS.has(channel as HabitReminderChannel)) ||
    !["pending", "sent", "failed", "snoozed"].includes(value.status as string) ||
    (value.relative_minutes !== null && typeof value.relative_minutes !== "number") ||
    (value.absolute_time !== null && typeof value.absolute_time !== "string")
  ) {
    throw new Error("Invalid habit reminder returned by the database");
  }
  return {
    id: requiredHabitReminderString(value.id, "reminder"),
    userId: requiredHabitReminderString(value.user_id, "reminder"),
    habitId: requiredHabitReminderString(value.source_id, "reminder"),
    reminderType: value.reminder_type,
    relativeMinutes: value.relative_minutes === null ? null : value.relative_minutes,
    absoluteTime: nullableHabitReminderString(value.absolute_time, "reminder"),
    channels: value.channels as HabitReminderChannel[],
    status: value.status as HabitReminderStatus,
    fireAt: requiredHabitReminderString(value.fire_at, "reminder"),
    sentAt: nullableHabitReminderString(value.sent_at, "reminder"),
    createdAt: requiredHabitReminderString(value.created_at, "reminder"),
  };
}

export class SupabaseHabitReminderConfigurationPersistence
  implements HabitReminderConfigurationPersistence
{
  constructor(private readonly supabase: SupabaseClient) {}

  async configureHabitReminders(
    record: HabitReminderConfigurationRecord,
  ): Promise<HabitReminderConfigurationPersistenceOutcome> {
    const { data, error } = await this.supabase.rpc("configure_habit_reminders", {
      p_user_id: record.userId,
      p_habit_id: record.habitId,
      p_reference_time: record.referenceTime,
      p_reminders: record.reminders.map(toStoredHabitReminder),
    });

    if (error) {
      if (isHabitReminderConflictError(error)) {
        return { type: "conflict", resource: "reminder" };
      }
      if (isHabitReminderForeignKeyError(error)) return { type: "not-found" };
      throw error;
    }
    return mapStoredHabitReminderConfigurationOutcome(data);
  }
}
