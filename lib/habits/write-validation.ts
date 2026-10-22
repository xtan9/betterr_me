/** Normalizes habit creation and editing before persistence. */

import type {
  HabitCreationFrequency,
  HabitDetailChanges,
  HabitCreationRequest,
  NormalizedRequest,
  HabitUpdateRequest,
  HabitReminderChannel,
  HabitReminderNormalized,
} from "./write-contract";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
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

export function normalizeRequest(request: HabitCreationRequest): NormalizedRequest {
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

export function normalizeUpdateRequest(
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

export const HABIT_REMINDER_CHANNELS = new Set<HabitReminderChannel>(["push", "email"]);

export function normalizeHabitIdentity(
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
