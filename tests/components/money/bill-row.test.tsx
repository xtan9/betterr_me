import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { axe } from "vitest-axe";
import * as matchers from "vitest-axe/matchers";
import { BillRow } from "@/components/money/bill-row";
import type { RecurringBill } from "@/lib/db/types";

expect.extend(matchers);

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, params?: Record<string, string>) =>
    params ? `${key}:${JSON.stringify(params)}` : key,
}));

vi.mock("@/lib/money/arithmetic", () => ({
  formatMoney: (cents: number) => `$${(cents / 100).toFixed(2)}`,
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

describe("BillRow", () => {
  it("renders name, amount, frequency, and next due date", () => {
    const onStatusChange = vi.fn();
    const onEdit = vi.fn();
    render(
      <BillRow
        bill={makeBill()}
        onStatusChange={onStatusChange}
        onEdit={onEdit}
      />
    );

    expect(screen.getByRole("button", { name: "Netflix" })).toBeInTheDocument();
    expect(screen.getByText("$-15.49")).toBeInTheDocument();
    expect(screen.getByText("monthly")).toBeInTheDocument();
    // nextDue rendered with "Apr 20"
    expect(
      screen.getByText(/nextDue:.*"Apr 20"/)
    ).toBeInTheDocument();
  });

  it("maps all frequency values to correct labels", () => {
    const onStatusChange = vi.fn();
    const onEdit = vi.fn();
    const frequencies: Array<[RecurringBill["frequency"], string]> = [
      ["WEEKLY", "weekly"],
      ["BIWEEKLY", "biweekly"],
      ["SEMI_MONTHLY", "semiMonthly"],
      ["MONTHLY", "monthly"],
      ["ANNUALLY", "annually"],
    ];
    for (const [freq, label] of frequencies) {
      const { unmount } = render(
        <BillRow
          bill={makeBill({ frequency: freq })}
          onStatusChange={onStatusChange}
          onEdit={onEdit}
        />
      );
      expect(screen.getByText(label)).toBeInTheDocument();
      unmount();
    }
  });

  it("falls back to monthly for unknown frequency", () => {
    render(
      <BillRow
        bill={makeBill({ frequency: "WHATEVER" as RecurringBill["frequency"] })}
        onStatusChange={vi.fn()}
        onEdit={vi.fn()}
      />
    );
    expect(screen.getByText("monthly")).toBeInTheDocument();
  });

  it("hides next-due row when next_due_date is null", () => {
    render(
      <BillRow
        bill={makeBill({ next_due_date: null })}
        onStatusChange={vi.fn()}
        onEdit={vi.fn()}
      />
    );
    expect(screen.queryByText(/nextDue:/)).not.toBeInTheDocument();
  });

  it("shows paid badge when is_active and updated_at is this month", () => {
    const now = new Date();
    render(
      <BillRow
        bill={makeBill({ is_active: true, updated_at: now.toISOString() })}
        onStatusChange={vi.fn()}
        onEdit={vi.fn()}
      />
    );
    expect(screen.getByText("paid")).toBeInTheDocument();
  });

  it("does not show paid badge when inactive (even if updated_at is this month)", () => {
    render(
      <BillRow
        bill={makeBill({ is_active: false, updated_at: new Date().toISOString() })}
        onStatusChange={vi.fn()}
        onEdit={vi.fn()}
      />
    );
    expect(screen.queryByText("paid")).not.toBeInTheDocument();
  });

  it("does not show paid badge when updated_at is in a previous month (even if active)", () => {
    // Pick a date two months back to avoid boundary flakiness around month rollover.
    const twoMonthsAgo = new Date();
    twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);
    render(
      <BillRow
        bill={makeBill({
          is_active: true,
          updated_at: twoMonthsAgo.toISOString(),
        })}
        onStatusChange={vi.fn()}
        onEdit={vi.fn()}
      />
    );
    expect(screen.queryByText("paid")).not.toBeInTheDocument();
  });

  it("shows price change badge when previous_amount_cents differs", () => {
    render(
      <BillRow
        bill={makeBill({
          amount_cents: -1999,
          previous_amount_cents: -1549,
        })}
        onStatusChange={vi.fn()}
        onEdit={vi.fn()}
      />
    );
    expect(screen.getByText(/priceChange:.*\$-15\.49/)).toBeInTheDocument();
  });

  it("does not show price change when previous matches current", () => {
    render(
      <BillRow
        bill={makeBill({
          amount_cents: -1549,
          previous_amount_cents: -1549,
        })}
        onStatusChange={vi.fn()}
        onEdit={vi.fn()}
      />
    );
    expect(screen.queryByText(/priceChange/)).not.toBeInTheDocument();
  });

  it("shows confirm and dismiss buttons when user_status is auto", () => {
    const onStatusChange = vi.fn();
    render(
      <BillRow
        bill={makeBill({ user_status: "auto" })}
        onStatusChange={onStatusChange}
        onEdit={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "confirm" }));
    expect(onStatusChange).toHaveBeenCalledWith("b-1", "confirmed");

    fireEvent.click(screen.getByRole("button", { name: "dismiss" }));
    expect(onStatusChange).toHaveBeenCalledWith("b-1", "dismissed");
  });

  it("shows only dismiss when user_status is confirmed", () => {
    const onStatusChange = vi.fn();
    render(
      <BillRow
        bill={makeBill({ user_status: "confirmed" })}
        onStatusChange={onStatusChange}
        onEdit={vi.fn()}
      />
    );
    expect(screen.queryByRole("button", { name: "confirm" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "dismiss" }));
    expect(onStatusChange).toHaveBeenCalledWith("b-1", "dismissed");
  });

  it("shows reconfirm when user_status is dismissed", () => {
    const onStatusChange = vi.fn();
    render(
      <BillRow
        bill={makeBill({ user_status: "dismissed" })}
        onStatusChange={onStatusChange}
        onEdit={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "reconfirm" }));
    expect(onStatusChange).toHaveBeenCalledWith("b-1", "confirmed");
  });

  it("fires onEdit when name button or edit icon is clicked", () => {
    const onEdit = vi.fn();
    const bill = makeBill();
    render(
      <BillRow bill={bill} onStatusChange={vi.fn()} onEdit={onEdit} />
    );
    fireEvent.click(screen.getByRole("button", { name: "Netflix" }));
    expect(onEdit).toHaveBeenCalledWith(bill);

    fireEvent.click(screen.getByRole("button", { name: "editBill" }));
    expect(onEdit).toHaveBeenCalledTimes(2);
  });

  it("has no accessibility violations", async () => {
    const { container } = render(
      <BillRow
        bill={makeBill({
          previous_amount_cents: -1200,
          amount_cents: -1549,
          is_active: true,
          updated_at: new Date().toISOString(),
        })}
        onStatusChange={vi.fn()}
        onEdit={vi.fn()}
      />
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
