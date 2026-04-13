import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "vitest-axe";
import * as matchers from "vitest-axe/matchers";
import { CsvPreviewStep } from "@/components/money/csv-import/csv-preview-step";

expect.extend(matchers);

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) => {
    if (params) return `${key}:${JSON.stringify(params)}`;
    return key;
  },
}));

interface MappedRow {
  transaction_date: string;
  amount: number;
  description: string;
  merchant_name: string | null;
  category: string | null;
}

const makeRow = (i: number, overrides: Partial<MappedRow> = {}): MappedRow => ({
  transaction_date: `2026-01-${String(i + 1).padStart(2, "0")}`,
  amount: -1 * (i + 1),
  description: `Description ${i + 1}`,
  merchant_name: `Merchant ${i + 1}`,
  category: `Category ${i + 1}`,
  ...overrides,
});

describe("CsvPreviewStep", () => {
  const baseProps = {
    accountName: "Checking",
    onBack: vi.fn(),
    onImport: vi.fn(),
  };

  it("renders importingTo message with account and count", () => {
    const rows = [makeRow(0), makeRow(1)];
    render(<CsvPreviewStep {...baseProps} mappedRows={rows} />);

    expect(
      screen.getByText(/importingTo:.*"count":2.*"account":"Checking"/),
    ).toBeInTheDocument();
  });

  it("renders preview table with rows and headers", () => {
    const rows = [makeRow(0), makeRow(1), makeRow(2)];
    render(<CsvPreviewStep {...baseProps} mappedRows={rows} />);

    const table = screen.getByRole("table");
    expect(table).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Date" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Amount" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Description" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Merchant" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Category" })).toBeInTheDocument();

    // 1 header row + 3 data rows
    expect(screen.getAllByRole("row")).toHaveLength(4);
    expect(screen.getByText("Description 1")).toBeInTheDocument();
    expect(screen.getByText("Merchant 2")).toBeInTheDocument();
    expect(screen.getByText("Category 3")).toBeInTheDocument();
    expect(screen.getByText("-1.00")).toBeInTheDocument();
  });

  it("formats amount via toFixed(2) and renders blank for NaN amounts", () => {
    const rows = [
      makeRow(0, { amount: 12.5 }),
      makeRow(1, { amount: NaN }),
    ];
    render(<CsvPreviewStep {...baseProps} mappedRows={rows} />);

    expect(screen.getByText("12.50")).toBeInTheDocument();
    // NaN row: amount cell should be empty
    const rowsRendered = screen.getAllByRole("row");
    // data row 2 (index 2) = the NaN row
    const nanRow = rowsRendered[2];
    const amountCell = nanRow.querySelectorAll("td")[1];
    expect(amountCell?.textContent).toBe("");
  });

  it("renders empty strings for null merchant_name and category", () => {
    const rows = [makeRow(0, { merchant_name: null, category: null })];
    render(<CsvPreviewStep {...baseProps} mappedRows={rows} />);

    const dataRow = screen.getAllByRole("row")[1];
    const tds = dataRow.querySelectorAll("td");
    expect(tds[3].textContent).toBe("");
    expect(tds[4].textContent).toBe("");
  });

  it("does not show previewNote when rows <= 20", () => {
    const rows = Array.from({ length: 20 }, (_, i) => makeRow(i));
    render(<CsvPreviewStep {...baseProps} mappedRows={rows} />);

    expect(screen.queryByText(/previewNote/)).not.toBeInTheDocument();
  });

  it("shows previewNote when rows > 20 and caps table at 20 rows", () => {
    const rows = Array.from({ length: 25 }, (_, i) => makeRow(i));
    render(<CsvPreviewStep {...baseProps} mappedRows={rows} />);

    expect(
      screen.getByText(/previewNote:.*"count":20.*"total":25/),
    ).toBeInTheDocument();
    // 1 header + 20 data rows
    expect(screen.getAllByRole("row")).toHaveLength(21);
  });

  it("handles empty mappedRows (0 transactions)", () => {
    render(<CsvPreviewStep {...baseProps} mappedRows={[]} />);

    expect(
      screen.getByText(/importingTo:.*"count":0/),
    ).toBeInTheDocument();
    // only header row
    expect(screen.getAllByRole("row")).toHaveLength(1);
    expect(screen.queryByText(/previewNote/)).not.toBeInTheDocument();
  });

  it("fires onBack and onImport callbacks when buttons clicked", async () => {
    const user = userEvent.setup();
    const onBack = vi.fn();
    const onImport = vi.fn();
    render(
      <CsvPreviewStep
        {...baseProps}
        onBack={onBack}
        onImport={onImport}
        mappedRows={[makeRow(0)]}
      />,
    );

    await user.click(screen.getByRole("button", { name: "back" }));
    expect(onBack).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "import" }));
    expect(onImport).toHaveBeenCalledTimes(1);
  });

  it("has no accessibility violations", async () => {
    const rows = [makeRow(0), makeRow(1)];
    const { container } = render(
      <CsvPreviewStep {...baseProps} mappedRows={rows} />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
