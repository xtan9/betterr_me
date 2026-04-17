import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "vitest-axe";
import * as matchers from "vitest-axe/matchers";
import { toast } from "sonner";
import { BudgetForm } from "@/components/money/budget-form";
import type { BudgetWithCategories } from "@/lib/db/types";

expect.extend(matchers);

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

const { mockUseCategories } = vi.hoisted(() => ({
  mockUseCategories: vi.fn(),
}));

vi.mock("@/lib/hooks/use-money-categories", () => ({
  useMoneyCategories: () => mockUseCategories(),
}));

function makeCategory(over: Partial<{ id: string; name: string; display_name: string | null; icon: string | null }> = {}) {
  return {
    id: over.id ?? "cat-1",
    name: over.name ?? "groceries",
    display_name: over.display_name ?? "Groceries",
    icon: over.icon ?? "🛒",
    color: "#6b9080",
    type: "expense" as const,
    user_id: "user-1",
    is_system: false,
    created_at: "2026-02-01T00:00:00Z",
    updated_at: "2026-02-01T00:00:00Z",
  };
}

function makeBudget(): BudgetWithCategories {
  return {
    id: "budget-1",
    household_id: "hh-1",
    month: "2026-02-01",
    total_cents: 200000,
    total_spent_cents: 50000,
    rollover_enabled: true,
    categories: [
      {
        id: "bc-1",
        budget_id: "budget-1",
        category_id: "cat-1",
        category_name: "Groceries",
        category_icon: "🛒",
        category_color: "#6b9080",
        allocated_cents: 50000,
        spent_cents: 20000,
        rollover_cents: 0,
      },
    ],
    created_at: "2026-02-01T00:00:00Z",
    updated_at: "2026-02-01T00:00:00Z",
  } as unknown as BudgetWithCategories;
}

