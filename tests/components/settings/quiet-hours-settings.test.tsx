import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QuietHoursSettings } from "@/components/settings/quiet-hours-settings";

// Mock next-intl
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
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

const mockSetPushQuietWindow = vi.fn();
let mockQuietState: {
  status: "ready";
  value:
    | { status: "disabled" }
    | { status: "enabled"; startLocal: string; endLocal: string };
} = { status: "ready", value: { status: "disabled" } };

vi.mock("@/lib/hooks/use-notifications", () => ({
  useNotifications: () => ({
    pushQuietWindow: mockQuietState,
    setPushQuietWindow: mockSetPushQuietWindow,
  }),
}));

describe("QuietHoursSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockQuietState = { status: "ready", value: { status: "disabled" } };
    mockSetPushQuietWindow.mockResolvedValue(undefined);
  });

  it("renders quiet hours title and switch", () => {
    render(<QuietHoursSettings />);
    expect(screen.getByText("quietHours.title")).toBeInTheDocument();
    expect(screen.getByRole("switch")).toBeInTheDocument();
  });

  it("when switch is off, time inputs are not visible", () => {
    render(<QuietHoursSettings />);
    expect(screen.queryByLabelText("quietHours.startTime")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("quietHours.endTime")).not.toBeInTheDocument();
  });

  it("when switch is on, start and end time inputs are visible", () => {
    render(<QuietHoursSettings />);

    fireEvent.click(screen.getByRole("switch"));

    expect(screen.getByDisplayValue("22:00")).toBeInTheDocument();
    expect(screen.getByDisplayValue("07:00")).toBeInTheDocument();
  });

  it("default start time is 22:00 and end time is 07:00", () => {
    render(<QuietHoursSettings />);

    // Enable quiet hours
    fireEvent.click(screen.getByRole("switch"));

    const startInput = screen.getByDisplayValue("22:00");
    const endInput = screen.getByDisplayValue("07:00");

    expect(startInput).toHaveAttribute("type", "time");
    expect(endInput).toHaveAttribute("type", "time");
  });

  it("shows email exemption note text", () => {
    render(<QuietHoursSettings />);
    expect(screen.getByText("quietHours.emailNote")).toBeInTheDocument();
  });

  it("sends one complete owner-specific quiet-window intent", async () => {
    render(<QuietHoursSettings />);

    fireEvent.click(screen.getByRole("switch"));
    fireEvent.click(screen.getByText("quietHours.save"));

    await waitFor(() => expect(mockSetPushQuietWindow).toHaveBeenCalledWith({
      status: "enabled",
      startLocal: "22:00",
      endLocal: "07:00",
    }));
  });

  it("loads saved quiet hours from profile", () => {
    mockQuietState = {
      status: "ready",
      value: {
        status: "enabled",
        startLocal: "23:00",
        endLocal: "08:00",
      },
    };

    render(<QuietHoursSettings />);

    // Switch should be on
    const switchEl = screen.getByRole("switch");
    expect(switchEl).toHaveAttribute("aria-checked", "true");

    // Time inputs should show saved values
    expect(screen.getByDisplayValue("23:00")).toBeInTheDocument();
    expect(screen.getByDisplayValue("08:00")).toBeInTheDocument();
  });

  it("sends null when quiet hours are disabled on save", async () => {
    mockQuietState = {
      status: "ready",
      value: {
        status: "enabled",
        startLocal: "22:00",
        endLocal: "07:00",
      },
    };
    render(<QuietHoursSettings />);

    fireEvent.click(screen.getByRole("switch"));

    fireEvent.click(screen.getByText("quietHours.save"));

    await waitFor(() =>
      expect(mockSetPushQuietWindow).toHaveBeenCalledWith({ status: "disabled" }),
    );
  });

  it("sends the complete quiet window when one endpoint changes", async () => {
    mockQuietState = {
      status: "ready",
      value: {
        status: "enabled",
        startLocal: "23:00",
        endLocal: "08:00",
      },
    };
    render(<QuietHoursSettings />);

    fireEvent.change(screen.getByLabelText("quietHours.startTime"), {
      target: { value: "21:30" },
    });
    fireEvent.click(screen.getByText("quietHours.save"));

    await waitFor(() => expect(mockSetPushQuietWindow).toHaveBeenCalledWith({
      status: "enabled",
      startLocal: "21:30",
      endLocal: "08:00",
    }));
  });

  it("does not offer a save when quiet hours are unchanged", () => {
    mockQuietState = {
      status: "ready",
      value: {
        status: "enabled",
        startLocal: "23:00",
        endLocal: "08:00",
      },
    };

    render(<QuietHoursSettings />);

    expect(screen.getByText("quietHours.save").closest("button")).toBeDisabled();
  });
});
