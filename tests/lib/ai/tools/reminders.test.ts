import { describe, it, expect, vi, beforeEach } from "vitest";
import { reminderTools } from "@/lib/ai/tools/reminders";
import type { ToolContext } from "@/lib/ai/tools/types";

const mockGetPendingReminders = vi.fn();
const mockCreateReminder = vi.fn();
const mockUpdateReminderStatus = vi.fn();
const mockUpdateReminder = vi.fn();
const mockDeleteReminder = vi.fn();
const mockGetReminder = vi.fn();
const mockTransitionCalendarEventReminder = vi.fn();

vi.mock("@/lib/db", () => ({
  RemindersDB: class {
    getPendingReminders = mockGetPendingReminders;
    createReminder = mockCreateReminder;
    updateReminderStatus = mockUpdateReminderStatus;
    updateReminder = mockUpdateReminder;
    deleteReminder = mockDeleteReminder;
    getReminder = mockGetReminder;
    transitionCalendarEventReminder = mockTransitionCalendarEventReminder;
  },
}));

function makeCtx(): ToolContext {
  return {
    userId: "user-123",
    supabase: {} as ToolContext["supabase"],
    date: "2026-04-10",
    timezone: "America/Toronto",
  };
}

function findTool(name: string) {
  return reminderTools().find((tool) => tool.name === name)!;
}

describe("reminderTools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetReminder.mockResolvedValue({ id: "r1", source_type: "task" });
  });

  it("returns 4 tool definitions", () => {
    expect(reminderTools().map((tool) => tool.name)).toEqual([
      "getUpcomingReminders",
      "createReminder",
      "dismissReminder",
      "deleteReminder",
    ]);
  });

  it("creates task and habit reminders through the standalone tool", async () => {
    mockCreateReminder.mockResolvedValue({ id: "r1" });
    await findTool("createReminder").execute(
      { sourceType: "task", sourceId: "t1", fireAt: "2026-04-10T09:00:00Z" },
      makeCtx(),
    );
    expect(mockCreateReminder).toHaveBeenCalledWith("user-123", {
      source_type: "task",
      source_id: "t1",
      reminder_type: "absolute",
      relative_minutes: null,
      absolute_time: "2026-04-10T09:00:00Z",
      channels: ["push"],
      fire_at: "2026-04-10T09:00:00Z",
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

  it("dismisses a non-event reminder", async () => {
    mockUpdateReminderStatus.mockResolvedValue({ id: "r1", status: "sent" });
    await findTool("dismissReminder").execute({ reminderId: "r1" }, makeCtx());
    expect(mockUpdateReminderStatus).toHaveBeenCalledWith("user-123", "r1", "sent");
  });

  it("snoozes a non-event reminder", async () => {
    mockUpdateReminder.mockResolvedValue({ id: "r1", status: "pending" });
    await findTool("dismissReminder").execute(
      { reminderId: "r1", snoozeUntil: "2026-04-10T14:00:00Z" },
      makeCtx(),
    );
    expect(mockUpdateReminder).toHaveBeenCalledWith("user-123", "r1", {
      status: "pending",
      fire_at: "2026-04-10T14:00:00Z",
    });
  });

  it("routes calendar-event dismissal through the delivery RPC", async () => {
    mockGetReminder.mockResolvedValue({ id: "r1", source_type: "calendar_event" });
    await findTool("dismissReminder").execute({ reminderId: "r1" }, makeCtx());
    expect(mockTransitionCalendarEventReminder).toHaveBeenCalledWith(
      "user-123",
      "r1",
      { status: "sent" },
    );
  });

  it("routes calendar-event snooze through the delivery RPC", async () => {
    mockGetReminder.mockResolvedValue({ id: "r1", source_type: "calendar_event" });
    await findTool("dismissReminder").execute(
      { reminderId: "r1", snoozeUntil: "2026-04-10T14:00:00Z" },
      makeCtx(),
    );
    expect(mockTransitionCalendarEventReminder).toHaveBeenCalledWith(
      "user-123",
      "r1",
      { status: "pending", fire_at: "2026-04-10T14:00:00Z" },
    );
  });

  it("requires an ISO datetime for AI snooze", () => {
    expect(
      findTool("dismissReminder").parameters.safeParse({
        reminderId: "r1",
        snoozeUntil: "tomorrow afternoon",
      }).success,
    ).toBe(false);
  });

  it("fails closed when reminder lookup errors", async () => {
    mockGetReminder.mockRejectedValue(new Error("lookup failed"));
    await expect(
      findTool("dismissReminder").execute({ reminderId: "r1" }, makeCtx()),
    ).rejects.toThrow("lookup failed");
    expect(mockUpdateReminderStatus).not.toHaveBeenCalled();
  });

  it("does not mutate a missing reminder", async () => {
    mockGetReminder.mockResolvedValue(null);
    await expect(
      findTool("dismissReminder").execute({ reminderId: "missing" }, makeCtx()),
    ).resolves.toEqual({ error: "Reminder not found" });
    expect(mockUpdateReminderStatus).not.toHaveBeenCalled();
  });

  it("deletes an existing non-event reminder", async () => {
    const result = await findTool("deleteReminder").execute({ reminderId: "r1" }, makeCtx());
    expect(mockDeleteReminder).toHaveBeenCalledWith("user-123", "r1");
    expect(result).toEqual({ success: true });
  });

  it("returns not found without deleting", async () => {
    mockGetReminder.mockResolvedValue(null);
    await expect(
      findTool("deleteReminder").execute({ reminderId: "missing" }, makeCtx()),
    ).resolves.toEqual({ error: "Reminder not found" });
    expect(mockDeleteReminder).not.toHaveBeenCalled();
  });

  it("refuses deletion of calendar-event intent", async () => {
    mockGetReminder.mockResolvedValue({ id: "r1", source_type: "calendar_event" });
    await expect(
      findTool("deleteReminder").execute({ reminderId: "r1" }, makeCtx()),
    ).resolves.toEqual({
      error: "Calendar event reminders must be updated through the calendar event lifecycle",
    });
    expect(mockDeleteReminder).not.toHaveBeenCalled();
  });
});
