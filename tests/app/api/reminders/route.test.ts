import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// --- Hoisted mocks ---
const { mockComputeFireAt } = vi.hoisted(() => ({
  mockComputeFireAt: vi.fn(),
}));
const {
  mockConfigureTaskReminders,
  mockTaskReminderResponse,
} = vi.hoisted(() => ({
  mockConfigureTaskReminders: vi.fn(),
  mockTaskReminderResponse: vi.fn((reminder: unknown) => reminder),
}));

const mockRemindersDB = {
  createReminder: vi.fn(),
  getRemindersBySource: vi.fn(),
  getReminder: vi.fn(),
  updateReminder: vi.fn(),
  transitionCalendarEventReminder: vi.fn(),
  deleteReminder: vi.fn(),
};

// Mock supabase server client
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn(() => ({
        data: { user: { id: "user-123", email: "test@example.com" } },
      })),
    },
  })),
}));

vi.mock("@/lib/db", () => ({
  RemindersDB: class {
    constructor() {
      return mockRemindersDB;
    }
  },
}));

vi.mock("@/lib/tasks/writes", () => ({
  createTaskWrites: vi.fn(() => ({
    configureReminders: mockConfigureTaskReminders,
  })),
  toTaskReminderResponse: mockTaskReminderResponse,
}));

vi.mock("@/lib/reminders/fire-at", () => ({
  computeFireAt: mockComputeFireAt,
}));

import { createClient } from "@/lib/supabase/server";

describe("GET /api/reminders", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockConfigureTaskReminders.mockResolvedValue({
      type: "configured",
      reminders: [{ id: "r1", source_type: "task" }],
    });
  });

  it("returns reminders for source", async () => {
    const { GET } = await import("@/app/api/reminders/route");
    const mockReminders = [
      {
        id: "r1",
        user_id: "user-123",
        source_type: "calendar_event",
        source_id: "11111111-1111-1111-1111-111111111111",
        reminder_type: "relative",
        relative_minutes: 15,
        absolute_time: null,
        channels: ["push"],
        status: "pending",
        fire_at: "2026-04-10T13:45:00.000Z",
        sent_at: null,
        created_at: "2026-04-01T00:00:00Z",
      },
    ];
    mockRemindersDB.getRemindersBySource.mockResolvedValue(mockReminders);

    const request = new NextRequest(
      "http://localhost:3000/api/reminders?source_type=calendar_event&source_id=event-1"
    );
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.reminders).toEqual(mockReminders);
    expect(mockRemindersDB.getRemindersBySource).toHaveBeenCalledWith(
      "user-123",
      "calendar_event",
      "event-1"
    );
  });

  it("returns 400 when source_type or source_id missing", async () => {
    const { GET } = await import("@/app/api/reminders/route");
    const request = new NextRequest("http://localhost:3000/api/reminders");
    const response = await GET(request);

    expect(response.status).toBe(400);
  });

  it("returns 401 for unauthenticated request", async () => {
    const { GET } = await import("@/app/api/reminders/route");
    vi.mocked(createClient).mockResolvedValueOnce({
      auth: {
        getUser: vi.fn(() => ({ data: { user: null } })),
      },
    } as unknown as ReturnType<typeof createClient> extends Promise<infer T> ? T : never);

    const request = new NextRequest(
      "http://localhost:3000/api/reminders?source_type=calendar_event&source_id=event-1"
    );
    const response = await GET(request);

    expect(response.status).toBe(401);
  });
});

