import { describe, expect, it } from "vitest";
import {
  reminderDeliveryOutcomeToAi,
  reminderDeliveryPatchToTransition,
  toReminderResponse,
} from "@/lib/reminders/delivery-adapter";
import type { ReminderDeliveryRecord } from "@/lib/reminders/delivery";

const reminder: ReminderDeliveryRecord = {
  id: "r1",
  userId: "u1",
  sourceType: "calendar_event",
  sourceId: "e1",
  reminderType: "absolute",
  relativeMinutes: null,
  absoluteTime: "2026-08-01T13:00:00.000Z",
  channels: ["push"],
  status: "pending",
  fireAt: "2026-08-01T13:00:00.000Z",
  sentAt: null,
  createdAt: "2026-08-01T12:00:00.000Z",
};

describe("Reminder Delivery channel adapters", () => {
  it.each([
    [{ status: "pending", fire_at: "2026-08-01T14:00:00.000Z" }, { type: "snooze", fireAt: "2026-08-01T14:00:00.000Z" }],
    [{ status: "sent" }, { type: "sent" }],
    [{ status: "failed" }, { type: "failed" }],
    [{ status: "snoozed" }, { type: "legacy-snooze" }],
  ] as const)("maps %o to one delivery transition", (patch, transition) => {
    expect(reminderDeliveryPatchToTransition(patch)).toEqual({
      ok: true,
      transition,
    });
  });

  it("rejects timestamp-only and mixed configuration updates", () => {
    expect(reminderDeliveryPatchToTransition({ fire_at: "2026-08-01T14:00:00.000Z" })).toMatchObject({
      ok: false,
      reason: "A delivery status is required when changing delivery timestamps",
    });
    expect(reminderDeliveryPatchToTransition({ status: "pending", channels: ["email"] })).toMatchObject({
      ok: false,
      reason: "Reminder Configuration changes must use the source lifecycle boundary",
    });
  });

  it("rejects impossible timestamp combinations before the domain call", () => {
    expect(reminderDeliveryPatchToTransition({
      status: "sent",
      fire_at: "2026-08-01T14:00:00.000Z",
    })).toMatchObject({ ok: false });
    expect(reminderDeliveryPatchToTransition({
      status: "pending",
      fire_at: "2026-08-01T14:00:00.000Z",
      sent_at: "2026-08-01T13:30:00.000Z",
    })).toMatchObject({ ok: false });
  });

  it("keeps AI responses channel-shaped while preserving typed outcome meaning", () => {
    expect(reminderDeliveryOutcomeToAi({
      type: "already-applied",
      transition: "sent",
      reminder: { ...reminder, status: "sent", sentAt: "2026-08-01T13:01:00.000Z" },
    })).toEqual({
      ...toReminderResponse({ ...reminder, status: "sent", sentAt: "2026-08-01T13:01:00.000Z" }),
      outcome: "already-applied",
    });
    expect(reminderDeliveryOutcomeToAi({
      type: "conflict",
      reason: "changed",
    })).toEqual({ error: "changed" });
  });
});
