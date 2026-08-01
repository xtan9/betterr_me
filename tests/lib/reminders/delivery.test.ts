import { describe, expect, it } from "vitest";
import {
  REMINDER_DELIVERY_MAX_STALE_AGE_MS,
  ReminderDelivery,
  decideReminderDeliveryTransition,
  trustedOperationalDispatchContext,
  userReminderDeliveryContext,
  type ReminderDeliveryPersistence,
  type ReminderDeliveryRecord,
  type ReminderDeliveryContext,
  type ReminderDeliveryTransitionRequest,
} from "@/lib/reminders/delivery";

const NOW = new Date("2026-08-01T12:00:00.000Z");
const USER_ID = "user-1";

function pendingReminder(
  overrides: Partial<ReminderDeliveryRecord> = {},
): ReminderDeliveryRecord {
  return {
    id: "reminder-1",
    userId: USER_ID,
    sourceType: "task",
    sourceId: "task-1",
    reminderType: "absolute",
    relativeMinutes: null,
    absoluteTime: "2026-08-01T11:30:00.000Z",
    channels: ["push"],
    status: "pending",
    fireAt: "2026-08-01T11:30:00.000Z",
    sentAt: null,
    createdAt: "2026-08-01T10:00:00.000Z",
    ...overrides,
  };
}

class FakeDeliveryPersistence implements ReminderDeliveryPersistence {
  record: ReminderDeliveryRecord | null;
  readonly applied: Array<Parameters<ReminderDeliveryPersistence["applyTransition"]>[0]> = [];
  nextOutcome: Awaited<ReturnType<ReminderDeliveryPersistence["applyTransition"]>> | null = null;

  constructor(record: ReminderDeliveryRecord | null = pendingReminder()) {
    this.record = record;
  }

  async getReminder(userId: string, reminderId: string) {
    if (this.record?.userId !== userId || this.record.id !== reminderId) return null;
    return this.record;
  }

  async applyTransition(
    request: Parameters<ReminderDeliveryPersistence["applyTransition"]>[0],
  ) {
    this.applied.push(request);
    if (this.nextOutcome) return this.nextOutcome;
    const reminder = this.record!;
    return {
      type: "transitioned" as const,
      reminder: {
        ...reminder,
        status: request.next.status,
        fireAt: request.next.fireAt,
        sentAt: request.next.sentAt,
      },
      transition: request.transition.type,
    };
  }
}

function deliveryRequest(
  transition: ReminderDeliveryTransitionRequest["transition"],
  context: ReminderDeliveryContext = userReminderDeliveryContext(USER_ID),
): ReminderDeliveryTransitionRequest {
  return { reminderId: "reminder-1", context, transition };
}

function createDelivery(persistence: FakeDeliveryPersistence) {
  return new ReminderDelivery(persistence, {
    clock: () => NOW,
  });
}