describe("POST /api/reminders", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("routes Task reminder configuration through TaskWrites", async () => {
    const { POST } = await import("@/app/api/reminders/route");

    const request = new NextRequest("http://localhost:3000/api/reminders", {
      method: "POST",
      body: JSON.stringify({
        source_type: "task",
        source_id: "11111111-1111-1111-1111-111111111111",
        reminder_type: "relative",
        relative_minutes: 15,
        channels: ["push"],
        event_start_time: "2026-04-10T14:00:00Z",
      }),
    });
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.reminder).toEqual({ id: "r1", source_type: "task" });
    expect(mockConfigureTaskReminders).toHaveBeenCalledWith({
      userId: "user-123",
      taskId: "11111111-1111-1111-1111-111111111111",
      reminders: [{
        reminderType: "relative",
        relativeMinutes: 15,
        channels: ["push"],
      }],
    });
    expect(mockComputeFireAt).not.toHaveBeenCalled();
    expect(mockRemindersDB.createReminder).not.toHaveBeenCalled();
  });

  it("does not require event_start_time for Task configuration", async () => {
    const { POST } = await import("@/app/api/reminders/route");

    const response = await POST(new NextRequest("http://localhost:3000/api/reminders", {
      method: "POST",
      body: JSON.stringify({
        source_type: "task",
        source_id: "11111111-1111-1111-1111-111111111111",
        reminder_type: "absolute",
        absolute_time: "2026-04-10T09:00:00Z",
        channels: ["push"],
      }),
    }));

    expect(response.status).toBe(201);
    expect(mockConfigureTaskReminders).toHaveBeenCalled();
  });

  it("creates an absolute reminder", async () => {
    const { POST } = await import("@/app/api/reminders/route");
    const mockReminder = {
      id: "r2",
      user_id: "user-123",
      source_type: "habit",
      source_id: "11111111-1111-1111-1111-111111111111",
      reminder_type: "absolute",
      relative_minutes: null,
      absolute_time: "2026-04-10T08:00:00Z",
      channels: ["email"],
      status: "pending",
      fire_at: "2026-04-10T08:00:00.000Z",
      sent_at: null,
      created_at: "2026-04-01T00:00:00Z",
    };

    mockComputeFireAt.mockReturnValue("2026-04-10T08:00:00.000Z");
    mockRemindersDB.createReminder.mockResolvedValue(mockReminder);

    const request = new NextRequest("http://localhost:3000/api/reminders", {
      method: "POST",
      body: JSON.stringify({
        source_type: "habit",
        source_id: "11111111-1111-1111-1111-111111111111",
        reminder_type: "absolute",
        absolute_time: "2026-04-10T08:00:00Z",
        channels: ["email"],
        event_start_time: "2026-04-10T14:00:00Z",
      }),
    });
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.reminder.reminder_type).toBe("absolute");
    expect(mockComputeFireAt).toHaveBeenCalledWith(
      {
        reminder_type: "absolute",
        relative_minutes: null,
        absolute_time: "2026-04-10T08:00:00Z",
      },
      "2026-04-10T14:00:00Z"
    );
  });

  it("returns 401 for unauthenticated request", async () => {
    const { POST } = await import("@/app/api/reminders/route");
    vi.mocked(createClient).mockResolvedValueOnce({
      auth: {
        getUser: vi.fn(() => ({ data: { user: null } })),
      },
    } as unknown as ReturnType<typeof createClient> extends Promise<infer T> ? T : never);

    const request = new NextRequest("http://localhost:3000/api/reminders", {
      method: "POST",
      body: JSON.stringify({
        source_type: "calendar_event",
        source_id: "11111111-1111-1111-1111-111111111111",
        reminder_type: "relative",
        relative_minutes: 15,
        channels: ["push"],
        event_start_time: "2026-04-10T14:00:00Z",
      }),
    });
    const response = await POST(request);

    expect(response.status).toBe(401);
  });

  it("refuses direct calendar-event reminder creation", async () => {
    const { POST } = await import("@/app/api/reminders/route");
    const request = new NextRequest("http://localhost:3000/api/reminders", {
      method: "POST",
      body: JSON.stringify({
        source_type: "calendar_event",
        source_id: "11111111-1111-1111-1111-111111111111",
        reminder_type: "relative",
        relative_minutes: 15,
        channels: ["push"],
        event_start_time: "2026-04-10T14:00:00Z",
      }),
    });

    const response = await POST(request);

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error:
        "Calendar event reminders must be updated through the calendar event lifecycle",
    });
    expect(mockComputeFireAt).not.toHaveBeenCalled();
    expect(mockRemindersDB.createReminder).not.toHaveBeenCalled();
  });

  it("returns 400 when relative reminder is missing relative_minutes", async () => {
    const { POST } = await import("@/app/api/reminders/route");

    const request = new NextRequest("http://localhost:3000/api/reminders", {
      method: "POST",
      body: JSON.stringify({
        source_type: "calendar_event",
        source_id: "11111111-1111-1111-1111-111111111111",
        reminder_type: "relative",
        channels: ["push"],
        event_start_time: "2026-04-10T14:00:00Z",
      }),
    });
    const response = await POST(request);

    expect(response.status).toBe(400);
  });

  it("returns 400 for invalid source_type in GET", async () => {
    const { GET } = await import("@/app/api/reminders/route");

    const request = new NextRequest(
      "http://localhost:3000/api/reminders?source_type=invalid&source_id=event-1"
    );
    const response = await GET(request);

    expect(response.status).toBe(400);
  });
});

