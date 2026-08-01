import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetReminderEmailPreference, mockGetUserById, mockSend } = vi.hoisted(() => ({
  mockGetReminderEmailPreference: vi.fn(),
  mockGetUserById: vi.fn(),
  mockSend: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    auth: { admin: { getUserById: mockGetUserById } },
  }),
}));

vi.mock("@/lib/db/notifications", () => ({
  NotificationsDB: class {
    getReminderEmailPreference = mockGetReminderEmailPreference;
  },
}));

vi.mock("@/lib/email/resend", () => ({
  getResendClient: () => ({ emails: { send: mockSend } }),
}));

vi.mock("@/lib/email/templates", () => ({
  EMAIL_TEMPLATES: {
    task: { component: () => null },
    habit: { component: () => null },
    calendar_event: { component: () => null },
  },
  getSubject: () => "Reminder",
}));

vi.mock("@/lib/email/unsubscribe", () => ({
  getUnsubscribeUrl: () => "https://example.test/unsubscribe",
}));

vi.mock("@/lib/logger", () => ({
  log: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import { sendReminderEmail } from "@/lib/email/send";

describe("sendReminderEmail preference intent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSend.mockResolvedValue({ data: { id: "email-1" }, error: null });
    mockGetReminderEmailPreference.mockResolvedValue({
      status: "ready",
      value: { enabled: false },
    });
    mockGetUserById.mockResolvedValue({
      data: {
        user: {
          email: "person@example.test",
          email_confirmed_at: "2026-08-01T00:00:00.000Z",
        },
      },
      error: null,
    });
  });

  it("honors the accepted preference document over the legacy column", async () => {
    const result = await sendReminderEmail("user-1", {
      sourceType: "task",
      itemName: "Plan tomorrow",
    });

    expect(result).toEqual({ success: true, skipped: true });
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("sends when the accepted preference enables email", async () => {
    mockGetReminderEmailPreference.mockResolvedValue({
      status: "ready",
      value: { enabled: true },
    });

    const result = await sendReminderEmail("user-1", {
      sourceType: "task",
      itemName: "Plan tomorrow",
    });

    expect(result).toEqual({ success: true, messageId: "email-1" });
    expect(mockSend).toHaveBeenCalledOnce();
  });

  it("does not deliver an enabled preference without a verified Identity Email", async () => {
    mockGetReminderEmailPreference.mockResolvedValue({
      status: "unavailable",
      reason: "identityEmailUnavailable",
    });
    mockGetUserById.mockResolvedValue({
      data: {
        user: {
          email: "person@example.test",
          email_confirmed_at: null,
        },
      },
      error: null,
    });

    const result = await sendReminderEmail("user-1", {
      sourceType: "task",
      itemName: "Plan tomorrow",
    });

    expect(result).toEqual({ success: true, skipped: true });
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("does not invent a delivery address when Identity Email is absent", async () => {
    mockGetReminderEmailPreference.mockResolvedValue({
      status: "unavailable",
      reason: "identityEmailUnavailable",
    });
    mockGetUserById.mockResolvedValue({
      data: { user: null },
      error: null,
    });

    const result = await sendReminderEmail("user-1", {
      sourceType: "task",
      itemName: "Plan tomorrow",
    });

    expect(result).toEqual({ success: true, skipped: true });
    expect(mockSend).not.toHaveBeenCalled();
  });
});
