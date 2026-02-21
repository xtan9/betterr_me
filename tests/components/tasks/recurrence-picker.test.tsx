import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RecurrencePicker } from "@/components/tasks/recurrence-picker";
import type { RecurrenceRule, EndType } from "@/lib/db/types";

vi.mock("next-intl", () => ({
  useTranslations: () => {
    const t = (key: string) => {
      const messages: Record<string, string> = {
        none: "None",
        daily: "Daily",
        weekdays: "Weekdays (Mon-Fri)",
        weekly: "Weekly",
        biweekly: "Every 2 weeks",
        monthly: "Monthly",
        yearly: "Yearly",
        custom: "Custom",
        every: "Every",
        days: "days",
        weeks: "weeks",
        months: "months",
        years: "years",
        onDays: "On days",
        ends: "Ends",
        endNever: "Never",
        endAfter: "After",
        endTimes: "times",
        endOn: "On date",
        "dayShort.sun": "S",
        "dayShort.mon": "M",
        "dayShort.tue": "T",
        "dayShort.wed": "W",
        "dayShort.thu": "T",
        "dayShort.fri": "F",
        "dayShort.sat": "S",
      };
      return messages[key] ?? key;
    };
    return t;
  },
}));

describe("RecurrencePicker", () => {
  const mockOnChange = vi.fn();
  const user = userEvent.setup();

  const defaultProps = {
    value: null as RecurrenceRule | null,
    endType: "never" as EndType,
    endDate: null as string | null,
    endCount: null as number | null,
    onChange: mockOnChange,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders preset selector", () => {
    render(<RecurrencePicker {...defaultProps} />);
    expect(screen.getByText("None")).toBeInTheDocument();
  });

  it("fires onChange with daily rule when daily preset selected", async () => {
    render(<RecurrencePicker {...defaultProps} />);

    // Open the dropdown
    await user.click(screen.getByRole("combobox"));
    await user.click(screen.getByRole("option", { name: "Daily" }));

    expect(mockOnChange).toHaveBeenCalledWith(
      { frequency: "daily", interval: 1 },
      "never",
      null,
      null,
    );
  });

  it("fires onChange with weekly rule when weekdays preset selected", async () => {
    render(<RecurrencePicker {...defaultProps} />);

    await user.click(screen.getByRole("combobox"));
    await user.click(
      screen.getByRole("option", { name: "Weekdays (Mon-Fri)" }),
    );

    expect(mockOnChange).toHaveBeenCalledWith(
      { frequency: "weekly", interval: 1, days_of_week: [1, 2, 3, 4, 5] },
      "never",
      null,
      null,
    );
  });

  it("shows end condition controls when a rule is selected", () => {
    render(
      <RecurrencePicker
        {...defaultProps}
        value={{ frequency: "daily", interval: 1 }}
      />,
    );

    expect(screen.getByText("Ends")).toBeInTheDocument();
    expect(screen.getByText("Never")).toBeInTheDocument();
  });

  it("does not show end condition controls when no rule selected", () => {
    render(<RecurrencePicker {...defaultProps} value={null} />);

    expect(screen.queryByText("Ends")).not.toBeInTheDocument();
  });

  it("shows day toggles for weekly preset", () => {
    const weeklyRule: RecurrenceRule = {
      frequency: "weekly",
      interval: 1,
      days_of_week: [1],
    };

    render(<RecurrencePicker {...defaultProps} value={weeklyRule} />);

    expect(screen.getByText("On days")).toBeInTheDocument();
  });

  it("respects disabled prop", () => {
    render(<RecurrencePicker {...defaultProps} disabled />);

    const combobox = screen.getByRole("combobox");
    expect(combobox).toBeDisabled();
  });

  it("shows custom controls when custom preset is active", async () => {
    render(<RecurrencePicker {...defaultProps} />);

    await user.click(screen.getByRole("combobox"));
    await user.click(screen.getByRole("option", { name: "Custom" }));

    expect(mockOnChange).toHaveBeenCalledWith(
      { frequency: "daily", interval: 1 },
      "never",
      null,
      null,
    );
  });
});