describe("Reminder Delivery state machine", () => {
  it("snoozes a pending reminder without changing Reminder Configuration", async () => {
    const persistence = new FakeDeliveryPersistence();
    const result = await createDelivery(persistence).transition(
      deliveryRequest({
        type: "snooze",
        fireAt: "2026-08-01T13:00:00.000Z",
      }),
    );

    expect(result).toMatchObject({
      type: "transitioned",
      reminder: {
        status: "pending",
        fireAt: "2026-08-01T13:00:00.000Z",
        sentAt: null,
      },
    });
    expect(persistence.applied[0]?.transition).toEqual({
      type: "snooze",
      fireAt: "2026-08-01T13:00:00.000Z",
    });
  });

  it("returns already-applied for an identical repeated snooze", async () => {
    const persistence = new FakeDeliveryPersistence(
      pendingReminder({ fireAt: "2026-08-01T13:00:00.000Z" }),
    );

    const result = await createDelivery(persistence).transition(
      deliveryRequest({
        type: "snooze",
        fireAt: "2026-08-01T13:00:00.000Z",
      }),
    );

    expect(result).toMatchObject({
      type: "already-applied",
      reminder: { status: "pending", fireAt: "2026-08-01T13:00:00.000Z" },
    });
    expect(persistence.applied).toHaveLength(0);
  });

  it("transitions a pending reminder to sent and makes a repeated send idempotent", async () => {
    const persistence = new FakeDeliveryPersistence();
    const delivery = createDelivery(persistence);
    const sent = await delivery.transition(deliveryRequest({ type: "sent" }));

    expect(sent).toMatchObject({
      type: "transitioned",
      reminder: { status: "sent", sentAt: NOW.toISOString() },
    });

    persistence.record = {
      ...persistence.record!,
      status: "sent",
      sentAt: NOW.toISOString(),
    };
    const repeated = await delivery.transition(deliveryRequest({ type: "sent" }));

    expect(repeated).toMatchObject({ type: "already-applied", reminder: { status: "sent" } });
  });

  it("transitions a pending delivery failure to failed and makes retries terminal", async () => {
    const persistence = new FakeDeliveryPersistence();
    const delivery = new ReminderDelivery(persistence, { clock: () => NOW });
    const failed = await delivery.transition(
      deliveryRequest(
        { type: "failed" },
        trustedOperationalDispatchContext(USER_ID),
      ),
    );

    expect(failed).toMatchObject({ type: "transitioned", reminder: { status: "failed" } });

    persistence.record = { ...persistence.record!, status: "failed" };
    const repeated = await delivery.transition(
      deliveryRequest(
        { type: "failed" },
        trustedOperationalDispatchContext(USER_ID),
      ),
    );
    expect(repeated).toMatchObject({ type: "already-applied", reminder: { status: "failed" } });
  });

  it("retires a pending unsupported-source reminder through failed", async () => {
    const persistence = new FakeDeliveryPersistence(
      pendingReminder({ sourceType: "legacy_bill" }),
    );
    const result = await createDelivery(persistence).transition(
      deliveryRequest(
        { type: "retire-unsupported-source" },
        trustedOperationalDispatchContext(USER_ID),
      ),
    );

    expect(result).toMatchObject({ type: "transitioned", reminder: { status: "failed" } });
  });

  it("marks a stale pending delivery failed only after the retry horizon", () => {
    const stale = decideReminderDeliveryTransition(
      pendingReminder({
        fireAt: new Date(
          NOW.getTime() - REMINDER_DELIVERY_MAX_STALE_AGE_MS - 1,
        ).toISOString(),
      }),
      { type: "stale" },
      { context: trustedOperationalDispatchContext(USER_ID), now: NOW },
    );
    const fresh = decideReminderDeliveryTransition(
      pendingReminder({ fireAt: new Date(NOW.getTime() - 1).toISOString() }),
      { type: "stale" },
      { context: trustedOperationalDispatchContext(USER_ID), now: NOW },
    );

    expect(stale).toMatchObject({ type: "apply", next: { status: "failed" } });
    expect(fresh).toMatchObject({
      type: "invalid-transition",
      reason: "Reminder has not exceeded the stale delivery retry horizon",
    });
  });

  it("enforces trusted identity and keeps cross-user access indistinguishable from not found", async () => {
    const persistence = new FakeDeliveryPersistence();
    const result = await createDelivery(persistence).transition({
      reminderId: "reminder-1",
      context: userReminderDeliveryContext("other-user"),
      transition: { type: "sent" },
    });

    expect(result).toEqual({ type: "not-found" });
    expect(persistence.applied).toHaveLength(0);
  });

  it("normalizes reminder and user identity before persistence", async () => {
    const persistence = new FakeDeliveryPersistence();
    const result = await createDelivery(persistence).transition({
      reminderId: " reminder-1 ",
      context: {
        type: "user",
        userId: " user-1 ",
      },
      transition: { type: "sent" },
    });

    expect(result).toMatchObject({ type: "transitioned" });
    expect(persistence.applied[0]).toMatchObject({
      reminderId: "reminder-1",
      userId: "user-1",
    });
  });

  it.each([
    ["snooze after sent", pendingReminder({ status: "sent", sentAt: NOW.toISOString() }), { type: "snooze", fireAt: "2026-08-01T13:00:00.000Z" }],
    ["send after failed", pendingReminder({ status: "failed" }), { type: "sent" }],
    ["retire a supported source", pendingReminder({ sourceType: "task" }), { type: "retire-unsupported-source" }],
  ] as const)("rejects %s", (_label, record, transition) => {
    const result = decideReminderDeliveryTransition(
      record,
      transition,
      { context: trustedOperationalDispatchContext(USER_ID), now: NOW },
    );

    expect(result).toMatchObject({ type: "invalid-transition" });
  });

  it("rejects operational snooze and user-authored operational outcomes", () => {
    const operationalSnooze = decideReminderDeliveryTransition(
      pendingReminder(),
      { type: "snooze", fireAt: "2026-08-01T13:00:00.000Z" },
      { context: trustedOperationalDispatchContext(USER_ID), now: NOW },
    );
    const userFailure = decideReminderDeliveryTransition(
      pendingReminder(),
      { type: "failed" },
      { context: userReminderDeliveryContext(USER_ID), now: NOW },
    );

    expect(operationalSnooze).toMatchObject({ type: "invalid-transition" });
    expect(userFailure).toMatchObject({ type: "invalid-transition" });
  });

  it("treats legacy snoozed state as terminal and supports its idempotent replay", async () => {
    const persistence = new FakeDeliveryPersistence();
    const delivery = createDelivery(persistence);
    const first = await delivery.transition(
      deliveryRequest({ type: "legacy-snooze" }),
    );
    expect(first).toMatchObject({ type: "transitioned", reminder: { status: "snoozed" } });

    persistence.record = { ...persistence.record!, status: "snoozed" };
    const replay = await delivery.transition(
      deliveryRequest({ type: "legacy-snooze" }),
    );
    expect(replay).toMatchObject({ type: "already-applied", reminder: { status: "snoozed" } });
  });

  it("rejects configuration-shaped runtime requests at the Delivery boundary", async () => {
    const persistence = new FakeDeliveryPersistence();
    const result = await createDelivery(persistence).transition({
      reminderId: "reminder-1",
      context: userReminderDeliveryContext(USER_ID),
      transition: {
        type: "snooze",
        fireAt: "2026-08-01T13:00:00.000Z",
        channels: ["email"],
      } as never,
    });

    expect(result).toMatchObject({
      type: "invalid-transition",
      reason: "Reminder Configuration changes must use the source lifecycle boundary",
    });
    expect(persistence.applied).toHaveLength(0);
  });
});
