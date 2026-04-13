import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "vitest-axe";
import * as matchers from "vitest-axe/matchers";
import { CsvMappingStep } from "@/components/money/csv-import/csv-mapping-step";
import type { ColumnMapping } from "@/components/money/csv-import/types";

expect.extend(matchers);

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

const headers = ["Date", "Amount", "Description", "Merchant", "Category"];
const rows: Record<string, string>[] = [
  { Date: "2026-01-15", Amount: "-15.50", Description: "Coffee", Merchant: "Starbucks", Category: "Food" },
  { Date: "2026-01-16", Amount: "-25.00", Description: "Lunch", Merchant: "Subway", Category: "Food" },
  { Date: "2026-01-17", Amount: "-8.00", Description: "Snack", Merchant: "7-Eleven", Category: "Food" },
  { Date: "2026-01-18", Amount: "-9.00", Description: "Excluded", Merchant: "Other", Category: "Food" },
];

const fullMapping: ColumnMapping = {
  transaction_date: "Date",
  amount: "Amount",
  description: "Description",
  merchant_name: "Merchant",
  category: "Category",
};

function renderStep(overrides: Partial<React.ComponentProps<typeof CsvMappingStep>> = {}) {
  const props: React.ComponentProps<typeof CsvMappingStep> = {
    parsedHeaders: headers,
    parsedRows: rows,
    columnMapping: fullMapping,
    updateMapping: vi.fn(),
    canProceedToPreview: true,
    onBack: vi.fn(),
    onNext: vi.fn(),
    ...overrides,
  };
  return { props, ...render(<CsvMappingStep {...props} />) };
}

describe("CsvMappingStep", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders a labeled row for each target field", () => {
    renderStep();
    // Each field name appears as a Label (and again as a preview column header)
    for (const field of [
      "transaction_date",
      "amount",
      "description",
      "merchant_name",
      "category",
    ]) {
      expect(screen.getAllByText(field).length).toBeGreaterThanOrEqual(1);
    }
  });

  it("renders back and next buttons", () => {
    renderStep();
    expect(screen.getByRole("button", { name: "back" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "next" })).toBeInTheDocument();
  });

  it("renders a Select combobox per target field (5 total)", () => {
    renderStep();
    const combos = screen.getAllByRole("combobox");
    expect(combos).toHaveLength(5);
  });

  it("disables the next button when canProceedToPreview is falsy and shows required-fields hint", () => {
    renderStep({ canProceedToPreview: false });
    expect(screen.getByRole("button", { name: "next" })).toBeDisabled();
    expect(screen.getByText("requiredFields")).toBeInTheDocument();
  });

  it("enables next button when canProceedToPreview is truthy and hides the hint", () => {
    renderStep({ canProceedToPreview: true });
    expect(screen.getByRole("button", { name: "next" })).toBeEnabled();
    expect(screen.queryByText("requiredFields")).not.toBeInTheDocument();
  });

  it("calls onBack and onNext when respective buttons are clicked", async () => {
    const onBack = vi.fn();
    const onNext = vi.fn();
    renderStep({ onBack, onNext });

    await userEvent.click(screen.getByRole("button", { name: "back" }));
    expect(onBack).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByRole("button", { name: "next" }));
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it("calls updateMapping with the target field and chosen header when a select option is picked", async () => {
    const updateMapping = vi.fn();
    renderStep({ updateMapping });

    const combos = screen.getAllByRole("combobox");
    // First combo corresponds to transaction_date
    await userEvent.click(combos[0]);

    const option = await screen.findByRole("option", { name: "Amount" });
    await userEvent.click(option);

    expect(updateMapping).toHaveBeenCalledWith("transaction_date", "Amount");
  });

  it("calls updateMapping with __skip__ when the Skip option is chosen", async () => {
    const updateMapping = vi.fn();
    renderStep({ updateMapping });

    const combos = screen.getAllByRole("combobox");
    await userEvent.click(combos[4]); // category

    const skipOption = await screen.findByRole("option", { name: "skip" });
    await userEvent.click(skipOption);

    expect(updateMapping).toHaveBeenCalledWith("category", "__skip__");
  });

  it("renders preview table with first 3 rows only when parsedRows present", () => {
    renderStep();
    const table = screen.getByRole("table");
    expect(table).toBeInTheDocument();

    // Header row + 3 data rows = 4 rows
    const allRows = within(table).getAllByRole("row");
    expect(allRows).toHaveLength(4);

    // Spot-check preview cells
    expect(within(table).getByText("Coffee")).toBeInTheDocument();
    expect(within(table).getByText("Lunch")).toBeInTheDocument();
    expect(within(table).getByText("Snack")).toBeInTheDocument();
    // 4th row should be sliced off
    expect(within(table).queryByText("Excluded")).not.toBeInTheDocument();
  });

  it("does not render the preview table when parsedRows is empty", () => {
    renderStep({ parsedRows: [] });
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("only shows preview columns for mapped target fields", () => {
    const partial: ColumnMapping = {
      transaction_date: "Date",
      amount: "Amount",
      description: null,
      merchant_name: null,
      category: null,
    };
    renderStep({ columnMapping: partial, canProceedToPreview: false });

    const table = screen.getByRole("table");
    const headerCells = within(table).getAllByRole("columnheader");
    expect(headerCells).toHaveLength(2);
    expect(headerCells[0]).toHaveTextContent("transaction_date");
    expect(headerCells[1]).toHaveTextContent("amount");
  });

  it("has no accessibility violations", async () => {
    const { container } = renderStep();
    // button-name is disabled because shadcn's SelectTrigger exposes an
    // empty accessible name until opened (Radix known behavior).
    expect(
      await axe(container, { rules: { "button-name": { enabled: false } } })
    ).toHaveNoViolations();
  });
});
