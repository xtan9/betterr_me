import { describe, it, expect, vi, beforeEach } from "vitest";
import { reminderTools } from "@/lib/ai/tools/reminders";
import type { ToolContext } from "@/lib/ai/tools/types";

const mockGetPendingReminders = vi.fn();
const mockGetReminder = vi.fn();
const mockDeliveryTransition = vi.fn();
const { mockCreateReminderDelivery } = vi.hoisted(() => ({
  mockCreateReminderDelivery: vi.fn(),
}));
const { mockConfigureTaskReminders } = vi.hoisted(() => ({
  mockConfigureTaskReminders: vi.fn(),
}));
const { mockConfigureHabitReminders } = vi.hoisted(() => ({
  mockConfigureHabitReminders: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  RemindersDB: class {
    getPendingReminders = mockGetPendingReminders;
    getReminder = mockGetReminder;
  },
}));

vi.mock("@/lib/reminders/delivery-service", () => ({
  createReminderDelivery: mockCreateReminderDelivery,
}));

vi.mock("@/lib/tasks/writes", () => ({
  createTaskWrites: vi.fn(() => ({
    configureReminders: mockConfigureTaskReminders,
  })),
  toTaskReminderResponse: (reminder: unknown) => reminder,
}));

vi.mock("@/lib/habits/writes", () => ({
  createHabitWrites: vi.fn(() => ({
    configureReminders: mockConfigureHabitReminders,
  })),
  toHabitReminderResponse: (reminder: unknown) => reminder,
}));

function makeCtx(): ToolContext {
  return {
    userId: "user-123",
    supabase: {} as ToolContext["supabase"],
    date: "2026-04-10",
    timezone: "America/Toronto",
  };
}

function makeDeliveryReminder(overrides: Record<string, unknown> = {}) {
  return {
    id: "r1",
    userId: "user-123",
    sourceType: "task",
    sourceId: "t1",
    reminderType: "absolute",
    relativeMinutes: null,
    absoluteTime: "2026-04-10T09:00:00Z",
    channels: ["push"],
    status: "sent",
    fireAt: "2026-04-10T09:00:00Z",
    sentAt: "2026-04-10T09:01:00Z",
    createdAt: "2026-04-09T09:00:00Z",
    ...overrides,
  };
}

function findTool(name: string) {
  return reminderTools().find((tool) => tool.name === name)!;
}

