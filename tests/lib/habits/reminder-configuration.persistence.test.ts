import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  SupabaseHabitReminderConfigurationPersistence,
  type HabitReminderConfigurationRecord,
} from "@/lib/habits/writes";

const reminderRow = {
  id: "reminder-1",
  user_id: "user-1",
  source_type: "habit",
  source_id: "habit-1",
  reminder_type: "absolute",
  relative_minutes: null,
  absolute_time: "2026-08-03T09:00:00.000Z",
  channels: ["push"],
  status: "pending",
  fire_at: "2026-08-03T09:00:00.000Z",
  sent_at: null,
  created_at: "2026-08-01T00:00:00.000Z",
};

const record: HabitReminderConfigurationRecord = {
  userId: "user-1",
  habitId: "habit-1",
  referenceTime: null,
  reminders: [{
    reminderType: "absolute",
    relativeMinutes: null,
    absoluteTime: "2026-08-03T09:00:00Z",
    channels: ["push"],
  }],
};

describe("SupabaseHabitReminderConfigurationPersistence", () => {
  const rpc = vi.fn();
  let persistence: SupabaseHabitReminderConfigurationPersistence;

  beforeEach(() => {
    vi.clearAllMocks();
    persistence = new SupabaseHabitReminderConfigurationPersistence({ rpc } as never);
  });

  it("uses one atomic Habit-scoped RPC and maps configured reminders", async () => {
    rpc.mockResolvedValue({
      data: { type: "configured", reminders: [reminderRow] },
      error: null,
    });

    await expect(persistence.configureHabitReminders(record)).resolves.toEqual({
      type: "configured",
      reminders: [{
        id: "reminder-1",
        userId: "user-1",
        habitId: "habit-1",
        reminderType: "absolute",
        relativeMinutes: null,
        absoluteTime: "2026-08-03T09:00:00.000Z",
        channels: ["push"],
        status: "pending",
        fireAt: "2026-08-03T09:00:00.000Z",
        sentAt: null,
        createdAt: "2026-08-01T00:00:00.000Z",
      }],
    });
    expect(rpc).toHaveBeenCalledWith("configure_habit_reminders", {
      p_user_id: "user-1",
      p_habit_id: "habit-1",
      p_reference_time: null,
      p_reminders: [{
        reminder_type: "absolute",
        relative_minutes: null,
        absolute_time: "2026-08-03T09:00:00Z",
        channels: ["push"],
      }],
    });
  });

  it.each([
    ["removed", { type: "removed", reminders: [] }],
    ["already-applied", { type: "already-applied", reminders: [reminderRow] }],
    ["not-found", { type: "not-found" }],
    ["conflict", { type: "conflict", resource: "reminder", reason: "busy" }],
    ["invalid", { type: "invalid", field: "reminders", message: "invalid" }],
  ] as const)("maps a typed %s database outcome", async (_label, data) => {
    rpc.mockResolvedValue({ data, error: null });

    await expect(persistence.configureHabitReminders(record)).resolves.toEqual(
      data.type === "already-applied"
        ? {
            type: "already-applied",
            reminders: [{
              id: "reminder-1",
              userId: "user-1",
              habitId: "habit-1",
              reminderType: "absolute",
              relativeMinutes: null,
              absoluteTime: "2026-08-03T09:00:00.000Z",
              channels: ["push"],
              status: "pending",
              fireAt: "2026-08-03T09:00:00.000Z",
              sentAt: null,
              createdAt: "2026-08-01T00:00:00.000Z",
            }],
          }
        : data,
    );
  });

  it("propagates infrastructure failures and rejects malformed outcomes", async () => {
    const failure = { code: "42P01", message: "function missing" };
    rpc.mockResolvedValue({ data: null, error: failure });
    await expect(persistence.configureHabitReminders(record)).rejects.toBe(failure);

    rpc.mockResolvedValue({ data: { type: "configured", reminders: [{ id: "bad" }] }, error: null });
    await expect(persistence.configureHabitReminders(record)).rejects.toThrow(
      "Invalid habit reminder returned by the database",
    );

    rpc.mockResolvedValue({ data: { type: "unexpected" }, error: null });
    await expect(persistence.configureHabitReminders(record)).rejects.toThrow(
      "Invalid habit reminder configuration outcome returned by the database",
    );
  });
});
