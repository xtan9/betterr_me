import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useNotifications } from "@/lib/hooks/use-notifications";

const { mockSetReminderEmail, mockPreference } = vi.hoisted(() => ({
  mockSetReminderEmail: vi.fn(),
  mockPreference: {
    reminderEmail: {
      status: "unavailable",
      reason: "identityEmailUnavailable",
    } as
      | { status: "ready"; value: { enabled: boolean } }
      | { status: "unavailable"; reason: "identityEmailUnavailable" },
    setReminderEmail: vi.fn(),
  },
}));

vi.mock("@/lib/hooks/use-profile-preferences", () => ({
  useNotificationPreferences: () => ({
    ...mockPreference,
    setReminderEmail: mockSetReminderEmail,
  }),
}));

describe("useNotifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPreference.reminderEmail = {
      status: "unavailable",
      reason: "identityEmailUnavailable",
    };
  });

  it("presents disabled without hiding an unavailable Identity Email dependency", () => {
    const { result } = renderHook(() => useNotifications());

    expect(result.current.reminderEmail).toEqual({ enabled: false });
    expect(result.current.reminderEmailPreference).toEqual({
      status: "unavailable",
      reason: "identityEmailUnavailable",
    });
    expect(result.current.setReminderEmail).toBe(mockSetReminderEmail);
  });

  it("presents an accepted enabled Reminder Email value", () => {
    mockPreference.reminderEmail = {
      status: "ready",
      value: { enabled: true },
    };

    const { result } = renderHook(() => useNotifications());

    expect(result.current.reminderEmail).toEqual({ enabled: true });
    expect(result.current.reminderEmailPreference).toEqual({
      status: "ready",
      value: { enabled: true },
    });
  });
});
