import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

const {
  mockGetPendingReminders,
  mockGetPushQuietWindow,
  mockSendPushNotification,
  mockSendReminderEmail,
  mockCreateAdminClient,
  mockGetVapidDetails,
  mockDeliveryTransition,
  mockCreateReminderDelivery,
} = vi.hoisted(() => ({
  mockGetPendingReminders: vi.fn(),
  mockGetPushQuietWindow: vi.fn(),
  mockSendPushNotification: vi.fn(),
  mockSendReminderEmail: vi.fn(),
  mockCreateAdminClient: vi.fn(),
  mockGetVapidDetails: vi.fn(),
  mockDeliveryTransition: vi.fn(),
  mockCreateReminderDelivery: vi.fn(),
}));

vi.mock("@/lib/db/reminders", () => ({
  RemindersDB: class {
    getPendingReminders = mockGetPendingReminders;
  },
}));

vi.mock("@/lib/reminders/delivery-service", () => ({
  createReminderDelivery: mockCreateReminderDelivery,
}));

vi.mock("@/lib/db/notifications", () => ({
  NotificationsDB: class {
    getPushQuietWindow = mockGetPushQuietWindow;
  },
}));

vi.mock("@/lib/push/send", () => ({
  sendPushNotification: mockSendPushNotification,
}));

vi.mock("@/lib/email/send", () => ({
  sendReminderEmail: mockSendReminderEmail,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: mockCreateAdminClient,
}));

vi.mock("@/lib/push/vapid", () => ({
  getVapidDetails: mockGetVapidDetails,
}));

