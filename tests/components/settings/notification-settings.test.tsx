import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { NotificationSettings } from "@/components/settings/notification-settings";

// Mock next-intl
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) => {
    if (params) return `${key}:${JSON.stringify(params)}`;
    return key;
  },
}));

// Mock sonner
const mockToastSuccess = vi.fn();
const mockToastError = vi.fn();
vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => mockToastSuccess(...args),
    error: (...args: unknown[]) => mockToastError(...args),
  },
}));

// Mock SWR for the device-count query.
const mockMutateSubs = vi.fn();
vi.mock("swr", () => ({
  default: (key: string | null) => {
    return {
      data: key ? { count: 2 } : undefined,
      mutate: mockMutateSubs,
    };
  },
}));

// Mock fetch for unrelated child components
const mockFetch = vi.fn();
global.fetch = mockFetch;

const mockSetReminderEmail = vi.fn();
const mockSetPushQuietWindow = vi.fn();
const mockUseNotifications = vi.hoisted(() => vi.fn());
vi.mock("@/lib/hooks/use-notifications", () => ({
  useNotifications: mockUseNotifications,
}));

vi.mock("@/components/settings/quiet-hours-settings", () => ({
  QuietHoursSettings: () => <div />,
}));

// Mock the hook
const mockSubscribe = vi.fn();
const mockUnsubscribe = vi.fn();
const mockSendTest = vi.fn();

vi.mock("@/hooks/use-push-notifications", () => ({
  usePushNotifications: () => mockHookReturn,
}));

let mockHookReturn = {
  permission: "default" as NotificationPermission,
  isSubscribed: false,
  isLoading: false,
  isSupported: true,
  subscribe: mockSubscribe,
  unsubscribe: mockUnsubscribe,
  sendTest: mockSendTest,
};

