import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/calendar-events/route";
import { calendarTools } from "@/lib/ai/tools/calendar";
import type { ToolContext } from "@/lib/ai/tools/types";

const {
  mockCreate,
  mockAuthenticateRequest,
  mockEnsureProfile,
  mockPresentedEvent,
  mockPresentedReminder,
  mockSupabase,
} = vi.hoisted(() => ({
  mockCreate: vi.fn(),
  mockAuthenticateRequest: vi.fn(),
  mockEnsureProfile: vi.fn(),
  mockPresentedEvent: {
    id: "event-123",
    title: "Team sync",
    start_date: "2026-08-03",
  },
  mockPresentedReminder: {
    id: "reminder-123",
    source_id: "event-123",
  },
  mockSupabase: {},
}));

vi.mock("@/lib/auth/authenticated-request", () => ({
  authenticateRequest: mockAuthenticateRequest,
}));

vi.mock("@/lib/db", () => ({
  CalendarEventsDB: class {
    getUserEvents = vi.fn();
  },
}));

vi.mock("@/lib/db/ensure-profile", () => ({
  ensureProfile: mockEnsureProfile,
}));

vi.mock("@/lib/scheduling/writes", () => ({
  createSchedulingWrites: vi.fn(() => ({ create: mockCreate })),
  toCalendarEventResponse: vi.fn(() => mockPresentedEvent),
  toReminderResponse: vi.fn(() => mockPresentedReminder),
}));

const createdDomainEvent = {
  id: "event-123",
  userId: "user-123",
  title: "Team sync",
  startDate: "2026-08-03",
  startTime: "10:00:00",
  endDate: "2026-08-03",
  endTime: "11:00:00",
  description: null,
  location: null,
  color: null,
  categoryId: null,
  isRecurring: false,
  recurrenceRule: null,
  endType: null,
  endDateRecurrence: null,
  endCount: null,
  recurringEventId: null,
  originalDate: null,
  isException: false,
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
};

const createdDomainReminder = {
  id: "reminder-123",
  userId: "user-123",
  eventId: "event-123",
  reminderType: "relative" as const,
  relativeMinutes: 15,
  absoluteTime: null,
  channels: ["push"] as const,
  status: "pending" as const,
  fireAt: "2026-08-03T13:45:00.000Z",
  sentAt: null,
  createdAt: "2026-08-01T00:00:00.000Z",
};

function authenticated() {
  return {
    ok: true as const,
    outcome: "authenticated" as const,
    principal: {
      type: "user" as const,
      userId: "user-123",
      credential: "cookie" as const,
      profile: {
        email: "test@example.com",
        fullName: "Test User",
        avatarUrl: null,
      },
    },
    permissions: ["read", "write"] as const,
    requiredPermission: "read" as const,
    client: mockSupabase,
  };
}

function createTool() {
  return calendarTools().find((tool) => tool.name === "createEvent")!;
}

const aiContext: ToolContext = {
  userId: "user-123",
  supabase: mockSupabase as ToolContext["supabase"],
  date: "2026-08-01",
  timezone: "America/Toronto",
};

describe("AI and HTTP calendar creation parity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthenticateRequest.mockResolvedValue(authenticated());
    mockCreate.mockResolvedValue({
      type: "created",
      event: createdDomainEvent,
      reminders: [createdDomainReminder],
    });
  });

  it("maps event-with-reminder inputs into one shared domain request", async () => {
    const aiResult = await createTool().execute(
      {
        title: "Team sync",
        startDate: "2026-08-03",
        startTime: "10:00",
        endDate: "2026-08-03",
        endTime: "11:00",
        reminders: [{ reminderType: "relative", relativeMinutes: 15, channels: ["push"] }],
      },
      aiContext,
    );
    const httpResponse = await POST(
      new NextRequest("http://localhost:3000/api/calendar-events", {
        method: "POST",
        body: JSON.stringify({
          title: "Team sync",
          start_date: "2026-08-03",
          start_time: "10:00",
          end_date: "2026-08-03",
          end_time: "11:00",
          reminders: [
            { reminder_type: "relative", relative_minutes: 15, channels: ["push"] },
          ],
        }),
      }),
    );

    expect(aiResult).toEqual(mockPresentedEvent);
    expect(httpResponse.status).toBe(201);
    await expect(httpResponse.json()).resolves.toEqual({
      event: mockPresentedEvent,
      reminders: [mockPresentedReminder],
    });
    expect(mockCreate).toHaveBeenCalledTimes(2);
    expect(mockCreate.mock.calls[0][0]).toEqual(mockCreate.mock.calls[1][0]);
    expect(mockCreate.mock.calls[0][0]).toEqual({
      userId: "user-123",
      event: {
        title: "Team sync",
        description: null,
        startDate: "2026-08-03",
        startTime: "10:00",
        endDate: "2026-08-03",
        endTime: "11:00",
        location: null,
        color: null,
        categoryId: null,
        isRecurring: false,
        recurrenceRule: null,
        endType: null,
        endDateRecurrence: null,
        endCount: null,
        recurringEventId: null,
        originalDate: null,
        isException: false,
      },
      reminders: [{ reminderType: "relative", relativeMinutes: 15, channels: ["push"] }],
    });
  });

  it("preserves expected outcomes for AI and HTTP adapters", async () => {
    mockCreate.mockResolvedValue({ type: "conflict", resource: "reminder" });

    await expect(
      createTool().execute(
        { title: "Team sync", startDate: "2026-08-03" },
        aiContext,
      ),
    ).resolves.toEqual({ error: "Calendar event creation conflicted" });

    const response = await POST(
      new NextRequest("http://localhost:3000/api/calendar-events", {
        method: "POST",
        body: JSON.stringify({
          title: "Team sync",
          start_date: "2026-08-03",
          end_date: "2026-08-03",
        }),
      }),
    );
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "Calendar event creation conflicted",
    });
  });

  it("leaves unexpected failures exceptional for AI and HTTP", async () => {
    const failure = new Error("schedule storage unavailable");
    mockCreate.mockRejectedValue(failure);

    await expect(
      createTool().execute(
        { title: "Team sync", startDate: "2026-08-03" },
        aiContext,
      ),
    ).rejects.toBe(failure);

    const response = await POST(
      new NextRequest("http://localhost:3000/api/calendar-events", {
        method: "POST",
        body: JSON.stringify({
          title: "Team sync",
          start_date: "2026-08-03",
          end_date: "2026-08-03",
        }),
      }),
    );
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Failed to create calendar event",
    });
  });
});