describe("reminderTools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetReminder.mockResolvedValue({
      id: "r1",
      source_type: "task",
      source_id: "t1",
    });
    mockConfigureTaskReminders.mockResolvedValue({
      type: "configured",
      reminders: [{ id: "r1", source_type: "task" }],
    });
    mockConfigureHabitReminders.mockResolvedValue({
      type: "configured",
      reminders: [{ id: "r1", source_type: "habit" }],
    });
    mockCreateReminderDelivery.mockReturnValue({
      transition: mockDeliveryTransition,
    });
    mockDeliveryTransition.mockResolvedValue({
      type: "transitioned",
      reminder: makeDeliveryReminder(),
      transition: "sent",
    });
  });

  it("returns 4 tool definitions", () => {
    expect(reminderTools().map((tool) => tool.name)).toEqual([
      "getUpcomingReminders",
      "createReminder",
      "dismissReminder",
      "deleteReminder",
    ]);
  });

  it("routes task reminder configuration through TaskWrites", async () => {
    await findTool("createReminder").execute(
      { sourceType: "task", sourceId: "t1", fireAt: "2026-04-10T09:00:00Z" },
      makeCtx(),
    );
    expect(mockConfigureTaskReminders).toHaveBeenCalledWith({
      userId: "user-123",
      taskId: "t1",
      reminders: [{
        reminderType: "absolute",
        absoluteTime: "2026-04-10T09:00:00Z",
        channels: ["push"],
      }],
    });
  });

  it("routes Habit reminder configuration through HabitWrites", async () => {
    await findTool("createReminder").execute(
      { sourceType: "habit", sourceId: "h1", fireAt: "2026-04-10T09:00:00Z" },
      makeCtx(),
    );
    expect(mockConfigureHabitReminders).toHaveBeenCalledWith({
      userId: "user-123",
      habitId: "h1",
      reminders: [{
        reminderType: "absolute",
        absoluteTime: "2026-04-10T09:00:00Z",
        channels: ["push"],
      }],
    });
  });

  it("excludes calendar-event intent from the standalone tool schema", () => {
    expect(
      findTool("createReminder").parameters.safeParse({
        sourceType: "calendar_event",
        sourceId: "e1",
        fireAt: "2026-04-10T09:00:00Z",
      }).success,
    ).toBe(false);
  });

  it("routes dismissal through the shared delivery behavior", async () => {
    await findTool("dismissReminder").execute({ reminderId: "r1" }, makeCtx());
    expect(mockDeliveryTransition).toHaveBeenCalledWith({
      reminderId: "r1",
      context: { type: "user", userId: "user-123" },
      transition: { type: "sent" },
    });
  });

  it("routes snooze through the shared delivery behavior", async () => {
    await findTool("dismissReminder").execute(
      { reminderId: "r1", snoozeUntil: "2026-04-10T14:00:00Z" },
      makeCtx(),
    );
    expect(mockDeliveryTransition).toHaveBeenCalledWith({
      reminderId: "r1",
      context: { type: "user", userId: "user-123" },
      transition: { type: "snooze", fireAt: "2026-04-10T14:00:00Z" },
    });
  });

  it("routes calendar-event delivery transitions through the same behavior", async () => {
    mockDeliveryTransition.mockResolvedValue({
      type: "transitioned",
      reminder: makeDeliveryReminder({ sourceType: "calendar_event", sourceId: "e1" }),
      transition: "sent",
    });
    await findTool("dismissReminder").execute({ reminderId: "r1" }, makeCtx());
    expect(mockDeliveryTransition).toHaveBeenCalledOnce();
  });

  it("requires an ISO datetime for AI snooze", () => {
    expect(
      findTool("dismissReminder").parameters.safeParse({
        reminderId: "r1",
        snoozeUntil: "tomorrow afternoon",
      }).success,
    ).toBe(false);
  });

  it("fails closed when the shared delivery transition errors", async () => {
    mockDeliveryTransition.mockRejectedValue(new Error("transition failed"));
    await expect(
      findTool("dismissReminder").execute({ reminderId: "r1" }, makeCtx()),
    ).rejects.toThrow("transition failed");
  });

  it("returns not found without mutating a missing reminder", async () => {
    mockDeliveryTransition.mockResolvedValue({ type: "not-found" });
    await expect(
      findTool("dismissReminder").execute({ reminderId: "missing" }, makeCtx()),
    ).resolves.toEqual({ error: "Reminder not found" });
  });

  it("routes Task reminder removal through TaskWrites", async () => {
    mockConfigureTaskReminders.mockResolvedValue({ type: "removed", reminders: [] });
    const result = await findTool("deleteReminder").execute({ reminderId: "r1" }, makeCtx());
    expect(mockConfigureTaskReminders).toHaveBeenCalledWith({
      userId: "user-123",
      taskId: "t1",
      reminders: [],
    });
    expect(result).toEqual({ success: true });
  });

  it("routes Habit reminder removal through HabitWrites", async () => {
    mockGetReminder.mockResolvedValue({ id: "r1", source_type: "habit", source_id: "h1" });
    mockConfigureHabitReminders.mockResolvedValue({ type: "removed", reminders: [] });
    const result = await findTool("deleteReminder").execute({ reminderId: "r1" }, makeCtx());
    expect(mockConfigureHabitReminders).toHaveBeenCalledWith({
      userId: "user-123",
      habitId: "h1",
      reminders: [],
    });
    expect(result).toEqual({ success: true });
  });

  it("returns not found without deleting", async () => {
    mockGetReminder.mockResolvedValue(null);
    await expect(
      findTool("deleteReminder").execute({ reminderId: "missing" }, makeCtx()),
    ).resolves.toEqual({ error: "Reminder not found" });
  });

  it("refuses deletion of calendar-event intent", async () => {
    mockGetReminder.mockResolvedValue({ id: "r1", source_type: "calendar_event" });
    await expect(
      findTool("deleteReminder").execute({ reminderId: "r1" }, makeCtx()),
    ).resolves.toEqual({
      error: "Calendar event reminders must be updated through the calendar event lifecycle",
    });
  });
});
