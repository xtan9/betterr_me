import type { SupabaseClient } from "@supabase/supabase-js";
import {
  type ReminderDeliveryContext,
  type ReminderDeliveryPersistence,
  type ReminderDeliveryPersistenceTransitionRequest,
  type ReminderDeliveryRecord,
  type ReminderDeliveryStatus,
  type ReminderDeliveryTransition,
  type ReminderDeliveryTransitionOutcome,
} from "./delivery";

export interface ReminderDeliveryDatabaseRow {
  id: unknown;
  user_id: unknown;
  source_type: unknown;
  source_id: unknown;
  reminder_type: unknown;
  relative_minutes: unknown;
  absolute_time: unknown;
  channels: unknown;
  status: unknown;
  fire_at: unknown;
  sent_at: unknown;
  created_at: unknown;
}

export class SupabaseReminderDeliveryPersistence
  implements ReminderDeliveryPersistence
{
  constructor(private readonly supabase: SupabaseClient) {}

  async getReminder(
    userId: string,
    reminderId: string,
  ): Promise<ReminderDeliveryRecord | null> {
    const { data, error } = await this.supabase
      .from("reminders")
      .select("*")
      .eq("id", reminderId)
      .eq("user_id", userId)
      .maybeSingle();

    if (error) throw error;
    return data === null ? null : toReminderDeliveryRecord(data);
  }

  async applyTransition(
    request: ReminderDeliveryPersistenceTransitionRequest,
  ): Promise<ReminderDeliveryTransitionOutcome> {
    const { data, error } = await this.supabase.rpc("transition_reminder_delivery", {
      p_user_id: request.userId,
      p_reminder_id: request.reminderId,
      p_context: databaseContext(request.context),
      p_transition: request.transition.type,
      p_fire_at: request.next.fireAt,
      p_sent_at: request.next.sentAt,
      p_expected_status: request.expected.status,
      p_expected_fire_at: request.expected.fireAt,
      p_expected_sent_at: request.expected.sentAt,
    });

    if (error) throw error;
    return mapReminderDeliveryOutcome(data);
  }
}

function databaseContext(context: ReminderDeliveryContext) {
  return context.type;
}

export function toReminderDeliveryRecord(
  value: unknown,
): ReminderDeliveryRecord {
  if (!isRecord(value)) {
    throw new Error("Invalid Reminder Delivery record returned by the database");
  }

  if (
    !isNonEmptyString(value.id) ||
    !isNonEmptyString(value.user_id) ||
    !isNonEmptyString(value.source_type) ||
    !isNonEmptyString(value.source_id) ||
    (value.reminder_type !== "relative" && value.reminder_type !== "absolute") ||
    !isNullableNumber(value.relative_minutes) ||
    !isNullableString(value.absolute_time) ||
    !isReminderDeliveryChannels(value.channels) ||
    !isReminderDeliveryStatus(value.status) ||
    !isNonEmptyString(value.fire_at) ||
    !isNullableString(value.sent_at) ||
    !isNonEmptyString(value.created_at)
  ) {
    throw new Error("Invalid Reminder Delivery record returned by the database");
  }

  return {
    id: value.id,
    userId: value.user_id,
    sourceType: value.source_type,
    sourceId: value.source_id,
    reminderType: value.reminder_type,
    relativeMinutes: value.relative_minutes,
    absoluteTime: value.absolute_time,
    channels: value.channels,
    status: value.status,
    fireAt: value.fire_at,
    sentAt: value.sent_at,
    createdAt: value.created_at,
  };
}

export function mapReminderDeliveryOutcome(
  value: unknown,
): ReminderDeliveryTransitionOutcome {
  if (!isRecord(value) || typeof value.type !== "string") {
    throw new Error("Invalid Reminder Delivery outcome returned by the database");
  }

  if (value.type === "not-found") return { type: "not-found" };
  if (value.type === "conflict") {
    if (value.reason !== undefined && typeof value.reason !== "string") {
      throw new Error("Invalid Reminder Delivery outcome returned by the database");
    }
    return {
      type: "conflict",
      ...(value.reason === undefined ? {} : { reason: value.reason }),
    };
  }

  if (value.type === "invalid-transition") {
    if (
      typeof value.action !== "string" ||
      typeof value.reason !== "string" ||
      (value.current_status !== undefined &&
        !isReminderDeliveryStatus(value.current_status))
    ) {
      throw new Error("Invalid Reminder Delivery outcome returned by the database");
    }
    return {
      type: "invalid-transition",
      action: value.action,
      reason: value.reason,
      ...(value.current_status === undefined
        ? {}
        : { currentStatus: value.current_status }),
    };
  }

  if (value.type === "transitioned" || value.type === "already-applied") {
    if (
      !isReminderDeliveryTransitionType(value.transition) ||
      value.reminder === undefined
    ) {
      throw new Error("Invalid Reminder Delivery outcome returned by the database");
    }
    const reminder = toReminderDeliveryRecord(value.reminder);
    return {
      type: value.type,
      transition: value.transition,
      reminder,
    };
  }

  throw new Error("Invalid Reminder Delivery outcome returned by the database");
}

function isReminderDeliveryTransitionType(
  value: unknown,
): value is ReminderDeliveryTransition["type"] {
  return [
    "snooze",
    "legacy-snooze",
    "sent",
    "failed",
    "stale",
    "retire-unsupported-source",
  ].includes(value as ReminderDeliveryTransition["type"]);
}

function isReminderDeliveryStatus(value: unknown): value is ReminderDeliveryStatus {
  return ["pending", "sent", "failed", "snoozed"].includes(
    value as ReminderDeliveryStatus,
  );
}

function isReminderDeliveryChannels(
  value: unknown,
): value is Array<"push" | "email"> {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((channel) => channel === "push" || channel === "email")
  );
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isNullableNumber(value: unknown): value is number | null {
  return value === null || typeof value === "number";
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
