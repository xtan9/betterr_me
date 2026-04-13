import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { axe } from "vitest-axe";
import * as matchers from "vitest-axe/matchers";
import { BillCalendarDay } from "@/components/money/bill-calendar-day";
import type { RecurringBill } from "@/lib/db/types";

expect.extend(matchers);

vi.mock("@/lib/money/arithmetic", () => ({
  formatMoney: (cents: number) => `$${(cents / 100).toFixed(2)}`,
}));

function makeBill(overrides: Partial<RecurringBill> = {}): RecurringBill {
  return {
    id: "b-1",
    name: "Netflix",
    amount_cents: -1549,
    // remaining fields filled in loosely — component only uses id/name/amount_cents
    ...overrides,
  } as RecurringBill;
}

const baseProps = {
  date: new Date(2026, 3, 12),
  bills: [] as RecurringBill[],
  isCurrentMonth: true,
  isToday: false,
  isExpanded: false,
  onToggle: vi.fn(),
};

describe("BillCalendarDay", () => {
  it("renders the day number from the provided date", () => {
    render(<BillCalendarDay {...baseProps} bills={[]} />);
    expect(screen.getByText("12")).toBeInTheDocument();
  });

  it("disables the button when there are no bills", () => {
    render(<BillCalendarDay {...baseProps} bills={[]} />);
    const btn = screen.getByRole("button");
    expect(btn).toBeDisabled();
  });

  it("lists bill names when 1-2 bills are present", () => {
    render(
      <BillCalendarDay
        {...baseProps}
        bills={[makeBill({ id: "1", name: "Netflix" }), makeBill({ id: "2", name: "Spotify" })]}
      />,
    );
    expect(screen.getByText("Netflix")).toBeInTheDocument();
    expect(screen.getByText("Spotify")).toBeInTheDocument();
  });

  it("shows count badge when more than 2 bills", () => {
    render(
      <BillCalendarDay
        {...baseProps}
        bills={[1, 2, 3, 4].map((i) => makeBill({ id: String(i), name: `Bill ${i}` }))}
      />,
    );
    expect(screen.getByText("4 bills")).toBeInTheDocument();
    expect(screen.queryByText("Bill 1")).not.toBeInTheDocument();
  });

  it("fires onToggle when clicked", () => {
    const onToggle = vi.fn();
    render(
      <BillCalendarDay
        {...baseProps}
        onToggle={onToggle}
        bills={[makeBill()]}
      />,
    );
    fireEvent.click(screen.getByRole("button"));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("renders expanded panel with all bills and amounts when isExpanded", () => {
    render(
      <BillCalendarDay
        {...baseProps}
        isExpanded
        bills={[
          makeBill({ id: "a", name: "Rent", amount_cents: -150000 }),
          makeBill({ id: "b", name: "Gym", amount_cents: -5000 }),
        ]}
      />,
    );
    // Names appear in both compact view and expanded panel — just assert amounts render
    expect(screen.getAllByText("Rent").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("$-1500.00")).toBeInTheDocument();
    expect(screen.getByText("$-50.00")).toBeInTheDocument();
  });

  it("renders projected balance in compact form (dollars < 1k)", () => {
    render(
      <BillCalendarDay {...baseProps} bills={[]} projectedBalanceCents={50000} />,
    );
    expect(screen.getByText("$500")).toBeInTheDocument();
  });

  it("renders projected balance abbreviated with decimal above 1k", () => {
    render(
      <BillCalendarDay {...baseProps} bills={[]} projectedBalanceCents={210000} />,
    );
    expect(screen.getByText("$2.1k")).toBeInTheDocument();
  });

  it("renders projected balance as whole-k when round thousand", () => {
    render(
      <BillCalendarDay {...baseProps} bills={[]} projectedBalanceCents={300000} />,
    );
    expect(screen.getByText("$3k")).toBeInTheDocument();
  });

  it("renders negative projected balance with leading minus", () => {
    render(
      <BillCalendarDay {...baseProps} bills={[]} projectedBalanceCents={-150000} />,
    );
    expect(screen.getByText("-$1.5k")).toBeInTheDocument();
  });

  it("applies danger styling when balanceStatus is danger", () => {
    render(
      <BillCalendarDay
        {...baseProps}
        bills={[makeBill()]}
        balanceStatus="danger"
      />,
    );
    const btn = screen.getByRole("button");
    expect(btn.className).toMatch(/bg-red-50/);
  });

  it("applies tight styling when balanceStatus is tight", () => {
    render(
      <BillCalendarDay
        {...baseProps}
        bills={[makeBill()]}
        balanceStatus="tight"
      />,
    );
    const btn = screen.getByRole("button");
    expect(btn.className).toMatch(/money-amber/);
  });

  it("has no accessibility violations", async () => {
    const { container } = render(
      <BillCalendarDay
        {...baseProps}
        bills={[makeBill()]}
        projectedBalanceCents={10000}
      />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
