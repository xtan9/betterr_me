import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Papa from "papaparse";
import { toast } from "sonner";
import { CsvImportDialog } from "@/components/money/csv-import/csv-import-dialog";

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

// Mock SWR config
vi.mock("swr", () => ({
  default: vi.fn(),
  useSWRConfig: () => ({
    mutate: vi.fn(),
  }),
}));

// Mock useAccounts hook
vi.mock("@/lib/hooks/use-accounts", () => ({
  useAccounts: () => ({
    connections: [
      {
        id: "conn-1",
        accounts: [
          { id: "acct-1", name: "Checking", mask: "1234" },
          { id: "acct-2", name: "Savings", mask: "5678" },
        ],
        sync_status: "synced",
      },
    ],
    netWorthCents: 0,
    error: null,
    isLoading: false,
    mutate: vi.fn(),
  }),
}));

// Mock PapaParse
vi.mock("papaparse", () => ({
  default: {
    parse: vi.fn((_file: unknown, options: { complete: (results: { meta: { fields: string[] }; data: Record<string, string>[] }) => void }) => {
      options.complete({
        meta: { fields: ["Date", "Amount", "Description", "Merchant"] },
        data: [
          { Date: "2026-01-15", Amount: "-15.50", Description: "Coffee", Merchant: "Starbucks" },
          { Date: "2026-01-16", Amount: "-25.00", Description: "Lunch", Merchant: "Subway" },
        ],
      });
    }),
  },
}));

