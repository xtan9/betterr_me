import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ReminderDefaultsSettings } from "@/components/settings/reminder-defaults-settings";

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

describe("ReminderDefaultsSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSWRData = null;
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });
  });

  it("renders title", () => {
    render(<ReminderDefaultsSettings />);
    expect(screen.getByText("reminderDefaults.title")).toBeInTheDocument();
  });

  it("renders all four source type sections", () => {
    render(<ReminderDefaultsSettings />);

    expect(
      screen.getByText("reminderDefaults.sourceType.calendar_event")
    ).toBeInTheDocument();
    expect(
      screen.getByText("reminderDefaults.sourceType.task")
    ).toBeInTheDocument();
    expect(
      screen.getByText("reminderDefaults.sourceType.habit")
    ).toBeInTheDocument();
    expect(
      screen.getByText("reminderDefaults.sourceType.bill")
    ).toBeInTheDocument();
  });

  it("shows default values when no user defaults exist", () => {
    mockSWRData = { defaults: [] };
    render(<ReminderDefaultsSettings />);

    // 4 source type sections should be rendered
    const pushCheckboxes = screen.getAllByLabelText(/push$/);
    expect(pushCheckboxes).toHaveLength(4);

    const emailCheckboxes = screen.getAllByLabelText(/email$/);
    expect(emailCheckboxes).toHaveLength(4);
  });

  it("shows user saved defaults when they exist", () => {
    mockSWRData = {
      defaults: [
        {
          source_type: "calendar_event",
          relative_minutes: 30,
          channels: ["push", "email"],
        },
      ],
    };

    render(<ReminderDefaultsSettings />);

    // Calendar event should have both push and email checked
    const calPush = screen.getByLabelText("calendar_event push");
    const calEmail = screen.getByLabelText("calendar_event email");
    expect(calPush).toHaveAttribute("aria-checked", "true");
    expect(calEmail).toHaveAttribute("aria-checked", "true");
  });

  it("channel checkboxes are present for push and email", () => {
    render(<ReminderDefaultsSettings />);

    // Each source type has push and email
    expect(screen.getAllByText("reminderDefaults.push")).toHaveLength(4);
    expect(screen.getAllByText("reminderDefaults.email")).toHaveLength(4);
  });

  it("clicking save calls PUT /api/reminder-defaults for dirty types", async () => {
    mockSWRData = { defaults: [] };
    render(<ReminderDefaultsSettings />);

    // Toggle email for calendar_event to make it dirty
    fireEvent.click(screen.getByLabelText("calendar_event email"));

    // Save button should be enabled now
    const saveBtn = screen.getByText("reminderDefaults.saveAll");
    expect(saveBtn.closest("button")).not.toBeDisabled();

    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith("/api/reminder-defaults", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: expect.any(String),
      });
    });

    // Verify the body
    const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(callBody.source_type).toBe("calendar_event");
    expect(callBody.channels).toContain("email");
  });

  it("save button is disabled when no changes are made", () => {
    mockSWRData = { defaults: [] };
    render(<ReminderDefaultsSettings />);

    const saveBtn = screen.getByText("reminderDefaults.saveAll");
    expect(saveBtn.closest("button")).toBeDisabled();
  });
});
