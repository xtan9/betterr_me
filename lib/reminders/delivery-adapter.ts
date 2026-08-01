import type {
  ReminderDeliveryRecord,
  ReminderDeliveryTransition,
  ReminderDeliveryTransitionOutcome,
} from "./delivery";

export interface ReminderDeliveryPatchValues {
  status?: "pending" | "sent" | "failed" | "snoozed";
  fire_at?: string;
  sent_at?: string | null;
  channels?: readonly ("push" | "email")[];
}

export type ReminderDeliveryPatchMapping =
  | { ok: true; transition: ReminderDeliveryTransition }
  | { ok: false; reason: string; status: 400 };

export function reminderDeliveryPatchToTransition(
  patch: ReminderDeliveryPatchValues,
): ReminderDeliveryPatchMapping {
  if (patch.channels !== undefined) {
    return {
      ok: false,
      status: 400,
      reason: "Reminder Configuration changes must use the source lifecycle boundary",
    };
  }

  if (patch.status === undefined) {
    return {
      ok: false,
      status: 400,
      reason: "A delivery status is required when changing delivery timestamps",
    };
  }

  if (patch.status === "pending") {
    if (
      typeof patch.fire_at !== "string" ||
      patch.sent_at !== undefined && patch.sent_at !== null
    ) {
      return {
        ok: false,
        status: 400,
        reason: "Snooze requires fire_at and cannot set sent_at",
      };
    }
    return {
      ok: true,
      transition: { type: "snooze", fireAt: patch.fire_at },
    };
  }

  if (patch.status === "sent") {
    if (patch.fire_at !== undefined) {
      return {
        ok: false,
        status: 400,
        reason: "Sent transitions cannot change fire_at",
      };
    }
    return {
      ok: true,
      transition: {
        type: "sent",
        ...(patch.sent_at === undefined || patch.sent_at === null
          ? {}
          : { sentAt: patch.sent_at }),
      },
    };
  }

  if (patch.status === "failed") {
    if (patch.fire_at !== undefined || patch.sent_at !== undefined && patch.sent_at !== null) {
      return {
        ok: false,
        status: 400,
        reason: "Failed transitions cannot set delivery timestamps",
      };
    }
    return { ok: true, transition: { type: "failed" } };
  }

  if (patch.fire_at !== undefined || patch.sent_at !== undefined && patch.sent_at !== null) {
    return {
      ok: false,
      status: 400,
      reason: "A legacy snooze cannot change delivery timestamps",
    };
  }
  return { ok: true, transition: { type: "legacy-snooze" } };
}

export function toReminderResponse(reminder: ReminderDeliveryRecord) {
  return {
    id: reminder.id,
    user_id: reminder.userId,
    source_type: reminder.sourceType,
    source_id: reminder.sourceId,
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

export function reminderDeliveryOutcomeToAi(
  outcome: ReminderDeliveryTransitionOutcome,
) {
  if (outcome.type === "not-found") return { error: "Reminder not found" };
  if (outcome.type === "conflict") {
    return { error: outcome.reason ?? "Reminder Delivery conflicted" };
  }
  if (outcome.type === "invalid-transition") {
    return { error: outcome.reason, transition: outcome.action };
  }
  return {
    ...toReminderResponse(outcome.reminder),
    outcome: outcome.type,
  };
}
