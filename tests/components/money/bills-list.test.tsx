import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { axe } from "vitest-axe";
import * as matchers from "vitest-axe/matchers";
import { BillsList } from "@/components/money/bills-list";

expect.extend(matchers);

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/money/arithmetic", () => ({
  formatMoney: (cents: number) => `$${(cents / 100).toFixed(2)}`,
}));

// Mock sub-components to isolate BillsList tests
vi.mock("@/components/money/bill-summary-header", () => ({
  BillSummaryHeader: ({
    totalMonthlyCents,
    billCount,
    pendingCount,
  }: {
    totalMonthlyCents: number;
    billCount: number;
    pendingCount: number;
  }) => (
    <div data-testid="bill-summary-header">
      {billCount} bills, {pendingCount} pending, ${(totalMonthlyCents / 100).toFixed(2)}/mo
    </div>
  ),
}));

vi.mock("@/components/money/bill-row", () => ({
  BillRow: ({
    bill,
    onStatusChange,
    onEdit,
  }: {
    bill: { id: string; name: string; user_status: string };
    onStatusChange: (id: string, status: string) => void;
    onEdit: (bill: { id: string; name: string }) => void;
  }) => (
    <div data-testid={`bill-row-${bill.id}`}>
      <span>{bill.name}</span>
      <button
        data-testid={`confirm-${bill.id}`}
        onClick={() => onStatusChange(bill.id, "confirmed")}
      >
        Confirm
      </button>
      <button
        data-testid={`dismiss-${bill.id}`}
        onClick={() => onStatusChange(bill.id, "dismissed")}
      >
        Dismiss
      </button>
      <button data-testid={`edit-${bill.id}`} onClick={() => onEdit(bill)}>
        Edit
      </button>
    </div>
  ),
}));

vi.mock("@/components/money/bill-form", () => ({
  BillForm: () => <div data-testid="bill-form" />,
}));

// Mock useBills hook
const { mockUseBills } = vi.hoisted(() => ({
  mockUseBills: vi.fn(),
}));

vi.mock("@/lib/hooks/use-bills", () => ({
  useBills: mockUseBills,
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeBill(overrides: Partial<{
  id: string;
  name: string;
  amount_cents: number;
  frequency: string;
  user_status: string;
  next_due_date: string | null;
  is_active: boolean;
  updated_at: string | null;
  previous_amount_cents: number | null;
}>) {
  return {
    id: "bill-1",
    name: "Netflix",
    amount_cents: 1599,
    frequency: "MONTHLY",
    user_status: "confirmed",
    next_due_date: "2026-03-01",
    is_active: true,
    updated_at: new Date().toISOString(),
    previous_amount_cents: null,
    source: "manual",
    household_id: "hh-1",
    plaid_stream_id: null,
    description: null,
    category_id: null,
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("BillsList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  it("renders summary header with correct stats", () => {
    mockUseBills.mockReturnValue({
      bills: [
        makeBill({ id: "b1", name: "Netflix", frequency: "MONTHLY" }),
        makeBill({ id: "b2", name: "Gym", frequency: "MONTHLY" }),
      ],
      summary: { total_monthly_cents: 5000, bill_count: 2, pending_count: 1 },
      isLoading: false,
      mutate: vi.fn(),
    });

    render(<BillsList />);

    expect(screen.getByTestId("bill-summary-header")).toBeInTheDocument();
    expect(screen.getByTestId("bill-summary-header")).toHaveTextContent(
      "2 bills, 1 pending"
    );
  });

  it("groups bills by frequency sections", () => {
    mockUseBills.mockReturnValue({
      bills: [
        makeBill({ id: "b1", name: "Netflix", frequency: "MONTHLY" }),
        makeBill({ id: "b2", name: "Gym", frequency: "WEEKLY" }),
        makeBill({ id: "b3", name: "Rent", frequency: "MONTHLY" }),
      ],
      summary: { total_monthly_cents: 10000, bill_count: 3, pending_count: 0 },
      isLoading: false,
      mutate: vi.fn(),
    });

    render(<BillsList />);

    // Should see frequency section headers
    expect(screen.getByText("monthly")).toBeInTheDocument();
    expect(screen.getByText("weekly")).toBeInTheDocument();
    // All 3 bills should render
    expect(screen.getByTestId("bill-row-b1")).toBeInTheDocument();
    expect(screen.getByTestId("bill-row-b2")).toBeInTheDocument();
    expect(screen.getByTestId("bill-row-b3")).toBeInTheDocument();
  });

  it("shows dismissed section when dismissed bills exist", () => {
    mockUseBills.mockReturnValue({
      bills: [
        makeBill({ id: "b1", name: "Netflix", user_status: "confirmed" }),
        makeBill({ id: "b2", name: "Old Sub", user_status: "dismissed" }),
      ],
      summary: { total_monthly_cents: 1599, bill_count: 2, pending_count: 0 },
      isLoading: false,
      mutate: vi.fn(),
    });

    render(<BillsList />);

    // Dismissed collapsible trigger should be present
    expect(screen.getByText(/dismissed/i)).toBeInTheDocument();
  });

  it("renders empty state when no bills", () => {
    mockUseBills.mockReturnValue({
      bills: [],
      summary: null,
      isLoading: false,
      mutate: vi.fn(),
    });

    render(<BillsList />);

    expect(screen.getByText("noBills")).toBeInTheDocument();
    expect(screen.getByText("noBillsDescription")).toBeInTheDocument();
  });

  it("confirm button triggers correct API call", async () => {
    const mockMutate = vi.fn();
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true });

    mockUseBills.mockReturnValue({
      bills: [makeBill({ id: "b1", name: "Netflix", user_status: "auto" })],
      summary: { total_monthly_cents: 1599, bill_count: 1, pending_count: 1 },
      isLoading: false,
      mutate: mockMutate,
    });

    render(<BillsList />);

    fireEvent.click(screen.getByTestId("confirm-b1"));

    // Wait for async handler
    await vi.waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/money/bills/b1",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ user_status: "confirmed" }),
        })
      );
    });
  });

  it("renders loading skeleton when data is loading", () => {
    mockUseBills.mockReturnValue({
      bills: [],
      summary: null,
      isLoading: true,
      mutate: vi.fn(),
    });

    const { container } = render(<BillsList />);

    const skeletons = container.querySelectorAll(".animate-pulse");
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it("has no accessibility violations", async () => {
    mockUseBills.mockReturnValue({
      bills: [],
      summary: null,
      isLoading: false,
      mutate: vi.fn(),
    });

    const { container } = render(<BillsList />);

    expect(await axe(container)).toHaveNoViolations();
  });
});
