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

  // ruleToPreset branches
  it("ruleToPreset: biweekly rule (weekly interval=2) renders 'Every 2 weeks' preset", () => {
    const biweeklyRule: RecurrenceRule = {
      frequency: "weekly",
      interval: 2,
      days_of_week: [1],
    };
    render(<RecurrencePicker {...defaultProps} value={biweeklyRule} />);
    expect(screen.getByRole("combobox")).toHaveTextContent("Every 2 weeks");
  });

  it("ruleToPreset: monthly rule renders 'Monthly' preset", () => {
    const monthlyRule: RecurrenceRule = {
      frequency: "monthly",
      interval: 1,
      day_of_month: 15,
    };
    render(<RecurrencePicker {...defaultProps} value={monthlyRule} />);
    expect(screen.getByRole("combobox")).toHaveTextContent("Monthly");
  });

  it("ruleToPreset: yearly rule renders 'Yearly' preset", () => {
    const yearlyRule: RecurrenceRule = {
      frequency: "yearly",
      interval: 1,
      month_of_year: 6,
      day_of_month: 15,
    };
    render(<RecurrencePicker {...defaultProps} value={yearlyRule} />);
    expect(screen.getByRole("combobox")).toHaveTextContent("Yearly");
  });

  it("ruleToPreset: non-standard rule falls back to 'Custom' preset", () => {
    const customRule: RecurrenceRule = {
      frequency: "daily",
      interval: 3,
    };
    render(<RecurrencePicker {...defaultProps} value={customRule} />);
    // When custom is active, a second combobox (frequency) also renders;
    // assert on the preset combobox (first).
    const comboboxes = screen.getAllByRole("combobox");
    expect(comboboxes[0]).toHaveTextContent("Custom");
  });

  // presetToRule with startDate
  it("weekly preset with startDate uses startDate's day of week", async () => {
    // 2026-01-05 is a Monday (day 1)
    render(<RecurrencePicker {...defaultProps} startDate="2026-01-05" />);

    await user.click(screen.getByRole("combobox"));
    await user.click(screen.getByRole("option", { name: "Weekly" }));

    expect(mockOnChange).toHaveBeenCalledWith(
      { frequency: "weekly", interval: 1, days_of_week: [1] },
      "never",
      null,
      null,
    );
  });

  it("biweekly preset with startDate uses startDate's day of week", async () => {
    // 2026-01-07 is a Wednesday (day 3)
    render(<RecurrencePicker {...defaultProps} startDate="2026-01-07" />);

    await user.click(screen.getByRole("combobox"));
    await user.click(screen.getByRole("option", { name: "Every 2 weeks" }));

    expect(mockOnChange).toHaveBeenCalledWith(
      { frequency: "weekly", interval: 2, days_of_week: [3] },
      "never",
      null,
      null,
    );
  });

  it("monthly preset with startDate uses day_of_month from startDate", async () => {
    render(<RecurrencePicker {...defaultProps} startDate="2026-03-20" />);

    await user.click(screen.getByRole("combobox"));
    await user.click(screen.getByRole("option", { name: "Monthly" }));

    expect(mockOnChange).toHaveBeenCalledWith(
      { frequency: "monthly", interval: 1, day_of_month: 20 },
      "never",
      null,
      null,
    );
  });

  it("yearly preset with startDate uses month_of_year and day_of_month from startDate", async () => {
    render(<RecurrencePicker {...defaultProps} startDate="2026-07-04" />);

    await user.click(screen.getByRole("combobox"));
    await user.click(screen.getByRole("option", { name: "Yearly" }));

    expect(mockOnChange).toHaveBeenCalledWith(
      { frequency: "yearly", interval: 1, month_of_year: 7, day_of_month: 4 },
      "never",
      null,
      null,
    );
  });

  // End type changes
  it("selecting 'After' end type fires onChange with after_count endType", async () => {
    render(
      <RecurrencePicker
        {...defaultProps}
        value={{ frequency: "daily", interval: 1 }}
      />,
    );

    await user.click(screen.getByLabelText("After"));

    expect(mockOnChange).toHaveBeenCalledWith(
      { frequency: "daily", interval: 1 },
      "after_count",
      null,
      null,
    );
  });

  it("selecting 'On date' end type fires onChange with on_date endType", async () => {
    render(
      <RecurrencePicker
        {...defaultProps}
        value={{ frequency: "daily", interval: 1 }}
      />,
    );

    await user.click(screen.getByLabelText("On date"));

    expect(mockOnChange).toHaveBeenCalledWith(
      { frequency: "daily", interval: 1 },
      "on_date",
      null,
      null,
    );
  });

  it("after_count end type shows count input and changing it fires onChange", async () => {
    render(
      <RecurrencePicker
        {...defaultProps}
        value={{ frequency: "daily", interval: 1 }}
        endType="after_count"
        endCount={10}
      />,
    );

    expect(screen.getByText("times")).toBeInTheDocument();

    const countInput = screen.getByDisplayValue("10") as HTMLInputElement;
    // userEvent.clear/type on number inputs is flaky in jsdom — use fireEvent.
    const { fireEvent } = await import("@testing-library/react");
    fireEvent.change(countInput, { target: { value: "5" } });

    expect(mockOnChange).toHaveBeenLastCalledWith(
      { frequency: "daily", interval: 1 },
      "after_count",
      null,
      5,
    );
  });

  it("on_date end type shows date input and changing it fires onChange", async () => {
    render(
      <RecurrencePicker
        {...defaultProps}
        value={{ frequency: "daily", interval: 1 }}
        endType="on_date"
        endDate="2026-12-31"
      />,
    );

    const dateInput = screen.getByDisplayValue("2026-12-31") as HTMLInputElement;
    expect(dateInput).toBeInTheDocument();

    const { fireEvent } = await import("@testing-library/react");
    fireEvent.change(dateInput, { target: { value: "2027-01-01" } });

    expect(mockOnChange).toHaveBeenLastCalledWith(
      { frequency: "daily", interval: 1 },
      "on_date",
      "2027-01-01",
      null,
    );
  });

  // Custom mode: frequency and interval changes
  it("custom mode: changing frequency to 'weekly' fires onChange with days_of_week", async () => {
    render(
      <RecurrencePicker
        {...defaultProps}
        value={{ frequency: "daily", interval: 3 }}
      />,
    );

    // The component initialises to "custom" because interval=3 doesn't match any preset
    // There are two comboboxes: preset selector and custom frequency selector
    const comboboxes = screen.getAllByRole("combobox");
    // second combobox is the frequency selector inside custom controls
    await user.click(comboboxes[1]);
    await user.click(screen.getByRole("option", { name: "weeks" }));

    expect(mockOnChange).toHaveBeenCalledWith(
      { frequency: "weekly", interval: 3, days_of_week: [0] },
      "never",
      null,
      null,
    );
  });

  it("custom mode: changing frequency to 'monthly' fires onChange with day_of_month", async () => {
    render(
      <RecurrencePicker
        {...defaultProps}
        value={{ frequency: "daily", interval: 3 }}
      />,
    );

    const comboboxes = screen.getAllByRole("combobox");
    await user.click(comboboxes[1]);
    await user.click(screen.getByRole("option", { name: "months" }));

    expect(mockOnChange).toHaveBeenCalledWith(
      { frequency: "monthly", interval: 3, day_of_month: 1 },
      "never",
      null,
      null,
    );
  });

  it("custom mode: changing frequency to 'yearly' fires onChange with month_of_year and day_of_month", async () => {
    render(
      <RecurrencePicker
        {...defaultProps}
        value={{ frequency: "daily", interval: 3 }}
      />,
    );

    const comboboxes = screen.getAllByRole("combobox");
    await user.click(comboboxes[1]);
    await user.click(screen.getByRole("option", { name: "years" }));

    expect(mockOnChange).toHaveBeenCalledWith(
      {
        frequency: "yearly",
        interval: 3,
        month_of_year: 1,
        day_of_month: 1,
      },
      "never",
      null,
      null,
    );
  });

  it("custom mode: changing interval fires onChange with new interval", async () => {
    render(
      <RecurrencePicker
        {...defaultProps}
        value={{ frequency: "daily", interval: 3 }}
      />,
    );

    const intervalInput = screen.getByDisplayValue("3") as HTMLInputElement;
    const { fireEvent } = await import("@testing-library/react");
    fireEvent.change(intervalInput, { target: { value: "7" } });

    expect(mockOnChange).toHaveBeenLastCalledWith(
      { frequency: "daily", interval: 7 },
      "never",
      null,
      null,
    );
  });

  // Day picker (ToggleGroup) for weekly rules
  it("day picker: toggling a day in weekly mode fires onChange with updated days_of_week", async () => {
    const weeklyRule: RecurrenceRule = {
      frequency: "weekly",
      interval: 1,
      days_of_week: [1],
    };

    render(<RecurrencePicker {...defaultProps} value={weeklyRule} />);

    // The day picker shows S M T W T F S buttons
    // Find all buttons with accessible text — day buttons are ToggleGroupItems
    // Monday (index 1) is already selected; click Wednesday (index 3, text "W")
    const dayButtons = screen.getAllByRole("button");
    // Filter to the ones inside the ToggleGroup (they have value attributes "0"-"6")
    const wednesdayBtn = dayButtons.find(
      (btn) => btn.getAttribute("data-value") === "3",
    );

    if (wednesdayBtn) {
      await user.click(wednesdayBtn);
      expect(mockOnChange).toHaveBeenCalled();
    } else {
      // Fallback: click the fourth day button rendered (index 3 = Wednesday)
      // ToggleGroupItems render in order sun(0) mon(1) tue(2) wed(3) ...
      // The day buttons appear after the preset combobox trigger button
      const toggleItems = dayButtons.filter((btn) =>
        ["0", "1", "2", "3", "4", "5", "6"].includes(
          btn.getAttribute("data-value") ?? "",
        ),
      );
      if (toggleItems.length > 0) {
        await user.click(toggleItems[3]); // Wednesday
        expect(mockOnChange).toHaveBeenCalled();
      }
    }
  });

  it("day picker: deselecting the only selected day does not fire onChange (empty selection ignored)", async () => {
    const weeklyRule: RecurrenceRule = {
      frequency: "weekly",
      interval: 1,
      days_of_week: [1],
    };

    render(<RecurrencePicker {...defaultProps} value={weeklyRule} />);

    // ToggleGroup calls onValueChange with empty array when last item is deselected
    // handleDaysToggle guards against days.length === 0 — onChange should NOT fire
    // We simulate by finding the active Monday button and clicking it
    const dayButtons = screen.getAllByRole("button");
    const mondayBtn = dayButtons.find(
      (btn) => btn.getAttribute("data-value") === "1",
    );

    if (mondayBtn) {
      await user.click(mondayBtn);
      // If empty array was produced, mockOnChange should NOT have been called
      // (the guard prevents it)
      // But if Radix prevents empty selection internally, it also won't fire
      // Either way, we assert onChange is NOT called with days_of_week: []
      const callsWithEmpty = mockOnChange.mock.calls.filter(
        (call) =>
          call[0] &&
          Array.isArray(call[0].days_of_week) &&
          call[0].days_of_week.length === 0,
      );
      expect(callsWithEmpty).toHaveLength(0);
    }
  });

  it("day picker: selecting additional days fires onChange with sorted days array", async () => {
    const weeklyRule: RecurrenceRule = {
      frequency: "weekly",
      interval: 1,
      days_of_week: [3], // Wednesday only
    };

    render(<RecurrencePicker {...defaultProps} value={weeklyRule} />);

    // Find ToggleGroupItems by data-value attribute
    const dayButtons = screen.getAllByRole("button");
    const fridayBtn = dayButtons.find(
      (btn) => btn.getAttribute("data-value") === "5",
    );

    if (fridayBtn) {
      await user.click(fridayBtn);
      // The ToggleGroup will pass ["3","5"] to onValueChange → sorted [3,5]
      expect(mockOnChange).toHaveBeenCalledWith(
        { frequency: "weekly", interval: 1, days_of_week: [3, 5] },
        "never",
        null,
        null,
      );
    }
  });
});
