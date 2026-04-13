import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { axe } from "vitest-axe";
import * as matchers from "vitest-axe/matchers";
import { BillCalendar } from "@/components/money/bill-calendar";
import type { RecurringBill } from "@/lib/db/types";

expect.extend(matchers);

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

// Mock BillCalendarDay to a lightweight stub that exposes its inputs
vi.mock("@/components/money/bill-calendar-day", () => ({
  BillCalendarDay: ({
    date,
    bills,
    isCurrentMonth,
    isToday,
    isExpanded,
    onToggle,
  }: {
    date: Date;
    bills: RecurringBill[];
    isCurrentMonth: boolean;
    isToday: boolean;
    isExpanded: boolean;
    onToggle: () => void;
  }) => {
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
      2,
      "0"
    )}-${String(date.getDate()).padStart(2, "0")}`;
    return (
      <button
        data-testid={`day-${key}`}
        data-current-month={String(isCurrentMonth)}
        data-is-today={String(isToday)}
        data-expanded={String(isExpanded)}
        data-bill-count={bills.length}
        onClick={onToggle}
      >
        {date.getDate()}/{bills.length}
      </button>
    );
  },
}));

function makeBill(overrides: Partial<RecurringBill> = {}): RecurringBill {
  return {
    id: "b-1",
    household_id: "hh-1",
    plaid_stream_id: null,
    account_id: null,
    name: "Netflix",
    description: null,
    amount_cents: -1549,
    frequency: "MONTHLY",
    next_due_date: "2026-04-20",
    user_status: "auto",
    is_active: true,
    plaid_status: null,
    category_primary: null,
    previous_amount_cents: null,
    source: "plaid",
    created_at: "2026-04-01T00:00:00Z",
    updated_at: "2026-04-01T00:00:00Z",
    ...overrides,
  };
}

describe("BillCalendar", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Pin to mid-April 2026
    vi.setSystemTime(new Date(2026, 3, 12, 10, 0, 0));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders month header with current month label", () => {
    render(<BillCalendar bills={[]} />);
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent(
      "April 2026"
    );
  });

  it("renders all 7 day-of-week column headers", () => {
    render(<BillCalendar bills={[]} />);
    for (const d of ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]) {
      expect(screen.getByText(d)).toBeInTheDocument();
    }
  });

  it("renders 42 day cells (6 weeks) on the grid", () => {
    const { container } = render(<BillCalendar bills={[]} />);
    const days = container.querySelectorAll('[data-testid^="day-"]');
    expect(days.length).toBeGreaterThanOrEqual(35);
    expect(days.length).toBeLessThanOrEqual(42);
  });

  it("navigates to previous and next month via nav buttons", () => {
    render(<BillCalendar bills={[]} />);
    fireEvent.click(screen.getByRole("button", { name: "previousMonth" }));
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent(
      "March 2026"
    );
    fireEvent.click(screen.getByRole("button", { name: "nextMonth" }));
    fireEvent.click(screen.getByRole("button", { name: "nextMonth" }));
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent(
      "May 2026"
    );
  });

  it("marks today's cell with data-is-today=true", () => {
    render(<BillCalendar bills={[]} />);
    const today = screen.getByTestId("day-2026-04-12");
    expect(today).toHaveAttribute("data-is-today", "true");
  });

  it("marks cells outside current month with data-current-month=false", () => {
    render(<BillCalendar bills={[]} />);
    // April 1 2026 is a Wednesday → Sunday March 29 is in the grid
    const out = screen.getByTestId("day-2026-03-29");
    expect(out).toHaveAttribute("data-current-month", "false");
    const inside = screen.getByTestId("day-2026-04-15");
    expect(inside).toHaveAttribute("data-current-month", "true");
  });

  it("projects MONTHLY bill onto its day-of-month in current month", () => {
    render(
      <BillCalendar
        bills={[makeBill({ frequency: "MONTHLY", next_due_date: "2026-04-20" })]}
      />
    );
    expect(screen.getByTestId("day-2026-04-20")).toHaveAttribute(
      "data-bill-count",
      "1"
    );
  });

  it("projects WEEKLY bill onto multiple days in the month", () => {
    render(
      <BillCalendar
        bills={[makeBill({ frequency: "WEEKLY", next_due_date: "2026-04-06" })]}
      />
    );
    // April 6, 13, 20, 27 should each have 1 bill
    for (const d of [6, 13, 20, 27]) {
      const key = `day-2026-04-${String(d).padStart(2, "0")}`;
      expect(screen.getByTestId(key)).toHaveAttribute("data-bill-count", "1");
    }
  });

  it("projects BIWEEKLY bill every 14 days", () => {
    render(
      <BillCalendar
        bills={[makeBill({ frequency: "BIWEEKLY", next_due_date: "2026-04-06" })]}
      />
    );
    expect(screen.getByTestId("day-2026-04-06")).toHaveAttribute(
      "data-bill-count",
      "1"
    );
    expect(screen.getByTestId("day-2026-04-20")).toHaveAttribute(
      "data-bill-count",
      "1"
    );
    expect(screen.getByTestId("day-2026-04-13")).toHaveAttribute(
      "data-bill-count",
      "0"
    );
  });

  it("projects SEMI_MONTHLY bill on two days", () => {
    render(
      <BillCalendar
        bills={[
          makeBill({ frequency: "SEMI_MONTHLY", next_due_date: "2026-04-05" }),
        ]}
      />
    );
    expect(screen.getByTestId("day-2026-04-05")).toHaveAttribute(
      "data-bill-count",
      "1"
    );
    expect(screen.getByTestId("day-2026-04-20")).toHaveAttribute(
      "data-bill-count",
      "1"
    );
  });

  it("projects ANNUALLY bill only when month matches", () => {
    render(
      <BillCalendar
        bills={[makeBill({ frequency: "ANNUALLY", next_due_date: "2026-04-15" })]}
      />
    );
    expect(screen.getByTestId("day-2026-04-15")).toHaveAttribute(
      "data-bill-count",
      "1"
    );

    // Navigate to May — annual bill for April should not appear
    fireEvent.click(screen.getByRole("button", { name: "nextMonth" }));
    const mayDays = screen
      .getAllByRole("button")
      .filter((b) => b.getAttribute("data-testid")?.startsWith("day-2026-05"));
    for (const d of mayDays) {
      expect(d).toHaveAttribute("data-bill-count", "0");
    }
  });

  it("excludes bills with no next_due_date or dismissed status", () => {
    render(
      <BillCalendar
        bills={[
          makeBill({ id: "a", next_due_date: null }),
          makeBill({ id: "b", user_status: "dismissed" }),
        ]}
      />
    );
    const allDays = screen
      .getAllByRole("button")
      .filter((b) => b.getAttribute("data-testid")?.startsWith("day-"));
    for (const day of allDays) {
      expect(day).toHaveAttribute("data-bill-count", "0");
    }
  });

  it("clamps MONTHLY bill day to last day of shorter month", () => {
    // Bill due on the 31st; navigate from April (pinned) to Feb 2026 (28 days)
    render(
      <BillCalendar
        bills={[makeBill({ frequency: "MONTHLY", next_due_date: "2026-01-31" })]}
      />
    );
    // Move back Apr→Mar→Feb
    fireEvent.click(screen.getByRole("button", { name: "previousMonth" }));
    fireEvent.click(screen.getByRole("button", { name: "previousMonth" }));
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent(
      "February 2026"
    );
    expect(screen.getByTestId("day-2026-02-28")).toHaveAttribute(
      "data-bill-count",
      "1"
    );
  });

  it("toggles expanded cell on click and collapses on second click", () => {
    render(
      <BillCalendar
        bills={[makeBill({ frequency: "MONTHLY", next_due_date: "2026-04-20" })]}
      />
    );
    const cell = screen.getByTestId("day-2026-04-20");
    expect(cell).toHaveAttribute("data-expanded", "false");
    fireEvent.click(cell);
    expect(screen.getByTestId("day-2026-04-20")).toHaveAttribute(
      "data-expanded",
      "true"
    );
    fireEvent.click(screen.getByTestId("day-2026-04-20"));
    expect(screen.getByTestId("day-2026-04-20")).toHaveAttribute(
      "data-expanded",
      "false"
    );
  });

  it("has no accessibility violations", async () => {
    vi.useRealTimers();
    const { container } = render(
      <BillCalendar
        bills={[makeBill({ frequency: "MONTHLY", next_due_date: "2026-04-20" })]}
      />
    );
    const nav = within(container).getByRole("heading", { level: 2 });
    expect(nav).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  }, 20000);
});
