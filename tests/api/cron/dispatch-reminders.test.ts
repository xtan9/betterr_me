import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Hoisted mocks
const {
  mockGetPendingReminders,
  mockUpdateReminderStatus,
  mockGetNotificationProjection,
  mockSendPushNotification,
  mockSendReminderEmail,
  mockIsInQuietHours,
  mockCreateAdminClient,
  mockGetVapidDetails,
} = vi.hoisted(() => ({
  mockGetPendingReminders: vi.fn(),
  mockUpdateReminderStatus: vi.fn(),
  mockGetNotificationProjection: vi.fn(),
  mockSendPushNotification: vi.fn(),
  mockSendReminderEmail: vi.fn(),
  mockIsInQuietHours: vi.fn(),
  mockCreateAdminClient: vi.fn(),
  mockGetVapidDetails: vi.fn(),
}));

vi.mock("@/lib/db/reminders", () => ({
  RemindersDB: class {
    getPendingReminders = mockGetPendingReminders;
    updateReminderStatus = mockUpdateReminderStatus;
  },
}));

vi.mock("@/lib/db/profiles", () => ({
  ProfilesDB: class {
    getNotificationPreferenceProjection = mockGetNotificationProjection;
  },
}));

vi.mock("@/lib/push/send", () => ({
  sendPushNotification: mockSendPushNotification,
}));

vi.mock("@/lib/email/send", () => ({
  sendReminderEmail: mockSendReminderEmail,
}));

