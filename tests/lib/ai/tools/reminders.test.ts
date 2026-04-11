import { describe, it, expect, vi, beforeEach } from "vitest";
import { reminderTools } from "@/lib/ai/tools/reminders";
import type { ToolContext } from "@/lib/ai/tools/types";

const mockGetPendingReminders = vi.fn();
const mockCreateReminder = vi.fn();
const mockUpdateReminderStatus = vi.fn();
const mockUpdateReminder = vi.fn();
const mockDeleteReminder = vi.fn();

vi.mock("@/lib/db", () => ({
  RemindersDB: class {
    getPendingReminders = mockGetPendingReminders;
    createReminder = mockCreateReminder;
    updateReminderStatus = mockUpdateReminderStatus;
    updateReminder = mockUpdateReminder;
    deleteReminder = mockDeleteReminder;
  },
}));

function mockSupabaseSelect(data: unknown) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            single: () => Promise.resolve({ data, error: null }),
          }),
        }),
      }),
    }),
  } as unknown as ToolContext["supabase"];
}

function makeCtx(overrides?: Partial<ToolContext>): ToolContext {
  return {
    userId: "user-123",
    supabase: mockSupabaseSelect(null),
    date: "2026-04-10",
    timezone: "America/Toronto",
    ...overrides,
  };
}

function findTool(name: string) {
  return reminderTools().find((t) => t.name === name)!;
}

describe("reminderTools", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 4 tool definitions", () => {
    const tools = reminderTools();
    expect(tools).toHaveLength(4);
    expect(tools.map((t) => t.name)).toEqual([
      "getUpcomingReminders",
      "createReminder",
      "dismissReminder",
      "deleteReminder",
    ]);
  });

  it("createReminder calls RemindersDB.createReminder with correct params", async () => {
    const ctx = makeCtx();
    mockCreateReminder.mockResolvedValue({ id: "r1" });
    await findTool("createReminder").execute(
      {
        sourceType: "task",
        sourceId: "t1",
        fireAt: "2026-04-10T09:00:00",
      },
      ctx,
    );
    expect(mockCreateReminder).toHaveBeenCalledWith("user-123", {
      source_type: "task",
      source_id: "t1",
      reminder_type: "absolute",
      relative_minutes: null,
      absolute_time: "2026-04-10T09:00:00",
      channels: ["push"],
      fire_at: "2026-04-10T09:00:00",
    });
  });

  it("dismissReminder dismisses by setting status to sent", async () => {
    const ctx = makeCtx();
    mockUpdateReminderStatus.mockResolvedValue({ id: "r1", status: "sent" });
    await findTool("dismissReminder").execute({ reminderId: "r1" }, ctx);
    expect(mockUpdateReminderStatus).toHaveBeenCalledWith(
      "user-123",
      "r1",
      "sent",
    );
  });

  it("dismissReminder snoozes when snoozeUntil is provided", async () => {
    const ctx = makeCtx();
    mockUpdateReminder.mockResolvedValue({ id: "r1", status: "pending" });
    await findTool("dismissReminder").execute(
      { reminderId: "r1", snoozeUntil: "2026-04-10T14:00:00" },
      ctx,
    );
    expect(mockUpdateReminder).toHaveBeenCalledWith("user-123", "r1", {
      status: "pending",
      fire_at: "2026-04-10T14:00:00",
    });
  });

  it("deleteReminder verifies existence then deletes", async () => {
    const ctx = makeCtx({
      supabase: mockSupabaseSelect({ id: "r1" }),
    });
    mockDeleteReminder.mockResolvedValue(undefined);
    const result = await findTool("deleteReminder").execute(
      { reminderId: "r1" },
      ctx,
    );
    expect(mockDeleteReminder).toHaveBeenCalledWith("user-123", "r1");
    expect(result).toEqual({ success: true });
  });

  it("deleteReminder returns error when not found", async () => {
    const ctx = makeCtx({
      supabase: mockSupabaseSelect(null),
    });
    const result = await findTool("deleteReminder").execute(
      { reminderId: "r999" },
      ctx,
    );
    expect(result).toEqual({ error: "Reminder not found" });
    expect(mockDeleteReminder).not.toHaveBeenCalled();
  });
});