describe("PATCH /api/reminders/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockConfigureTaskReminders.mockResolvedValue({
      type: "configured",
      reminders: [{ id: "r1", source_type: "task" }],
    });
    mockRemindersDB.getReminder.mockResolvedValue({
      id: "r1",
      source_type: "task",
      source_id: "11111111-1111-1111-1111-111111111111",
      reminder_type: "absolute",
      relative_minutes: null,
      absolute_time: "2026-04-10T09:00:00Z",
      channels: ["push"],
    });
  });

  it("refuses direct calendar-event reminder updates", async () => {
    const { PATCH } = await import("@/app/api/reminders/[id]/route");
    mockRemindersDB.getReminder.mockResolvedValue({
      id: "r1",
      source_type: "calendar_event",
    });
    const request = new NextRequest(
      "http://localhost:3000/api/reminders/r1",
      {
        method: "PATCH",
        body: JSON.stringify({ fire_at: "2026-04-10T15:00:00Z" }),
      },
    );

    const response = await PATCH(request, {
      params: Promise.resolve({ id: "r1" }),
    });

    expect(response.status).toBe(409);
    expect(mockRemindersDB.updateReminder).not.toHaveBeenCalled();
  });

  it("allows calendar-event dismissal through the delivery transition", async () => {
    const { PATCH } = await import("@/app/api/reminders/[id]/route");
    mockRemindersDB.getReminder.mockResolvedValue({ id: "r1", source_type: "calendar_event" });
    mockRemindersDB.transitionCalendarEventReminder.mockResolvedValue({ id: "r1", status: "sent" });
    const response = await PATCH(
      new NextRequest("http://localhost:3000/api/reminders/r1", {
        method: "PATCH",
        body: JSON.stringify({ status: "sent" }),
      }),
      { params: Promise.resolve({ id: "r1" }) },
    );
    expect(response.status).toBe(200);
    expect(mockRemindersDB.transitionCalendarEventReminder).toHaveBeenCalledWith(
      "user-123",
      "r1",
      { status: "sent", sent_at: undefined },
    );
  });

  it("allows calendar-event snooze through the delivery transition", async () => {
    const { PATCH } = await import("@/app/api/reminders/[id]/route");
    mockRemindersDB.getReminder.mockResolvedValue({ id: "r1", source_type: "calendar_event" });
    mockRemindersDB.transitionCalendarEventReminder.mockResolvedValue({ id: "r1", status: "pending" });
    const response = await PATCH(
      new NextRequest("http://localhost:3000/api/reminders/r1", {
        method: "PATCH",
        body: JSON.stringify({ status: "pending", fire_at: "2026-04-10T15:00:00Z" }),
      }),
      { params: Promise.resolve({ id: "r1" }) },
    );
    expect(response.status).toBe(200);
    expect(mockRemindersDB.transitionCalendarEventReminder).toHaveBeenCalledWith(
      "user-123",
      "r1",
      { status: "pending", fire_at: "2026-04-10T15:00:00Z", sent_at: undefined },
    );
  });

  it("preserves the legacy calendar-event snoozed status", async () => {
    const { PATCH } = await import("@/app/api/reminders/[id]/route");
    mockRemindersDB.getReminder.mockResolvedValue({ id: "r1", source_type: "calendar_event" });
    mockRemindersDB.transitionCalendarEventReminder.mockResolvedValue({ id: "r1", status: "snoozed" });
    const response = await PATCH(
      new NextRequest("http://localhost:3000/api/reminders/r1", {
        method: "PATCH",
        body: JSON.stringify({ status: "snoozed" }),
      }),
      { params: Promise.resolve({ id: "r1" }) },
    );
    expect(response.status).toBe(200);
    expect(mockRemindersDB.transitionCalendarEventReminder).toHaveBeenCalledWith(
      "user-123",
      "r1",
      { status: "snoozed", sent_at: undefined },
    );
  });

  it("rejects sent_at on a calendar-event snooze before calling the RPC", async () => {
    const { PATCH } = await import("@/app/api/reminders/[id]/route");
    mockRemindersDB.getReminder.mockResolvedValue({ id: "r1", source_type: "calendar_event" });
    const response = await PATCH(
      new NextRequest("http://localhost:3000/api/reminders/r1", {
        method: "PATCH",
        body: JSON.stringify({
          status: "pending",
          fire_at: "2026-04-10T15:00:00Z",
          sent_at: "2026-04-10T14:00:00Z",
        }),
      }),
      { params: Promise.resolve({ id: "r1" }) },
    );
    expect(response.status).toBe(400);
    expect(mockRemindersDB.transitionCalendarEventReminder).not.toHaveBeenCalled();
  });

  it("refuses calendar-event channel mutation", async () => {
    const { PATCH } = await import("@/app/api/reminders/[id]/route");
    mockRemindersDB.getReminder.mockResolvedValue({ id: "r1", source_type: "calendar_event" });
    const response = await PATCH(
      new NextRequest("http://localhost:3000/api/reminders/r1", {
        method: "PATCH",
        body: JSON.stringify({ channels: ["email"] }),
      }),
      { params: Promise.resolve({ id: "r1" }) },
    );
    expect(response.status).toBe(409);
    expect(mockRemindersDB.transitionCalendarEventReminder).not.toHaveBeenCalled();
  });

  it("updates reminder and returns 200", async () => {
    const { PATCH } = await import("@/app/api/reminders/[id]/route");
    const updatedReminder = {
      id: "r1",
      user_id: "user-123",
      status: "snoozed",
      channels: ["push", "email"],
    };
    mockRemindersDB.updateReminder.mockResolvedValue(updatedReminder);

    const request = new NextRequest(
      "http://localhost:3000/api/reminders/r1",
      {
        method: "PATCH",
        body: JSON.stringify({ status: "snoozed" }),
      }
    );
    const response = await PATCH(request, {
      params: Promise.resolve({ id: "r1" }),
    });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.reminder).toEqual(updatedReminder);
  });

  it("routes Task channel replacement through TaskWrites", async () => {
    const { PATCH } = await import("@/app/api/reminders/[id]/route");
    const response = await PATCH(
      new NextRequest("http://localhost:3000/api/reminders/r1", {
        method: "PATCH",
        body: JSON.stringify({ channels: ["email"] }),
      }),
      { params: Promise.resolve({ id: "r1" }) },
    );

    expect(response.status).toBe(200);
    expect(mockConfigureTaskReminders).toHaveBeenCalledWith({
      userId: "user-123",
      taskId: "11111111-1111-1111-1111-111111111111",
      reminders: [{
        reminderType: "absolute",
        absoluteTime: "2026-04-10T09:00:00Z",
        channels: ["email"],
      }],
    });
    expect(mockRemindersDB.updateReminder).not.toHaveBeenCalled();
  });

  it("returns 401 for unauthenticated request", async () => {
    const { PATCH } = await import("@/app/api/reminders/[id]/route");
    vi.mocked(createClient).mockResolvedValueOnce({
      auth: {
        getUser: vi.fn(() => ({ data: { user: null } })),
      },
    } as unknown as ReturnType<typeof createClient> extends Promise<infer T> ? T : never);

    const request = new NextRequest(
      "http://localhost:3000/api/reminders/r1",
      {
        method: "PATCH",
        body: JSON.stringify({ status: "snoozed" }),
      }
    );
    const response = await PATCH(request, {
      params: Promise.resolve({ id: "r1" }),
    });

    expect(response.status).toBe(401);
  });

  it("returns 400 for empty body (no fields)", async () => {
    const { PATCH } = await import("@/app/api/reminders/[id]/route");

    const request = new NextRequest(
      "http://localhost:3000/api/reminders/r1",
      {
        method: "PATCH",
        body: JSON.stringify({}),
      }
    );
    const response = await PATCH(request, {
      params: Promise.resolve({ id: "r1" }),
    });

    expect(response.status).toBe(400);
  });

  it("returns 500 when DB throws", async () => {
    const { PATCH } = await import("@/app/api/reminders/[id]/route");
    mockRemindersDB.updateReminder.mockRejectedValue(new Error("DB error"));

    const request = new NextRequest(
      "http://localhost:3000/api/reminders/r1",
      {
        method: "PATCH",
        body: JSON.stringify({ status: "snoozed" }),
      }
    );
    const response = await PATCH(request, {
      params: Promise.resolve({ id: "r1" }),
    });

    expect(response.status).toBe(500);
  });
});

