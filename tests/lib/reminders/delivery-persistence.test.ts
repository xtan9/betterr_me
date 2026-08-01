import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  SupabaseReminderDeliveryPersistence,
  type ReminderDeliveryDatabaseRow,
} from "@/lib/reminders/delivery-persistence";
import {
  trustedOperationalDispatchContext,
  type ReminderDeliveryPersistenceTransitionRequest,
} from "@/lib/reminders/delivery";

const USER_ID = "user-1";
const REMINDER_ID = "reminder-1";

const row: ReminderDeliveryDatabaseRow = {
  id: REMINDER_ID,
  user_id: USER_ID,
  source_type: "task",
  source_id: "task-1",
  reminder_type: "absolute",
  relative_minutes: null,
  absolute_time: "2026-08-01T13:00:00.000Z",
  channels: ["push"],
  status: "pending",
  fire_at: "2026-08-01T13:00:00.000Z",
  sent_at: null,
  created_at: "2026-08-01T12:00:00.000Z",
};

const transition: ReminderDeliveryPersistenceTransitionRequest = {
  reminderId: REMINDER_ID,
  userId: USER_ID,
  context: trustedOperationalDispatchContext(USER_ID),
  expected: {
    status: "pending",
    fireAt: "2026-08-01T13:00:00.000Z",
    sentAt: null,
  },
  transition: { type: "sent", sentAt: "2026-08-01T13:01:00.000Z" },
  next: {
    status: "sent",
    fireAt: "2026-08-01T13:00:00.000Z",
    sentAt: "2026-08-01T13:01:00.000Z",
  },
};

describe("SupabaseReminderDeliveryPersistence", () => {
  const rpc = vi.fn();
  const from = vi.fn();
  let persistence: SupabaseReminderDeliveryPersistence;

  beforeEach(() => {
    vi.clearAllMocks();
    persistence = new SupabaseReminderDeliveryPersistence({ rpc, from } as never);
  });

  it("reads one reminder scoped by both user and reminder identity", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: row, error: null });
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle,
    };
    from.mockReturnValue(chain);

    await expect(persistence.getReminder(USER_ID, REMINDER_ID)).resolves.toMatchObject({
      id: REMINDER_ID,
      userId: USER_ID,
      sourceType: "task",
      status: "pending",
    });
    expect(from).toHaveBeenCalledWith("reminders");
    expect(chain.eq).toHaveBeenNthCalledWith(1, "id", REMINDER_ID);
    expect(chain.eq).toHaveBeenNthCalledWith(2, "user_id", USER_ID);
  });

  it("maps a transitioned database outcome and sends expected state for atomic idempotency", async () => {
    rpc.mockResolvedValue({
      data: { type: "transitioned", transition: "sent", reminder: row },
      error: null,
    });

    await expect(persistence.applyTransition(transition)).resolves.toMatchObject({
      type: "transitioned",
      transition: "sent",
      reminder: { id: REMINDER_ID, userId: USER_ID, status: "pending" },
    });
    expect(rpc).toHaveBeenCalledWith("transition_reminder_delivery", {
      p_user_id: USER_ID,
      p_reminder_id: REMINDER_ID,
      p_context: "operational",
      p_transition: "sent",
      p_fire_at: "2026-08-01T13:00:00.000Z",
      p_sent_at: "2026-08-01T13:01:00.000Z",
      p_expected_status: "pending",
      p_expected_fire_at: "2026-08-01T13:00:00.000Z",
      p_expected_sent_at: null,
    });
  });

  it.each([
    ["already-applied", { type: "already-applied", transition: "sent", reminder: row }],
    ["not-found", { type: "not-found" }],
    ["conflict", { type: "conflict", reason: "Reminder changed while dispatching" }],
    ["invalid-transition", {
      type: "invalid-transition",
      action: "sent",
      reason: "Only pending reminders can be sent",
      current_status: "failed",
    }],
  ] as const)("maps a typed %s outcome", async (_label, data) => {
    rpc.mockResolvedValue({ data, error: null });

    await expect(persistence.applyTransition(transition)).resolves.toMatchObject(
      data.type === "already-applied"
        ? { type: "already-applied", transition: "sent", reminder: { id: REMINDER_ID } }
        : data.type === "invalid-transition"
          ? {
              type: "invalid-transition",
              action: "sent",
              reason: "Only pending reminders can be sent",
              currentStatus: "failed",
            }
          : data,
    );
  });

  it("propagates infrastructure errors and rejects malformed database rows/outcomes", async () => {
    const failure = { code: "42P01", message: "function missing" };
    rpc.mockResolvedValue({ data: null, error: failure });
    await expect(persistence.applyTransition(transition)).rejects.toBe(failure);

    rpc.mockResolvedValue({
      data: { type: "transitioned", transition: "sent", reminder: { id: REMINDER_ID } },
      error: null,
    });
    await expect(persistence.applyTransition(transition)).rejects.toThrow(
      "Invalid Reminder Delivery record returned by the database",
    );

    rpc.mockResolvedValue({ data: { type: "unexpected" }, error: null });
    await expect(persistence.applyTransition(transition)).rejects.toThrow(
      "Invalid Reminder Delivery outcome returned by the database",
    );
  });
});
