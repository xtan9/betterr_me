import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetProfile, mockSend } = vi.hoisted(() => ({
  mockGetProfile: vi.fn(),
  mockSend: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({}),
}));

vi.mock("@/lib/db", () => ({
  ProfilesDB: class {
    getProfile = mockGetProfile;
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

const profile = {
  id: "user-1",
  email: "person@example.test",
  email_notifications_enabled: true,
  preferences: {
    email_notifications_enabled: false,
  },
};

describe("sendReminderEmail preference intent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSend.mockResolvedValue({ data: { id: "email-1" }, error: null });
  });

  it("honors the accepted preference document over the legacy column", async () => {
    mockGetProfile.mockResolvedValue(profile);

    const result = await sendReminderEmail("user-1", {
      sourceType: "task",
      itemName: "Plan tomorrow",
    });

    expect(result).toEqual({ success: true, skipped: true });
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("sends when the accepted preference enables email", async () => {
    mockGetProfile.mockResolvedValue({
      ...profile,
      email_notifications_enabled: false,
      preferences: { email_notifications_enabled: true },
    });

    const result = await sendReminderEmail("user-1", {
      sourceType: "task",
      itemName: "Plan tomorrow",
    });

    expect(result).toEqual({ success: true, messageId: "email-1" });
    expect(mockSend).toHaveBeenCalledOnce();
  });
});
