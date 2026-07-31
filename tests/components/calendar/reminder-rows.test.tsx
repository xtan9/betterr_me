import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  ReminderRows,
  ReminderRowData,
  SMART_DEFAULTS,
  RELATIVE_PRESETS,
} from "@/components/calendar/reminder-rows";

// Mock next-intl
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

// Mock crypto.randomUUID
vi.stubGlobal("crypto", {
  randomUUID: () => "test-uuid-123",
});

describe("ReminderRows", () => {
  let mockOnChange: (rows: ReminderRowData[]) => void;

  beforeEach(() => {
    mockOnChange = vi.fn<(rows: ReminderRowData[]) => void>();
  });

  it("renders 'Add reminder' button", () => {
    render(<ReminderRows rows={[]} onChange={mockOnChange} />);
    expect(screen.getByText("reminders.add")).toBeInTheDocument();
  });

  it("clicking 'Add reminder' adds a new row with default values", () => {
    render(<ReminderRows rows={[]} onChange={mockOnChange} />);

    fireEvent.click(screen.getByText("reminders.add"));

    expect(mockOnChange).toHaveBeenCalledWith([
      expect.objectContaining({
        tempId: "test-uuid-123",
        reminderType: "relative",
        relativeMinutes: 15,
        absoluteTime: null,
        channels: ["push"],
      }),
    ]);
  });

  it("renders reminder row with select and channel checkboxes", () => {
    const rows: ReminderRowData[] = [
      {
        tempId: "row-1",
        reminderType: "relative",
        relativeMinutes: 15,
        absoluteTime: null,
        channels: ["push"],
      },
    ];

    render(<ReminderRows rows={rows} onChange={mockOnChange} />);

    // Channel checkboxes
    expect(screen.getByLabelText("Push")).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    // Remove button
    expect(screen.getByLabelText("reminders.remove")).toBeInTheDocument();
  });

  it("channel checkboxes are toggleable", () => {
    const rows: ReminderRowData[] = [
      {
        tempId: "row-1",
        reminderType: "relative",
        relativeMinutes: 15,
        absoluteTime: null,
        channels: ["push"],
      },
    ];

    render(<ReminderRows rows={rows} onChange={mockOnChange} />);

    // Toggle email on (push is already on, so adding email is valid)
    fireEvent.click(screen.getByLabelText("Email"));

    expect(mockOnChange).toHaveBeenCalledWith([
      expect.objectContaining({
        channels: ["push", "email"],
      }),
    ]);
  });

  it("clicking trash icon removes the row", () => {
    const rows: ReminderRowData[] = [
      {
        tempId: "row-1",
        reminderType: "relative",
        relativeMinutes: 15,
        absoluteTime: null,
        channels: ["push"],
      },
    ];

    render(<ReminderRows rows={rows} onChange={mockOnChange} />);

    fireEvent.click(screen.getByLabelText("reminders.remove"));

    expect(mockOnChange).toHaveBeenCalledWith([]);
  });

  it("multiple rows can be added and each has independent controls", () => {
    const rows: ReminderRowData[] = [
      {
        tempId: "row-1",
        reminderType: "relative",
        relativeMinutes: 15,
        absoluteTime: null,
        channels: ["push"],
      },
      {
        tempId: "row-2",
        reminderType: "relative",
        relativeMinutes: 60,
        absoluteTime: null,
        channels: ["email"],
      },
    ];

    render(<ReminderRows rows={rows} onChange={mockOnChange} />);

    // Two remove buttons
    const removeButtons = screen.getAllByLabelText("reminders.remove");
    expect(removeButtons).toHaveLength(2);

    // Two sets of push/email checkboxes
    const pushBoxes = screen.getAllByLabelText("Push");
    expect(pushBoxes).toHaveLength(2);
  });

  it("shows datetime-local input when type is absolute", () => {
    const rows: ReminderRowData[] = [
      {
        tempId: "row-1",
        reminderType: "absolute",
        relativeMinutes: null,
        absoluteTime: "2026-04-03T10:00",
        channels: ["push"],
      },
    ];

    render(<ReminderRows rows={rows} onChange={mockOnChange} />);

    const input = screen.getByLabelText("reminders.absoluteTime");
    expect(input).toBeInTheDocument();
    expect(input).toHaveAttribute("type", "datetime-local");
  });

  it("does not show datetime-local when type is relative", () => {
    const rows: ReminderRowData[] = [
      {
        tempId: "row-1",
        reminderType: "relative",
        relativeMinutes: 15,
        absoluteTime: null,
        channels: ["push"],
      },
    ];

    render(<ReminderRows rows={rows} onChange={mockOnChange} />);

    expect(
      screen.queryByLabelText("reminders.absoluteTime")
    ).not.toBeInTheDocument();
  });

  it("shows custom minutes input when relative minutes is null (custom)", () => {
    const rows: ReminderRowData[] = [
      {
        tempId: "row-1",
        reminderType: "relative",
        relativeMinutes: null,
        absoluteTime: null,
        channels: ["push"],
      },
    ];

    render(<ReminderRows rows={rows} onChange={mockOnChange} />);

    const input = screen.getByLabelText("reminders.customMinutes");
    expect(input).toBeInTheDocument();
    expect(input).toHaveAttribute("type", "number");
  });

  it("renders reminders title with bell icon", () => {
    render(<ReminderRows rows={[]} onChange={mockOnChange} />);
    expect(screen.getByText("reminders.title")).toBeInTheDocument();
  });

  it("disables controls when disabled prop is true", () => {
    const rows: ReminderRowData[] = [
      {
        tempId: "row-1",
        reminderType: "relative",
        relativeMinutes: 15,
        absoluteTime: null,
        channels: ["push"],
      },
    ];

    render(<ReminderRows rows={rows} onChange={mockOnChange} disabled />);

    // Remove button should be disabled
    expect(screen.getByLabelText("reminders.remove")).toBeDisabled();
    // Add button should be disabled
    expect(screen.getByText("reminders.add").closest("button")).toBeDisabled();
  });
});

describe("SMART_DEFAULTS", () => {
  it("has correct defaults for calendar_event", () => {
    expect(SMART_DEFAULTS.calendar_event).toEqual({
      relativeMinutes: 15,
      channels: ["push"],
    });
  });

  it("has correct defaults for task", () => {
    expect(SMART_DEFAULTS.task).toEqual({
      relativeMinutes: 60,
      channels: ["push"],
    });
  });

  it("has correct defaults for habit", () => {
    expect(SMART_DEFAULTS.habit).toEqual({
      relativeMinutes: 480,
      channels: ["push"],
    });
  });

});

describe("RELATIVE_PRESETS", () => {
  it("has expected preset values", () => {
    const values = RELATIVE_PRESETS.map((p) => p.value);
    expect(values).toEqual([5, 15, 30, 60, 1440, -1]);
  });
});