describe("DELETE /api/reminders/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockConfigureTaskReminders.mockResolvedValue({
      type: "removed",
      reminders: [],
    });
    mockRemindersDB.getReminder.mockResolvedValue({
      id: "r1",
      source_type: "task",
      source_id: "11111111-1111-1111-1111-111111111111",
    });
  });

  it("refuses direct calendar-event reminder deletion", async () => {
    const { DELETE } = await import("@/app/api/reminders/[id]/route");
    mockRemindersDB.getReminder.mockResolvedValue({
      id: "r1",
      source_type: "calendar_event",
    });
    const request = new NextRequest(
      "http://localhost:3000/api/reminders/r1",
      { method: "DELETE" },
    );

    const response = await DELETE(request, {
      params: Promise.resolve({ id: "r1" }),
    });

    expect(response.status).toBe(409);
    expect(mockRemindersDB.deleteReminder).not.toHaveBeenCalled();
  });

  it("deletes reminder and returns 200", async () => {
    const { DELETE } = await import("@/app/api/reminders/[id]/route");
    const request = new NextRequest(
      "http://localhost:3000/api/reminders/r1",
      {
        method: "DELETE",
      }
    );
    const response = await DELETE(request, {
      params: Promise.resolve({ id: "r1" }),
    });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(mockConfigureTaskReminders).toHaveBeenCalledWith({
      userId: "user-123",
      taskId: "11111111-1111-1111-1111-111111111111",
      reminders: [],
    });
    expect(mockRemindersDB.deleteReminder).not.toHaveBeenCalled();
  });

  it("returns 401 for unauthenticated request", async () => {
    const { DELETE } = await import("@/app/api/reminders/[id]/route");
    vi.mocked(createClient).mockResolvedValueOnce({
      auth: {
        getUser: vi.fn(() => ({ data: { user: null } })),
      },
    } as unknown as ReturnType<typeof createClient> extends Promise<infer T> ? T : never);

    const request = new NextRequest(
      "http://localhost:3000/api/reminders/r1",
      {
        method: "DELETE",
      }
    );
    const response = await DELETE(request, {
      params: Promise.resolve({ id: "r1" }),
    });

    expect(response.status).toBe(401);
  });

  it("returns 500 when DB throws", async () => {
    const { DELETE } = await import("@/app/api/reminders/[id]/route");
    mockRemindersDB.getReminder.mockResolvedValue({
      id: "r1",
      source_type: "habit",
      source_id: "h1",
    });
    mockRemindersDB.deleteReminder.mockRejectedValue(new Error("DB error"));

    const request = new NextRequest(
      "http://localhost:3000/api/reminders/r1",
      {
        method: "DELETE",
      }
    );
    const response = await DELETE(request, {
      params: Promise.resolve({ id: "r1" }),
    });

    expect(response.status).toBe(500);
  });
});