vi.mock("@/lib/logger", () => ({
  log: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import { GET } from "@/app/api/cron/dispatch-reminders/route";

const CRON_SECRET = "test-cron-secret";

function createRequest(withAuth = true): NextRequest {
  const headers: Record<string, string> = {};
  if (withAuth) headers.Authorization = `Bearer ${CRON_SECRET}`;
  return new NextRequest("http://localhost:3000/api/cron/dispatch-reminders", {
    headers,
  });
}

const mockReminder = (overrides: Record<string, unknown> = {}) => ({
  id: "rem-1",
  user_id: "user-1",
  source_type: "task",
  source_id: "task-1",
  reminder_type: "relative",
  relative_minutes: 15,
  absolute_time: null,
  channels: ["push", "email"],
  status: "pending",
  fire_at: "2026-08-01T02:30:00Z",
  sent_at: null,
  created_at: "2026-07-31T09:45:00Z",
  ...overrides,
});

const mockPushQuietWindow = (overrides: Record<string, unknown> = {}) => ({
  pushQuietWindow: {
    status: "ready" as const,
    value: { status: "disabled" as const },
  },
  userTimeZone: {
    status: "resolved" as const,
    value: "America/New_York",
  },
  ...overrides,
});

describe("GET /api/cron/dispatch-reminders", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-01T03:00:00.000Z"));
    vi.stubEnv("CRON_SECRET", CRON_SECRET);
    mockCreateAdminClient.mockReturnValue({});
    mockCreateReminderDelivery.mockReturnValue({
      transition: mockDeliveryTransition,
    });
    mockDeliveryTransition.mockImplementation(async (request) => {
      if (request.transition.type === "stale") {
        return {
          type: "invalid-transition",
          action: "stale",
          reason: "Reminder has not exceeded the stale delivery retry horizon",
        };
      }
      return {
        type: "transitioned",
        transition: request.transition.type,
        reminder: mockReminder({
          status: request.transition.type === "sent" ? "sent" : "failed",
        }),
      };
    });
    mockGetVapidDetails.mockReturnValue({
      subject: "mailto:test@test.com",
      publicKey: "test-public-key",
      privateKey: "test-private-key",
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns 401 without CRON_SECRET", async () => {
    const res = await GET(createRequest(false));
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe("Unauthorized");
  });

  it("returns counts of 0 with no pending reminders", async () => {
    mockGetPendingReminders.mockResolvedValue([]);
    const res = await GET(createRequest());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      dispatched: 0,
      failed: 0,
      skipped_quiet_hours: 0,
    });
  });

  it("retires unsupported legacy reminder sources without dispatching", async () => {
    mockGetPendingReminders.mockResolvedValue([
      mockReminder({ source_type: "bill" }),
    ]);

    const res = await GET(createRequest());
    expect(await res.json()).toEqual({
      dispatched: 0,
      failed: 1,
      skipped_quiet_hours: 0,
    });
    expect(mockGetPushQuietWindow).not.toHaveBeenCalled();
    expect(mockSendPushNotification).not.toHaveBeenCalled();
    expect(mockSendReminderEmail).not.toHaveBeenCalled();
    expect(mockDeliveryTransition).toHaveBeenCalledWith(expect.objectContaining({
      reminderId: "rem-1",
      transition: { type: "retire-unsupported-source" },
      context: {
        type: "operational",
        service: "reminder-dispatcher",
        userId: "user-1",
        trusted: true,
      },
    }));
  });

  it("dispatches push and email and records sent through shared delivery", async () => {
    mockGetPendingReminders.mockResolvedValue([mockReminder()]);
    mockGetPushQuietWindow.mockResolvedValue(mockPushQuietWindow());
    mockSendPushNotification.mockResolvedValue({ sent: 1, failed: 0 });
    mockSendReminderEmail.mockResolvedValue({ success: true });

    const res = await GET(createRequest());
    const body = await res.json();
    expect(body).toEqual({ dispatched: 1, failed: 0, skipped_quiet_hours: 0 });
    expect(mockSendPushNotification).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({
        title: "Reminder",
        sourceType: "task",
        sourceId: "task-1",
      }),
      expect.anything(),
    );
    expect(mockSendReminderEmail).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({ sourceType: "task" }),
    );
    expect(mockDeliveryTransition).toHaveBeenCalledWith(expect.objectContaining({
      transition: { type: "sent", sentAt: expect.any(String) },
    }));
  });

  it("keeps a recent push-only reminder pending during quiet hours", async () => {
    const reminder = mockReminder({
      channels: ["push"],
      fire_at: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
    });
    mockGetPendingReminders.mockResolvedValue([reminder]);
    mockGetPushQuietWindow.mockResolvedValue(mockPushQuietWindow({
      pushQuietWindow: {
        status: "ready" as const,
        value: {
          status: "enabled" as const,
          startLocal: "22:00",
          endLocal: "07:00",
        },
      },
    }));

    const body = await (await GET(createRequest())).json();
    expect(body).toEqual({ dispatched: 0, failed: 0, skipped_quiet_hours: 1 });
    expect(mockSendPushNotification).not.toHaveBeenCalled();
    expect(mockDeliveryTransition).toHaveBeenCalledWith(expect.objectContaining({
      transition: { type: "stale" },
    }));
  });

  it("marks a stale push-only reminder failed through shared delivery", async () => {
    mockGetPendingReminders.mockResolvedValue([mockReminder({
      channels: ["push"],
      fire_at: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
    })]);
    mockGetPushQuietWindow.mockResolvedValue(mockPushQuietWindow());

    mockDeliveryTransition.mockImplementation(async (request) =>
      request.transition.type === "stale"
        ? { type: "transitioned", transition: "stale", reminder: mockReminder({ status: "failed" }) }
        : { type: "invalid-transition", action: request.transition.type, reason: "unused" },
    );

    const body = await (await GET(createRequest())).json();
    expect(body).toEqual({ dispatched: 0, failed: 1, skipped_quiet_hours: 0 });
    expect(mockDeliveryTransition).toHaveBeenCalledWith(expect.objectContaining({
      transition: { type: "stale" },
    }));
  });

  it("dispatches email during quiet hours", async () => {
    mockGetPendingReminders.mockResolvedValue([mockReminder({ channels: ["email"] })]);
    mockGetPushQuietWindow.mockResolvedValue(mockPushQuietWindow({
      pushQuietWindow: {
        status: "ready" as const,
        value: {
          status: "enabled" as const,
          startLocal: "22:00",
          endLocal: "07:00",
        },
      },
    }));
    mockSendReminderEmail.mockResolvedValue({ success: true });

    const body = await (await GET(createRequest())).json();
    expect(body).toEqual({ dispatched: 1, failed: 0, skipped_quiet_hours: 0 });
    expect(mockSendPushNotification).not.toHaveBeenCalled();
    expect(mockSendReminderEmail).toHaveBeenCalled();
  });

  it("dispatches email and records sent for push+email during quiet hours", async () => {
    mockGetPendingReminders.mockResolvedValue([mockReminder()]);
    mockGetPushQuietWindow.mockResolvedValue(mockPushQuietWindow({
      pushQuietWindow: {
        status: "ready" as const,
        value: {
          status: "enabled" as const,
          startLocal: "22:00",
          endLocal: "07:00",
        },
      },
    }));
    mockSendReminderEmail.mockResolvedValue({ success: true });

    const body = await (await GET(createRequest())).json();
    expect(body).toEqual({ dispatched: 1, failed: 0, skipped_quiet_hours: 0 });
    expect(mockSendPushNotification).not.toHaveBeenCalled();
    expect(mockDeliveryTransition).toHaveBeenCalledWith(expect.objectContaining({
      transition: { type: "sent", sentAt: expect.any(String) },
    }));
  });

  it("records failed when all channels fail", async () => {
    mockGetPendingReminders.mockResolvedValue([mockReminder()]);
    mockGetPushQuietWindow.mockResolvedValue(mockPushQuietWindow());
    mockSendPushNotification.mockResolvedValue({ sent: 0, failed: 1 });
    mockSendReminderEmail.mockResolvedValue({ success: false, error: "fail" });

    const body = await (await GET(createRequest())).json();
    expect(body).toEqual({ dispatched: 0, failed: 1, skipped_quiet_hours: 0 });
    expect(mockDeliveryTransition).toHaveBeenCalledWith(expect.objectContaining({
      transition: { type: "failed" },
    }));
  });

  it("isolates one reminder failure and continues the batch", async () => {
    const reminder1 = mockReminder({ id: "rem-1", user_id: "user-1" });
    const reminder2 = mockReminder({ id: "rem-2", user_id: "user-2" });
    mockGetPendingReminders.mockResolvedValue([reminder1, reminder2]);
    mockGetPushQuietWindow
      .mockRejectedValueOnce(new Error("DB connection error"))
      .mockResolvedValueOnce(mockPushQuietWindow());
    mockSendPushNotification.mockResolvedValue({ sent: 1, failed: 0 });
    mockSendReminderEmail.mockResolvedValue({ success: true });

    const body = await (await GET(createRequest())).json();
    expect(body).toEqual({ dispatched: 1, failed: 1, skipped_quiet_hours: 0 });
    expect(mockDeliveryTransition).toHaveBeenCalledWith(expect.objectContaining({
      reminderId: "rem-1",
      transition: { type: "failed" },
    }));
    expect(mockDeliveryTransition).toHaveBeenCalledWith(expect.objectContaining({
      reminderId: "rem-2",
      transition: { type: "sent", sentAt: expect.any(String) },
    }));
  });
});
