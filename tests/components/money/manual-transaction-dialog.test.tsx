import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "vitest-axe";
import * as matchers from "vitest-axe/matchers";
import { ManualTransactionDialog } from "@/components/money/manual-transaction-dialog";
import type { MoneyAccount } from "@/lib/db/types";

expect.extend(matchers);

// Mock next-intl
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

// Mock sonner
vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock getLocalDateString
vi.mock("@/lib/utils", async () => {
  const actual = await vi.importActual<typeof import("@/lib/utils")>(
    "@/lib/utils"
  );
  return {
    ...actual,
    getLocalDateString: () => "2026-02-22",
  };
});

const mockAccounts: MoneyAccount[] = [
  {
    id: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
    household_id: "hh-1",
    bank_connection_id: "conn-1",
    name: "Checking",
    account_type: "depository",
    balance_cents: 150000,
    currency: "USD",
    is_hidden: false,
    plaid_account_id: "plaid-acc-1",
    official_name: "Chase Total Checking",
    mask: "1234",
    subtype: "checking",
    created_at: "2026-02-22T00:00:00Z",
    updated_at: "2026-02-22T00:00:00Z",
  },
  {
    id: "b1ffcd00-0d1c-5fg9-cc7e-7cc0ce491b22",
    household_id: "hh-1",
    bank_connection_id: "conn-1",
    name: "Savings",
    account_type: "depository",
    balance_cents: 250000,
    currency: "USD",
    is_hidden: false,
    plaid_account_id: "plaid-acc-2",
    official_name: "Chase Savings",
    mask: "5678",
    subtype: "savings",
    created_at: "2026-02-22T00:00:00Z",
    updated_at: "2026-02-22T00:00:00Z",
  },
];

const defaultProps = {
  open: true,
  onOpenChange: vi.fn(),
  accounts: mockAccounts,
  onSuccess: vi.fn(),
};

describe("ManualTransactionDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  it("renders all form fields", () => {
    render(<ManualTransactionDialog {...defaultProps} />);

    // Dialog title (appears in both DialogTitle and sr-only DialogDescription)
    const titleElements = screen.getAllByText("transactions.manual.title");
    expect(titleElements.length).toBeGreaterThanOrEqual(1);

    // Form labels
    expect(
      screen.getByText("transactions.manual.amount")
    ).toBeInTheDocument();
    // Description label and placeholder both render
    const descriptionElements = screen.getAllByText(
      "transactions.manual.description"
    );
    expect(descriptionElements.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("transactions.manual.date")).toBeInTheDocument();
    // Category label and placeholder both render
    const categoryElements = screen.getAllByText(
      "transactions.manual.category"
    );
    expect(categoryElements.length).toBeGreaterThanOrEqual(1);
    expect(
      screen.getByText("transactions.manual.account")
    ).toBeInTheDocument();

    // Submit button
    expect(
      screen.getByRole("button", { name: "transactions.manual.submit" })
    ).toBeInTheDocument();
  });

  it("shows account options including Cash", async () => {
    const user = userEvent.setup();
    render(<ManualTransactionDialog {...defaultProps} />);

    // Open the account select by clicking the trigger
    const selectTrigger = screen.getByRole("combobox");
    await user.click(selectTrigger);

    // Radix Select renders options with role="option" in a listbox
    await waitFor(() => {
      const options = screen.getAllByRole("option");
      const optionTexts = options.map((o) => o.textContent);
      expect(optionTexts).toContain("transactions.manual.cashAccount");
      expect(optionTexts).toContain("Checking (1234)");
      expect(optionTexts).toContain("Savings (5678)");
    });
  });

  it("submit button is disabled when form is invalid (no amount/description)", () => {
    render(<ManualTransactionDialog {...defaultProps} />);

    const submitButton = screen.getByRole("button", {
      name: "transactions.manual.submit",
    });
    // Form starts with no amount and no description, so isValid is false
    expect(submitButton).toBeDisabled();
  });

  it("submits valid form data to API", async () => {
    const user = userEvent.setup();
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({ transaction: { id: "txn-1" } }),
    });
    global.fetch = mockFetch;

    render(<ManualTransactionDialog {...defaultProps} />);

    // Fill in amount
    const amountInput = screen.getByPlaceholderText("0.00");
    await user.type(amountInput, "25.50");

    // Fill in description
    const descInputs = screen.getAllByPlaceholderText(
      "transactions.manual.description"
    );
    await user.type(descInputs[0], "Coffee");

    // Wait for form to become valid and submit
    const submitButton = screen.getByRole("button", {
      name: "transactions.manual.submit",
    });
    await waitFor(() => {
      expect(submitButton).not.toBeDisabled();
    });

    await user.click(submitButton);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/money/transactions",
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
        })
      );
    });
  });

  it("has no accessibility violations", async () => {
    const { container } = render(
      <ManualTransactionDialog {...defaultProps} />
    );

    expect(await axe(container)).toHaveNoViolations();
  });
});
