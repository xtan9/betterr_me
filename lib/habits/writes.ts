import type { SupabaseClient } from "@supabase/supabase-js";
import { MAX_HABITS_PER_USER } from "@/lib/constants";
import { HabitsDB } from "@/lib/db/habits";
import { HabitGraduationsDB } from "@/lib/db/habit-graduations";
import type { Habit, HabitInsert, HabitUpdate } from "@/lib/db/types";
import { log } from "@/lib/logger";

export type HabitCreationFrequency =
  | { type: "daily" }
  | { type: "weekdays" }
  | { type: "weekly" }
  | { type: "times_per_week"; count: 2 | 3 }
  | { type: "custom"; days: number[] };

export type HabitLifecycleState = "active" | "paused" | "formed";

export type HabitReminderType = "relative" | "absolute";
export type HabitReminderChannel = "push" | "email";
export type HabitReminderStatus = "pending" | "sent" | "failed" | "snoozed";

/**
 * Storage-independent Habit Reminder Configuration intent. The complete
 * collection is supplied on every call; an empty collection removes pending
 * configuration while terminal delivery history remains untouched.
 */
export type HabitReminderInput =
  | {
      reminderType: "relative";
      relativeMinutes: number;
      channels: readonly HabitReminderChannel[];
    }
  | {
      reminderType: "absolute";
      absoluteTime: string;
      channels: readonly HabitReminderChannel[];
    };

export interface HabitReminderConfigurationRequest {
  userId: string;
  habitId: string;
  referenceTime?: string | null;
  reminders: readonly HabitReminderInput[];
}

export interface HabitReminderConfigurationRecord {
  userId: string;
  habitId: string;
  referenceTime: string | null;
  reminders: Array<{
    reminderType: HabitReminderType;
    relativeMinutes: number | null;
    absoluteTime: string | null;
    channels: HabitReminderChannel[];
  }>;
}

export interface HabitReminderRecord {
  id: string;
  userId: string;
  habitId: string;
  reminderType: HabitReminderType;
  relativeMinutes: number | null;
  absoluteTime: string | null;
  channels: HabitReminderChannel[];
  status: HabitReminderStatus;
  fireAt: string;
  sentAt: string | null;
  createdAt: string;
}

export type HabitReminderConfigurationPersistenceOutcome =
  | { type: "configured"; reminders: HabitReminderRecord[] }
  | { type: "removed"; reminders: [] }
  | { type: "already-applied"; reminders: HabitReminderRecord[] }
  | { type: "not-found" }
  | { type: "conflict"; resource?: "reminder"; reason?: string }
  | { type: "invalid"; field: string; message: string };

export interface HabitReminderConfigurationPersistence {
  configureHabitReminders(
    record: HabitReminderConfigurationRecord,
  ): Promise<HabitReminderConfigurationPersistenceOutcome>;
}

export interface HabitCreationRequest {
  userId: string;
  name: string;
  description?: string | null;
  categoryId?: string | null;
  frequency: HabitCreationFrequency;
}

export interface HabitUpdateRequest {
  userId: string;
  habitId: string;
  name?: string;
  description?: string | null;
  categoryId?: string | null;
  frequency?: HabitCreationFrequency;
}

export type HabitLifecycleAction = "pause" | "resume";

export interface HabitLifecycleRequest {
  userId: string;
  habitId: string;
}

export interface HabitCreationRecord {
  userId: string;
  name: string;
  description: string | null;
  categoryId: string | null;
  frequency: HabitCreationFrequency;
  status: "active";
  currentStreak: 0;
  bestStreak: 0;
  pausedAt: null;
  graduatedAt: null;
  graduatedStreak: null;
  nudgeDismissedAt: null;
}

