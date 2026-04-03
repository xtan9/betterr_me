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

// Mock SWR
const mockMutate = vi.fn();
let mockSWRData: Record<string, unknown> | null = null;

vi.mock("swr", () => ({
  default: () => ({
    data: mockSWRData,
    mutate: mockMutate,
    isLoading: false,
  }),
}));

// Mock fetcher
vi.mock("@/lib/fetcher", () => ({
  fetcher: vi.fn(),
}));

// Mock fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("QuietHoursSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSWRData = null;
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });
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

  it("clicking save calls PATCH /api/profile with correct preferences", async () => {
    render(<QuietHoursSettings />);

    // Enable quiet hours
    fireEvent.click(screen.getByRole("switch"));

    // Click save
    fireEvent.click(screen.getByText("quietHours.save"));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: expect.stringContaining("quiet_hours_start"),
      });
    });

    // Verify the body has the right values
    const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(callBody.preferences.quiet_hours_start).toBe("22:00");
    expect(callBody.preferences.quiet_hours_end).toBe("07:00");
  });

  it("loads saved quiet hours from profile", () => {
    mockSWRData = {
      profile: {
        preferences: {
          quiet_hours_start: "23:00",
          quiet_hours_end: "08:00",
        },
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
    render(<QuietHoursSettings />);

    // Click save with switch off
    fireEvent.click(screen.getByText("quietHours.save"));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled();
    });

    const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(callBody.preferences.quiet_hours_start).toBeNull();
    expect(callBody.preferences.quiet_hours_end).toBeNull();
  });
});