describe("NotificationSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSetReminderEmail.mockResolvedValue(undefined);
    mockSetPushQuietWindow.mockResolvedValue(undefined);
    mockUseNotifications.mockReturnValue({
      reminderEmail: { enabled: false },
      reminderEmailPreference: {
        status: "ready",
        value: { enabled: false },
      },
      pushQuietWindow: { status: "ready", value: { status: "disabled" } },
      setReminderEmail: mockSetReminderEmail,
      setPushQuietWindow: mockSetPushQuietWindow,
    });
    mockHookReturn = {
      permission: "default",
      isSubscribed: false,
      isLoading: false,
      isSupported: true,
      subscribe: mockSubscribe,
      unsubscribe: mockUnsubscribe,
      sendTest: mockSendTest,
    };
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        profile: { preferences: { email_notifications_enabled: true } },
      }),
    });
  });

  it("renders title and description", () => {
    render(<NotificationSettings />);
    expect(screen.getByText("title")).toBeInTheDocument();
    expect(screen.getByText("description")).toBeInTheDocument();
  });

  it("shows not-supported message when browser lacks support", () => {
    mockHookReturn = { ...mockHookReturn, isSupported: false };
    render(<NotificationSettings />);
    expect(screen.getByText("notSupported")).toBeInTheDocument();
  });

  it("shows denied warning when permission is denied", () => {
    mockHookReturn = { ...mockHookReturn, permission: "denied" };
    render(<NotificationSettings />);
    expect(screen.getByText("denied")).toBeInTheDocument();
  });

  it("disables push switch when permission is denied", () => {
    mockHookReturn = { ...mockHookReturn, permission: "denied" };
    render(<NotificationSettings />);
    const toggle = document.getElementById("push-notifications-toggle") as HTMLButtonElement;
    expect(toggle).toBeDisabled();
  });

  it("shows test button when subscribed", () => {
    mockHookReturn = {
      ...mockHookReturn,
      isSubscribed: true,
      permission: "granted",
    };
    render(<NotificationSettings />);
    expect(screen.getByText("testButton")).toBeInTheDocument();
  });

  it("hides test button when not subscribed", () => {
    render(<NotificationSettings />);
    expect(screen.queryByText("testButton")).not.toBeInTheDocument();
  });

  it("shows device count when subscribed", () => {
    mockHookReturn = {
      ...mockHookReturn,
      isSubscribed: true,
      permission: "granted",
    };
    render(<NotificationSettings />);
    // SWR mock returns { count: 2 }, so subscribedDevices should render with count param
    expect(screen.getByText(/subscribedDevices/)).toBeInTheDocument();
  });

  it("calls subscribe when toggle is turned on", async () => {
    mockSubscribe.mockResolvedValue(undefined);
    render(<NotificationSettings />);
    const toggle = document.getElementById("push-notifications-toggle") as HTMLButtonElement;
    fireEvent.click(toggle);
    await waitFor(() => {
      expect(mockSubscribe).toHaveBeenCalled();
    });
  });

  it("calls unsubscribe when toggle is turned off", async () => {
    mockHookReturn = {
      ...mockHookReturn,
      isSubscribed: true,
      permission: "granted",
    };
    mockUnsubscribe.mockResolvedValue(undefined);
    render(<NotificationSettings />);
    const toggle = document.getElementById("push-notifications-toggle") as HTMLButtonElement;
    fireEvent.click(toggle);
    await waitFor(() => {
      expect(mockUnsubscribe).toHaveBeenCalled();
    });
  });

  it("shows error toast when subscribe fails", async () => {
    mockSubscribe.mockRejectedValue(new Error("fail"));
    render(<NotificationSettings />);
    const toggle = document.getElementById("push-notifications-toggle") as HTMLButtonElement;
    fireEvent.click(toggle);
    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith("subscribeError");
    });
  });

  it("calls sendTest and shows success toast", async () => {
    mockHookReturn = {
      ...mockHookReturn,
      isSubscribed: true,
      permission: "granted",
    };
    mockSendTest.mockResolvedValue(undefined);
    render(<NotificationSettings />);
    const testBtn = screen.getByText("testButton");
    fireEvent.click(testBtn);
    await waitFor(() => {
      expect(mockSendTest).toHaveBeenCalled();
      expect(mockToastSuccess).toHaveBeenCalledWith("testSent");
    });
  });

  it("mutates SWR after successful subscribe", async () => {
    mockSubscribe.mockResolvedValue(undefined);
    render(<NotificationSettings />);
    const toggle = document.getElementById("push-notifications-toggle") as HTMLButtonElement;
    fireEvent.click(toggle);
    await waitFor(() => {
      expect(mockMutateSubs).toHaveBeenCalled();
    });
  });

  // --- Email notification tests ---

  it("renders email notification section with emailTitle", () => {
    render(<NotificationSettings />);
    expect(screen.getByText("emailTitle")).toBeInTheDocument();
    expect(screen.getByText("emailDescription")).toBeInTheDocument();
    expect(screen.getByText("emailExplainer")).toBeInTheDocument();
  });

  it("renders email toggle with correct id", () => {
    render(<NotificationSettings />);
    const emailToggle = document.getElementById("email-notifications-toggle");
    expect(emailToggle).toBeInTheDocument();
  });

  it("renders email section even when push is not supported", () => {
    mockHookReturn = { ...mockHookReturn, isSupported: false };
    render(<NotificationSettings />);
    expect(screen.getByText("emailTitle")).toBeInTheDocument();
    expect(
      document.getElementById("email-notifications-toggle")
    ).toBeInTheDocument();
  });

  it("submits an owner-specific email-notification preference intent", async () => {
    render(<NotificationSettings />);
    const emailToggle = document.getElementById(
      "email-notifications-toggle"
    ) as HTMLButtonElement;
    expect(emailToggle).toBeInTheDocument();

    fireEvent.click(emailToggle);

    await waitFor(() => {
      expect(mockSetReminderEmail).toHaveBeenCalledWith(true);
    });
  });

  it("shows success toast after email toggle", async () => {
    render(<NotificationSettings />);
    const emailToggle = document.getElementById(
      "email-notifications-toggle"
    ) as HTMLButtonElement;

    fireEvent.click(emailToggle);

    await waitFor(() => {
      expect(mockToastSuccess).toHaveBeenCalledWith("emailEnabled");
    });
  });

  it("shows error toast when email toggle returns HTTP error", async () => {
    mockSetReminderEmail.mockRejectedValueOnce(new Error("Server error"));
    render(<NotificationSettings />);
    const emailToggle = document.getElementById(
      "email-notifications-toggle"
    ) as HTMLButtonElement;

    fireEvent.click(emailToggle);

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith("emailToggleError");
    });
    expect(mockSetReminderEmail).toHaveBeenCalledWith(true);
  });

  it("shows error toast when email toggle fails with network error", async () => {
    mockSetReminderEmail.mockRejectedValueOnce(new Error("Network error"));
    render(<NotificationSettings />);
    const emailToggle = document.getElementById(
      "email-notifications-toggle"
    ) as HTMLButtonElement;

    fireEvent.click(emailToggle);

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith("emailToggleError");
    });
  });

  it("keeps Reminder Email unavailable when Identity Email is missing", () => {
    mockUseNotifications.mockReturnValue({
      reminderEmail: { enabled: false },
      reminderEmailPreference: {
        status: "unavailable",
        reason: "identityEmailUnavailable",
      },
      pushQuietWindow: { status: "ready", value: { status: "disabled" } },
      setReminderEmail: mockSetReminderEmail,
      setPushQuietWindow: mockSetPushQuietWindow,
    });

    render(<NotificationSettings />);

    expect(document.getElementById("email-notifications-toggle")).toBeDisabled();
    expect(mockSetReminderEmail).not.toHaveBeenCalled();
  });

  it("delegates accepted-state revalidation to the domain hook", async () => {
    render(<NotificationSettings />);
    const emailToggle = document.getElementById(
      "email-notifications-toggle"
    ) as HTMLButtonElement;

    fireEvent.click(emailToggle);

    await waitFor(() => expect(mockSetReminderEmail).toHaveBeenCalledWith(true));
  });
});