describe("BudgetForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseCategories.mockReturnValue({
      categories: [
        makeCategory({ id: "cat-1", name: "groceries", display_name: "Groceries", icon: "🛒" }),
        makeCategory({ id: "cat-2", name: "dining", display_name: "Dining", icon: null }),
        makeCategory({ id: "cat-3", name: "transport", display_name: null }),
      ],
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders create mode title and empty first category row", () => {
    render(
      <BudgetForm
        mode="create"
        month="2026-02"
        onSuccess={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    // Title + submit button both read createBudget in create mode
    expect(screen.getAllByText("createBudget").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByLabelText("totalBudget")).toBeInTheDocument();
    const submitButtons = screen.getAllByRole("button", { name: "createBudget" });
    expect(submitButtons.length).toBeGreaterThan(0);
  });

  it("renders edit mode with existing budget values", () => {
    render(
      <BudgetForm
        mode="edit"
        month="2026-02"
        budget={makeBudget()}
        onSuccess={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    expect(screen.getAllByText("editBudget").length).toBeGreaterThanOrEqual(2);
    const totalInput = screen.getByLabelText("totalBudget") as HTMLInputElement;
    expect(totalInput.value).toBe("2000.00");
  });

  it("shows validation error when total is missing on submit", async () => {
    render(
      <BudgetForm
        mode="create"
        month="2026-02"
        onSuccess={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    const submit = screen.getAllByRole("button", { name: "createBudget" }).pop()!;
    fireEvent.click(submit);

    expect(await screen.findByText("Required")).toBeInTheDocument();
  });

  it("rejects total when not a positive number", async () => {
    render(
      <BudgetForm
        mode="create"
        month="2026-02"
        onSuccess={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    fireEvent.change(screen.getByLabelText("totalBudget"), { target: { value: "0" } });
    const submit = screen.getAllByRole("button", { name: "createBudget" }).pop()!;
    fireEvent.click(submit);

    expect(await screen.findByText("Must be positive")).toBeInTheDocument();
  });

  it("adds and removes category rows", async () => {
    render(
      <BudgetForm
        mode="create"
        month="2026-02"
        onSuccess={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    // Start with one row — no remove button visible (fields.length === 1)
    expect(screen.queryByLabelText("removeCategory")).not.toBeInTheDocument();

    // Add a row
    fireEvent.click(screen.getByRole("button", { name: /addCategory/ }));
    await waitFor(() => {
      expect(screen.getAllByLabelText("removeCategory").length).toBe(2);
    });

    // Remove the first row
    fireEvent.click(screen.getAllByLabelText("removeCategory")[0]);
    await waitFor(() => {
      expect(screen.queryByLabelText("removeCategory")).not.toBeInTheDocument();
    });
  });

  it("shows unallocated amount and destructive styling when over-allocated", () => {
    const { container } = render(
      <BudgetForm
        mode="create"
        month="2026-02"
        onSuccess={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    fireEvent.change(screen.getByLabelText("totalBudget"), { target: { value: "100" } });
    const amountInputs = container.querySelectorAll('input[type="number"]');
    // amountInputs[0] = total, [1] = first category amount
    fireEvent.change(amountInputs[1], { target: { value: "150" } });

    // Unallocated = -50 → text should contain -$50.00 and destructive class applied
    const unallocatedRow = screen.getByText("unallocated").parentElement!;
    expect(unallocatedRow.textContent).toMatch(/-\$50\.00/);
    const amountSpan = unallocatedRow.querySelector(".text-destructive");
    expect(amountSpan).not.toBeNull();
  });

  it("blocks submission and does not POST when category_id is missing (Zod validation)", async () => {
    const onSuccess = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: "new" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <BudgetForm
        mode="create"
        month="2026-02"
        onSuccess={onSuccess}
        onCancel={vi.fn()}
      />
    );

    fireEvent.change(screen.getByLabelText("totalBudget"), { target: { value: "500" } });

    const submit = screen.getAllByRole("button", { name: "createBudget" }).pop()!;
    fireEvent.click(submit);

    // With no category_id picked, the Zod guard (`category_id: z.string().min(1, ...)`)
    // blocks submission — fetch must never be called.
    await waitFor(() => {
      expect(fetchMock).not.toHaveBeenCalled();
    });
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it("POSTs to /api/money/budgets with correct body shape when a category is selected", async () => {
    const user = userEvent.setup();
    const onSuccess = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: "new" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <BudgetForm
        mode="create"
        month="2026-02"
        onSuccess={onSuccess}
        onCancel={vi.fn()}
      />
    );

    fireEvent.change(screen.getByLabelText("totalBudget"), { target: { value: "500" } });

    // Drive the Radix Select via keyboard — the SelectTrigger is reachable as
    // role="combobox". Click to open, then click the option by its display name.
    // Radix renders options twice in jsdom (one in the listbox and one in the
    // hidden native select shim), so grab the first.
    const combobox = screen.getByRole("combobox");
    await user.click(combobox);
    const options = await screen.findAllByRole("option", { name: /Groceries/i });
    await user.click(options[0]);

    // Set the category amount. Both the totalBudget and category amount inputs
    // share placeholder "0.00"; the category one is the second number input.
    const numberInputs = screen
      .getAllByPlaceholderText("0.00")
      .filter((el): el is HTMLInputElement => el instanceof HTMLInputElement);
    fireEvent.change(numberInputs[1], { target: { value: "100" } });

    const submit = screen.getAllByRole("button", { name: "createBudget" }).pop()!;
    fireEvent.click(submit);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });

    // Lock POST contract: endpoint, method, JSON body shape. Note that the
    // body uses dollar-denominated `total` and `amount` (parseFloat), not
    // cents — the API route converts when persisting.
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/money/budgets");
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body as string);
    expect(body).toEqual(
      expect.objectContaining({
        month: "2026-02-01",
        total: 500,
        rollover_enabled: expect.any(Boolean),
        categories: [
          expect.objectContaining({
            category_id: "cat-1",
            amount: 100,
          }),
        ],
      })
    );
    expect(onSuccess).toHaveBeenCalled();
  });

  it("edit mode: PUT to /api/money/budgets/:id with correct body", async () => {
    const onSuccess = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: "budget-1" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <BudgetForm
        mode="edit"
        month="2026-02"
        budget={makeBudget()}
        onSuccess={onSuccess}
        onCancel={vi.fn()}
      />
    );

    fireEvent.click(screen.getAllByRole("button", { name: "editBudget" }).pop()!);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/money/budgets/budget-1");
    expect(init.method).toBe("PUT");
    const body = JSON.parse(init.body);
    expect(body.month).toBe("2026-02-01");
    expect(body.total).toBe(2000);
    expect(body.rollover_enabled).toBe(true);
    expect(body.categories).toEqual([
      { category_id: "cat-1", amount: 500 },
    ]);
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith("updated");
    });
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  it("edit mode: error response triggers toast.error without calling onSuccess", async () => {
    const onSuccess = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ error: "Conflict" }),
      })
    );

    render(
      <BudgetForm
        mode="edit"
        month="2026-02"
        budget={makeBudget()}
        onSuccess={onSuccess}
        onCancel={vi.fn()}
      />
    );

    fireEvent.click(screen.getAllByRole("button", { name: "editBudget" }).pop()!);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Conflict");
    });
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it("edit mode: fetch rejection shows generic error toast", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("net down")));

    render(
      <BudgetForm
        mode="edit"
        month="2026-02"
        budget={makeBudget()}
        onSuccess={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    fireEvent.click(screen.getAllByRole("button", { name: "editBudget" }).pop()!);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("net down");
    });
  });

  it("cancel button calls onCancel", () => {
    const onCancel = vi.fn();
    render(
      <BudgetForm
        mode="create"
        month="2026-02"
        onSuccess={vi.fn()}
        onCancel={onCancel}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("has no accessibility violations in create mode", async () => {
    const { container } = render(
      <BudgetForm
        mode="create"
        month="2026-02"
        onSuccess={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    expect(
      await axe(container, { rules: { "button-name": { enabled: false } } })
    ).toHaveNoViolations();
  });
});
