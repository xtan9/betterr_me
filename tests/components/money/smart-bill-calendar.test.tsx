import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SmartBillCalendar } from "@/components/money/smart-bill-calendar";
import type { RecurringBill, DailyBalance } from "@/lib/db/types";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("@/components/money/bill-calendar-day", () => ({
  BillCalendarDay: ({
    date,
    bills,
    isToday,
    isCurrentMonth,
    balanceStatus,
    projectedBalanceCents,
    isExpanded,
    onToggle,
  }: any) =>
    React.createElement("div", {
      "data-testid": `day-${date.toISOString().split("T")[0]}`,
      "data-bills": bills.length,
      "data-current-month": isCurrentMonth,
      "data-today": isToday,
      "data-balance-status": balanceStatus ?? "",
      "data-projected": projectedBalanceCents ?? "",
      "data-expanded": isExpanded,
      onClick: onToggle,
    }),
}));

// Use the real danger-zone formula so regressions in its thresholds would
// propagate here. getDangerZoneStatus is pure (see lib/money/projections.ts).
// If we need to stub, we'd check the component forwards the result — not
// lock in an invented contract.

function makeBill(overrides: Partial<RecurringBill> = {}): RecurringBill {
  return {
    id: "bill-1",
    household_id: "hh-1",
    plaid_stream_id: null,
    account_id: null,
    name: "Test Bill",
    description: null,
    amount_cents: 1000,
    frequency: "MONTHLY",
    next_due_date: "2026-04-15",
    user_status: "auto",
    is_active: true,
    plaid_status: null,
    category_primary: null,
    previous_amount_cents: null,
    source: "manual",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

const defaultProps = {
  bills: [] as RecurringBill[],
  dailyBalances: [] as DailyBalance[],
  dailySpendingRateCents: 5000,
};

describe("SmartBillCalendar", () => {
  it("renders month name and year", () => {
    render(<SmartBillCalendar {...defaultProps} />);
    // The component initializes to the current month — just verify some text matching MMMM yyyy
    const heading = screen.getByRole("heading");
    expect(heading.textContent).toMatch(/\w+ \d{4}/);
  });

  it("renders day-of-week headers (Sun through Sat)", () => {
    render(<SmartBillCalendar {...defaultProps} />);
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    for (const day of days) {
      expect(screen.getByText(day)).toBeInTheDocument();
    }
  });

  it("renders at least 28 day cells in the calendar grid", () => {
    render(<SmartBillCalendar {...defaultProps} />);
    // A month always spans at least 4 weeks of 7 days = 28 cells
    const cells = screen.getAllByTestId(/^day-/);
    expect(cells.length).toBeGreaterThanOrEqual(28);
    // Maximum is 6 weeks = 42
    expect(cells.length).toBeLessThanOrEqual(42);
  });

  it("renders prev and next month navigation buttons with correct aria-labels", () => {
    render(<SmartBillCalendar {...defaultProps} />);
    expect(screen.getByRole("button", { name: "previousMonth" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "nextMonth" })).toBeInTheDocument();
  });

  it("clicking next month advances the displayed month", () => {
    render(<SmartBillCalendar {...defaultProps} />);
    const heading = screen.getByRole("heading");
    const initialText = heading.textContent ?? "";

    fireEvent.click(screen.getByRole("button", { name: "nextMonth" }));

    const newText = heading.textContent ?? "";
    expect(newText).not.toBe(initialText);
  });

  it("clicking prev month goes back one month", () => {
    render(<SmartBillCalendar {...defaultProps} />);
    const heading = screen.getByRole("heading");
    const initialText = heading.textContent ?? "";

    fireEvent.click(screen.getByRole("button", { name: "previousMonth" }));

    const newText = heading.textContent ?? "";
    expect(newText).not.toBe(initialText);
  });

  it("MONTHLY bill appears on its due day", () => {
    const bill = makeBill({ frequency: "MONTHLY", next_due_date: "2026-04-15" });
    render(<SmartBillCalendar {...defaultProps} bills={[bill]} />);

    // Navigate to April 2026 — start at current month and navigate as needed
    // Instead pin the test by finding the day cell that should have the bill
    const dayCell = screen.queryByTestId("day-2026-04-15");
    if (dayCell) {
      // We are already in April 2026
      expect(dayCell).toHaveAttribute("data-bills", "1");
    } else {
      // We are in some other month — navigate to April 2026
      const heading = screen.getByRole("heading");
      const itext = heading.textContent ?? "";

      // Determine if we need to go forward or back
      const [iMonth, iYear] = itext.split(" ");
      const monthNames = ["January","February","March","April","May","June","July","August","September","October","November","December"];
      const currentMonthIdx = monthNames.indexOf(iMonth);
      const currentYear = parseInt(iYear, 10);
      const targetMonthIdx = 3; // April
      const targetYear = 2026;

      const monthDiff = (targetYear - currentYear) * 12 + (targetMonthIdx - currentMonthIdx);
      const btnName = monthDiff > 0 ? "nextMonth" : "previousMonth";
      const btn = screen.getByRole("button", { name: btnName });
      for (let i = 0; i < Math.abs(monthDiff); i++) {
        fireEvent.click(btn);
      }

      const aprilDay = screen.getByTestId("day-2026-04-15");
      expect(aprilDay).toHaveAttribute("data-bills", "1");
    }
  });

  it("WEEKLY bill appears on multiple days in the month", () => {
    // A weekly bill with a known due date should appear 4-5 times in a month
    const bill = makeBill({ frequency: "WEEKLY", next_due_date: "2026-04-06" });
    render(<SmartBillCalendar {...defaultProps} bills={[bill]} />);

    // Navigate to April 2026
    const heading = screen.getByRole("heading");
    const monthNames = ["January","February","March","April","May","June","July","August","September","October","November","December"];
    const [monthStr, yearStr] = (heading.textContent ?? "").split(" ");
    const currentMonthIdx = monthNames.indexOf(monthStr);
    const currentYear = parseInt(yearStr, 10);
    const monthDiff = (2026 - currentYear) * 12 + (3 - currentMonthIdx);
    if (monthDiff !== 0) {
      const btn = screen.getByRole("button", { name: monthDiff > 0 ? "nextMonth" : "previousMonth" });
      for (let i = 0; i < Math.abs(monthDiff); i++) fireEvent.click(btn);
    }

    // April 2026 starts Monday Apr 6 — weekly from Apr 6: Apr 6, 13, 20, 27
    const expectedDates = ["2026-04-06", "2026-04-13", "2026-04-20", "2026-04-27"];
    for (const date of expectedDates) {
      const cell = screen.queryByTestId(`day-${date}`);
      if (cell) {
        expect(cell).toHaveAttribute("data-bills", "1");
      }
    }
    // Verify at least 2 days have this bill
    const daysWithBill = expectedDates.filter(
      (date) => screen.queryByTestId(`day-${date}`)?.getAttribute("data-bills") === "1"
    );
    expect(daysWithBill.length).toBeGreaterThanOrEqual(2);
  });

  it("BIWEEKLY bill appears every 14 days", () => {
    const bill = makeBill({ frequency: "BIWEEKLY", next_due_date: "2026-04-01" });
    render(<SmartBillCalendar {...defaultProps} bills={[bill]} />);

    const heading = screen.getByRole("heading");
    const monthNames = ["January","February","March","April","May","June","July","August","September","October","November","December"];
    const [monthStr, yearStr] = (heading.textContent ?? "").split(" ");
    const monthDiff = (2026 - parseInt(yearStr, 10)) * 12 + (3 - monthNames.indexOf(monthStr));
    if (monthDiff !== 0) {
      const btn = screen.getByRole("button", { name: monthDiff > 0 ? "nextMonth" : "previousMonth" });
      for (let i = 0; i < Math.abs(monthDiff); i++) fireEvent.click(btn);
    }

    // Biweekly from Apr 1: Apr 1, Apr 15 in April 2026
    const apr1 = screen.queryByTestId("day-2026-04-01");
    const apr15 = screen.queryByTestId("day-2026-04-15");
    const apr29 = screen.queryByTestId("day-2026-04-29");

    const daysWithBill = [apr1, apr15, apr29].filter(
      (cell) => cell?.getAttribute("data-bills") === "1"
    );
    expect(daysWithBill.length).toBeGreaterThanOrEqual(2);
  });

  it("SEMI_MONTHLY bill appears twice in the month", () => {
    const bill = makeBill({ frequency: "SEMI_MONTHLY", next_due_date: "2026-04-05" });
    render(<SmartBillCalendar {...defaultProps} bills={[bill]} />);

    const heading = screen.getByRole("heading");
    const monthNames = ["January","February","March","April","May","June","July","August","September","October","November","December"];
    const [monthStr, yearStr] = (heading.textContent ?? "").split(" ");
    const monthDiff = (2026 - parseInt(yearStr, 10)) * 12 + (3 - monthNames.indexOf(monthStr));
    if (monthDiff !== 0) {
      const btn = screen.getByRole("button", { name: monthDiff > 0 ? "nextMonth" : "previousMonth" });
      for (let i = 0; i < Math.abs(monthDiff); i++) fireEvent.click(btn);
    }

    // day 5 and day 5+15=20
    const day5 = screen.queryByTestId("day-2026-04-05");
    const day20 = screen.queryByTestId("day-2026-04-20");

    expect(day5).toHaveAttribute("data-bills", "1");
    expect(day20).toHaveAttribute("data-bills", "1");
  });

  it("ANNUALLY bill appears only when the month matches", () => {
    // Bill due in April — should appear in April view, not May
    const bill = makeBill({ frequency: "ANNUALLY", next_due_date: "2026-04-10" });
    render(<SmartBillCalendar {...defaultProps} bills={[bill]} />);

    const heading = screen.getByRole("heading");
    const monthNames = ["January","February","March","April","May","June","July","August","September","October","November","December"];
    const [monthStr, yearStr] = (heading.textContent ?? "").split(" ");
    const monthDiff = (2026 - parseInt(yearStr, 10)) * 12 + (3 - monthNames.indexOf(monthStr));
    if (monthDiff !== 0) {
      const btn = screen.getByRole("button", { name: monthDiff > 0 ? "nextMonth" : "previousMonth" });
      for (let i = 0; i < Math.abs(monthDiff); i++) fireEvent.click(btn);
    }

    // In April 2026 — bill should appear on Apr 10
    const apr10 = screen.queryByTestId("day-2026-04-10");
    expect(apr10).toHaveAttribute("data-bills", "1");

    // Navigate to May — bill should NOT appear
    fireEvent.click(screen.getByRole("button", { name: "nextMonth" }));
    const allDays = screen.getAllByTestId(/^day-2026-05/);
    const daysWithBill = allDays.filter((d) => d.getAttribute("data-bills") === "1");
    expect(daysWithBill.length).toBe(0);
  });

  it("dismissed bill is not shown", () => {
    const bill = makeBill({
      frequency: "MONTHLY",
      next_due_date: "2026-04-15",
      user_status: "dismissed",
    });
    render(<SmartBillCalendar {...defaultProps} bills={[bill]} />);

    const heading = screen.getByRole("heading");
    const monthNames = ["January","February","March","April","May","June","July","August","September","October","November","December"];
    const [monthStr, yearStr] = (heading.textContent ?? "").split(" ");
    const monthDiff = (2026 - parseInt(yearStr, 10)) * 12 + (3 - monthNames.indexOf(monthStr));
    if (monthDiff !== 0) {
      const btn = screen.getByRole("button", { name: monthDiff > 0 ? "nextMonth" : "previousMonth" });
      for (let i = 0; i < Math.abs(monthDiff); i++) fireEvent.click(btn);
    }

    const cell = screen.queryByTestId("day-2026-04-15");
    // data-bills should be 0 because bill is dismissed
    expect(cell).toHaveAttribute("data-bills", "0");
  });

  it("bill with null next_due_date is not shown", () => {
    const bill = makeBill({ frequency: "MONTHLY", next_due_date: null });
    render(<SmartBillCalendar {...defaultProps} bills={[bill]} />);

    const heading = screen.getByRole("heading");
    const monthNames = ["January","February","March","April","May","June","July","August","September","October","November","December"];
    const [monthStr, yearStr] = (heading.textContent ?? "").split(" ");
    const monthDiff = (2026 - parseInt(yearStr, 10)) * 12 + (3 - monthNames.indexOf(monthStr));
    if (monthDiff !== 0) {
      const btn = screen.getByRole("button", { name: monthDiff > 0 ? "nextMonth" : "previousMonth" });
      for (let i = 0; i < Math.abs(monthDiff); i++) fireEvent.click(btn);
    }

    // All day cells should have 0 bills
    const allDayCells = screen.getAllByTestId(/^day-/);
    const daysWithBill = allDayCells.filter((d) => d.getAttribute("data-bills") === "1");
    expect(daysWithBill.length).toBe(0);
  });

  it("passes danger zone status from dailyBalances to day cells", () => {
    // Uses the real `getDangerZoneStatus` from lib/money/projections:
    //   balance <= 0 → danger,  balance < 2*rate → tight,  else safe.
    // With dailySpendingRateCents = 5000, the tight threshold is 10000.
    const dailyBalances: DailyBalance[] = [
      { date: "2026-04-15", projected_balance_cents: -100, has_income: false, bill_total_cents: 0 }, // danger (<= 0)
      { date: "2026-04-16", projected_balance_cents: 5000, has_income: false, bill_total_cents: 0 }, // tight (0 < 5000 < 10000)
      { date: "2026-04-17", projected_balance_cents: 20000, has_income: false, bill_total_cents: 0 }, // safe (>= 10000)
    ];
    render(
      <SmartBillCalendar
        bills={[]}
        dailyBalances={dailyBalances}
        dailySpendingRateCents={5000}
      />
    );

    const heading = screen.getByRole("heading");
    const monthNames = ["January","February","March","April","May","June","July","August","September","October","November","December"];
    const [monthStr, yearStr] = (heading.textContent ?? "").split(" ");
    const monthDiff = (2026 - parseInt(yearStr, 10)) * 12 + (3 - monthNames.indexOf(monthStr));
    if (monthDiff !== 0) {
      const btn = screen.getByRole("button", { name: monthDiff > 0 ? "nextMonth" : "previousMonth" });
      for (let i = 0; i < Math.abs(monthDiff); i++) fireEvent.click(btn);
    }

    expect(screen.queryByTestId("day-2026-04-15")).toHaveAttribute("data-balance-status", "danger");
    expect(screen.queryByTestId("day-2026-04-16")).toHaveAttribute("data-balance-status", "tight");
    expect(screen.queryByTestId("day-2026-04-17")).toHaveAttribute("data-balance-status", "safe");
  });

  it("day without balance data has empty balance status", () => {
    render(<SmartBillCalendar {...defaultProps} />);

    const heading = screen.getByRole("heading");
    const monthNames = ["January","February","March","April","May","June","July","August","September","October","November","December"];
    const [monthStr, yearStr] = (heading.textContent ?? "").split(" ");
    const monthDiff = (2026 - parseInt(yearStr, 10)) * 12 + (3 - monthNames.indexOf(monthStr));
    if (monthDiff !== 0) {
      const btn = screen.getByRole("button", { name: monthDiff > 0 ? "nextMonth" : "previousMonth" });
      for (let i = 0; i < Math.abs(monthDiff); i++) fireEvent.click(btn);
    }

    // All cells should have empty balance status when no dailyBalances provided
    const allCells = screen.getAllByTestId(/^day-/);
    for (const cell of allCells) {
      expect(cell).toHaveAttribute("data-balance-status", "");
    }
  });

  it("clicking a day cell toggles its expanded state", () => {
    render(<SmartBillCalendar {...defaultProps} />);

    const heading = screen.getByRole("heading");
    const monthNames = ["January","February","March","April","May","June","July","August","September","October","November","December"];
    const [monthStr, yearStr] = (heading.textContent ?? "").split(" ");
    const monthDiff = (2026 - parseInt(yearStr, 10)) * 12 + (3 - monthNames.indexOf(monthStr));
    if (monthDiff !== 0) {
      const btn = screen.getByRole("button", { name: monthDiff > 0 ? "nextMonth" : "previousMonth" });
      for (let i = 0; i < Math.abs(monthDiff); i++) fireEvent.click(btn);
    }

    const cell = screen.getByTestId("day-2026-04-10");
    // Initially not expanded
    expect(cell).toHaveAttribute("data-expanded", "false");

    // Click to expand
    fireEvent.click(cell);
    expect(cell).toHaveAttribute("data-expanded", "true");

    // Click again to collapse
    fireEvent.click(cell);
    expect(cell).toHaveAttribute("data-expanded", "false");
  });

  it("expanding one day collapses the previously expanded day", () => {
    render(<SmartBillCalendar {...defaultProps} />);

    const heading = screen.getByRole("heading");
    const monthNames = ["January","February","March","April","May","June","July","August","September","October","November","December"];
    const [monthStr, yearStr] = (heading.textContent ?? "").split(" ");
    const monthDiff = (2026 - parseInt(yearStr, 10)) * 12 + (3 - monthNames.indexOf(monthStr));
    if (monthDiff !== 0) {
      const btn = screen.getByRole("button", { name: monthDiff > 0 ? "nextMonth" : "previousMonth" });
      for (let i = 0; i < Math.abs(monthDiff); i++) fireEvent.click(btn);
    }

    const cell10 = screen.getByTestId("day-2026-04-10");
    const cell11 = screen.getByTestId("day-2026-04-11");

    fireEvent.click(cell10);
    expect(cell10).toHaveAttribute("data-expanded", "true");
    expect(cell11).toHaveAttribute("data-expanded", "false");

    fireEvent.click(cell11);
    expect(cell10).toHaveAttribute("data-expanded", "false");
    expect(cell11).toHaveAttribute("data-expanded", "true");
  });

  it("today's date has isToday=true", () => {
    // Freeze the clock so this assertion is deterministic. The initial
    // currentMonth state is derived from `new Date()` at render time.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-15T12:00:00Z"));
    try {
      render(<SmartBillCalendar {...defaultProps} />);
      // Exactly one cell in the current month's grid should be flagged today.
      const allCells = screen.getAllByTestId(/^day-/);
      const todayCells = allCells.filter(
        (c) => c.getAttribute("data-today") === "true",
      );
      expect(todayCells).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("days outside current month have isCurrentMonth=false", () => {
    render(<SmartBillCalendar {...defaultProps} />);

    const heading = screen.getByRole("heading");
    const monthNames = ["January","February","March","April","May","June","July","August","September","October","November","December"];
    const [monthStr, yearStr] = (heading.textContent ?? "").split(" ");
    const monthDiff = (2026 - parseInt(yearStr, 10)) * 12 + (3 - monthNames.indexOf(monthStr));
    if (monthDiff !== 0) {
      const btn = screen.getByRole("button", { name: monthDiff > 0 ? "nextMonth" : "previousMonth" });
      for (let i = 0; i < Math.abs(monthDiff); i++) fireEvent.click(btn);
    }

    // April 2026 starts on Wednesday — the calendar grid starts from Sun Mar 29
    // Those March days should be outside the current month
    const mar29 = screen.queryByTestId("day-2026-03-29");
    const mar30 = screen.queryByTestId("day-2026-03-30");
    const mar31 = screen.queryByTestId("day-2026-03-31");

    if (mar29) expect(mar29).toHaveAttribute("data-current-month", "false");
    if (mar30) expect(mar30).toHaveAttribute("data-current-month", "false");
    if (mar31) expect(mar31).toHaveAttribute("data-current-month", "false");

    // April days should be in current month
    const apr15 = screen.queryByTestId("day-2026-04-15");
    if (apr15) expect(apr15).toHaveAttribute("data-current-month", "true");
  });
});