describe("CsvImportDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  it("renders import trigger button", () => {
    render(<CsvImportDialog />);

    const button = screen.getByRole("button", { name: /title/i });
    expect(button).toBeInTheDocument();
  });

  it("opens dialog on click and shows file upload area", async () => {
    const user = userEvent.setup();
    render(<CsvImportDialog />);

    const trigger = screen.getByRole("button", { name: /title/i });
    await user.click(trigger);

    await waitFor(() => {
      expect(screen.getByText("selectFile")).toBeInTheDocument();
      expect(screen.getByText("dragDrop")).toBeInTheDocument();
    });
  });

  it("shows account selector with accounts and cash option", async () => {
    const user = userEvent.setup();
    render(<CsvImportDialog />);

    await user.click(screen.getByRole("button", { name: /title/i }));

    await waitFor(() => {
      expect(screen.getByText("selectAccount")).toBeInTheDocument();
      // The Cash option is in the select (default value)
      expect(screen.getByText("Cash")).toBeInTheDocument();
    });
  });

  it("shows flip sign checkbox", async () => {
    const user = userEvent.setup();
    render(<CsvImportDialog />);

    await user.click(screen.getByRole("button", { name: /title/i }));

    await waitFor(() => {
      expect(screen.getByText("flipSign")).toBeInTheDocument();
      expect(screen.getByText("flipSignHelp")).toBeInTheDocument();
    });
  });

  it("shows step 1 title when dialog opens", async () => {
    const user = userEvent.setup();
    render(<CsvImportDialog />);

    await user.click(screen.getByRole("button", { name: /title/i }));

    await waitFor(() => {
      expect(screen.getByText("step1Title")).toBeInTheDocument();
    });
  });

  // --- Helpers ---
  const makeCsvFile = (name = "data.csv") =>
    new File(["Date,Amount,Description,Merchant\n2026-01-15,-15.50,Coffee,Starbucks"], name, {
      type: "text/csv",
    });

  const openDialog = async () => {
    const user = userEvent.setup();
    render(<CsvImportDialog />);
    await user.click(screen.getByRole("button", { name: /title/i }));
    await waitFor(() => {
      expect(screen.getByText("step1Title")).toBeInTheDocument();
    });
    return user;
  };

  const uploadValidCsv = async () => {
    const user = await openDialog();
    const input = document.getElementById("csv-file-input") as HTMLInputElement;
    expect(input).toBeTruthy();
    await user.upload(input, makeCsvFile());
    await waitFor(() => {
      expect(screen.getByText("step2Title")).toBeInTheDocument();
    });
    return user;
  };

  it("advances to step 2 (mapping) after successful file parse", async () => {
    await uploadValidCsv();
    // Mapping step renders target field labels (transaction_date, amount, description, merchant_name, category)
    expect(screen.getAllByText("transaction_date").length).toBeGreaterThan(0);
    expect(screen.getAllByText("amount").length).toBeGreaterThan(0);
    expect(screen.getAllByText("description").length).toBeGreaterThan(0);
    // Back/Next buttons present
    expect(screen.getByRole("button", { name: "back" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "next" })).toBeInTheDocument();
  });

  it("shows parse error when CSV has no rows", async () => {
    const parseMock = vi.mocked(Papa.parse);
    parseMock.mockImplementationOnce((_file: unknown, options: unknown) => {
      (options as { complete: (r: unknown) => void }).complete({
        meta: { fields: [] },
        data: [],
      });
    });
    const user = await openDialog();
    const input = document.getElementById("csv-file-input") as HTMLInputElement;
    await user.upload(input, makeCsvFile("empty.csv"));
    await waitFor(() => {
      expect(screen.getByText("noRows")).toBeInTheDocument();
    });
    // Still on step 1
    expect(screen.getByText("step1Title")).toBeInTheDocument();
  });

  it("shows parse error when too many rows", async () => {
    const parseMock = vi.mocked(Papa.parse);
    parseMock.mockImplementationOnce((_file: unknown, options: unknown) => {
      const bigRows = Array.from({ length: 5001 }, (_, i) => ({
        Date: "2026-01-15",
        Amount: "-1.00",
        Description: `row-${i}`,
      }));
      (options as { complete: (r: unknown) => void }).complete({
        meta: { fields: ["Date", "Amount", "Description"] },
        data: bigRows,
      });
    });
    const user = await openDialog();
    const input = document.getElementById("csv-file-input") as HTMLInputElement;
    await user.upload(input, makeCsvFile("big.csv"));
    await waitFor(() => {
      expect(screen.getByText("tooManyRows")).toBeInTheDocument();
    });
    expect(screen.getByText("step1Title")).toBeInTheDocument();
  });

  it("shows parse error when Papa.parse invokes error callback", async () => {
    const parseMock = vi.mocked(Papa.parse);
    parseMock.mockImplementationOnce((_file: unknown, options: unknown) => {
      (options as { error: () => void }).error();
    });
    const user = await openDialog();
    const input = document.getElementById("csv-file-input") as HTMLInputElement;
    await user.upload(input, makeCsvFile("bad.csv"));
    await waitFor(() => {
      expect(screen.getByText("parseError")).toBeInTheDocument();
    });
  });

  it("handles drag-and-drop file selection", async () => {
    await openDialog();
    const dropZone = screen.getByText("selectFile").closest("div");
    expect(dropZone).toBeTruthy();
    const file = makeCsvFile("drop.csv");
    fireEvent.drop(dropZone!, {
      dataTransfer: { files: [file] },
    });
    await waitFor(() => {
      expect(screen.getByText("step2Title")).toBeInTheDocument();
    });
  });

  it("dragOver event is prevented (no crash, stays on step 1)", async () => {
    await openDialog();
    const dropZone = screen.getByText("selectFile").closest("div")!;
    fireEvent.dragOver(dropZone);
    expect(screen.getByText("step1Title")).toBeInTheDocument();
  });

  it("drop with no files does nothing", async () => {
    await openDialog();
    const dropZone = screen.getByText("selectFile").closest("div")!;
    fireEvent.drop(dropZone, { dataTransfer: { files: [] } });
    // Still on step 1
    expect(screen.getByText("step1Title")).toBeInTheDocument();
  });

  it("file input change with no files is a no-op", async () => {
    await openDialog();
    const input = document.getElementById("csv-file-input") as HTMLInputElement;
    fireEvent.change(input, { target: { files: [] } });
    expect(screen.getByText("step1Title")).toBeInTheDocument();
  });

  it("back button on mapping step returns to step 1", async () => {
    const user = await uploadValidCsv();
    await user.click(screen.getByRole("button", { name: "back" }));
    await waitFor(() => {
      expect(screen.getByText("step1Title")).toBeInTheDocument();
    });
  });

  it("next button advances from mapping to preview (step 3)", async () => {
    const user = await uploadValidCsv();
    await user.click(screen.getByRole("button", { name: "next" }));
    await waitFor(() => {
      expect(screen.getByText("step3Title")).toBeInTheDocument();
    });
    // Preview step has import button
    expect(screen.getByRole("button", { name: "import" })).toBeInTheDocument();
  });

  it("back button on preview step returns to mapping (step 2)", async () => {
    const user = await uploadValidCsv();
    await user.click(screen.getByRole("button", { name: "next" }));
    await waitFor(() => {
      expect(screen.getByText("step3Title")).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: "back" }));
    await waitFor(() => {
      expect(screen.getByText("step2Title")).toBeInTheDocument();
    });
  });

  it("happy-path: upload -> map -> preview -> import success", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ imported: 2, duplicates_skipped: 0, errors: [] }),
    });
    const user = await uploadValidCsv();
    await user.click(screen.getByRole("button", { name: "next" }));
    await waitFor(() => {
      expect(screen.getByText("step3Title")).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: "import" }));
    // Step 4
    await waitFor(() => {
      expect(screen.getByText("step4Title")).toBeInTheDocument();
    });
    // After resolve, shows success
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalled();
    });
    // fetch called with correct payload
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/money/transactions/import",
      expect.objectContaining({ method: "POST" })
    );
    const call = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(call[1].body);
    expect(body.account_id).toBe("cash");
    expect(body.skip_duplicates).toBe(true);
    expect(Array.isArray(body.rows)).toBe(true);
    expect(body.rows.length).toBe(2);
  });

  it("shows duplicates_skipped message in result step", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ imported: 1, duplicates_skipped: 3, errors: [] }),
    });
    const user = await uploadValidCsv();
    await user.click(screen.getByRole("button", { name: "next" }));
    await user.click(await screen.findByRole("button", { name: "import" }));
    await waitFor(() => {
      expect(screen.getByText("duplicatesSkipped")).toBeInTheDocument();
    });
  });

  it("shows import error toast when API returns non-ok", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      json: async () => ({}),
    });
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const user = await uploadValidCsv();
    await user.click(screen.getByRole("button", { name: "next" }));
    await user.click(await screen.findByRole("button", { name: "import" }));
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("importError");
    });
    // Still on step 4, shows error state with back button
    expect(screen.getByText("step4Title")).toBeInTheDocument();
    errSpy.mockRestore();
  });

  it("shows import error toast when fetch throws", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("network down")
    );
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const user = await uploadValidCsv();
    await user.click(screen.getByRole("button", { name: "next" }));
    await user.click(await screen.findByRole("button", { name: "import" }));
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("importError");
    });
    errSpy.mockRestore();
  });

  it("back button on result error state returns to preview", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      json: async () => ({}),
    });
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const user = await uploadValidCsv();
    await user.click(screen.getByRole("button", { name: "next" }));
    await user.click(await screen.findByRole("button", { name: "import" }));
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalled();
    });
    // Error state back button exists
    const backBtn = screen.getByRole("button", { name: "back" });
    await user.click(backBtn);
    await waitFor(() => {
      expect(screen.getByText("step3Title")).toBeInTheDocument();
    });
    errSpy.mockRestore();
  });

  it("close button on result success step closes dialog and resets state", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ imported: 2, duplicates_skipped: 0, errors: [] }),
    });
    const user = await uploadValidCsv();
    await user.click(screen.getByRole("button", { name: "next" }));
    await user.click(await screen.findByRole("button", { name: "import" }));
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalled();
    });
    // Click the "back" (Close) button in result success view
    const closeBtn = screen.getByRole("button", { name: "back" });
    await user.click(closeBtn);
    // Dialog closes — step title should disappear
    await waitFor(() => {
      expect(screen.queryByText("step4Title")).not.toBeInTheDocument();
    });
  });

  it("errors out when mapped rows are empty (no valid data)", async () => {
    // All rows have invalid amounts
    const parseMock = vi.mocked(Papa.parse);
    parseMock.mockImplementationOnce((_file: unknown, options: unknown) => {
      (options as { complete: (r: unknown) => void }).complete({
        meta: { fields: ["Date", "Amount", "Description"] },
        data: [
          { Date: "", Amount: "not-a-number", Description: "" },
        ],
      });
    });
    const user = await openDialog();
    const input = document.getElementById("csv-file-input") as HTMLInputElement;
    await user.upload(input, makeCsvFile());
    await waitFor(() => {
      expect(screen.getByText("step2Title")).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: "next" }));
    await waitFor(() => {
      expect(screen.getByText("step3Title")).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: "import" }));
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("noRows");
    });
    // fetch NOT called
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("resets state when dialog is reopened after close", async () => {
    const user = await uploadValidCsv();
    // We're on step 2
    expect(screen.getByText("step2Title")).toBeInTheDocument();
    // Close via Escape (Radix Dialog)
    await user.keyboard("{Escape}");
    await waitFor(() => {
      expect(screen.queryByText("step2Title")).not.toBeInTheDocument();
    });
    // Reopen
    await user.click(screen.getByRole("button", { name: /title/i }));
    await waitFor(() => {
      // Should be back at step 1, not step 2
      expect(screen.getByText("step1Title")).toBeInTheDocument();
    });
    expect(screen.queryByText("step2Title")).not.toBeInTheDocument();
  });

  it("flipSign checkbox inverts amounts sent to API", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ imported: 2, duplicates_skipped: 0, errors: [] }),
    });
    const user = await openDialog();
    // Toggle flip-sign
    const flipCheckbox = screen.getByRole("checkbox");
    await user.click(flipCheckbox);
    // Upload
    const input = document.getElementById("csv-file-input") as HTMLInputElement;
    await user.upload(input, makeCsvFile());
    await waitFor(() => {
      expect(screen.getByText("step2Title")).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: "next" }));
    await user.click(await screen.findByRole("button", { name: "import" }));
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalled();
    });
    const body = JSON.parse(
      (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body
    );
    // Original amounts were -15.50 and -25.00; flipped they become positive
    expect(body.rows[0].amount).toBe(15.5);
    expect(body.rows[1].amount).toBe(25);
  });

  it("file name is displayed after selection on step 1 (if user re-enters)", async () => {
    const user = await openDialog();
    // Reach step 2 then go back so file is retained
    const input = document.getElementById("csv-file-input") as HTMLInputElement;
    await user.upload(input, makeCsvFile("my-bank.csv"));
    await waitFor(() => {
      expect(screen.getByText("step2Title")).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: "back" }));
    await waitFor(() => {
      expect(screen.getByText("my-bank.csv")).toBeInTheDocument();
    });
  });

  it("selecting a non-cash account passes its id to the API", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ imported: 2, duplicates_skipped: 0, errors: [] }),
    });
    const user = await openDialog();
    // Open account select trigger
    const triggers = screen.getAllByRole("combobox");
    expect(triggers.length).toBeGreaterThan(0);
    await user.click(triggers[0]);
    const option = await screen.findByRole("option", { name: /Checking/ });
    await user.click(option);
    const input = document.getElementById("csv-file-input") as HTMLInputElement;
    await user.upload(input, makeCsvFile());
    await waitFor(() => {
      expect(screen.getByText("step2Title")).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: "next" }));
    await user.click(await screen.findByRole("button", { name: "import" }));
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalled();
    });
    const body = JSON.parse(
      (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body
    );
    expect(body.account_id).toBe("acct-1");
  });

  it("preview step shows importingTo text with mapped row count", async () => {
    const user = await uploadValidCsv();
    await user.click(screen.getByRole("button", { name: "next" }));
    await waitFor(() => {
      // Find an element containing the translation key
      const nodes = screen.getAllByText((_, el) =>
        !!el?.textContent?.includes("importingTo")
      );
      expect(nodes.length).toBeGreaterThan(0);
    });
  });

  it("mapping step disables Next button when required fields are unmapped", async () => {
    // Provide headers that auto-map won't recognize for required fields
    const parseMock = vi.mocked(Papa.parse);
    parseMock.mockImplementationOnce((_file: unknown, options: unknown) => {
      (options as { complete: (r: unknown) => void }).complete({
        meta: { fields: ["Foo", "Bar"] },
        data: [{ Foo: "a", Bar: "b" }],
      });
    });
    const user = await openDialog();
    const input = document.getElementById("csv-file-input") as HTMLInputElement;
    await user.upload(input, makeCsvFile());
    await waitFor(() => {
      expect(screen.getByText("step2Title")).toBeInTheDocument();
    });
    const nextBtn = screen.getByRole("button", { name: "next" });
    expect(nextBtn).toBeDisabled();
    expect(screen.getByText("requiredFields")).toBeInTheDocument();
  });

  // Silence unused "within" import warning by using it in one assertion
  it("mapping step preview table renders headers for mapped target fields", async () => {
    await uploadValidCsv();
    // Auto-mapped fields (date, amount, description, merchant_name) should appear in the preview table header row
    const tables = document.querySelectorAll("table");
    expect(tables.length).toBeGreaterThan(0);
    const header = tables[0].querySelector("thead");
    expect(header).toBeTruthy();
    const headerCells = within(header as HTMLElement).getAllByRole("columnheader");
    expect(headerCells.length).toBeGreaterThan(0);
  });
});