export interface HabitMutationRecord {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  categoryId: string | null;
  frequency: HabitCreationFrequency;
  status: HabitLifecycleState;
  currentStreak: number;
  bestStreak: number;
  pausedAt: string | null;
  graduatedAt: string | null;
  graduatedStreak: number | null;
  nudgeDismissedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type CreatedHabit = HabitMutationRecord;
export type UpdatedHabit = HabitMutationRecord;

export interface HabitDetailChanges {
  name?: string;
  description?: string | null;
  categoryId?: string | null;
  frequency?: HabitCreationFrequency;
}

export interface HabitCreationPersistence {
  countActiveHabits(userId: string): Promise<number>;
  createHabit(record: HabitCreationRecord): Promise<CreatedHabit>;
}

export interface HabitUpdatePersistence {
  updateHabit(
    habitId: string,
    userId: string,
    changes: HabitDetailChanges,
  ): Promise<UpdatedHabit | null>;
}

export interface HabitLifecycleChanges {
  status: Extract<HabitLifecycleState, "active" | "paused">;
  pausedAt: string | null;
}

export interface HabitLifecyclePersistence {
  getHabit(habitId: string, userId: string): Promise<HabitMutationRecord | null>;
  updateHabitLifecycle(
    habitId: string,
    userId: string,
    changes: HabitLifecycleChanges,
  ): Promise<HabitMutationRecord | null>;
}

export interface HabitGraduationRequest {
  userId: string;
  habitId: string;
}

export type HabitGraduationPersistenceOutcome =
  | { type: "graduated"; habit: HabitMutationRecord }
  | { type: "already-formed"; habit: HabitMutationRecord }
  | { type: "not-found" }
  | { type: "invalid-transition"; currentStatus: HabitLifecycleState };

export interface HabitGraduationPersistence {
  graduateHabit(
    habitId: string,
    userId: string,
    graduatedAt: string,
  ): Promise<HabitGraduationPersistenceOutcome>;
}

export interface HabitReactivationRequest {
  userId: string;
  habitId: string;
}

export type HabitReactivationPersistenceOutcome =
  | { type: "reactivated"; habit: HabitMutationRecord }
  | { type: "already-active"; habit: HabitMutationRecord }
  | { type: "not-found" }
  | { type: "invalid-transition"; currentStatus: HabitLifecycleState };

export interface HabitReactivationPersistence {
  reactivateHabit(
    habitId: string,
    userId: string,
  ): Promise<HabitReactivationPersistenceOutcome>;
  markReactivated?(
    habitId: string,
    userId: string,
    reactivatedAt: string,
  ): Promise<void>;
}

export interface HabitDeletionRequest {
  userId: string;
  habitId: string;
}

export type HabitDeletionPersistenceOutcome =
  | { type: "deleted" }
  | { type: "not-found" };

export interface HabitDeletionPersistence {
  deleteHabit(
    habitId: string,
    userId: string,
  ): Promise<HabitDeletionPersistenceOutcome>;
}

export interface HabitNudgeDismissalRequest {
  userId: string;
  habitId: string;
}

export type HabitNudgeDismissalOutcome =
  | { type: "dismissed"; habit: HabitMutationRecord }
  | { type: "not-found" };

export interface HabitNudgeDismissalPersistence {
  dismissGraduationNudge(
    habitId: string,
    userId: string,
  ): Promise<HabitMutationRecord | null>;
}

type HabitWritesPersistence = Partial<HabitCreationPersistence> &
  Partial<HabitUpdatePersistence> &
  Partial<HabitLifecyclePersistence> &
  Partial<HabitGraduationPersistence> &
  Partial<HabitReactivationPersistence> &
  Partial<HabitDeletionPersistence> &
  Partial<HabitNudgeDismissalPersistence> &
  Partial<HabitReminderConfigurationPersistence>;

export type HabitCreationOutcome =
  | { type: "created"; habit: CreatedHabit }
  | { type: "invalid"; field: string; message: string }
  | { type: "limit-reached"; activeCount: number; limit: number };

export type HabitUpdateOutcome =
  | { type: "updated"; habit: UpdatedHabit }
  | { type: "not-found" }
  | { type: "conflict" }
  | { type: "invalid"; field: string; message: string };

export type HabitLifecycleOutcome =
  | { type: "transitioned"; habit: HabitMutationRecord }
  | { type: "already-applied"; habit: HabitMutationRecord }
  | { type: "not-found" }
  | {
      type: "invalid-transition";
      action: HabitLifecycleAction;
      currentStatus: HabitLifecycleState;
      message: string;
    };

export type HabitGraduationOutcome =
  | { type: "graduated"; habit: HabitMutationRecord }
  | { type: "already-formed"; habit: HabitMutationRecord }
  | { type: "not-found" }
  | {
      type: "invalid-transition";
      action: "graduate";
      currentStatus: HabitLifecycleState;
      message: string;
    };

export type HabitReactivationOutcome =
  | { type: "reactivated"; habit: HabitMutationRecord }
  | { type: "already-active"; habit: HabitMutationRecord }
  | { type: "not-found" }
  | {
      type: "invalid-transition";
      action: "reactivate";
      currentStatus: HabitLifecycleState;
      message: string;
    };

export type HabitDeletionOutcome = HabitDeletionPersistenceOutcome;

type NormalizedRequest =
  | { ok: true; record: HabitCreationRecord }
  | { ok: false; field: string; message: string };

type Clock = () => Date;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isNotFoundError(error: unknown): boolean {
  return isRecord(error) && error.code === "PGRST116";
}

function normalizeFrequency(value: unknown):
  | { ok: true; frequency: HabitCreationFrequency }
  | { ok: false } {
  if (!isRecord(value) || typeof value.type !== "string") {
    return { ok: false };
  }

  if (
    value.type === "daily" ||
    value.type === "weekdays" ||
    value.type === "weekly"
  ) {
    return { ok: true, frequency: { type: value.type } };
  }

  if (
    value.type === "times_per_week" &&
    (value.count === 2 || value.count === 3)
  ) {
    return { ok: true, frequency: { type: value.type, count: value.count } };
  }

  if (value.type === "custom" && Array.isArray(value.days)) {
    const days = value.days;
    if (
      days.length > 0 &&
      days.every(
        (day): day is number =>
          typeof day === "number" && Number.isInteger(day) && day >= 0 && day <= 6,
      )
    ) {
      return {
        ok: true,
        frequency: {
          type: value.type,
          days: [...new Set(days)].sort((left, right) => left - right),
        },
      };
    }
  }

  return { ok: false };
}

function normalizeDetails(
  values: Record<string, unknown>,
  options: { requireName: boolean; requireFrequency: boolean },
):
  | { ok: true; changes: HabitDetailChanges }
  | { ok: false; field: string; message: string } {
  const hasValue = (key: string) =>
    Object.prototype.hasOwnProperty.call(values, key) &&
    values[key] !== undefined;

  const changes: HabitDetailChanges = {};

  if (hasValue("name") || options.requireName) {
    if (typeof values.name !== "string") {
      return { ok: false, field: "name", message: "Name is required" };
    }
    const name = values.name.trim();
    if (!name) {
      return { ok: false, field: "name", message: "Name is required" };
    }
    if (name.length > 100) {
      return {
        ok: false,
        field: "name",
        message: "Name must be 100 characters or less",
      };
    }
    changes.name = name;
  }

  if (hasValue("description")) {
    if (values.description !== null && typeof values.description !== "string") {
      return {
        ok: false,
        field: "description",
        message: "Description must be text",
      };
    }
    const description =
      typeof values.description === "string"
        ? values.description.trim() || null
        : null;
    if (description && description.length > 500) {
      return {
        ok: false,
        field: "description",
        message: "Description must be 500 characters or less",
      };
    }
    changes.description = description;
  }

  if (hasValue("categoryId")) {
    if (values.categoryId !== null && typeof values.categoryId !== "string") {
      return {
        ok: false,
        field: "categoryId",
        message: "Category must be text",
      };
    }
    changes.categoryId =
      typeof values.categoryId === "string"
        ? values.categoryId.trim() || null
        : null;
  }

  if (hasValue("frequency") || options.requireFrequency) {
    const frequency = normalizeFrequency(values.frequency);
    if (!frequency.ok) {
      return {
        ok: false,
        field: "frequency",
        message: "Frequency is invalid",
      };
    }
    changes.frequency = frequency.frequency;
  }

  return { ok: true, changes };
}

function normalizeRequest(request: HabitCreationRequest): NormalizedRequest {
  if (!isRecord(request) || typeof request.userId !== "string") {
    return { ok: false, field: "userId", message: "User identity is required" };
  }

  const userId = request.userId.trim();
  if (!userId) {
    return { ok: false, field: "userId", message: "User identity is required" };
  }

  const details = normalizeDetails(request, {
    requireName: true,
    requireFrequency: true,
  });
  if (!details.ok) return details;

  return {
    ok: true,
    record: {
      userId,
      name: details.changes.name!,
      description: details.changes.description ?? null,
      categoryId: details.changes.categoryId ?? null,
      frequency: details.changes.frequency!,
      status: "active",
      currentStreak: 0,
      bestStreak: 0,
      pausedAt: null,
      graduatedAt: null,
      graduatedStreak: null,
      nudgeDismissedAt: null,
    },
  };
}

function normalizeUpdateRequest(
  request: HabitUpdateRequest,
):
  | { ok: true; userId: string; habitId: string; changes: HabitDetailChanges }
  | { ok: false; type: "conflict" }
  | { ok: false; type: "invalid"; field: string; message: string } {
  if (!isRecord(request) || typeof request.userId !== "string") {
    return {
      ok: false,
      type: "invalid",
      field: "userId",
      message: "User identity is required",
    };
  }
  const userId = request.userId.trim();
  if (!userId) {
    return {
      ok: false,
      type: "invalid",
      field: "userId",
      message: "User identity is required",
    };
  }

  if (typeof request.habitId !== "string" || !request.habitId.trim()) {
    return {
      ok: false,
      type: "invalid",
      field: "habitId",
      message: "Habit identity is required",
    };
  }

  const details = normalizeDetails(request, {
    requireName: false,
    requireFrequency: false,
  });
  if (!details.ok) {
    return {
      ok: false,
      type: "invalid",
      field: details.field,
      message: details.message,
    };
  }
  if (Object.keys(details.changes).length === 0) {
    return { ok: false, type: "conflict" };
  }

  return {
    ok: true,
    userId,
    habitId: request.habitId.trim(),
    changes: details.changes,
  };
}

type HabitReminderInvalid = { ok: false; field: string; message: string };
type HabitReminderNormalized<T> = { ok: true; value: T } | HabitReminderInvalid;
type HabitReminderRequestNormalization =
  | { ok: true; value: HabitReminderConfigurationRecord }
  | HabitReminderInvalid
  | {
      ok: false;
      outcome: Extract<HabitReminderConfigurationPersistenceOutcome, { type: "conflict" }>;
    };

const HABIT_REMINDER_CHANNELS = new Set<HabitReminderChannel>(["push", "email"]);

function normalizeHabitIdentity(
  value: unknown,
  field: "userId" | "habitId",
): HabitReminderNormalized<string> {
  if (typeof value !== "string" || !value.trim()) {
    return {
      ok: false,
      field,
      message: field === "userId"
        ? "User identity is required"
        : "Habit identity is required",
    };
  }
  return { ok: true, value: value.trim() };
}

function normalizeHabitReminder(
  value: unknown,
  index: number,
): HabitReminderNormalized<HabitReminderConfigurationRecord["reminders"][number]> {
  if (
    !isRecord(value) ||
    Array.isArray(value) ||
    (value.reminderType !== "relative" && value.reminderType !== "absolute")
  ) {
    return {
      ok: false,
      field: `reminders[${index}]`,
      message: "Reminder type is invalid",
    };
  }
  if ("sourceType" in value || "source_type" in value) {
    return {
      ok: false,
      field: `reminders[${index}].sourceType`,
      message: "Habit reminder configuration cannot select another source",
    };
  }
  if (!Array.isArray(value.channels) || value.channels.length === 0) {
    return {
      ok: false,
      field: `reminders[${index}].channels`,
      message: "At least one reminder channel is required",
    };
  }

  const channels: HabitReminderChannel[] = [];
  for (const channel of value.channels) {
    if (!HABIT_REMINDER_CHANNELS.has(channel as HabitReminderChannel)) {
      return {
        ok: false,
        field: `reminders[${index}].channels`,
        message: "Reminder channel is invalid",
      };
    }
    if (channels.includes(channel as HabitReminderChannel)) {
      return {
        ok: false,
        field: `reminders[${index}].channels`,
        message: "Reminder channels must be unique",
      };
    }
    channels.push(channel as HabitReminderChannel);
  }
  channels.sort();

  if (value.reminderType === "relative") {
    if (
      typeof value.relativeMinutes !== "number" ||
      !Number.isInteger(value.relativeMinutes) ||
      value.relativeMinutes < -525600 ||
      value.relativeMinutes > 525600
    ) {
      return {
        ok: false,
        field: `reminders[${index}].relativeMinutes`,
        message: "relativeMinutes must be a whole number within one year",
      };
    }
    return {
      ok: true,
      value: {
        reminderType: "relative",
        relativeMinutes: value.relativeMinutes,
        absoluteTime: null,
        channels,
      },
    };
  }

  if (
    typeof value.absoluteTime !== "string" ||
    !value.absoluteTime.trim() ||
    Number.isNaN(Date.parse(value.absoluteTime))
  ) {
    return {
      ok: false,
      field: `reminders[${index}].absoluteTime`,
      message: "absoluteTime must be a valid datetime",
    };
  }
  return {
    ok: true,
    value: {
      reminderType: "absolute",
      relativeMinutes: null,
      absoluteTime: value.absoluteTime.trim(),
      channels,
    },
  };
}

function normalizeHabitReminderConfigurationRequest(
  request: HabitReminderConfigurationRequest,
): HabitReminderRequestNormalization {
  if (!isRecord(request) || Array.isArray(request)) {
    return {
      ok: false,
      field: "request",
      message: "Habit reminder request is required",
    };
  }
  if ("sourceType" in request || "source_type" in request) {
    return {
      ok: false,
      field: "sourceType",
      message: "Habit reminder configuration cannot select another source",
    };
  }

  const userId = normalizeHabitIdentity(request.userId, "userId");
  if (!userId.ok) return userId;
  const habitId = normalizeHabitIdentity(request.habitId, "habitId");
  if (!habitId.ok) return habitId;
  if (!Array.isArray(request.reminders)) {
    return { ok: false, field: "reminders", message: "reminders must be an array" };
  }

  let referenceTime: string | null = null;
  if (request.referenceTime !== undefined && request.referenceTime !== null) {
    if (
      typeof request.referenceTime !== "string" ||
      !request.referenceTime.trim() ||
      Number.isNaN(Date.parse(request.referenceTime))
    ) {
      return {
        ok: false,
        field: "referenceTime",
        message: "Reference time must be a valid datetime",
      };
    }
    referenceTime = request.referenceTime.trim();
  }

  const reminders: HabitReminderConfigurationRecord["reminders"] = [];
  const seen = new Set<string>();
  for (const [index, input] of request.reminders.entries()) {
    const reminder = normalizeHabitReminder(input, index);
    if (!reminder.ok) return reminder;
    if (reminder.value.reminderType === "relative" && referenceTime === null) {
      return {
        ok: false,
        field: "referenceTime",
        message: "A relative reminder requires a valid reference time",
      };
    }
    const fingerprint = JSON.stringify(reminder.value);
    if (seen.has(fingerprint)) {
      return {
        ok: false,
        outcome: {
          type: "conflict",
          resource: "reminder",
          reason: "Duplicate reminder configuration",
        },
      };
    }
    seen.add(fingerprint);
    reminders.push(reminder.value);
  }

  return {
    ok: true,
    value: {
      userId: userId.value,
      habitId: habitId.value,
      referenceTime,
      reminders,
    },
  };
}

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

function toHabitMutationRecord(habit: Habit): HabitMutationRecord {
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

function mapStoredHabitGraduationOutcome(
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

function mapStoredHabitReactivationOutcome(
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

function mapStoredHabitDeletionOutcome(
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