vi.mock("@/lib/push/quiet-hours", () => ({
  isInQuietHours: mockIsInQuietHours,
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
  if (withAuth) {
    headers["Authorization"] = `Bearer ${CRON_SECRET}`;
  }
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
  fire_at: "2026-04-03T10:00:00Z",
  sent_at: null,
  created_at: "2026-04-03T09:45:00Z",
  ...overrides,
});

const mockProfile = (overrides: Record<string, unknown> = {}) => ({
  timezone: "America/New_York",
  preferences: {
    email_notifications_enabled: false,
    quiet_hours_start: null,
    quiet_hours_end: null,
  },
  ...overrides,
});

describe("GET /api/cron/dispatch-reminders", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("CRON_SECRET", CRON_SECRET);
    mockCreateAdminClient.mockReturnValue({});
    mockIsInQuietHours.mockReturnValue(false);
    mockUpdateReminderStatus.mockResolvedValue({});
    mockGetVapidDetails.mockReturnValue({
      subject: "mailto:test@test.com",
      publicKey: "test-public-key",
      privateKey: "test-private-key",
    });
  });

  it("returns 401 without CRON_SECRET", async () => {
    const req = createRequest(false);
    const res = await GET(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("returns counts of 0 with no pending reminders", async () => {
    mockGetPendingReminders.mockResolvedValue([]);

    const res = await GET(createRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      dispatched: 0,
      failed: 0,
      skipped_quiet_hours: 0,
    });
  });

  it("retires unsupported legacy reminder sources without dispatching", async () => {
    const reminder = mockReminder({ source_type: "bill" });
    mockGetPendingReminders.mockResolvedValue([reminder]);

    const res = await GET(createRequest());
    const body = await res.json();

    expect(body).toEqual({
      dispatched: 0,
      failed: 1,
      skipped_quiet_hours: 0,
    });
    expect(mockGetNotificationProjection).not.toHaveBeenCalled();
    expect(mockSendPushNotification).not.toHaveBeenCalled();
    expect(mockSendReminderEmail).not.toHaveBeenCalled();
    expect(mockUpdateReminderStatus).toHaveBeenCalledWith(
      "user-1",
      "rem-1",
      "failed",
    );
  });

  it("dispatches push and email for reminder with both channels", async () => {
    const reminder = mockReminder();
    const profile = mockProfile();
    mockGetPendingReminders.mockResolvedValue([reminder]);
    mockGetNotificationProjection.mockResolvedValue(profile);
    mockSendPushNotification.mockResolvedValue({ sent: 1, failed: 0 });
    mockSendReminderEmail.mockResolvedValue({ success: true });

    const res = await GET(createRequest());
    const body = await res.json();

    expect(body.dispatched).toBe(1);
    expect(body.failed).toBe(0);
    expect(body.skipped_quiet_hours).toBe(0);

    expect(mockSendPushNotification).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({
        title: "Reminder",
        sourceType: "task",
        sourceId: "task-1",
      }),
      expect.anything()
    );
    expect(mockSendReminderEmail).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({
        sourceType: "task",
      })
    );
    expect(mockUpdateReminderStatus).toHaveBeenCalledWith(
      "user-1",
      "rem-1",
      "sent",
      expect.any(String)
    );
  });

  it("push-only reminder during quiet hours stays pending (not stale)", async () => {
    // Use a recent fire_at so it doesn't hit the staleness threshold
    const recentFireAt = new Date(Date.now() - 30 * 60 * 1000).toISOString(); // 30min ago
    const reminder = mockReminder({ channels: ["push"], fire_at: recentFireAt });
    const profile = mockProfile({
      preferences: {
        quiet_hours_start: "22:00",
        quiet_hours_end: "07:00",
      },
    });
    mockGetPendingReminders.mockResolvedValue([reminder]);
    mockGetNotificationProjection.mockResolvedValue(profile);
    mockIsInQuietHours.mockReturnValue(true);

    const res = await GET(createRequest());
    const body = await res.json();

    expect(body.skipped_quiet_hours).toBe(1);
    expect(body.dispatched).toBe(0);
    expect(mockSendPushNotification).not.toHaveBeenCalled();
    expect(mockUpdateReminderStatus).not.toHaveBeenCalled();
  });

  it("stale push-only reminder during quiet hours is marked failed", async () => {
    // fire_at is old enough to exceed staleness threshold
    const staleFireAt = new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(); // 5 hours ago
    const reminder = mockReminder({ channels: ["push"], fire_at: staleFireAt });
    const profile = mockProfile();
    mockGetPendingReminders.mockResolvedValue([reminder]);
    mockGetNotificationProjection.mockResolvedValue(profile);
    mockIsInQuietHours.mockReturnValue(true);

    const res = await GET(createRequest());
    const body = await res.json();

    expect(body.failed).toBe(1);
    expect(body.skipped_quiet_hours).toBe(0);
    expect(mockUpdateReminderStatus).toHaveBeenCalledWith("user-1", "rem-1", "failed");
  });

  it("email-only reminder during quiet hours still dispatches", async () => {
    const reminder = mockReminder({ channels: ["email"] });
    const profile = mockProfile();
    mockGetPendingReminders.mockResolvedValue([reminder]);
    mockGetNotificationProjection.mockResolvedValue(profile);
    mockIsInQuietHours.mockReturnValue(true);
    mockSendReminderEmail.mockResolvedValue({ success: true });

    const res = await GET(createRequest());
    const body = await res.json();

    expect(body.dispatched).toBe(1);
    expect(body.skipped_quiet_hours).toBe(0);
    expect(mockSendPushNotification).not.toHaveBeenCalled();
    expect(mockSendReminderEmail).toHaveBeenCalled();
  });

  it("push+email during quiet hours dispatches email only, marks sent", async () => {
    const reminder = mockReminder({ channels: ["push", "email"] });
    const profile = mockProfile();
    mockGetPendingReminders.mockResolvedValue([reminder]);
    mockGetNotificationProjection.mockResolvedValue(profile);
    mockIsInQuietHours.mockReturnValue(true);
    mockSendReminderEmail.mockResolvedValue({ success: true });

    const res = await GET(createRequest());
    const body = await res.json();

    expect(body.dispatched).toBe(1);
    expect(body.skipped_quiet_hours).toBe(0);
    expect(mockSendPushNotification).not.toHaveBeenCalled();
    expect(mockSendReminderEmail).toHaveBeenCalled();
    expect(mockUpdateReminderStatus).toHaveBeenCalledWith(
      "user-1",
      "rem-1",
      "sent",
      expect.any(String)
    );
  });

  it("all channels fail sets status to failed", async () => {
    const reminder = mockReminder({ channels: ["push", "email"] });
    const profile = mockProfile();
    mockGetPendingReminders.mockResolvedValue([reminder]);
    mockGetNotificationProjection.mockResolvedValue(profile);
    mockSendPushNotification.mockResolvedValue({ sent: 0, failed: 1 });
    mockSendReminderEmail.mockResolvedValue({ success: false, error: "fail" });

    const res = await GET(createRequest());
    const body = await res.json();

    expect(body.failed).toBe(1);
    expect(body.dispatched).toBe(0);
    expect(mockUpdateReminderStatus).toHaveBeenCalledWith(
      "user-1",
      "rem-1",
      "failed"
    );
  });

  it("one reminder failure does not stop the batch", async () => {
    const reminder1 = mockReminder({ id: "rem-1", user_id: "user-1" });
    const reminder2 = mockReminder({ id: "rem-2", user_id: "user-2" });
    const profile = mockProfile();

    mockGetPendingReminders.mockResolvedValue([reminder1, reminder2]);
    // First Notifications projection call throws (simulating DB error), second succeeds
    mockGetNotificationProjection
      .mockRejectedValueOnce(new Error("DB connection error"))
      .mockResolvedValueOnce(profile);
    mockSendPushNotification.mockResolvedValue({ sent: 1, failed: 0 });
    mockSendReminderEmail.mockResolvedValue({ success: true });

    const res = await GET(createRequest());
    const body = await res.json();

    // First fails (catch at getProfile), second dispatched
    expect(body.dispatched).toBe(1);
    expect(body.failed).toBe(1);
  });
});
