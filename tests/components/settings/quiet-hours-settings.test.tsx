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
    mockMutate.mockResolvedValue(undefined);
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        profile: { preferences: {} },
      }),
    });
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

  it("sends only the quiet-hours intent and caches the accepted profile", async () => {
    const acceptedProfile = {
      id: "user-123",
      updated_at: "2026-07-30T12:00:02.000000+00:00",
      preferences: {
        theme: "dark",
        weight_unit: "kg",
        quiet_hours_start: "22:00",
        quiet_hours_end: "07:00",
      },
    };
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ profile: acceptedProfile }),
    });
    render(<QuietHoursSettings />);

    fireEvent.click(screen.getByRole("switch"));
    fireEvent.click(screen.getByText("quietHours.save"));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith("/api/profile/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: expect.stringContaining("quiet_hours_start"),
      });
    });

    const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(callBody).toEqual({
      quiet_hours_start: "22:00",
      quiet_hours_end: "07:00",
    });
    const [cacheUpdater, options] = mockMutate.mock.calls[0];
    expect(options).toEqual({ revalidate: false });
    expect(cacheUpdater()).toEqual({
      profile: {
        id: "user-123",
        updated_at: "2026-07-30T12:00:02.000000+00:00",
        preferences: {
          theme: "dark",
          weight_unit: "kg",
          quiet_hours_start: "22:00",
          quiet_hours_end: "07:00",
        },
      },
    });
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
    mockSWRData = {
      profile: {
        preferences: {
          quiet_hours_start: "22:00",
          quiet_hours_end: "07:00",
        },
      },
    };
    render(<QuietHoursSettings />);

    fireEvent.click(screen.getByRole("switch"));

    fireEvent.click(screen.getByText("quietHours.save"));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled();
    });

    const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(callBody.quiet_hours_start).toBeNull();
    expect(callBody.quiet_hours_end).toBeNull();
  });

  it("sends only the quiet-hours key that changed", async () => {
    mockSWRData = {
      profile: {
        preferences: {
          quiet_hours_start: "23:00",
          quiet_hours_end: "08:00",
        },
      },
    };
    render(<QuietHoursSettings />);

    fireEvent.change(screen.getByLabelText("quietHours.startTime"), {
      target: { value: "21:30" },
    });
    fireEvent.click(screen.getByText("quietHours.save"));

    await waitFor(() => expect(mockFetch).toHaveBeenCalled());
    expect(JSON.parse(mockFetch.mock.calls[0][1].body)).toEqual({
      quiet_hours_start: "21:30",
    });
  });

  it("does not offer a save when quiet hours are unchanged", () => {
    mockSWRData = {
      profile: {
        preferences: {
          quiet_hours_start: "23:00",
          quiet_hours_end: "08:00",
        },
      },
    };

    render(<QuietHoursSettings />);

    expect(screen.getByText("quietHours.save").closest("button")).toBeDisabled();
  });
});
