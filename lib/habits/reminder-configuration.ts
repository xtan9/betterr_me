/** Normalizes complete habit reminder collections and detects conflicting configurations. */

import type {
  HabitReminderNormalized,
  HabitReminderConfigurationRecord,
  HabitReminderChannel,
  HabitReminderConfigurationRequest,
  HabitReminderRequestNormalization,
} from "./write-contract";

import { isRecord, HABIT_REMINDER_CHANNELS, normalizeHabitIdentity } from "./write-validation";

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

export function normalizeHabitReminderConfigurationRequest(
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
